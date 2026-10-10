import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';

let server:Server,address:string;
test.beforeAll(async()=>{
 const portrait='data:image/png;base64,'+(await readFile('public/assets/aster/aster-guide.png')).toString('base64');
 const assets=new Map<string,{mime:string;bytes:Buffer}>();
 for(const direction of ['connect','disconnect'])assets.set(`/assets/aster/transitions/${direction}.webm`,{mime:'video/webm',bytes:await readFile(`public/assets/aster/transitions/${direction}.webm`)});
 assets.set('/assets/aster/agentic-aura.png',{mime:'image/png',bytes:await readFile('public/assets/aster/agentic-aura.png')});
 const contents=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import AsterGuide from'./src/components/AsterGuide';import{setAsterPreferences}from'./src/lib/asterGuidePolicy';import{setSoundPreferences,getSoundPreferences,duckMusic}from'./src/lib/music';import{asterTransitionCuePlan}from'./src/lib/actionFeedback';import{scheduleVoice}from'./src/lib/musicSynthesis';
 setAsterPreferences({mode:'quiet',dismissed:[]});const parameters=new URLSearchParams(location.search),qa={contexts:0,voices:[],playing:[],setSoundPreferences,getSoundPreferences};window.transitionQA=qa;const NativeContext=window.AudioContext;
 window.AudioContext=class extends NativeContext{constructor(...args){super(...args);qa.contexts++;qa.context=this;}createOscillator(){const oscillator=super.createOscillator(),entry={start:null,stop:false,frequency:0,videoTime:null},start=oscillator.start.bind(oscillator),stop=oscillator.stop.bind(oscillator);qa.voices.push(entry);oscillator.start=at=>{entry.start=at;entry.frequency=oscillator.frequency.value;entry.videoTime=document.querySelector('video')?.currentTime??null;start(at);};oscillator.stop=at=>{if(at===undefined)entry.stop=true;stop(at);};return oscillator;}};
 document.addEventListener('playing',event=>{if(event.target instanceof HTMLVideoElement)qa.playing.push({direction:event.target.dataset.direction,time:event.target.currentTime});},true);
 const source=()=>{const context=qa.context,buffer=context.createBuffer(1,context.sampleRate*.25,context.sampleRate);for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=Math.sin(i*2*Math.PI*220/context.sampleRate)*.01;const bytes=new Uint8Array(44+buffer.length*2),view=new DataView(bytes.buffer),put=(offset,text)=>[...text].forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));put(0,'RIFF');view.setUint32(4,bytes.length-8,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,context.sampleRate,true);view.setUint32(28,context.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,buffer.length*2,true);for(let i=0;i<buffer.length;i++)view.setInt16(44+i*2,buffer.getChannelData(0)[i]*32767,true);const audio=document.querySelector('audio');audio.src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.play();};
 qa.render=async direction=>{const plan=asterTransitionCuePlan(direction),context=new OfflineAudioContext(1,48000*2,48000);for(const note of plan.notes)scheduleVoice(context,context.destination,note);const samples=(await context.startRendering()).getChannelData(0);let peak=0,sum=0;for(const value of samples){peak=Math.max(peak,Math.abs(value));sum+=value*value;}return{peak,rms:Math.sqrt(sum/samples.length),hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',samples.buffer))).map(n=>n.toString(16).padStart(2,'0')).join('')};};
 function Harness(){const[connected,setConnected]=useState(parameters.get('connected')==='true'),[mounted,setMounted]=useState(true),[count,setCount]=useState(0);useEffect(()=>{qa.connect=setConnected;qa.rerender=()=>setCount(value=>value+1);},[]);return <><main><h1>Aster transition sound</h1><button onClick={()=>setSoundPreferences({enabled:true,volume:.3})}>Enable effects</button><button onClick={()=>setSoundPreferences({enabled:false})}>Mute effects</button><button onClick={()=>setConnected(true)}>Connect mode</button><button onClick={()=>setConnected(false)}>Regular mode</button><button onClick={()=>setMounted(false)}>Leave companion</button><button onClick={source}>Play short source</button><button onClick={()=>duckMusic(true)}>Speech starts</button><button onClick={()=>duckMusic(false)}>Speech ends</button><span>{count}</span><audio aria-label="Short source"/></main>{mounted&&<AsterGuide mode="library" aiConnected={connected} portraitUrl=${JSON.stringify(portrait)}/>}</>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
 const compiled=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:'.qa/aster-transition-audio/bundle',loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=compiled.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=compiled.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Aster transition sound</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 server=createServer((req,res)=>{const pathname=new URL(req.url??'/',address||'http://127.0.0.1').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const asset=assets.get(pathname);if(asset){res.setHeader('Content-Type',asset.mime);res.end(asset.bytes);return;}res.writeHead(pathname==='/favicon.ico'?204:404);res.end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address=`http://127.0.0.1:${(server.address()as any).port}`;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function open(page:Page,query=''){
 const errors:string[]=[],external:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===address)return route.continue();external.push(url.href);return route.abort();});
 await page.goto(address+query);await expect(page.getByRole('heading',{name:'Aster transition sound'})).toBeVisible();return{errors,external};
}
const voices=(page:Page)=>page.evaluate(()=>(window as any).transitionQA.voices as {stop:boolean;videoTime:number;frequency:number}[]);
async function enable(page:Page){await page.getByRole('button',{name:'Enable effects',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).transitionQA.context?.state)).toBe('running');}

test('mode videos stay silent by default, and restored AI mode never replays a transition',async({page})=>{
 const audit=await open(page);await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).transitionQA.playing.length)).toBe(1);expect(await voices(page)).toEqual([]);expect(await page.evaluate(()=>(window as any).transitionQA.contexts)).toBe(0);
 await enable(page);await page.goto(address+'?connected=true');await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','connected');expect(await page.evaluate(()=>(window as any).transitionQA.getSoundPreferences().enabled)).toBe(true);expect(await voices(page)).toEqual([]);expect(await page.evaluate(()=>(window as any).transitionQA.contexts)).toBe(0);await expect(page.locator('video')).toHaveCount(0);expect(audit.errors).toEqual([]);expect(audit.external).toEqual([]);
});
test('actual playing videos start distinct once-only cues and rendered PCM is audible and bounded',async({page},info)=>{
 const audit=await open(page);await enable(page);await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(5);const connected=await voices(page);expect(connected.every(voice=>voice.videoTime>=0&&voice.videoTime<=.25)).toBe(true);
 await page.evaluate(()=>(window as any).transitionQA.rerender());await page.locator('video').dispatchEvent('playing');expect(await voices(page)).toHaveLength(5);await expect(page.locator('video')).toHaveCount(0);
 await page.getByRole('button',{name:'Regular mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(10);const disconnected=(await voices(page)).slice(5);expect(disconnected.slice(0,4).map(v=>v.frequency)).toEqual([...connected.slice(0,4).map(v=>v.frequency)].reverse());
 const rendered=await page.evaluate(async()=>({connect:await(window as any).transitionQA.render('connect'),disconnect:await(window as any).transitionQA.render('disconnect')}));for(const cue of Object.values(rendered)){expect(cue.peak).toBeGreaterThan(.001);expect(cue.peak).toBeLessThan(.3);expect(cue.rms).toBeGreaterThan(.0005);}expect(rendered.connect.hash).not.toBe(rendered.disconnect.hash);await expect(page.locator('video')).toHaveCount(0);
 await writeFile(info.outputPath('transition-sound-proof.json'),JSON.stringify({rendered,voicesStartedAtVideoTime:connected.map(v=>v.videoTime),recordedSpeakerListening:false,errors:audit.errors,externalRequests:audit.external},null,2));expect(audit.errors).toEqual([]);expect(audit.external).toEqual([]);
});
test('reversal, source playback and mute cancel future notes without any delayed replay',async({page})=>{
 const audit=await open(page);await enable(page);await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(5);await page.getByRole('button',{name:'Regular mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(10);expect((await voices(page)).slice(0,5).every(v=>v.stop)).toBe(true);
 await page.getByRole('button',{name:'Play short source',exact:true}).click();await expect.poll(async()=>(await voices(page)).every(v=>v.stop)).toBe(true);await expect.poll(()=>page.locator('audio').evaluate(audio=>(audio as HTMLAudioElement).ended)).toBe(true);await page.waitForTimeout(700);expect(await voices(page)).toHaveLength(10);
 await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(15);await page.getByRole('button',{name:'Mute effects',exact:true}).click();expect((await voices(page)).every(v=>v.stop)).toBe(true);await page.getByRole('button',{name:'Regular mode',exact:true}).click();await page.waitForTimeout(300);expect(await voices(page)).toHaveLength(15);await page.getByRole('button',{name:'Leave companion',exact:true}).click();await expect(page.locator('video')).toHaveCount(0);expect(audit.errors).toEqual([]);expect(audit.external).toEqual([]);
});
test('reduced motion, active speech and canceled waiting video never queue a later cue',async({page})=>{
 const audit=await open(page);await enable(page);await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','connected');await expect(page.locator('video')).toHaveCount(0);expect(await voices(page)).toEqual([]);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'Speech starts',exact:true}).click();await page.getByRole('button',{name:'Regular mode',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).transitionQA.playing.length)).toBe(1);expect(await voices(page)).toEqual([]);await page.getByRole('button',{name:'Speech ends',exact:true}).click();await page.locator('video').dispatchEvent('playing');expect(await voices(page)).toEqual([]);
 await page.getByRole('button',{name:'Connect mode',exact:true}).click();await expect.poll(async()=>(await voices(page)).length).toBe(5);await page.locator('video').dispatchEvent('waiting');expect((await voices(page)).every(v=>v.stop)).toBe(true);await page.locator('video').dispatchEvent('playing');expect(await voices(page)).toHaveLength(5);expect(audit.errors).toEqual([]);expect(audit.external).toEqual([]);
});

test('the app Reduce motion preference suppresses and cancels video plus its sound without replay',async({page})=>{
 const audit=await open(page);await enable(page);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{document.documentElement.dataset.reduced='true';});
 await page.getByRole('button',{name:'Connect mode',exact:true}).click();
 await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','connected');
 await expect(page.locator('video')).toHaveCount(0);expect(await voices(page)).toEqual([]);
 await page.evaluate(()=>{document.documentElement.dataset.reduced='false';});
 await page.waitForTimeout(100);await expect(page.locator('video')).toHaveCount(0);expect(await voices(page)).toEqual([]);
 await page.getByRole('button',{name:'Regular mode',exact:true}).click();
 await expect.poll(async()=>(await voices(page)).length).toBe(5);
 await page.evaluate(()=>{document.documentElement.dataset.reduced='true';});
 await expect(page.locator('video')).toHaveCount(0);
 await expect.poll(async()=>(await voices(page)).every(voice=>voice.stop)).toBe(true);
 await page.evaluate(()=>{document.documentElement.dataset.reduced='false';});
 await page.waitForTimeout(350);await expect(page.locator('video')).toHaveCount(0);expect(await voices(page)).toHaveLength(5);
 expect(await page.evaluate(()=>(window as any).transitionQA.getSoundPreferences().enabled)).toBe(true);
 expect(audit.errors).toEqual([]);expect(audit.external).toEqual([]);
});
