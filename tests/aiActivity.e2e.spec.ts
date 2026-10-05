import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {createServer,type Server} from 'node:http';

const firstId='request-11111111-1111-4111-8111-111111111111';
const nextId='request-22222222-2222-4222-8222-222222222222';
let server:Server,address:string;
test.beforeAll(async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import AIActivityPanel from'./src/components/AIActivityPanel';
 function Harness(){const[running,setRunning]=useState(true),[id,setId]=useState('${firstId}');const receipt={id,stage:'write',provider:'openai',model:'fixture-no-provider',startedAt:'2026-10-05T12:00:00.000Z',status:'running',usage:{status:'unavailable'}};return <main><h1>AI activity lifecycle verification</h1><button onClick={()=>setRunning(false)}>Cancel creation</button><button onClick={()=>{setId('${nextId}');setRunning(true);}}>Start another request</button><AIActivityPanel receipt={receipt} running={running}/></main>;}createRoot(document.getElementById('root')).render(<Harness/>);`},bundle:true,format:'esm',target:'es2022',jsx:'automatic',write:false});
 server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);}else if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="en"><head><title>AI activity verification</title></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}else{response.writeHead(404);response.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
function status(requestId:string,state:'running'|'canceled'|'completed'='running'){
 const at='2026-10-05T12:00:00.000Z',phase=state==='running'?'generating':state;
 return {requestId,status:state,phase,startedAt:at,updatedAt:at,events:[{at,phase,message:state==='running'?'The provider is generating this stage.':state==='canceled'?'This request was canceled.':'The provider request completed.'}],reasoningSummaryAvailable:false};
}
const headline=(page:Page)=>page.locator('.ai-activity-content').getByRole('status');

test('activity is opt-in and keeps checking a stopped creation until the provider confirms cancellation',async({page})=>{
 let reads=0,state:'running'|'canceled'='running';
 await page.route('**/api/generate/status/*',async route=>{reads++;await route.fulfill({json:status(firstId,state)});});
 await page.goto(address);await expect(page.getByRole('heading')).toBeVisible();
 await page.waitForTimeout(1700);expect(reads).toBe(0);
 await page.locator('summary').click();await expect(headline(page)).toHaveText('AI is preparing the response');
 await page.locator('summary').click();const closedReads=reads;await page.waitForTimeout(1700);expect(reads).toBe(closedReads);
 await page.locator('summary').click();await expect(headline(page)).toHaveText('AI is preparing the response');
 await page.getByRole('button',{name:'Cancel creation',exact:true}).click();
 await expect(headline(page)).toHaveText('Creation is no longer running. Checking the provider’s final status…');
 await expect(page.locator('.ai-activity-content')).toContainText('Last reported: AI is preparing the response');
 const afterCancel=reads;state='canceled';
 await expect(headline(page)).toHaveText('Request canceled');expect(reads).toBeGreaterThan(afterCancel);
 const finalReads=reads;await page.waitForTimeout(1700);expect(reads).toBe(finalReads);
 await expect(page.locator('.ai-activity-content')).not.toContainText('Last reported:');
 await expect(page.locator('.ai-activity-content')).toContainText('does not expose a public reasoning summary');
});

for(const errorCode of [503,404])test(`HTTP ${errorCode} replaces stale live progress with an explicit unavailable status`,async({page})=>{
 let responseCode=200;
 await page.route('**/api/generate/status/*',route=>route.fulfill({status:responseCode,json:responseCode===200?status(firstId):{error:'Fixture unavailable'}}));
 await page.goto(address);await page.locator('summary').click();await expect(headline(page)).toHaveText('AI is preparing the response');
 responseCode=errorCode;
 await expect(headline(page)).toContainText(errorCode===404?'Live details are unavailable':'Live activity is temporarily unavailable');
 await expect(headline(page)).not.toContainText('AI is preparing the response');
 await expect(page.locator('.ai-activity-content')).toContainText('Last reported: AI is preparing the response');
 // Stale elapsed time must stop advancing while the live endpoint is unavailable.
 const time=await page.locator('dd').first().textContent();await page.waitForTimeout(1700);await expect(page.locator('dd').first()).toHaveText(time!);
});

test('a canceled creation stops polling after the bounded confirmation window',async({page})=>{
 await page.clock.install({time:new Date('2026-10-05T12:00:00Z')});let reads=0;
 await page.route('**/api/generate/status/*',route=>{reads++;return route.fulfill({json:status(firstId)});});
 await page.goto(address);await page.locator('summary').click();await expect(headline(page)).toHaveText('AI is preparing the response');
 await page.getByRole('button',{name:'Cancel creation',exact:true}).click();await expect(headline(page)).toContainText('Creation is no longer running');
 await page.clock.fastForward(31_000);await expect(headline(page)).toHaveText('Creation is stopped. The provider’s final status could not be confirmed.');
 const finalReads=reads;await page.clock.fastForward(60_000);expect(reads).toBe(finalReads);
});

test('an old request response cannot overwrite the current request status',async({page})=>{
 let release!:()=>void,oldStarted=false;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/generate/status/*',async route=>{const id=route.request().url().split('/').at(-1)!;if(id===firstId){oldStarted=true;await pending;}await route.fulfill({json:status(id,id===firstId?'running':'completed')}).catch(()=>{});});
 try{
  await page.goto(address);await page.locator('summary').click();await expect.poll(()=>oldStarted).toBe(true);
  await page.getByRole('button',{name:'Start another request',exact:true}).click();await expect(headline(page)).toHaveText('AI response received');
  release();await page.waitForTimeout(100);await expect(headline(page)).toHaveText('AI response received');await expect(page.locator('.ai-activity-content')).not.toContainText('The provider is generating this stage.');
 }finally{release();}
});
