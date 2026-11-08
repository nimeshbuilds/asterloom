import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function openArena(page:Page,info:TestInfo,{kind='budget',age='adult',missing=false,mode='play',scaffold,storySetting}:{kind?:string;age?:string;missing?:boolean;mode?:'play'|'backdrop';scaffold?:string;storySetting?:string}={}){
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import MissionArena from'./src/components/MissionArena';import{activityScene,sceneActions,applySceneAction}from'./src/lib/worldScene';import{ACTIVITY_EXAMPLES,evaluateActivity}from'./src/lib/structuredEngine';import{activityActionCue}from'./src/lib/actionFeedback';import'./src/styles.css';
 const kind=${JSON.stringify(kind)},activity=ACTIVITY_EXAMPLES.find(a=>a.kind===kind),initial=kind==='budget'?{quantities:{small:0,large:0}}:kind==='sequence'?{order:activity.items.map(item=>item.id)}:kind==='classification'?{assignments:Object.fromEntries(activity.items.map(item=>[item.id,[]]))}:{edges:[]};
 const recipes={budget:'resource-allocation',sequence:'process-reconstruction',dependency:'concept-map-repair',classification:'classification-workshop'};window.arenaQA={changes:0};
 function App(){const[state,setState]=useState(()=>JSON.parse(localStorage.getItem('arena-work')||'null')||initial),[selected,setSelected]=useState(''),[result,setResult]=useState(undefined),[visual,setVisual]=useState(undefined);const change=(next)=>{const cue=activityActionCue(state,next);if(cue)setVisual(v=>({event:(v?.event||0)+1,kind:cue}));window.arenaQA.changes++;setState(next);setResult(undefined);localStorage.setItem('arena-work',JSON.stringify(next));};window.arenaQA.response=state;return <main style={{maxWidth:1100,margin:'auto',padding:16}}><h1>Learning mission</h1><h2>Work with the source model</h2><MissionArena sorting={kind==='classification'?{categories:activity.categories,assignments:state.assignments,...(result?{checked:{event:result.event,details:evaluateActivity(activity,state).details}}:{})}:undefined} actionFeedback={visual} mode=${JSON.stringify(mode)} scaffoldId={${JSON.stringify(scaffold)}||recipes[kind]} storySetting={${JSON.stringify(storySetting)}} theme='ocean' ageGroup=${JSON.stringify(age)} snapshot={activityScene(activity,state)} selectedId={selected} onSelect={setSelected} actions={sceneActions(activity,state,selected)} onAction={action=>change(applySceneAction(activity,state,action))} feedback={result}/><button onClick={()=>setResult({event:(result?.event||0)+1,outcome:evaluateActivity(activity,state).correct?'complete':'retry'})}>Check placements</button><button onClick={()=>setResult({event:1,outcome:'complete'})}>Commit test result</button><button onClick={()=>setResult({event:2,outcome:'retry'})}>Commit retry result</button><button onClick={()=>setResult({event:3,outcome:'reflection'})}>Commit reflection</button><button onClick={()=>change({...state})}>Apply unchanged response</button><output aria-label='Response'>{JSON.stringify(state)}</output></main>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',loader:{'.woff2':'dataurl','.woff':'dataurl'},outdir:info.outputPath('bundle')});
 const js=bundle.outputFiles!.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles!.find(file=>file.path.endsWith('.css'))!.text;
 const errors:string[]=[],external:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith('http://arena.test/')&&!request.url().startsWith('data:'))external.push(request.url());});
 await page.route('http://arena.test/**',async route=>{const pathname=new URL(route.request().url()).pathname;if(pathname.startsWith('/assets/')){if(missing)return route.abort();try{return route.fulfill({contentType:'image/png',body:await readFile('public'+pathname)});}catch{return route.abort();}}return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Mission arena</title><style>${css}body{margin:0;background:#edf0ed}output{display:block;margin:20px;overflow-wrap:anywhere}</style></head><body><div id='root'></div><script type='module'>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`});});
 await page.context().setOffline(true);await page.goto('http://arena.test');await expect(page.getByRole('heading',{name:'Learning mission',exact:true})).toBeVisible();return {errors,external};
}
test('the visible arena makes real allocation moves with keyboard access and preserves work without inventing completion',async({page},info)=>{
 const events=await openArena(page,info),arena=page.locator('.mission-arena');await expect(arena).toHaveAttribute('data-art-status','ready');await expect(page.locator('.arena-environment')).toBeVisible();expect((await page.locator('.arena-stage').boundingBox())!.height).toBeGreaterThan(350);
 await page.getByRole('button',{name:/Small workstation/}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Selected scene piece')).toContainText('Small workstation');await expect(page.getByRole('button',{name:'Use one fewer',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Add one',exact:true}).click();await expect(page.getByLabel('Response')).toHaveText('{"quantities":{"small":1,"large":0}}');await expect(page.locator('.arena-meters')).toContainText('3 / 12');await expect(page.locator('.arena-result-flare')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).arenaQA.changes)).toBe(1);
 await page.getByRole('button',{name:'Add one',exact:true}).click();await page.getByRole('button',{name:'Use one fewer',exact:true}).click();await expect(page.getByLabel('Response')).toHaveText('{"quantities":{"small":1,"large":0}}');await page.getByRole('button',{name:'Commit test result',exact:true}).click();await expect(page.locator('.arena-result-complete')).toHaveCount(1);await page.reload();await expect(page.getByLabel('Response')).toHaveText('{"quantities":{"small":1,"large":0}}');await expect(page.locator('.arena-result-flare')).toHaveCount(0);await expect(page.locator('.arena-move-signal')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).arenaQA.changes)).toBe(0);
 await page.getByRole('button',{name:/Small workstation/}).click();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:info.outputPath('arena-allocation-desktop.png'),fullPage:true,animations:'disabled'});expect(events.errors).toEqual([]);expect(events.external).toEqual([]);
});
test('route pieces can be reordered in the illustrated world and keep the full source labels available',async({page},info)=>{
 await openArena(page,info,{kind:'sequence'});const before=await page.evaluate(()=>(window as any).arenaQA.response.order);const first=page.locator('.arena-piece').first();const label=await first.locator('strong').innerText();await first.click();await expect(page.getByLabel('Selected scene piece')).toContainText(label);await page.getByRole('button',{name:'Move later',exact:true}).click();expect(await page.evaluate(()=>(window as any).arenaQA.response.order)).toEqual([before[1],before[0],...before.slice(2)]);await expect(page.locator('.arena-links path')).toHaveCount(before.length-1);await expect(page.locator('.arena-result-flare')).toHaveCount(0);await page.screenshot({path:info.outputPath('arena-route-desktop.png'),fullPage:true,animations:'disabled'});
});
test('small screens, younger art and missing images preserve controls and respect reduced motion',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const events=await openArena(page,info,{age:'6-8',missing:true});await expect(page.locator('.mission-arena')).toHaveAttribute('data-art-status','fallback');await expect(page.locator('.mission-arena')).toHaveAttribute('data-world-art','junior-discovery');await expect(page.locator('.arena-vector')).toBeVisible();await page.getByRole('button',{name:/Small workstation/}).click();await page.getByRole('button',{name:'Add one',exact:true}).click();await expect(page.getByLabel('Response')).toContainText('"small":1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.arena-action-effect').evaluate(el=>getComputedStyle(el).display)).toBe('none');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:info.outputPath('arena-junior-mobile-fallback.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Compact scene',exact:true}).click();await expect(page.locator('.arena-stage')).toBeHidden();await expect(page.getByLabel('Selected scene piece')).toBeVisible();await page.getByRole('button',{name:'Use one fewer',exact:true}).click();await expect(page.getByLabel('Response')).toContainText('"small":0');await page.getByRole('button',{name:'Open scene',exact:true}).click();await expect(page.locator('.arena-stage')).toBeVisible();expect(events.errors).toEqual([]);expect(events.external).toEqual([]);
});

