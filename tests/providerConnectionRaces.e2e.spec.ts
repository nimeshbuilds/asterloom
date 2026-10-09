import {test,expect,type Page,type Route} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {createServer,type Server} from 'node:http';import AxeBuilder from '@axe-core/playwright';
import {claudeBrowserFixture} from './claudeLogin.fixture.mjs';
let server:Server,folder:string,address:string;
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'asterloom-provider-races-'));
 await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import ProviderConnection from'./src/components/ProviderConnection';import'./src/styles.css';
 window.connectionTest={changes:[],opened:[]};window.open=(url)=>{window.connectionTest.opened.push(String(url));return null;};
 function Harness(){const[config,setConfig]=useState({provider:'openai',apiKey:'',model:''}),[shown,setShown]=useState(true);window.connectionTest.config=config;return <main style={{maxWidth:920,margin:'0 auto',padding:20}}><h1>Optional AI connections</h1><button onClick={()=>setShown(!shown)}>Toggle account panel</button>{shown&&<ProviderConnection config={config} onChange={next=>{window.connectionTest.changes.push(next);setConfig(next);}}/>}</main>};createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',outfile:path.join(folder,'provider.js'),jsx:'automatic',loader:{'.woff2':'dataurl'}});
 await writeFile(path.join(folder,'index.html'),'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Provider connection verification</title><link rel="stylesheet" href="/provider.css"></head><body><div id="root"></div><script type="module" src="/provider.js"></script></body></html>');
 server=createServer(async(req,res)=>{try{const name=req.url?.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Provider connection verification</title><link rel="stylesheet" href="/provider.css"></head><body><div id="root"></div><script type="module" src="/provider.js"></script></body></html>');return;}const file=name==='/provider.js'?'provider.js':name==='/provider.css'?'provider.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});
const engine=(id='codex')=>({id,enabled:true,installed:true,installing:false,pending:false,connected:false,authUrl:undefined as string|undefined,verificationUrl:undefined as string|undefined,userCode:undefined as string|undefined});
const check=(page:Page)=>page.getByRole('button',{name:'Check connections',exact:true});
async function models(page:Page){await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'model-a',name:'Model A'},{id:'model-b',name:'Model B'}],notice:'Catalog entries are not a guarantee of account access.'}}));}

test('delayed device-login link opens once, preserves later API choices, and does not reset a selected model',async({page})=>{
 const grok=engine('grok'),rows=[engine(),grok];await models(page);
 await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:rows}}));
 await page.route('**/api/ai/engines/grok/login',route=>{grok.pending=true;return route.fulfill({json:{pending:true}});});
 await page.goto(address);await page.getByRole('button',{name:'Continue with Grok',exact:true}).click();await expect(page.getByRole('button',{name:'Waiting for your sign-in…',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).connectionTest.opened)).toEqual([]);
 grok.verificationUrl='https://accounts.x.ai/device';grok.userCode='SAFE-CODE';await check(page).click();await expect(page.getByRole('link',{name:'Reopen the provider’s sign-in page'})).toHaveAttribute('href',grok.verificationUrl);await expect(page.locator('.provider-login')).toContainText('SAFE-CODE');await check(page).click();expect(await page.evaluate(()=>(window as any).connectionTest.opened)).toEqual([grok.verificationUrl]);
 await page.getByRole('combobox',{name:'AI provider',exact:true}).selectOption('anthropic');await page.getByLabel('API key · this session only',{exact:true}).fill('keep-this-session-key');grok.pending=false;grok.connected=true;await check(page).click();await expect(page.locator('.provider-login')).toHaveCount(0);await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('anthropic');await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveValue('keep-this-session-key');
 await page.getByRole('button',{name:'Use Grok',exact:true}).click();await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('model-b');await check(page).click();await check(page).click();await page.getByRole('button',{name:'Use Grok',exact:true}).click();await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('model-b');await expect(page.locator('.provider-status')).toContainText('catalog');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('keep-this-session-key');
});

