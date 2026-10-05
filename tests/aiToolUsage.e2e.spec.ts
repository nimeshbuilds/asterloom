import {test,expect,type Page,type TestInfo,type Route} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

const origin='http://localhost:48741';
const storageKey='qa:optional-tool-game';
const passage='Training procedure:\n1. Read the packet header.\n2. Forward the packet to the documented destination.';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const unknown={status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null};
const measured={status:'reported',inputTokens:100,outputTokens:30,cachedInputTokens:80,cacheWriteTokens:10,reasoningTokens:7,totalTokens:130};
const imagePartial={...unknown,status:'partial',totalTokens:8};
const activityReply=JSON.stringify({activity:{version:1,id:'assistant-draft',kind:'sequence',title:'Follow the packet procedure',instruction:'Arrange the two supplied steps in order.',explanation:'The supplied procedure explicitly lists this order.',hint:'Read the header before forwarding.',reviewStatus:'needs-review',sourceRefs:[{sourceId:'training-source',evidence:passage}],items:[{id:'read',label:'Read the packet header.'},{id:'forward',label:'Forward the packet to the documented destination.'}],constraints:[{before:'read',after:'forward'}]}});
type Generation={path:string;body:Record<string,unknown>;savedReceipts:any[]};

async function openTools(page:Page,info:TestInfo,respond:(route:Route,request:Generation)=>Promise<void>){
 const contents=`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import ActivityAssistant from'./src/components/ActivityAssistant';import VisualStudio from'./src/components/VisualStudio';import EasyGameSetup from'./src/components/EasyGameSetup';
 import{createNotebook,createSource,downloadFile}from'./src/lib/utils';import{parsePackage,serializePackage}from'./src/lib/package';import{upsertAIUsageReceipt}from'./src/lib/aiUsage';import{setAsterPreferences}from'./src/lib/asterGuidePolicy';import'./src/styles.css';
 const key=${JSON.stringify(storageKey)},source={...createSource(${JSON.stringify(passage)},'Packet handling guide'),id:'training-source'};
 const base=createNotebook({id:'optional-tool-notebook',title:'Optional tools laboratory',sources:[source]});
 const durable=localStorage.getItem(key)?parsePackage(localStorage.getItem(key)):base;
 const qa=window.toolUsage={durable,saveMode:'immediate',receiptWrites:[],pendingSaves:[],errors:[],imports:0};setAsterPreferences({mode:'quiet'});
 function Harness(){
  const[notebook,setNotebook]=useState(durable),[tracking,setTracking]=useState(true),[error,setError]=useState(''),[showAssistant,setShowAssistant]=useState(true);
  const persist=next=>{const saved=parsePackage(serializePackage(next));localStorage.setItem(key,serializePackage(saved));qa.durable=saved;setNotebook(saved);return true;};
  const observe=async receipt=>{
   qa.receiptWrites.push(structuredClone(receipt));
   if(qa.saveMode==='fail-start'&&receipt.status==='started'||qa.saveMode==='fail-finish'&&receipt.status!=='started')return false;
   if(qa.saveMode==='hold-start'&&receipt.status==='started'&&await new Promise(resolve=>qa.pendingSaves.push(resolve))!==true)return false;
   return persist({...qa.durable,aiToolReceipts:upsertAIUsageReceipt(qa.durable.aiToolReceipts,receipt)});
  };
  const report=message=>{qa.errors.push(message);setError(message);};
  qa.restore=text=>{const result=persist(parsePackage(text));qa.imports++;return result;};
  qa.clearUsage=()=>persist({...qa.durable,aiToolReceipts:[]});
  return <main style={{padding:24,maxWidth:1100,margin:'auto'}}>
   <h1>Optional creation tools</h1>
   <div className="button-row"><button onClick={()=>setTracking(!tracking)}>{tracking?'Pause durable usage recording':'Resume durable usage recording'}</button><button onClick={()=>setShowAssistant(!showAssistant)}>Toggle activity assistant</button><button onClick={()=>downloadFile(serializePackage(qa.durable),'optional-tools.learnpack')}>Export saved learning game</button><label>Restore saved learning game<input type="file" accept=".learnpack" onChange={async event=>{try{if(event.target.files?.[0])qa.restore(await event.target.files[0].text());}catch(error){report(error.message);}event.target.value='';}}/></label></div>
   {error&&<p role="alert">{error}</p>}
   <EasyGameSetup notebook={notebook} summary={{title:notebook.title,description:'A source-based learning notebook',sourceCount:1,chapterCount:0,activityCount:notebook.activities?.length??0,recallCount:0,reviewRequiredCount:0}} busy={false} preparing={false} stage='' prepared={false} canCreate={false} aiAvailable={false} aiModel='' warnings={[]} onFiles={()=>{}} onPaste={()=>{}} onLink={()=>{}} onSource={()=>{}} onRemove={()=>{}} onPreferences={()=>{}} onCreate={()=>{}} onPlay={()=>{}} onCustomize={()=>{}} onConnectAI={()=>{}} onCancel={()=>{}}/>
   {showAssistant&&<ActivityAssistant notebookId={notebook.id} sources={notebook.sources} onAIUsage={tracking?observe:undefined} onCreate={activity=>persist({...qa.durable,activities:[...(qa.durable.activities??[]),activity]})} onError={report}/>}
   <VisualStudio notebook={notebook} onAIUsage={tracking?observe:undefined} onChange={artwork=>persist({...qa.durable,artwork})} onError={report}/>
  </main>;
 }
 createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);`;
 const compiled=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:info.outputPath('bundle'),loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=compiled.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=compiled.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Optional AI usage durability</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 const generations:Generation[]=[],remote:string[]=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){remote.push(url.href);await route.abort();return;}
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:html});return;}
  if(url.pathname==='/api/ai/engines'){await route.fulfill({json:{engines:[]}});return;}
  if(url.pathname==='/api/generate'||url.pathname==='/api/generate-image'){
   const request={path:url.pathname,body:route.request().postDataJSON(),savedReceipts:await page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null')?.notebook.aiToolReceipts??[],storageKey)};
   generations.push(request);await respond(route,request);return;
  }
  await route.fulfill({status:404,body:'No optional external asset'});
 });
 await page.context().setOffline(true);await page.goto(origin);await expect(page.getByRole('heading',{name:'Optional creation tools',exact:true})).toBeVisible();
 return {generations,remote,errors};
}

