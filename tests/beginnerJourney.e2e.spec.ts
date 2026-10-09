import {openDetailedWorkspace} from './teachingDriver.mjs';
import {test,expect,type Page} from '@playwright/test';
import type {Notebook,Progress} from '../src/types';
import {directorReply} from './gameDirector.fixture';
import {childPlaySources,puppetStoryFixture} from '../src/data/childPlayFixtures';
import {learnBeforeQuest} from './learningJourney.helpers';

const material='# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.';
async function records(page:Page):Promise<Notebook[]>{return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('records','readonly').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result.filter(value=>Array.isArray(value?.sources)));db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}));}
async function progressFor(page:Page,id:string):Promise<Progress>{return page.evaluate(id=>new Promise<any>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('records','readonly').objectStore('records').get('progress:'+id);q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};request.onerror=()=>reject(request.error);}),id);}
async function begin(page:Page,title:string){await page.goto('/');await expect(page.getByRole('heading',{name:'What will you discover today?',exact:true})).toBeVisible();await expect(page.locator('.notebook-card')).toHaveCount(0);expect(await records(page)).toEqual([]);await page.getByRole('button',{name:'Create a game',exact:true}).last().click();await page.getByLabel('Notebook title',{exact:true}).fill(title);}
async function paste(page:Page){await page.getByRole('button',{name:'Paste notes',exact:true}).click();await page.getByLabel('Source title',{exact:true}).fill('Maintenance notes');await page.getByLabel('Your material',{exact:true}).fill(material);await page.getByRole('button',{name:'Add material',exact:false}).click();await expect(page.locator('.source-main')).toContainText('Maintenance notes');}
async function connect(page:Page){
 await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[]}}));
 await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'source-planner',name:'Source planner'}]}}));
 await page.getByRole('button',{name:'Connect AI to create',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Connect your AI',exact:true})});
 await expect(dialog).toBeVisible();const api=dialog.getByText('Or use an API / local model',{exact:true});if(await api.isVisible())await api.click();
 await dialog.getByLabel('API key · this session only',{exact:true}).fill('session-only-test-key');await dialog.getByLabel('Model ID',{exact:true}).fill('source-planner');await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('button',{name:/^(Create game with AI|Continue creation)$/})).toBeVisible();
}
const reply=directorReply;

test('creation shows saved percentages, live Aster context and opt-in provider activity through automatic completion',async({page},testInfo)=>{
 let releaseWrite!:()=>void,writeStarted=false,statusReads=0;
 const hold=new Promise<void>(resolve=>{releaseWrite=resolve;});
 await page.route('**/api/generate',async route=>{
  const body=route.request().postDataJSON();
  expect(body.requestId).toMatch(/^request-[a-f0-9-]{36}$/);
  if(body.prompt.includes('STAGE: write')){writeStarted=true;await hold;}
  await route.fulfill({json:reply(body)});
 });
 await page.route('**/api/generate/status/*',async route=>{
  statusReads++;const now=new Date().toISOString(),requestId=new URL(route.request().url()).pathname.split('/').at(-1);
  await route.fulfill({json:{requestId,status:'running',phase:'generating',startedAt:now,updatedAt:now,events:[{at:now,phase:'connecting',message:'Connected to the selected provider.'},{at:now,phase:'generating',message:'The provider started generating this mission.'}],reasoningSummaryAvailable:false}});
 });
 await begin(page,'An observable creation');await paste(page);await connect(page);
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();
 await expect.poll(()=>writeStarted).toBe(true);
 const bar=page.getByRole('progressbar',{name:'Game creation progress',exact:true});
 await expect.poll(async()=>Number(await bar.getAttribute('value'))).toBeGreaterThan(0);
 expect(Number(await bar.getAttribute('value'))).toBeLessThan(100);
 await expect(page.getByRole('button',{name:'Continue creation',exact:true})).toHaveCount(0);
 await page.waitForTimeout(1700);expect(statusReads).toBe(0);
 await page.locator('.ai-activity-panel>summary').click();
 await expect(page.locator('.ai-activity-content')).toContainText('AI is preparing the response');
 await expect(page.locator('.ai-activity-content')).toContainText('does not expose a public reasoning summary');
 await expect.poll(()=>statusReads).toBeGreaterThan(0);
 await page.screenshot({path:testInfo.outputPath('creation-progress-and-provider-activity.png'),fullPage:true});
 await page.locator('.ai-activity-panel>summary').click();const stoppedReads=statusReads;
 await page.waitForTimeout(1700);expect(statusReads).toBe(stoppedReads);
 await page.locator('button.aster-launcher').click();
 const aster=page.getByRole('dialog',{name:'Ask Aster',exact:true});
 await aster.getByRole('button',{name:'What is happening?',exact:true}).click();
 await expect(aster.getByRole('region',{name:'Current activity answer'})).toContainText('Game creation is running');
 await expect(aster.locator('input')).toHaveValue('What is happening?');
 releaseWrite();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 await expect(bar).toHaveAttribute('value','100');
 await expect(aster.getByRole('region',{name:'Current activity answer'})).toContainText('Game creation is complete and saved');
 await expect(aster.locator('input')).toHaveValue('What is happening?');
 const saved=(await records(page))[0];expect(saved.gameDesign?.events?.some(event=>event.phase==='write'&&event.kind==='completed')).toBe(true);
 await page.screenshot({path:testInfo.outputPath('aster-current-creation-awareness.png'),fullPage:true});
});