test('cancel and unmount invalidate late sign-in responses before they can open a browser or change selection',async({page})=>{
 const row=engine();let loginRoute:Route|undefined;await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[row]}}));await page.route('**/api/ai/engines/codex/login',route=>{loginRoute=route;});await page.route('**/api/ai/engines/codex/cancel',route=>route.fulfill({json:{}}));
 await page.goto(address);await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click();await expect.poll(()=>!!loginRoute).toBe(true);await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toBeEnabled();await loginRoute!.fulfill({json:{authUrl:'https://auth.openai.com/codex/device'}});await expect(page.locator('.provider-login')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).connectionTest.opened)).toEqual([]);
 loginRoute=undefined;await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click();await expect.poll(()=>!!loginRoute).toBe(true);await page.getByRole('button',{name:'Toggle account panel'}).click();await loginRoute!.fulfill({json:{connected:true}});await page.getByRole('button',{name:'Toggle account panel'}).click();await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('openai');expect(await page.evaluate(()=>(window as any).connectionTest.changes)).toEqual([]);
});

test('connection polls are single-flight and a pre-logout response cannot restore a disconnected account',async({page})=>{
 const row=engine();row.connected=true;let hold=false,held:Route|undefined,heldCalls=0;await models(page);
 await page.route('**/api/ai/engines',async route=>{if(hold){heldCalls++;held=route;return;}await route.fulfill({json:{engines:[row]}});});await page.route('**/api/ai/engines/codex/logout',route=>{row.connected=false;hold=false;return route.fulfill({json:{}});});
 await page.goto(address);await page.getByRole('button',{name:'Use Codex',exact:true}).click();await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('model-a');hold=true;await check(page).click();await expect.poll(()=>!!held).toBe(true);await check(page).click();await check(page).click();expect(heldCalls).toBe(1);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toBeEnabled();await held!.fulfill({json:{engines:[{...row,connected:true}]}});await expect(page.getByRole('button',{name:'Use Codex',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('openai');
});

test('install completion starts one login and an ended device flow becomes retryable',async({page})=>{
 const row=engine();row.installed=false;let logins=0;await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[row]}}));await page.route('**/api/ai/engines/codex/install',route=>{row.installing=true;return route.fulfill({json:{installing:true}});});await page.route('**/api/ai/engines/codex/login',route=>{logins++;row.pending=true;return route.fulfill({json:{pending:true}});});
 await page.goto(address);await page.getByRole('button',{name:'Install Codex & sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Installing official engine…'})).toBeVisible();row.installed=true;row.installing=false;await check(page).click();await expect.poll(()=>logins).toBe(1);await check(page).click();expect(logins).toBe(1);row.pending=false;await check(page).click();await expect(page.locator('.provider-error')).toContainText('Sign-in ended');await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toBeEnabled();
});

test('malformed responses are recoverable and stale model discovery cannot replace a different provider',async({page})=>{
 let valid=false;await page.route('**/api/ai/engines',route=>route.fulfill({json:valid?{engines:[engine()]}:{engines:{invalid:true}}}));let catalog:Route|undefined;await page.route('**/api/models',route=>{catalog=route;});await page.goto(address);await expect(page.locator('.provider-error')).toContainText('unreadable connection status');valid=true;await check(page).click();await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toBeEnabled();
 await page.getByLabel('API key · this session only',{exact:true}).fill('first-key');await page.getByRole('button',{name:'Refresh available models',exact:true}).click();await expect.poll(()=>!!catalog).toBe(true);await catalog!.fulfill({json:{models:null}});await expect(page.locator('.provider-status')).toContainText('unreadable model catalog');await expect(page.getByRole('button',{name:'Refresh available models',exact:true})).toBeEnabled();
 catalog=undefined;await page.getByRole('button',{name:'Refresh available models',exact:true}).click();await expect.poll(()=>!!catalog).toBe(true);await page.getByRole('combobox',{name:'AI provider',exact:true}).selectOption('anthropic');await page.getByLabel('API key · this session only',{exact:true}).fill('new-key');await catalog!.fulfill({json:{models:[{id:'stale-model',name:'Stale model'}]}});await expect(page.getByRole('combobox',{name:'Available models',exact:true})).toHaveCount(0);await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveValue('new-key');
});

