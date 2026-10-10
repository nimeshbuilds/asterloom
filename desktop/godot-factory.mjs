import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readGame} from './bundles.mjs';
import {writeNativeMediaManifest} from './godot-factory-media.mjs';
import {prepareNativeNotebookStorage,writeNativeLease,clearNativeNotebookStorage,nativeLeaseActive} from './godot-factory-storage.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const MAX_PACKAGE_BYTES=64*1024*1024;
const running=new Map();
const exists=async filename=>{try{return (await fs.stat(filename)).isFile();}catch{return false;}};

/** App-owned runtime locations only. Notebook data never chooses an executable. */
export async function nativeFactoryRuntime({platform=process.platform,runtimeDirectory=path.join(HERE,'vendor','godot-factory','runtime'),playerPath,enginePath}={}) {
  const executable=playerPath??(platform==='darwin'?path.join(runtimeDirectory,'Asterloom Native Factory.app','Contents','MacOS','Asterloom Native Factory'):platform==='win32'?path.join(runtimeDirectory,'Asterloom Native Factory.exe'):path.join(runtimeDirectory,'Asterloom Native Factory'));
  const engine=enginePath??path.join(runtimeDirectory,'assessment.mjs');
  if(!path.isAbsolute(executable)||!path.isAbsolute(engine)||!await exists(executable)||!await exists(engine))return {available:false,error:'The native game player is not included in this studio build. Install a build containing the Godot player, or use Play game for the full player.'};
  return {available:true,executable,engine};
}

function checkedRequest(request) {
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['packageText','activityId'].includes(key)))throw Error('Choose a saved notebook to open in the native player.');
  if(typeof request.packageText!=='string'||Buffer.byteLength(request.packageText)>MAX_PACKAGE_BYTES)throw Error('The native learning pack exceeds the 64 MB portable package limit.');
  if(request.activityId!==undefined&&(typeof request.activityId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(request.activityId)))throw Error('Choose a prepared mission from this notebook.');
  return request;
}

/** Validate before writing/launching. Generated content retains its review status. */
export async function launchNativeFactory(request,{userData,executablePath=process.execPath,platform=process.platform,runtimeDirectory,playerPath,enginePath,spawnProcess=spawn,makePack,resolveAsset,persistLease=writeNativeLease}={}) {
  checkedRequest(request);
  if(!userData||!path.isAbsolute(userData)||!path.isAbsolute(executablePath))throw Error('The local native player storage is unavailable.');
  const runtime=await nativeFactoryRuntime({platform,runtimeDirectory,playerPath,enginePath});
  if(!runtime.available)return runtime;
  const game=readGame(request.packageText);
  const notebook=request.activityId?{...game.notebook,activities:(game.notebook.activities??[]).filter(activity=>activity.id===request.activityId)}:game.notebook;
  if(request.activityId&&!notebook.activities?.length)throw Error('Choose a prepared mission from this notebook.');
  const buildPack=makePack??(await import('./generated/godot-factory-validation.mjs')).factoryPackFromNotebook;
  const pack=buildPack(notebook),text=JSON.stringify(pack);
  if(Buffer.byteLength(text)>MAX_PACKAGE_BYTES)throw Error('This prepared native game exceeds the 64 MB portable package limit.');
  const identity=createHash('sha256').update(text).digest('hex');
  const sessionKey=path.resolve(userData)+'\0'+identity;
  if(running.has(sessionKey))return {launched:true,alreadyRunning:true,notebookId:notebook.id,missionCount:pack.missions.length};
  const paths=await prepareNativeNotebookStorage(userData,notebook.id);
  const directory=paths.games,lease=path.join(directory,identity+'.lease.json');
  if(await nativeLeaseActive(lease,notebook.id))return {launched:true,alreadyRunning:true,notebookId:notebook.id,missionCount:pack.missions.length};
  const filename=path.join(directory,identity+'.json'),temporary=path.join(directory,'.'+randomUUID()+'.tmp');
  try{await fs.writeFile(temporary,text,{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true});}
  const mediaManifest=await writeNativeMediaManifest(notebook,{directory:paths.media,resolveAsset});
  const saveDirectory=paths.progress;
  // Electron's bundled Node runs the deterministic bridge. No separate runtime
  // download, provider connection, HTML surface, or renderer code is involved.
  const child=spawnProcess(runtime.executable,['--',`--mission-pack=${filename}`,`--node=${executablePath}`,`--engine=${runtime.engine}`,`--save-dir=${saveDirectory}`,`--preferences-file=${paths.preferences}`,`--storage-owner=${path.basename(paths.games)}`,...(mediaManifest?[`--asset-manifest=${mediaManifest}`]:[])],{shell:false,windowsHide:false,detached:false,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  const session={child,notebookId:notebook.id,userData:path.resolve(userData)};running.set(sessionKey,session);
  const forget=()=>{if(running.get(sessionKey)===session)running.delete(sessionKey);void fs.rm(lease,{force:true}).catch(()=>{});if(mediaManifest)void fs.rm(mediaManifest,{force:true}).catch(()=>{});};
  child.once('exit',forget);
  try{await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}
  catch(error){forget();throw Error(`The native game could not start: ${error.message}`);}
  try{await persistLease(lease,notebook.id,child.pid);}
  catch{
    // A preview without durable ownership must not outlive a failed launch.
    // Keep the in-memory protection until the OS confirms its exit.
    const stopped=new Promise(resolve=>{if(child.exitCode!=null||child.signalCode!=null)resolve();else child.once('exit',resolve);});
    child.kill('SIGKILL');await stopped;
    throw Error('The native game could not save its session information and was closed. Check local storage before trying again.');
  }
  child.unref?.();
  return {launched:true,processId:child.pid,notebookId:notebook.id,missionCount:pack.missions.length};
}

/** Active previews keep their sources until the user closes them and retries deletion. */
export async function clearNativeFactoryNotebook(notebookId,{userData,...options}={}) {
  if([...running.values()].some(session=>session.notebookId===notebookId&&session.userData===path.resolve(userData)))return {cleared:false,warnings:['Close the native game preview for this notebook, then retry cleanup.']};
  return clearNativeNotebookStorage(notebookId,{userData,...options});
}

/** Serialize launch and cleanup so neither can remove the other's ownership files. */
export function createNativeFactoryController(options,{launch=launchNativeFactory,clear=clearNativeFactoryNotebook}={}) {
  let busy=false;
  const run=async(operation,blocked)=>{if(busy)return blocked;busy=true;try{return await operation();}finally{busy=false;}};
  return {
    launch:request=>run(()=>launch(request,options),{error:'A native game is opening or its local files are being cleaned up. Try again when that finishes.'}),
    clear:notebookId=>run(()=>clear(notebookId,options),{cleared:false,warnings:['A native preview is opening or its local files are being cleaned up. Retry cleanup when that finishes.']}),
  };
}