test('a provider timeout shows its saved reason and resumes without repeating the successful plan',async({page})=>{
 const stages:string[]=[];let failWrite=true;
 await page.route('**/api/generate',async route=>{
  const body=route.request().postDataJSON(),stage=body.prompt.match(/STAGE: (\w+)/)?.[1];stages.push(stage);
  if(stage==='write'&&failWrite){await route.fulfill({status:504,json:{error:'The provider exceeded the request deadline.',code:'PROVIDER_TIMEOUT'}});return;}
  await route.fulfill({json:reply(body)});
 });
 await begin(page,'A resumable timed-out request');await paste(page);await connect(page);
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();
 await expect(page.getByRole('button',{name:'Continue creation',exact:true})).toBeVisible();
 const bar=page.getByRole('progressbar',{name:'Game creation progress',exact:true});
 const savedPercent=await bar.getAttribute('value');expect(Number(savedPercent)).toBeGreaterThan(0);expect(Number(savedPercent)).toBeLessThan(100);
 await expect(page.getByRole('region',{name:'Game creation status'})).toContainText('Creation needs attention');
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
 expect(stages).toEqual(['plan','write']);
 await page.reload();await page.getByRole('button',{name:'Open A resumable timed-out request',exact:true}).click();
 await expect(bar).toHaveAttribute('value',savedPercent!);
 await page.locator('button.aster-launcher').click();
 const aster=page.getByRole('dialog',{name:'Ask Aster',exact:true});
 await aster.locator('input').fill('Why did creation fail?');await aster.getByRole('button',{name:'Find in my sources',exact:true}).click();
 await expect(aster.getByRole('region',{name:'Current activity answer'})).toContainText('timeout');
 await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 failWrite=false;await connect(page);await page.getByRole('button',{name:'Continue creation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 expect(stages).toEqual(['plan','write','write','check']);await expect(bar).toHaveAttribute('value','100');
});

test('fresh creation keeps sources and preferences when connecting is dismissed, without making an AI request',async({page})=>{
 let calls=0;page.on('request',request=>{if(request.url().includes('/api/generate'))calls++;});await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[]}}));await begin(page,'My first learning game');await paste(page);await page.getByRole('combobox',{name:'Age group',exact:true}).selectOption('9-11');await page.getByRole('combobox',{name:'Learning goal',exact:true}).selectOption('Follow a procedure');
 await expect(page.getByRole('tab')).toHaveCount(0);await expect(page.getByRole('button',{name:'Game library',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Connect AI to create',exact:true}).click();await expect(page.getByRole('heading',{name:'Connect your AI',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.locator('.source-main')).toContainText('Maintenance notes');await expect(page.getByRole('combobox',{name:'Age group',exact:true})).toHaveValue('9-11');await expect(page.getByRole('combobox',{name:'Learning goal',exact:true})).toHaveValue('Follow a procedure');expect(calls).toBe(0);
 await page.reload();await page.getByRole('button',{name:'Open My first learning game',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('My first learning game');await expect(page.locator('.source-main')).toContainText('Maintenance notes');const saved=(await records(page))[0];expect(saved.sources[0].text).toBe(material);expect(saved.ageGroup).toBe('9-11');expect(saved.goal).toBe('Follow a procedure');
});

for(const method of ['paste','upload'] as const)test(`a beginner can ${method}, create through measured planning, writing and checking and start a source-based lesson without template selection`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let calls=0;await page.route('**/api/generate',async route=>{calls++;const body=route.request().postDataJSON();const data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(body.maxOutputTokens).toBeLessThanOrEqual(8000);if(data.units){expect(data.units.length).toBeGreaterThan(0);expect(data.units.every((u:{excerpt:string})=>material.includes(u.excerpt))).toBe(true);}await route.fulfill({json:reply(body)});});
 await begin(page,`My ${method} adventure`);if(method==='paste')await paste(page);else{await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'maintenance.md',mimeType:'text/markdown',buffer:Buffer.from(material)});await expect(page.locator('.source-main')).toContainText('maintenance.md');}
 await connect(page);expect(calls).toBe(0);await expect(page.getByRole('tab')).toHaveCount(0);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(calls).toBe(4);
 const usage=page.getByRole('region',{name:'AI creation usage',exact:true});await usage.locator('summary').click();await expect(usage).toContainText('4 requests');await expect(usage.locator('dl > div').filter({has:page.getByText('Input tokens',{exact:true})}).locator('dd')).toHaveText('400');await expect(usage.locator('dl > div').filter({has:page.getByText('Output tokens',{exact:true})}).locator('dd')).toHaveText('240');await expect(usage.locator('dl > div').filter({has:page.getByText('Cached input',{exact:true})}).locator('dd')).toHaveText('120');
 if(method==='upload')await page.screenshot({path:testInfo.outputPath('director-creator-with-usage.png'),fullPage:true});
 const saved=(await records(page))[0];expect(saved.gameDesign?.receipts).toHaveLength(4);expect(saved.aiLearningPlan?.missions).toHaveLength(1);expect(saved.sources[0].text).toBe(material);expect(saved.activities!.find(a=>a.id.startsWith('director-'))).toMatchObject({kind:'sequence',reviewStatus:'needs-review'});expect(JSON.stringify(saved)).not.toContain('session-only-test-key');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('session-only-test-key');
 await page.getByRole('button',{name:'Play game',exact:true}).click();await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Check my work',exact:true})).toHaveCount(0);if(method==='upload'){await page.getByRole('button',{name:'Learn the ideas',exact:true}).click();await expect(page.locator('.lesson-teaching-card')).toBeVisible();await page.screenshot({path:testInfo.outputPath('director-source-teaching.png'),fullPage:true});}await learnBeforeQuest(page);await openDetailedWorkspace(page);await expect(page.locator('.structured-sequence')).toBeVisible();await page.locator('button.aster-launcher').click();const companion=page.getByRole('dialog',{name:'Ask Aster',exact:true});await companion.getByRole('button',{name:'Help with this mission',exact:true}).click();await expect(companion).toContainText('AI-PREPARED PRACTICE GUIDANCE');await expect(companion).toContainText('The reset procedure has three documented actions in order.');await expect(companion.locator('.aster-citation-links')).toContainText(method==='paste'?'Maintenance notes':'maintenance.md');if(method==='upload')await page.screenshot({path:testInfo.outputPath('director-gameplay-with-aster-help.png'),fullPage:true});await page.getByRole('button',{name:'Close Aster',exact:true}).click();expect(calls).toBe(4);
 // Force a known source-order violation; a random starting route can occasionally be correct.
 const moveFirstDown=page.getByRole('button',{name:'Move Open the settings panel. down',exact:true});
 while(await moveFirstDown.isEnabled())await moveFirstDown.click();
 await expect(page.locator('.route-stations .route-step strong').last()).toHaveText('Open the settings panel.');
 await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback.draft-preview')).toBeVisible();await expect(page.locator('.structured-game-header .xp-pill')).toContainText('0 Journey XP');
 const hud=page.getByRole('region',{name:'Game progress',exact:true});await expect(hud).toContainText('Model practice score');const practiceScore=await hud.locator('[data-hud="score"] strong').textContent();
 const mission=saved.activities!.find(a=>a.id.startsWith('director-'))!;
 const readProgress=()=>progressFor(page,saved.id);
 await expect.poll(async()=>((await readProgress()).structured![mission.id].response as any)._draft.checked).toBe(true);
 const progress=await readProgress();expect(progress.xp).toBe(0);expect(progress.practice?.xp??0).toBe(0);expect(progress.mastery).toBe(0);expect(progress.completedCardIds).toEqual([]);expect(progress.structured![mission.id]).toMatchObject({completed:false,score:0,maxScore:0,attempts:0});expect(progress.structured![mission.id].review).toBeUndefined();expect(progress.structured![mission.id].response._draft.hintUsed).toBe(true);
 await page.reload();await page.getByRole('button',{name:`Open My ${method} adventure`,exact:true}).click();await expect(page.getByRole('region',{name:'AI creation usage',exact:true})).toContainText('400 in · 240 out');expect((await records(page))[0].gameDesign?.receipts).toHaveLength(4);await page.locator(`.campaign-lessons article[data-activity-id="${mission.id}"]`).getByRole('button',{name:'Revisit this mission',exact:true}).click();await expect(hud).toContainText('Model practice score');await expect(hud.locator('[data-hud="score"] strong')).toHaveText(practiceScore!);await expect(hud.locator('[data-hud="total-xp"] strong')).toHaveText('0 XP');expect((await readProgress()).practice?.xp??0).toBe(0);expect((await readProgress()).structured![mission.id].completed).toBe(false);expect(calls).toBe(4);expect(errors).toEqual([]);
});