test('saved sign-in is not described as verified entitlement and account controls fit narrow screens',async({browser})=>{
 await mkdir('.qa/provider-connections',{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[{...engine('grok'),connected:true,connectionState:'saved',reason:'Saved sign-in. The next request will check your account access.'},{...engine(),enabled:false,reason:'This distribution does not enable managed sign-in.'}]}}));await models(page);await page.goto(address);await expect(page.locator('.provider-badge.connected')).toHaveText('Saved sign-in');await expect(page.locator('.subscription-grid')).toContainText('The next request will check your account access');await expect(page.getByRole('link',{name:'Open Grok account'})).toHaveAttribute('href','https://grok.com/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include('.provider-connection').analyze()).violations).toEqual([]);await page.screenshot({path:'.qa/provider-connections/narrow.png',fullPage:true,animations:'disabled'});await context.close();
});

test('Claude uses the selected official sign-in method and returns CLI aliases without needing an API key',async({page})=>{
 const row=engine('claude');let method='';await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[row]}}));await page.route('**/api/ai/engines/claude/login',route=>{method=route.request().postDataJSON().method;row.pending=true;row.authUrl='https://claude.com/cai/oauth/authorize?state=local-test';return route.fulfill({json:{pending:true,authUrl:row.authUrl}});});await page.route('**/api/models',route=>{expect(route.request().postDataJSON()).toMatchObject({provider:'claude-code',apiKey:''});return route.fulfill({json:{models:[{id:'sonnet',name:'Sonnet'}],notice:'Official CLI aliases; actual access is checked by Claude Code.'}});});
 await page.goto(address);await page.getByRole('combobox',{name:'Claude sign-in method',exact:true}).selectOption('sso');await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();await expect(page.getByRole('link',{name:'Reopen the provider’s sign-in page'})).toHaveAttribute('href',row.authUrl!);expect(method).toBe('sso');row.pending=false;row.connected=true;await check(page).click();await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('claude-code');await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('sonnet');await expect(page.locator('.provider-status')).toContainText('Official CLI aliases');await expect(page.locator('.provider-status')).toContainText('1 models returned');await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('local-test');
});


test('Claude SSO browser approval code reaches the exact local CLI and unlocks models without exposing or retaining the code',async({page})=>{
 const fixture=await claudeBrowserFixture({distDir:folder});
 try{
  await page.setViewportSize({width:390,height:844});await page.goto(fixture.address);
  await page.getByRole('combobox',{name:'Claude sign-in method',exact:true}).selectOption('sso');await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();
  const input=page.getByLabel('Claude browser sign-in code',{exact:true});await expect(input).toBeVisible();await expect(input).toHaveAttribute('type','password');await expect(input).toHaveAttribute('autocomplete','off');
  expect(fixture.calls.filter((call:any)=>call.args[1]==='login').map((call:any)=>call.args)).toEqual([['auth','login','--sso']]);
  expect(await page.evaluate(()=>(window as any).connectionTest.opened)).toEqual(['https://claude.com/cai/oauth/authorize?state=synthetic-state']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include('.provider-connection').analyze()).violations).toEqual([]);
  await input.fill(fixture.code);await page.getByRole('button',{name:'Complete Claude sign-in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Use Claude Code',exact:true})).toBeVisible();await expect(input).toHaveCount(0);await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('claude-code');
  await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('sonnet');await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('sonnet');
  const login=fixture.calls.find((call:any)=>call.args[1]==='login');expect(login.input()).toBe(fixture.code+'\n');expect(JSON.stringify(login.args)+JSON.stringify(login.options.env)).not.toContain(fixture.code);
  expect(await page.locator('body').textContent()).not.toContain(fixture.code);expect(JSON.stringify(await fixture.claude.status())).not.toContain(fixture.code);
  expect(await page.evaluate(()=>JSON.stringify({local:localStorage,session:sessionStorage,config:(window as any).connectionTest.config}))).not.toContain(fixture.code);
 }finally{await fixture.close();}
});

