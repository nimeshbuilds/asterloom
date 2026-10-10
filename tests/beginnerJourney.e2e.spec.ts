import {openDetailedWorkspace} from './teachingDriver.mjs';
import {test,expect,type Page} from '@playwright/test';
import type {Notebook,Progress} from '../src/types';
import {directorReply} from './gameDirector.fixture';
import {childPlaySources,puppetStoryFixture} from '../src/data/childPlayFixtures';
import {learnBeforeQuest} from './learningJourney.helpers';
import {isCurrentEvidence} from '../src/lib/evidence';
import {emptyGameDesign} from '../src/lib/gameDesign';
import {createNotebook,createSource} from '../src/lib/utils';

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
 await dialog.getByLabel('API key · this session only',{exact:true}).fill('session-only-test-key');await dialog.getByLabel('Model ID',{exact:true}).fill('source-planner');await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('button',{name:/^(Create game with AI|Continue creation|Resume creation|Retry failed sections)$/})).toBeVisible();
}
const reply=directorReply;

test('a rejected generated mission shows its actual review feedback after reload without claiming the source lacks a procedure',async({page})=>{
 const reason='The lesson promises a route submission control that the displayed game does not provide.',stages:string[]=[];
 await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON(),stage=body.prompt.match(/STAGE: (\w+)/)?.[1],response=reply(body);stages.push(stage);if(stage==='check'){const value=JSON.parse(response.text);value.checks=value.checks.map((check:any)=>({...check,decision:'source-study',reason,quality:{...check.quality,controlsMatch:false}}));response.text=JSON.stringify(value);}await route.fulfill({json:response});});
 await begin(page,'A mission with a review issue');await paste(page);await connect(page);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();
 const status=page.getByRole('region',{name:'Game creation status'});await expect(status).toContainText('No mission passed review');await expect(status).toContainText(reason);await expect(status).not.toContainText('More source detail');await expect(status).not.toContainText('100%');await expect(status.getByRole('progressbar')).toHaveCount(0);await expect(page.getByRole('button',{name:'No mission passed review',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);expect(stages).toEqual(['plan','write','check']);
 await page.locator('.import-quality-notes>summary').click();await expect(page.locator('.import-quality-notes')).toContainText(reason);await expect(page.locator('.import-quality-notes')).not.toContainText('No explicit structures');
 const before=(await records(page))[0];expect(before.gameDesign!.batches[0].drafts).toHaveLength(1);expect(before.gameDesign!.batches[0].checks![0]).toMatchObject({decision:'source-study',reason});
 await page.reload();await page.getByRole('button',{name:'Open A mission with a review issue',exact:true}).click();await expect(status).toContainText('No mission passed review');await expect(status).toContainText(reason);await expect(status).not.toContainText('100%');expect(stages).toHaveLength(3);expect((await records(page))[0].gameDesign!.receipts).toEqual(before.gameDesign!.receipts);
});