test('sorting tokens use the source categories and every move can be undone',async({page},info)=>{
 const events=await openArena(page,info,{kind:'classification'});await page.locator('.arena-piece').first().click();const selected=await page.locator('.arena-piece[aria-pressed=true] strong').innerText();await page.locator('.arena-terminal-action').first().click();const response=await page.evaluate(()=>(window as any).arenaQA.response);expect(Object.values(response.assignments).flat().length).toBe(1);await expect(page.getByLabel('Selected scene piece')).toContainText(selected);await expect(page.locator('.arena-terminal-action').first()).toContainText('Remove from');await page.screenshot({path:info.outputPath('arena-classification-desktop.png'),fullPage:true,animations:'disabled'});await page.locator('.arena-terminal-action').first().click();expect(Object.values((await page.evaluate(()=>(window as any).arenaQA.response)).assignments).flat().length).toBe(0);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(events.errors).toEqual([]);
});
test('source pieces can be dragged into a terminal without toggling an existing placement off',async({page},info)=>{
 await openArena(page,info,{kind:'classification'});const piece=page.locator('.arena-sort-piece').first(),target=page.locator('.arena-terminal').first();const label=await piece.locator('strong').innerText();await piece.dragTo(target);await expect(target.getByRole('list')).toContainText(label);expect(Object.values((await page.evaluate(()=>(window as any).arenaQA.response)).assignments).flat().length).toBe(1);const changed=await page.evaluate(()=>(window as any).arenaQA.changes);await piece.dragTo(target);expect(await page.evaluate(()=>(window as any).arenaQA.changes)).toBe(changed);await expect(page.locator('.arena-result-flare')).toHaveCount(0);
});
test('younger source terminals retain readable keyboard controls on a small screen',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await openArena(page,info,{kind:'classification',age:'6-8'});await page.locator('.arena-sort-piece').first().focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Place in Observation',exact:true}).click();await expect(page.locator('.arena-docked-piece')).toHaveCount(1);expect(await page.locator('.arena-docked-piece').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
test('specialized editors receive compact scenery without misleading duplicate scene controls',async({page})=>{
 await openArena(page,test.info(),{kind:'dependency',mode:'backdrop'});await expect(page.locator('.arena-stage')).toBeVisible();expect((await page.locator('.arena-stage').boundingBox())!.height).toBeLessThanOrEqual(210);await expect(page.locator('.arena-field')).toBeHidden();await expect(page.locator('.arena-console')).toBeHidden();await expect(page.getByRole('button',{name:/Inspect this piece/})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).arenaQA.changes)).toBe(0);
});

