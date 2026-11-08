import {createReadStream,createWriteStream,promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import yauzl from 'yauzl';
import {transferWatchdog} from './local-network.mjs';
export const localFailure=(message,status=422)=>Object.assign(new Error(message),{status,publicMessage:true});
export async function fileHash(filename){const hash=createHash('sha256');for await(const part of createReadStream(filename))hash.update(part);return hash.digest('hex');}
export async function ordinaryDirectory(directory){
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw localFailure('Local model storage is not an ordinary app-owned directory.');
}
function archiveName(name){
 if(typeof name!=='string'||name.includes('\\')||name.includes('\0')||name.includes(':')||name.startsWith('/')||name.split('/').some(p=>p==='..'))throw localFailure('The runtime archive contains an unsafe path.');
 const clean=name.replace(/^\.\//,'').replace(/\/$/,'');
 if(!clean||clean==='.'||clean.split('/').some(p=>!p||p==='.')||/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(path.basename(clean)))throw localFailure('The runtime archive contains an unsupported path.');return clean;
}
async function writeEntry(directory,name,stream,size,files,signal){
 const clean=archiveName(name),target=path.join(directory,clean);if(files.some(file=>file.path.toLowerCase()===clean.toLowerCase()))throw localFailure('The runtime archive contains duplicate files.');
 await ordinaryDirectory(path.dirname(target));let actual=0;const hash=createHash('sha256');
 async function* checked(){for await(const part of stream){signal?.throwIfAborted();actual+=part.length;if(actual>size)throw localFailure('The runtime archive has an invalid size.');hash.update(part);yield part;}if(actual!==size)throw localFailure('The runtime archive was truncated.');}
 await pipeline(checked(),createWriteStream(target,{flags:'wx',mode:0o700}),{signal});files.push({path:clean,bytes:size,sha256:hash.digest('hex')});
}
/** Streaming extraction avoids loading multi-GB Windows archives into memory.
 * Archive links are materialized only from verified in-archive regular files;
 * no filesystem links, devices, scripts or archive permissions are trusted. */
export async function extractLocalRuntime(archive,directory,artifact,{signal}={}){
 const files=[],links=[];let expanded=0,entries=0;
 const bounded=size=>{if(!Number.isSafeInteger(size)||size<0||(expanded+=size)>artifact.expandedBytes||++entries>20000)throw localFailure('The runtime archive exceeds its extraction limits.');};
 if(artifact.format==='zip'){
  const zip=await new Promise((resolve,reject)=>yauzl.open(archive,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,value)=>error?reject(error):resolve(value)));
  try{await new Promise((resolve,reject)=>{const fail=error=>{zip.close();reject(error);};zip.on('error',fail);zip.on('end',resolve);zip.on('entry',entry=>{(async()=>{
   signal?.throwIfAborted();bounded(entry.uncompressedSize);const mode=(entry.externalFileAttributes>>>16)&0xf000;
   if(entry.generalPurposeBitFlag&1||![0,0x8000,0x4000].includes(mode))throw localFailure('The runtime archive contains a link or encrypted entry.');
   const name=archiveName(entry.fileName);if(entry.fileName.endsWith('/'))await ordinaryDirectory(path.join(directory,name));else{const stream=await new Promise((yes,no)=>zip.openReadStream(entry,(e,s)=>e?no(e):yes(s)));await writeEntry(directory,name,stream,entry.uncompressedSize,files,signal);}zip.readEntry();
  })().catch(fail);});zip.readEntry();});}finally{zip.close();}
 }else if(artifact.format==='tgz'){
  const source=createReadStream(archive),gunzip=createGunzip();source.pipe(gunzip);let buffer=Buffer.alloc(0);const iterator=gunzip[Symbol.asyncIterator]();
  const take=async count=>{while(buffer.length<count){const next=await iterator.next();if(next.done)throw localFailure('The runtime archive was truncated.');buffer=Buffer.concat([buffer,next.value]);}const result=buffer.subarray(0,count);buffer=buffer.subarray(count);return result;};
  try{while(true){signal?.throwIfAborted();const h=await take(512);if(h.every(x=>x===0))break;const string=(a,b)=>h.subarray(a,b).toString('utf8').replace(/\0.*$/s,'');let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:h[i];const raw=string(124,136).trim(),type=string(156,157)||'0';if(!/^[0-7]+$/.test(raw)||checksum!==parseInt(string(148,156).trim(),8))throw localFailure('The runtime archive header is damaged.');const size=parseInt(raw,8);bounded(size);const name=[string(345,500),string(0,100)].filter(Boolean).join('/');
   if(type==='x'||type==='g'){
    if(size>65536)throw localFailure('Runtime archive metadata exceeds its bound.');const metadata=await take(size);
    // Official macOS archives carry timestamps/xattrs. Paths and link targets
    // remain the validated fixed headers, never PAX overrides.
    for(let cursor=0;cursor<metadata.length;){const space=metadata.indexOf(32,cursor),length=Number(metadata.subarray(cursor,space).toString('ascii'));if(space<cursor||!Number.isSafeInteger(length)||length<=space-cursor+1||cursor+length>metadata.length)throw localFailure('Invalid runtime archive metadata.');const equal=metadata.indexOf(61,space+1),key=metadata.subarray(space+1,equal).toString('ascii');if(equal<space||equal>=cursor+length||!/^(?:mtime|atime|ctime|LIBARCHIVE\.xattr\.[^=]+|SCHILY\.xattr\.[^=]+)$/.test(key))throw localFailure('Unsupported runtime archive metadata.');cursor+=length;}
    if(size%512)await take(512-size%512);continue;
   }
   if(!['0','5','2'].includes(type))throw localFailure('The runtime archive contains an unsupported link or extended entry.');
   if(type==='2'){if(size!==0)throw localFailure('Invalid archive link.');const clean=archiveName(name),relative=archiveName(string(157,257)),target=archiveName(path.posix.join(path.posix.dirname(clean),relative));links.push({path:clean,target});}
   else if(type==='5'){if(size!==0)throw localFailure('Invalid archive directory.');await ordinaryDirectory(path.join(directory,archiveName(name)));}
   else{async function* content(){let left=size;while(left){const count=Math.min(left,64*1024);yield await take(count);left-=count;}}await writeEntry(directory,name,content(),size,files,signal);}
   if(size%512)await take(512-size%512);
  }}finally{source.destroy();gunzip.destroy();}
 }else throw localFailure('Unsupported runtime archive.');
 while(links.length){let progress=false;for(let i=links.length-1;i>=0;i--){const link=links[i],target=files.find(f=>f.path===link.target);if(!target)continue;bounded(target.bytes);await writeEntry(directory,link.path,createReadStream(path.join(directory,target.path)),target.bytes,files,signal);links.splice(i,1);progress=true;}if(!progress)throw localFailure('An archive link has no verified regular-file target.');}
 if(!files.some(file=>file.path===artifact.binary))throw localFailure('The verified archive lacks the expected runtime.');return files;
}
export async function downloadLocalRuntime(filename,artifact,{fetcher=fetch,signal:parentSignal,onProgress=()=>{},transferTimeouts}={}){
 const watchdog=transferWatchdog(parentSignal,transferTimeouts),signal=watchdog.signal;try{
 let url=new URL(artifact.url),response;
 for(let redirects=0;redirects<5;redirects++){
  if(url.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname)||url.username||url.password)throw localFailure('The runtime download left its official release hosts.');
  watchdog.headers();response=await fetcher(url.href,{redirect:'manual',signal});watchdog.touch();if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url);continue;}break;
 }
 if(!response?.ok||!response.body)throw localFailure('The pinned official runtime could not be downloaded. Retry when connected.');
 const declared=response.headers.get('content-length');if(declared&&Number(declared)!==artifact.bytes)throw localFailure('The runtime download size changed. Update Asterloom before installing.');
 let bytes=0,lastDiskCheck=0;const hash=createHash('sha256');async function* content(){for await(const part of response.body){signal?.throwIfAborted();if(part.length)watchdog.touch();if(Date.now()-lastDiskCheck>5000){lastDiskCheck=Date.now();const disk=await fs.statfs(path.dirname(filename));if(Number(disk.bavail)*Number(disk.bsize)<512*1024**2){const error=localFailure('Free disk space became too low during the download. Free some space and retry.');watchdog.abort(error);throw error;}}bytes+=part.length;if(bytes>artifact.bytes)throw localFailure('The runtime download exceeded its pinned size.');hash.update(part);onProgress(bytes,artifact.bytes);yield part;}}
 await pipeline(content(),createWriteStream(filename,{flags:'wx',mode:0o600}),{signal});if(bytes!==artifact.bytes||hash.digest('hex')!==artifact.sha256)throw localFailure('Runtime integrity verification failed. Nothing was installed.');
 }catch(error){if(signal.aborted)throw signal.reason;throw error;}finally{watchdog.close();}
}
export function createLocalInstaller({directory,artifact,fetcher=fetch}={}){
 const target=path.join(directory,artifact?.version??'unsupported');let verified=null;
 async function receipt(){try{const directoryStat=await fs.lstat(target);if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())return null;const saved=JSON.parse(await fs.readFile(path.join(target,'receipt.json'),'utf8'));if(saved.archiveSha256!==artifact?.sha256||!Array.isArray(saved.files)||!saved.files.length||!saved.files.some(file=>file.path===artifact.binary))return null;
  const stamps=[];for(const entry of saved.files){const name=archiveName(entry.path),stat=await fs.lstat(path.join(target,name));if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes)return null;stamps.push([name,stat.size,stat.mtimeMs,stat.ctimeMs]);}
  const stamp=JSON.stringify(stamps);if(verified!==stamp){for(const entry of saved.files)if(await fileHash(path.join(target,entry.path))!==entry.sha256)return null;verified=stamp;}return saved;
 }catch{return null;}}
 return{artifact,receipt,binary:async()=>{if(!await receipt())throw localFailure('Install the verified local runtime first.');return path.join(target,artifact.binary);},install:async({signal,onProgress}={})=>{
  if(!artifact)throw localFailure('Local runtime installation is available for macOS and Windows only.');if(await receipt())return;
  await ordinaryDirectory(directory);const stage=path.join(directory,'.install-'+randomUUID());await ordinaryDirectory(stage);const archive=path.join(stage,'download');
  try{await downloadLocalRuntime(archive,artifact,{fetcher,signal,onProgress});const extracted=path.join(stage,'runtime');await ordinaryDirectory(extracted);const files=await extractLocalRuntime(archive,extracted,artifact,{signal});signal?.throwIfAborted();await fs.writeFile(path.join(extracted,'receipt.json'),JSON.stringify({version:artifact.version,archiveSha256:artifact.sha256,files}),{mode:0o600});await fs.rm(target,{recursive:true,force:true});await fs.rename(extracted,target);verified=null;}finally{await fs.rm(stage,{recursive:true,force:true});}
 }};
}