test('canceling creation keeps the source draft and rejects a late answer instead of announcing a finished game',async({page})=>{
 let calls=0,release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/generate',async route=>{calls++;await hold;await route.fulfill({json:reply(route.request().postDataJSON())}).catch(()=>{});});
 await begin(page,'A canceled creation');await paste(page);await connect(page);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect.poll(()=>calls).toBe(1);await page.getByRole('button',{name:'Cancel creation',exact:true}).click();await expect(page.getByRole('button',{name:'Continue creation',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);release();await expect(page.locator('.source-main')).toContainText('Maintenance notes');const saved=(await records(page))[0];expect(saved.sources[0].text).toBe(material);expect(saved.activities?.some(a=>a.id.startsWith('director-'))).toBe(false);expect(saved.gameDesign?.receipts).toHaveLength(1);expect(saved.gameDesign?.receipts[0]).toMatchObject({status:'canceled',usage:{status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null}});const usage=page.getByRole('region',{name:'AI creation usage',exact:true});await usage.locator('summary').click();await expect(usage).toContainText('1 request');await expect(usage).toContainText('incomplete reporting');await expect(usage.locator('dl > div').filter({has:page.getByText('Input tokens',{exact:true})}).locator('dd')).toHaveText('Not reported');await expect(usage).toContainText('may have consumed usage');expect(calls).toBe(1);await page.reload();await page.getByRole('button',{name:'Open A canceled creation',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('A canceled creation');await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
});


test('failed final game save never exposes a playable ready game and can retry without another AI request',async({page})=>{
 let calls=0;await page.route('**/api/generate',async route=>{calls++;await route.fulfill({json:reply(route.request().postDataJSON())});});
 await begin(page,'A game awaiting a durable save');await paste(page);await connect(page);
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).__failGameReady=true;IDBObjectStore.prototype.put=function(value,key){if((window as any).__failGameReady&&typeof key==='string'&&key.startsWith('notebook:')&&value.creation?.status==='ready')throw new DOMException('The finished game could not be stored','QuotaExceededError');return put.call(this,value,key);};});
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('The finished game could not be stored');await page.getByRole('button',{name:'Got it',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
 expect((await records(page))[0].creation?.status).toBe('draft');await page.getByRole('button',{name:'Your games',exact:true}).last().click();await page.getByRole('button',{name:'Open A game awaiting a durable save',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('A game awaiting a durable save');await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);expect(calls).toBe(4);
 await page.evaluate(()=>{(window as any).__failGameReady=false;});await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect((await records(page))[0].creation?.status).toBe('ready');expect(calls).toBe(4);
});


test('a caregiver creates a source-scripted preschool puppet game with saved short teaching and no independent credit',async({page})=>{
 let calls=0;await page.route('**/api/generate',async route=>{
  calls++;const body=route.request().postDataJSON(),data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]),response=reply(body),value=JSON.parse(response.text);
  if(body.prompt.includes('STAGE: plan')){const choice=data.choices.find((c:any)=>c.scaffoldId==='puppet-stories');expect(choice).toBeTruthy();for(const mission of value.missions)Object.assign(mission,{kind:'child-play',scaffoldId:choice.scaffoldId,title:'A cup for two friends',objective:'Play the source story together.',visualDirection:{scene:choice.scene,sourceAssetIds:[]},asterDirection:{welcome:'welcome-wave',hint:'patient-support'}});}
  if(body.prompt.includes('STAGE: write'))for(const mission of value.missions){const unit=data.missions.find((m:any)=>m.plan.id===mission.missionId).unit,{scaffoldIds:_bindings,...model}=structuredClone(puppetStoryFixture),citations=[{sourceId:unit.sourceId,evidence:unit.excerpt}];mission.activity={...model,sourceRefs:model.sourceRefs.map(ref=>({...ref,sourceId:unit.sourceId}))};mission.teaching={title:'Explore a cup for two friends',objective:'Give each character a turn.',conceptExplanation:{text:'Ada and Bo share a cup in this story.',citations},chunks:[{id:'characters',title:'Meet the friends',text:'Ada is the helper. Bo is the friend.',citations},{id:'action',title:'Hear their choices',text:'Ada asks Bo about using the cup.',citations}],guidedApplication:{prompt:'Choose a puppet and a story line together.',steps:['Pick the character who will speak.','Choose the source story line.']}};}
  await route.fulfill({json:{...response,text:JSON.stringify(value)}});
 });
 await begin(page,'Our shared-cup story');await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'shared-cup-story.txt',mimeType:'text/plain',buffer:Buffer.from(childPlaySources[0].text)});await expect(page.locator('.source-main')).toContainText('shared-cup-story.txt');await page.getByRole('combobox',{name:'Age group',exact:true}).selectOption('3-5');await connect(page);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(calls).toBe(4);
 const saved=(await records(page))[0],mission=saved.activities!.find(a=>a.id.startsWith('director-'))!;expect(mission.kind).toBe('child-play');expect(mission.reviewStatus).toBe('needs-review');expect(saved.aiLearningPlan!.missions[0].chunks.every(c=>c.text.split(/\s+/).length<=25)).toBe(true);
 await page.getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);const board=page.getByRole('region',{name:'Interactive puppet story',exact:true});await expect(board).toBeVisible();await board.getByRole('button',{name:'Play as Ada, helper',exact:true}).click();await board.getByRole('button',{name:/Bo, would you like to use the cup/}).click();await board.getByRole('button',{name:'Play as Bo, friend',exact:true}).click();await board.getByRole('button',{name:/Let’s put the cup on the Table/}).click();await expect(board).toContainText('Story goal reached');await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback.draft-preview')).toContainText('Mission rules satisfied');await expect(page.getByRole('region',{name:'Game progress',exact:true})).toContainText('Model practice score');await expect(page.locator('[data-hud="score"] strong')).toHaveText('3 / 3');await expect(page.locator('[data-hud="total-xp"] strong')).toHaveText('20 XP');expect(calls).toBe(4);
 const savedProgress=await progressFor(page,saved.id);expect(savedProgress.practice?.xp).toBe(20);expect(savedProgress.xp).toBe(0);expect(savedProgress.mastery).toBe(0);expect(savedProgress.structured![mission.id].completed).toBe(false);expect(savedProgress.structured![mission.id].review).toBeUndefined();
 await page.reload();await page.getByRole('button',{name:'Open Our shared-cup story',exact:true}).click();await page.locator(`.campaign-lessons article[data-activity-id="${mission.id}"]`).getByRole('button',{name:'Revisit this mission',exact:true}).click();await expect(board).toContainText('Story goal reached');await expect(page.locator('.structured-feedback.draft-preview')).toBeVisible();await expect(page.locator('[data-hud="score"] strong')).toHaveText('3 / 3');await expect(page.locator('[data-hud="total-xp"] strong')).toHaveText('20 XP');expect((await progressFor(page,saved.id)).practice).toEqual(savedProgress.practice);
 const beforeRepeat=await progressFor(page,saved.id);const completedCheck=page.getByRole('button',{name:'Challenge complete',exact:true});await expect(completedCheck).toBeDisabled();await completedCheck.dispatchEvent('click');expect((await progressFor(page,saved.id)).structured![mission.id].updatedAt).toBe(beforeRepeat.structured![mission.id].updatedAt);await expect(page.locator('.structured-feedback.draft-preview')).toContainText('Mission rules satisfied');await expect(page.locator('[data-hud="score"] strong')).toHaveText('3 / 3');await expect(page.locator('[data-hud="total-xp"] strong')).toHaveText('20 XP');const repeated=await progressFor(page,saved.id);expect(repeated.practice).toEqual(savedProgress.practice);expect(repeated.xp).toBe(0);expect(repeated.mastery).toBe(0);expect(calls).toBe(4);
});

