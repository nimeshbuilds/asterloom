import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,lstat,readFile,rename,rm,chmod,statfs} from 'node:fs/promises';
import {Transform,Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import path from 'node:path';

export const GROK_LOCK=JSON.parse(await readFile(new URL('./grok-runtime.lock.json',import.meta.url),'utf8'));
export function grokArtifact(platform=process.platform,arch=process.arch){
 return GROK_LOCK.artifacts[platform==='darwin'?`macos-${arch==='arm64'?'aarch64':arch==='x64'?'x86_64':arch}`:platform==='win32'?`windows-${arch==='x64'?'x86_64':arch}`:'unsupported']??null;
}
export const grokError=(message,status=400)=>Object.assign(new Error(message),{status,publicMessage:true});
export async function privateDirectory(dir){await mkdir(dir,{recursive:true,mode:0o700});const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw grokError('The private engine folder is not a regular directory.');await chmod(dir,0o700);}
export async function sha256File(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function verifier(expectedBytes,expectedHash,onBytes){let bytes=0;const hash=createHash('sha256');return new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;if(bytes>expectedBytes)return done(grokError('The engine download exceeded its pinned size.'));hash.update(chunk);onBytes?.(bytes);done(null,chunk);},flush(done){done(bytes===expectedBytes&&hash.digest('hex')===expectedHash?null:grokError('The engine download did not match its pinned checksum.'));}});}
export async function downloadGrokRuntime({destination,artifact=grokArtifact(),fetcher=fetch,signal,onProgress=()=>{},label='Grok'}){
 if(!artifact)throw grokError(`This ${label} engine build supports Mac and Windows x64.`);
 const dir=path.dirname(destination);await privateDirectory(dir);const temporary=path.join(dir,`.grok-${randomUUID()}.partial`);
 const space=await statfs(dir);if(space.bavail*space.bsize<artifact.bytes+64*1024*1024)throw grokError(`Free more disk space before installing the ${label} engine.`);
 try{
  const response=await fetcher(artifact.url,{redirect:'error',signal});if(!response.ok||!response.body)throw grokError(`The official ${label} download is unavailable. Try installation again.`);
  const stages=[Readable.fromWeb(response.body),verifier(artifact.downloadBytes,artifact.downloadSha256,bytes=>onProgress({downloadedBytes:bytes,totalBytes:artifact.downloadBytes})),...(artifact.url.endsWith('.gz')?[createGunzip()]:[]),verifier(artifact.bytes,artifact.sha256),createWriteStream(temporary,{flags:'wx',mode:0o600})];
  await pipeline(stages,{signal});await chmod(temporary,0o700);await rename(temporary,destination);onProgress({downloadedBytes:artifact.downloadBytes,totalBytes:artifact.downloadBytes});return destination;
 }finally{await rm(temporary,{force:true});}
}

// Shared pinned-download machinery; supplying another manifest never changes its bytes.
export const downloadPinnedEngine=downloadGrokRuntime;