async function configureActivity(page:Page){
 const assistant=page.locator('.activity-assistant');await assistant.getByLabel('Exact passage to share',{exact:true}).fill(passage);await assistant.getByRole('combobox',{name:'Activity to prepare',exact:true}).selectOption('sequence');await assistant.getByText('Or use an API / local model',{exact:true}).click();await assistant.getByRole('combobox',{name:'AI provider',exact:true}).selectOption('compatible');await assistant.getByLabel('Endpoint base URL',{exact:true}).fill('http://localhost:11434/v1');await assistant.getByLabel('API key · this session only',{exact:true}).fill('session-secret-text');await assistant.getByLabel('Model ID',{exact:true}).fill('text-fixture');return assistant;
}
async function configureVisual(page:Page){
 const visual=page.locator('.visual-studio');await visual.getByLabel('Exact source passage',{exact:true}).fill(passage);await visual.getByLabel('Visual title',{exact:true}).fill('A packet route');await visual.getByText('Optional AI illustration',{exact:true}).click();await visual.getByRole('combobox',{name:'Image provider',exact:true}).selectOption('compatible');await visual.getByLabel('Endpoint base URL',{exact:true}).fill('http://localhost:11434/v1');await visual.getByLabel('API key · this session only',{exact:true}).fill('session-secret-image');await visual.getByLabel('Image model ID',{exact:true}).fill('image-fixture');return visual;
}
const receipts=(page:Page)=>page.evaluate(()=>(window as any).toolUsage.durable.aiToolReceipts??[]);
const report=(page:Page)=>page.getByRole('region',{name:'AI creation usage',exact:true});
async function openReport(page:Page){const details=report(page).locator('details');if(!await details.evaluate(element=>(element as HTMLDetailsElement).open))await details.locator('summary').click();}

