import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {build} from 'esbuild';
import {createServer,type Server} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
let folder:string,server:Server,address:string;
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(os.tmpdir(),'asterloom-model-workspace-'));const root=process.env.ASTERLOOM_COMPONENT_ROOT||process.cwd();
 const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import ClassificationBoard from '${root}/src/components/ClassificationBoard';import DependencyBoard from '${root}/src/components/DependencyBoard';
 const sorting={kind:'classification',items:[{id:'fern',label:'Fern'},{id:'moss',label:'Moss'},{id:'pine',label:'Pine'}],categories:[{id:'spores',label:'Makes spores'},{id:'leaves',label:'Has leaves'}],membership:[]};const graph={kind:'dependency',nodes:[{id:'sun',label:'Sunlight'},{id:'plant',label:'Plant'},{id:'oxygen',label:'Oxygen'}],edges:[{from:'sun',to:'plant',relation:'supplies energy to'},{from:'plant',to:'oxygen',relation:'releases'}]};
 function App(){const mode=location.search.includes('graph')?'graph':'sort';const [s,set]=useState(()=>JSON.parse(localStorage.getItem(mode)||'null')||(mode==='sort'?{response:{assignments:{fern:[],moss:[],pine:[]}},selected:''}:{response:{edges:[]},draft:{from:'',to:'',relation:''}}));const save=value=>{set(value);localStorage.setItem(mode,JSON.stringify(value));};window.model=s;return <main><h1>Source model workshop</h1>{mode==='sort'?<ClassificationBoard activity={sorting} response={s.response} selectedItemId={s.selected} onSelect={selected=>save({...s,selected})} onChange={response=>save({...s,response})}/>:<DependencyBoard activity={graph} response={s.response} draft={s.draft} onDraftChange={draft=>save({...s,draft})} onChange={response=>save({...s,response})}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);`;
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,jsx:'automatic',format:'esm',platform:'browser',target:'es2022',outfile:path.join(folder,'app.js'),nodePaths:['/private/tmp/asterloom-upgrade-tooling/node_modules']});
 server=createServer(async(req,res)=>{if(req.url?.split('?')[0]==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><title>Source model workshop</title><link rel="stylesheet" href="/app.css"><style>body{margin:0;padding:24px;font:16px Arial;background:#fffdf8}main{max-width:1100px;margin:auto}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');return;}try{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});

test('sorting moves actual source items, supports multiple groups, revises placements and restores the selected item',async({page})=>{
 await page.goto(address);await page.getByRole('button',{name:/^1 Fern Not placed/}).focus();await page.keyboard.press('Enter');
 const spores=page.getByRole('region',{name:'Makes spores',exact:true}),leaves=page.getByRole('region',{name:'Has leaves',exact:true});
 await spores.getByRole('button',{name:'Place Fern here',exact:true}).click();await leaves.getByRole('button',{name:'Place Fern here',exact:true}).click();await expect(spores.getByRole('list')).toContainText('Fern');await expect(leaves.getByRole('list')).toContainText('Fern');
 await page.reload();await expect(page.getByRole('button',{name:/^1 Fern 2 groups/})).toHaveAttribute('aria-pressed','true');await expect(spores.getByRole('button',{name:'Selected item is here'})).toBeDisabled();
 await leaves.getByRole('button',{name:'Remove Fern from Has leaves'}).click();await expect(leaves.getByRole('list')).not.toContainText('Fern');expect(await page.evaluate(()=>(window as any).model.response.assignments.fern)).toEqual(['spores']);
 await page.screenshot({path:'.qa/game-quality-review/classification-desktop.png',fullPage:true});
});

test('a dragged item is placed idempotently and direct controls edit the same groups',async({page})=>{
 await page.goto(address);const moss=page.getByRole('button',{name:/^2 Moss Not placed/}),spores=page.getByRole('region',{name:'Makes spores',exact:true});
 await moss.dragTo(spores);await expect(spores.getByRole('list')).toContainText('Moss');
 await page.getByRole('button',{name:/^2 Moss 1 group/}).dragTo(spores);expect(await page.evaluate(()=>(window as any).model.response.assignments.moss)).toEqual(['spores']);
 await page.getByText('Direct category controls',{exact:true}).click();const fields=page.locator('.model-text-controls fieldset');await fields.filter({has:page.getByText('Moss',{exact:true})}).getByLabel('Has leaves',{exact:true}).check();await expect(page.getByRole('region',{name:'Has leaves',exact:true}).getByRole('list')).toContainText('Moss');
});

test('source concepts form directed explicit connections, survive reload, reject duplicates and can be revised',async({page})=>{
 await page.goto(address+'/?graph');await page.getByRole('button',{name:'Select concept Plant',exact:true}).click();await page.getByRole('radio',{name:'releases',exact:true}).check();await page.getByRole('button',{name:'Select concept Oxygen',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('region',{name:'Relationships in your model'})).toContainText('No connections yet');await page.getByRole('button',{name:'Connect concepts',exact:true}).click();
 let model=await page.evaluate(()=>(window as any).model);expect(model.response.edges).toEqual([{from:'plant',to:'oxygen',relation:'releases'}]);
 await page.reload();await expect(page.getByRole('button',{name:'Select concept Plant',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('radio',{name:'releases',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Connect concepts',exact:true}).click();await expect(page.getByRole('status')).toContainText('already in your model');expect(await page.evaluate(()=>(window as any).model.response.edges.length)).toBe(1);
 await page.getByRole('button',{name:'Remove connection Plant releases Oxygen',exact:true}).click();await expect(page.getByRole('region',{name:'Relationships in your model'})).toContainText('No connections yet');
 await page.getByRole('button',{name:/1 · Starting concept/}).click();await page.getByRole('button',{name:'Select concept Sunlight',exact:true}).click();await page.getByRole('radio',{name:'supplies energy to'}).check();await page.getByRole('button',{name:'Select concept Plant',exact:true}).click();await page.getByRole('button',{name:'Connect concepts',exact:true}).click();
 model=await page.evaluate(()=>(window as any).model);expect(model.response.edges).toEqual([{from:'sun',to:'plant',relation:'supplies energy to'}]);
 await page.screenshot({path:'.qa/game-quality-review/relationships-desktop.png',fullPage:true});
});

test('both primary boards and their text equivalents remain keyboard accessible on narrow screens',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const suffix of ['','/?graph']){await page.goto(address+suffix);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await page.locator('.model-text-controls summary').click();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);}
});
