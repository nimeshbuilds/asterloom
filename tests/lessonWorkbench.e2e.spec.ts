import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer,type Server} from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import {learnBeforeQuest} from './teachingDriver.mjs';
let server:Server,folder:string,address:string;
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'asterloom-workbench-'));
 await build({stdin:{contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import LearningBriefing from'./src/components/LearningBriefing';import'./src/styles.css';
 import{buildLearningBriefing}from'./src/lib/learningBriefing';import{createNotebook,createSource}from'./src/lib/utils';import{SCAFFOLDS}from'./src/data/scaffolds';
 const preschool=new URLSearchParams(location.search).has('preschool'),prose=new URLSearchParams(location.search).has('prose'),young=preschool||new URLSearchParams(location.search).has('young'),route=new URLSearchParams(location.search).has('route');
 const text=prose?'We looked at the supplied picture together and described what we could see. The source leaves the rest of the story open.':route?'Procedure for a source evidence check:\\n1. Read the supplied observation.\\n2. Compare it with the stated rule.\\n3. Record the decision with its source reference.':young?'Sun: the bright yellow circle at the top of this picture.\\nTree: the green shape below the yellow circle in this picture.\\nRiver: the blue line along the bottom of this picture.':'Packet: a small unit of data used by this training model.\\nFrame: the enclosing structure described only in this model.\\nBuffer: a temporary holding place in the modeled receiver.';
 const source={...createSource(text,young?'Picture annotations':'Network field guide'),id:'source'};
 const card={id:'card',prompt:'Choose the term from the source.',answer:'Packet',options:['Packet','Frame'],correctIndex:0,explanation:text,sourceId:'source',evidence:text,concept:'Packet',tags:[],questionType:'definition',reviewStatus:'reviewed'};
 const notebook=createNotebook({id:'workbench',title:young?'Prepare a picture guide':'Deliver the network field guide',ageGroup:preschool?'3-5':young?'9-11':'adult',sources:[source],cards:[card]});
 const plan=buildLearningBriefing({notebook,scaffold:SCAFFOLDS.find(s=>s.id==='recall-escape-mission')});
 const controls=window.workbench={fail:false,ready:0,writes:[],durable:JSON.parse(localStorage.getItem('kit')||'null')};
 function Harness(){const[saved,setSaved]=useState(controls.durable),[ready,setReady]=useState(false);return <main style={{padding:'24px 12px'}}>{ready?<div><h1>Quest opened</h1><p>Your preparation was saved.</p></div>:<LearningBriefing plan={plan} saved={saved} onSave={async next=>{controls.writes.push(structuredClone(next));if(controls.fail)return false;controls.durable=structuredClone(next);localStorage.setItem('kit',JSON.stringify(next));setSaved(next);return true;}} onReady={()=>{controls.ready++;setReady(true);}}/>}</main>}
 createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',outfile:path.join(folder,'workbench.js'),jsx:'automatic',loader:{'.woff2':'dataurl'},plugins:[{name:'presentation-only-stubs',setup(builder){builder.onResolve({filter:/^(\.\/WorldPreview|\.\.\/lib\/music)$/},args=>({path:args.path,namespace:'presentation-stub'}));builder.onLoad({filter:/.*/,namespace:'presentation-stub'},args=>({contents:args.path.includes('/music')?'export const duckMusic=()=>{};export const setLearningMusicPhase=()=>{};':'export default function Preview(){return null}',loader:'js'}));}}]});
 server=createServer(async(req,res)=>{try{const name=req.url?.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Source kit verification</title><link rel="stylesheet" href="/workbench.css"></head><body><div id="root"></div><script type="module" src="/workbench.js"></script></body></html>');return;}const file=name==='/workbench.js'?'workbench.js':name==='/workbench.css'?'workbench.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});
async function open(page:Page,query=''){await page.goto(address+'/'+query);await page.getByRole('button',{name:'Build my mission kit',exact:true}).click();await expect(page.locator('.lesson-workbench')).toBeVisible();}
async function place(page:Page,label:string,slot:number){const piece=page.locator('.lesson-kit-piece').filter({hasText:new RegExp('^'+label+'$')});await piece.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:`Place selected piece in slot ${slot}`,exact:true}).focus();await page.keyboard.press('Enter');}
async function checked(page:Page){await place(page,'Frame',2);await place(page,'Buffer',3);await page.getByRole('button',{name:'Check my kit against the source',exact:true}).click();await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeEnabled();}
test('keyboard kit feedback, saved selection and arrangement survive reload, and completion waits for a real save',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await open(page);
 await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeDisabled();
 await place(page,'Buffer',2);await place(page,'Frame',3);await page.getByRole('button',{name:'Check my kit against the source',exact:true}).click();
 await expect(page.getByText('Some pieces need another look.',{exact:false})).toBeVisible();await expect(page.locator('.lesson-kit-slot.revisit')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeDisabled();
 const frame=page.locator('.lesson-kit-piece').filter({hasText:/^Frame$/});await frame.click();await expect(page.getByText('Selected: Frame. Choose its place in your kit.',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).workbench.durable?.rehearsal?.selectedTileId)).toBe('term-1');
 await page.reload();await expect(page.locator('.lesson-kit-piece[aria-pressed=true]')).toContainText('Frame');await expect(page.locator('.lesson-kit-slot').nth(1).locator('.lesson-kit-place')).toContainText('Buffer');
 // Place the restored selection, then complete the remaining relationship.
 await page.getByRole('button',{name:'Place selected piece in slot 2',exact:true}).click();await place(page,'Buffer',3);await page.getByRole('button',{name:'Check my kit against the source',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeEnabled();await page.evaluate(()=>(window as any).workbench.fail=true);
 await page.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();await expect(page.getByRole('alert')).toContainText('has not been saved');await expect(page.getByRole('heading',{name:'Quest opened'})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).workbench.ready)).toBe(0);
 await page.evaluate(()=>(window as any).workbench.fail=false);await page.getByRole('button',{name:'Retry saving briefing',exact:true}).click();await expect(page.getByRole('heading',{name:'Quest opened'})).toBeVisible();expect(await page.evaluate(()=>(window as any).workbench.ready)).toBe(1);
 expect(errors).toEqual([]);
});
test('visible teaching driver completes both a term kit and a procedure kit without hidden answers',async({page})=>{
 await page.goto(address+'/');await learnBeforeQuest(page);await expect(page.getByRole('heading',{name:'Quest opened'})).toBeVisible();await page.evaluate(()=>localStorage.clear());await page.goto(address+'/?route');await learnBeforeQuest(page);await expect(page.getByRole('heading',{name:'Quest opened'})).toBeVisible();
});
test('adult and child workbenches remain legible, accessible and usable at narrow width',async({browser})=>{
 await mkdir('.qa/lesson-workbench',{recursive:true});
 for(const mode of ['adult','child'])for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();await page.goto(address+'/'+(mode==='child'?'?young':''));await expect(page.getByRole('list',{name:'How this quest plays'})).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`.qa/lesson-workbench/${mode}-mission-${width}.png`,fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Build my mission kit',exact:true}).click();await expect(page.locator('.lesson-workbench')).toBeVisible();
  if(mode==='adult')await checked(page);
  await page.screenshot({path:`.qa/lesson-workbench/${mode}-${width}.png`,fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);await context.close();
 }
});

 test('preschool preparation uses large manipulation controls and defaults reflection to a caregiver conversation',async({page})=>{
  await open(page,'?preschool');await expect(page.getByText('Let’s build together',{exact:true})).toBeVisible();await expect(page.getByRole('progressbar',{name:'Pieces placed',exact:false})).toHaveAttribute('value','1');await place(page,'Tree',2);await expect(page.getByRole('progressbar',{name:'Pieces placed',exact:false})).toHaveAttribute('value','2');await page.evaluate(()=>localStorage.clear());
  await page.goto(address+'/?preschool&prose');await page.getByRole('button',{name:'Explore the source',exact:true}).click();while(await page.getByRole('button',{name:/^Mark passage \d+ explored$/}).count())await page.getByRole('button',{name:/^Mark passage \d+ explored$/}).first().click();await page.getByRole('button',{name:'Study the walkthrough',exact:true}).click();while(await page.getByRole('button',{name:'Next walkthrough step',exact:true}).count())await page.getByRole('button',{name:'Next walkthrough step',exact:true}).click();await page.getByRole('button',{name:'Build my field note',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Talk or point with a grown-up instead of typing',exact:true})).toBeChecked();await expect(page.getByRole('textbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeDisabled();await learnBeforeQuest(page);await expect(page.getByRole('heading',{name:'Quest opened'})).toBeVisible();expect(await page.evaluate(()=>(window as any).workbench.durable.practice.mode)).toBe('spoken');
 });
