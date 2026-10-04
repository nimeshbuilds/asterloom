import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGameBundle,findTemplate,loadEmbeddedGame,readGame,safeTitle} from './bundles.mjs';

let root,mac,windows,out;
const now='2026-10-03T12:00:00.000Z';
const notebook={id:'notebook-test',title:'Networks / a learning adventure',description:'Explore networking',createdAt:now,updatedAt:now,ageGroup:'adult',goal:'Understand networking',theme:'aurora',scaffoldIds:['recall'],sources:[{id:'source-one',title:'Notes',kind:'text',text:'DNS: Resolves domain names to addresses.',status:'ready',addedAt:now}],cards:[{id:'card-one',prompt:'What resolves names?',answer:'DNS',options:['DNS','Router'],correctIndex:0,sourceId:'source-one',evidence:'DNS: Resolves domain names to addresses.',concept:'DNS',tags:[],explanation:'DNS resolves names.',questionType:'definition',reviewStatus:'reviewed'}],revision:1};
const pack=(value=notebook)=>JSON.stringify({format:'learnpack',version:1,exportedAt:now,notebook:value});
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-desktop-test-'));mac=path.join(root,'Asterloom-darwin-arm64','Asterloom.app');windows=path.join(root,'Asterloom-win32-x64');out=path.join(root,'exports');
  await fs.mkdir(path.join(mac,'Contents','MacOS'),{recursive:true});await fs.mkdir(path.join(mac,'Contents','Resources','app','desktop'),{recursive:true});await fs.writeFile(path.join(mac,'Contents','MacOS','Asterloom'),'fixture',{mode:0o755});await fs.writeFile(path.join(mac,'Contents','Resources','app','desktop','main.mjs'),'// fixture');
  await fs.mkdir(path.join(windows,'resources','app','desktop'),{recursive:true});await fs.writeFile(path.join(windows,'Asterloom.exe'),'fixture');await fs.writeFile(path.join(windows,'resources','app','desktop','main.mjs'),'// fixture');await fs.mkdir(out);
});
after(async()=>{await fs.rm(root,{recursive:true,force:true});});
test('game validation preserves exactly one notebook and excludes credentials and local progress',()=>{
  const parsed=readGame(JSON.stringify({format:'learnpack',version:1,exportedAt:now,apiKey:'private-key',progress:{xp:999},notebooks:[notebook],notebook:{...notebook,providerKey:'another-secret',privateSettings:{token:'secret'}}}));
  assert.equal(parsed.notebook.id,notebook.id);assert.equal(parsed.identity.length,24);assert.ok(!parsed.packageText.includes('private-key'));assert.ok(!parsed.packageText.includes('another-secret'));assert.ok(!parsed.packageText.includes('privateSettings'));assert.equal(JSON.parse(parsed.packageText).notebooks,undefined);
});
test('package identity is stable across export timestamps and differs across content revisions',()=>{
  const first=readGame(pack());const differentTime=readGame(JSON.stringify({format:'learnpack',version:1,exportedAt:'2026-10-04T12:00:00.000Z',notebook}));assert.equal(first.identity,differentTime.identity);
  assert.notEqual(first.identity,readGame(pack({...notebook,title:'Changed title',revision:2})).identity);
});
test('unsafe or unsupported package content is rejected before file creation',()=>{
  assert.throws(()=>readGame('bad-json'));
  assert.throws(()=>readGame(pack({...notebook,sources:[{...notebook.sources[0],dataUrl:'data:text/html;base64,PHNjcmlwdD4='}]})));
  assert.throws(()=>readGame(pack({...notebook,cards:[{...notebook.cards[0],evidence:'Evidence absent from source'}]})));
});
test('template discovery only returns a bundle containing the expected executable',async()=>{
  assert.equal(await findTemplate('mac',[root]),mac);assert.equal(await findTemplate('windows',[root]),windows);assert.equal(await findTemplate('mac',[out]),null);
});
test('Mac export carries the single notebook and preserves original runtime files',async()=>{
  const result=await createGameBundle({packageText:pack(),target:'mac',template:mac,destination:out,sign:false});
  assert.ok(result.path.endsWith('.app'));assert.ok(path.basename(result.path).startsWith('Networks'));
  const game=await loadEmbeddedGame(path.join(result.path,'Contents','Resources'));assert.equal(game.notebook.id,notebook.id);assert.equal(game.notebook.cards.length,1);assert.equal(game.identity,result.identity);
  assert.equal(await fs.readFile(path.join(result.path,'Contents','Resources','app','desktop','main.mjs'),'utf8'),'// fixture');assert.equal((await fs.stat(path.join(result.path,'Contents','MacOS','Asterloom'))).mode&0o777,0o755);
  assert.equal(await loadEmbeddedGame(path.join(mac,'Contents','Resources')),null);
});
test('Windows export carries a portable exe folder and repeats never overwrite prior games',async()=>{
  const first=await createGameBundle({packageText:pack(),target:'windows',template:windows,destination:out,sign:false});
  const second=await createGameBundle({packageText:pack(),target:'windows',template:windows,destination:out,sign:false});
  assert.notEqual(first.path,second.path);await fs.access(path.join(first.path,'Asterloom.exe'));
  const game=await loadEmbeddedGame(path.join(first.path,'resources'));assert.equal(game.notebook.sources[0].text,notebook.sources[0].text);
});
test('export cannot recurse inside its source app and filenames remove path separators',async()=>{
  assert.equal(safeTitle('../Bad:/\\name?*'),'..Badname');
  await assert.rejects(createGameBundle({packageText:pack(),target:'mac',template:mac,destination:path.join(mac,'Contents','Resources'),sign:false}),/outside/);
});