test('Claude code is cleared on send and cancel, and reopening the panel cannot reuse a canceled login',async({page})=>{
 const fixture=await claudeBrowserFixture({distDir:folder,holdCode:true});
 try{
  await page.goto(fixture.address);await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();const input=page.getByLabel('Claude browser sign-in code',{exact:true});await input.fill(fixture.code);
  const original=(await fixture.claude.status()).loginContinuation.sessionId;await page.getByRole('button',{name:'Complete Claude sign-in',exact:true}).click();await expect(input).toHaveValue('');await expect(input).toBeDisabled();
  await expect(page.getByRole('button',{name:'Waiting for Claude to confirm…',exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();await expect(input).toHaveCount(0);
  expect(fixture.calls.find((call:any)=>call.args[1]==='login').child.signalCode).toBeTruthy();await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();await expect(input).toHaveValue('');await expect(input).toBeEnabled();
  expect((await fixture.claude.status()).loginContinuation.sessionId).not.toBe(original);await input.fill('another-synthetic-code');await page.getByRole('button',{name:'Toggle account panel'}).click();await page.getByRole('button',{name:'Toggle account panel'}).click();await expect(input).toHaveValue('');
  const stale=await page.request.post(fixture.address+'/api/ai/engines/claude/login-code',{data:{sessionId:original,code:fixture.code}});expect(stale.status()).toBe(409);expect(fixture.calls.filter((call:any)=>call.args[1]==='login').at(-1).input()).toBe('');
  await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();await expect(input).toHaveCount(0);expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain(fixture.code);
 }finally{await fixture.close();}
});

test('Claude rejected codes get an actionable retry without leaking echoed CLI text or pretending the account connected',async({page})=>{
 const fixture=await claudeBrowserFixture({distDir:folder,rejectCode:true});
 try{
  await page.goto(fixture.address);await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();const input=page.getByLabel('Claude browser sign-in code',{exact:true});await input.fill(fixture.code);await page.getByRole('button',{name:'Complete Claude sign-in',exact:true}).click();
  await expect(input).toHaveCount(0);await expect(page.getByRole('button',{name:'Continue with Claude',exact:true})).toBeEnabled();await expect(page.locator('.provider-connection')).toContainText('It may be expired or incomplete');
  await expect(page.getByRole('button',{name:'Use Claude Code',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'AI provider',exact:true})).toHaveValue('openai');expect(await page.locator('body').textContent()).not.toContain(fixture.code);
  await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();await expect(input).toHaveValue('');await expect(input).toBeEnabled();
 }finally{await fixture.close();}
});

test('Claude sign-in expiration clears the code field and offers a fresh sign-in without an automatic retry',async({page})=>{
 const fixture=await claudeBrowserFixture({distDir:folder,holdCode:true,loginTimeout:2200});
 try{
  await page.goto(fixture.address);await page.getByRole('button',{name:'Continue with Claude',exact:true}).click();const input=page.getByLabel('Claude browser sign-in code',{exact:true});await input.fill('synthetic-unsent-code');
  await expect(input).toHaveCount(0);await expect(page.locator('.provider-connection')).toContainText('Claude sign-in expired');await expect(page.getByRole('button',{name:'Continue with Claude',exact:true})).toBeEnabled();
  const logins=fixture.calls.filter((call:any)=>call.args[1]==='login');expect(logins).toHaveLength(1);expect(logins[0].input()).toBe('');expect(logins[0].child.signalCode).toBeTruthy();expect(await page.locator('body').textContent()).not.toContain('synthetic-unsent-code');
 }finally{await fixture.close();}
});
