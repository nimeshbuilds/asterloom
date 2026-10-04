import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {build} from 'esbuild';
import {createServer,type Server} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let folder:string,server:Server,address:string;
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(os.tmpdir(),'asterloom-data-investigation-'));
 const root=process.cwd();
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import DataBoard from '${root}/src/components/DataBoard';import LearningScene from '${root}/src/components/LearningScene';import{DATA_EXAMPLES}from'${root}/src/lib/extendedExamples';import{initialDataResponse,evaluateData}from'${root}/src/lib/dataEngine';
 const a=structuredClone(DATA_EXAMPLES[0]);a.questions[1].requireEvidenceRows=true;let changes=0;function App(){const [s,set]=useState(()=>initialDataResponse(a,JSON.parse(localStorage.getItem('investigation')||'null'))),[result,setResult]=useState(null);window.work={state:s,get changes(){return changes},result};const scene=new URLSearchParams(location.search).get('scene');return <main><h1>Evidence expedition</h1>{scene?<LearningScene interaction={scene==='overview'?'overview':'workspace'} snapshot={{nodes:[{id:'one',label:'Answer one',detail:'Prepared possibility'}],links:[],summary:'An exact-source quest.',metrics:[{label:'Chapter',value:'1 of 2'}]}} onSelect={()=>changes++}/>:<><DataBoard activity={a} response={s} onChange={next=>{changes++;set(next);setResult(null);localStorage.setItem('investigation',JSON.stringify(next));}}/><button onClick={()=>setResult(evaluateData(a,s))}>Evaluate investigation</button>{result&&<p role='status' data-testid='assessment'>{result.correct?'Supported by the records':'Revise the case'}{result.hintUsed?' · source consulted':''}</p>}</>}</main>}createRoot(document.getElementById('root')).render(<App/>);`;
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,format:'esm',platform:'browser',jsx:'automatic',target:'es2022',outfile:path.join(folder,'app.js'),nodePaths:['/private/tmp/asterloom-upgrade-tooling/node_modules']});
 server=createServer(async(req,res)=>{const name=req.url?.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><title>Evidence investigation</title><link rel="stylesheet" href="/app.css"><style>body{margin:0;padding:24px;font:16px Arial;background:#fffdf8}main{max-width:1100px;margin:auto}button{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');return;}try{const file=name==='/app.js'?'app.js':name==='/app.css'?'app.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});
test.beforeEach(async({page})=>{await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{value:1});});});

test('record inspection, evidence decisions and pair comparisons survive a reload without changing the population',async({page})=>{
 await page.goto(address);const inspector=page.getByRole('complementary',{name:'Record inspector'}),file=page.getByRole('region',{name:'Evidence for the current question'});
 await page.getByRole('button',{name:'Inspect Morning A: Temperature 18 °C',exact:true}).click();await expect(inspector).toContainText('north');
 await inspector.getByRole('button',{name:'Pin to this question',exact:true}).click();await inspector.getByRole('button',{name:'Compare this record'}).click();
 await page.getByRole('button',{name:'Inspect Morning B: Temperature 22 °C'}).focus();await page.keyboard.press('Enter');await inspector.getByRole('button',{name:'Pin to this question',exact:true}).click();await inspector.getByRole('button',{name:'Compare this record'}).click();
 await expect(page.getByRole('region',{name:'Side-by-side record comparison'})).toContainText('Morning A');await expect(file).toContainText('2 pinned');
 await page.screenshot({path:'.qa/game-quality-review/data-desktop.png',fullPage:true});
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.getByLabel('Explore a column').selectOption('zone');await page.getByLabel('Contains',{exact:true}).fill('south');await expect(file).toContainText('2 outside this view');await expect(page.locator('.data-axis')).toContainText('+26');
 await page.reload();await expect(file).toContainText('2 pinned');await expect(inspector).toContainText('Morning B');await expect(page.getByLabel('Contains',{exact:true})).toHaveValue('south');
 await page.getByRole('button',{name:/2 How many records belong/}).click();await expect(file).toContainText('0 pinned');await expect(page.getByRole('region',{name:'Side-by-side record comparison'})).toContainText('Morning B');
 expect(await page.evaluate(()=>(window as any).work.state.evidenceRows['north-mean'])).toEqual(['a','b']);
});

test('a plausible numerical answer with the wrong evidence fails, revision succeeds, and consulted source stays supported',async({page})=>{
 await page.goto(address);const inspector=page.getByRole('complementary',{name:'Record inspector'});
 for(const label of ['Morning A: Temperature 18 °C','Morning C: Temperature 26 °C']){await page.getByRole('button',{name:'Inspect '+label}).click();await inspector.getByRole('button',{name:'Pin to this question',exact:true}).click();}
 await page.getByLabel('Your numerical result',{exact:true}).nth(0).fill('20');await page.getByLabel('Your numerical result',{exact:true}).nth(1).fill('3');
 await page.getByText('Full data table and direct evidence controls',{exact:true}).click();const fields=page.locator('.data-text-controls fieldset');
 for(const label of ['Morning A','Morning B','Morning D'])await fields.nth(1).getByLabel(label,{exact:true}).check();
 await page.getByRole('button',{name:'Evaluate investigation'}).click();await expect(page.getByTestId('assessment')).toHaveText('Revise the case');
 await fields.nth(0).getByLabel('Morning C',{exact:true}).uncheck();await fields.nth(0).getByLabel('Morning B',{exact:true}).check();await page.getByRole('button',{name:'Evaluate investigation'}).click();await expect(page.getByTestId('assessment')).toHaveText('Supported by the records');
 await inspector.getByText('Trace this record to the source · supported practice',{exact:true}).click();await page.reload();await page.getByRole('button',{name:'Evaluate investigation'}).click();await expect(page.getByTestId('assessment')).toHaveText('Supported by the records · source consulted');
});

test('missing values have their own mark and the investigation remains accessible on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(address);
 await page.getByRole('button',{name:'Inspect Morning D: Temperature Not recorded'}).click();await expect(page.locator('.data-missing-mark')).toHaveText('?');await expect(page.getByRole('complementary',{name:'Record inspector'})).toContainText('Not recorded');
 await expect(page.locator('.data-records')).toContainText('18 °C');await page.evaluate(()=>document.fonts.ready);
 const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.data-filter input,.data-filter select,.data-answer input')].map(element=>({tag:element.tagName,right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width,parentWidth:element.parentElement!.getBoundingClientRect().width}))}));
 expect(layout.width,JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport+1);
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
 await page.screenshot({path:'.qa/game-quality-review/data-mobile.png',fullPage:true});
});

test('overview scene carries context without a second set of answer controls; explicit workspace stays interactive',async({page})=>{
 await page.goto(address+'/?scene=overview');await expect(page.getByRole('button',{name:'Answer one',exact:false})).toHaveCount(0);await expect(page.locator('.scene-overview')).toBeVisible();await expect(page.locator('.scene-state-summary')).toContainText('An exact-source quest.');
 await page.goto(address+'/?scene=workspace');await page.getByRole('button',{name:'1 Answer one',exact:true}).click();expect(await page.evaluate(()=>(window as any).work.changes)).toBe(1);
 await expect(page.locator('.scene-object-tray')).toBeVisible();
});

test('filter and answer controls fit their columns with wide fallback font metrics at320 and390px',async({page})=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});await page.goto(address);await page.evaluate(()=>{document.body.style.fontFamily='monospace';document.body.style.fontSize='20px';});await page.evaluate(()=>document.fonts.ready);
  await page.getByLabel('Explore a column').selectOption('zone');await page.getByLabel('Contains',{exact:true}).fill('north');await expect(page.locator('.data-records')).toContainText('Morning A');await page.getByLabel('Your numerical result',{exact:true}).first().fill('20');
  const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.data-filter input,.data-filter select,.data-answer input')].map(element=>{const rect=element.getBoundingClientRect(),parent=element.parentElement!.getBoundingClientRect();return{tag:element.tagName,left:rect.left,right:rect.right,parentRight:parent.right,width:rect.width,parentWidth:parent.width};})}));
  expect(layout.width,JSON.stringify(layout)).toBeLessThanOrEqual(width+1);for(const control of layout.controls){expect(control.right,JSON.stringify(control)).toBeLessThanOrEqual(control.parentRight+1);expect(control.left).toBeGreaterThanOrEqual(0);}
 }
});