test('semantic action effects stay neutral, ignore no-ops, and switch to saved-result mechanisms only on commit',async({page},info)=>{
 await openArena(page,info,{kind:'sequence'});
 await expect(page.locator('.scene-event-effects')).toHaveCount(0);
 await page.locator('.arena-piece').first().click();
 await expect(page.locator('.scene-event-effects')).toHaveCount(0);
 await page.getByRole('button',{name:'Move later',exact:true}).click();
 const effect=page.locator('.scene-event-effects');
 await expect(effect).toHaveAttribute('data-kind','move');
 await expect(effect).toHaveAttribute('data-reward','false');
 await expect(effect).toHaveAttribute('data-mechanism','route-activation');
 const event=await effect.getAttribute('data-event');
 await page.getByRole('button',{name:'Apply unchanged response',exact:true}).click();
 await expect(effect).toHaveAttribute('data-event',event!);
 await expect(page.locator('.ae-emblem')).toHaveCount(0);
 await page.getByRole('button',{name:'Commit retry result',exact:true}).click();
 await expect(effect).toHaveAttribute('data-kind','retry');await expect(effect).toHaveAttribute('data-reward','false');
 expect(await effect.locator('.ae-shockwave').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 await page.getByRole('button',{name:'Commit reflection',exact:true}).click();
 await expect(effect).toHaveAttribute('data-kind','reflection');await expect(effect).toHaveAttribute('data-reward','false');
 await page.getByRole('button',{name:'Commit test result',exact:true}).click();
 await expect(effect).toHaveAttribute('data-kind','complete');await expect(effect).toHaveAttribute('data-reward','true');
 expect(await effect.locator('.se-flow').evaluate(el=>getComputedStyle(el).animationIterationCount)).toBe('1');
 await page.reload();await expect(page.locator('.scene-event-effects')).toHaveCount(0);
});
test('the in-app motion setting disables scene effects and piece transitions without hiding controls',async({page},info)=>{
 await openArena(page,info,{kind:'classification'});await page.evaluate(()=>document.documentElement.dataset.reduced='true');
 await page.locator('.arena-piece').first().click();await page.locator('.arena-terminal-action').first().click();
 expect(await page.locator('.arena-action-effect').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 expect(await page.locator('.arena-piece').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await expect(page.getByLabel('Selected scene piece')).toBeVisible();
 await page.getByRole('button',{name:'Commit test result',exact:true}).click();
 expect(await page.locator('.arena-result-flare').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('all eight world mechanisms animate once, retain static reduced-motion feedback, and fit offline on a phone',async({page},info)=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import ReactionEffects from'./src/components/ReactionEffects';import{REACTION_PROFILES}from'./src/data/reactionProfiles';import'./src/styles.css';
 const profiles=[...new Map(REACTION_PROFILES.map(p=>[p.family,p])).values()];function App(){const[outcome,setOutcome]=useState('complete'),[event,setEvent]=useState(1),[animate,setAnimate]=useState(true);return <main><h1>Every world responds differently</h1><p>Movement reflects your work. Saved results provide the feedback.</p><nav aria-label='Preview feedback'><button onClick={()=>{setOutcome('complete');setAnimate(true);setEvent(v=>v+1)}}>Saved success</button><button onClick={()=>{setOutcome('retry');setAnimate(true);setEvent(v=>v+1)}}>Saved retry</button><button onClick={()=>setAnimate(false)}>Restore saved result</button></nav><div className='gallery'>{profiles.map(p=><section key={p.id}><h2>{p.family}</h2><ReactionEffects scaffoldId={p.id} eventKey={event} outcome={outcome} animate={animate}/><p>The source and your next action remain visible.</p></section>)}</div></main>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'esm',target:'es2022',jsx:'automatic',loader:{'.woff2':'dataurl','.woff':'dataurl'},outdir:info.outputPath('gallery-bundle')});
 const js=bundle.outputFiles!.find(f=>f.path.endsWith('.js'))!.text,css=bundle.outputFiles!.find(f=>f.path.endsWith('.css'))!.text;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://effects.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>World feedback</title><style>${css}body{margin:0;background:#edf1ee;color:#1a3b39}main{max-width:1160px;padding:24px;margin:auto}nav{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}nav button{padding:12px;border:1px solid #42655c;border-radius:8px;background:#fff;color:#193e34}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.gallery section{padding:15px;border:1px solid #a3b9b0;border-radius:16px;background:#fff}.gallery h2{font-size:16px;text-transform:capitalize;margin:0 0 10px}.gallery p{font-size:12px;margin:0;color:#39574d}@media(max-width:600px){main{padding:16px}.gallery{grid-template-columns:1fr}}</style></head><body><div id='root'></div><script type='module'>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`}));
 await page.context().setOffline(true);await page.setViewportSize({width:1440,height:1100});await page.goto('http://effects.test');
 await expect(page.locator('.scene-event-effects')).toHaveCount(8);
 expect(new Set(await page.locator('.scene-event-effects').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-mechanism')))).size).toBe(8);
 await page.getByRole('button',{name:'Saved success',exact:true}).click();
 const traveler=page.locator('.se-route-marker');const before=await traveler.evaluate(el=>getComputedStyle(el).offsetDistance);await page.waitForTimeout(150);const after=await traveler.evaluate(el=>getComputedStyle(el).offsetDistance);expect(after).not.toBe(before);
 const animated=await page.locator('.scene-event-effects').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations({subtree:true}).map(a=>({iterations:a.effect?.getTiming().iterations,end:a.effect?.getComputedTiming().endTime}))));expect(animated.length).toBeGreaterThan(30);for(const animation of animated){expect(animation.iterations).toBe(1);expect(Number(animation.end)).toBeLessThan(2500);}
 await page.screenshot({path:'.qa/visual-mechanisms/gallery-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Restore saved result',exact:true}).click();expect(await page.locator('.scene-event-effects').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations({subtree:true})).length)).toBe(0);
 await page.getByRole('button',{name:'Saved retry',exact:true}).click();await expect(page.locator('.scene-event-effects[data-reward=false]')).toHaveCount(8);
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});expect(await page.locator('.scene-event-effects').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations({subtree:true})).length)).toBe(0);
 await expect(page.locator('.ae-emblem').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.screenshot({path:'.qa/visual-mechanisms/gallery-mobile-reduced.png',fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
});

test('new adult and child scenery decodes offline while saved story settings keep their prior world',async({page},info)=>{
 const cases=[
  {kind:'dependency',mode:'backdrop' as const,scaffold:'cloud-architecture-builder',age:'adult',art:'cloud-systems-yard'},
  {kind:'dependency',mode:'backdrop' as const,scaffold:'cloud-architecture-builder',age:'adult',storySetting:'The connection observatory: a saved mission',art:'network'},
  {kind:'sequence',scaffold:'step-train',age:'6-8',art:'learning-railway'},
  {kind:'sequence',scaffold:'step-train',age:'6-8',storySetting:'The little discovery world: a saved mission',art:'junior-discovery'},
 ];
 for(const [index,item] of cases.entries()){
  await page.unrouteAll();await page.setViewportSize({width:index<2?1440:390,height:index<2?960:844});
  await openArena(page,info,item);await expect(page.locator('.mission-arena')).toHaveAttribute('data-world-art',item.art);await expect(page.locator('.mission-arena')).toHaveAttribute('data-art-status','ready');
  expect(await page.locator('.arena-environment').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>500)).toBe(true);
  if(item.kind==='sequence'){await page.locator('.arena-piece').first().click();await page.getByRole('button',{name:'Move later',exact:true}).click();await expect(page.locator('.scene-event-effects')).toHaveAttribute('data-kind','move');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:`.qa/visual-mechanisms/scene-${item.art}.png`,fullPage:true,animations:'disabled'});
 }
});

