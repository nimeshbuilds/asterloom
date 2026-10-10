import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {campaignTeachingFixture} from './campaignTeaching.fixture';
import {learnBeforeQuest} from './teachingDriver.mjs';
import {createNotebook,createSource} from '../src/lib/utils';
import {validateAILearningMissionDraft} from '../src/lib/aiLearningPlan';
import type {ClassificationActivity} from '../src/lib/structuredEngine';
const notebook=campaignTeachingFixture();
async function progress(page:Page){return page.evaluate(id=>new Promise<any>((resolve,reject)=>{const req=indexedDB.open('asterloom-local-v1',1);req.onsuccess=()=>{const db=req.result,q=db.transaction('records','readonly').objectStore('records').get('progress:'+id);q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)};req.onerror=()=>reject(req.error)}),notebook.id);}
async function enter(page:Page){await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},notebook);await page.goto('/');await page.locator('.adventure-home-start').getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);}
async function solve(page:Page){const details=page.locator('.arena-detailed-workspace');if(await details.count()&&await details.getAttribute('open')===null){await details.locator('summary').click();}const labels=['Read the task description.','Compare the stated tool limits.','Record the decision and its conditions.'];for(let target=0;target<labels.length;target++){let position=(await page.locator('.route-step strong').allTextContents()).indexOf(labels[target]);while(position>target){await page.getByRole('button',{name:`Move ${labels[target]} up`,exact:true}).click();position--;}}}
async function visibleBelowHud(page:Page,selector:string){await expect.poll(()=>page.locator(selector).evaluate(element=>{const box=element.getBoundingClientRect(),hud=document.querySelector('.gameplay-hud')!.getBoundingClientRect();return box.top>=hud.bottom&&box.top<window.innerHeight*.55;})).toBe(true);}
async function checkActionReachable(page:Page){
 const check=page.getByRole('button',{name:'Check my work',exact:true});await expect(check).toHaveCount(1);await expect(check).toBeInViewport({ratio:1});
 expect(await check.evaluate(button=>{const box=button.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===button||button.contains(hit);}),'The single check action must not be covered by Aster or the scene.').toBe(true);
}

test('a saved game has one obvious play entrance, source access, and an explicitly opened experimental section',async({page},info)=>{
 await page.setViewportSize({width:1440,height:980});await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;(window as any).asterloomDesktop={platform:'darwin',availableExports:[],nativeGameAvailable:true,launchNativeGame:async()=>{throw Error('This navigation test must not launch the experimental player.');}};},notebook);await page.goto('/');
 const play=page.getByRole('button',{name:'Play game',exact:true});await expect(play).toHaveCount(1);await expect(play).toBeInViewport({ratio:1});await expect(page.getByRole('button',{name:'Open experimental player',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Native game preview',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Source materials',exact:true}).click();await expect(page.getByRole('dialog',{name:'Source materials',exact:true})).toContainText('Tasks and tools');await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByText('Creation details & experimental tools',{exact:true}).click();await expect(page.getByRole('button',{name:'Open experimental player',exact:true})).toBeVisible();await expect(page.locator('.adventure-experimental')).toContainText('progress stays separate');await page.getByText('Creation details & experimental tools',{exact:true}).click();await expect(page.getByRole('button',{name:'Open experimental player',exact:true})).not.toBeVisible();await page.screenshot({path:info.outputPath('one-game-entrance.png'),fullPage:true,animations:'disabled'});
});

