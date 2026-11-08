import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {build} from 'esbuild';
import AxeBuilder from '@axe-core/playwright';

const origin='http://127.0.0.1:4898';
const candidates=()=>[
 {id:'gemma4:e4b-it-qat',name:'Gemma 4 E4B',downloadBytes:6.15e9,requiredDiskBytes:7.3e9,recommendedMemoryBytes:8e9,contextTokens:8192,installed:false,ready:false,error:null,license:'Gemma terms',sourceUrl:'https://ollama.com/library/gemma4'},
 {id:'gemma4:12b-it-qat',name:'Gemma 4 12B',downloadBytes:7.15e9,requiredDiskBytes:8.3e9,recommendedMemoryBytes:16e9,contextTokens:8192,installed:false,ready:false,error:null,license:'Gemma terms',sourceUrl:'https://ollama.com/library/gemma4'},
];
const initial=()=>({provider:'local',localOnly:true,runtime:{supported:true,installed:false,installing:false,version:'test-runtime',downloadBytes:500e6,requiredDiskBytes:2e9,error:null},hardware:{platform:'darwin',arch:'arm64',totalMemoryBytes:16e9,freeDiskBytes:20e9},models:candidates(),job:null as any,error:null,lastOperation:null as any});
async function mount(page:Page,info:TestInfo,{state=initial(),images=false,held=false,delayedSetup=false}:{state?:ReturnType<typeof initial>;images?:boolean;held?:boolean;delayedSetup?:boolean}={}){
 const code=`import React from'react';import{createRoot}from'react-dom/client';import ProviderConnection from'./src/components/ProviderConnection';import AsterConnection,{useAsterConnection}from'./src/components/AsterConnection';import{canRequest,useProviderSession}from'./src/lib/providerSession';import'./src/styles.css';
 function Lab(){const[config,setConfig]=useProviderSession(),aster=useAsterConnection();return <main><h1>Local connection fixture</h1><ProviderConnection images={${images}} config={config} onChange={setConfig}/><output aria-label='Selected AI'>{JSON.stringify(config)}</output><output aria-label='AI Aster enabled'>{String(aster.enabled)}</output><button onClick={aster.connect}>Open Aster connection</button><button disabled={!canRequest(config)} onClick={()=>fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config,prompt:'Creation fixture'})})}>Create game with selected model</button></main>;}createRoot(document.getElementById('root')).render(<React.StrictMode><AsterConnection><Lab/></AsterConnection></React.StrictMode>);`;
 const bundle=await build({stdin:{contents:code,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:info.outputPath('bundle'),loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))!.text;
 const html=`<!doctype html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Local model connection fixture</title><style>${css}main{padding:16px;max-width:1050px;margin:auto}output{display:block;overflow-wrap:anywhere}main>button{margin:12px;padding:12px;border:1px solid #456}</style></head><body><div id='root'></div><script type='module'>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 const actions:{path:string;body:any}[]=[],generations:any[]=[],errors:string[]=[],external:string[]=[];let failNext='',heldReply:(()=>Promise<void>)|undefined,releaseSetup:(()=>void)|undefined,statusReads=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(url.href);return route.abort();}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/ai/engines')return route.fulfill({json:{engines:[]}});
  if(url.pathname==='/api/generate'){generations.push(request.postDataJSON());return route.fulfill({json:{text:'fixture'}});}
  if(url.pathname==='/api/ai/local/status'){
   statusReads++;
   if(held){heldReply=()=>route.fulfill({json:state});return;}
   return route.fulfill({json:state});
  }
  if(url.pathname.startsWith('/api/ai/local/')){
   const action=url.pathname.slice('/api/ai/local/'.length),body=request.postDataJSON();actions.push({path:action,body});
   if(action==='models/setup'&&delayedSetup){delayedSetup=false;await new Promise<void>(resolve=>{releaseSetup=resolve;});}
   if(failNext){const message=failNext;failNext='';return route.fulfill({status:503,json:{error:message}});}
   const model=state.models.find(model=>model.id===body.model);
   if(action==='runtime/install')state.job={kind:'runtime',phase:'verifying',completedBytes:500e6,totalBytes:500e6};
   if(action==='models/setup')state.job={kind:'setup',model:body.model,step:state.runtime.installed?'model':'runtime',phase:'downloading',completedBytes:2.1525e9,totalBytes:6.15e9};
   if(action==='models/probe'&&model){model.ready=true;state.job=null;state.lastOperation={kind:'probe',model:body.model,status:'completed'};}
   if(action==='models/remove'&&model){model.installed=false;model.ready=false;state.job=null;}
   if(action==='cancel'){state.job=null;state.lastOperation={kind:'model',status:'canceled'};}
   return route.fulfill({json:state});
  }
  return route.fulfill({status:404,json:{error:'Unimplemented fixture route'}});
 });
 await page.goto(origin);
 return {state,actions,generations,errors,external,get statusReads(){return statusReads;},releaseSetup:()=>releaseSetup?.(),failNext:(message:string)=>{failNext=message;},reply:async()=>{held=false;await heldReply?.();}};
}
const chooseLocal=async(page:Page)=>{await page.getByRole('button',{name:'On this computer',exact:true}).click();await expect(page.getByRole('heading',{name:'AI on this computer',exact:true})).toBeVisible();};
const card=(page:Page,name='Gemma 4 E4B')=>page.getByRole('article',{name,exact:true});

test('one setup action installs and checks the model before sharing its selection with Aster and creation',async({page},info)=>{
 const qa=await mount(page,info);await chooseLocal(page);await expect(card(page).getByRole('button',{name:'Set up & use experimental model',exact:true})).toBeEnabled();
 expect(qa.actions).toEqual([]);await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Endpoint base URL')).toHaveCount(0);await expect(page.getByLabel('Model ID',{exact:true})).toHaveCount(0);
 await expect(card(page)).toContainText('Not quality-tested');await expect(page.getByRole('button',{name:'Create game with selected model'})).toBeDisabled();
 await card(page).getByRole('button',{name:'Set up & use experimental model',exact:true}).click();await expect(page.getByRole('progressbar',{name:'Local model setup progress'})).toHaveAttribute('value','35');await expect(page.getByText('2.2 GB of 6.2 GB')).toBeVisible();expect(qa.actions.map(x=>x.path)).toEqual(['models/setup']);
 await page.getByRole('button',{name:'Cancel setup',exact:true}).click();await expect(page.getByText('Setup canceled. You can retry when ready.')).toBeVisible();
 await card(page).getByRole('button',{name:'Set up & use experimental model',exact:true}).click();qa.state.runtime.installed=true;qa.state.models[0].installed=true;qa.state.job={kind:'setup',model:qa.state.models[0].id,step:'probe',phase:'probing',completedBytes:null,totalBytes:null};await page.getByRole('button',{name:'Retry device check'}).click();await expect(page.getByText('Testing a short local response · Gemma 4 E4B')).toBeVisible();await expect(page.getByRole('button',{name:'Create game with selected model'})).toBeDisabled();
 qa.state.models[0].ready=true;qa.state.job=null;qa.state.lastOperation={kind:'setup',model:qa.state.models[0].id,status:'completed'};await page.getByRole('button',{name:'Retry device check'}).click();
 await expect(card(page)).toContainText('readiness check passed');await expect(card(page)).toContainText('Not quality-tested');await expect(page.getByLabel('Selected AI')).toHaveText(JSON.stringify({provider:'local',apiKey:'',model:'gemma4:e4b-it-qat'}));
 await page.getByRole('button',{name:'Open Aster connection',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Connect Aster to AI',exact:true});await expect(dialog).toContainText('There is no cloud fallback');await expect(dialog.getByRole('button',{name:'Selected for this session'})).toBeVisible();await dialog.getByRole('button',{name:'Enable AI for Aster',exact:true}).click();await expect(page.getByLabel('AI Aster enabled')).toHaveText('true');
 await page.getByRole('button',{name:'Create game with selected model'}).click();await expect.poll(()=>qa.generations.length).toBe(1);expect(qa.generations[0]).toMatchObject({provider:'local',apiKey:'',model:'gemma4:e4b-it-qat'});expect(qa.generations[0].baseUrl).toBeUndefined();expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('gemma4');expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('whole-plan storage, readiness failure and removal never silently switch to the cloud',async({page},info)=>{
 const state=initial();state.hardware.freeDiskBytes=8e9;const qa=await mount(page,info,{state});await chooseLocal(page);await expect(card(page).getByRole('button',{name:'Set up & use experimental model'})).toBeDisabled();await expect(card(page)).toContainText('Needs 9.3 GB free storage');expect(qa.actions).toEqual([]);
 state.hardware.freeDiskBytes=20e9;await page.getByRole('button',{name:'Retry device check'}).click();qa.failNext('The local model could not generate a response. No online provider was used.');await card(page).getByRole('button',{name:'Set up & use experimental model'}).click();await expect(page.getByRole('alert')).toContainText('No online provider was used');await expect(page.getByRole('button',{name:'Create game with selected model'})).toBeDisabled();
 await card(page).getByRole('button',{name:'Retry setup & use experimental model'}).click();state.runtime.installed=true;state.models[0].installed=true;state.models[0].ready=true;state.job=null;state.lastOperation={kind:'setup',model:state.models[0].id,status:'completed'};await page.getByRole('button',{name:'Retry device check'}).click();await expect(card(page).getByRole('button',{name:'Selected for this session'})).toBeVisible();await card(page).getByRole('button',{name:'Remove Gemma 4 E4B download',exact:true}).click();await expect(page.getByRole('button',{name:'Create game with selected model'})).toBeDisabled();await expect(page.getByLabel('Selected AI')).toContainText('"model":""');
 state.runtime.supported=false;await page.getByRole('button',{name:'Retry device check'}).click();await expect(page.getByText('Local AI is not supported on this computer.',{exact:false})).toBeVisible();await expect(card(page).getByRole('button',{name:'Set up & use experimental model'})).toBeDisabled();expect(qa.generations).toEqual([]);expect(qa.errors).toEqual([]);
});

test('late local status cannot replace a newly chosen online provider',async({page},info)=>{
 const state=initial();state.runtime.installed=true;state.models[0].installed=true;state.models[0].ready=true;const qa=await mount(page,info,{state,held:true});await chooseLocal(page);await page.getByRole('button',{name:'Online provider',exact:true}).click();await page.getByRole('combobox',{name:'AI provider',exact:true}).selectOption('anthropic');await page.getByLabel('API key · this session only',{exact:true}).fill('session-only-key');await qa.reply();await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('anthropic');await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveValue('session-only-key');expect(qa.actions).toEqual([]);expect(qa.errors).toEqual([]);
});

test('a setup that finishes after leaving the panel stays available without auto-selection on return',async({page},info)=>{
 const state=initial();const qa=await mount(page,info,{state});await chooseLocal(page);await card(page).getByRole('button',{name:'Set up & use experimental model'}).click();await expect(page.getByRole('progressbar')).toBeVisible();await page.getByRole('button',{name:'Online provider',exact:true}).click();
 state.runtime.installed=true;state.models[0].installed=true;state.models[0].ready=true;state.job=null;state.lastOperation={kind:'setup',model:state.models[0].id,status:'completed'};
 await chooseLocal(page);await expect(card(page).getByRole('button',{name:'Use experimental model',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Create game with selected model'})).toBeDisabled();await expect(page.getByLabel('Selected AI')).toContainText('"model":""');expect(qa.actions.map(action=>action.path)).toEqual(['models/setup']);expect(qa.errors).toEqual([]);
});

test('focus checks during a pending setup request cannot discard its selection intent',async({page},info)=>{
 const qa=await mount(page,info,{delayedSetup:true});await chooseLocal(page);await expect(card(page).getByRole('button',{name:'Set up & use experimental model'})).toBeEnabled();
 await card(page).getByRole('button',{name:'Set up & use experimental model'}).click();await expect.poll(()=>qa.actions.length).toBe(1);const reads=qa.statusReads;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);
 expect(qa.statusReads).toBe(reads);await expect(page.getByRole('alert')).toHaveCount(0);await expect(card(page).getByRole('button',{name:'Setting up Gemma 4 E4B…'})).toBeVisible();
 qa.releaseSetup();await expect(page.getByRole('progressbar',{name:'Local model setup progress'})).toHaveAttribute('value','35');
 qa.state.runtime.installed=true;qa.state.models[0].installed=true;qa.state.models[0].ready=true;qa.state.job=null;qa.state.lastOperation={kind:'setup',model:qa.state.models[0].id,status:'completed'};
 await page.getByRole('button',{name:'Retry device check'}).click();await expect(card(page).getByRole('button',{name:'Selected for this session'})).toBeVisible();expect(qa.errors).toEqual([]);
});

test('model candidates fit narrow screens and expose accessible status and controls',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const state=initial();state.runtime.installed=true;await mount(page,info,{state});await chooseLocal(page);await expect(card(page,'Gemma 4 12B')).toContainText('Memory guidance');expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 const result=await new AxeBuilder({page}).include('.provider-connection').analyze();expect(result.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);await page.screenshot({path:'.qa/local-models-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'.qa/local-models-desktop.png',fullPage:true});
});

test('image connection retains its API controls without local text-model candidates',async({page},info)=>{
 const qa=await mount(page,info,{images:true});await expect(page.getByRole('button',{name:'On this computer'})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Image provider'})).toBeVisible();await expect(page.getByLabel('API key · this session only',{exact:true})).toBeVisible();expect(qa.actions).toEqual([]);expect(qa.errors).toEqual([]);
});
