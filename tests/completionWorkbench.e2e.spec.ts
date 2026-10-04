import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer,type Server} from 'node:http';
import AxeBuilder from '@axe-core/playwright';
let server:Server,folder:string,address:string;
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'asterloom-completion-board-'));
 await build({stdin:{contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import CompletionBoard from'./src/components/CompletionBoard';import'./src/styles.css';
 import{COMPLETION_EXAMPLES}from'./src/lib/extendedExamples';import{evaluateCompletion,initialCompletionResponse}from'./src/lib/completionEngine';
 const params=new URLSearchParams(location.search),index=params.has('pattern')?1:params.has('query')?2:0,activity=structuredClone(COMPLETION_EXAMPLES[index]);
 if(params.has('alternative')){activity.tokens.push({id:'measurement-note',label:'a measured observation'});activity.slots[0].acceptedTokenIds.push('measurement-note');activity.context+=' In this authored example, a measured observation is also an accepted phrase for the measurement.';activity.sourceRefs[0].evidence+=' A measured observation is an accepted alternate phrase for an observation in this exercise.';}
 function Harness(){const[state,setState]=useState(()=>initialCompletionResponse(activity,JSON.parse(localStorage.getItem('model-'+index)||'null'))),[result,setResult]=useState(null);return <main style={{maxWidth:980,margin:'auto',padding:'24px 18px'}}><h1>Source construction</h1><h2>{activity.title}</h2><p style={{color:'#324d35'}}>{activity.instruction}</p><CompletionBoard activity={activity} response={state} onChange={next=>{setState(next);setResult(null);localStorage.setItem('model-'+index,JSON.stringify(next));}}/><button style={{padding:14,border:'1px solid #738b71',marginTop:20}} onClick={()=>setResult(evaluateCompletion(activity,state))}>Check constructed model</button>{result&&<p role="status" style={{color:'#274830'}}>{result.correct?'Source rules satisfied':result.valid?'Revisit the source relationships':'Complete all positions first'}</p>}</main>}
 createRoot(document.getElementById('root')).render(<Harness/>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',outfile:path.join(folder,'completion.js'),jsx:'automatic',loader:{'.woff2':'dataurl'}});
 server=createServer(async(req,res)=>{try{const name=req.url?.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Completion construction verification</title><link rel="stylesheet" href="/completion.css"></head><body><div id="root"></div><script type="module" src="/completion.js"></script></body></html>');return;}const file=name==='/completion.js'?'completion.js':name==='/completion.css'?'completion.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});
async function select(page:Page,label:string){const piece=page.getByRole('region',{name:'Prepared source pieces'}).getByRole('button',{name:label,exact:true});await piece.focus();await page.keyboard.press('Enter');}
async function place(page:Page,index:number){await page.getByRole('button',{name:`Place selected piece at position ${index}`,exact:true}).focus();await page.keyboard.press('Enter');}
test('keyboard pieces build the actual model, survive reload, and support clearing, correction and native controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(address);
 await expect(page.getByRole('combobox',{name:'Complete position 1',exact:true})).toBeHidden();await select(page,'an interpretation');await place(page,1);await select(page,'an observation');await place(page,2);
 await expect(page.getByText('2 of 2 places built')).toBeVisible();await page.getByRole('button',{name:'Check constructed model',exact:true}).click();await expect(page.getByText('Revisit the source relationships',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('.completion-token[aria-pressed=true]')).toContainText('an observation');await expect(page.locator('.completion-slot').first().locator('.completion-placement')).toContainText('an interpretation');await place(page,1);await select(page,'an interpretation');await place(page,2);
 await page.getByRole('button',{name:'Check constructed model',exact:true}).click();await expect(page.getByText('Source rules satisfied',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Clear position 2',exact:true}).click();await expect(page.getByText('1 of 2 places built')).toBeVisible();await page.getByText('Choose pieces directly',{exact:true}).click();await page.getByRole('combobox',{name:'Complete position 2',exact:true}).selectOption('interpretation');await page.getByRole('button',{name:'Check constructed model',exact:true}).click();await expect(page.getByText('Source rules satisfied',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('the tray permits repeated pattern pieces and reviewed alternatives',async({page})=>{
 await page.goto(address+'/?pattern');await select(page,'● Circle');await place(page,1);await place(page,2);await select(page,'▲ Triangle');await place(page,3);await page.getByRole('button',{name:'Check constructed model',exact:true}).click();await expect(page.getByText('Source rules satisfied',{exact:true})).toBeVisible();
 await page.goto(address+'/?alternative');await select(page,'a measured observation');await place(page,1);await select(page,'an interpretation');await place(page,2);await page.getByRole('button',{name:'Check constructed model',exact:true}).click();await expect(page.getByText('Source rules satisfied',{exact:true})).toBeVisible();
});
test('query and picture-pattern layouts are accessible without horizontal overflow',async({browser})=>{
 await mkdir('.qa/completion-workbench',{recursive:true});for(const query of ['query','pattern'])for(const width of [1280,390]){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();await page.goto(address+'/?'+query);await page.locator('.completion-token').first().click();await place(page,1);await page.screenshot({path:`.qa/completion-workbench/${query}-${width}.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const results=await new AxeBuilder({page}).analyze();expect(results.violations).toEqual([]);await context.close();}
});
