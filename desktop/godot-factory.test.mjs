import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {writeNativeMediaManifest} from './godot-factory-media.mjs';
import {nativeFactoryRuntime,launchNativeFactory,clearNativeFactoryNotebook,createNativeFactoryController} from './godot-factory.mjs';
import {nativeNotebookPaths} from './godot-factory-storage.mjs';

const now='2026-10-10T00:00:00.000Z';
function notebook(reviewStatus='reviewed') {
 const evidence='The documented collection procedure has two steps. First collect the samples. Then inspect the samples. Inspection depends on collection.';
 return {id:'native-launch-fixture',title:'Local native game',description:'',createdAt:now,updatedAt:now,revision:1,ageGroup:'adult',theme:'islands',goal:'Learn a process.',scaffoldIds:['process-reconstruction'],cards:[],sources:[{id:'source',title:'Collection procedure',kind:'text',text:evidence,status:'ready',addedAt:now}],activities:[{version:1,id:'process',kind:'sequence',title:'Reconstruct collection',instruction:'Arrange the steps from the documented procedure.',reviewStatus,sourceRefs:[{sourceId:'source',evidence}],hint:'Which step supplies the samples?',explanation:'Collection supplies the samples before inspection.',scaffoldIds:['process-reconstruction'],items:[{id:'collect',label:'Collect samples'},{id:'inspect',label:'Inspect samples'}],constraints:[{before:'collect',after:'inspect'}]}]};
}
const serialized=n=>JSON.stringify({format:'learnpack',version:1,exportedAt:now,notebook:n});
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-launch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const runtimeDirectory=path.join(root,'runtime');await fs.mkdir(runtimeDirectory);await fs.writeFile(path.join(runtimeDirectory,'Asterloom Native Factory.exe'),'trusted runtime fixture');await fs.writeFile(path.join(runtimeDirectory,'assessment.mjs'),'trusted assessment fixture');return{root,runtimeDirectory,userData:path.join(root,'data'),platform:'win32',executablePath:process.execPath};}
function spawning(t){const calls=[];const children=[];t.after(()=>children.forEach(child=>child.emit('exit',0)));return{calls,children,spawnProcess:(executable,args,options)=>{const child=new EventEmitter();child.unref=()=>{};calls.push({executable,args,options});children.push(child);process.nextTick(()=>child.emit('spawn'));return child;}};}

test('missing native runtime has an explicit status and does not silently substitute a browser player',async t=>{const options=await setup(t);await fs.rm(path.join(options.runtimeDirectory,'Asterloom Native Factory.exe'));const result=await nativeFactoryRuntime(options);assert.equal(result.available,false);assert.match(result.error,/not included/);});

test('launch validates and saves a portable game, uses Electron Node mode and fixed argument arrays',async t=>{const options=await setup(t),fake=spawning(t);const result=await launchNativeFactory({packageText:serialized(notebook())},{...options,...fake});assert.equal(result.launched,true);assert.equal(result.missionCount,1);assert.equal(fake.calls.length,1);const call=fake.calls[0];assert.equal(call.options.shell,false);assert.equal(call.options.env.ELECTRON_RUN_AS_NODE,'1');assert.equal(call.executable,path.join(options.runtimeDirectory,'Asterloom Native Factory.exe'));assert.equal(call.args[0],'--');assert.equal(call.args[2],`--node=${process.execPath}`);const filename=call.args[1].slice('--mission-pack='.length);assert.equal(path.dirname(filename),nativeNotebookPaths(options.userData,'native-launch-fixture').games);const pack=JSON.parse(await fs.readFile(filename,'utf8'));assert.equal(pack.format,'asterloom-godot-factory');assert.equal(pack.missions[0].scaffoldId,'process-reconstruction');assert.equal(pack.notebook.activities[0].reviewStatus,'reviewed');assert.deepEqual((await fs.readdir(path.dirname(filename))).filter(name=>name.endsWith('.tmp')),[]);});

test('draft native games retain author review state and cannot approve themselves',async t=>{const options=await setup(t),fake=spawning(t);await launchNativeFactory({packageText:serialized(notebook('needs-review'))},{...options,...fake});const saved=JSON.parse(await fs.readFile(fake.calls[0].args[1].slice(15),'utf8'));assert.equal(saved.notebook.activities[0].reviewStatus,'needs-review');});

