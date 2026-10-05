import {test} from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createExportRegistry} from './export-registry.mjs';
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-export-deletion-'));try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
async function game(root,name){const output=path.join(root,name);await fs.mkdir(path.join(output,'resources'),{recursive:true});await fs.writeFile(path.join(output,'resources','game.learnpack'),'{"original":"notebook"}');return output;}
test('only explicitly selected registered exports are trashed; empty selection is a no-op and another profile is isolated',()=>fixture(async root=>{
 const moved=[],registry=await createExportRegistry({directory:path.join(root,'profile'),trashItem:async p=>moved.push(p)}),other=await createExportRegistry({directory:path.join(root,'other-profile'),trashItem:async()=>assert.fail('other profile')});
 const output=await game(root,'export'),id=await registry.track({notebookId:'one',output,platform:'windows'});assert.equal((await registry.list('one'))[0].available,true);assert.deepEqual(await registry.trash('one',[]),{trashedIds:[],warnings:[]});assert.equal(moved.length,0);
 await assert.rejects(()=>registry.trash('two',[id]),/not owned/);await assert.rejects(()=>registry.trash('one',['../../private']),/listed/);await assert.rejects(()=>other.trash('one',[id]),/not owned/);assert.equal(moved.length,0);
 assert.deepEqual((await registry.trash('one',[id])).trashedIds,[id]);assert.deepEqual(moved,[await fs.realpath(output)]);assert.deepEqual(await registry.list('one'),[]);
}));
test('changed or redirected exports and current application are never deleted',()=>fixture(async root=>{
 const registry=await createExportRegistry({directory:path.join(root,'profile'),trashItem:async()=>assert.fail('unsafe trash')});const output=await game(root,'export'),id=await registry.track({notebookId:'one',output,platform:'windows'});await fs.writeFile(path.join(output,'resources','game.learnpack'),'changed');assert.equal((await registry.list('one'))[0].available,false);await assert.rejects(()=>registry.trash('one',[id]),/changed/);
 const running=await game(root,'running'),own=await createExportRegistry({directory:path.join(root,'profile2'),currentBundle:running,trashItem:async()=>assert.fail('current app')});await assert.rejects(()=>own.track({notebookId:'one',output:running,platform:'windows'}),/running/);
 const outside=await game(root,'outside');await fs.rm(output,{recursive:true});await fs.symlink(outside,output,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>registry.trash('one',[id]),/changed/);assert.ok(await fs.stat(path.join(outside,'resources','game.learnpack')));
}));
test('Trash failure retains registry entries for a later retry without deleting originals',()=>fixture(async root=>{
 const original=path.join(root,'original.wav');await fs.writeFile(original,'user original');const archive=path.join(root,'notebook.learnzip');await fs.writeFile(archive,'archive');let failed=true;
 const registry=await createExportRegistry({directory:path.join(root,'profile'),trashItem:async()=>{if(failed)throw Error('permission');}});const id=await registry.track({notebookId:'one',output:archive,kind:'archive'});assert.equal((await registry.trash('one',[id])).warnings.length,1);assert.equal((await registry.list('one')).length,1);failed=false;assert.deepEqual((await registry.trash('one',[id])).trashedIds,[id]);assert.equal(await fs.readFile(original,'utf8'),'user original');
}));

test('partial Trash retries are idempotent, including an interrupted receipt write',()=>fixture(async root=>{
 const a=path.join(root,'one.learnzip'),b=path.join(root,'two.learnzip');await fs.writeFile(a,'one');await fs.writeFile(b,'two');const realA=await fs.realpath(a),realB=await fs.realpath(b);let failSecond=true;const calls=[];
 const registry=await createExportRegistry({directory:path.join(root,'profile'),trashItem:async p=>{calls.push(p);if(p===realB&&failSecond)throw Error('busy');await fs.rm(p);}});const one=await registry.track({notebookId:'one',output:a,kind:'archive'}),two=await registry.track({notebookId:'one',output:b,kind:'archive'});
 assert.deepEqual((await registry.trash('one',[one,two])).trashedIds,[one]);failSecond=false;assert.deepEqual((await registry.trash('one',[one,two])).trashedIds,[one,two]);assert.equal(calls.filter(p=>p===realA).length,1);assert.deepEqual(await registry.list('one'),[]);
 const c=path.join(root,'already-moved.learnzip');await fs.writeFile(c,'three');const three=await registry.track({notebookId:'one',output:c,kind:'archive'});await fs.rename(c,path.join(root,'test-trash.learnzip'));assert.deepEqual((await registry.trash('one',[three])).trashedIds,[three]);assert.equal(calls.includes(c),false);
}));