test('real optional activity and image tools persist intent before requesting and keep their report through package import and reload',async({page},info)=>{
 const qa=await openTools(page,info,async(route,request)=>route.fulfill({json:request.path==='/api/generate'?{text:activityReply,usage:{...measured,private:'discard-private-diagnostics'},actualModels:['resolved-text-model']}:{dataUrl:png,usage:{total_tokens:8},tokenUsage:imagePartial,diagnostics:'discard-private-diagnostics'}}));
 expect(await page.evaluate(()=>(window as any).toolUsage.durable.gameDesign)).toBeUndefined();await expect(report(page)).toHaveCount(0);
 const assistant=await configureActivity(page);await page.evaluate(()=>(window as any).toolUsage.saveMode='hold-start');await assistant.getByRole('button',{name:'Request one activity draft',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).toolUsage.pendingSaves.length)).toBe(1);expect(qa.generations).toEqual([]);expect(await receipts(page)).toEqual([]);await expect(assistant.getByRole('textbox',{name:'Activity assistant JSON reply',exact:true})).toHaveValue('');
 await page.evaluate(()=>{const qa=(window as any).toolUsage;qa.saveMode='immediate';qa.pendingSaves.shift()(true);});await expect(assistant.getByRole('textbox',{name:'Activity assistant JSON reply',exact:true})).toHaveValue(activityReply);await expect.poll(async()=>await receipts(page)).toMatchObject([{status:'completed',stage:'activity-draft',usage:measured,actualModels:['resolved-text-model']}]);expect(qa.generations[0].savedReceipts).toMatchObject([{status:'started',stage:'activity-draft'}]);expect(qa.generations[0].body).toMatchObject({provider:'compatible',model:'text-fixture',maxOutputTokens:3000});
 await assistant.getByRole('button',{name:'Validate and add draft',exact:true}).click();expect(await page.evaluate(()=>(window as any).toolUsage.durable.activities[0].reviewStatus)).toBe('needs-review');
 const visual=await configureVisual(page);await visual.getByRole('button',{name:'Generate one draft · provider charges may apply',exact:true}).click();await expect(visual.locator('.visual-gallery article')).toHaveCount(1);await expect.poll(async()=>await receipts(page)).toMatchObject([{status:'completed',usage:measured},{status:'completed',stage:'image-generation',usage:imagePartial}]);expect(qa.generations).toHaveLength(2);expect(qa.generations[1].savedReceipts).toMatchObject([{status:'completed'},{status:'started',stage:'image-generation'}]);
 await openReport(page);await expect(report(page).locator('summary')).toContainText('2 requests');await expect(report(page).locator('summary')).toContainText('100 in · 30 out');await expect(report(page)).toContainText('missing values are not counted as zero');await expect(report(page).getByRole('row').filter({hasText:'image-fixture'})).toContainText('Not reported');await expect(report(page).getByRole('row').filter({hasText:'text-fixture'})).toContainText('resolved-text-model');
 const saved=await receipts(page),downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export saved learning game',exact:true}).click();const download=await downloadPromise,file=info.outputPath('optional-tools.learnpack');await download.saveAs(file);const exported=await readFile(file,'utf8');expect(JSON.parse(exported).notebook.aiToolReceipts).toEqual(saved);expect(exported).not.toMatch(/session-secret|discard-private-diagnostics|"apiKey"/);
 // Restore into an empty local ledger to prove the package supplies the receipts.
 await page.evaluate(()=>(window as any).toolUsage.clearUsage());await expect(report(page)).toHaveCount(0);await page.getByLabel('Restore saved learning game',{exact:true}).setInputFiles(file);await expect.poll(()=>page.evaluate(()=>(window as any).toolUsage.imports)).toBe(1);expect(await receipts(page)).toEqual(saved);expect(await page.evaluate(()=>(window as any).toolUsage.errors)).toEqual([]);
 await page.reload();await openReport(page);await expect(report(page).locator('tbody tr')).toHaveCount(2);expect(await receipts(page)).toEqual(saved);expect(await page.evaluate(()=>(window as any).toolUsage.durable.gameDesign)).toBeUndefined();expect(qa.generations).toHaveLength(2);expect(qa.remote).toEqual([]);expect(qa.errors).toEqual([]);
});

