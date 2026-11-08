import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createNotebook} from '../src/lib/utils';
import {SCENARIO_EXAMPLES,SCENARIO_EXAMPLE_SOURCES} from '../src/lib/scenarioEngine';
import {validateAILearningMissionDraft} from '../src/lib/aiLearningPlan';
import {learnBeforeQuest} from './teachingDriver.mjs';

function fixture(){
 const activity={...SCENARIO_EXAMPLES[0],reviewStatus:'needs-review' as const};
 const source=SCENARIO_EXAMPLE_SOURCES[0],cite=(i:number)=>({sourceId:source.id,evidence:activity.sourceRefs[i].evidence});
 const teaching=validateAILearningMissionDraft({title:'Diagnose before you change',objective:'Restore name lookup without disruption, then explain your diagnosis using the observations.',conceptExplanation:{text:'A service can respond by numeric address while name lookup fails. Test connectivity and inspect the saved resolver before changing its configuration; verify the original symptom afterwards.',citations:[cite(0),cite(3),cite(4)]},chunks:[{id:'diagnose',title:'Separate the tests',text:'The address test checks access without name lookup. Inspecting the resolver reveals its saved configuration. A working cable alone does not establish that name lookup works.',citations:[cite(1),cite(2),cite(6)]},{id:'change',title:'Change, then verify',text:'Correcting the resolver requires the successful address test and resolver inspection, and costs two effort units. Verification costs one and tests whether lookup works. The lab allows six effort units; rebooting spends three without correcting the resolver, while a reset ends the run unsuccessfully.',citations:[cite(0),cite(3),cite(4),cite(5)]},{id:'conclude',title:'Support the diagnosis',text:'The conclusion needs the numeric-address test, the stale resolver observation and the successful lookup verification. A configuration change is not proof that the service works.',citations:[cite(6)]}],guidedApplication:{prompt:'Inspect stations and spend the effort budget on diagnosing, correcting and verifying the source-defined fault.',steps:['Select a station to inspect its action and cost.','Take the action and read its consequence.','When lookup is restored, select the discovered evidence supporting the diagnosis.']}},{activity,ageGroup:'adult',sources:[source],sourceWindow:{sourceId:source.id,start:0,end:source.text.length}});
 return createNotebook({id:'operation-world-regression',title:'The missing signal',ageGroup:'adult',theme:'space',sources:[source],activities:[activity],cards:[],scaffoldIds:['fault-diagnosis'],aiLearningPlan:{version:1,missions:[teaching]}});
}
async function saved(page:Page){return page.evaluate(()=>new Promise<any>((resolve,reject)=>{const req=indexedDB.open('asterloom-local-v1',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('records','readonly').objectStore('records').get('progress:operation-world-regression');r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);};}));}
async function enter(page:Page){await page.addInitScript(n=>{(window as any).__ASTERLOOM_NOTEBOOK__=n;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},fixture());await page.goto('/');await page.getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);await expect(page.getByRole('region',{name:'Interactive operation',exact:true})).toBeVisible();}
async function action(page:Page,label:string){await page.getByRole('button',{name:`Inspect ${label}`,exact:true}).click();await page.getByRole('button',{name:'Take this action',exact:true}).click();}

