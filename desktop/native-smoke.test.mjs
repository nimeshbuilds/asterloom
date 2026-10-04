import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enabled=process.env.ASTERLOOM_NATIVE_SMOKE==='1';
const nativeTarget=process.platform==='win32'?'windows':process.arch==='x64'?'mac-intel':'mac';
const exportedExecutable=bundle=>nativeTarget==='windows'?path.join(bundle,'Asterloom.exe'):path.join(bundle,'Contents','MacOS','Asterloom');
const exportedResources=bundle=>nativeTarget==='windows'?path.join(bundle,'resources'):path.join(bundle,'Contents','Resources');
const fixtureNotebook={id:'native-smoke-notebook',title:'Native export verification',description:'An isolated native learning notebook.',createdAt:'2026-10-03T12:00:00.000Z',updatedAt:'2026-10-03T12:00:00.000Z',ageGroup:'adult',goal:'Remember networking facts',theme:'islands',scaffoldIds:['recall-escape-mission'],sources:[{id:'native-source',title:'Network notes',kind:'text',text:'DNS: Resolves domain names to addresses.',status:'ready',addedAt:'2026-10-03T12:00:00.000Z'}],cards:[{id:'native-card',prompt:'What resolves names?',answer:'DNS',options:['DNS','Router'],correctIndex:0,sourceId:'native-source',evidence:'DNS: Resolves domain names to addresses.',concept:'DNS',tags:[],explanation:'DNS resolves names.',questionType:'definition',reviewStatus:'reviewed'}],revision:1};
const fixturePackage=JSON.stringify({format:'learnpack',version:1,exportedAt:'2026-10-03T12:00:00.000Z',notebook:fixtureNotebook});

test('native studio saves across launches, exports a standalone game, and opens its isolated studio',{skip:!enabled,timeout:360000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-smoke-'));
  const output=path.join(directory,'exports');await fs.mkdir(output);
  const executable=process.env.ASTERLOOM_SMOKE_APP;
  const args=executable?[]:[path.join(ROOT,'desktop','main.mjs')];
  const env={...process.env,ASTERLOOM_DATA_DIR:path.join(directory,'profiles')};delete env.ELECTRON_RUN_AS_NODE;
  let application;
  const launch=async(binary=executable)=>electron.launch({...(binary?{executablePath:binary}:{}),args:binary?[]:args,cwd:ROOT,env,timeout:30000});
  try{
    application=await launch();let page=await application.firstWindow();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByRole('heading',{name:'What will you discover today?'}).waitFor({timeout:20000});
    const security=await page.evaluate(()=>({origin:location.origin,require:typeof window.require,bridge:typeof window.asterloomDesktop?.exportGame}));
    assert.equal(security.origin,'asterloom://app');assert.equal(security.require,'undefined');assert.equal(security.bridge,'function');
    const health=await page.evaluate(()=>fetch('/api/health').then(response=>response.json()));assert.equal(health.ok,true);assert.equal(health.capabilities.pdf,true);
    await page.getByRole('button',{name:'Create a world',exact:true}).last().click();
    await page.getByLabel('Notebook title').fill('Native continuity test');
    // Small Windows runner displays trigger the compact layout, which hides
    // this status label visually. Its saved state must still be reached; the
    // following full application restart independently proves persistence.
    await page.locator('.save-state').filter({hasText:'Saved on this device'}).waitFor({state:'attached'});
    await application.close();application=await launch();page=await application.firstWindow();
    await page.getByRole('button',{name:'Native continuity test',exact:true}).waitFor({timeout:20000});
    await fs.mkdir(path.join(ROOT,'.qa'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.qa','native-studio.png'),animations:'disabled'});
    await application.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},output);
    const exported=await page.evaluate(async ({text,target})=>window.asterloomDesktop.exportGame(text,target),{text:fixturePackage,target:nativeTarget});
    assert.ok(exported.path,JSON.stringify(exported));assert.equal(exported.error,undefined);
    await fs.access(path.join(exportedResources(exported.path),'game.learnpack'));
    const embedded=JSON.parse(await fs.readFile(path.join(exportedResources(exported.path),'game.learnpack'),'utf8'));assert.equal(embedded.notebook.id,fixtureNotebook.id);assert.equal(embedded.notebooks,undefined);
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:fixtureNotebook.title,exact:true}).waitFor({timeout:20000});
    const bootstrap=await page.evaluate(()=>({id:window.__ASTERLOOM_NOTEBOOK__?.id,isGame:window.asterloomDesktop?.isExportedGame}));assert.equal(bootstrap.id,fixtureNotebook.id);assert.equal(bootstrap.isGame,true);
    const profile=await application.evaluate(({app})=>app.getPath('userData'));assert.match(profile,/games[/\\][a-f0-9]{24}$/);
    assert.equal(await page.getByRole('button',{name:'Native continuity test',exact:true}).count(),0);
    await page.getByRole('button',{name:'Begin adventure',exact:true}).click();
    await page.locator('.answer-option').filter({hasText:'DNS'}).click();
    await page.getByRole('button',{name:'Save & exit',exact:true}).click();
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('button',{name:'Continue adventure',exact:true}).click();
    assert.match(await page.locator('.answer-option.selected').innerText(),/DNS/);
    await page.getByRole('button',{name:'Check my answer',exact:true}).click();
    await page.getByRole('heading',{name:'You found it.',exact:true}).waitFor();
    await page.getByRole('button',{name:'Complete this chapter',exact:true}).click();
    await page.getByRole('button',{name:'Return to my notebook',exact:true}).click();
    assert.match(await page.locator('.world-statbar').innerText(),/20/);
    await page.getByRole('button',{name:'Open studio',exact:true}).click();
    await page.getByLabel('Notebook title').fill('A remixed native game');
    await page.locator('.save-state').filter({hasText:'Saved on this device'}).waitFor({state:'attached'});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(ROOT,'.qa','native-exported-game.png'),animations:'disabled'});
    await application.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},output);
    await page.getByRole('button',{name:'Export',exact:true}).click();
    await page.getByRole('button',{name:nativeTarget==='windows'?/Windows application bundle/:nativeTarget==='mac-intel'?/macOS · Intel/:/macOS · Apple Silicon/}).click();
    await page.getByText('Preparing your export…').waitFor({state:'hidden',timeout:30000});
    const remixedPath=path.join(output,nativeTarget==='windows'?'A remixed native game - Windows':'A remixed native game.app');
    const remixed=JSON.parse(await fs.readFile(path.join(exportedResources(remixedPath),'game.learnpack'),'utf8'));
    assert.equal(remixed.notebook.title,'A remixed native game');assert.equal(remixed.progress,undefined);
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:'A remixed native game',exact:true}).waitFor({timeout:20000});
    assert.deepEqual(errors,[]);
  }catch(error){
    await fs.mkdir(path.join(ROOT,'.qa'),{recursive:true});
    await application?.windows()[0]?.screenshot({path:path.join(ROOT,'.qa',`native-failure-${process.platform}.png`),animations:'disabled',timeout:5000}).catch(()=>{});
    throw error;
  }finally{if(application)await application.close().catch(()=>{});await fs.rm(directory,{recursive:true,force:true});}
});