test('opening the experimental player preserves the chosen music preference across launches until the learner mutes it',async({page})=>{
 await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;(window as any).nativeSoundRequests=[];(window as any).asterloomDesktop={platform:'darwin',availableExports:[],nativeGameAvailable:true,launchNativeGame:async(request:any)=>{(window as any).nativeSoundRequests.push(structuredClone(request.presentation));return{launched:true,alreadyRunning:(window as any).nativeSoundRequests.length>1};}};},notebook);
 await page.goto('/');await page.getByRole('button',{name:'Enable game sound',exact:true}).click();
 await page.getByText('Creation details & experimental tools',{exact:true}).click();const launch=page.getByRole('button',{name:'Open experimental player',exact:true});
 for(let count=1;count<=2;count++){
  await launch.click();await expect.poll(()=>page.evaluate(()=>(window as any).nativeSoundRequests.length)).toBe(count);await expect(launch).toBeEnabled();
  expect(await page.evaluate(()=>localStorage.getItem('asterloom-setting:music-enabled'))).toBe('true');
  await page.getByLabel('Adjust game audio',{exact:true}).click();await expect(page.getByRole('checkbox',{name:'Background score',exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Game & Aster sounds',exact:true})).toBeChecked();await page.getByLabel('Adjust game audio',{exact:true}).click();
 }
 const requests=await page.evaluate(()=>(window as any).nativeSoundRequests);expect(requests).toHaveLength(2);expect(requests[0]).toMatchObject({musicEnabled:true,effectsEnabled:true});expect(requests[1]).toEqual(requests[0]);
 await page.getByRole('button',{name:'Effects on',exact:true}).click();await expect(page.getByRole('button',{name:'Enable game sound',exact:true})).toBeVisible();await launch.click();await expect.poll(()=>page.evaluate(()=>(window as any).nativeSoundRequests.length)).toBe(3);
 expect(await page.evaluate(()=>(window as any).nativeSoundRequests[2])).toEqual({...requests[0],musicEnabled:false,effectsEnabled:false});expect(await page.evaluate(()=>localStorage.getItem('asterloom-setting:music-enabled'))).toBe('false');
});

test('teaching hands off to a visible quest, mistakes explain the rule, and a solved model earns a visible saved reward',async({page},info)=>{
 await page.setViewportSize({width:1440,height:960});await enter(page);
 await visibleBelowHud(page,'.structured-heading h2');
 await expect(page.getByRole('region',{name:'Your goal and how to play',exact:true})).toContainText('Apply the documented review order while preserving its conditions.');
 await expect(page.getByRole('region',{name:'Your goal and how to play',exact:true})).toContainText('Move earlier or Move later');
 await expect(page.getByRole('region',{name:'Your goal and how to play',exact:true})).not.toContainText('Place here');
 await page.locator('.mission-guide-dock>summary').click();
 const savedDirections=page.locator('.quest-saved-directions');await expect(savedDirections.locator('p')).not.toBeVisible();await savedDirections.locator('summary').click();await expect(savedDirections.locator('p')).toHaveText(notebook.activities![0].instruction);await savedDirections.locator('summary').click();await page.locator('.mission-guide-dock>summary').click();
 await expect(page.locator('.mission-arena')).toBeVisible();
 await expect(page.locator('.arena-stage')).toBeVisible();
 await checkActionReachable(page);await page.screenshot({path:info.outputPath('reachable-arena-check-desktop.png')});
 const before=await progress(page);
 await page.locator('.arena-detailed-workspace>summary').click();
 await page.getByRole('button',{name:'Play route',exact:true}).click();
 await expect(page.locator('.route-flightline [data-current=true]')).toContainText('1');
 await expect(page.locator('.route-flightline [data-current=true]')).toContainText('2',{timeout:4000});
 await page.getByRole('button',{name:'Pause route',exact:true}).click();
 expect((await progress(page)).xp).toBe(before.xp);expect((await progress(page)).practice?.xp??0).toBe(0);
 await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Keep experimenting');
 await visibleBelowHud(page,'.structured-feedback');
 await expect(page.getByRole('list',{name:'Evaluation details',exact:true})).toContainText('Read the task description.');
 expect((await progress(page)).practice?.xp??0).toBe(0);
 await solve(page);await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Mission rules satisfied');
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();
 await expect(page.locator('.mission-takeaway')).toContainText('A tool’s capabilities alone do not settle a task decision.');
 await visibleBelowHud(page,'.structured-feedback');
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-outcome','complete');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 await expect(page.getByRole('progressbar',{name:'Missions finished',exact:true})).toHaveAttribute('value','1');
 const saved=await progress(page);expect(saved.xp).toBe(0);expect(saved.practice.xp).toBe(20);expect(saved.structured[notebook.activities![0].id].completed).toBe(false);
 await page.screenshot({path:info.outputPath('visible-mission-reward.png')});
 await page.locator('button.aster-launcher').click();await page.getByText('Current activity & tools',{exact:true}).click();await page.getByRole('button',{name:'What is next?',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('choose another mission');await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 await page.reload();
 const savedLesson=page.locator(`.campaign-lessons article[data-activity-id="${notebook.activities![0].id}"]`);
 await expect(savedLesson).toContainText('Mission finished. Revisit it whenever you like.');
 await savedLesson.getByRole('button',{name:'Revisit this mission',exact:true}).click();
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
});

test('the playable workspace and saved feedback remain readable at narrow width with reduced motion',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await enter(page);await checkActionReachable(page);
 await page.locator('.arena-piece').first().click();const move=page.getByRole('button',{name:'Move later',exact:true});await move.scrollIntoViewIfNeeded();await expect(move).toBeInViewport({ratio:1});
 expect(await move.evaluate(button=>{const box=button.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===button||button.contains(hit);}),'The sticky check action must not cover the move control.').toBe(true);
 await checkActionReachable(page);await page.screenshot({path:info.outputPath('reachable-arena-check-mobile.png')});
 await solve(page);await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await visibleBelowHud(page,'.structured-feedback');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
 const serious=(await new AxeBuilder({page}).analyze()).violations.filter(v=>v.impact==='critical'||v.impact==='serious');expect(serious).toEqual([]);
});

test('a pending or failed result keeps its mission open until the same save succeeds, then the learner can continue',async({page})=>{
 const second={...notebook.activities![0],id:'task-review-mission-two',title:'Review the conditions again'};
 await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},{...notebook,activities:[...notebook.activities!,second]});
 await page.goto('/');await page.locator('.adventure-home-start').getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);await solve(page);
 await expect(page.locator('.save-state')).toContainText('Saved on this device');
 await page.locator('.mission-navigation>summary').click();
 const nextMission=page.locator('.mission-navigation').getByRole('button',{name:/Review the conditions again/});
 await expect(nextMission).toBeEnabled();
 await page.evaluate(id=>{
  const control=(window as any).missionNavigationSave={mode:'hold',holding:false,attempts:[] as any[]};
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){
   const result=key===`progress:${id}`&&value.structured?.['task-review-mission']?.response?._draft?.checked===true;
   const request=original.call(this,value,key);
   if(result){
    control.attempts.push(structuredClone(value));
    if(control.mode==='hold'){
     control.holding=true;
     const store=this,transaction=this.transaction;
     const keepAlive=()=>{const read=store.get(key!);read.onsuccess=()=>{if(control.mode==='hold')keepAlive();else if(control.mode==='fail')transaction.abort();};};
     keepAlive();
    }
   }
   return request;
  };
 },notebook.id);
 // Attempt a stale chooser click in the same task, before preparation can
 // reach storage or React can replace the enabled navigation controls.
 const early=await page.evaluate(()=>{
  const check=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Check my work')!;
  const next=[...document.querySelectorAll<HTMLButtonElement>('.mission-navigation button')].find(button=>button.textContent?.includes('Review the conditions again'))!;
  check.click();const beforeStorage=!(window as any).missionNavigationSave.holding;next.click();return beforeStorage;
 });
 expect(early).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).missionNavigationSave.holding)).toBe(true);
 await expect(nextMission).toBeDisabled();await expect(page.locator('.gameplay-hud')).toHaveAttribute('data-save','pending');
 await nextMission.evaluate((button:HTMLButtonElement)=>button.click());
 await expect(page.locator('.mission-navigation>summary strong')).toHaveText('Build a task-review route');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('0 XP');
 await page.evaluate(()=>(window as any).missionNavigationSave.mode='fail');
 await expect(page.getByRole('button',{name:'Retry saving result',exact:true})).toBeVisible();await expect(nextMission).toBeDisabled();
 await nextMission.evaluate((button:HTMLButtonElement)=>button.click());
 await expect(page.locator('.mission-navigation>summary strong')).toHaveText('Build a task-review route');
 expect((await progress(page)).practice?.xp??0).toBe(0);
 await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.evaluate(()=>(window as any).missionNavigationSave.mode='save');
 await page.getByRole('button',{name:'Retry saving result',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Mission rules satisfied');await expect(nextMission).toBeEnabled();
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 const writes=await page.evaluate(()=>(window as any).missionNavigationSave.attempts);expect(writes).toHaveLength(2);expect({...writes[1],updatedAt:writes[0].updatedAt}).toEqual(writes[0]);
 await page.getByRole('button',{name:'Continue your expedition',exact:true}).click();
 await expect(page.locator('.mission-navigation>summary strong')).toHaveText(second.title);
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 await page.locator('.mission-navigation').getByRole('button',{name:/Build a task-review route/}).click();
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
});