test('generated scenarios play as a saved operation: inspect, spend, discover, recover and conclude',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});let generationCalls=0;await page.route('**/api/generate',r=>{generationCalls++;return r.abort();});await enter(page);
 await expect(page.getByRole('complementary',{name:'Studio workspace',exact:true})).not.toBeVisible();
 await expect(page.getByRole('region',{name:'Scenario unavailable',exact:true})).toHaveCount(0);
 await expect(page.locator('.operation-telemetry')).not.toContainText('Resolver configuration');
 await page.getByRole('button',{name:'Inspect Correct the resolver',exact:true}).click();await expect(page.getByRole('button',{name:'Take this action',exact:true})).toBeDisabled();await expect(page.locator('.operation-unavailable')).toContainText('prerequisites');
 await page.getByRole('button',{name:'Enable game sound',exact:true}).click();
 await action(page,'Verify name lookup');await expect(page.locator('.scenario-consequence')).toContainText('Name lookup still fails');await expect(page.locator('.operation-budget>strong')).toHaveText('5 / 6');expect((await saved(page)).practice?.xp??0).toBe(0);
 await expect(page.locator('.operation-event')).toBeVisible();await page.getByRole('button',{name:'Start a new run',exact:true}).click();await expect(page.locator('.operation-budget>strong')).toHaveText('6 / 6');
 await action(page,'Test the numeric address');await action(page,'Inspect resolver settings');
 await expect(page.locator('.scenario-consequence')).toContainText('stale resolver');
 await page.screenshot({path:'.qa/game-experience-review/operation-investigation.png',fullPage:true,animations:'disabled'});
 await expect(page.locator('.save-state')).toContainText('Saved on this device');await page.reload();await page.getByRole('button',{name:'Continue game',exact:true}).click();
 await expect(page.locator('.operation-budget>strong')).toHaveText('4 / 6');await expect(page.locator('.scenario-consequence')).toContainText('stale resolver');await expect(page.locator('.operation-event')).toHaveCount(0);await expect(page.locator('.station-pulse')).toHaveCount(0);
 await action(page,'Correct the resolver');await expect(page.locator('.scenario-consequence')).toContainText('Verify the outcome');await action(page,'Verify name lookup');await expect(page.locator('.operation-world')).toHaveAttribute('data-phase','success');await expect(page.locator('.scenario-evidence-drawer')).toHaveAttribute('open');
 for(const label of ['Numeric-address test','Resolver inspection','Verification result'])await page.locator('.scenario-observation').filter({has:page.getByText(label,{exact:true})}).getByRole('checkbox').check();
 await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback')).toHaveAttribute('data-response','correct');await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
 const progress=await saved(page);expect(progress.xp).toBe(0);expect(progress.practice.xp).toBe(20);expect(progress.structured['scenario-resolver-case'].completed).toBe(false);expect(generationCalls).toBe(0);
 await page.screenshot({path:'.qa/game-experience-review/operation-complete.png',fullPage:true,animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:/Revisit this mission/}).click();await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');await expect(page.locator('.operation-world')).toHaveAttribute('data-phase','success');await expect(page.locator('.operation-event')).toHaveCount(0);await expect(page.locator('.station-pulse')).toHaveCount(0);
 // Reviewing an unavailable station must not turn a completed attempt into a
 // new unchecked answer or award points again.
 await page.getByRole('button',{name:'Inspect Correct the resolver',exact:true}).click();
 await expect(page.getByRole('button',{name:'Take this action',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();
 await expect(page.locator('.structured-feedback')).toHaveAttribute('data-response','correct');
 await expect.poll(async()=> (await saved(page)).structured['scenario-resolver-case'].response.selectedActionId).toBe('replace-resolver');
 const inspected=await saved(page);expect(inspected.structured['scenario-resolver-case'].response._draft.checked).toBe(true);expect(inspected.practice.xp).toBe(20);
 await page.reload();await page.getByRole('button',{name:/Revisit this mission/}).click();
 await expect(page.getByRole('button',{name:'Challenge complete',exact:true})).toBeDisabled();await expect(page.locator('[data-hud="total-xp"]')).toContainText('20 XP');
});

test('operation stations are keyboard usable, readable and do not reveal hidden state on small screens',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await enter(page);await page.getByRole('button',{name:'Inspect Test the numeric address',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.operation-selected')).toContainText('Check whether the service can be reached');await page.getByRole('button',{name:'Take this action',exact:true}).click();await expect(page.locator('.scenario-consequence')).toContainText('numeric-address test succeeds');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 const serious=(await new AxeBuilder({page}).include('.structured-board').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;expect(serious).toEqual([]);
 await page.screenshot({path:'.qa/game-experience-review/operation-mobile.png',fullPage:true,animations:'disabled'});
});
