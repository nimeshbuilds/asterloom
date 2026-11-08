import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createNotebook} from '../src/lib/utils';
import type {LearningCard,Notebook,Source} from '../src/types';
import {learnBeforeQuest} from './teachingDriver.mjs';
import {campaignTeachingFixture,coverMetadata} from './campaignTeaching.fixture';
const at='2026-10-04T12:00:00.000Z';
const source:Source={id:'field-source',title:'Field notes',kind:'text',status:'ready',addedAt:at,text:'# First observations\nThe observer watched the river after several hours of rain. She recorded the water level and left the cause of the change unresolved.\n\n# A further question\nA second observer suggested comparing another day with the same measurements. The notes do not report the result of that comparison.'};
const notebook=()=>createNotebook({id:'field-guide-e2e',title:'An evidence expedition',sources:[source],cards:[],activities:[],ageGroup:'adult',scaffoldIds:['recall-escape-mission']});
async function open(page:Page,n:Notebook){await page.addInitScript(value=>{(window as any).__ASTERLOOM_NOTEBOOK__=value;},n);await page.goto('/');await expect(page.getByRole('heading',{name:n.title,exact:true})).toBeVisible();}
async function progress(page:Page,id:string){return page.evaluate(id=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('asterloom-local-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records','readonly').objectStore('records').get('progress:'+id);q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}),id);}

test('an existing generated game presents its teaching and excludes the reported cover-page passage',async({page},info)=>{
 const n=campaignTeachingFixture();await open(page,n);
 await expect(page.locator('.campaign-summary')).toContainText('1 prepared lesson');
 await expect(page.locator('.campaign-chapter')).toHaveCount(1);
 await expect(page.locator('.campaign-chapters')).toContainText(n.aiLearningPlan!.missions[0].conceptExplanation.text);
 await page.getByRole('button',{name:'Source library',exact:true}).click();
 await expect(page.locator('.campaign-library-note')).toContainText('not additional required lessons');
 await page.getByRole('button',{name:'Lessons & quests 1',exact:true}).click();
 await expect(page.getByRole('region',{name:'Your adventure',exact:true})).toContainText('Understand tasks before choosing a tool');
 await expect(page.locator('.campaign-chapters')).not.toContainText(coverMetadata);
 await page.getByRole('button',{name:'Play game',exact:true}).click();
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Learn the ideas',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Start with the task',exact:true})).toBeVisible();
 await expect(page.locator('.lesson-teaching-card')).toContainText('Read the supplied task before comparing');
 await expect(page.locator('.lesson-teaching-card')).not.toContainText(coverMetadata);
 await page.screenshot({path:info.outputPath('source-teaching-entry.png'),fullPage:true});
});

