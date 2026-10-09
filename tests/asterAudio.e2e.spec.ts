import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

let html:string;
test.beforeAll(async()=>{
 const portrait='data:image/png;base64,'+(await readFile('public/assets/aster/aster-guide.png')).toString('base64');
 const source=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import AsterGuide from'./src/components/AsterGuide';import{CLEAN_DATA_CONSTRUCTION,COMPOSITION_EXAMPLE_SOURCE}from'./src/lib/compositionExamples';import{setAsterPreferences}from'./src/lib/asterGuidePolicy';import{getSoundPreferences,setSoundPreferences,getMusicRuntimeStatus,duckMusic}from'./src/lib/music';import'./src/styles.css';
 const parameters=new URLSearchParams(location.search),mode=parameters.get('mode')||'creation',preference=parameters.get('preference')||'helpful';setAsterPreferences({mode:preference,dismissed:[]});
 const notebook={id:'aster-audio-notebook',title:'Sound workshop',description:'',ageGroup:'adult',goal:'Understand',theme:'observatory',scaffoldIds:['build-to-specification'],cards:[],activities:[{...CLEAN_DATA_CONSTRUCTION,reviewStatus:'reviewed'}],sources:[COMPOSITION_EXAMPLE_SOURCE],createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z',revision:1};
 window.audioQA={contexts:0,oscillators:0,starts:[],effectLevels:[],assistance:0,held:[],hold:false,getSoundPreferences,getMusicRuntimeStatus};const NativeContext=window.AudioContext;
 window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.audioQA.contexts++;window.audioQA.activeContext=this;this.qaGain=0;}createGain(){const gain=super.createGain();this.qaGain++;if(this.qaGain===2){const target=gain.gain.setTargetAtTime.bind(gain.gain);gain.gain.setTargetAtTime=(value,...args)=>{window.audioQA.effectLevels.push(value);return target(value,...args);};}return gain;}createOscillator(){window.audioQA.oscillators++;const oscillator=super.createOscillator(),start=oscillator.start.bind(oscillator);oscillator.start=(at)=>{window.audioQA.starts.push({at,now:this.currentTime});start(at);};return oscillator;}};
 function Harness(){const[count,setCount]=useState(0),[n,setN]=useState(notebook);useEffect(()=>{window.audioQA.rerender=()=>setCount(value=>value+1);window.audioQA.changeMaterial=()=>setN(previous=>({...previous,sources:[{...COMPOSITION_EXAMPLE_SOURCE,text:'Different current learning evidence.'}]}));},[]);return <><main style={{maxWidth:800,padding:24,minHeight:280}}><h1>Sound workshop</h1><button onClick={()=>setSoundPreferences({enabled:true,volume:.24})}>Enable effects</button><button onClick={()=>setSoundPreferences({enabled:false})}>Mute effects</button><button onClick={()=>setSoundPreferences({volume:0})}>Zero effects volume</button><button onClick={()=>setSoundPreferences({volume:.08})}>Quiet effects volume</button><button onClick={()=>duckMusic(true)}>Prioritize speech</button><button onClick={()=>duckMusic(false)}>Finish speech</button><button onClick={()=>setN(previous=>({...previous,revision:previous.revision+1}))}>Save checkpoint</button><span data-testid="count">{count}</span></main><AsterGuide notebook={n} mode={mode} activityId={mode==='play'?CLEAN_DATA_CONSTRUCTION.id:undefined} creationRunning={parameters.get('running')==='true'} portraitUrl=${JSON.stringify(portrait)} onAssistance={()=>{window.audioQA.assistance++;return window.audioQA.hold?new Promise(resolve=>window.audioQA.held.push(resolve)):true;}}/></>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
 const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:'.qa/aster-audio/bundle',loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=result.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=result.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aster sound verification</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
});
async function open(page:Page,info:TestInfo,parameters:Record<string,string>={}){
 const requests:string[]=[],errors:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});page.on('pageerror',error=>errors.push(error.message));
 await page.context().setOffline(true);const file=info.outputPath('aster-audio.html');await writeFile(file,html);await page.goto(pathToFileURL(file).href+'?'+new URLSearchParams(parameters));await expect(page.getByRole('heading',{name:'Sound workshop',exact:true})).toBeVisible();return{requests,errors};
}
const count=(page:Page)=>page.evaluate(()=>(window as any).audioQA.oscillators as number);
async function settle(page:Page){await page.waitForTimeout(650);}
async function enable(page:Page){await page.getByRole('button',{name:'Enable effects',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).audioQA.activeContext?.state)).toBe('running');}
async function askStatus(page:Page){if(!await page.locator('.aster-chat-tools').evaluate(el=>el.hasAttribute('open')))await page.getByText('Current activity & tools',{exact:true}).click();await page.getByRole('button',{name:'What is happening?',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toBeVisible();}

test('Aster stays silent by default and persisted effects never autoplay an automatic entrance',async({page},info)=>{
 const audit=await open(page,info);await expect(page.locator('.aster-bubble')).toBeVisible();expect(await count(page)).toBe(0);expect(await page.evaluate(()=>(window as any).audioQA.contexts)).toBe(0);
  await page.locator('.aster-launcher').click();await askStatus(page);expect(await count(page)).toBe(0);expect(await page.evaluate(()=>(window as any).audioQA.contexts)).toBe(0);
 await enable(page);await page.reload();await expect(page.locator('.aster-bubble')).toBeVisible();expect(await page.evaluate(()=>(window as any).audioQA.getSoundPreferences())).toEqual({enabled:true,volume:.24});expect(await count(page)).toBe(0);expect(await page.evaluate(()=>(window as any).audioQA.contexts)).toBe(0);expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});

test('an unlocked automatic entrance sounds once, keeps its animation and stays silent on checkpoint rerenders',async({page},info)=>{
 const audit=await open(page,info);await enable(page);await expect(page.locator('.aster-guide')).toHaveAttribute('data-guidance','automatic');expect(await count(page)).toBe(2);await expect(page.locator('.aster-launcher-portrait')).toHaveCSS('animation-name','aster-tip-notice');
 await page.evaluate(()=>(window as any).audioQA.rerender());await expect(page.getByTestId('count')).toHaveText('1');await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await settle(page);expect(await count(page)).toBe(2);expect(await page.evaluate(()=>(window as any).audioQA.getMusicRuntimeStatus().trackId)).toBeNull();
 await page.getByRole('button',{name:'Dismiss Aster tip',exact:true}).click();await settle(page);expect(await count(page)).toBe(2);expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});

test('manual quiet-mode opening and questions have one ordered answer cue; mixer and speech retain control',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});const audit=await open(page,info,{preference:'quiet'});await enable(page);await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await page.getByText('Current activity & tools',{exact:true}).click();expect(await count(page)).toBe(3);await settle(page);
 await askStatus(page);expect(await count(page)).toBe(8);const starts=await page.evaluate(()=>(window as any).audioQA.starts.slice(3));expect(starts).toHaveLength(5);expect(starts[2].at).toBeGreaterThan(starts[1].at+.2);
 await page.evaluate(()=>(window as any).audioQA.rerender());await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await settle(page);expect(await count(page)).toBe(8);
 await page.getByRole('button',{name:'Quiet effects volume',exact:true}).click();await askStatus(page);expect(await count(page)).toBe(13);expect(await page.evaluate(()=>(window as any).audioQA.effectLevels.at(-1))).toBeCloseTo(.08,5);await settle(page);
 await page.getByRole('button',{name:'Prioritize speech',exact:true}).click();await askStatus(page);expect(await count(page)).toBe(13);await page.getByRole('button',{name:'Finish speech',exact:true}).click();await page.getByRole('button',{name:'Zero effects volume',exact:true}).click();await askStatus(page);expect(await count(page)).toBe(13);
 await page.getByRole('button',{name:'Mute effects',exact:true}).click();await askStatus(page);expect(await count(page)).toBe(13);expect(await page.evaluate(()=>(window as any).audioQA.getMusicRuntimeStatus().trackId)).toBeNull();expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});

