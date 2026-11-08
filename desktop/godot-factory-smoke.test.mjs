import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {_electron as electron} from 'playwright';
import {nativeTestExecutable} from './testing.mjs';
import {nativeNotebookPaths} from './godot-factory-storage.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enabled=process.env.ASTERLOOM_FACTORY_SMOKE==='1';
const now='2026-10-10T00:00:00.000Z';
const evidence='The documented collection procedure has two steps. First collect the samples. Then inspect the samples. Inspection depends on collection.';
const notebook={id:'packaged-native-fixture',title:'Packaged native process',description:'Isolated native launch verification.',createdAt:now,updatedAt:now,revision:1,ageGroup:'adult',theme:'islands',goal:'Learn the documented process.',scaffoldIds:['process-reconstruction'],cards:[],sources:[{id:'source',title:'Collection procedure',kind:'text',text:evidence,status:'ready',addedAt:now}],activities:[{version:1,id:'process',kind:'sequence',title:'Reconstruct collection',instruction:'Arrange the steps from the documented procedure.',reviewStatus:'reviewed',sourceRefs:[{sourceId:'source',evidence}],hint:'Which step supplies the samples?',explanation:'Collection supplies the samples before inspection.',scaffoldIds:['process-reconstruction'],items:[{id:'collect',label:'Collect samples'},{id:'inspect',label:'Inspect samples'}],constraints:[{before:'collect',after:'inspect'}]}]};

test('packaged studio launches its bundled native player through IPC and its Electron engine renders the validated pack',{skip:!enabled,timeout:90000},async()=>{
 const binary=process.env.ASTERLOOM_SMOKE_APP;assert.ok(binary,'Set ASTERLOOM_SMOKE_APP to a packaged desktop executable');
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-factory-smoke-'));
 const output=path.join(ROOT,'.qa');await fs.mkdir(output,{recursive:true});
 let application,ipcPid,renderChild;let renderLog='';
 try{
  const selected=await nativeTestExecutable(binary,temporary);
  const env={...process.env,ASTERLOOM_DATA_DIR:path.join(temporary,'profiles')};delete env.ELECTRON_RUN_AS_NODE;
  application=await electron.launch({executablePath:selected,args:[],cwd:ROOT,env,timeout:60000});
  const page=await application.firstWindow();await page.getByRole('heading',{name:'What will you discover today?'}).waitFor({timeout:30000});
  const host=await application.evaluate(({app})=>({appPath:app.getAppPath(),userData:app.getPath('userData'),execPath:process.execPath,platform:process.platform,arch:process.arch,isPackaged:app.isPackaged}));
  assert.equal(host.isPackaged,true);assert.equal(await page.evaluate(()=>window.asterloomDesktop.nativeGameAvailable),true);
  const launched=await page.evaluate(packageText=>window.asterloomDesktop.launchNativeGame({packageText}),JSON.stringify({format:'learnpack',version:1,exportedAt:now,notebook}));
  assert.equal(launched.launched,true,JSON.stringify(launched));assert.equal(launched.missionCount,1);assert.ok(Number.isInteger(launched.processId));ipcPid=launched.processId;
  await new Promise(resolve=>setTimeout(resolve,750));process.kill(ipcPid,0);
  const blockedCleanup=await page.evaluate(id=>window.asterloomDesktop.clearNativeNotebook(id),notebook.id);assert.equal(blockedCleanup.cleared,false);assert.match(blockedCleanup.warnings.join(' '),/Close the native game preview/);
  const directory=nativeNotebookPaths(host.userData,notebook.id).games,files=(await fs.readdir(directory)).filter(file=>/^[a-f0-9]{64}\.json$/.test(file));assert.equal(files.length,1);
  const nativePack=path.join(directory,files[0]);assert.equal(JSON.parse(await fs.readFile(nativePack,'utf8')).notebook.activities[0].reviewStatus,'reviewed');
  const runtime=path.join(host.appPath,'desktop','vendor','godot-factory','runtime');
  const player=host.platform==='darwin'?path.join(runtime,'Asterloom Native Factory.app','Contents','MacOS','Asterloom Native Factory'):path.join(runtime,'Asterloom Native Factory.exe');
  const screenshot=path.join(output,`native-packaged-${host.platform}-${host.arch}.png`);await fs.rm(screenshot,{force:true});
  renderChild=spawn(player,['--',`--mission-pack=${nativePack}`,`--node=${host.execPath}`,`--engine=${path.join(runtime,'assessment.mjs')}`,`--save-dir=${path.join(temporary,'native-progress')}`,`--qa-screenshot=${screenshot}`],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe'],shell:false});
  renderChild.stdout.on('data',data=>{renderLog+=data;});renderChild.stderr.on('data',data=>{renderLog+=data;});
  const deadline=Date.now()+30000;let rendered=false;
  while(Date.now()<deadline){try{rendered=(await fs.stat(screenshot)).size>1000;}catch{}if(rendered)break;if(renderChild.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(rendered,true,`Packaged native pack validation/render did not complete: ${renderLog}`);
  assert.doesNotMatch(renderLog,/SCRIPT ERROR|Parse Error|ERROR:/);
  renderChild.kill();await new Promise(resolve=>renderChild.once('close',resolve));
  process.kill(ipcPid,'SIGTERM');let cleaned;
  const cleanupDeadline=Date.now()+10000;
  while(Date.now()<cleanupDeadline){cleaned=await page.evaluate(id=>window.asterloomDesktop.clearNativeNotebook(id),notebook.id);if(cleaned.cleared)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(cleaned?.cleared,true,JSON.stringify(cleaned));await assert.rejects(fs.access(directory));
  await fs.writeFile(path.join(output,`native-packaged-${host.platform}-${host.arch}.json`),JSON.stringify({platform:host.platform,architecture:host.arch,ipcLaunch:true,missionCount:launched.missionCount,packagedElectronEngine:true,validatedNativeRender:true,activePreviewCleanupRefused:true,closedPreviewDataRemoved:true,screenshot},null,2));
 }finally{
  renderChild?.kill();if(renderChild&&renderChild.exitCode===null)await new Promise(resolve=>{renderChild.once('close',resolve);setTimeout(resolve,5000).unref();});
  if(ipcPid)try{process.kill(ipcPid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
  await application?.close();await fs.rm(temporary,{recursive:true,force:true});
 }
});