test('native launch carries the learner sound mix and motion choice without adding them to the shared game',async t=>{
 const options=await setup(t),fake=spawning(t);
 await launchNativeFactory({packageText:serialized(notebook()),presentation:{musicEnabled:false,effectsEnabled:true,musicVolume:.18,effectsVolume:.4,reducedMotion:true}},{...options,...fake});
 const args=fake.calls[0].args;
 for(const expected of ['--music-enabled=false','--effects-enabled=true','--music-volume=0.18','--effects-volume=0.4','--reduced-motion=true'])assert.ok(args.includes(expected),expected);
 const pack=JSON.parse(await fs.readFile(args[1].slice('--mission-pack='.length),'utf8'));
 assert.equal(pack.presentation,undefined);assert.equal(pack.notebook.presentation,undefined);
});

test('native sound preferences reject malformed input before any launch',async t=>{
 const options=await setup(t),fake=spawning(t),valid={musicEnabled:false,effectsEnabled:true,musicVolume:.18,effectsVolume:.4,reducedMotion:true};
 for(const presentation of [null,{}, {...valid,musicEnabled:'true'},{...valid,musicVolume:NaN},{...valid,effectsVolume:1.1},{...valid,musicVolume:-.1},{...valid,resourcePath:'/untrusted'}])await assert.rejects(launchNativeFactory({packageText:serialized(notebook()),presentation},{...options,...fake}),/sound and motion/);
 assert.equal(fake.calls.length,0);
});

test('legacy source-backed cards reach native recall conversion instead of being rejected at the launcher',async t=>{
 const options=await setup(t),fake=spawning(t),legacy=notebook();
 legacy.scaffoldIds=['recall-escape-mission'];legacy.activities=[];
 legacy.sources=[{id:'dns-source',title:'Network notes',kind:'text',text:'DNS: Resolves domain names to addresses.',status:'ready',addedAt:now}];
 legacy.cards=[{id:'dns-card',prompt:'What resolves names?',answer:'DNS',options:['DNS','Router'],correctIndex:0,sourceId:'dns-source',evidence:legacy.sources[0].text,concept:'DNS',tags:[],explanation:'DNS resolves names.',questionType:'definition',reviewStatus:'reviewed'}];
 const result=await launchNativeFactory({packageText:serialized(legacy)},{...options,...fake});assert.equal(result.launched,true);
 const saved=JSON.parse(await fs.readFile(fake.calls[0].args[1].slice(15),'utf8'));assert.equal(saved.notebook.activities[0].kind,'recall');assert.equal(saved.notebook.cards[0].id,'dns-card');
});

test('renderer cannot supply executable paths, shell flags or an unknown mission',async t=>{const options=await setup(t),fake=spawning(t);for(const extra of [{playerPath:'/bad'},{enginePath:'/bad'},{args:['--bad']},{activityId:'../../bad'},{activityId:'absent'}])await assert.rejects(launchNativeFactory({packageText:serialized(notebook()),...extra},{...options,...fake}));assert.equal(fake.calls.length,0);});

test('changed source evidence is rejected before launch or durable pack write',async t=>{const options=await setup(t),fake=spawning(t),changed=notebook();changed.sources[0].text='This source now describes a different process, with different preparation and interpretation steps.';await assert.rejects(launchNativeFactory({packageText:serialized(changed)},{...options,...fake}));assert.equal(fake.calls.length,0);await assert.rejects(fs.access(path.join(options.userData,'native-games')));});

test('duplicate opening reuses the running game and a later launch can resume after exit',async t=>{const options=await setup(t),fake=spawning(t),request={packageText:serialized(notebook())};await launchNativeFactory(request,{...options,...fake});assert.equal((await launchNativeFactory(request,{...options,...fake})).alreadyRunning,true);assert.equal(fake.calls.length,1);fake.children[0].emit('exit',0);await launchNativeFactory(request,{...options,...fake});assert.equal(fake.calls.length,2);});

test('spawn failure is reported and does not leave a false running session',async t=>{const options=await setup(t),fake=spawning(t),spawnProcess=()=>{const child=new EventEmitter();process.nextTick(()=>child.emit('error',Error('fixture launch failure')));return child;};await assert.rejects(launchNativeFactory({packageText:serialized(notebook())},{...options,spawnProcess}),/fixture launch failure/);assert.equal((await launchNativeFactory({packageText:serialized(notebook())},{...options,...fake})).launched,true);});