test('optional paid controls require a durable observer and failed intent saves send no activity or image request',async({page},info)=>{
 const qa=await openTools(page,info,async route=>route.fulfill({json:{text:activityReply,usage:measured}})),assistant=await configureActivity(page),visual=await configureVisual(page);
 await page.getByRole('button',{name:'Pause durable usage recording',exact:true}).click();await expect(assistant.getByRole('button',{name:'Request one activity draft',exact:true})).toBeDisabled();await expect(visual.getByRole('button',{name:'Generate one draft · provider charges may apply',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Resume durable usage recording',exact:true}).click();await page.evaluate(()=>(window as any).toolUsage.saveMode='fail-start');
 await assistant.getByRole('button',{name:'Request one activity draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('not sent because its usage history could not be saved');await visual.getByRole('button',{name:'Generate one draft · provider charges may apply',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).toolUsage.receiptWrites.length)).toBe(2);expect(qa.generations).toEqual([]);expect(await receipts(page)).toEqual([]);await expect(report(page)).toHaveCount(0);await expect(visual.locator('.visual-gallery article')).toHaveCount(0);expect(qa.remote).toEqual([]);expect(qa.errors).toEqual([]);
});

test('invalid activity output and failed image responses retain measured usage and never apply returned material',async({page},info)=>{
 const imageUsage={...measured,inputTokens:40,outputTokens:7,cachedInputTokens:20,cacheWriteTokens:0,reasoningTokens:0,totalTokens:47};
 const qa=await openTools(page,info,async(route,request)=>route.fulfill({status:request.path==='/api/generate'?200:502,json:request.path==='/api/generate'?{text:123,usage:{...measured,private:'discard-private-diagnostics'}}:{error:'The image provider stopped before delivering a draft.',usage:imageUsage,providerDiagnostics:'discard-private-diagnostics'}}));
 const assistant=await configureActivity(page);await assistant.getByRole('button',{name:'Request one activity draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('no activity draft');await expect(assistant.getByRole('textbox',{name:'Activity assistant JSON reply',exact:true})).toHaveValue('');
 const visual=await configureVisual(page);await visual.getByRole('button',{name:'Generate one draft · provider charges may apply',exact:true}).click();await expect(page.getByRole('alert')).toContainText('image provider stopped');await expect(visual.locator('.visual-gallery article')).toHaveCount(0);expect(await receipts(page)).toMatchObject([{status:'failed',usage:measured},{status:'failed',usage:imageUsage}]);await openReport(page);await expect(report(page).locator('summary')).toContainText('140 in · 37 out');await expect(report(page).locator('tbody tr')).toHaveCount(2);expect(JSON.stringify(await receipts(page))).not.toMatch(/session-secret|discard-private-diagnostics|prompt|apiKey/);await page.reload();await openReport(page);await expect(report(page)).toContainText('failed');expect(qa.generations).toHaveLength(2);expect(qa.remote).toEqual([]);expect(qa.errors).toEqual([]);
});

test('canceling an optional activity request saves an unknown canceled receipt and ignores its late response',async({page},info)=>{
 let held:Route|undefined;const qa=await openTools(page,info,async route=>{held=route;}),assistant=await configureActivity(page);await assistant.getByRole('button',{name:'Request one activity draft',exact:true}).click();await expect.poll(()=>!!held).toBe(true);expect(qa.generations[0].savedReceipts).toMatchObject([{status:'started'}]);await assistant.getByRole('button',{name:'Cancel request',exact:true}).click();await expect(assistant.getByText('Request canceled.',{exact:true})).toBeVisible();expect(await receipts(page)).toMatchObject([{status:'canceled',usage:unknown}]);const saved=await receipts(page);await held!.fulfill({json:{text:activityReply,usage:measured}}).catch(()=>{});await expect(assistant.getByRole('textbox',{name:'Activity assistant JSON reply',exact:true})).toHaveValue('');expect(await receipts(page)).toEqual(saved);await openReport(page);await expect(report(page)).toContainText('Not reported');await expect(report(page)).toContainText('canceled');await page.reload();await openReport(page);expect(await receipts(page)).toEqual(saved);expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);
});

test('a failed completion save withholds the draft and reload shows its saved request as unconfirmed',async({page},info)=>{
 const qa=await openTools(page,info,async route=>route.fulfill({json:{text:activityReply,usage:measured}})),assistant=await configureActivity(page);await page.evaluate(()=>(window as any).toolUsage.saveMode='fail-finish');await assistant.getByRole('button',{name:'Request one activity draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('usage report could not be saved');await expect(assistant.getByRole('textbox',{name:'Activity assistant JSON reply',exact:true})).toHaveValue('');expect(await receipts(page)).toMatchObject([{status:'started',usage:unknown}]);expect(await page.evaluate(()=>(window as any).toolUsage.receiptWrites.map(receipt=>receipt.status))).toEqual(['started','completed']);await page.reload();await openReport(page);await expect(report(page)).toContainText('Completion unconfirmed');await expect(report(page).locator('tbody tr')).toHaveCount(1);expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);
});