test('dispatch routes retain multiple groups and show item feedback only after a checked response',async({page},info)=>{
 await page.setViewportSize({width:1440,height:960});const events=await openArena(page,info,{kind:'classification'});
 await expect(page.locator('.arena-payload')).toHaveAttribute('data-state','empty');await page.getByRole('button',{name:'Inspect first piece',exact:true}).click();
 await expect(page.locator('.arena-payload-core')).toContainText('The display reads 12.');await expect(page.locator('.arena-dispatch-routes g')).toHaveCount(2);
 await expect(page.locator('.arena-payload-check')).toHaveCount(0);
 await page.getByRole('button',{name:'Place in Interpretation',exact:true}).click();await page.getByRole('button',{name:'Place in Observation',exact:true}).click();
 await expect(page.locator('.arena-dispatch-routes g[data-connected=true]')).toHaveCount(2);await expect(page.locator('.arena-payload-route-state')).toContainText('Observation · Interpretation');await expect(page.locator('.arena-payload-check')).toHaveCount(0);
 await page.getByRole('button',{name:'Check placements',exact:true}).click();await expect(page.locator('.arena-payload-check')).toContainText('Revisit this piece');await expect(page.locator('.arena-sort-piece[data-check=retry]')).toHaveCount(2);
 await page.getByRole('button',{name:'Remove from Interpretation',exact:true}).click();await expect(page.locator('.arena-payload-check')).toHaveCount(0);await expect(page.locator('.arena-dispatch-routes g[data-connected=true]')).toHaveCount(1);
 await page.getByRole('button',{name:'Inspect next unplaced piece',exact:true}).click();await expect(page.locator('.arena-payload-core')).toContainText('The battery may be weak.');await page.getByRole('button',{name:'Place in Interpretation',exact:true}).click();
 await page.getByRole('button',{name:'Check placements',exact:true}).click();await expect(page.locator('.arena-payload-check')).toContainText('Placements checked');await expect(page.locator('.arena-sort-piece[data-check=correct]')).toHaveCount(2);
 await page.screenshot({path:'.qa/classification-dispatch-desktop.png',fullPage:true,animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:'Inspect first piece',exact:true}).click();await expect(page.locator('.arena-dispatch-routes g[data-connected=true]')).toHaveCount(1);await expect(page.locator('.arena-route-transfer')).toHaveCount(0);await expect(page.locator('.arena-payload-check')).toHaveCount(0);
 expect(events.errors).toEqual([]);expect(events.external).toEqual([]);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('child dispatch remains readable before selection and after routing with reduced motion',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await openArena(page,info,{kind:'classification',age:'6-8'});
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.getByRole('button',{name:'Inspect first piece',exact:true}).click();await page.getByRole('button',{name:'Place in Observation',exact:true}).click();
 await expect(page.locator('.arena-route-transfer')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.screenshot({path:'.qa/classification-dispatch-child-mobile.png',fullPage:true,animations:'disabled'});
});
