import {promises as fs,createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {finished} from 'node:stream/promises';
import {ZipArchive} from 'archiver';
import yauzl from 'yauzl';
import {readGame} from './bundles.mjs';
import {ASSET_ID,MAX_MEDIA_BYTES,sha256File,sniffMedia} from '../server/media-assets.mjs';

const MAX_PACKAGE=64*1024**2,MAX_MANIFEST=1024**2,MAX_TOTAL=8*1024**3,MAX_ASSETS=200;
const digest=value=>createHash('sha256').update(value).digest('hex');
function assetsFor(notebook){const assets=new Map();for(const source of notebook.sources){if(!source.asset)continue;const old=assets.get(source.asset.id);if(old&&(old.size!==source.asset.size||old.mime!==source.asset.mime))throw new Error('Repeated recording references disagree.');assets.set(source.asset.id,source.asset);}if(assets.size>MAX_ASSETS)throw new Error('This archive has too many recordings.');return assets;}
export async function exportNotebookArchive({packageText,destination,resolveAsset}){
 const game=readGame(packageText),assets=assetsFor(game.notebook),resolved=[];let total=Buffer.byteLength(game.packageText);
 for(const asset of assets.values()){const item=await resolveAsset(asset);if(await sha256File(item.path)!==asset.sha256)throw new Error('A recording failed its integrity check. Re-import the original before exporting.');total+=asset.size;if(total>MAX_TOTAL)throw new Error('Split notebooks larger than 8 GiB into smaller archives.');resolved.push(item);}
 const manifest={format:'asterloom-media-archive',version:1,notebookSha256:digest(game.packageText),assets:[...assets.values()]};
 const temp=path.join(path.dirname(destination),'.asterloom-archive-'+randomUUID());const output=createWriteStream(temp,{flags:'wx',mode:0o600});const zip=new ZipArchive({store:true,forceZip64:true});const done=finished(output);zip.on('error',error=>output.destroy(error));zip.on('warning',error=>output.destroy(error));zip.pipe(output);
 try{zip.append(game.packageText,{name:'notebook.learnpack'});zip.append(JSON.stringify(manifest),{name:'manifest.json'});for(const item of resolved)zip.file(item.path,{name:'assets/'+item.asset.id});await Promise.all([zip.finalize(),done]);
  // Verify the completed archive, including streamed recording hashes, before publication.
  await inspectArchive(temp);await fs.rename(temp,destination);return {path:destination,assetCount:assets.size,bytes:(await fs.stat(destination)).size};
 }finally{zip.abort();output.destroy();await done.catch(()=>{});await fs.rm(temp,{force:true});}
}
async function open(file){return yauzl.openPromise(file,{lazyEntries:true,autoClose:true,strictFileNames:true,validateEntrySizes:true});}
async function inspectArchive(file){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_TOTAL+MAX_PACKAGE+16*1024**2)throw new Error('This recording archive exceeds the supported size.');
 const zip=await open(file);const seen=new Set(),recordings=new Map();let text,manifest,total=0;
 try{for await(const entry of zip.eachEntry()){
  const name=entry.fileName,assetMatch=/^assets\/([a-f0-9]{64})$/.exec(name);if(seen.has(name))throw new Error('The archive contains duplicate entries.');seen.add(name);
  if(name!=='manifest.json'&&name!=='notebook.learnpack'&&!assetMatch)throw new Error('The archive contains an unexpected or unsafe path.');
  const mode=(entry.externalFileAttributes>>>16)&0xf000;if(mode&&mode!==0x8000)throw new Error('Archive links and special files are not supported.');if(entry.isEncrypted())throw new Error('Encrypted archives are not supported.');
  const limit=name==='manifest.json'?MAX_MANIFEST:name==='notebook.learnpack'?MAX_PACKAGE:MAX_MEDIA_BYTES;
  if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<=0||entry.uncompressedSize>limit)throw new Error('An archive entry exceeds its size limit.');total+=entry.uncompressedSize;if(total>MAX_TOTAL+MAX_PACKAGE+MAX_MANIFEST||seen.size>MAX_ASSETS+2)throw new Error('The archive exceeds the supported recording limits.');
  const stream=await zip.openReadStreamPromise(entry);const hash=createHash('sha256');let size=0,head=Buffer.alloc(0);const chunks=[];
  for await(const chunk of stream){size+=chunk.length;if(size>limit||size>entry.uncompressedSize)throw new Error('An archive entry expanded beyond its declared size.');hash.update(chunk);if(assetMatch){if(head.length<64)head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);}else chunks.push(chunk);}
  if(size!==entry.uncompressedSize)throw new Error('An archive entry is incomplete.');const sha256=hash.digest('hex');
  if(assetMatch){if(sha256!==assetMatch[1])throw new Error('A recording failed its integrity check.');recordings.set(assetMatch[1],{size,head});}
  else if(name==='notebook.learnpack')text=Buffer.concat(chunks).toString('utf8');else manifest=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }}finally{zip.close();}
 if(!text||manifest?.format!=='asterloom-media-archive'||manifest.version!==1||manifest.notebookSha256!==digest(text)||!Array.isArray(manifest.assets))throw new Error('The archive notebook or manifest is invalid.');
 const game=readGame(text),assets=assetsFor(game.notebook);if(recordings.size!==assets.size||manifest.assets.length!==assets.size)throw new Error('The archive is missing a selected recording or contains unrelated recordings.');
 const manifestIds=new Set();for(const asset of manifest.assets){if(!ASSET_ID.test(asset?.id)||manifestIds.has(asset.id))throw new Error('The recording manifest is invalid.');manifestIds.add(asset.id);const expected=assets.get(asset.id),entry=recordings.get(asset.id);if(!expected||!entry||asset.sha256!==expected.sha256||asset.size!==expected.size||asset.mime!==expected.mime||entry.size!==expected.size)throw new Error('The recording manifest does not match the notebook.');if(sniffMedia(entry.head,expected.name).mime!==expected.mime)throw new Error('A recording has an invalid media type.');}
 return {game,assets};
}
export async function importNotebookArchive({filename,store}){
 // Verify every entry before changing the library. Nothing is extracted using ZIP paths.
 const {game,assets}=await inspectArchive(filename);const zip=await open(filename);let imported=0;
 try{for await(const entry of zip.eachEntry()){const match=/^assets\/([a-f0-9]{64})$/.exec(entry.fileName);if(!match)continue;const asset=assets.get(match[1]);if(!asset)throw new Error('The archive changed while it was being imported.');const stream=await zip.openReadStreamPromise(entry);const actual=await store.ingest(stream,{name:asset.name,expectedBytes:asset.size,expectedSha256:asset.sha256});if(actual.id!==asset.id)throw new Error('A recording changed while the archive was being imported.');if(asset.duration!==undefined)await store.updateDuration(asset.id,asset.duration);imported++;}}finally{zip.close();}
 if(imported!==assets.size)throw new Error('The archive changed while it was being imported.');return {packageText:game.packageText,assetCount:assets.size,notebookId:game.notebook.id};
}
