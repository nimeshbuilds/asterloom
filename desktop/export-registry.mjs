import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicJson,sha256File} from '../server/media-assets.mjs';

const ID=/^export-[a-f0-9-]{36}$/;
const within=(child,parent)=>child===parent||child.startsWith(parent+path.sep);
/** A per-profile allowlist of exact outputs this app created. User uploads and
 * arbitrary renderer paths are never accepted as deletion targets. */
export async function createExportRegistry({directory,currentBundle,trashItem}){
 await fs.mkdir(directory,{recursive:true,mode:0o700});directory=await fs.realpath(directory);
 const filename=path.join(directory,'created-exports.json');let queue=Promise.resolve();
 const load=async()=>{try{const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw Error('Invalid export registry');const data=JSON.parse(await fs.readFile(filename,'utf8'));if(data.version!==1||!Array.isArray(data.exports))throw Error('Invalid export registry');return data.exports;}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 const serialize=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
 async function inspect(record){
  if(!record||!ID.test(record.id)||!['game','archive'].includes(record.kind)||typeof record.path!=='string'||!path.isAbsolute(record.path))throw Error('Invalid tracked export');
  const stat=await fs.lstat(record.path);if(stat.isSymbolicLink()||(record.kind==='game'?!stat.isDirectory():!stat.isFile()))throw Error('The export location changed');
  const real=await fs.realpath(record.path);if(real!==record.path||stat.dev!==record.device||stat.ino!==record.inode)throw Error('The export location changed');
  if(within(directory,real)||within(real,directory))throw Error('Application data cannot be moved to Trash');
  if(currentBundle){const app=await fs.realpath(currentBundle);if(within(app,real)||within(real,app))throw Error('The running application cannot be moved to Trash');}
  const content=record.kind==='game'?path.join(real,...(record.platform==='mac'?['Contents','Resources']:['resources']),'game.learnpack'):real;
  const contentStat=await fs.lstat(content);if(!contentStat.isFile()||contentStat.isSymbolicLink())throw Error('The tracked export has changed');
  // No intermediate symlink can redirect the small identity file outside its bundle.
  if(await fs.realpath(content)!==content)throw Error('The tracked export has changed');
  if(await sha256File(content)!==record.contentHash)throw Error('The tracked export has changed');
  return real;
 }
 async function track({notebookId,output,kind='game',platform}){return serialize(async()=>{
  if(typeof notebookId!=='string'||!notebookId||notebookId.length>200||!['game','archive'].includes(kind))throw Error('Invalid export metadata');
  const original=await fs.lstat(output);if(original.isSymbolicLink())throw Error('Export paths must not be symlinks');
  const real=await fs.realpath(output),stat=await fs.lstat(real),content=kind==='game'?path.join(real,...(platform==='mac'?['Contents','Resources']:['resources']),'game.learnpack'):real;
  const record={id:'export-'+randomUUID(),notebookId,path:real,name:path.basename(real),kind,...platform?{platform}:{},device:stat.dev,inode:stat.ino,contentHash:await sha256File(content),createdAt:new Date().toISOString()};
  await inspect(record);const records=await load();records.push(record);if(records.length>10000)throw Error('The export registry is full');await atomicJson(filename,{version:1,exports:records});return record.id;
 });}
 async function list(notebookId){await queue.catch(()=>{});const records=(await load()).filter(record=>record.notebookId===notebookId&&!record.trashed);return Promise.all(records.map(async record=>{let available=true;try{await inspect(record);}catch{available=false;}return {id:record.id,name:record.name,path:record.path,kind:record.kind,platform:record.platform,available};}));}
 async function trash(notebookId,ids){
  if(typeof notebookId!=='string'||!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!ID.test(id)))throw Error('Choose only exports listed for this notebook.');
  return serialize(async()=>{const records=await load(),selected=[...new Set(ids)].map(id=>records.find(record=>record.id===id&&record.notebookId===notebookId));if(selected.some(record=>!record))throw Error('An export is not owned by this notebook.');
   // Validate the entire selection before any mutation. An empty list is a cancel/no-op.
   if(!selected.length)return {trashedIds:[],warnings:[]};
   const absent=new Set();
   for(const record of selected)if(!record.trashed){try{await fs.lstat(record.path);}catch(error){if(error.code==='ENOENT'){absent.add(record.id);continue;}throw error;}await inspect(record);}
   // A previous Trash operation may have succeeded just before the registry
   // write was interrupted. An absent registered target needs no further action.
   const trashedIds=[],warnings=[];for(const record of selected){if(record.trashed||absent.has(record.id)){trashedIds.push(record.id);continue;}try{await inspect(record);await trashItem(record.path);trashedIds.push(record.id);}catch{warnings.push(`“${record.name}” was kept because it could not be safely moved to Trash.`);}}
   await atomicJson(filename,{version:1,exports:records.map(record=>trashedIds.includes(record.id)?{id:record.id,notebookId:record.notebookId,trashed:true}:record)});return {trashedIds,warnings};
  });
 }
 return {track,list,trash};
}
