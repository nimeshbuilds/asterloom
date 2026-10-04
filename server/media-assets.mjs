import {promises as fs,createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export class MediaError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
export const ASSET_ID=/^[a-f0-9]{64}$/;
export const MAX_MEDIA_BYTES=2*1024**3;
const TYPES={mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',aac:'audio/aac'};
export function sniffMedia(bytes,name){
 const ext=path.extname(name).slice(1).toLowerCase();const mime=TYPES[ext];if(!mime)throw new MediaError(415,'MEDIA_FORMAT','Use MP3, MP4, M4A, MOV, WebM, MKV, WAV, FLAC, OGG, OPUS or AAC.');
 const ascii=(start,end)=>bytes.subarray(start,end).toString('ascii');let format;
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')format='wav';
 else if(ascii(4,8)==='ftyp')format='mov';
 else if(ascii(0,4)==='OggS')format='ogg';
 else if(ascii(0,4)==='fLaC')format='flac';
 else if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))format='matroska';
 else if(ascii(0,3)==='ID3'||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0))format=ext==='aac'?'aac':'mp3';
 if(!format)throw new MediaError(415,'MEDIA_SIGNATURE','This file does not have a recognized audio or video header.');
 const matching={mp3:['mp3'],mov:['mp4','m4a','mov'],ogg:['ogg','opus'],wav:['wav'],flac:['flac'],aac:['aac'],matroska:['webm','mkv']};
 if(!matching[format].includes(ext))throw new MediaError(415,'MEDIA_SIGNATURE','The filename and media contents do not match.');
 return {mime,format};
}
export function parseByteRange(value,size){if(!value)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||(!match[1]&&!match[2]))throw new MediaError(416,'INVALID_RANGE','Request one valid byte range.');let start,end;if(!match[1]){const tail=Number(match[2]);if(!Number.isSafeInteger(tail)||tail<=0)throw new MediaError(416,'INVALID_RANGE','The byte range is invalid.');start=Math.max(0,size-tail);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new MediaError(416,'INVALID_RANGE','The byte range is outside this file.');return {start,end};}
export async function sha256File(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function atomicJson(file,data){const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(data,null,2),{mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
export async function createAssetStore({directory,bundledDirectory,maxAssetBytes=MAX_MEDIA_BYTES,reserveBytes=256*1024**2}){
 directory=path.resolve(directory);if(bundledDirectory)bundledDirectory=path.resolve(bundledDirectory);
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const inUse=new Set();
 const assertId=id=>{if(!ASSET_ID.test(id))throw new MediaError(400,'INVALID_ASSET','The media asset identifier is invalid.');};
 async function lookup(id){assertId(id);for(const root of [directory,bundledDirectory].filter(Boolean)){try{const file=path.join(root,id);const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;const metadata=JSON.parse(await fs.readFile(path.join(root,id+'.json'),'utf8'));if(metadata.id!==id||metadata.sha256!==id||metadata.size!==stat.size)throw new MediaError(409,'ASSET_CORRUPT','The stored media does not match its manifest.');return {path:file,asset:metadata,bundled:root===bundledDirectory};}catch(e){if(e.code==='ENOENT')continue;throw e;}}throw new MediaError(404,'ASSET_NOT_FOUND','The original media is missing. Re-import the file before playing, transcribing or exporting it.');}
 async function freeSpace(){const info=await fs.statfs(directory);return Number(info.bavail)*Number(info.bsize);}
 async function ingest(stream,{name,expectedBytes,expectedSha256,signal}={}){
  if(typeof name!=='string'||!name.trim()||name.length>240||/[\x00-\x1f]/.test(name))throw new MediaError(400,'MEDIA_NAME','Provide a valid media filename.');name=path.basename(name.replaceAll('\\','/'));
  if(expectedBytes!==undefined&&(!Number.isSafeInteger(expectedBytes)||expectedBytes<=0||expectedBytes>maxAssetBytes))throw new MediaError(413,'MEDIA_SIZE',`This media upload must be at most ${Math.floor(maxAssetBytes/1024**3)} GiB.`);
  if(await freeSpace()<reserveBytes+(expectedBytes||16*1024**2))throw new MediaError(507,'INSUFFICIENT_STORAGE','There is not enough free disk space for this media file. Free some space and retry.');
  const temp=path.join(directory,'.upload-'+randomUUID());let count=0,head=Buffer.alloc(0),lastSpace=0;const hash=createHash('sha256');
  const guard=new Transform({transform(chunk,encoding,callback){(async()=>{count+=chunk.length;if(count>maxAssetBytes)throw new MediaError(413,'MEDIA_SIZE','This media file exceeds the upload limit.');if(head.length<64)head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);if(count-lastSpace>32*1024**2){lastSpace=count;if(await freeSpace()<reserveBytes)throw new MediaError(507,'INSUFFICIENT_STORAGE','Disk space ran out during the media upload.');}hash.update(chunk);callback(null,chunk);})().catch(callback);}});
  try{await pipeline(stream,guard,createWriteStream(temp,{flags:'wx',mode:0o600}),{signal});if(!count||expectedBytes!==undefined&&expectedBytes!==count)throw new MediaError(400,'INCOMPLETE_UPLOAD','The media upload was incomplete. Retry the file.');const detected=sniffMedia(head,name),id=hash.digest('hex');if(expectedSha256&&id!==expectedSha256)throw new MediaError(409,'ASSET_INTEGRITY','The recording does not match its expected hash.');const asset={id,name,mime:detected.mime,size:count,sha256:id,format:detected.format,addedAt:new Date().toISOString()};
   // Serialize identical uploads through a no-replace hard link. The bytes are content-addressed.
   const localFile=path.join(directory,id),metadataFile=localFile+'.json';
   try{await fs.link(temp,localFile);}catch(e){if(e.code!=='EEXIST')throw e;const stat=await fs.lstat(localFile);if(!stat.isFile()||stat.isSymbolicLink())throw new MediaError(409,'ASSET_CORRUPT','The local recording location is invalid.');if(stat.size!==count||await sha256File(localFile)!==id)await fs.rename(temp,localFile);}
   let metadata;try{metadata=JSON.parse(await fs.readFile(metadataFile,'utf8'));}catch{}
   if(!metadata||metadata.id!==id||metadata.sha256!==id||metadata.size!==count)await atomicJson(metadataFile,asset);
   return (await lookup(id)).asset;
  }finally{await fs.rm(temp,{force:true});}
 }
 async function serve(request,response,id){const item=await lookup(id);const headers={'Content-Type':item.asset.mime,'Accept-Ranges':'bytes','ETag':`"${id}"`,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(item.asset.name)}`};let range;try{range=parseByteRange(request.headers.range,item.asset.size);}catch(e){response.writeHead(416,{...headers,'Content-Range':`bytes */${item.asset.size}`});response.end();return;}
  if(request.headers['if-none-match']===`"${id}"`&&!range){response.writeHead(304,headers);response.end();return;}
  const start=range?.start??0,end=range?.end??item.asset.size-1;response.writeHead(range?206:200,{...headers,'Content-Length':end-start+1,...range?{'Content-Range':`bytes ${start}-${end}/${item.asset.size}`}:{}});if(request.method==='HEAD'){response.end();return;}const file=createReadStream(item.path,{start,end});try{await pipeline(file,response);}catch(e){if(!request.destroyed&&!response.destroyed)throw e;}}
 async function remove(id){const item=await lookup(id);if(inUse.has(id))throw new MediaError(409,'ASSET_BUSY','Cancel the active transcription before removing its media.');if(item.bundled)throw new MediaError(409,'BUNDLED_ASSET','Bundled game media cannot be removed from the original application.');await fs.rm(item.path);await fs.rm(path.join(directory,id+'.json'),{force:true});}
 async function updateDuration(id,duration){const item=await lookup(id);if(item.bundled)return item.asset;const asset={...item.asset,duration};await atomicJson(path.join(directory,id+'.json'),asset);return asset;}
 return {directory,maxAssetBytes,lookup,ingest,serve,remove,updateDuration,inUse,freeSpace};
}
