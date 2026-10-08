import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron as electron} from 'playwright';
import {nativeTestExecutable,waitForTranscription} from './testing.mjs';
import {learnBeforeQuest} from '../tests/teachingDriver.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enabled=process.env.ASTERLOOM_NATIVE_SMOKE==='1';
let nativeTarget=process.platform==='win32'?'windows':'mac';
const exportedExecutable=bundle=>nativeTarget==='windows'?path.join(bundle,'Asterloom.exe'):path.join(bundle,'Contents','MacOS','Asterloom');
const exportedResources=bundle=>nativeTarget==='windows'?path.join(bundle,'resources'):path.join(bundle,'Contents','Resources');
const fixtureNotebook={id:'native-smoke-notebook',title:'Native export · 知識 🧭',description:'An isolated native learning notebook.',createdAt:'2026-10-03T12:00:00.000Z',updatedAt:'2026-10-03T12:00:00.000Z',ageGroup:'adult',goal:'Remember networking facts',theme:'islands',scaffoldIds:['recall-escape-mission'],sources:[{id:'native-source',title:'Network notes',kind:'text',text:'DNS: Resolves domain names to addresses.',status:'ready',addedAt:'2026-10-03T12:00:00.000Z'}],cards:[{id:'native-card',prompt:'What resolves names?',answer:'DNS',options:['DNS','Router'],correctIndex:0,sourceId:'native-source',evidence:'DNS: Resolves domain names to addresses.',concept:'DNS',tags:[],explanation:'DNS resolves names.',questionType:'definition',reviewStatus:'reviewed'}],revision:1};
const dataEvidence='Prepared native test observations: Site A recorded 4 units and Site B recorded 8 units. The tasks are to total these two observations and find their mean, without making a wider inference.';
fixtureNotebook.sources.push({id:'native-data-source',title:'Recorded observations',kind:'text',text:dataEvidence,status:'ready',addedAt:'2026-10-03T12:00:00.000Z'});
fixtureNotebook.sources.push({id:'native-semantic-source',title:'Water and networks',kind:'text',text:'Evaporation: The process in which liquid water changes into vapor in the air.\nCondensation: The process in which water vapor changes into liquid droplets.\n\nTLS encrypts communication between a client and a server.',status:'ready',addedAt:'2026-10-03T12:00:00.000Z'});
fixtureNotebook.activities=[{version:1,id:'native-data-lab',kind:'data',title:'Investigate the native observations',instruction:'Explore the two observations and calculate their total.',sourceRefs:[{sourceId:'native-data-source',evidence:dataEvidence}],reviewStatus:'reviewed',explanation:'The total describes only the two supplied observations.',hint:'Use both data rows.',datasetTitle:'Recorded observations',limitations:'Two prepared test records; no wider inference.',columns:[{id:'reading',label:'Reading',type:'number',unit:'units'}],rows:[{id:'site-a',label:'Site A',values:{reading:4},evidenceRefs:[0]},{id:'site-b',label:'Site B',values:{reading:8},evidenceRefs:[0]}],chartColumnId:'reading',questions:[{id:'total',prompt:'What is the total recorded value?',operation:'sum',columnId:'reading',filters:[],tolerance:0,requireEvidenceRows:true,reason:'Both observed records contribute to the total.',evidenceRefs:[0]}]}];
// Use a genuinely different rule from the reviewed total. IDs, titles and
// review status alone must never turn one model into two reward entitlements.
fixtureNotebook.activities.push({...structuredClone(fixtureNotebook.activities[0]),id:'native-unreviewed-lab',title:'Preview an unreviewed native model',instruction:'Explore the two observations and calculate their mean.',reviewStatus:'needs-review',explanation:'The mean describes only the two supplied observations.',questions:[{...structuredClone(fixtureNotebook.activities[0].questions[0]),id:'mean',prompt:'What is the mean recorded value?',operation:'mean',reason:'The mean uses both supplied observations.'}]});
const fixturePackage=JSON.stringify({format:'learnpack',version:1,exportedAt:'2026-10-03T12:00:00.000Z',notebook:fixtureNotebook});
async function readSavedProgress(page,notebookId){
  return page.evaluate(id=>new Promise((resolve,reject)=>{const open=indexedDB.open('asterloom-local-v1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const read=db.transaction('records','readonly').objectStore('records').get('progress:'+id);read.onerror=()=>{db.close();reject(read.error);};read.onsuccess=()=>{db.close();resolve(read.result);};};}),notebookId);
}
async function pinDataRecord(page,name){
  await page.getByRole('button',{name:new RegExp('^Inspect '+name+':')}).click();
  const pin=page.getByRole('complementary',{name:'Record inspector'}).getByRole('button',{name:'Pin to this question',exact:true});
  if(await pin.count())await pin.click();
}
function fixturePdf(){
  const stream='BT /F1 12 Tf 50 750 Td (DNS resolves names to addresses.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n';const offsets=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(value=>`${String(value).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text).toString('base64');
}

// Intel emulation includes real speech recognition, OCR, model inference and
// several complete Universal app copies. Give Rosetta its measured headroom;
// individual operations keep their own bounded waits and all assertions run.
const emulatedIntel=process.platform==='darwin'&&process.arch==='arm64'&&process.env.ASTERLOOM_SMOKE_ARCH==='x64';
const workflowTimeout=process.platform==='darwin'&&process.env.ASTERLOOM_SMOKE_ARCH==='x64'?600000:360000;
// Rosetta can finish launching a freshly exported Universal app just as the
// default30s debugger-attachment deadline expires. Keep an explicit bound
// for this emulated architecture; native platform launches retain30s.
const launchTimeout=emulatedIntel?90000:30000;
test('native studio saves across launches, exports a standalone game, and opens its isolated studio',{skip:!enabled,timeout:workflowTimeout},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-smoke-'));
  const output=path.join(directory,'exports');await fs.mkdir(output);
  const executable=process.env.ASTERLOOM_SMOKE_APP;
  const args=executable?[]:[path.join(ROOT,'desktop','main.mjs')];
  const env={...process.env,ASTERLOOM_DATA_DIR:path.join(directory,'profiles')};delete env.ELECTRON_RUN_AS_NODE;
  let application,primaryFailure;
  const errors=[],remoteRequests=[];let features={};
  const launch=async(binary=executable)=>{
    const selected=await nativeTestExecutable(binary,directory);
    const app=await electron.launch({...(selected?{executablePath:selected}:{}),args:binary?[]:args,cwd:ROOT,env,timeout:launchTimeout});
    const watched=new WeakSet();
    const watch=page=>{if(!watched.has(page)){watched.add(page);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))remoteRequests.push(request.url());});}};
    app.on('window',watch);for(const page of app.windows())watch(page);
    return app;
  };
  try{
    application=await launch();let page=await application.firstWindow();
    // The executable may be an Intel app running under Rosetta while this
    // test runner is arm64. Export for the application's actual architecture.
    const actual=await application.evaluate(()=>({platform:process.platform,arch:process.arch}));
    nativeTarget=actual.platform==='win32'?'windows':'mac';
    if(process.env.ASTERLOOM_SMOKE_ARCH)assert.equal(actual.arch,process.env.ASTERLOOM_SMOKE_ARCH);
    features={platform:actual.platform,architecture:actual.arch};
    console.log(`Testing native application ${actual.platform}/${actual.arch}; public export target: ${nativeTarget}`);
    await page.getByRole('heading',{name:'What will you discover today?'}).waitFor({timeout:20000});
    const security=await page.evaluate(()=>({origin:location.origin,require:typeof window.require,bridge:typeof window.asterloomDesktop?.exportGame}));
    assert.equal(security.origin,'asterloom://app');assert.equal(security.require,'undefined');assert.equal(security.bridge,'function');
    const wasm=await page.evaluate(async()=>{try{await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return true;}catch(error){return error.message;}});
    assert.equal(wasm,true,'The native CSP must allow the local WebAssembly retrieval runtime');
    const health=await page.evaluate(()=>fetch('/api/health').then(response=>response.json()));assert.equal(health.ok,true);assert.equal(health.capabilities.pdf,true);
    const pdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(pdf.status,200,JSON.stringify(pdf.body));assert.match(pdf.body.source.content,/DNS resolves names to addresses/);assert.equal(pdf.body.source.metadata.pages,1);
    assert.equal(health.capabilities.mediaAssets,true);assert.equal(health.capabilities.automaticTranscription,true);
    // This exceeds the legacy JSON import limit and must cross the native protocol as a raw stream.
    const largeAsset=await page.evaluate(async()=>{const bytes=new Uint8Array(24*1024*1024);bytes.set(new TextEncoder().encode('RIFF'),0);new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);bytes.set(new TextEncoder().encode('WAVE'),8);const upload=await fetch('/api/media/assets',{method:'POST',headers:{'X-Media-Name':'large-stream.wav','Content-Type':'audio/wav'},body:new Blob([bytes])});const body=await upload.json();if(!upload.ok)throw new Error(body.error);const head=await fetch('/api/media/assets/'+body.asset.id,{method:'HEAD'});const range=await fetch('/api/media/assets/'+body.asset.id,{headers:{Range:'bytes=0-11'}});return {asset:body.asset,length:head.headers.get('content-length'),rangeStatus:range.status,header:[...new Uint8Array(await range.arrayBuffer())]};});
    assert.equal(largeAsset.asset.size,24*1024*1024);assert.equal(Number(largeAsset.length),largeAsset.asset.size);assert.equal(largeAsset.rangeStatus,206);assert.equal(Buffer.from(largeAsset.header).toString('ascii',0,4),'RIFF');
    const mediaBytes=await fs.readFile(path.join(ROOT,'server','fixtures','media','jfk.mp3'));
    const speechAsset=await page.evaluate(async bytes=>{const response=await fetch('/api/media/assets',{method:'POST',headers:{'X-Media-Name':'speech.mp3','Content-Type':'audio/mpeg'},body:new Uint8Array(bytes)});return (await response.json()).asset;},[...mediaBytes]);
    assert.ok(speechAsset?.id);const mediaNotebook=structuredClone(fixtureNotebook);mediaNotebook.sources.push({id:'native-speech',title:'Original speech recording',kind:'audio',text:'',status:'needs-transcript',addedAt:'2026-10-03T12:00:00.000Z',asset:speechAsset});const picture=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,240);ctx.fillStyle='black';ctx.font='56px Arial';ctx.fillText('NATIVE EVIDENCE',40,90);ctx.fillText('Visible words stay on this device.',40,170);return canvas.toDataURL('image/png');});mediaNotebook.sources.push({id:'native-ocr-picture',title:'Native OCR picture',kind:'image',text:'',mime:'image/png',dataUrl:picture,status:'needs-transcript',addedAt:'2026-10-03T12:00:00.000Z'});const mediaPackage=JSON.stringify({...JSON.parse(fixturePackage),notebook:mediaNotebook});
    const speechJob=await page.evaluate(async assetId=>(await(await fetch('/api/media/transcriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId,model:'base',language:'en'})})).json()).job,speechAsset.id);
    assert.ok(speechJob?.id);const completedSpeech=await waitForTranscription(page,speechJob.id);
    const transcript=completedSpeech.result;assert.match(transcript.text,/what your country can do for you/i);assert.equal(transcript.mediaRevision,speechAsset.id);features.localTranscription={engine:transcript.engine,model:transcript.model,segments:transcript.segments.length};
    const archivePath=path.join(directory,'speech-notebook.learnzip');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},archivePath);
    const archived=await page.evaluate(text=>window.asterloomDesktop.exportNotebookArchive(text),mediaPackage);assert.equal(archived.assetCount,1,JSON.stringify(archived));
    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},archivePath);const restoredArchive=await page.evaluate(()=>window.asterloomDesktop.importNotebookArchive());assert.equal(restoredArchive.assetCount,1,JSON.stringify(restoredArchive));assert.equal(JSON.parse(restoredArchive.packageText).notebook.sources.find(source=>source.id==='native-speech').asset.id,speechAsset.id);
    await page.getByRole('button',{name:'Create a game',exact:true}).last().click();
    await page.getByLabel('Notebook title').fill('Native continuity test');
    // Small Windows runner displays trigger the compact layout, which hides
    // this status label visually. Its saved state must still be reached; the
    // following full application restart independently proves persistence.
    await page.locator('.save-state').filter({hasText:'Saved on this device'}).waitFor({state:'attached'});
    await application.close();application=await launch();page=await application.firstWindow();
    await page.getByRole('button',{name:'Native continuity test',exact:true}).waitFor({timeout:20000});
    await fs.mkdir(path.join(ROOT,'.qa'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.qa','native-studio.png'),animations:'disabled'});
    await application.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},output);
    const exported=await page.evaluate(async ({text,target})=>window.asterloomDesktop.exportGame(text,target),{text:mediaPackage,target:nativeTarget});
    assert.ok(exported.path,JSON.stringify(exported));assert.equal(exported.error,undefined);
    await fs.access(path.join(exportedResources(exported.path),'game.learnpack'));
    const embedded=JSON.parse(await fs.readFile(path.join(exportedResources(exported.path),'game.learnpack'),'utf8'));assert.equal(embedded.notebook.id,fixtureNotebook.id);assert.equal(embedded.notebooks,undefined);
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:fixtureNotebook.title,exact:true}).waitFor({timeout:20000});
    const bootstrap=await page.evaluate(()=>({id:window.__ASTERLOOM_NOTEBOOK__?.id,isGame:window.asterloomDesktop?.isExportedGame}));assert.equal(bootstrap.id,fixtureNotebook.id);assert.equal(bootstrap.isGame,true);
    await page.waitForFunction(()=>document.querySelector('.aster-launcher-portrait img')?.naturalWidth>0);
    const bundledAster=await page.evaluate(async()=>{const response=await fetch('/assets/aster/emotions/provenance.json');const manifest=await response.json();return {count:manifest.assets.length,pending:manifest.pending.length};});
    assert.equal(bundledAster.count,50);assert.equal(bundledAster.pending,0);features.asterArtwork={portraits:50,loadedOffline:true};
    const bundledSpeech=await page.evaluate(async id=>{const response=await fetch('/api/media/assets/'+id);const bytes=await response.arrayBuffer();return {status:response.status,size:bytes.byteLength,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('')};},speechAsset.id);assert.equal(bundledSpeech.status,200);assert.equal(bundledSpeech.size,mediaBytes.length);assert.equal(bundledSpeech.hash,speechAsset.sha256);
    const exportedHealth=await page.evaluate(()=>fetch('/api/health').then(response=>response.json()));assert.equal(exportedHealth.ok,true);
    const exportedPdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'exported-native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(exportedPdf.status,200,JSON.stringify(exportedPdf.body));assert.match(exportedPdf.body.source.content,/DNS resolves names to addresses/);
    const profile=await application.evaluate(({app})=>app.getPath('userData'));assert.match(profile,/games[/\\][a-f0-9]{24}$/);
    assert.equal(await page.getByRole('button',{name:'Native continuity test',exact:true}).count(),0);
    // A generated draft remains explorable, but an author must approve it
    // before correct-looking answers can become scored independent progress.
    await page.locator('[data-activity-id]').filter({hasText:'Preview an unreviewed native model'}).click();
    await page.getByRole('region',{name:'Learning briefing',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Your numerical result',{exact:true}).count(),0,'Teaching must precede the native quest controls');
    await page.getByRole('button',{name:'Explore the source',exact:true}).click();
    await page.getByRole('button',{name:'Mark passage 1 explored',exact:true}).click();
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:fixtureNotebook.title,exact:true}).waitFor({timeout:20000});
    await page.locator('[data-activity-id]').filter({hasText:'Preview an unreviewed native model'}).click();
    await page.locator('.lesson-context').waitFor();
    assert.equal(await page.getByRole('button',{name:'Mark passage 1 explored',exact:true}).count(),0,'Explored source context must survive a native application restart');
    await page.getByRole('button',{name:'Passage explored',exact:true}).first().waitFor();
    await learnBeforeQuest(page);features.lessonPersistence={nativeRestart:true,sourcePassageRestored:true,teachingPrecedesQuest:true};
    await page.getByLabel('Your numerical result',{exact:true}).fill('6');
    await pinDataRecord(page,'Site A');
    await pinDataRecord(page,'Site B');
    const draftCheck=page.getByRole('button',{name:'Check my work',exact:true});
    assert.equal(await draftCheck.isEnabled(),true,'An unreviewed model remains available for author preview');
    await draftCheck.click();
    await page.locator('.structured-feedback.draft-preview').filter({hasText:'Mission rules satisfied'}).waitFor();
    assert.match(await page.locator('.model-practice-score').innerText(),/no mastery or competition credit/);
    assert.match(await page.getByRole('region',{name:'Game progress',exact:true}).innerText(),/Model practice score/);
    assert.equal(await page.locator('.structured-feedback.correct').count(),0,'An unreviewed model must not show successful grading');
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:fixtureNotebook.title,exact:true}).waitFor({timeout:20000});
    const unreviewedProgress=await readSavedProgress(page,fixtureNotebook.id);
    assert.equal(unreviewedProgress.xp,0,'An unreviewed model must not award independent XP');
    assert.equal(unreviewedProgress.practice?.xp,20,'Correct model practice earns 20 discovery points after a native restart');
    assert.equal(unreviewedProgress.mastery,0);assert.deepEqual(unreviewedProgress.completedCardIds,[]);assert.deepEqual(unreviewedProgress.independentActivityAwards??{},{});
    assert.deepEqual(Object.values(unreviewedProgress.practice.awards).map(({kind,objectiveId,xp})=>({kind,objectiveId,xp})),[{kind:'activity',objectiveId:'native-unreviewed-lab',xp:20}]);
    const unreviewedRecord=unreviewedProgress.structured['native-unreviewed-lab'];
    assert.equal(unreviewedRecord.completed,false,'Unreviewed completion must remain blocked after restart');
    assert.equal(unreviewedRecord.score,0);assert.equal(unreviewedRecord.review?.independentSuccesses??0,0);
    await page.locator('[data-activity-id]').filter({hasText:'Investigate the native observations'}).click(); await learnBeforeQuest(page);
    await page.locator('.quest-world-map > summary').click();
    await page.waitForFunction(()=>{const scene=document.querySelector('.learning-scene');return scene&&['pixi-webgl','svg-dom'].includes(scene.getAttribute('data-renderer'));},{},{timeout:30000});
    const sceneRenderer=await page.locator('.learning-scene').first().getAttribute('data-renderer');
    if(process.env.ASTERLOOM_REQUIRE_PIXI==='1')assert.equal(sceneRenderer,'pixi-webgl','The native learning scene must initialize Pixi under its production CSP');
    if(sceneRenderer==='pixi-webgl')assert.equal(await page.locator('.learning-scene canvas').first().evaluate(canvas=>canvas.width>0&&canvas.height>0),true);
    features.sceneRenderer=sceneRenderer;
    console.log(`Native learning scene renderer: ${sceneRenderer}`);
    await page.getByLabel('Your numerical result',{exact:true}).fill('12');
    await pinDataRecord(page,'Site A');
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    await page.locator('.campaign-chapter .campaign-task').filter({hasText:'Retrieve the key ideas'}).first().click(); await learnBeforeQuest(page);
    await page.locator('.answer-option').filter({hasText:'DNS'}).click();
    await page.getByRole('button',{name:'Save & exit',exact:true}).click();
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.locator('[data-activity-id]').filter({hasText:'Investigate the native observations'}).click(); await learnBeforeQuest(page);
    assert.equal(await page.getByLabel('Your numerical result',{exact:true}).inputValue(),'12');
    assert.equal(await page.locator('.data-case-file .data-evidence-record').filter({hasText:'Site A'}).count(),1,'Pinned evidence must survive a native restart');
    await pinDataRecord(page,'Site B');
    await page.getByRole('button',{name:'Check my work',exact:true}).click();
    await page.locator('.structured-feedback.correct').waitFor();
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    await page.locator('.campaign-chapter .campaign-task').filter({hasText:'Retrieve the key ideas'}).first().click(); await learnBeforeQuest(page);
    assert.match(await page.locator('.answer-option.selected').innerText(),/DNS/);
    await page.getByRole('button',{name:'Check my answer',exact:true}).click();
    await page.locator('.answer-feedback.success').waitFor();
    assert.equal(await page.locator('.aster-reaction[data-reaction="success"]').count(),1,'A saved correct answer should show the recipe reaction');
    await page.getByRole('button',{name:'Complete this chapter',exact:true}).click();
    await page.getByRole('button',{name:'Return to my notebook',exact:true}).click();
    assert.match(await page.locator('.world-statbar').innerText(),/50\s*Journey XP/,'Distinct supported model20 + model20 + recall10 rewards must be visible');
    assert.match(await page.locator('.world-statbar').innerText(),/0\s*solved independently/,'First-day teaching cannot grant independent mastery');
    const combinedProgress=await readSavedProgress(page,fixtureNotebook.id);
    assert.equal(combinedProgress.xp,0);assert.equal(combinedProgress.practice?.xp,50);assert.equal(combinedProgress.mastery,0);assert.deepEqual(combinedProgress.completedCardIds,[]);assert.deepEqual(combinedProgress.independentActivityAwards??{},{});
    assert.deepEqual(Object.values(combinedProgress.practice.awards).map(({kind,objectiveId,xp})=>({kind,objectiveId,xp})).sort((a,b)=>a.objectiveId.localeCompare(b.objectiveId)),[{kind:'card',objectiveId:'native-card',xp:10},{kind:'activity',objectiveId:'native-data-lab',xp:20},{kind:'activity',objectiveId:'native-unreviewed-lab',xp:20}]);
    assert.equal(combinedProgress.structured['native-data-lab'].review?.independentSuccesses??0,0);assert.equal(combinedProgress.cards['native-card'].successfulReviews,0);
    await page.getByRole('button',{name:'Edit materials',exact:true}).click();
    await page.getByRole('button',{name:'Customize learning & appearance',exact:true}).click();
    await page.getByRole('tab',{name:/Materials/}).click();
    await page.getByText('Advanced editing · focus a lesson on selected passages',{exact:true}).click();
    await page.locator('.evidence-status').filter({hasText:'Local meaning + exact word search ready.'}).waitFor({timeout:120000});
    await page.getByLabel('Search source materials',{exact:true}).fill('Why does a puddle disappear on a sunny day?');
    await page.locator('.evidence-passages article').first().getByText('Meaning match',{exact:true}).waitFor({timeout:30000});
    assert.match(await page.locator('.evidence-passages article').first().innerText(),/Evaporation/,'The bundled model must retrieve relevant source evidence beyond exact words');
    features.semanticStatus=await page.locator('.evidence-status').innerText();
    assert.match(features.semanticStatus,/WASM CPU|WebGPU/);
    await page.locator('.source-main').filter({hasText:'Native OCR picture'}).click();
    await page.getByRole('button',{name:'Read text locally',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Readable learning text"]')?.value.includes('NATIVE EVIDENCE'),{},{timeout:120000});
    features.localOCR=await page.getByLabel('Readable learning text',{exact:true}).inputValue();assert.match(features.localOCR,/Visible words stay on this device/i);
    assert.equal(await page.getByRole('checkbox',{name:/I checked this text against the picture/}).isChecked(),false,'OCR output must remain unreviewed');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    assert.deepEqual(remoteRequests,[],'Local semantic authoring, OCR and game rendering must not request external network resources');
    features.externalRequests=remoteRequests.length;
    console.log(`Native semantic retrieval: ${features.semanticStatus}`);
    await page.getByRole('tab',{name:/Challenges/}).click();
    await page.locator('.activity-library article').filter({hasText:'Preview an unreviewed native model'}).getByRole('button',{name:'Mark reviewed',exact:true}).click();
    await page.getByRole('button',{name:'Play game',exact:true}).click();
    await page.getByRole('button',{name:/Save & (exit|return)/}).waitFor();
    if(await page.getByRole('button',{name:'Save & exit',exact:true}).count())await page.getByRole('button',{name:'Save & exit',exact:true}).click();
    else await page.getByRole('button',{name:'Save & return',exact:false}).click();
    await page.locator('[data-activity-id]').filter({hasText:'Preview an unreviewed native model'}).click(); await learnBeforeQuest(page);
    await page.getByLabel('Your numerical result',{exact:true}).fill('6');
    await pinDataRecord(page,'Site A');
    await pinDataRecord(page,'Site B');
    await page.getByRole('button',{name:'Check my work',exact:true}).click();
    await page.locator('.structured-feedback.correct').waitFor();
    assert.match(await page.locator('.structured-review-banner').innerText(),/0 independent attempts/,'Preserved draft feedback remains supported after author approval');
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    assert.match(await page.locator('.world-statbar').innerText(),/50\s*Journey XP/,'Approving and repeating the same model must not award its discovery points again');
    const approvedProgress=await readSavedProgress(page,fixtureNotebook.id);
    assert.equal(approvedProgress.xp,0);assert.equal(approvedProgress.mastery,0);assert.deepEqual(approvedProgress.completedCardIds,[]);assert.deepEqual(approvedProgress.independentActivityAwards??{},{});
    assert.deepEqual(approvedProgress.practice,combinedProgress.practice,'Author approval and replay must preserve the exact previously committed reward ledger');
    assert.equal(approvedProgress.structured['native-unreviewed-lab'].completed,true);assert.equal(approvedProgress.structured['native-unreviewed-lab'].review?.independentSuccesses??0,0);
    features.practiceRewards={unreviewedAfterRestart:20,combinedJourneyXp:50,afterApprovalJourneyXp:50,approvalLedgerUnchanged:true,independentXp:0,mastery:0};
    await fs.writeFile(path.join(ROOT,'.qa',`native-features-${actual.platform}-${actual.arch}.json`),JSON.stringify(features,null,2));
    await page.getByRole('button',{name:'Edit materials',exact:true}).click();
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
    await page.getByRole('button',{name:nativeTarget==='windows'?/Windows (?:application bundle|app)/:/Mac app/}).click();
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
    assert.equal(await page.getByRole('button',{name:'Continue game',exact:true}).count(),0,'Original game progress must not travel in a remix');
    // Delete only the temporary remixed fixture. The test intercepts the OS
    // Trash boundary and moves this one registered archive into its own temp
    // directory; no real user's app, upload, profile or Trash is touched.
    await page.getByRole('button',{name:'Edit materials',exact:true}).click();
    const originalUpload=path.join(directory,'delete-me.wav'),wav=Buffer.alloc(84);wav.write('RIFF');wav.writeUInt32LE(76,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(40,40);wav.writeInt16LE(123,44);await fs.writeFile(originalUpload,wav);
    await page.getByLabel('Upload source files',{exact:true}).setInputFiles(originalUpload);
    await page.locator('.source-main').filter({hasText:'delete-me.wav'}).waitFor();
    const recordingDialog=page.getByRole('dialog',{name:'delete-me.wav',exact:true});await recordingDialog.waitFor();
    await recordingDialog.getByRole('button',{name:'Done',exact:true}).click();
    const readSaved=()=>page.evaluate(id=>new Promise((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('records','readonly').objectStore('records').get('notebook:'+id);q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};request.onerror=()=>reject(request.error);}),fixtureNotebook.id);
    let localNotebook;for(let attempt=0;attempt<40;attempt++){localNotebook=await readSaved();if(localNotebook?.sources.some(source=>source.asset?.name==='delete-me.wav'))break;await new Promise(resolve=>setTimeout(resolve,100));}
    const localAsset=localNotebook?.sources.find(source=>source.asset?.name==='delete-me.wav')?.asset;assert.ok(localAsset,'The uploaded recording must be durably linked before deletion');
    const localRecording=path.join(remixedProfile,'service','media','assets',localAsset.id);await fs.access(localRecording);
    const deleteArchive=path.join(directory,'delete-native-archive.learnzip'),trashArchive=path.join(directory,'test-trash.learnzip');
    await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},deleteArchive);
    const deletePackage=JSON.stringify({format:'learnpack',version:1,exportedAt:new Date().toISOString(),notebook:localNotebook});
    const deletionArchive=await page.evaluate(text=>window.asterloomDesktop.exportNotebookArchive(text),deletePackage);assert.equal(deletionArchive.path,deleteArchive,JSON.stringify(deletionArchive));
    await application.evaluate(({shell},{expected,destination})=>{shell.trashItem=async filename=>{if(filename!==expected)throw new Error('The test only permits its registered archive');await process.getBuiltinModule('fs').promises.rename(filename,destination);};},{expected:await fs.realpath(deleteArchive),destination:trashArchive});
    await page.getByRole('button',{name:'Your games',exact:true}).click();
    await page.getByRole('button',{name:'Open A remixed native game',exact:true}).click();
    await page.getByRole('button',{name:'Delete game',exact:true}).click();
    let deletionDialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Delete this game?',exact:true})});
    await deletionDialog.getByRole('button',{name:'Keep game',exact:true}).click();assert.ok(await readSaved());await fs.access(localRecording);await fs.access(deleteArchive);
    await page.getByRole('button',{name:'Delete game',exact:true}).click();deletionDialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Delete this game?',exact:true})});
    await deletionDialog.locator('.delete-exports label').filter({hasText:'delete-native-archive.learnzip'}).getByRole('checkbox').check();
    await deletionDialog.getByRole('button',{name:'Delete game',exact:true}).click();await deletionDialog.waitFor({state:'hidden'});
    await assert.rejects(()=>fs.access(localRecording),{code:'ENOENT'});await assert.rejects(()=>fs.access(deleteArchive),{code:'ENOENT'});await fs.access(trashArchive);assert.deepEqual(await fs.readFile(originalUpload),wav);
    await application.close();application=await launch(exportedExecutable(remixedPath));page=await application.firstWindow();
    await page.getByRole('heading',{name:'What will you discover today?'}).waitFor({timeout:20000});
    assert.equal(await readSaved(),undefined,'Deleted embedded notebooks must not return after a real native restart');
    assert.equal(await page.locator('.notebook-card').count(),0,'Deleting the last game must not automatically add sample games');
    features.deletion={cancelPreserved:true,privateRecordingRemoved:true,originalUploadPreserved:true,trackedArchiveMoved:true,trashBoundary:'isolated test adapter',embeddedReseedBlocked:true};
    await fs.writeFile(path.join(ROOT,'.qa',`native-features-${actual.platform}-${actual.arch}.json`),JSON.stringify(features,null,2));
    assert.deepEqual(errors,[]);
    console.log('Native product workflow verified; closing the final application and removing isolated test files.');
  }catch(error){
    primaryFailure=error;
    await fs.mkdir(path.join(ROOT,'.qa'),{recursive:true});
    await application?.windows()[0]?.screenshot({path:path.join(ROOT,'.qa',`native-failure-${process.platform}.png`),animations:'disabled',timeout:5000}).catch(()=>{});
    throw error;
  }finally{
    const cleanupErrors=[];
    try{if(application)await application.close();}catch(error){cleanupErrors.push(error);}
    // Windows can retain a short executable lock after Electron's main process
    // exits (for example in a renderer/helper or virus scanner). Retry only
    // Node's recognized transient filesystem errors, for a bounded 19.5 s.
    try{await fs.rm(directory,{recursive:true,force:true,maxRetries:12,retryDelay:250});}catch(error){cleanupErrors.push(error);}
    if(cleanupErrors.length){
      const cleanupFailure=new AggregateError(cleanupErrors,'Native test cleanup failed after application shutdown.');
      if(primaryFailure)console.error(cleanupFailure);else throw cleanupFailure;
    }
  }
});
