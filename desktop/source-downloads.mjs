import {promises as fs,constants,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {MAX_INLINE_SOURCE_BYTES,MAX_SOURCE_MEDIA_BYTES,SOURCE_FILE_EXTENSIONS,sourceDownloadFilename,filenameForMime} from './source-download-contract.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function only(value,fields){if(Object.keys(value).some(key=>!fields.includes(key)))throw new Error('The source download contains unsupported fields.');}
/** IPC accepts a bounded attachment or a content ID, never a filesystem path or URL. */
export function validateSourceDownloadRequest(input){
 if(!object(input)||!['inline','asset'].includes(input.kind))throw new Error('Choose an available source download.');
 only(input,input.kind==='inline'?['kind','filename','mime','dataUrl','size','sha256']:['kind','filename','asset']);
 if(typeof input.filename!=='string'||!input.filename||input.filename!==sourceDownloadFilename(input.filename))throw new Error('The source download needs a safe filename.');
 if(input.kind==='inline'){
  if(!SOURCE_FILE_EXTENSIONS[input.mime]||filenameForMime(input.filename,input.mime)!==input.filename)throw new Error('The source filename and format do not match.');
  if(!Number.isSafeInteger(input.size)||input.size<0||input.size>MAX_INLINE_SOURCE_BYTES||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256))throw new Error('The source size or checksum is invalid.');
  if(typeof input.dataUrl!=='string'||input.dataUrl.length>Math.ceil(MAX_INLINE_SOURCE_BYTES*4/3)+200||!input.dataUrl.startsWith(`data:${input.mime};base64,`))throw new Error('The source attachment is not correctly encoded.');
  const encoded=input.dataUrl.slice(input.dataUrl.indexOf(',')+1);
  if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('The source attachment has invalid base64.');
  const bytes=Buffer.from(encoded,'base64');if(bytes.length!==input.size||digest(bytes)!==input.sha256)throw new Error('The source checksum does not match. Reimport the original file.');
  return {kind:'inline',filename:input.filename,mime:input.mime,size:input.size,sha256:input.sha256,bytes};
 }
 const asset=input.asset;
 if(!object(asset))throw new Error('The recording attachment is invalid.');
 only(asset,['id','name','mime','size','sha256','duration']);
 if(typeof asset.id!=='string'||!/^[a-f0-9]{64}$/.test(asset.id)||asset.sha256!==asset.id||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_SOURCE_MEDIA_BYTES)throw new Error('The recording identity or size is invalid.');
 if(typeof asset.name!=='string'||!asset.name.trim()||asset.name.length>500||/[\x00-\x1f/\\]/.test(asset.name))throw new Error('The recording filename is invalid.');
 if(typeof asset.mime!=='string'||!/^(audio|video)\//.test(asset.mime)||!SOURCE_FILE_EXTENSIONS[asset.mime]||filenameForMime(input.filename,asset.mime)!==input.filename)throw new Error('The recording filename and format do not match.');
 if(asset.duration!==undefined&&(!Number.isFinite(asset.duration)||asset.duration<=0||asset.duration>43200))throw new Error('The recording duration is invalid.');
 return {kind:'asset',filename:input.filename,mime:asset.mime,size:asset.size,sha256:asset.sha256,asset:{...asset}};
}
async function safeDestination(filename,source){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new Error('Choose a local destination for this source.');
 let existing;try{existing=await fs.lstat(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(existing&&(!existing.isFile()||existing.isSymbolicLink()))throw new Error('Choose a regular file destination, not a folder or symbolic link.');
 if(source&&existing&&existing.dev===source.dev&&existing.ino===source.ino)throw new Error('Save a copy outside the original recording store.');
}
/** Stream to a sibling temporary file, verify all bytes, then publish atomically.
 * A failed check or write leaves an existing destination untouched. */
export async function saveSourceMaterial(input,{chooseDestination,resolveAsset}){
 const request=validateSourceDownloadRequest(input);
 let item;
 if(request.kind==='asset'){
  item=await resolveAsset(request.asset);
  if(!item||typeof item.path!=='string'||item.asset?.id!==request.asset.id||item.asset?.size!==request.size||item.asset?.mime!==request.mime)throw new Error('The stored recording does not match this source.');
 }
 const extension=path.extname(request.filename).slice(1);
 const chosen=await chooseDestination({title:'Save source material',defaultPath:request.filename,filters:[{name:'Source material',extensions:[extension||'*']}]});
 if(chosen.canceled||!chosen.filePath)return {status:'canceled',filename:request.filename};
 const filename=chosen.filePath;let source,temp;
 try{
  let sourceStat;
  if(item){source=await fs.open(item.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));sourceStat=await source.stat();if(!sourceStat.isFile()||sourceStat.size!==request.size)throw new Error('The original recording changed or is unavailable. Reimport it before downloading.');}
  await safeDestination(filename,sourceStat);
  temp=path.join(path.dirname(filename),'.asterloom-source-'+randomUUID()+'.tmp');
  if(source){
   let count=0;const hash=createHash('sha256'),guard=new Transform({transform(chunk,encoding,callback){count+=chunk.length;if(count>request.size)return callback(new Error('The original recording failed its size check.'));hash.update(chunk);callback(null,chunk);}});
   await pipeline(source.createReadStream({autoClose:false}),guard,createWriteStream(temp,{flags:'wx',mode:0o600}));
   if(count!==request.size||hash.digest('hex')!==request.sha256)throw new Error('The original recording failed its checksum check. Reimport it before downloading.');
  }else await fs.writeFile(temp,request.bytes,{flag:'wx',mode:0o600});
  const handle=await fs.open(temp,'r+');try{await handle.sync();}finally{await handle.close();}
  await safeDestination(filename,sourceStat);
  await fs.rename(temp,filename);temp=undefined;
  return {status:'saved',filename:path.basename(filename)};
 }finally{await source?.close();if(temp)await fs.rm(temp,{force:true});}
}
