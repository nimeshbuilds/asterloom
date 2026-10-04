import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron as electron} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enabled=process.env.ASTERLOOM_NATIVE_SMOKE==='1';
const nativeTarget=process.platform==='win32'?'windows':process.arch==='x64'?'mac-intel':'mac';
const exportedExecutable=bundle=>nativeTarget==='windows'?path.join(bundle,'Asterloom.exe'):path.join(bundle,'Contents','MacOS','Asterloom');
const exportedResources=bundle=>nativeTarget==='windows'?path.join(bundle,'resources'):path.join(bundle,'Contents','Resources');
const fixtureNotebook={id:'native-smoke-notebook',title:'Native export verification',description:'An isolated native learning notebook.',createdAt:'2026-10-03T12:00:00.000Z',updatedAt:'2026-10-03T12:00:00.000Z',ageGroup:'adult',goal:'Remember networking facts',theme:'islands',scaffoldIds:['recall-escape-mission'],sources:[{id:'native-source',title:'Network notes',kind:'text',text:'DNS: Resolves domain names to addresses.',status:'ready',addedAt:'2026-10-03T12:00:00.000Z'}],cards:[{id:'native-card',prompt:'What resolves names?',answer:'DNS',options:['DNS','Router'],correctIndex:0,sourceId:'native-source',evidence:'DNS: Resolves domain names to addresses.',concept:'DNS',tags:[],explanation:'DNS resolves names.',questionType:'definition',reviewStatus:'reviewed'}],revision:1};
const fixturePackage=JSON.stringify({format:'learnpack',version:1,exportedAt:'2026-10-03T12:00:00.000Z',notebook:fixtureNotebook});
function fixturePdf(){
  const stream='BT /F1 12 Tf 50 750 Td (DNS resolves names to addresses.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n';const offsets=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(value=>`${String(value).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text).toString('base64');
}

test('native studio saves across launches, exports a standalone game, and opens its isolated studio',{skip:!enabled,timeout:360000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-smoke-'));
  const output=path.join(directory,'exports');await fs.mkdir(output);
  const executable=process.env.ASTERLOOM_SMOKE_APP;
  const args=executable?[]:[path.join(ROOT,'desktop','main.mjs')];
  const env={...process.env,ASTERLOOM_DATA_DIR:path.join(directory,'profiles')};delete env.ELECTRON_RUN_AS_NODE;
  let application;
  const errors=[];
  const launch=async(binary=executable)=>{
    const app=await electron.launch({...(binary?{executablePath:binary}:{}),args:binary?[]:args,cwd:ROOT,env,timeout:30000});
    const watched=new WeakSet();
    const watch=page=>{if(!watched.has(page)){watched.add(page);page.on('pageerror',error=>errors.push(error.message));}};
    app.on('window',watch);for(const page of app.windows())watch(page);
    return app;
  };
  try{
    application=await launch();let page=await application.firstWindow();
    await page.getByRole('heading',{name:'What will you discover today?'}).waitFor({timeout:20000});
    const security=await page.evaluate(()=>({origin:location.origin,require:typeof window.require,bridge:typeof window.asterloomDesktop?.exportGame}));
    assert.equal(security.origin,'asterloom://app');assert.equal(security.require,'undefined');assert.equal(security.bridge,'function');
    const health=await page.evaluate(()=>fetch('/api/health').then(response=>response.json()));assert.equal(health.ok,true);assert.equal(health.capabilities.pdf,true);
    const pdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(pdf.status,200,JSON.stringify(pdf.body));assert.match(pdf.body.source.content,/DNS resolves names to addresses/);assert.equal(pdf.body.source.metadata.pages,1);
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
    const exportedPdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'exported-native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(exportedPdf.status,200,JSON.stringify(exportedPdf.body));assert.match(exportedPdf.body.source.content,/DNS resolves names to addresses/);
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
    // A user's Finder can add this presentation attribute to an exported app.
    // Re-exporting must remove it from the new copy without modifying source
    // metadata or stripping security-related quarantine/provenance attributes.
    if(process.platform==='darwin')await promisify(execFile)('/usr/bin/xattr',['-wx','com.apple.FinderInfo','0000000000000000040000000000000000000000000000000000000000000000',exported.path]);
    await application.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},output);
    await page.getByRole('button',{name:'Export',exact:true}).click();
    const remixStarted=Date.now();
    await page.getByRole('button',{name:nativeTarget==='windows'?/Windows application bundle/:nativeTarget==='mac-intel'?/macOS · Intel/:/macOS · Apple Silicon/}).click();
    // The Mac export stages and signs the complete Electron + Tor runtime,
    // then publishes a second copy safely across filesystem volumes. CI disk
    // throughput can exceed Playwright's default 30-second UI wait. This
    // bounded operation must finish without an application error, and its
    // newly created bundle is independently inspected and launched below.
    try{await page.getByText('Preparing your export…').waitFor({state:'hidden',timeout:120000});}
    catch(error){const alerts=await page.getByRole('alert').allTextContents();throw new Error(`Native remix export did not finish after ${Date.now()-remixStarted} ms. Application alerts: ${JSON.stringify(alerts)}`,{cause:error});}
    assert.deepEqual(await page.getByRole('alert').allTextContents(),[],'Native export reported an application error');
    console.log(`Native remix export completed in ${Date.now()-remixStarted} ms`);
    const remixedPath=path.join(output,nativeTarget==='windows'?'A remixed native game - Windows':'A remixed native game.app');
    const remixed=JSON.parse(await fs.readFile(path.join(exportedResources(remixedPath),'game.learnpack'),'utf8'));
    assert.equal(remixed.notebook.title,'A remixed native game');assert.equal(remixed.progress,undefined);
    if(process.platform==='darwin'){
      const originalAttributes=await promisify(execFile)('/usr/bin/xattr',[exported.path]);assert.match(originalAttributes.stdout,/com.apple.FinderInfo/);
      const newAttributes=await promisify(execFile)('/usr/bin/xattr',[remixedPath]);assert.doesNotMatch(newAttributes.stdout,/com.apple.FinderInfo|com.apple.ResourceFork/);
    }
    await application.close();application=await launch(exportedExecutable(remixedPath));page=await application.firstWindow();
    await page.getByRole('heading',{name:'A remixed native game',exact:true}).waitFor({timeout:20000});
    const remixedBootstrap=await page.evaluate(()=>({title:window.__ASTERLOOM_NOTEBOOK__?.title,isGame:window.asterloomDesktop?.isExportedGame}));
    assert.equal(remixedBootstrap.title,'A remixed native game');assert.equal(remixedBootstrap.isGame,true);
    const remixedProfile=await application.evaluate(({app})=>app.getPath('userData'));
    assert.match(remixedProfile,/games[/\\][a-f0-9]{24}$/);assert.notEqual(remixedProfile,profile,'Remixed content must start in its own game profile');
    assert.equal(await page.getByRole('button',{name:'Continue adventure',exact:true}).count(),0,'Original game progress must not travel in a remix');
    assert.deepEqual(errors,[]);
  }catch(error){
    await fs.mkdir(path.join(ROOT,'.qa'),{recursive:true});
    await application?.windows()[0]?.screenshot({path:path.join(ROOT,'.qa',`native-failure-${process.platform}.png`),animations:'disabled',timeout:5000}).catch(()=>{});
    throw error;
  }finally{if(application)await application.close().catch(()=>{});await fs.rm(directory,{recursive:true,force:true});}
});