test('source-answer sounds wait for durable assistance and canceled scopes never sound or reveal an obsolete answer',async({page},info)=>{
 const audit=await open(page,info,{mode:'play',preference:'quiet'});await enable(page);await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await page.getByText('Current activity & tools',{exact:true}).click();await settle(page);await page.evaluate(()=>(window as any).audioQA.hold=true);
 await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill('raw records');await page.getByRole('button',{name:'Find in my sources',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).audioQA.held.length)).toBe(1);expect(await count(page)).toBe(5);await expect(page.locator('.aster-results article')).toHaveCount(0);await settle(page);expect(await count(page)).toBe(5);
 await page.evaluate(()=>(window as any).audioQA.held.shift()(true));await expect(page.locator('.aster-results article').first()).toContainText('raw records');expect(await count(page)).toBe(8);await settle(page);
 await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill('raw records');await page.getByRole('button',{name:'Find in my sources',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).audioQA.held.length)).toBe(1);expect(await count(page)).toBe(10);await page.evaluate(()=>(window as any).audioQA.changeMaterial());await expect(page.locator('.aster-chat-turn').last()).toHaveAttribute('data-status','stopped');await expect(page.getByRole('textbox',{name:'Message Aster',exact:true})).toHaveValue('');await page.evaluate(()=>(window as any).audioQA.held.shift()(true));await settle(page);expect(await count(page)).toBe(10);await expect(page.locator('.aster-results article')).toHaveCount(0);expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});

test('repeated pending hint clicks acknowledge one request and closing Aster cancels its answer cue',async({page},info)=>{
 const audit=await open(page,info,{mode:'play',preference:'quiet'});await enable(page);await page.locator('.aster-launcher').click();await page.getByText('Current activity & tools',{exact:true}).click();await settle(page);await page.evaluate(()=>(window as any).audioQA.hold=true);
 await page.getByRole('button',{name:'Help with this mission',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).audioQA.held.length)).toBe(1);expect(await count(page)).toBe(5);await settle(page);await page.getByRole('button',{name:'Help with this mission',exact:true}).click();expect(await page.evaluate(()=>(window as any).audioQA.held.length)).toBe(1);expect(await count(page)).toBe(5);
 await page.getByRole('button',{name:'Close Aster',exact:true}).click();await page.evaluate(()=>(window as any).audioQA.held.shift()(true));await settle(page);expect(await count(page)).toBe(5);await expect(page.locator('.aster-panel')).toHaveCount(0);expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});

for(const suppression of ['quiet','off','running'])test(`${suppression} never sounds an automatic tip despite enabled effects`,async({page},info)=>{
 const audit=await open(page,info,suppression==='running'?{running:'true'}:{preference:suppression});await enable(page);await page.waitForTimeout(2000);expect(await count(page)).toBe(0);await expect(page.locator('.aster-bubble')).toHaveCount(0);expect(audit.requests).toEqual([]);expect(audit.errors).toEqual([]);
});
