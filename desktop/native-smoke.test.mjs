import {test} from 'node:test';
import {createHash} from 'node:crypto';
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
// Concurrent renderer QA measured a complete Rosetta workflow at about ten
// minutes before cleanup. Allow fifteen minutes for the whole workflow;
// individual operations keep their own bounded waits and all assertions run.
const emulatedIntel=process.platform==='darwin'&&process.arch==='arm64'&&process.env.ASTERLOOM_SMOKE_ARCH==='x64';
const workflowTimeout=process.platform==='darwin'&&process.env.ASTERLOOM_SMOKE_ARCH==='x64'?900000:360000;
// Rosetta can finish launching a freshly exported Universal app just as the
// default30s debugger-attachment deadline expires. Keep an explicit bound
// for this emulated architecture; native platform launches retain30s.
const launchTimeout=emulatedIntel?90000:30000;
test('desktop studio preserves full player features and launches a separate native preview',{skip:!enabled,timeout:workflowTimeout},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-smoke-'));
  const output=path.join(directory,'exports');await fs.mkdir(output);
  const executable=process.env.ASTERLOOM_SMOKE_APP;
  const args=executable?[]:[path.join(ROOT,'desktop','main.mjs')];
  const env={...process.env,ASTERLOOM_DATA_DIR:path.join(directory,'profiles')};delete env.ELECTRON_RUN_AS_NODE;
  let application,primaryFailure;const nativeProcesses=[];
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
    const localModels=await page.evaluate(()=>fetch('/api/ai/local/status').then(response=>response.json()));
    assert.equal(localModels.localOnly,true);assert.equal(localModels.runtime.supported,true);assert.equal(localModels.runtime.installed,false);
    assert.equal(localModels.models.length,2);assert.ok(localModels.models.every(model=>!model.installed&&!model.ready&&model.qualification.asterChat.status==='untested'&&model.qualification.gameCreation.status==='untested'));
    features.localModels={studioCatalog:true,downloadedAutomatically:false,qualityQualified:false};
    const pdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(pdf.status,200,JSON.stringify(pdf.body));assert.match(pdf.body.source.content,/DNS resolves names to addresses/);assert.equal(pdf.body.source.metadata.pages,1);
    const sourcePdfBytes=Buffer.from(fixturePdf(),'base64'),sourcePdfFile={name:'native-source.pdf',mime:'application/pdf',dataUrl:'data:application/pdf;base64,'+sourcePdfBytes.toString('base64'),size:sourcePdfBytes.length,sha256:createHash('sha256').update(sourcePdfBytes).digest('hex')};
    const sourcePdfRequest={kind:'inline',filename:sourcePdfFile.name,mime:sourcePdfFile.mime,dataUrl:sourcePdfFile.dataUrl,size:sourcePdfFile.size,sha256:sourcePdfFile.sha256};
    await application.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
    assert.deepEqual(await page.evaluate(request=>window.asterloomDesktop.saveSourceMaterial(request),sourcePdfRequest),{status:'canceled',filename:'native-source.pdf'});
    const studioPdfCopy=path.join(directory,'studio-source.pdf');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},studioPdfCopy);
    assert.deepEqual(await page.evaluate(request=>window.asterloomDesktop.saveSourceMaterial(request),sourcePdfRequest),{status:'saved',filename:'studio-source.pdf'});assert.deepEqual(await fs.readFile(studioPdfCopy),sourcePdfBytes);
    assert.equal(health.capabilities.mediaAssets,true);assert.equal(health.capabilities.automaticTranscription,true);
    // This exceeds the legacy JSON import limit and must cross the native protocol as a raw stream.
    const largeAsset=await page.evaluate(async()=>{const bytes=new Uint8Array(24*1024*1024);bytes.set(new TextEncoder().encode('RIFF'),0);new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);bytes.set(new TextEncoder().encode('WAVE'),8);const upload=await fetch('/api/media/assets',{method:'POST',headers:{'X-Media-Name':'large-stream.wav','Content-Type':'audio/wav'},body:new Blob([bytes])});const body=await upload.json();if(!upload.ok)throw new Error(body.error);const head=await fetch('/api/media/assets/'+body.asset.id,{method:'HEAD'});const range=await fetch('/api/media/assets/'+body.asset.id,{headers:{Range:'bytes=0-11'}});return {asset:body.asset,length:head.headers.get('content-length'),rangeStatus:range.status,header:[...new Uint8Array(await range.arrayBuffer())]};});
    assert.equal(largeAsset.asset.size,24*1024*1024);assert.equal(Number(largeAsset.length),largeAsset.asset.size);assert.equal(largeAsset.rangeStatus,206);assert.equal(Buffer.from(largeAsset.header).toString('ascii',0,4),'RIFF');
    const studioRecordingCopy=path.join(directory,'studio-recording.wav');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},studioRecordingCopy);
    assert.deepEqual(await page.evaluate(asset=>window.asterloomDesktop.saveSourceMaterial({kind:'asset',filename:asset.name,asset}),largeAsset.asset),{status:'saved',filename:'studio-recording.wav'});assert.equal(createHash('sha256').update(await fs.readFile(studioRecordingCopy)).digest('hex'),largeAsset.asset.sha256);
    const mediaBytes=await fs.readFile(path.join(ROOT,'server','fixtures','media','jfk.mp3'));
    const speechAsset=await page.evaluate(async bytes=>{const response=await fetch('/api/media/assets',{method:'POST',headers:{'X-Media-Name':'speech.mp3','Content-Type':'audio/mpeg'},body:new Uint8Array(bytes)});return (await response.json()).asset;},[...mediaBytes]);
    assert.ok(speechAsset?.id);const mediaNotebook=structuredClone(fixtureNotebook);mediaNotebook.sources.push({id:'native-speech',title:'Original speech recording',kind:'audio',text:'',status:'needs-transcript',addedAt:'2026-10-03T12:00:00.000Z',asset:speechAsset});const picture=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,240);ctx.fillStyle='black';ctx.font='56px Arial';ctx.fillText('NATIVE EVIDENCE',40,90);ctx.fillText('Visible words stay on this device.',40,170);return canvas.toDataURL('image/png');});mediaNotebook.sources.push({id:'native-ocr-picture',title:'Native OCR picture',kind:'image',text:'',mime:'image/png',dataUrl:picture,status:'needs-transcript',addedAt:'2026-10-03T12:00:00.000Z'});mediaNotebook.sources.push({id:'native-source-pdf',title:'Native source PDF',kind:'document',text:pdf.body.source.content,status:'ready',addedAt:'2026-10-03T12:00:00.000Z',originalFile:sourcePdfFile});const mediaPackage=JSON.stringify({...JSON.parse(fixturePackage),notebook:mediaNotebook});
    const speechJob=await page.evaluate(async assetId=>(await(await fetch('/api/media/transcriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId,model:'base',language:'en'})})).json()).job,speechAsset.id);
    assert.ok(speechJob?.id);const completedSpeech=await waitForTranscription(page,speechJob.id);
    const transcript=completedSpeech.result;assert.match(transcript.text,/what your country can do for you/i);assert.equal(transcript.mediaRevision,speechAsset.id);features.localTranscription={engine:transcript.engine,model:transcript.model,segments:transcript.segments.length};
    const archivePath=path.join(directory,'speech-notebook.learnzip');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},archivePath);
    const archived=await page.evaluate(text=>window.asterloomDesktop.exportNotebookArchive(text),mediaPackage);assert.equal(archived.assetCount,1,JSON.stringify(archived));
    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},archivePath);const restoredArchive=await page.evaluate(()=>window.asterloomDesktop.importNotebookArchive());assert.equal(restoredArchive.assetCount,1,JSON.stringify(restoredArchive));assert.equal(JSON.parse(restoredArchive.packageText).notebook.sources.find(source=>source.id==='native-speech').asset.id,speechAsset.id);
    await page.getByRole('button',{name:'Create a game',exact:true}).last().click();
    await page.getByLabel('Notebook title').fill('Native continuity test');
    await page.getByLabel('Upload source files',{exact:true}).setInputFiles(studioPdfCopy);
    await page.locator('.source-main').filter({hasText:'studio-source.pdf'}).waitFor();
    const studioAsterCopy=path.join(directory,'studio-aster.pdf');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},studioAsterCopy);
    await page.locator('.aster-launcher').click();await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill('download the PDF');await page.getByRole('button',{name:'Find in my sources',exact:true}).click();
    await page.getByRole('region',{name:'Source downloads',exact:true}).getByText('Saved studio-aster.pdf.',{exact:true}).waitFor();assert.deepEqual(await fs.readFile(studioAsterCopy),sourcePdfBytes,'Aster must save the exact uploaded PDF from the native studio');
    await page.getByRole('button',{name:'Close Aster',exact:true}).click();
    features.sourceDownloads={studioAster:true};
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
    await page.getByRole('button',{name:'Source materials',exact:true}).click();
    const materialDialog=page.getByRole('dialog',{name:'Source materials',exact:true}),pdfRow=materialDialog.getByRole('article',{name:'Native source PDF',exact:true});
    for(const [row,button,name,expected] of [[pdfRow,'Download original file','recipient-source.pdf',sourcePdfBytes],[pdfRow,'Download readable text','recipient-source.txt',Buffer.from(pdf.body.source.content)], [materialDialog.getByRole('article',{name:'Original speech recording',exact:true}),'Download original recording','recipient-speech.mp3',mediaBytes]]){
      const destination=path.join(directory,name);await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},destination);
      await row.getByRole('button',{name:button,exact:true}).click();await materialDialog.getByText(`Saved ${name}.`,{exact:true}).waitFor();assert.deepEqual(await fs.readFile(destination),expected,'A standalone game recipient must receive the exact included source bytes');
    }
    await application.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await pdfRow.getByRole('button',{name:'Download readable text',exact:true}).click();await materialDialog.getByText('Save canceled. Your material is still here.',{exact:true}).waitFor();
    await materialDialog.getByRole('button',{name:'Close dialog',exact:true}).click();
    const exportedAsterCopy=path.join(directory,'recipient-aster.pdf');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exportedAsterCopy);
    await page.locator('.aster-launcher').click();await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill('download native-source.pdf');await page.getByRole('button',{name:'Find in my sources',exact:true}).click();
    await page.getByRole('region',{name:'Source downloads',exact:true}).getByText('Saved recipient-aster.pdf.',{exact:true}).waitFor();assert.deepEqual(await fs.readFile(exportedAsterCopy),sourcePdfBytes,'Aster must save the exact included PDF from the standalone game');
    await page.getByRole('button',{name:'Close Aster',exact:true}).click();
    features.sourceDownloads={...features.sourceDownloads,studioInline:true,studioCancel:true,studioStreamed:true,studioRecordingBytes:largeAsset.asset.size,exportOriginal:true,exportText:true,exportRecording:true,exportCancel:true,exportAster:true};
    await page.waitForFunction(()=>document.querySelector('.aster-launcher-portrait img')?.naturalWidth>0);
    const bundledAster=await page.evaluate(async()=>{const response=await fetch('/assets/aster/emotions/provenance.json');const manifest=await response.json();return {count:manifest.assets.length,pending:manifest.pending.length};});
    assert.equal(bundledAster.count,50);assert.equal(bundledAster.pending,0);features.asterArtwork={portraits:50,loadedOffline:true};
    await page.locator('.aster-launcher').click();
    assert.equal(await page.locator('.aster-guide').getAttribute('data-connection'),'local','An exported game starts with regular offline Aster.');
    await page.getByRole('button',{name:'Connect Aster to AI',exact:true}).click();
    const asterConnection=page.getByRole('dialog',{name:'Connect Aster to AI',exact:true});await asterConnection.waitFor();
    assert.match(await asterConnection.innerText(),/Nothing is sent automatically/);
    assert.equal(await asterConnection.getByRole('button',{name:'Enable AI for Aster',exact:true}).isDisabled(),true,'An export must not inherit the creator’s provider selection or account.');
    await asterConnection.getByRole('button',{name:'On this computer',exact:true}).click();
    await asterConnection.getByRole('heading',{name:'Gemma 4 E4B · QAT',exact:true}).waitFor();
    await asterConnection.getByRole('heading',{name:'Gemma 4 12B · QAT',exact:true}).waitFor();
    assert.equal(await asterConnection.getByRole('button',{name:'Enable AI for Aster',exact:true}).isDisabled(),true,'Viewing local candidates must not select or install one.');
    const recipientModels=await page.evaluate(()=>fetch('/api/ai/local/status').then(response=>response.json()));
    assert.equal(recipientModels.job,null);assert.equal(recipientModels.runtime.installed,false);assert.ok(recipientModels.models.every(model=>!model.installed&&!model.ready));
    features.localModels.exportedCatalog=true;features.localModels.recipientOptIn=true;
    await asterConnection.getByRole('button',{name:'Use regular Aster',exact:true}).click();
    assert.equal(await page.locator('.aster-guide').getAttribute('data-connection'),'local');
    const auraBytes=await fs.readFile(path.join(process.cwd(),'public/assets/aster/agentic-aura.png'));
    const auraDigest=await page.evaluate(async()=>{const response=await fetch('/assets/aster/agentic-aura.png');if(!response.ok)throw Error('Bundled connected Aster artwork missing');const bytes=await response.arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');});
    assert.equal(auraDigest,createHash('sha256').update(auraBytes).digest('hex'));
    const transitionProofs=[];
    for(const direction of ['connect','disconnect']){
      const asset=`/assets/aster/transitions/${direction}.webm`,expected=await fs.readFile(path.join(ROOT,'public',asset));
      const proof=await page.evaluate(async asset=>{
        const response=await fetch(asset);if(!response.ok)throw Error('Bundled Aster transition missing');
        const bytes=await response.arrayBuffer(),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
        const video=document.createElement('video');video.muted=true;video.playsInline=true;video.src=asset;document.body.append(video);
        try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Bundled transition could not play')),15000);video.onerror=()=>{clearTimeout(timeout);reject(Error('Bundled transition decode failed'));};video.ontimeupdate=()=>{if(video.currentTime>.15){clearTimeout(timeout);resolve({sha256,mime:response.headers.get('content-type'),width:video.videoWidth,height:video.videoHeight,played:true});}};video.play().catch(error=>{clearTimeout(timeout);reject(error);});});}finally{video.pause();video.remove();}
      },asset);
      assert.equal(proof.sha256,createHash('sha256').update(expected).digest('hex'));assert.equal(proof.mime,'video/webm');assert.equal(proof.width,480);assert.equal(proof.height,640);assert.equal(proof.played,true);transitionProofs.push({direction,...proof});
    }
    features.asterAI={exportedConfigurationAvailable:true,offlineByDefault:true,connectedArtworkBundled:true,transitions:transitionProofs,liveProviderTested:false};
    const bundledSpeech=await page.evaluate(async id=>{const response=await fetch('/api/media/assets/'+id);const bytes=await response.arrayBuffer();return {status:response.status,size:bytes.byteLength,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('')};},speechAsset.id);assert.equal(bundledSpeech.status,200);assert.equal(bundledSpeech.size,mediaBytes.length);assert.equal(bundledSpeech.hash,speechAsset.sha256);
    const exportedHealth=await page.evaluate(()=>fetch('/api/health').then(response=>response.json()));assert.equal(exportedHealth.ok,true);
    const exportedPdf=await page.evaluate(dataBase64=>fetch('/api/import-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'exported-native.pdf',dataBase64})}).then(async response=>({status:response.status,body:await response.json()})),fixturePdf());
    assert.equal(exportedPdf.status,200,JSON.stringify(exportedPdf.body));assert.match(exportedPdf.body.source.content,/DNS resolves names to addresses/);
    const profile=await application.evaluate(({app})=>app.getPath('userData'));assert.match(profile,/games[/\\][a-f0-9]{24}$/);
    assert.equal(await page.getByRole('button',{name:'Native continuity test',exact:true}).count(),0);
    // A generated draft remains explorable, but an author must approve it
    // before correct-looking answers can become scored independent progress.
    assert.equal(await page.evaluate(()=>window.asterloomDesktop.nativeGameAvailable),true,'A packaged desktop release must include the Godot player');
    const nativeProbe=structuredClone(fixtureNotebook);nativeProbe.activities=nativeProbe.activities.slice(0,1);nativeProbe.activities[0].scaffoldIds=['chart-and-data-investigation'];nativeProbe.scaffoldIds=['chart-and-data-investigation'];
    const launchedNative=await page.evaluate(packageText=>window.asterloomDesktop.launchNativeGame({packageText}),JSON.stringify({format:'learnpack',version:1,exportedAt:new Date().toISOString(),notebook:nativeProbe}));
    assert.equal(launchedNative.launched,true,JSON.stringify(launchedNative));
    assert.ok(Number.isInteger(launchedNative.processId));nativeProcesses.push(launchedNative.processId);
    await new Promise(resolve=>setTimeout(resolve,1000));process.kill(launchedNative.processId,0);
    features.godotNativePlayer={launched:true,missionCount:launchedNative.missionCount};
    process.kill(launchedNative.processId,'SIGTERM'); // Deletion later in this flow must not leave a separate preview active.
    await page.locator('[data-activity-id]').filter({hasText:'Preview an unreviewed native model'}).click();
    await page.getByRole('region',{name:'Learning briefing',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Your numerical result',{exact:true}).count(),0,'Teaching must precede the native quest controls');
    await page.getByRole('button',{name:'Explore the source',exact:true}).click();
    const firstSourceQuote=await page.locator('.lesson-source-reader .lesson-passage blockquote').innerText();
    const sourcePassageCount=await page.getByRole('progressbar',{name:'Source passages explored',exact:true}).evaluate(progress=>progress.max);
    assert.equal(sourcePassageCount,1,'This fixture has one complete source passage');
    await page.getByRole('button',{name:'Mark passage 1 explored',exact:true}).click();
    await page.getByRole('button',{name:'Save & return',exact:false}).click();
    const savedLesson=(await readSavedProgress(page,fixtureNotebook.id)).structured['native-unreviewed-lab'].response._draft.lesson;
    assert.equal(savedLesson.stage,'context');assert.equal(savedLesson.viewedPassageIds.length,1,'Only the first source passage was explored before closing the app');
    await application.close();application=await launch(exportedExecutable(exported.path));page=await application.firstWindow();
    await page.getByRole('heading',{name:fixtureNotebook.title,exact:true}).waitFor({timeout:20000});
    await page.locator('[data-activity-id]').filter({hasText:'Preview an unreviewed native model'}).click();
    await page.locator('.lesson-context').waitFor();
    const restoredLesson=(await readSavedProgress(page,fixtureNotebook.id)).structured['native-unreviewed-lab'].response._draft.lesson;
    assert.deepEqual(restoredLesson,savedLesson,'The exact lesson state must survive a native application restart');
    const restoredReadingProgress=await page.getByRole('progressbar',{name:'Source passages explored',exact:true}).evaluate(progress=>({value:progress.value,max:progress.max}));
    assert.deepEqual(restoredReadingProgress,{value:1,max:sourcePassageCount},'The source reader must display the saved explored count');
    await page.getByText(`Passage 1 of ${sourcePassageCount}`,{exact:true}).waitFor();
    await page.getByText('1 explored',{exact:true}).waitFor();
    await page.locator('.lesson-source-reader .lesson-passage.explored').waitFor();
    assert.equal(await page.locator('.lesson-source-reader .lesson-passage blockquote').innerText(),firstSourceQuote,'The explored passage must restore the exact source quote');
    assert.equal(await page.getByRole('button',{name:'Mark passage 1 explored',exact:true}).count(),0,'Explored source context must survive a native application restart');
    assert.equal(await page.getByRole('button',{name:'Study the walkthrough',exact:true}).isEnabled(),true,'The explored source permits the next teaching stage');
    assert.equal(await page.getByLabel('Your numerical result',{exact:true}).count(),0,'The remaining teaching stages still gate the quest');
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
    // The current data workspace uses the compact DOM/SVG arena, with a local
    // environment image. This verifies the shipped surface, not unused Pixi code.
    assert.notEqual(process.env.ASTERLOOM_REQUIRE_PIXI,'1','This workflow exercises the current DOM/SVG mission arena; it does not certify Pixi.');
    const arena=page.locator('.mission-arena.arena-backdrop-only');
    await arena.waitFor();await page.waitForFunction(()=>document.querySelector('.mission-arena')?.getAttribute('data-art-status')==='ready');
    assert.equal(await arena.locator('.arena-environment').evaluate(image=>image.complete&&image.naturalWidth>=800&&image.naturalHeight>=360),true,'The exported game must decode its local environment artwork');
    assert.equal(await arena.locator('.arena-piece:visible').count(),0,'A specialized data editor must not present duplicate inactive scene controls');
    const artwork=[];
    for(const id of ['process-waterworks','sorting-foundry','systems-observatory']){
      const file='assets/world-art/'+id+'.png',expected=await fs.readFile(path.join(ROOT,'public',file));
      const fetched=await page.evaluate(async file=>{const response=await fetch('/'+file),bytes=await response.arrayBuffer();return{status:response.status,mime:response.headers.get('content-type'),bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')};},file);
      assert.equal(fetched.status,200);assert.match(fetched.mime,/^image\/png(?:;|$)/);assert.equal(fetched.bytes,expected.length);assert.equal(fetched.sha256,createHash('sha256').update(expected).digest('hex'));
      assert.deepEqual(await fs.readFile(path.join(exportedResources(exported.path),'app','dist',file)),expected,'A standalone export must preserve every new environment image exactly');
      artwork.push({file,bytes:fetched.bytes,sha256:fetched.sha256});
    }
    features.sceneRenderer='dom-svg-artwork';features.missionArena={mode:'backdrop',artworkDecoded:true,newEnvironmentAssets:artwork};
    console.log('Native mission arena: DOM/SVG, local environment decoded, all three new environment assets verified in the standalone export.');
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
    // Revise the restored answer before checking again; completed work stays locked until an edit.
    await page.getByLabel('Your numerical result',{exact:true}).fill('5');
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
    const cleanupWarnings=await page.locator('.notice').filter({has:page.getByRole('button',{name:'Retry cleanup',exact:true})}).allTextContents();
    assert.deepEqual(cleanupWarnings,[],'Notebook deletion reported unfinished local file cleanup');
    assert.equal(await readSaved(),undefined,'The deleted notebook must be absent before its file cleanup is checked');
    await assert.rejects(()=>fs.access(localRecording),{code:'ENOENT'},'The private recording must be removed');
    await assert.rejects(()=>fs.access(deleteArchive),{code:'ENOENT'},'The selected archive must leave its original location');
    await fs.access(trashArchive);assert.deepEqual(await fs.readFile(originalUpload),wav);
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
    for(const pid of nativeProcesses){try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')cleanupErrors.push(error);}}
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
