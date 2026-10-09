import {test,expect,type Page,type TestInfo,type Route} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const origin='http://127.0.0.1:4897';
const sourceText='Evaporation changes liquid water into water vapor. Condensation changes water vapor into liquid droplets. These observations distinguish the two phase changes.';
const answerText='Evaporation changes liquid water into vapor; condensation changes vapor into liquid droplets.';
const usage={status:'reported',inputTokens:321,outputTokens:47,cachedInputTokens:120,cacheWriteTokens:0,reasoningTokens:7,totalTokens:368};
const response=(text=answerText)=>({text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text,passageIds:['passage-1']}],actions:[{type:'open-source',passageId:'passage-1'},{type:'connect-ai'}]}),usage,actualModels:['fixture-model-actual']});
async function openAster(page:Page,info:TestInfo,{noSources=false,noNotebook=false,held=false,failure=false,insufficient=false}={}){
 const portrait='data:image/png;base64,'+(await readFile('public/assets/aster/aster-guide.png')).toString('base64');
 const code=`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import AsterGuide from'./src/components/AsterGuide';import AsterConnection,{useAsterConnection}from'./src/components/AsterConnection';import{useProviderSession}from'./src/lib/providerSession';import'./src/styles.css';
 localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));
 const source={id:'water',title:'Water observations',kind:'text',status:'ready',text:${JSON.stringify(sourceText)},addedAt:'2026-10-09T00:00:00Z'};
 const notebook={id:'exported-water',title:'Water workshop',description:'',ageGroup:'adult',goal:'Understand phase changes',theme:'ocean',scaffoldIds:[],sources:${noSources?'[]':'[source]'},cards:[],createdAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09T00:00:00Z',revision:1};
 window.__ASTERLOOM_NOTEBOOK__=notebook;window.qa={assistMode:'immediate',assistance:[],pendingAssistance:[],opened:[],receipts:[],before:JSON.stringify(notebook)};
 function Lab(){const[n,setN]=useState(window.__ASTERLOOM_NOTEBOOK__),[context,setContext]=useState('one'),[livePhase,setLivePhase]=useState('answering');const[,setProvider]=useProviderSession(),connection=useAsterConnection();useEffect(()=>{setProvider({provider:'chatgpt',model:'fixture-model',apiKey:'',baseUrl:''});},[]);window.qa.receipts=connection.receipts;window.qa.notebook=n;return <><main><h1>Exported water game</h1><button onClick={()=>setContext('two')}>Change mission</button><button onClick={()=>setLivePhase(previous=>previous==='answering'?'feedback':'answering')}>Advance live state</button><button onClick={()=>setN({...n,sources:n.sources.map(s=>({...s,text:'Evaporation is the change described in this replacement source. The current experiment observes liquid water becoming vapor.'}))})}>Replace source</button><button onClick={()=>setN({...n,id:'second-game',title:'Second game',sources:[]})}>Change notebook</button><button onClick={()=>setProvider({provider:'chatgpt',model:'other-model',apiKey:'',baseUrl:''})}>Switch account session</button></main><AsterGuide notebook={${noNotebook?'undefined':'n'}} mode=${noNotebook?"'library'":"'play'"} contextKey={context} portraitUrl=${JSON.stringify(portrait)} learningState={{title:'Water experiment',phase:livePhase,nextAction:livePhase==='answering'?'Compare the observations.':'Read the saved feedback.'}} onOpenSource={(id,quote)=>window.qa.opened.push({id,quote})} onAssistance={async()=>{window.qa.assistance.push('started');const okay=window.qa.assistMode==='hold'?await new Promise(resolve=>window.qa.pendingAssistance.push(resolve)):window.qa.assistMode!=='fail';window.qa.assistance.push(okay?'saved':'rejected');return okay;}}/></>;}createRoot(document.getElementById('root')).render(<AsterConnection><Lab/></AsterConnection>);`;
 const bundle=await build({stdin:{contents:code,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:info.outputPath('bundle'),loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=bundle.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const html=`<!doctype html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Optional AI Aster test</title><style>${css}main{padding:24px;max-width:650px}main>button{display:block;margin:12px;padding:12px;border:1px solid #456}</style></head><body><div id='root'></div><script type='module'>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 const requests:{path:string;method:string}[]=[],generations:any[]=[],pending:Route[]=[],errors:string[]=[],external:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){if(url.protocol==='data:')return route.continue();external.push(url.origin+url.pathname);return route.abort();}
  requests.push({path:url.pathname,method:request.method()});
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/generate'){
   generations.push({body:request.postDataJSON(),assistance:await page.evaluate(()=>(window as any).qa.assistance.slice())});
   if(held){pending.push(route);return;}
   const reference=JSON.parse(request.postDataJSON().prompt.split('REFERENCE DATA (JSON):\n')[1]);
   const reply=reference.passages.length?response():{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{kind:'conversation',text:'Include the concept or subject you want to discuss, and we can explore it together.',passageIds:[],contextIds:[]}],actions:[]}),usage};
   return route.fulfill({status:failure?503:200,json:failure?{error:'Fixture busy',code:'PROVIDER_BUSY',usage}:insufficient?{text:JSON.stringify({insufficientEvidence:true,paragraphs:[],actions:[]}),usage}:reply});
  }
  if(url.pathname==='/api/ai/engines')return route.fulfill({json:{engines:[{id:'codex',provider:'chatgpt',enabled:true,installed:true,installing:false,pending:false,connected:true,version:'fixture'}]}});
  if(url.pathname==='/api/models')return route.fulfill({json:{models:[{id:'fixture-model',name:'Fixture model'},{id:'other-model',name:'Other model'}]}});
  if(url.pathname==='/api/health')return route.fulfill({json:{ok:true}});
  if(url.pathname.startsWith('/assets/aster/'))try{return await route.fulfill({contentType:'image/png',body:await readFile('public'+url.pathname)});}catch{}
  return route.fulfill({status:404,body:'No external model or service in this isolated fixture.'});
 });
 await page.goto(origin);await page.getByRole('button',{name:'Ask Aster',exact:true}).click();
 return{requests,generations,pending,errors,external};
}
async function ask(page:Page,question='How does evaporation change water?'){
 await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill(question);
 await page.getByRole('button',{name:/^(?:Ask AI Aster|Find in my sources)$/}).click();
}
async function enable(page:Page){
 await page.getByRole('button',{name:'Connect Aster to AI',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Connect Aster to AI',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('Nothing is sent automatically.');await expect(dialog.getByLabel('Model ID',{exact:true})).toHaveValue('fixture-model');
 await dialog.getByRole('button',{name:'Enable AI for Aster',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','connected');await page.getByRole('button',{name:'Ask Aster',exact:true}).click();
}
const receipts=(page:Page)=>page.evaluate(()=>(window as any).qa.receipts);

test('a shared game starts offline despite an existing session, then explicit AI opt-in produces exact cited passages and measured usage',async({page},info)=>{
 const qa=await openAster(page,info);await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','local');expect(qa.requests.filter(r=>r.method==='POST')).toEqual([]);
 await ask(page);await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);expect(qa.generations).toEqual([]);expect(qa.requests.filter(r=>r.method==='POST')).toEqual([]);
 await ask(page,'connect Aster to AI');const dialog=page.getByRole('dialog',{name:'Connect Aster to AI',exact:true});await expect(dialog).toBeVisible();await expect(dialog.locator('.provider-connection')).toBeVisible();await expect(dialog.getByLabel('Model ID',{exact:true})).toHaveValue('fixture-model');expect(qa.generations).toEqual([]);
 await dialog.getByRole('button',{name:'Enable AI for Aster',exact:true}).click();await page.getByRole('button',{name:'Ask Aster',exact:true}).click();expect(qa.generations).toEqual([]);
 await ask(page);const answer=page.getByRole('region',{name:'Aster AI answer',exact:true});await expect(answer).toContainText(answerText);expect(qa.generations).toHaveLength(1);
 const request=qa.generations[0];expect(request.assistance).toEqual(['started','saved']);expect(await page.evaluate(()=>(window as any).qa.assistance)).toEqual(['started','saved','started','saved']);expect(request.body).toMatchObject({provider:'chatgpt',model:'fixture-model',apiKey:'',maxOutputTokens:1800});expect(request.body.requestId).toMatch(/^request-/);
 const data=JSON.parse(request.body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.question).toBe('How does evaporation change water?');expect(data.passages[0].text).toBe(sourceText);expect(data.context.title).toBeTruthy();
 await answer.getByText('Read the supporting passages',{exact:true}).click();await expect(answer.locator('blockquote p')).toHaveText(sourceText);await answer.getByRole('button',{name:'Open source',exact:true}).click();expect(await page.evaluate(()=>(window as any).qa.opened)).toEqual([{id:'water',quote:sourceText}]);
 await page.locator('.aster-ai-usage summary').click();await expect(page.locator('.aster-ai-usage')).toContainText('321');await expect(page.locator('.aster-ai-usage')).toContainText('47');
 const ledger=await receipts(page);expect(ledger).toHaveLength(1);expect(ledger[0]).toMatchObject({stage:'aster-answer',status:'completed',usage,actualModels:['fixture-model-actual']});expect(ledger[0].durationMs).toBeGreaterThanOrEqual(0);expect(JSON.stringify(ledger)).not.toContain('How does evaporation');
 expect(await page.evaluate(()=>JSON.stringify((window as any).qa.notebook)===(window as any).qa.before)).toBe(true);expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('fixture-model');
 await page.reload();await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await expect(page.locator('.aster-guide')).toHaveAttribute('data-connection','local');expect(await receipts(page)).toEqual([]);expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('source answers wait for durable assistance while every billed request remains recorded',async({page},info)=>{
 const qa=await openAster(page,info);await enable(page);await page.evaluate(()=>(window as any).qa.assistMode='fail');await ask(page);await expect(page.getByRole('alert')).toBeVisible();expect(qa.generations).toHaveLength(1);expect(await receipts(page)).toHaveLength(1);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).qa.assistMode='hold');await page.getByRole('button',{name:'Retry saving help',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).qa.pendingAssistance.length)).toBe(1);expect(qa.generations).toHaveLength(1);expect(await receipts(page)).toHaveLength(1);await expect(page.getByRole('region',{name:'Source search results',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).qa.pendingAssistance.shift()(true));await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);expect(qa.generations).toHaveLength(1);expect(await receipts(page)).toHaveLength(1);expect(await page.evaluate(()=>(window as any).qa.assistance)).toEqual(['started','rejected','started','saved']);expect(qa.errors).toEqual([]);
});

test('a changed source during assistance saving withholds the paid answer and keeps its measured receipt',async({page},info)=>{
 const qa=await openAster(page,info);await enable(page);await page.evaluate(()=>(window as any).qa.assistMode='hold');await ask(page);
 await expect.poll(()=>page.evaluate(()=>(window as any).qa.pendingAssistance.length)).toBe(1);await page.getByRole('button',{name:'Replace source',exact:true}).click();await page.evaluate(()=>(window as any).qa.pendingAssistance.shift()(true));
 await expect(page.locator('.aster-search-status')).toHaveCount(0);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);expect(qa.generations).toHaveLength(1);expect((await receipts(page))[0]).toMatchObject({status:'completed',usage});expect(qa.errors).toEqual([]);
});

for(const change of ['Change mission','Replace source','Change notebook','Switch account session','Close Aster','Stop answer','Use regular Aster'])test(`pending AI answer is canceled on ${change.toLowerCase()} and its receipt survives without showing stale text`,async({page},info)=>{
 const qa=await openAster(page,info,{held:true});await enable(page);await ask(page);await expect.poll(()=>qa.pending.length).toBe(1);
 await page.getByRole('button',{name:change,exact:true}).click();if(change==='Close Aster')await page.getByRole('button',{name:'Ask Aster',exact:true}).click();
 await expect.poll(async()=> (await receipts(page)).length).toBe(1);expect((await receipts(page))[0]).toMatchObject({stage:'aster-answer',status:'canceled',usage:{status:'unavailable',inputTokens:null,outputTokens:null}});
 await qa.pending.shift()!.fulfill({json:response('OBSOLETE ANSWER MUST STAY HIDDEN')}).catch(()=>{});
 await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);await expect(page.getByText('OBSOLETE ANSWER MUST STAY HIDDEN',{exact:true})).toHaveCount(0);await expect(page.locator('.aster-search-status')).toHaveCount(0);
 await page.locator('.aster-ai-usage summary').click();await expect(page.locator('.aster-ai-usage')).toContainText('Not reported');expect((await receipts(page))).toHaveLength(1);expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('an explicit AI question can use live screen context before sources are added, while local guidance stays offline',async({page},info)=>{
 const qa=await openAster(page,info,{noSources:true,held:true});
 if(!await page.locator('.aster-chat-tools').evaluate(el=>el.hasAttribute('open')))await page.getByText('Current activity & tools',{exact:true}).click();await page.getByRole('button',{name:'What is next?',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toBeVisible();expect(qa.generations).toEqual([]);
 await enable(page);expect(qa.generations).toEqual([]);await ask(page,'Where can I continue from the point I stopped?');await expect.poll(()=>qa.pending.length).toBe(1);
 const data=JSON.parse(qa.generations[0].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.passages).toEqual([]);expect(data.context.nextAction).toContain('Compare the observations');
 await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'You are at the Water experiment. Compare the observations to continue.',passageIds:[],contextIds:['current-state']}],actions:[]}),usage}});
 await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText('Compare the observations');await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText('YOUR CURRENT ACTIVITY');expect((await receipts(page))[0]).toMatchObject({status:'completed',usage});
 if(!await page.locator('.aster-chat-tools').evaluate(el=>el.hasAttribute('open')))await page.getByText('Current activity & tools',{exact:true}).click();await page.getByRole('button',{name:'What is next?',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toBeVisible();expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('provider failure records known usage and leaves explicit offline source search usable',async({page},info)=>{
 const qa=await openAster(page,info,{failure:true});await enable(page);await ask(page);await expect(page.getByRole('alert')).toContainText('This AI connection is busy.');expect((await receipts(page))[0]).toMatchObject({status:'failed',usage});
 await page.getByRole('button',{name:'Search sources offline',exact:true}).click();await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('an AI evidence refusal explains the limit, keeps exact local excerpts and records the billed request',async({page},info)=>{
 const qa=await openAster(page,info,{insufficient:true});await enable(page);await ask(page);
 const sources=page.getByRole('region',{name:'Aster AI answer',exact:true});await expect(sources).toContainText('I couldn’t find enough support in the passages I checked to explain that reliably.');await expect(sources.locator('blockquote')).not.toBeVisible();await sources.getByText('Related passages Aster checked',{exact:true}).click();await expect(sources.locator('blockquote p')).toHaveText(sourceText);
 await expect(page.getByRole('region',{name:'Source search results',exact:true})).toHaveCount(0);expect(await page.locator('.aster-ai-usage').evaluate(usage=>!!(document.querySelector('.aster-ai-answer')!.compareDocumentPosition(usage)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);expect(qa.generations).toHaveLength(1);expect((await receipts(page))[0]).toMatchObject({status:'completed',usage});await page.getByRole('button',{name:'Change mission',exact:true}).click();await expect(page.getByRole('region',{name:'Earlier Aster AI answer',exact:true})).toHaveCount(0);await page.evaluate(()=>(window as any).qa.assistMode='fail');await page.getByRole('button',{name:'Review earlier source help',exact:true}).click();await expect(page.getByRole('region',{name:'Earlier Aster AI answer',exact:true})).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('earlier source help stayed closed');await page.evaluate(()=>(window as any).qa.assistMode='immediate');await page.getByRole('button',{name:'Review earlier source help',exact:true}).click();await expect(page.getByRole('region',{name:'Earlier Aster AI answer',exact:true})).toBeVisible();expect(qa.generations).toHaveLength(1);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('short follow-ups keep the source topic without leaking it into new questions or a changed source',async({page},info)=>{
 const qa=await openAster(page,info);await enable(page);await ask(page);
 await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);
 await ask(page,'Why?');await expect.poll(()=>qa.generations.length).toBe(2);await expect(page.locator('.aster-search-status')).toHaveCount(0);
 const follow=JSON.parse(qa.generations[1].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(follow.question).toBe('Why?');expect(follow.previousQuestion).toBe('How does evaporation change water?');expect(follow.passages[0].text).toBe(sourceText);expect(follow.conversation).toEqual([{question:'How does evaporation change water?',reply:answerText,scope:'prior-source-explanation'}]);expect(follow.passages.every((passage:any)=>passage.text!==answerText)).toBe(true);
 await ask(page,'What is condensation?');await expect.poll(()=>qa.generations.length).toBe(3);await expect(page.locator('.aster-search-status')).toHaveCount(0);
 expect(JSON.parse(qa.generations[2].body.prompt.split('REFERENCE DATA (JSON):\n')[1]).previousQuestion).toBeUndefined();
 await page.getByRole('button',{name:'Replace source',exact:true}).click();await ask(page,'Why?');await expect(page.locator('.aster-search-status')).toHaveCount(0);expect(qa.generations).toHaveLength(4);const reset=JSON.parse(qa.generations[3].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(reset.previousQuestion).toBeUndefined();expect(reset.conversation).toBeUndefined();expect(reset.passages).toEqual([]);
 await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText('Include the concept or subject');expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});


test('AI help sees fresh live task state and rejects a delayed state answer after the learner moves on',async({page},info)=>{
 const qa=await openAster(page,info,{held:true});await enable(page);await ask(page);await expect.poll(()=>qa.pending.length).toBe(1);
 const data=JSON.parse(qa.generations[0].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.context.screen).toBe('play');expect(data.context.nextAction).toBe('Compare the observations.');
 await page.getByRole('button',{name:'Advance live state',exact:true}).click();
 await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'Compare the observations before checking your work.',passageIds:[],contextIds:['current-state']}],actions:[]}),usage}});
 await expect(page.getByRole('alert')).toContainText('activity changed');await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);
 await expect(page.locator('.aster-context')).toContainText('Read the saved feedback.');expect((await receipts(page))[0]).toMatchObject({status:'failed',usage});
 await ask(page);await expect.poll(()=>qa.pending.length).toBe(1);const refreshed=JSON.parse(qa.generations[1].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(refreshed.context.nextAction).toBe('Read the saved feedback.');
 await qa.pending.shift()!.fulfill({json:response()});await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);expect(qa.errors).toEqual([]);
});

test('conversation history is session-only and starting over clears source follow-up memory',async({page},info)=>{
 const qa=await openAster(page,info);await enable(page);await ask(page);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);
 await ask(page,'Could you explain that more simply?');await expect.poll(()=>qa.generations.length).toBe(2);await expect(page.locator('.aster-search-status')).toHaveCount(0);
 const data=JSON.parse(qa.generations[1].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.conversation).toHaveLength(1);expect(data.previousQuestion).toBe('How does evaporation change water?');
 await expect(page.locator('.aster-conversation > .aster-chat-turn')).toHaveCount(2);await expect(page.locator('.aster-chat-user')).toHaveText(['YouHow does evaporation change water?','YouCould you explain that more simply?']);
 await page.getByRole('button',{name:'Start a new conversation',exact:true}).click();await expect(page.locator('.aster-conversation > .aster-chat-turn')).toHaveCount(0);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);
 await ask(page,'Why?');await expect(page.locator('.aster-search-status')).toHaveCount(0);expect(qa.generations).toHaveLength(3);const fresh=JSON.parse(qa.generations[2].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(fresh.conversation).toBeUndefined();expect(fresh.previousQuestion).toBeUndefined();
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(answerText);expect(qa.errors).toEqual([]);
});


test('a context-only AI reply stays in the visible conversation and becomes the immediate follow-up context',async({page},info)=>{
 const qa=await openAster(page,info,{held:true});await enable(page);await ask(page);await expect.poll(()=>qa.pending.length).toBe(1);await qa.pending.shift()!.fulfill({json:response()});await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);
 await ask(page,'Where can I continue from the point I stopped?');await expect.poll(()=>qa.pending.length).toBe(1);await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'**Compare the observations** to continue.',passageIds:[],contextIds:['current-state']}],actions:[]}),usage}});await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText('YOUR CURRENT ACTIVITY');await expect(page.getByRole('region',{name:'Aster AI answer',exact:true}).locator('strong')).toHaveText('Compare the observations');await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).not.toContainText('**');
 await ask(page,'Tell me more');await expect.poll(()=>qa.pending.length).toBe(1);const follow=JSON.parse(qa.generations[2].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(follow.conversation).toHaveLength(2);expect(follow.conversation[1]).toMatchObject({question:'Where can I continue from the point I stopped?',reply:'**Compare the observations** to continue.',scope:'historical-app-state'});await qa.pending.shift()!.fulfill({json:response()});await expect(page.locator('.aster-search-status')).toHaveCount(0);expect(qa.errors).toEqual([]);
});

test('an empty library supports connected identity, greeting and continuous chat without intercepting typed app questions',async({page},info)=>{
 const qa=await openAster(page,info,{noNotebook:true,held:true});await enable(page);expect(qa.generations).toEqual([]);
 const questions=['What is your name?','Hi Aster','What can you help me do here?','What is next?','Thanks','Can you explain what you just said?'];
 const answers=['I’m Aster, your learning companion.','Hi! What would you like to explore?','I can help you get started or explore learning material.','You can create your first learning game.','You’re welcome.','We can start with what you want to learn.'];
 for(let index=0;index<questions.length;index++){
  await page.getByRole('textbox',{name:'Message Aster',exact:true}).fill(questions[index]);await page.getByRole('textbox',{name:'Message Aster',exact:true}).press('Enter');await expect.poll(()=>qa.pending.length).toBe(1);
  const data=JSON.parse(qa.generations[index].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.question).toBe(questions[index]);expect(data.context.screen).toBe('library');expect(data.passages).toEqual([]);expect(data.conversation?.length??0).toBe(Math.min(index,4));if(index)expect(data.conversation.at(-1).reply).toBe(answers[index-1]);
  await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{kind:'conversation',text:answers[index],passageIds:[],contextIds:[]}],actions:[]}),usage}});
  await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answers[index]);await expect(page.getByRole('textbox',{name:'Message Aster',exact:true})).toHaveValue('');
 }
 await expect(page.locator('.aster-chat-turn')).toHaveCount(6);await expect(page.locator('.aster-chat-user p')).toHaveText(questions);await expect(page.getByRole('log',{name:'Conversation with Aster'})).toContainText(answers[0]);
 await page.getByRole('button',{name:'Close Aster',exact:true}).click();await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await expect(page.locator('.aster-chat-turn')).toHaveCount(6);expect(qa.generations).toHaveLength(6);expect((await receipts(page))).toHaveLength(6);await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'.qa/chat-0.7.10/aster-chat-desktop.png',fullPage:true});
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(answers[0]);expect(qa.errors).toEqual([]);expect(qa.external).toEqual([]);
});

test('regular Aster appends offline conversation and source follow-ups without spending AI requests',async({page},info)=>{
 const qa=await openAster(page,info);await ask(page,'Hi Aster');await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Aster');
 await ask(page,'How does evaporation change water?');await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);
 await ask(page,'Explain that');await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);
 await expect(page.locator('.aster-chat-turn')).toHaveCount(3);await expect(page.locator('.aster-chat-user p')).toHaveText(['Hi Aster','How does evaporation change water?','Explain that']);expect(qa.generations).toEqual([]);expect(await receipts(page)).toEqual([]);expect(qa.errors).toEqual([]);
});

test('failed and stopped answers remain readable and retry only on an explicit send',async({page},info)=>{
 const qa=await openAster(page,info,{held:true});await enable(page);await ask(page);await expect.poll(()=>qa.pending.length).toBe(1);
 await qa.pending.shift()!.fulfill({status:503,json:{code:'PROVIDER_BUSY',usage}});await expect(page.getByRole('alert')).toContainText('busy');await expect(page.locator('.aster-chat-user p')).toHaveText('How does evaporation change water?');expect(qa.generations).toHaveLength(1);
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect.poll(()=>qa.pending.length).toBe(1);await qa.pending.shift()!.fulfill({json:response()});await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);await expect(page.locator('.aster-chat-turn')).toHaveCount(2);await expect(page.locator('.aster-chat-turn').first()).toContainText('busy');expect(qa.generations).toHaveLength(2);expect((await receipts(page))).toHaveLength(2);
 await ask(page,'What is condensation?');await expect.poll(()=>qa.pending.length).toBe(1);await page.getByRole('button',{name:'Stop answer',exact:true}).click();await expect(page.locator('.aster-chat-turn').last()).toContainText('Answer stopped');await qa.pending.shift()!.fulfill({json:response('LATE TEXT MUST NOT APPEAR')}).catch(()=>{});await expect(page.getByText('LATE TEXT MUST NOT APPEAR',{exact:true})).toHaveCount(0);expect(qa.generations).toHaveLength(3);
});

test('the chat composer and latest answer stay usable on narrow screens with keyboard and reduced motion',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const qa=await openAster(page,info,{noNotebook:true,held:true});await enable(page);
 const input=page.getByRole('textbox',{name:'Message Aster',exact:true});await input.fill('What is your name?');await input.press('Enter');await expect.poll(()=>qa.pending.length).toBe(1);await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{kind:'conversation',text:'I’m Aster. We can learn together at your pace.',passageIds:[],contextIds:[]}],actions:[]}),usage}});
 await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText('I’m Aster');await expect(input).toBeInViewport();await expect(page.getByRole('button',{name:'Ask AI Aster',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const audit=await new AxeBuilder({page}).include('.aster-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations).toEqual([]);await page.screenshot({path:'.qa/chat-0.7.10/aster-chat-narrow.png',fullPage:true});expect(qa.errors).toEqual([]);
});

test('same-source mission changes retain conversational context but earlier source help must be deliberately reopened',async({page},info)=>{
 const qa=await openAster(page,info);await enable(page);await ask(page);await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(answerText);
 await page.getByRole('button',{name:'Change mission',exact:true}).click();await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review earlier source help',exact:true})).toBeVisible();await expect(page.locator('.aster-chat-user p')).toHaveText('How does evaporation change water?');
 const saved=await page.evaluate(()=>(window as any).qa.assistance.length);await page.getByRole('button',{name:'Review earlier source help',exact:true}).click();expect(await page.evaluate(()=>(window as any).qa.assistance.length)).toBe(saved+2);await expect(page.getByRole('region',{name:'Earlier Aster AI answer',exact:true})).toContainText(answerText);
 await ask(page,'Explain that more simply');await expect.poll(()=>qa.generations.length).toBe(2);const data=JSON.parse(qa.generations[1].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.conversation.at(-1)).toMatchObject({question:'How does evaporation change water?',reply:answerText});expect(data.passages[0].text).toBe(sourceText);expect(qa.errors).toEqual([]);
});

test('enabling AI can continue valid local conversation without sending anything until the learner asks',async({page},info)=>{
 const qa=await openAster(page,info);await ask(page,'How does evaporation change water?');await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);await enable(page);expect(qa.generations).toEqual([]);
 await ask(page,'Explain that more simply');await expect.poll(()=>qa.generations.length).toBe(1);const data=JSON.parse(qa.generations[0].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(data.conversation).toHaveLength(1);expect(data.conversation[0]).toMatchObject({question:'How does evaporation change water?',reply:sourceText,scope:'prior-source-explanation'});expect(data.passages[0].text).toBe(sourceText);
 await page.getByRole('button',{name:'Switch account session',exact:true}).click();await ask(page,'Explain that more simply');await expect.poll(()=>qa.generations.length).toBe(2);const other=JSON.parse(qa.generations[1].body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(other.conversation).toBeUndefined();expect(other.previousQuestion).toBeUndefined();await expect(page.locator('.aster-chat-user p')).toHaveCount(3);expect(qa.errors).toEqual([]);
});

test('offline app follow-ups use fresh app state instead of an older source topic',async({page},info)=>{
 const qa=await openAster(page,info);await ask(page,'How does evaporation change water?');await expect(page.getByRole('region',{name:'Source search results',exact:true})).toContainText(sourceText);
 await ask(page,'What is next?');await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Compare the observations');await page.getByRole('button',{name:'Advance live state',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Earlier current activity answer',exact:true})).toContainText('Compare the observations');
 await ask(page,'How do I do that?');await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Read the saved feedback');await expect(page.getByRole('region',{name:'Source search results',exact:true})).toHaveCount(0);await expect(page.locator('.aster-chat-turn')).toHaveCount(3);expect(qa.generations).toEqual([]);expect(qa.errors).toEqual([]);
});

test('AI greetings and score guidance do not mark the learning attempt supported',async({page},info)=>{
 const qa=await openAster(page,info,{held:true});await enable(page);await page.evaluate(()=>(window as any).qa.assistMode='fail');
 for(const question of ['Hi Aster','What is my score?','Could you tell me how evaporation relates to my current game progress?']){
  await ask(page,question);await expect.poll(()=>qa.pending.length).toBe(1);const data=JSON.parse(qa.generations.at(-1).body.prompt.split('REFERENCE DATA (JSON):\n')[1]);if(question!=='Could you tell me how evaporation relates to my current game progress?')expect(data.passages).toEqual([]);
  const context=question!=='Hi Aster';await qa.pending.shift()!.fulfill({json:{text:JSON.stringify({insufficientEvidence:false,paragraphs:[{kind:context?'current-state':'conversation',text:context?'Your screen is at the Water experiment. Compare the observations when you are ready.':'Hi! I’m Aster.',passageIds:[],contextIds:context?['current-state']:[]}],actions:[]}),usage}});
  await expect(page.getByRole('region',{name:'Aster AI answer',exact:true})).toContainText(context?'Water experiment':'Aster');expect(await page.evaluate(()=>(window as any).qa.assistance)).toEqual([]);
 }
 expect((await receipts(page))).toHaveLength(3);expect(qa.errors).toEqual([]);
});