test('a large source opens its grounded lesson promptly and preserves the completed quest after reopening',async({page},info)=>{
 const source=notebook.sources[0],evidence=notebook.activities![0].sourceRefs[0].evidence;
 // Synthetic paginated material exercises clipped source units and citation
 // locators without putting any learner's uploaded document in a test fixture.
 const pages=Array.from({length:180},(_,index)=>`[Page ${index+1}]\n# Training section ${index+1}\n\nTerm ${index+1}: a source-defined label used only in this training section.\n\n${index===152?evidence:'The model records its stated conditions before any comparison. '.repeat(18)}\n\n`);
 const large={...notebook,id:'large-source-play-regression',title:'Large source expedition',sources:[{...source,text:pages.join('')}],aiLearningPlan:undefined};
 expect(large.sources[0].text.length).toBeGreaterThan(200000);
 await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},large);
 await page.goto('/');
 const play=page.getByRole('button',{name:'Play game',exact:true});
 await expect(play).toBeVisible();
 const started=Date.now();
 await play.click({timeout:10000});
 const briefing=page.getByRole('region',{name:'Learning briefing',exact:true});
 await expect(briefing).toBeVisible({timeout:10000});
 const elapsed=Date.now()-started;
 expect(elapsed).toBeLessThan(10000);
 await info.attach('large-source-play-timing',{body:JSON.stringify({sourceCharacters:large.sources[0].text.length,playToLessonMs:elapsed}),contentType:'application/json'});
 await briefing.locator('.lesson-mission-source summary').click();
 await expect(briefing.locator('.lesson-mission-source blockquote')).toContainText('Read the task description.');
 await expect(briefing.locator('.lesson-mission-source')).toContainText('Page 153');
 await learnBeforeQuest(page);await solve(page);
 await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Mission rules satisfied');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 await expect(page.locator('.save-state')).toContainText('Saved on this device');
 await page.reload();await page.getByRole('button',{name:/^(Play game|Continue game)$/}).click({timeout:10000});
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toHaveCount(0);
});