test('mission checkpoint progress stays durable during delayed and failed storage, then saves the retained mission without another AI write',async({page})=>{
 const stages:string[]=[];let releaseWrite!:()=>void;
 const holdWrite=new Promise<void>(resolve=>{releaseWrite=resolve;});
 await page.route('**/api/generate',async route=>{
  const body=route.request().postDataJSON(),stage=body.prompt.match(/STAGE: (\w+)/)?.[1];stages.push(stage);
  if(stage==='write')await holdWrite;
  await route.fulfill({json:reply(body)});
 });
 await begin(page,'A mission waiting for storage');await paste(page);await connect(page);
 await page.evaluate(()=>{
  const control=(window as any).missionCheckpoint={mode:'hold',holding:false,rejections:0};
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){
   const checkpoint=typeof key==='string'&&key.startsWith('notebook:')&&value.gameDesign?.batches?.some((batch:any)=>batch.drafts?.length);
   if(checkpoint&&control.mode==='fail'){control.rejections++;throw new DOMException('The mission checkpoint could not be stored','QuotaExceededError');}
   const request=original.call(this,value,key);
   if(checkpoint&&control.mode==='hold'){
    control.holding=true;
    const store=this,transaction=this.transaction;
    // Keep the actual transaction open so React can render while its durable
    // acknowledgment is pending. Abort later; no mocked save promise is used.
    const keepAlive=()=>{const read=store.get(key!);read.onsuccess=()=>{if(control.mode==='hold')keepAlive();else if(control.mode==='fail'){control.rejections++;transaction.abort();}};};
    keepAlive();
   }
   return request;
  };
 });
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();
 await expect.poll(()=>stages).toEqual(['plan','write']);
 const bar=page.getByRole('progressbar',{name:'Game creation progress',exact:true});
 await expect(bar).toHaveAttribute('value','25');
 const before=(await records(page))[0];expect(before.gameDesign?.batches[0].status).toBe('planned');expect(before.gameDesign?.batches[0].drafts??[]).toEqual([]);
 await page.locator('button.aster-launcher').click();
 const aster=page.getByRole('dialog',{name:'Ask Aster',exact:true});
 await aster.locator('input').fill('What is my creation progress?');await aster.getByRole('button',{name:'Find in my sources',exact:true}).click();
 const awareness=aster.getByRole('region',{name:'Current activity answer'});
 await expect(awareness).toContainText('1 of 4 logical steps (25%)');
 releaseWrite();await expect.poll(()=>page.evaluate(()=>(window as any).missionCheckpoint.holding)).toBe(true);
 await expect(bar).toHaveAttribute('value','25');await expect(awareness).toContainText('1 of 4 logical steps (25%)');
 await expect(awareness).toContainText('0 of 1 planned mission models written');
 await page.evaluate(()=>(window as any).missionCheckpoint.mode='fail');
 await expect(page.locator('.save-state')).toContainText('Save needs attention');
 await expect(page.getByRole('button',{name:'Continue creation',exact:true})).toBeVisible();
 await expect(bar).toHaveAttribute('value','25');await expect(awareness).toContainText('1 of 4 logical steps (25%)');
 const failed=(await records(page))[0];expect(failed.gameDesign?.batches[0].drafts??[]).toEqual([]);expect(failed.creation?.status).toBe('draft');expect(stages).toEqual(['plan','write']);
 await page.getByRole('button',{name:'Got it',exact:true}).click();await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 await page.evaluate(()=>(window as any).missionCheckpoint.mode='pass');
 await page.getByRole('button',{name:'Continue creation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 expect(stages).toEqual(['plan','write','check','overview']);await expect(bar).toHaveAttribute('value','100');
 const saved=(await records(page))[0];expect(saved.gameDesign?.batches[0].drafts).toHaveLength(1);expect(saved.gameDesign?.receipts).toHaveLength(4);expect(saved.creation?.status).toBe('ready');
});

test('a title edit queued behind a hidden mission checkpoint preserves that checkpoint after reopening and reloading',async({page})=>{
 const stages:string[]=[];
 await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON();stages.push(body.prompt.match(/STAGE: (\w+)/)?.[1]);await route.fulfill({json:reply(body)});});
 await begin(page,'A checkpoint with a new name');await paste(page);await connect(page);
 await page.evaluate(()=>{
  const control=(window as any).queuedCheckpoint={holding:false,release:false};const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){
   const request=original.call(this,value,key);
   if(!control.release&&typeof key==='string'&&key.startsWith('notebook:')&&value.gameDesign?.batches?.some((batch:any)=>batch.drafts?.length)){
    control.holding=true;const store=this;
    const keepAlive=()=>{const read=store.get(key);read.onsuccess=()=>{if(!control.release)keepAlive();};};keepAlive();
   }
   return request;
  };
 });
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).queuedCheckpoint.holding)).toBe(true);
 await expect(page.getByRole('progressbar',{name:'Game creation progress',exact:true})).toHaveAttribute('value','25');
 // Leaving the editor stops generation. The already-started save still needs
 // to commit, and this unrelated edit must not replace its hidden checkpoint.
 await page.getByRole('button',{name:'Your games',exact:true}).last().click();
 await page.getByRole('button',{name:'Open A checkpoint with a new name',exact:true}).click();
 await page.getByLabel('Notebook title',{exact:true}).fill('My renamed checkpoint');
 await page.evaluate(()=>(window as any).queuedCheckpoint.release=true);
 await expect(page.locator('.save-state')).toContainText('Saved on this device');
 await expect.poll(async()=>{const saved=(await records(page))[0];return {title:saved.title,drafts:saved.gameDesign?.batches[0].drafts?.length};}).toEqual({title:'My renamed checkpoint',drafts:1});
 expect(stages).toEqual(['plan','write']);
 await page.reload();await page.getByRole('button',{name:'Open My renamed checkpoint',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'Game creation progress',exact:true})).toHaveAttribute('value','50');
 await connect(page);await page.getByRole('button',{name:'Continue creation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(stages).toEqual(['plan','write','check','overview']);
 expect((await records(page))[0].gameDesign?.receipts).toHaveLength(4);
});
