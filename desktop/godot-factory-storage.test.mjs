import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareNativeNotebookStorage,clearNativeNotebookStorage,nativeNotebookPaths,writeNativeLease,nativeLeaseActive} from './godot-factory-storage.mjs';

const pack='a'.repeat(64)+'.json',progress='factory-progress-'+'b'.repeat(24)+'.json',media='00000000-0000-4000-8000-000000000001.json';
async function setup(t){const userData=await fs.mkdtemp(path.join(os.tmpdir(),'native-owned-storage-'));t.after(()=>fs.rm(userData,{recursive:true,force:true}));return userData;}
async function seed(userData,id,sourceId){const paths=await prepareNativeNotebookStorage(userData,id);await fs.writeFile(path.join(paths.games,pack),JSON.stringify({format:'asterloom-godot-factory',notebook:{id,sources:[{id:sourceId,text:'Private source for '+id}]}}));await fs.writeFile(path.join(paths.progress,progress),JSON.stringify({notebookId:id,activities:{sameId:{independent:true}}}));await fs.writeFile(path.join(paths.media,media),JSON.stringify({notebookId:id,assets:[{sourceId}]}));return paths;}

test('deletion removes only the exact notebook-owned packs/progress/media and preserves shared preferences',async t=>{
 const userData=await setup(t),a=await seed(userData,'game-a','shared-source-id'),b=await seed(userData,'game-b','shared-source-id');await fs.writeFile(a.preferences,'sound and motion preferences');
 const before=await Promise.all([b.games,b.progress,b.media].map(async directory=>fs.readFile(path.join(directory,directory===b.games?pack:directory===b.progress?progress:media),'utf8')));
 const result=await clearNativeNotebookStorage('game-a',{userData});assert.equal(result.cleared,true);assert.equal(result.removedFiles,3);
 await assert.rejects(fs.access(a.games));await assert.rejects(fs.access(a.progress));await assert.rejects(fs.access(a.media));assert.equal(await fs.readFile(a.preferences,'utf8'),'sound and motion preferences');
 assert.deepEqual(await Promise.all([b.games,b.progress,b.media].map(async directory=>fs.readFile(path.join(directory,directory===b.games?pack:directory===b.progress?progress:media),'utf8'))),before);
});
test('corrupt files in an explicitly owned namespace are removable without reading their content',async t=>{
 const userData=await setup(t),a=await seed(userData,'corrupt-target','source');for(const [directory,name] of [[a.games,pack],[a.progress,progress],[a.media,media]])await fs.writeFile(path.join(directory,name),'corrupt source-bearing JSON');
 assert.equal((await clearNativeNotebookStorage('corrupt-target',{userData})).cleared,true);
});
test('interrupted assessment source copies are removed only from the selected notebook namespace',async t=>{
 const userData=await setup(t),a=await seed(userData,'scratch-a','same-source'),b=await seed(userData,'scratch-b','same-source');
 for(const paths of [a,b])for(const direction of ['request','response'])await fs.writeFile(path.join(paths.progress,`factory-bridge-123-4-${direction}.json`),'interrupted source data');
 const result=await clearNativeNotebookStorage('scratch-a',{userData});assert.equal(result.cleared,true);assert.equal(result.removedFiles,5);
 await fs.access(path.join(b.progress,'factory-bridge-123-4-request.json'));await fs.access(path.join(b.progress,'factory-bridge-123-4-response.json'));
});
test('a live durable lease blocks cleanup across host restart; an exited PID permits it',async t=>{
 const userData=await setup(t),a=await seed(userData,'live','source'),lease=path.join(a.games,'a'.repeat(64)+'.lease.json');await writeNativeLease(lease,'live',12345);
 assert.equal(await nativeLeaseActive(lease,'live',()=>true),true);
 const blocked=await clearNativeNotebookStorage('live',{userData,processAlive:()=>true});assert.equal(blocked.cleared,false);assert.match(blocked.warnings.join(' '),/Close the native game preview/);assert.equal(blocked.removedFiles,0);await fs.access(path.join(a.games,pack));
 assert.equal((await clearNativeNotebookStorage('live',{userData,processAlive:()=>false})).cleared,true);
});
test('corrupt session leases remain pending rather than risking deletion beneath a running preview',async t=>{
 const userData=await setup(t),a=await seed(userData,'bad-lease','source');await fs.writeFile(path.join(a.games,'a'.repeat(64)+'.lease.json'),'broken');
 const result=await clearNativeNotebookStorage('bad-lease',{userData});assert.equal(result.cleared,false);assert.equal(result.removedFiles,0);await fs.access(path.join(a.games,pack));
});
test('symlink files and namespace directories are never traversed or used for launch storage',async t=>{
 if(process.platform==='win32'){t.skip('Creating symlinks requires optional Windows developer privileges');return;}
 const userData=await setup(t),a=await seed(userData,'link','source'),outside=path.join(userData,'outside.json');await fs.writeFile(outside,'unrelated private data');await fs.unlink(path.join(a.games,pack));await fs.symlink(outside,path.join(a.games,pack));
 assert.equal((await clearNativeNotebookStorage('link',{userData})).cleared,false);assert.equal(await fs.readFile(outside,'utf8'),'unrelated private data');
 const target=nativeNotebookPaths(userData,'linked-directory'),outsideDir=path.join(userData,'elsewhere');await fs.mkdir(outsideDir);await fs.writeFile(path.join(outsideDir,pack),'keep');await fs.symlink(outsideDir,target.games);
 assert.equal((await clearNativeNotebookStorage('linked-directory',{userData})).cleared,false);await assert.rejects(prepareNativeNotebookStorage(userData,'linked-directory'),/ordinary app-owned/);assert.equal(await fs.readFile(path.join(outsideDir,pack),'utf8'),'keep');
});
test('a failed permission boundary reports pending cleanup and never claims full deletion',async t=>{
 if(process.platform==='win32'){t.skip('POSIX directory permissions are not a Windows ACL test');return;}
 const userData=await setup(t),a=await seed(userData,'read-only','source');await fs.chmod(a.games,0o500);t.after(()=>fs.chmod(a.games,0o700).catch(()=>{}));
 const result=await clearNativeNotebookStorage('read-only',{userData});assert.equal(result.cleared,false);assert.ok(result.warnings.length);await fs.access(path.join(a.games,pack));await fs.chmod(a.games,0o700);
 assert.equal((await clearNativeNotebookStorage('read-only',{userData})).cleared,true);
});
test('legacy flat files require explicit ownership; unidentified older content stays visible as pending',async t=>{
 const userData=await setup(t);await prepareNativeNotebookStorage(userData,'legacy');
 await fs.writeFile(path.join(userData,'native-games',pack),JSON.stringify({format:'asterloom-godot-factory',notebook:{id:'legacy'}}));
 await fs.writeFile(path.join(userData,'native-progress',progress),JSON.stringify({notebookId:'legacy'}));
 const unknown='c'.repeat(64)+'.json';await fs.writeFile(path.join(userData,'native-games',unknown),'unidentifiable source copy');
 const result=await clearNativeNotebookStorage('legacy',{userData});assert.equal(result.cleared,false);assert.equal(result.removedFiles,2);assert.match(result.warnings.join(' '),/older native file/);await fs.access(path.join(userData,'native-games',unknown));
});
test('unowned shared scratch from an older preview is preserved with an explicit pending result',async t=>{
 const userData=await setup(t),legacyBridgeDirectory=path.join(userData,'legacy-bridge');await seed(userData,'old-scratch','source');await fs.mkdir(legacyBridgeDirectory);const filename=path.join(legacyBridgeDirectory,'123-4-request.json');await fs.writeFile(filename,'unowned assessment source');
 const result=await clearNativeNotebookStorage('old-scratch',{userData,legacyBridgeDirectory});assert.equal(result.cleared,false);assert.match(result.warnings.join(' '),/older native preview left assessment files/);assert.equal(await fs.readFile(filename,'utf8'),'unowned assessment source');
});