test('ordinary prose becomes a complete source expedition with a durable, ungraded field guide',async({page})=>{
 const n=notebook();await open(page,n);await expect(page.locator('.campaign-chapter')).toHaveCount(2);await expect(page.locator('.campaign-chapters').getByRole('heading',{name:'First observations',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'A further question',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^(?:Play game|Continue game)$/,exact:false}).click();await expect(page.getByRole('heading',{name:'Original passages'})).toBeVisible();
 await page.getByRole('button',{name:'Pin passage 1',exact:true}).click();await page.getByLabel('Explain what this passage helps you understand').fill('The observation describes a change, but it does not establish its cause.');await page.getByLabel('What would you investigate next? (optional)').fill('Would a comparison day show the same change?');await page.getByRole('button',{name:'Save this discovery',exact:true}).click();await expect(page.getByRole('heading',{name:'A discovery worth keeping.'})).toBeVisible();
 let p=await progress(page,n.id);expect(p.xp).toBe(0);expect(p.practice.xp).toBe(5);await expect(page.locator('[data-hud=total-xp]')).toContainText('5 XP');await expect(page.locator('.source-study .reaction-effects')).toHaveAttribute('data-outcome','complete');expect(p.completedCardIds).toEqual([]);expect(Object.values(p.studies)).toHaveLength(1);expect(Object.values(p.studies)[0]).toMatchObject({completed:true,note:'The observation describes a change, but it does not establish its cause.'});
 await page.reload();await page.getByRole('button',{name:'Open your field note',exact:true}).click();await expect(page.getByLabel('What would you investigate next? (optional)')).toHaveValue('Would a comparison day show the same change?');await expect(page.getByRole('button',{name:'Pinned to your field guide',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.source-study .reaction-effects')).toHaveCount(0);expect((await progress(page,n.id)).practice.xp).toBe(5);
 await page.getByRole('button',{name:'Next chapter',exact:true}).click();await expect(page.getByRole('heading',{name:'A further question',exact:true})).toBeVisible();await expect(page.getByLabel('Explain what this passage helps you understand')).toHaveValue('');
});

test('field notes autosave without becoming mastery, and the chapter remains accessible on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});const n=notebook();await open(page,n);await page.getByRole('button',{name:'Explore this chapter',exact:true}).first().click();await page.getByRole('button',{name:'Pin passage 1',exact:true}).click();await page.getByLabel('Explain what this passage helps you understand').fill('Observation and explanation need to be distinguished.');
 await expect.poll(async()=>Object.values((await progress(page,n.id))?.studies??{}).map((x:any)=>x.note).join('')).toContain('Observation and explanation');await page.reload();await page.getByRole('button',{name:'Explore this chapter',exact:true}).first().click();await expect(page.getByLabel('Explain what this passage helps you understand')).toHaveValue('Observation and explanation need to be distinguished.');
 expect((await progress(page,n.id)).xp).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
});

test('a chapter keeps its recall topics together and lets a learner repair a mistake without duplicate mastery',async({page})=>{
 const s:Source={...source,text:'# Names\nDNS: Resolves domain names to their network addresses.\nCache: Stores a reusable copy of an earlier result.\n\n# Connections\nRouter: Forwards packets between separate networks.\nSwitch: Forwards frames within the local network.'};
 const definitions=[['dns','DNS','DNS: Resolves domain names to their network addresses.'],['cache','Cache','Cache: Stores a reusable copy of an earlier result.'],['router','Router','Router: Forwards packets between separate networks.'],['switch','Switch','Switch: Forwards frames within the local network.']];
 const cards:LearningCard[]=definitions.map(([id,answer,evidence],i)=>({id,answer,evidence,prompt:'Recover the concept described by the source.\n\n'+evidence.split(': ')[1],explanation:evidence,options:i<2?['DNS','Cache']:['Router','Switch'],correctIndex:i%2,sourceId:s.id,concept:answer,tags:[],reviewStatus:'reviewed',questionType:'definition'}));
 const n=createNotebook({id:'chapter-recall-e2e',title:'Names and connections',sources:[s],cards,activities:[],ageGroup:'adult',scaffoldIds:['recall-escape-mission']});await open(page,n);
 await page.locator('.campaign-chapter').filter({has:page.getByRole('heading',{name:'Names',exact:true})}).getByRole('button',{name:'Retrieve the key ideas',exact:false}).click();await learnBeforeQuest(page);await expect(page.locator('.answer-option')).toHaveCount(2);await expect(page.locator('.player-sidebar h2')).toHaveText('Names');
 await page.locator('.answer-option').filter({hasText:'Cache'}).click();await page.getByRole('button',{name:'Check my answer',exact:true}).click();await expect(page.locator('.answer-feedback.retry')).toBeVisible();await page.getByRole('button',{name:'Try again with the source',exact:true}).click();await expect(page.locator('.hint-box')).toContainText('DNS: Resolves');
 await page.locator('.answer-option').filter({hasText:'DNS'}).click();await page.getByRole('button',{name:'Check my answer',exact:true}).click();await expect(page.locator('.answer-feedback.success')).toBeVisible();const p=await progress(page,n.id);expect(p.attempts).toHaveLength(2);expect(p.completedCardIds).toEqual([]);expect(p.xp).toBe(0);expect(p.activeSession.cardIds).toEqual(['dns','cache']);expect(p.activeSession.state.answeredCount).toBe(1);expect(p.activeSession.state.correctCount).toBe(1);
 const savedSession=structuredClone(p.activeSession);
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();await page.reload();
 await expect(page.getByRole('region',{name:'Your adventure',exact:true})).toContainText('Names');
 await page.getByRole('button',{name:'Continue game',exact:true}).click();
 await expect(page.locator('.player-sidebar h2')).toHaveText('Names');await expect(page.locator('.answer-feedback.success')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Original passages',exact:true})).toHaveCount(0);
 expect((await progress(page,n.id)).activeSession).toEqual(savedSession);
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();
 expect((await progress(page,n.id)).activeSession).toEqual(savedSession);
});


test('leaving a source chapter before its debounce saves the latest field note without granting completion',async({page})=>{
 const n=notebook();n.id='field-guide-navigation-e2e';await open(page,n);await page.getByRole('button',{name:'Explore this chapter',exact:true}).first().click();
 // Keep the scheduled autosave pending. Navigation must flush independently of
 // the debounce, including a backgrounded or temporarily busy renderer.
 await page.evaluate(()=>{const schedule=window.setTimeout.bind(window);window.setTimeout=((callback:TimerHandler,delay?:number,...args:any[])=>schedule(callback,delay===800?60_000:delay,...args)) as typeof window.setTimeout;});
 const note='The observed change is recorded, while its cause remains unresolved.';
 await page.getByLabel('Explain what this passage helps you understand').fill(note);
 await page.getByRole('button',{name:'Save & return',exact:true}).click();
 await expect.poll(async()=>Object.values((await progress(page,n.id))?.studies??{}).map((x:any)=>x.note)).toContain(note);
 await page.reload();await expect(page.getByRole('heading',{name:n.title,exact:true})).toBeVisible();await page.getByRole('button',{name:'Explore this chapter',exact:true}).first().click();
 await expect(page.getByLabel('Explain what this passage helps you understand')).toHaveValue(note);
 const p=await progress(page,n.id);expect(p.xp).toBe(0);expect(p.completedCardIds).toEqual([]);expect(Object.values(p.studies).every((x:any)=>!x.completed)).toBe(true);
});