/** An original test source: the visible rules, not a hidden response injector,
 * supply every move made below. No private user notebook is embedded here. */
function sortingJourneyFixture(){
 const body='In this field notebook, an observation records something measured or directly noticed. An interpretation proposes what an observation means. The display reads 12 is an observation. The lamp is dark is an observation. The battery may be weak is an interpretation. The cable may be loose is an interpretation.';
 const source={...createSource(body,'Field notebook rules'),id:'terminal-source'};
 const activity:ClassificationActivity={version:1,id:'terminal-mission',kind:'classification',title:'Sort the field notebook',instruction:'Place every statement by the supplied observation and interpretation rule.',explanation:'Observations record what was noticed; interpretations propose a meaning.',hint:'Ask whether the statement records what was noticed or proposes an explanation.',reviewStatus:'needs-review',sourceRefs:[{sourceId:source.id,evidence:body}],scaffoldIds:['classification-workshop'],categories:[{id:'observation',label:'Observation'},{id:'interpretation',label:'Interpretation'}],items:[{id:'display',label:'The display reads 12'},{id:'lamp',label:'The lamp is dark'},{id:'battery',label:'The battery may be weak'},{id:'cable',label:'The cable may be loose'}],membership:[{itemId:'display',categoryIds:['observation']},{itemId:'lamp',categoryIds:['observation']},{itemId:'battery',categoryIds:['interpretation']},{itemId:'cable',categoryIds:['interpretation']}]};
 const cite={sourceId:source.id,evidence:body};
 const teaching=validateAILearningMissionDraft({title:'Notice first, explain second',objective:'Separate what was noticed from what it might mean.',conceptExplanation:{text:'An observation records what was measured or noticed. An interpretation proposes a meaning.',citations:[cite]},chunks:[{id:'notice',title:'Record what was noticed',text:'The display reading and the dark lamp are observations. They record what was noticed.',citations:[cite]},{id:'interpret',title:'Keep explanations distinct',text:'A weak battery and a loose cable are proposed explanations. These statements are interpretations.',citations:[cite]}],guidedApplication:{prompt:'Place the field-note pieces using that distinction.',steps:['Choose a statement and ask whether it records what was noticed or proposes an explanation.','Place it in the matching group, then check your work.']}},{activity,ageGroup:'adult',sources:[source],sourceWindow:{sourceId:source.id,start:0,end:body.length}});
 return createNotebook({id:'source-teaching-regression',title:'The field notebook expedition',ageGroup:'adult',theme:'workshop',sources:[source],activities:[activity],cards:[],scaffoldIds:['classification-workshop'],aiLearningPlan:{version:1,missions:[teaching]}});
}
for(const size of [{width:1440,height:980},{width:1280,height:800}])test(`a learner teaches, places, revises and resumes entirely inside the source scene at ${size.width}×${size.height}`,async({page},info)=>{
 const fixture=sortingJourneyFixture();await page.setViewportSize(size);let generationCalls=0;await page.route('**/api/generate',route=>{generationCalls++;return route.abort();});
 await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));const audio={starts:0};(window as any).journeyAudio=audio;const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){const oscillator=create.call(this),start=oscillator.start.bind(oscillator);oscillator.start=(when?:number)=>{audio.starts++;start(when);};return oscillator;};},fixture);
 await page.goto('/');await page.locator('.adventure-home-start').getByRole('button',{name:'Play game',exact:true}).click();
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();await expect(page.locator('.arena-terminal')).toHaveCount(0);await learnBeforeQuest(page);
 const tray=page.getByRole('group',{name:'Source pieces',exact:true}),terminals=page.getByRole('group',{name:'Source category terminals',exact:true}),first=tray.getByRole('button',{name:/The display reads 12/});
 await expect(first).toBeInViewport({ratio:1});await expect(terminals.getByRole('button',{name:'Place in Observation',exact:true})).toBeInViewport({ratio:1});
 await expect(page.locator('.arena-detailed-workspace')).not.toHaveAttribute('open');await expect(page.locator('.sort-workspace')).not.toBeVisible();await page.screenshot({path:`.qa/learning-play-scene/classification-${size.width}-first-move.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Enable game sound',exact:true}).click();await page.getByLabel('Adjust game audio',{exact:true}).click();await page.getByRole('checkbox',{name:'Background score',exact:true}).uncheck();await page.getByLabel('Adjust game audio',{exact:true}).click();
 await first.focus();await page.keyboard.press('Enter');await expect(first).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(180);
 const sounds=await page.evaluate(()=>(window as any).journeyAudio.starts);await terminals.getByRole('button',{name:'Place in Interpretation',exact:true}).click();await expect(page.getByRole('list',{name:'Interpretation placements',exact:true}).first()).toContainText('The display reads 12');
 await expect.poll(()=>page.evaluate(()=>(window as any).journeyAudio.starts)).toBeGreaterThan(sounds);await expect(page.locator('.arena-action-effect .scene-event-effects')).toHaveAttribute('data-reward','false');await expect(page.locator('.arena-result-flare')).toHaveCount(0);
 expect((await progress(page)).practice?.xp??0).toBe(0);
 await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback')).toHaveAttribute('data-response','retry');expect((await progress(page)).practice?.xp??0).toBe(0);await expect(page.getByRole('progressbar',{name:'Missions finished',exact:true})).toHaveAttribute('value','0');
 // Consult the actual source, then revise the same in-world placements.
 await page.locator('.mission-guide-dock>summary').click();await page.getByText('Explore the source material',{exact:true}).click();await expect(page.locator('.structured-evidence blockquote').first()).toContainText('an observation records');await page.locator('.mission-guide-dock>summary').click();
 await terminals.getByRole('button',{name:'Remove from Interpretation',exact:true}).click();await terminals.getByRole('button',{name:'Place in Observation',exact:true}).click();
 for(const [label,group]of [['The lamp is dark','Observation'],['The battery may be weak','Interpretation'],['The cable may be loose','Interpretation']]){await tray.getByRole('button',{name:new RegExp(label)}).click();await terminals.getByRole('button',{name:`Place in ${group}`,exact:true}).click();}
 await expect(page.locator('.arena-tray-heading')).toContainText('4 / 4 placed');await expect(page.locator('.arena-result-flare')).toHaveCount(0);await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback')).toHaveAttribute('data-response','correct');
 const saved=await progress(page);expect(saved.xp).toBe(0);expect(saved.practice.xp).toBeGreaterThan(0);expect(saved.structured['terminal-mission'].completed).toBe(false);await expect(page.getByRole('progressbar',{name:'Missions finished',exact:true})).toHaveAttribute('value','1');await expect(page.locator('.arena-detailed-workspace')).not.toHaveAttribute('open');
 await page.screenshot({path:`.qa/learning-play-scene/classification-${size.width}-saved-result.png`,fullPage:true,animations:'disabled'});
 await page.reload();await page.locator('.campaign-lessons article[data-activity-id="terminal-mission"]').getByRole('button',{name:'Revisit this mission',exact:true}).click();await expect(page.locator('.arena-tray-heading')).toContainText('4 / 4 placed');expect((await progress(page)).practice.xp).toBe(saved.practice.xp);await expect(page.locator('.arena-result-flare')).toHaveCount(0);await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.qa/learning-play-scene/classification-${size.width}-resumed.png`,animations:'disabled'});
 expect(generationCalls).toBe(0);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await new AxeBuilder({page}).include('.mission-arena').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
