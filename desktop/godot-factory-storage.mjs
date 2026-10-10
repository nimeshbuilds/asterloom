import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const PACK=/^[a-f0-9]{64}\.json$/;
const LEASE=/^[a-f0-9]{64}\.lease\.json$/;
const PROGRESS=/^factory-progress-[a-f0-9]{24}\.json(?:\.tmp)?$/;
const SCRATCH=/^factory-bridge-[0-9]+-[0-9]+-(?:request|response)\.json$/;
const MEDIA=/^[a-f0-9-]{36}\.json$/;
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
const missing=error=>error.code==='ENOENT';

export function nativeNotebookPaths(userData,notebookId){
 if(typeof userData!=='string'||!path.isAbsolute(userData)||typeof notebookId!=='string'||!notebookId.trim()||notebookId.length>512)throw Error('Choose a saved notebook for native cleanup.');
 const key=createHash('sha256').update(notebookId).digest('hex');
 return {games:path.join(userData,'native-games',key),progress:path.join(userData,'native-progress',key),media:path.join(userData,'native-media',key),preferences:path.join(userData,'native-progress','presentation.cfg')};
}

async function directoryStatus(directory){
 try{const stat=await fs.lstat(directory);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Native storage is not an ordinary app-owned directory.');return true;}catch(error){if(missing(error))return false;throw error;}
}
export async function prepareNativeNotebookStorage(userData,notebookId){
 const paths=nativeNotebookPaths(userData,notebookId);
 await fs.mkdir(userData,{recursive:true});
 for(const directory of [paths.games,paths.progress,paths.media])for(const current of [path.dirname(directory),directory]){
  if(!await directoryStatus(current))try{await fs.mkdir(current);}catch(error){if(error.code!=='EEXIST')throw error;}
  await directoryStatus(current);
 }
 return paths;
}
async function ownedEntries(directory){
 if(!await directoryStatus(path.dirname(directory))||!await directoryStatus(directory))return [];
 return fs.readdir(directory,{withFileTypes:true});
}
async function readOrdinaryJson(filename,limit=64*1024*1024){
 const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error('This native file could not be identified safely.');
 return JSON.parse(await fs.readFile(filename,'utf8'));
}
export async function writeNativeLease(filename,notebookId,pid){
 if(!Number.isInteger(pid)||pid<=0)return; // Injected test processes may have no OS PID.
 const temporary=filename+'.tmp';
 await fs.writeFile(temporary,JSON.stringify({version:1,notebookId,pid,startedAt:new Date().toISOString()}),{mode:0o600});
 await fs.rename(temporary,filename);
}
export async function nativeLeaseActive(filename,notebookId,processAlive=alive){
 let lease;try{lease=await readOrdinaryJson(filename,4096);}catch(error){if(missing(error))return false;throw error;}
 if(lease.version!==1||lease.notebookId!==notebookId||!Number.isInteger(lease.pid)||lease.pid<=0)throw Error('A native preview session could not be checked safely.');
 return processAlive(lease.pid);
}

/** Paths are derived from the notebook identity. Never follow notebook-provided paths. */
export async function clearNativeNotebookStorage(notebookId,{userData,processAlive=alive,legacyBridgeDirectory}={}){
 const paths=nativeNotebookPaths(userData,notebookId),warnings=[];let removedFiles=0;
 let games;
 try{games=await ownedEntries(paths.games);await ownedEntries(paths.progress);await ownedEntries(paths.media);}catch{return {cleared:false,removedFiles,warnings:['Native storage could not be checked safely. Its files have been preserved.']};}
 // A lease also survives a Studio restart while its separately opened preview stays active.
 for(const entry of games.filter(entry=>LEASE.test(entry.name)||/^[a-f0-9]{64}\.lease\.json\.tmp$/.test(entry.name))){
  try{
   if(await nativeLeaseActive(path.join(paths.games,entry.name),notebookId,processAlive))return {cleared:false,removedFiles,warnings:['Close the native game preview for this notebook, then retry cleanup.']};
  }catch{return {cleared:false,removedFiles,warnings:['A native preview session could not be checked. Close its preview and retry cleanup; its files have been preserved.']};}
 }
 const remove=async filename=>{try{const stat=await fs.lstat(filename);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Not an ordinary file');await fs.unlink(filename);removedFiles++;}catch(error){if(!missing(error))warnings.push('Some native files could not be removed safely. Retry cleanup after checking their permissions.');}};
 for(const [directory,allowed] of [[paths.games,name=>PACK.test(name)||LEASE.test(name)||/^[a-f0-9]{64}\.lease\.json\.tmp$/.test(name)],[paths.progress,name=>PROGRESS.test(name)||SCRATCH.test(name)],[paths.media,name=>MEDIA.test(name)]]){
  for(const entry of await ownedEntries(directory)){
   if(!allowed(entry.name)){warnings.push('An unrecognized native file was preserved. Native cleanup still needs attention.');continue;}
   await remove(path.join(directory,entry.name));
  }
  try{await fs.rmdir(directory);}catch(error){if(!['ENOENT','ENOTEMPTY'].includes(error.code))warnings.push('An empty native data folder could not be removed.');}
 }
 // Pre-preview-development builds used flat directories. Only explicit ownership
 // can authorize removal there; Godot's progress hash must never be guessed.
 for(const [base,pattern,owner] of [['native-games',PACK,value=>value.format==='asterloom-godot-factory'?value.notebook?.id:undefined],['native-progress',PROGRESS,value=>value.notebookId],['native-media',MEDIA,value=>value.notebookId]]){
  const directory=path.join(userData,base);if(!await directoryStatus(directory))continue;
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   if(!pattern.test(entry.name))continue;
   try{const id=owner(await readOrdinaryJson(path.join(directory,entry.name)));if(typeof id!=='string'||!id)throw Error('Unknown ownership');if(id===notebookId)await remove(path.join(directory,entry.name));}
   catch{warnings.push('An older native file has no readable notebook ownership. It was preserved; cleanup is incomplete.');}
  }
 }
 // Old experimental previews used a shared scratch directory without notebook
 // ownership. Detect leftovers but never attribute them to the notebook by guess.
 if(legacyBridgeDirectory){
  try{if(await directoryStatus(legacyBridgeDirectory)&&(await fs.readdir(legacyBridgeDirectory)).some(name=>/^(?:factory-bridge-)?[0-9]+-[0-9]+-(?:request|response)\.json$/.test(name)))warnings.push('An older native preview left assessment files without notebook ownership. They were preserved; cleanup is incomplete.');}
  catch{warnings.push('Older native assessment storage could not be inspected. Cleanup is incomplete.');}
 }
 return {cleared:warnings.length===0,removedFiles,warnings:[...new Set(warnings)]};
}
