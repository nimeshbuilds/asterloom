import {test,expect,type Page,type TestInfo} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';
import path from 'node:path';

let server:Server,address:string;
const assetPaths=new Map<string,string>();
test.beforeAll(async()=>{
 const provenance=JSON.parse(await readFile('public/assets/aster/emotions/provenance.json','utf8'));
 expect(provenance.pending).toEqual([]);expect(provenance.assets).toHaveLength(50);
 for(const asset of provenance.assets){expect(asset.file).toMatch(/^[a-z-]+\.png$/);assetPaths.set('/assets/aster/emotions/'+asset.file,path.resolve('public/assets/aster/emotions',asset.file));}
 assetPaths.set('/assets/aster/aster-guide.png',path.resolve('public/assets/aster/aster-guide.png'));
 assetPaths.set('/assets/aster/agentic-aura.png',path.resolve('public/assets/aster/agentic-aura.png'));
 const contents=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import AsterGuide from'./src/components/AsterGuide';import{createNotebook,createSource}from'./src/lib/utils';import{setAsterPreferences,contextualAsterTip}from'./src/lib/asterGuidePolicy';import{CLEAN_DATA_CONSTRUCTION,COMPOSITION_EXAMPLE_SOURCE}from'./src/lib/compositionExamples';import{ASTER_EMOTIONS}from'./src/lib/asterEmotions';import'./src/styles.css';
 const parameters=new URLSearchParams(location.search),mode=parameters.get('mode')||'creation',preference=parameters.get('preference')||'helpful',running=parameters.get('running')==='true';
 const notes=createSource('Packet: A small unit of information. Router: A device that forwards packets between networks.','Network field notes');
 const notebook=createNotebook({id:'aster-entrance-fixture',title:'The source workshop',ageGroup:'adult',sources:[notes,COMPOSITION_EXAMPLE_SOURCE],cards:[],activities:[{...CLEAN_DATA_CONSTRUCTION,reviewStatus:'reviewed'}]});
 const feedback=parameters.get('stale')==='true'?{outcome:'success',eventKey:'old-saved-result',committed:true,score:{value:3,max:4,xp:20}}:undefined;
 const activityId=mode==='play'?CLEAN_DATA_CONSTRUCTION.id:undefined;
 window.entranceQA={readyAt:null,automaticAt:null,animations:[],connections:[],assistance:0,moves:0,tip:null,emotionMoments:Object.fromEntries(ASTER_EMOTIONS.map(emotion=>[emotion.id,emotion.moments]))};setAsterPreferences({mode:preference,dismissed:[]});
 for(const type of ['animationstart','animationend'])document.addEventListener(type,event=>{if(event.animationName==='aster-tip-notice'&&event.target.matches('.aster-launcher-portrait'))window.entranceQA.animations.push({type,name:event.animationName,at:performance.now()});if(event.animationName==='aster-connect-rise')window.entranceQA.connections.push({type,name:event.animationName});},true);
 new MutationObserver(()=>{if(document.querySelector('.aster-guide')?.dataset.guidance==='automatic'&&window.entranceQA.automaticAt===null)window.entranceQA.automaticAt=performance.now();}).observe(document.documentElement,{subtree:true,attributes:true,childList:true});
 function Harness(){const[count,setCount]=useState(0),[preferredHint,setPreferredHint]=useState('bright-celebration'),[connected,setConnected]=useState(parameters.get('connected')==='true');useEffect(()=>{window.entranceQA.readyAt=performance.now();window.entranceQA.connect=setConnected;window.entranceQA.rerender=()=>setCount(value=>value+1);window.entranceQA.preferSourceHint=()=>setPreferredHint('source-check');},[]);window.entranceQA.tip=contextualAsterTip({notebook,mode,activityId,creationRunning:running,feedback});return <><main style={{padding:24,maxWidth:740,minHeight:250}}><h1>The source workshop</h1><p>Aster can offer optional guidance while you keep working.</p><label htmlFor="main-control">My next learning move</label><input id="main-control" placeholder="Keep writing your answer" style={{display:'block',width:'min(100%,320px)',marginTop:12}}/><button type="button" className="button primary" onClick={()=>window.entranceQA.moves++}>Make my next move</button><p>Unrelated screen update: <span data-testid="rerender-count">{count}</span></p></main><AsterGuide aiConnected={connected} notebook={notebook} mode={mode} activityId={activityId} creationRunning={running} feedback={feedback} expressions={{concept:'bright-celebration',success:'bright-celebration',hint:preferredHint}} onAssistance={()=>{window.entranceQA.assistance++;return true;}}/></>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
 const compiled=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',outdir:'.qa/aster-entrance/compiled',loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl'}});
 const js=compiled.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=compiled.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aster entrance verification</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 server=createServer(async(req,res)=>{try{const pathname=new URL(req.url??'/',address||'http://127.0.0.1').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const source=assetPaths.get(pathname);if(source){res.setHeader('Content-Type','image/png');res.end(await readFile(source));return;}if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}res.writeHead(404);res.end('Not in the local asset whitelist');}catch{res.writeHead(500);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address=`http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});

async function openEntrance(page:Page,parameters:Record<string,string>={}){
 const unexpected:string[]=[];
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===address&&(url.pathname==='/'||url.pathname==='/favicon.ico'||assetPaths.has(url.pathname)))return route.continue();unexpected.push(url.href);return route.abort();});
 await page.goto(address+'/?'+new URLSearchParams(parameters));await expect(page.getByRole('heading',{name:'The source workshop',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).entranceQA.readyAt)).not.toBeNull();return unexpected;
}
async function portraitScale(page:Page){return page.locator('.aster-launcher-portrait').evaluate(element=>{const matrix=new DOMMatrixReadOnly(getComputedStyle(element).transform);return {x:matrix.a,y:matrix.d};});}
async function decodedExpression(page:Page){
 const guide=page.locator('.aster-guide'),id=await guide.getAttribute('data-expression'),moment=await guide.getAttribute('data-moment');expect(id).toBeTruthy();expect(await page.evaluate(id=>(window as any).entranceQA.emotionMoments[id!],id)).toContain(moment);
 const image=page.locator('.aster-launcher-portrait img');await expect(image).toHaveAttribute('src','/assets/aster/emotions/'+id+'.png');
 await expect.poll(()=>image.evaluate(element=>{const image=element as HTMLImageElement;return image.complete&&image.naturalWidth>0&&image.naturalHeight>0;})).toBe(true);
 expect(await image.evaluate(element=>new URL((element as HTMLImageElement).currentSrc).pathname)).toBe('/assets/aster/emotions/'+id+'.png');
}
async function frames(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function screenshot(page:Page,info:TestInfo,name:string){const directory=path.resolve('.qa/aster-entrance',info.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase());await mkdir(directory,{recursive:true});await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});}

for(const width of [1440,1280,390])test(`automatic entrance at ${width}px gently enlarges once, keeps focus and returns on dismissal`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const unexpected=await openEntrance(page,{stale:'true'}),guide=page.locator('.aster-guide'),portrait=page.locator('.aster-launcher-portrait'),control=page.getByRole('textbox',{name:'My next learning move',exact:true});
 await control.fill('Compare the source examples.');await control.focus();await expect(guide).toHaveAttribute('data-guidance','idle');
 const labelBefore=(await page.locator('.aster-launcher>span:last-child').boundingBox())!;
 await expect(guide).toHaveAttribute('data-guidance','automatic',{timeout:6000});await expect(page.locator('.aster-bubble')).toContainText('A quick source check helps');await expect(guide).toHaveAttribute('data-moment','concept');await expect(guide).not.toHaveAttribute('data-expression','bright-celebration');
 expect(await page.evaluate(()=>(window as any).entranceQA.tip.moment)).toBe('concept');
 const elapsed=await page.evaluate(()=>{const qa=(window as any).entranceQA;return qa.automaticAt-qa.readyAt;});expect(elapsed).toBeGreaterThanOrEqual(1700);expect(elapsed).toBeLessThan(5000);
 await expect(control).toBeFocused();await expect(control).toHaveValue('Compare the source examples.');await decodedExpression(page);
 await expect(portrait).toHaveCSS('animation-name','aster-tip-notice');await expect(portrait).toHaveCSS('animation-iteration-count','1');
 await expect.poll(()=>page.evaluate(()=>(window as any).entranceQA.animations.filter((event:any)=>event.type==='animationend').length)).toBe(1);
 await expect.poll(async()=>Math.round((await portraitScale(page)).x*100)).toBe(122);expect((await portraitScale(page)).y).toBeCloseTo(1.22,2);
 await page.locator('.aster-launcher').hover();expect((await portraitScale(page)).x).toBeCloseTo(1.22,2);await page.mouse.move(0,0);
 await page.evaluate(()=>{const qa=(window as any).entranceQA;qa.portraitNode=document.querySelector('.aster-launcher-portrait');qa.rerender();});await expect(page.getByTestId('rerender-count')).toHaveText('1');await frames(page);
 expect(await page.evaluate(()=>(window as any).entranceQA.portraitNode===document.querySelector('.aster-launcher-portrait'))).toBe(true);expect(await page.evaluate(()=>(window as any).entranceQA.animations.filter((event:any)=>event.type==='animationstart').length)).toBe(1);await expect(control).toBeFocused();
 const launcher=(await page.locator('.aster-launcher-portrait').boundingBox())!,bubble=(await page.locator('.aster-bubble').boundingBox())!;
 expect(launcher.x<bubble.x+bubble.width&&launcher.x+launcher.width>bubble.x&&launcher.y<bubble.y+bubble.height&&launcher.y+launcher.height>bubble.y).toBe(false);
 expect(launcher.x).toBeGreaterThanOrEqual(0);expect(launcher.y).toBeGreaterThanOrEqual(0);expect(launcher.x+launcher.width).toBeLessThanOrEqual(width);expect(launcher.y+launcher.height).toBeLessThanOrEqual(900);
 const labelAfter=(await page.locator('.aster-launcher>span:last-child').boundingBox())!;expect(labelAfter.width).toBeCloseTo(labelBefore.width,2);expect(labelAfter.height).toBeCloseTo(labelBefore.height,2);
 if(width>=1360){expect(labelAfter.x).toBeCloseTo(labelBefore.x,2);expect(labelAfter.y).toBeCloseTo(labelBefore.y,2);}
 if(width<1360){expect(await guide.evaluate(element=>getComputedStyle(element).position)).toBe('relative');expect(launcher.y).toBeGreaterThanOrEqual(bubble.y+bubble.height);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await screenshot(page,info,'automatic');
 await page.getByRole('button',{name:'Dismiss Aster tip',exact:true}).click();await page.mouse.move(0,0);await expect(guide).toHaveAttribute('data-guidance','idle');await expect(page.locator('.aster-bubble')).toHaveCount(0);await expect.poll(async()=>Math.round((await portraitScale(page)).x*100)).toBe(100);await screenshot(page,info,'dismissed');
 expect(await page.evaluate(()=>(window as any).entranceQA.assistance)).toBe(0);expect(unexpected).toEqual([]);
});

for(const width of [1440,1280,390])test(`reduced motion at ${width}px keeps static emphasis without animation or transitions`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const unexpected=await openEntrance(page,{stale:'true'}),guide=page.locator('.aster-guide'),portrait=page.locator('.aster-launcher-portrait');
 await expect(guide).toHaveAttribute('data-guidance','automatic',{timeout:6000});await expect(portrait).toHaveCSS('animation-name','none');await expect(portrait).toHaveCSS('transition-duration','0s');await expect(page.locator('.aster-bubble')).toHaveCSS('animation-name','none');expect((await portraitScale(page)).x).toBeCloseTo(1.22,2);await decodedExpression(page);await screenshot(page,info,'static-emphasis');
 await page.locator('.aster-bubble-action').click();await page.mouse.move(0,0);await expect(guide).toHaveAttribute('data-guidance','manual');await expect(page.getByRole('dialog',{name:'Ask Aster',exact:true})).toBeVisible();await expect(page.locator('.aster-panel')).toHaveCSS('animation-name','none');expect((await portraitScale(page)).x).toBeCloseTo(1,2);expect(await page.evaluate(()=>(window as any).entranceQA.animations)).toEqual([]);expect(unexpected).toEqual([]);
});

for(const suppression of ['quiet','off','running'])test(`${suppression} suppresses automatic entrances`,async({page})=>{
 const parameters:Record<string,string>=suppression==='running'?{running:'true',stale:'true'}:{preference:suppression,stale:'true'};const unexpected=await openEntrance(page,parameters);
 await page.waitForTimeout(2100);await expect(page.locator('.aster-bubble')).toHaveCount(0);await expect(page.locator('.aster-guide[data-guidance="automatic"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).entranceQA.animations)).toEqual([]);
 if(suppression==='off')await expect(page.getByRole('button',{name:'Show Aster',exact:true})).toBeVisible();else{expect((await portraitScale(page)).x).toBeCloseTo(1,2);await decodedExpression(page);}
 expect(await page.evaluate(()=>(window as any).entranceQA.assistance)).toBe(0);expect(unexpected).toEqual([]);
});

test('manual source hints use compatible preferred portraits and never keep automatic enlargement',async({page})=>{
 const unexpected=await openEntrance(page,{mode:'play',preference:'quiet',stale:'true'}),guide=page.locator('.aster-guide');await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await page.getByRole('button',{name:'Help with this mission',exact:true}).click();await page.mouse.move(0,0);
 await expect(guide).toHaveAttribute('data-guidance','manual');await expect(guide).toHaveAttribute('data-moment','hint');await expect(guide).not.toHaveAttribute('data-expression','bright-celebration');await expect(page.locator('.aster-mission-help')).toContainText('Read the type beside each port.');await decodedExpression(page);expect((await portraitScale(page)).x).toBeCloseTo(1,2);
 await page.evaluate(()=>(window as any).entranceQA.preferSourceHint());await expect(guide).toHaveAttribute('data-expression','source-check');await decodedExpression(page);expect(await page.evaluate(()=>(window as any).entranceQA.assistance)).toBe(1);expect(unexpected).toEqual([]);
});

for(const reducedMotion of ['no-preference','reduce'] as const)for(const width of [1440,390])test(`connected Aster at ${width}px preserves expression and focus with ${reducedMotion} motion`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion});const unexpected=await openEntrance(page,{preference:'quiet'}),guide=page.locator('.aster-guide'),portrait=page.locator('.aster-launcher-portrait'),control=page.getByRole('textbox',{name:'My next learning move',exact:true});
 const before=(await portrait.boundingBox())!;expect(before.height).toBeGreaterThanOrEqual(width>=1360?180:150);expect(before.width).toBeGreaterThanOrEqual(width>=1360?130:110);
 await decodedExpression(page);const originalExpression=await guide.getAttribute('data-expression'),originalImage=await portrait.locator('img').getAttribute('src');await control.fill('My current source note');await control.focus();await expect(guide).toHaveAttribute('data-connection','local');
 await page.evaluate(()=>(window as any).entranceQA.connect(true));await expect(guide).toHaveAttribute('data-connection','connected');await expect(page.locator('.aster-connection-badge')).toHaveText('AI enabled');await expect(guide).toHaveAttribute('data-expression',originalExpression!);await expect(portrait.locator('img')).toHaveAttribute('src',originalImage!);await expect(control).toBeFocused();await expect(control).toHaveValue('My current source note');
 if(reducedMotion==='reduce'){await expect(portrait.locator('img')).toHaveCSS('animation-name','none');expect(await page.evaluate(()=>(window as any).entranceQA.connections)).toEqual([]);}else{await expect.poll(()=>page.evaluate(()=>(window as any).entranceQA.connections.filter((event:any)=>event.type==='animationend').length)).toBe(1);}
 await expect(guide).not.toHaveClass(/aster-connection-arrival/);await page.evaluate(()=>(window as any).entranceQA.rerender());await expect(page.getByTestId('rerender-count')).toHaveText('1');expect(await page.evaluate(()=>(window as any).entranceQA.connections.filter((event:any)=>event.type==='animationstart').length)).toBe(reducedMotion==='reduce'?0:1);
 await page.getByRole('button',{name:'Ask Aster',exact:true}).click();await expect(page.getByRole('dialog',{name:'Ask Aster',exact:true})).toBeVisible();await expect(page.locator('.aster-header')).toContainText('YOUR CONNECTED LEARNING COMPANION');
 await expect(page.locator('.aster-panel')).toHaveCSS('opacity','1');const panel=(await page.locator('.aster-panel').boundingBox())!;expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await screenshot(page,info,'connected');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Ask Aster',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Ask Aster',exact:true})).toBeFocused();await page.evaluate(()=>(window as any).entranceQA.connect(false));await expect(guide).toHaveAttribute('data-connection','local');await expect(page.locator('.aster-connection-badge')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).entranceQA.assistance)).toBe(0);expect(unexpected).toEqual([]);
});