test('legacy failed sections have an explicit retry instead of completed source-review claims, retaining old usage after a model change',async({page})=>{
 const notebook=createNotebook({title:'A source review that needs repair',creation:{mode:'ai',status:'draft'},sources:[createSource(material,'Maintenance notes')]}),design=emptyGameDesign(notebook,{id:'openai',model:'previous-designer',endpointFingerprint:null});
 design.status='ready';design.batches=design.batches.map(batch=>({...batch,status:'checked',missions:[],drafts:[],checks:[],study:batch.unitIds.map(unitId=>({unitId,reason:'A source-supported game plan could not be validated after one corrective attempt.'}))}));
 design.receipts=[{id:'previous-paid-plan',stage:'plan',batchId:design.batches[0].id,provider:'openai',model:'previous-designer',status:'completed',startedAt:'2026-10-01T12:00:00.000Z',finishedAt:'2026-10-01T12:00:01.000Z',durationMs:1000,usage:{status:'reported',inputTokens:321,outputTokens:87,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:408}}];notebook.gameDesign=design;
 let releasePlan!:()=>void;const holdPlan=new Promise<void>(resolve=>{releasePlan=resolve;});
 const requests:any[]=[];await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON();requests.push(body);if(body.prompt.includes('STAGE: plan'))await holdPlan;await route.fulfill({json:reply(body)});});
 await page.goto('/');await expect(page.getByRole('heading',{name:'What will you discover today?',exact:true})).toBeVisible();
 await page.evaluate(notebook=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(notebook,'notebook:'+notebook.id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}),notebook);
 await page.reload();await page.getByRole('button',{name:'Open A source review that needs repair',exact:true}).click();
 const status=page.getByRole('region',{name:'Game creation status'});await expect(status).toContainText('Some sections need another creation attempt');await expect(status).toContainText('1 section needs retry');await expect(status).not.toContainText('More source detail is needed');await expect(status).not.toContainText('100%');await expect(status.getByRole('progressbar')).toHaveCount(0);await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);expect(requests).toEqual([]);
 await connect(page);await expect(page.getByRole('button',{name:'Retry failed sections',exact:true})).toBeEnabled();expect(requests).toEqual([]);expect((await records(page))[0].gameDesign!.receipts).toEqual(design.receipts);
 await page.getByRole('button',{name:'Retry failed sections',exact:true}).click();await expect.poll(()=>requests.length).toBe(1);await expect(status).toContainText('1 section needs retry');await expect(status.getByRole('progressbar')).toHaveCount(0);await expect(status.getByRole('button',{name:'Pause creation',exact:true})).toBeEnabled();await expect(status.getByRole('button',{name:'Cancel creation',exact:true})).toBeEnabled();releasePlan();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 expect(requests.map(request=>request.prompt.match(/STAGE: (\w+)/)?.[1])).toEqual(['plan','write','check','overview']);expect(requests.every(request=>request.model==='source-planner')).toBe(true);
 const saved=(await records(page))[0];expect(saved.sources).toEqual(notebook.sources);expect(saved.gameDesign!.receipts[0]).toEqual(design.receipts[0]);expect(saved.gameDesign!.receipts).toHaveLength(5);expect(saved.aiLearningPlan?.missions).toHaveLength(1);expect(saved.creation?.status).toBe('ready');
 await page.reload();await page.getByRole('button',{name:'Open A source review that needs repair',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(requests).toHaveLength(4);expect((await records(page))[0].gameDesign!.receipts[0]).toEqual(design.receipts[0]);
});

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
 await aster.getByText('Current activity & tools',{exact:true}).click();
 await aster.getByRole('button',{name:'What is happening?',exact:true}).click();
 const runningReply=aster.locator('.aster-chat-turn').last();
 await expect(runningReply.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Game creation is running');
 await expect(aster.locator('input')).toHaveValue('');
 await expect(runningReply.locator('.aster-chat-user p')).toHaveText('What is happening?');
 releaseWrite();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 await expect(bar).toHaveAttribute('value','100');
 await expect(runningReply.getByRole('region',{name:'Earlier current activity answer',exact:true})).toContainText('Game creation is running');
 await aster.getByRole('button',{name:'What is happening?',exact:true}).click();
 await expect(aster.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Game creation is complete and saved');
 await expect(aster.locator('input')).toHaveValue('');
 await expect(aster.locator('.aster-chat-turn')).toHaveCount(2);
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
 const firstReceipts=structuredClone((await records(page))[0].gameDesign!.receipts);expect(firstReceipts.map(receipt=>receipt.status)).toEqual(['completed','failed']);
 await page.reload();await page.getByRole('button',{name:'Open A resumable timed-out request',exact:true}).click();
 await expect(bar).toHaveAttribute('value',savedPercent!);
 await page.locator('button.aster-launcher').click();
 const aster=page.getByRole('dialog',{name:'Ask Aster',exact:true});
 await aster.locator('input').fill('Why did creation fail?');await aster.getByRole('button',{name:'Find in my sources',exact:true}).click();
 await expect(aster.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('provider reached its request deadline');await expect(aster.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Continue creation');
 await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 failWrite=false;await connect(page);await page.getByRole('button',{name:'Continue creation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 expect(stages).toEqual(['plan','write','write','check','overview']);await expect(bar).toHaveAttribute('value','100');
 const finished=(await records(page))[0],receipts=finished.gameDesign!.receipts;
 expect(receipts.slice(0,2)).toEqual(firstReceipts);expect(receipts.map(receipt=>receipt.stage)).toEqual(stages);expect(receipts.map(receipt=>receipt.status)).toEqual(['completed','failed','completed','completed','completed']);
 expect(receipts[1].usage).toMatchObject({status:'unavailable',inputTokens:null,outputTokens:null});
 expect(receipts.filter(receipt=>receipt.status==='completed').reduce((sum,receipt)=>sum+receipt.usage.inputTokens!,0)).toBe(400);
 expect(receipts.filter(receipt=>receipt.status==='completed').reduce((sum,receipt)=>sum+receipt.usage.outputTokens!,0)).toBe(240);
 expect(finished.gameDesign!.overview!.nodes.at(-1)!.status).toBe('ready');
});

test('fresh creation keeps sources and preferences when connecting is dismissed, without making an AI request',async({page})=>{
 let calls=0;page.on('request',request=>{if(request.url().includes('/api/generate'))calls++;});await page.route('**/api/ai/engines',route=>route.fulfill({json:{engines:[]}}));await begin(page,'My first learning game');await paste(page);await page.getByRole('combobox',{name:'Age group',exact:true}).selectOption('9-11');await page.getByRole('combobox',{name:'Learning goal',exact:true}).selectOption('Follow a procedure');
 await expect(page.getByRole('tab')).toHaveCount(0);await expect(page.getByRole('button',{name:'Game library',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Connect AI to create',exact:true}).click();await expect(page.getByRole('heading',{name:'Connect your AI',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.locator('.source-main')).toContainText('Maintenance notes');await expect(page.getByRole('combobox',{name:'Age group',exact:true})).toHaveValue('9-11');await expect(page.getByRole('combobox',{name:'Learning goal',exact:true})).toHaveValue('Follow a procedure');expect(calls).toBe(0);
 await page.reload();await page.getByRole('button',{name:'Open My first learning game',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('My first learning game');await expect(page.locator('.source-main')).toContainText('Maintenance notes');const saved=(await records(page))[0];expect(saved.sources[0].text).toBe(material);expect(saved.ageGroup).toBe('9-11');expect(saved.goal).toBe('Follow a procedure');
});

for(const method of ['paste','upload'] as const)test(`a beginner can ${method}, create through measured planning, writing and checking and start a source-based lesson without template selection`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let calls=0;const stages:string[]=[];let planUnits:any[]=[],overviewData:any;
 await page.route('**/api/generate',async route=>{
  calls++;const body=route.request().postDataJSON(),stage=body.prompt.match(/STAGE: (\w+)/)?.[1],data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);stages.push(stage);expect(body.maxOutputTokens).toBeLessThanOrEqual(8000);
  if(stage==='plan'){expect(data.units).toHaveLength(1);for(const unit of data.units){expect(typeof unit.excerpt).toBe('string');expect(unit.excerpt.length).toBeGreaterThan(0);expect(material.includes(unit.excerpt)).toBe(true);}planUnits=structuredClone(data.units);}
  if(stage==='write'){expect(data.missions).toHaveLength(1);const mission=data.missions[0],primary=planUnits.find(unit=>unit.unitId===mission.plan.unitId);expect(mission.unit).toEqual(primary);expect(mission.teachingContextWindow.sourceId).toBe(primary.sourceId);expect(mission.teachingContextWindow.excerpt??mission.teachingContextWindow.beforeUnit+mission.unit.excerpt+mission.teachingContextWindow.afterUnit).toBe(material.slice(mission.teachingContextWindow.start,mission.teachingContextWindow.end));}
  if(stage==='overview'){
   expect(data.units).toHaveLength(planUnits.length);const current=(await records(page))[0];
   for(const unit of data.units){const primary=planUnits.find(item=>item.unitId===unit.unitId);expect(primary).toBeDefined();expect(unit.sourceId).toBe(primary.sourceId);expect(unit.excerpt).toBeUndefined();expect(unit.savedSummary.citations.length).toBeGreaterThan(0);
    const savedNote=current.gameDesign!.batches.flatMap(batch=>batch.overviewNotes??[]).find(note=>note.unitId===unit.unitId);expect(unit.savedSummary).toEqual(savedNote!.summary);
    for(const citation of unit.savedSummary.citations){expect(citation.sourceId).toBe(unit.sourceId);expect(isCurrentEvidence(citation,current.sources)).toBe(true);expect(citation.quote).toBe(material.slice(citation.start,citation.end));expect(primary.excerpt.includes(citation.quote)).toBe(true);}
   }overviewData=structuredClone(data);
  }
  await route.fulfill({json:reply(body)});
 });
 await begin(page,`My ${method} adventure`);if(method==='paste')await paste(page);else{await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'maintenance.md',mimeType:'text/markdown',buffer:Buffer.from(material)});await expect(page.locator('.source-main')).toContainText('maintenance.md');}
 await connect(page);expect(calls).toBe(0);await expect(page.getByRole('tab')).toHaveCount(0);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(calls).toBe(4);expect(stages).toEqual(['plan','write','check','overview']);
 const usage=page.getByRole('region',{name:'AI creation usage',exact:true});await usage.locator('summary').click();await expect(usage).toContainText('4 requests');await expect(usage.locator('dl > div').filter({has:page.getByText('Input tokens',{exact:true})}).locator('dd')).toHaveText('400');await expect(usage.locator('dl > div').filter({has:page.getByText('Output tokens',{exact:true})}).locator('dd')).toHaveText('240');await expect(usage.locator('dl > div').filter({has:page.getByText('Cached input',{exact:true})}).locator('dd')).toHaveText('120');
 if(method==='upload')await page.screenshot({path:testInfo.outputPath('director-creator-with-usage.png'),fullPage:true});
 const saved=(await records(page))[0];expect(saved.gameDesign?.receipts).toHaveLength(4);expect(saved.aiLearningPlan?.missions).toHaveLength(1);expect(saved.sources[0].text).toBe(material);expect(saved.activities!.find(a=>a.id.startsWith('director-'))).toMatchObject({kind:'sequence',reviewStatus:'needs-review'});expect(JSON.stringify(saved)).not.toContain('session-only-test-key');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('session-only-test-key');
 expect(saved.gameDesign!.receipts.map(receipt=>receipt.stage)).toEqual(stages);expect(saved.gameDesign!.overview!.nodes.at(-1)!.status).toBe('ready');expect(saved.gameDesign!.overview!.nodes.at(-1)!.content!.introduction).toEqual(overviewData.units[0].savedSummary);
 await page.getByRole('button',{name:'Play game',exact:true}).click();await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Check my work',exact:true})).toHaveCount(0);if(method==='upload'){await page.getByRole('button',{name:'Learn the ideas',exact:true}).click();await expect(page.locator('.lesson-teaching-card')).toBeVisible();await page.screenshot({path:testInfo.outputPath('director-source-teaching.png'),fullPage:true});}await learnBeforeQuest(page);await openDetailedWorkspace(page);await expect(page.locator('.structured-sequence')).toBeVisible();await page.locator('button.aster-launcher').click();const companion=page.getByRole('dialog',{name:'Ask Aster',exact:true});await companion.getByText('Current activity & tools',{exact:true}).click();await companion.getByRole('button',{name:'Help with this mission',exact:true}).click();await expect(companion).toContainText('AI-PREPARED PRACTICE GUIDANCE');await expect(companion).toContainText('The reset procedure has three documented actions in order.');await expect(companion.locator('.aster-citation-links')).toContainText(method==='paste'?'Maintenance notes':'maintenance.md');if(method==='upload')await page.screenshot({path:testInfo.outputPath('director-gameplay-with-aster-help.png'),fullPage:true});await page.getByRole('button',{name:'Close Aster',exact:true}).click();expect(calls).toBe(4);
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
 await page.reload();await page.getByRole('button',{name:`Open My ${method} adventure`,exact:true}).click();await expect(page.getByRole('region',{name:'AI creation usage',exact:true})).toContainText('400 in · 240 out');expect((await records(page))[0].gameDesign?.receipts).toEqual(saved.gameDesign!.receipts);expect((await records(page))[0].gameDesign?.overview).toEqual(saved.gameDesign!.overview);await page.locator(`.campaign-lessons article[data-activity-id="${mission.id}"]`).getByRole('button',{name:'Revisit this mission',exact:true}).click();await expect(hud).toContainText('Model practice score');await expect(hud.locator('[data-hud="score"] strong')).toHaveText(practiceScore!);await expect(hud.locator('[data-hud="total-xp"] strong')).toHaveText('0 XP');expect((await readProgress()).practice?.xp??0).toBe(0);expect((await readProgress()).structured![mission.id].completed).toBe(false);expect(calls).toBe(4);expect(errors).toEqual([]);
});

test('canceling creation keeps the source draft and rejects a late answer instead of announcing a finished game',async({page})=>{
 let calls=0,release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/generate',async route=>{calls++;await hold;await route.fulfill({json:reply(route.request().postDataJSON())}).catch(()=>{});});
 await begin(page,'A canceled creation');await paste(page);await connect(page);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect.poll(()=>calls).toBe(1);await page.getByRole('button',{name:'Cancel creation',exact:true}).click();await expect(page.getByRole('button',{name:'Resume creation',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);release();await expect(page.locator('.source-main')).toContainText('Maintenance notes');const saved=(await records(page))[0];expect(saved.sources[0].text).toBe(material);expect(saved.activities?.some(a=>a.id.startsWith('director-'))).toBe(false);expect(saved.gameDesign?.control).toBe('canceled');expect(saved.gameDesign?.receipts).toHaveLength(1);expect(saved.gameDesign?.receipts[0]).toMatchObject({status:'canceled',usage:{status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null}});const usage=page.getByRole('region',{name:'AI creation usage',exact:true});await usage.locator('summary').click();await expect(usage).toContainText('1 request');await expect(usage).toContainText('incomplete reporting');await expect(usage.locator('dl > div').filter({has:page.getByText('Input tokens',{exact:true})}).locator('dd')).toHaveText('Not reported');await expect(usage).toContainText('may have consumed usage');expect(calls).toBe(1);await page.reload();await page.getByRole('button',{name:'Open A canceled creation',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('A canceled creation');await expect(page.getByRole('button',{name:'Play game',exact:true})).toHaveCount(0);
});


test('pause saves the plan, restores after reload and resumes with another provider only when explicitly requested',async({page})=>{
 const requests:any[]=[];let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});let blocked=true;
 await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON();requests.push(body);if(blocked&&body.prompt.includes('STAGE: write')){await hold;}const response=reply(body);await route.fulfill({json:{...response,actualModels:[body.model+'-actual']}}).catch(()=>{});});
 await begin(page,'A paused provider handoff');await paste(page);await connect(page);await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect.poll(()=>requests.length).toBe(2);
 const before=(await records(page))[0];expect(before.gameDesign!.batches[0].status).toBe('planned');const plan=structuredClone(before.gameDesign!.batches[0].missions);
 await page.evaluate(()=>{const state=(window as any).pauseSave={holding:false,release:false},put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){const result=put.call(this,value,key);if(!state.release&&typeof key==='string'&&key.startsWith('notebook:')&&value.gameDesign?.control==='paused'){state.holding=true;const store=this;const keepAlive=()=>{const read=store.get(key);read.onsuccess=()=>{if(!state.release)keepAlive();};};keepAlive();}return result;};});
 await page.getByRole('button',{name:'Pause creation',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).pauseSave.holding)).toBe(true);await expect(page.getByRole('region',{name:'Game creation status',exact:true})).toContainText('Pausing creation');await expect(page.getByRole('button',{name:'Pause creation',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Cancel creation',exact:true})).toBeDisabled();await expect(page.locator('.easy-ai-option').getByRole('button',{name:'Change',exact:true})).toBeDisabled();expect(requests).toHaveLength(2);await page.evaluate(()=>(window as any).pauseSave.release=true);
 await expect(page.getByRole('button',{name:'Resume creation',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Game creation status',exact:true})).toContainText('Creation is paused');
 const paused=(await records(page))[0];expect(paused.gameDesign!.control).toBe('paused');expect(paused.gameDesign!.receipts[1]).toMatchObject({status:'canceled',provider:'openai',model:'source-planner',usage:{inputTokens:null,outputTokens:null}});const receipts=structuredClone(paused.gameDesign!.receipts);
 blocked=false;release();await page.reload();await page.getByRole('button',{name:'Open A paused provider handoff',exact:true}).click();await expect(page.getByRole('region',{name:'Game creation status',exact:true})).toContainText('Creation is paused');expect((await records(page))[0].gameDesign!.receipts).toEqual(receipts);
 await page.getByRole('button',{name:'Connect AI to create',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Connect your AI',exact:true})});const api=dialog.getByText('Or use an API / local model',{exact:true});if(await api.isVisible())await api.click();await dialog.getByRole('combobox',{name:'AI provider',exact:true}).selectOption('anthropic');await dialog.getByLabel('API key · this session only',{exact:true}).fill('different-session-only-key');await dialog.getByLabel('Model ID',{exact:true}).fill('replacement-designer');await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resume creation',exact:true})).toBeVisible();await expect(page.locator('.easy-ai-option')).toContainText('replacement-designer');await page.waitForTimeout(300);expect(requests).toHaveLength(2);expect((await records(page))[0].gameDesign!.receipts).toEqual(receipts);
 await page.getByRole('button',{name:'Resume creation',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();const finished=(await records(page))[0];
 expect(requests.map(body=>body.prompt.match(/STAGE: (\w+)/)[1])).toEqual(['plan','write','write','check','overview']);expect(requests.slice(2).every(body=>body.provider==='anthropic'&&body.model==='replacement-designer')).toBe(true);
 expect(finished.sources).toEqual(paused.sources);expect(finished.gameDesign!.batches[0].missions).toEqual(plan);expect(finished.gameDesign!.control).toBeUndefined();expect(finished.gameDesign!.receipts.slice(0,2)).toEqual(receipts);expect(finished.gameDesign!.receipts.slice(2).every(receipt=>receipt.provider==='anthropic'&&receipt.model==='replacement-designer'&&receipt.actualModels?.[0]==='replacement-designer-actual')).toBe(true);expect(finished.aiLearningPlan!.missions).toHaveLength(1);expect(finished.creation!.status).toBe('ready');
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
 const askProgress=async()=>{await aster.locator('input').fill('What is my creation progress?');await aster.getByRole('button',{name:'Find in my sources',exact:true}).click();return aster.getByRole('region',{name:'Current activity answer',exact:true});};
 const initialReply=aster.locator('.aster-chat-turn').nth(0);
 await expect(await askProgress()).toContainText('1 of 4 logical steps (25%)');
 releaseWrite();await expect.poll(()=>page.evaluate(()=>(window as any).missionCheckpoint.holding)).toBe(true);
 await expect(bar).toHaveAttribute('value','25');
 const holdingAnswer=await askProgress();await expect(holdingAnswer).toContainText('1 of 4 logical steps (25%)');
 await expect(holdingAnswer).toContainText('0 of 1 planned mission models written');
 await expect(initialReply.getByRole('region',{name:'Earlier current activity answer',exact:true})).toContainText('1 of 4 logical steps (25%)');
 await page.evaluate(()=>(window as any).missionCheckpoint.mode='fail');
 await expect(page.locator('.save-state')).toContainText('Save needs attention');
 await expect(page.getByRole('button',{name:'Continue creation',exact:true})).toBeVisible();
 await expect(bar).toHaveAttribute('value','25');
 const failed=(await records(page))[0];expect(failed.gameDesign?.batches[0].drafts??[]).toEqual([]);expect(failed.creation?.status).toBe('draft');expect(stages).toEqual(['plan','write']);
 await page.getByRole('button',{name:'Got it',exact:true}).click();
 await expect(await askProgress()).toContainText('1 of 4 logical steps (25%)');
 await page.getByRole('button',{name:'Close Aster',exact:true}).click();
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

test('add sources and recreate makes a separate AI edition without changing the playable original or its progress',async({page},testInfo)=>{
 const requests:any[]=[];
 await page.route('**/api/generate',async route=>{const body=route.request().postDataJSON();requests.push(body);await route.fulfill({json:reply(body)});});
 await begin(page,'Maintenance adventure');
 const originalBytes=Buffer.from(material.replaceAll('\n','\r\n')+'\r\n','utf8');
 await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'maintenance.txt',mimeType:'text/plain',buffer:originalBytes});
 await expect(page.locator('.source-main')).toContainText('maintenance.txt');await connect(page);
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();expect(requests).toHaveLength(4);
 await expect(page.getByRole('button',{name:'Refresh from my materials',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Play game',exact:true}).click();await learnBeforeQuest(page);await expect(page.getByRole('button',{name:'Check my work',exact:true})).toBeVisible();
 const original=(await records(page))[0];await expect.poll(async()=>!!Object.values((await progressFor(page,original.id))?.structured??{}).some(state=>(state.response as any)?._draft?.lesson?.completedAt)).toBe(true);const oldProgress=await progressFor(page,original.id);
 await page.getByRole('button',{name:'Save & return',exact:true}).click();await page.getByRole('button',{name:'Edit materials',exact:true}).click();
 await expect(page.getByRole('button',{name:'Paste notes',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Age group',exact:true})).toBeDisabled();
 await page.locator('.source-main').click();await expect(page.getByRole('textbox',{name:'Readable source text',exact:true})).toHaveAttribute('readonly','');await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('button.aster-launcher').click();const guide=page.getByRole('dialog',{name:'Ask Aster',exact:true});await guide.getByRole('textbox',{name:'Message Aster',exact:true}).fill('What should I do now?');await guide.getByRole('button',{name:'Find in my sources',exact:true}).click();await expect(guide.getByRole('region',{name:'Current activity answer',exact:true})).toContainText('Add sources & recreate');await page.getByRole('button',{name:'Close Aster',exact:true}).click();
 await page.getByRole('button',{name:'Add sources & recreate',exact:true}).click();await expect(page.getByLabel('Notebook title',{exact:true})).toHaveValue('Maintenance adventure · Edition 2');
 await expect(page.getByRole('status').filter({hasText:'New edition of'})).toContainText('Your original game and its progress stay unchanged');
 await expect(page.getByRole('button',{name:'Create game with AI',exact:true})).toBeEnabled();expect(requests).toHaveLength(4);
 const edition=(await records(page)).find(item=>item.id!==original.id)!;expect(edition.editionOf).toEqual({id:original.id,title:original.title});expect(edition.sources).toEqual(original.sources);expect(edition.activities).toEqual([]);expect(edition.cards).toEqual([]);expect(edition.gameDesign).toBeUndefined();expect(edition.aiLearningPlan).toBeUndefined();expect(edition.aiToolReceipts).toBeUndefined();expect(await progressFor(page,edition.id)).toBeUndefined();
 expect(Buffer.from(edition.sources[0].originalFile!.dataUrl.split(',')[1],'base64')).toEqual(originalBytes);
 await page.getByRole('button',{name:'Paste notes',exact:true}).click();await page.getByLabel('Source title',{exact:true}).fill('Conditional maintenance');await page.getByLabel('Your material',{exact:true}).fill('# Conditional reset procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset only when the panel reports ready.');await page.getByRole('button',{name:'Add material',exact:false}).click();
 await expect(page.locator('.source-row')).toHaveCount(2);await expect.poll(async()=>(await records(page)).find(item=>item.id===edition.id)?.sources.length).toBe(2);expect(requests).toHaveLength(4);
 expect((await records(page)).find(item=>item.id===original.id)).toEqual(original);expect(await progressFor(page,original.id)).toEqual(oldProgress);
 await page.screenshot({path:testInfo.outputPath('new-edition-before-explicit-creation.png'),fullPage:true});
 await page.getByRole('button',{name:'Create game with AI',exact:true}).click();await expect(page.getByRole('button',{name:'Play game',exact:true})).toBeVisible();
 const saved=(await records(page)).find(item=>item.id===edition.id)!;expect(saved.creation?.status).toBe('ready');expect(saved.aiLearningPlan?.missions).toHaveLength(2);expect(saved.gameDesign?.receipts).toHaveLength(5);expect(saved.gameDesign?.receipts?.map(receipt=>receipt.stage)).toEqual(['plan','write','write','check','overview']);expect(requests.slice(4).map(request=>request.prompt.match(/STAGE: (\w+)/)?.[1])).toEqual(['plan','write','write','check','overview']);
 const plans=requests.filter(request=>request.prompt.includes('STAGE: plan'));expect(plans).toHaveLength(2);const newPlan=JSON.parse(plans[1].prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(new Set(newPlan.units.map((unit:any)=>unit.sourceId))).toEqual(new Set(saved.sources.map(source=>source.id)));expect(newPlan.units.some((unit:any)=>unit.excerpt.includes('only when the panel reports ready'))).toBe(true);
 expect(saved.sources[0].originalFile).toEqual(original.sources[0].originalFile);expect((await records(page)).find(item=>item.id===original.id)).toEqual(original);expect(await progressFor(page,original.id)).toEqual(oldProgress);expect(await progressFor(page,edition.id)).toBeUndefined();
 await page.reload();await page.getByRole('button',{name:'Open Maintenance adventure',exact:true}).click();await expect(page.getByRole('button',{name:/^(Play game|Continue game)$/})).toBeEnabled();expect((await records(page)).find(item=>item.id===original.id)).toEqual(original);expect(await progressFor(page,original.id)).toEqual(oldProgress);expect(requests).toHaveLength(9);
});
