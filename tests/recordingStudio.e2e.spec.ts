import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer,type Server} from 'node:http';
let server:Server,folder:string,address:string;
const mediaHash='a'.repeat(64);
const segments=[{start:0,end:1.5,text:'Packet: A small unit of information.',confidence:.91},{start:1.5,end:3.5,text:'Router: A device that forwards packets.',confidence:.4,uncertain:true}];
const job={id:'job-recording',assetId:mediaHash,mediaRevision:mediaHash,state:'complete',progress:1,stage:'Transcript ready',createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z',result:{segments,text:segments.map(s=>s.text).join('\n'),duration:4,language:'en',engine:'whisper.cpp',model:'small',mediaRevision:mediaHash}};
function silentWav(){const data=Buffer.alloc(44+8000*4*2);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);return data;}
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'asterloom-recording-draft-'));
 await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import RecordingStudio from './src/components/RecordingStudio';import{normalizeMediaTranscript,prepareTranscriptSource}from'./src/lib/mediaTranscript';import{captureOriginalFile}from'./src/lib/originalFiles';import{parsePackage,serializePackage}from'./src/lib/package';import{createNotebook}from'./src/lib/utils';
 const hash=${JSON.stringify(mediaHash)},mode=new URLSearchParams(location.search).get('mode')||'asr';
 const source={id:'recording',title:'Network lesson.wav',kind:mode==='audio-only-video'?'video':'audio',mime:'audio/wav',asset:{id:hash,name:'Network lesson.wav',mime:'audio/wav',sha256:hash,size:64044,duration:4},text:'',status:'needs-transcript',addedAt:'2026-10-04T00:00:00Z'};
 const notes='Packet: A small unit of information.\\nRouter: A device that forwards packets.';
 const companion=prepareTranscriptSource(source,mode==='vtt'?{format:'vtt',text:'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.500\\nPacket: A small unit of information.\\n\\n00:00:01.500 --> 00:00:03.500\\nRouter: A device that forwards packets.'}:{format:'plain',text:notes},{mediaRevision:hash,duration:4,title:'Saved captions'});
 if(mode==='vtt')companion.originalFile=await captureOriginalFile(new File(['WEBVTT\\n\\n00:00:00.000 --> 00:00:01.500\\nPacket: A small unit of information.\\n\\n00:00:01.500 --> 00:00:03.500\\nRouter: A device that forwards packets.'],'saved.vtt',{type:'text/vtt'}));
 const controls=(window as any).recordingTest={prepared:[],errors:[],changes:[],storageWritesBlocked:false};
 const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(controls.storageWritesBlocked&&key.startsWith('asterloom:recording-draft:'))throw new DOMException('Full','QuotaExceededError');return originalSet.call(this,key,value);};
 function Harness(){const[recording,setRecording]=useState(source);const[visible,setVisible]=useState(true);return <><button onClick={()=>setVisible(v=>!v)}>{visible?'Close recording panel':'Open recording panel'}</button>{visible&&<RecordingStudio notebookId='draft-notebook' source={recording} sources={['estimated','vtt'].includes(mode)?[recording,companion]:[recording]} onChange={s=>{controls.changes.push(s);setRecording(s);}} onPrepare={(input,metadata)=>{const transcript={...prepareTranscriptSource(recording,input,metadata),...(metadata.originalFile?{originalFile:metadata.originalFile}:{})};const restored=metadata.originalFile?parsePackage(serializePackage(createNotebook({sources:[recording,transcript]}))):{sources:[recording,transcript]};controls.prepared.push({input,metadata,restored:restored.sources[1],result:normalizeMediaTranscript(input,{...metadata,mediaSourceId:recording.id})});}} onError={error=>controls.errors.push(error)}/>}</>;}createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',outfile:path.join(folder,'recording.js'),jsx:'automatic',plugins:[{name:'music-only-stub',setup(builder){builder.onResolve({filter:/^\.\.\/lib\/music$/},args=>({path:args.path,namespace:'music-stub'}));builder.onLoad({filter:/.*/,namespace:'music-stub'},()=>({contents:'export const duckMusic=()=>{};',loader:'js'}));}}]});
 const wave=silentWav();
 server=createServer(async(req,res)=>{try{const route=new URL(req.url||'/','http://localhost');if(route.pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><title>Recording correction verification</title><link rel="stylesheet" href="/recording.css"></head><body><div id="root"></div><script type="module" src="/recording.js"></script></body></html>');return;}if(route.pathname==='/api/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({capabilities:{mediaAssets:true}}));return;}if(route.pathname==='/api/media/status'){res.setHeader('content-type','application/json');res.end(JSON.stringify({available:true,maxAssetBytes:2_000_000_000,models:[{id:'small',downloadBytes:500000,installed:true}],jobs:[job]}));return;}if(route.pathname===`/api/media/transcriptions/${job.id}`){res.setHeader('content-type','application/json');res.end(JSON.stringify({job}));return;}if(route.pathname===`/api/media/assets/${mediaHash}`){res.setHeader('content-type','audio/wav');res.setHeader('content-length',wave.length);res.end(wave);return;}const file=route.pathname==='/recording.js'?'recording.js':route.pathname==='/recording.css'?'recording.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address=`http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});

const prepared=async(page:any)=>page.evaluate(()=>(window as any).recordingTest.prepared.at(-1));
test('local corrections and incomplete cue times survive real storage reload without a completed job overwriting them',async({page})=>{
 await page.goto(address);await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue(segments[0].text);
 await page.getByRole('textbox',{name:'Transcript segment 1',exact:true}).fill('Packet: A corrected source statement.');await page.getByLabel('Segment 1 start seconds',{exact:true}).fill('');await page.getByLabel('Segment 1 end seconds',{exact:true}).fill('1.625');
 await page.reload();await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue('Packet: A corrected source statement.');await expect(page.getByLabel('Segment 1 start seconds',{exact:true})).toHaveValue('');await expect(page.getByLabel('Segment 1 end seconds',{exact:true})).toHaveValue('1.625');
 await page.getByRole('button',{name:'Prepare learning draft'}).click();expect(await page.evaluate(()=>(window as any).recordingTest.errors.at(-1))).toContain('enter both start and end');expect(await prepared(page)).toBeUndefined();
 await page.getByLabel('Segment 1 start seconds',{exact:true}).fill('0.125');await page.getByRole('button',{name:'Apply cue times'}).first().click();await page.getByRole('button',{name:'Close recording panel'}).click();await page.getByRole('button',{name:'Open recording panel'}).click();await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue('Packet: A corrected source statement.');await expect(page.getByLabel('Segment 1 start seconds',{exact:true})).toHaveValue('0.125');
 await page.getByRole('button',{name:'Prepare learning draft'}).click();let value=await prepared(page);expect(value.result.transcript).toMatchObject({format:'asr',timing:'provided',edited:true,engine:'whisper.cpp',model:'small'});expect(value.result.transcript.segments[0]).toMatchObject({start:.125,end:1.625,uncertain:true});expect(value.result.transcript.segments[0]).not.toHaveProperty('confidence');
 await page.getByRole('button',{name:'Checked against recording'}).first().click();await page.getByRole('button',{name:'Prepare learning draft'}).click();value=await prepared(page);expect(value.result.transcript.segments[0].uncertain).toBe(false);expect(value.result.transcript.segments[0]).not.toHaveProperty('confidence');
});

test('estimated and uploaded-caption provenance survives choosing a companion and reopening the editor',async({page})=>{
 for(const mode of ['estimated','vtt']){
  await page.goto(`${address}?mode=${mode}`);await expect(page.getByRole('button',{name:'Use Saved captions'})).toBeVisible();await page.getByRole('button',{name:'Use Saved captions'}).click();await page.reload();await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue(segments[0].text);await page.getByRole('button',{name:'Prepare learning draft'}).click();const value=await prepared(page);expect(value.result.transcript).toMatchObject({format:mode==='estimated'?'plain':'vtt',timing:mode==='estimated'?'estimated':'provided',edited:true});expect(value.result.transcript).not.toHaveProperty('engine');expect(value.result.transcript).not.toHaveProperty('model');expect(value.result.warnings.join(' ')).not.toContain('Machine transcript:');
  if(mode==='estimated')expect(value.result.warnings.join(' ')).toContain('does not automatically establish speech alignment');
 }
});

test('storage failure is explicit and retry makes the corrected transcript durable',async({page})=>{
 await page.goto(address);await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue(segments[0].text);await page.evaluate(()=>(window as any).recordingTest.storageWritesBlocked=true);await page.getByRole('textbox',{name:'Transcript segment 1',exact:true}).fill('Packet: These edits need saving.');await expect(page.getByRole('alert')).toContainText('not saved on this device');await expect(page.getByText('Transcript draft needs saving',{exact:true})).toBeVisible();await page.evaluate(()=>(window as any).recordingTest.storageWritesBlocked=false);await page.getByRole('button',{name:'Retry saving transcript edits'}).click();await expect(page.getByRole('alert')).toHaveCount(0);await page.reload();await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveValue('Packet: These edits need saving.');
});

test('a completed job arriving after a manual caption draft keeps the author’s text',async({page})=>{
 let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>release=resolve);await page.route('**/api/media/status',async route=>{await pending;await route.continue();});await page.goto(address);await page.getByRole('textbox',{name:'Transcript or timed captions',exact:true}).fill('A manually supplied transcript remains the selected draft.');release();await expect(page.getByText('A local transcript is ready.',{exact:false})).toBeVisible();await expect(page.getByRole('textbox',{name:'Transcript or timed captions',exact:true})).toHaveValue('A manually supplied transcript remains the selected draft.');await expect(page.getByRole('button',{name:'Load completed transcript and replace these edits'})).toBeVisible();await page.getByRole('button',{name:'Prepare learning draft'}).click();const value=await prepared(page);expect(value.result.transcript.format).toBe('plain');expect(value.result.transcript).not.toHaveProperty('engine');
});


test('a completed job never silently replaces an existing saved caption source',async({page})=>{
 await page.goto(`${address}?mode=vtt`);await expect(page.getByText('A local transcript is ready, and this recording already has a saved transcript.',{exact:false})).toBeVisible();await expect(page.getByRole('textbox',{name:'Transcript or timed captions',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Use Saved captions'}).click();await page.getByRole('button',{name:'Prepare learning draft'}).click();expect((await prepared(page)).result.transcript).toMatchObject({format:'vtt',timing:'provided',edited:true});
});


test('a video container with no decoded visual track shows a persistent diagnostic alongside transcript editing',async({page})=>{
 await page.goto(`${address}?mode=audio-only-video`);await expect(page.locator('.recording-playback-warning')).toContainText('No visible video track was decoded');await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'Transcript segment 1',exact:true}).fill('Packet: A corrected source statement.');await expect(page.locator('.recording-playback-warning')).toBeVisible();await page.getByRole('button',{name:'Prepare learning draft'}).click();expect((await prepared(page)).result.text).toContain('A corrected source statement');
});

test('backend-shaped transcription errors remain readable and retry cannot blank the studio',async({page})=>{
 const failed={...job,state:'error',result:undefined,error:{code:'decode-failed',message:'The local decoder could not read this recording.'}};const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/api/media/status',route=>route.fulfill({json:{available:true,maxAssetBytes:2_000_000_000,models:[{id:'small',downloadBytes:500000,installed:true}],jobs:[failed]}}));
 await page.route(`**/api/media/transcriptions/${job.id}`,route=>route.fulfill({json:{job:failed}}));
 await page.route('**/api/media/transcriptions',route=>route.fulfill({json:{job:failed}}));
 await page.goto(address);await expect(page.getByRole('alert')).toContainText('The local decoder could not read this recording.');await expect(page.getByRole('region',{name:'Recording studio'})).toBeVisible();await page.getByRole('button',{name:'Retry transcription',exact:true}).click();await expect(page.getByRole('alert')).toContainText('The local decoder could not read this recording.');await expect(page.getByRole('textbox',{name:'Transcript or timed captions',exact:true})).toBeVisible();expect(pageErrors).toEqual([]);
});

test('uploaded captions preserve their exact original through draft reload, text correction and portable packaging',async({page})=>{
 const original=Buffer.from('\uFEFF1\r\n00:00:00,000 --> 00:00:01,500\r\nPacket: A small unit of information.\r\n\r\n2\r\n00:00:01,500 --> 00:00:03,500\r\nRouter: A device that forwards packets.\r\n','utf8');
 await page.goto(address);await expect(page.getByRole('textbox',{name:'Transcript segment 1',exact:true})).toBeVisible();
 await page.getByLabel('Upload recording transcript',{exact:true}).setInputFiles({name:'original captions.srt',mimeType:'application/x-subrip',buffer:original});
 const text=page.getByRole('textbox',{name:'Transcript or timed captions',exact:true});await expect(text).toContainText('A small unit of information.');
 await page.reload();await expect(text).toContainText('00:00:00,000 --> 00:00:01,500');
 await text.fill((await text.inputValue()).replace('A small unit of information.','A corrected unit of information.'));
 await page.getByRole('button',{name:'Prepare learning draft',exact:true}).click();
 const saved=await prepared(page);expect(saved.result.text).toContain('A corrected unit of information.');
 expect(saved.metadata.originalFile.name).toBe('original captions.srt');expect(saved.restored.originalFile).toEqual(saved.metadata.originalFile);
 expect(Buffer.from(saved.restored.originalFile.dataUrl.split(',')[1],'base64')).toEqual(original);
 expect(saved.restored.text).not.toContain('-->');
});

test('existing caption originals hydrate older companion drafts while ASR replacement does not claim them',async({page})=>{
 await page.goto(`${address}?mode=vtt`);await page.getByRole('button',{name:'Use Saved captions',exact:true}).click();
 await page.getByRole('textbox',{name:'Transcript segment 1',exact:true}).fill('Packet: An edited companion statement.');
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('asterloom:recording-draft:'))!;const draft=JSON.parse(localStorage.getItem(key)!);delete draft.originalFile;localStorage.setItem(key,JSON.stringify(draft));});
 await page.reload();await page.getByRole('button',{name:'Prepare learning draft',exact:true}).click();
 const saved=await prepared(page);expect(saved.metadata.originalFile.name).toBe('saved.vtt');expect(saved.restored.originalFile).toEqual(saved.metadata.originalFile);expect(saved.result.text).toContain('An edited companion statement.');
 await page.getByRole('button',{name:'Load completed transcript and replace these edits',exact:true}).click();
 await page.getByRole('button',{name:'Prepare learning draft',exact:true}).click();
 const replaced=await prepared(page);expect(replaced.result.transcript.format).toBe('asr');expect(replaced.metadata.originalFile).toBeUndefined();expect(replaced.restored.originalFile).toBeUndefined();
});
