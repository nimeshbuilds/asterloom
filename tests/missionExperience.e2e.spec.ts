import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {campaignTeachingFixture} from './campaignTeaching.fixture';
import {learnBeforeQuest} from './teachingDriver.mjs';
const notebook=campaignTeachingFixture();
async function progress(page:Page){return page.evaluate(id=>new Promise<any>((resolve,reject)=>{const req=indexedDB.open('asterloom-local-v1',1);req.onsuccess=()=>{const db=req.result,q=db.transaction('records','readonly').objectStore('records').get('progress:'+id);q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)};req.onerror=()=>reject(req.error)}),notebook.id);}
async function enter(page:Page){await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},notebook);await page.goto('/');await page.locator('.campaign-invitation').getByRole('button',{name:'Learn & play this mission',exact:true}).click();await learnBeforeQuest(page);}
async function solve(page:Page){const details=page.locator('.arena-detailed-workspace');if(await details.count()&&await details.getAttribute('open')===null){await details.locator('summary').click();}const labels=['Read the task description.','Compare the stated tool limits.','Record the decision and its conditions.'];for(let target=0;target<labels.length;target++){let position=(await page.locator('.route-step strong').allTextContents()).indexOf(labels[target]);while(position>target){await page.getByRole('button',{name:`Move ${labels[target]} up`,exact:true}).click();position--;}}}
async function visibleBelowHud(page:Page,selector:string){await expect.poll(()=>page.locator(selector).evaluate(element=>{const box=element.getBoundingClientRect(),hud=document.querySelector('.gameplay-hud')!.getBoundingClientRect();return box.top>=hud.bottom&&box.top<window.innerHeight*.55;})).toBe(true);}
async function checkActionReachable(page:Page){
 const check=page.getByRole('button',{name:'Check my work',exact:true});await expect(check).toHaveCount(1);await expect(check).toBeInViewport({ratio:1});
 expect(await check.evaluate(button=>{const box=button.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===button||button.contains(hit);}),'The single check action must not be covered by Aster or the scene.').toBe(true);
}

test('teaching hands off to a visible quest, mistakes explain the rule, and a solved model earns a visible saved reward',async({page},info)=>{
 await page.setViewportSize({width:1440,height:960});await enter(page);
 await visibleBelowHud(page,'.structured-heading h2');
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
 await page.locator('button.aster-launcher').click();await page.getByRole('button',{name:'What is next?',exact:true}).click();await expect(page.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('choose another mission');await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 await page.reload();
 const savedLesson=page.locator(`.campaign-lessons article[data-activity-id="${notebook.activities![0].id}"]`);
 await expect(savedLesson).toContainText('Your quest progress is saved.');
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
 await page.goto('/');await page.locator('.campaign-invitation').getByRole('button',{name:'Learn & play this mission',exact:true}).click();await learnBeforeQuest(page);await solve(page);
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
 await page.reload();await page.getByRole('button',{name:'Play game',exact:true}).click({timeout:10000});
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toHaveCount(0);
});