test('large original media stays outside the portable JSON and is bound by verified source identity',async t=>{
 const options=await setup(t),bytes=Buffer.alloc(24*1024*1024,7),hash=createHash('sha256').update(bytes).digest('hex'),mediaPath=path.join(options.root,'original.wav');await fs.writeFile(mediaPath,bytes);
 const source={id:'large-audio',title:'Original supplied recording',asset:{id:hash,sha256:hash,size:bytes.length,mime:'audio/wav',name:'original.wav'}};
 const manifest=await writeNativeMediaManifest({sources:[source]},{directory:path.join(options.root,'manifests'),resolveAsset:async()=>({path:mediaPath})});
 const data=JSON.parse(await fs.readFile(manifest,'utf8'));assert.equal(data.assets[0].path,mediaPath);assert.equal(data.assets[0].sha256,hash);assert.equal(data.assets[0].size,24*1024*1024);assert.ok((await fs.stat(manifest)).size<2000,'The manifest must not inline the recording');
 await fs.writeFile(mediaPath,Buffer.alloc(bytes.length,8));await assert.rejects(writeNativeMediaManifest({sources:[source]},{directory:path.join(options.root,'manifests'),resolveAsset:async()=>({path:mediaPath})}),/integrity check/);
});

test('media references require the app-owned resolver and never trust a notebook path',async t=>{
 const options=await setup(t),source={id:'audio',title:'Recording',path:'/untrusted/elsewhere',asset:{sha256:'a'.repeat(64),size:10,mime:'audio/mpeg'}};
 await assert.rejects(writeNativeMediaManifest({sources:[source]},{directory:options.root}),/original recording is unavailable/);
});


test('native deletion refuses an active preview, then clears only its owned files after exit',async t=>{
 const options=await setup(t),fake=spawning(t);await launchNativeFactory({packageText:serialized(notebook())},{...options,...fake});
 const blocked=await clearNativeFactoryNotebook('native-launch-fixture',options);assert.equal(blocked.cleared,false);assert.match(blocked.warnings.join(' '),/Close the native game preview/);
 const paths=nativeNotebookPaths(options.userData,'native-launch-fixture');await fs.access(paths.games);fake.children[0].emit('exit',0);
 const removed=await clearNativeFactoryNotebook('native-launch-fixture',options);assert.equal(removed.cleared,true);await assert.rejects(fs.access(paths.games));
});

test('cleanup and launch hold a reciprocal lock until their operation finishes',async()=>{
 let release,launches=0,clears=0;
 const pending=new Promise(resolve=>{release=resolve;});
 const controller=createNativeFactoryController({}, {launch:async()=>{launches++;return {launched:true};},clear:async()=>{clears++;await pending;return {cleared:true};}});
 const cleanup=controller.clear('notebook');await Promise.resolve();
 assert.match((await controller.launch({})).error,/cleaned up/);assert.equal((await controller.clear('other')).cleared,false);assert.equal(launches,0);assert.equal(clears,1);
 release();assert.equal((await cleanup).cleared,true);assert.equal((await controller.launch({})).launched,true);
 let releaseLaunch;const launching=new Promise(resolve=>{releaseLaunch=resolve;});
 const second=createNativeFactoryController({}, {launch:()=>launching,clear:async()=>{throw Error('Cleanup must not run during launch');}});
 const launched=second.launch({});assert.equal((await second.clear('notebook')).cleared,false);releaseLaunch({launched:true});await launched;
});

test('a durable session write failure closes the spawned process before returning failure',async t=>{
 const options=await setup(t);let killed=false,exited=false;
 const spawnProcess=()=>{const child=new EventEmitter();child.pid=12345;child.kill=signal=>{assert.equal(signal,'SIGKILL');killed=true;setImmediate(()=>{exited=true;child.emit('exit',null,'SIGKILL');});return true;};process.nextTick(()=>child.emit('spawn'));return child;};
 await assert.rejects(launchNativeFactory({packageText:serialized(notebook())},{...options,spawnProcess,persistLease:async()=>{throw Error('Disk full');}}),/was closed/);
 assert.equal(killed,true);assert.equal(exited,true);assert.equal((await clearNativeFactoryNotebook('native-launch-fixture',options)).cleared,true);
});
