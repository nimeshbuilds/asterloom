import {createHash,randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {codexArtifact} from './codex-artifacts.mjs';
const fail=message=>Object.assign(new Error(message),{status:422,publicMessage:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact bounded extraction from a pinned npm archive. Reject links, traversal and
// unexpected TAR types; never execute package scripts or trust archive permissions.
export function readCodexArchive(compressed,artifact){
 if(!Buffer.isBuffer(compressed)||compressed.length>220*1024*1024)throw fail('The Codex download exceeds the supported size.');
 if(`sha512-${createHash('sha512').update(compressed).digest('base64')}`!==artifact.integrity)throw fail('Codex download integrity verification failed. Try installing again.');
 const archive=gunzipSync(compressed,{maxOutputLength:600*1024*1024}),entries=[];let expanded=0;
 for(let offset=0;offset+512<=archive.length;){
  const h=archive.subarray(offset,offset+512);if(h.every(x=>x===0))break;
  const string=(start,end)=>h.subarray(start,end).toString('utf8').replace(/\0.*$/s,'');
  const name=[string(345,500),string(0,100)].filter(Boolean).join('/'),type=string(156,157)||'0';
  const raw=string(124,136).trim();if(!/^[0-7]+$/.test(raw))throw fail('Codex archive size is invalid.');
  const size=parseInt(raw,8);let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:h[i];
  if(checksum!==parseInt(string(148,156).trim(),8)||!Number.isSafeInteger(size)||size<0||offset+512+size>archive.length)throw fail('Codex archive is damaged.');
  if(!name.startsWith('package/')||name.includes('\\')||name.split('/').some(p=>p==='..'||p==='')||name.includes(':')||!['0','5'].includes(type))throw fail('Codex archive contains an unsupported entry.');
  expanded+=size;if(expanded>550*1024*1024||entries.length>=200)throw fail('Codex archive exceeds the extraction limit.');
  if(type==='0')entries.push({name,bytes:archive.subarray(offset+512,offset+512+size)});
  offset+=512+Math.ceil(size/512)*512;
 }
 if(!entries.some(e=>e.name===artifact.binary))throw fail('The Codex archive does not contain its expected executable.');
 return entries;
}
export function createCodexInstaller({directory,platform=process.platform,arch=process.arch,fetcher=fetch,artifact=codexArtifact(platform,arch)}={}){
let installing=false,error=null,promise=null,controller=null,verifiedReceipt=null;
 const target=artifact?path.join(directory,`${artifact.version}-${artifact.target}`):null;
 async function receipt(force=false){try{
  const saved=JSON.parse(await fs.readFile(path.join(target,'receipt.json'),'utf8'));
  if(saved.integrity!==artifact.integrity||saved.version!==artifact.version||saved.binary!==artifact.binary||!Array.isArray(saved.files))return null;
  // The executable is checked before each process launch; the entire archive was pinned at installation.
  const executable=path.join(target,artifact.binary),stat=await fs.lstat(executable);if(!stat.isFile()||stat.isSymbolicLink())return null;const stamp=`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${saved.binarySha256}`;
  if(!force&&verifiedReceipt?.stamp===stamp)return saved;
  const file=await fs.readFile(executable);if(digest(file)!==saved.binarySha256)return null;
  verifiedReceipt={stamp};return saved;
 }catch{return null;}}
 async function status(){return {supported:!!artifact,installed:!!(artifact&&await receipt()),version:artifact?.version||null,installing,error};}
 async function binary(){if(!artifact||!await receipt(true))throw fail('Install the verified Codex engine before signing in.');return path.join(target,artifact.binary);}
 async function perform(){
  const stage=path.join(directory,`.install-${randomUUID()}`);const timer=setTimeout(()=>controller.abort(),180000);
  try{
   await fs.mkdir(stage,{recursive:true,mode:0o700});
   const response=await fetcher(artifact.url,{redirect:'error',signal:controller.signal});if(!response.ok)throw fail('The official Codex download is unavailable. Try again later.');
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>220*1024*1024)throw fail('The Codex download exceeds the supported size.');chunks.push(Buffer.from(chunk));}
   const entries=readCodexArchive(Buffer.concat(chunks),artifact);const files=[];
   for(const entry of entries){const output=path.join(stage,entry.name);await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});await fs.writeFile(output,entry.bytes,{mode:/\/(bin|codex-path)\//.test(entry.name)?0o700:0o600});files.push({path:entry.name,size:entry.bytes.length});}
   if(controller.signal.aborted)throw Object.assign(new Error('Canceled'),{name:'AbortError'});
   await fs.mkdir(path.join(stage,'licenses'),{recursive:true,mode:0o700});
   for(const filename of ['codex-LICENSE.txt','codex-NOTICE.txt'])await fs.copyFile(new URL(`./licenses/${filename}`,import.meta.url),path.join(stage,'licenses',filename));
   const executable=entries.find(e=>e.name===artifact.binary);
   await fs.writeFile(path.join(stage,'receipt.json'),JSON.stringify({...artifact,binarySha256:digest(executable.bytes),installedAt:new Date().toISOString(),files}),{mode:0o600});
   // A corrupt previous install can be replaced; a verified existing install never needs a download.
   await fs.rm(target,{recursive:true,force:true});await fs.rename(stage,target);error=null;
  }catch(e){error=e?.name==='AbortError'?'Codex installation was canceled or timed out.':e?.status?e.message:'Codex could not be installed. Check disk space and your connection, then retry.';}
  finally{clearTimeout(timer);controller=null;installing=false;await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
 }
 async function install(){if(!artifact)throw fail('Codex installation is not available for this platform.');if(installing)return status();installing=true;error=null;controller=new AbortController();promise=(async()=>{if(await receipt()){error=null;installing=false;controller=null;return;}await perform();})();return status();}
 return {status,binary,install,cancel:()=>controller?.abort(),settled:()=>promise,close:async()=>{controller?.abort();await promise;}};
}
