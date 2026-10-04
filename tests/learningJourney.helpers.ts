import {expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {parsePackage} from '../src/lib/package';
import {buildLearningBriefing,initialLessonState,completeLesson,lessonReady,lessonQuestSupport} from '../src/lib/learningBriefing';
import {SCAFFOLDS,scaffoldById} from '../src/data/scaffolds';
import {defaultWorldIdForKind} from '../src/data/worlds';
import {emptyProgress,selectDueCards} from '../src/lib/storage';
import type {Notebook,Progress} from '../src/types';

export {learnBeforeQuest} from './teachingDriver.mjs';

/** Exercise native's one-notebook bootstrap in the internal renderer test host.
 * This is a test harness, not a browser-file product or distribution format. */
export async function openBundledNotebook(page:Page,packagePath:string) {
 const notebook=parsePackage(await readFile(packagePath,'utf8'));
 await page.addInitScript(value=>{(window as any).__ASTERLOOM_NOTEBOOK__=value;},notebook);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:notebook.title,exact:true}).first()).toBeVisible();
}

/** Explicit older fixture for tests whose subject is independent recall, rather
 * than first-day teaching. Every prerequisite is validated by the real engine. */
async function seedAgedLessons(page:Page,title:string,structured:boolean) {
 const records=await page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result;const read=db.transaction('records','readonly').objectStore('records').getAll();read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}));
 const notebook=records.find(value=>value?.title===title&&Array.isArray(value.cards)) as Notebook;
 if(!notebook)throw Error(`Missing notebook fixture: ${title}`);
 const progress=(records.find(value=>value?.notebookId===notebook.id)??emptyProgress(notebook.id)) as Progress;
 const cardIds=selectDueCards(notebook.cards,progress,Math.min(8,notebook.cards.length)).map(card=>card.id);
 progress.lessons={...progress.lessons};
 const plans=structured?(notebook.activities??[]).map(activity=>({activity,plan:buildLearningBriefing({notebook,activity,scaffold:scaffoldById(activity.scaffoldIds?.[0]??defaultWorldIdForKind(activity.kind))??scaffoldById('recall-escape-mission')!})})):SCAFFOLDS.filter(value=>notebook.scaffoldIds.includes(value.id)).map(scaffold=>({activity:undefined,plan:buildLearningBriefing({notebook,scaffold,cardIds})}));
 for(const {plan,activity} of plans){
  const fresh=initialLessonState(plan);
  const ready=completeLesson(plan,{...fresh,missionAccepted:true,stage:'practice',viewedPassageIds:plan.passages.map(p=>p.id),walkthroughStep:plan.walkthrough.steps.length,practice:{...fresh.practice,focusId:plan.practice.focusOptions[0].id,explanation:'This earlier lesson connected the exact source idea with its stated conditions.',connection:'I will return after a delay to retrieve the idea without support.',compared:true,order:plan.practice.orderIds}},Date.now()-48*3600000);
  expect(lessonReady(plan,ready)).toBe(true);expect(lessonQuestSupport(plan,ready).assisted).toBe(false);
  if(activity)progress.structured={...progress.structured,[activity.id]:{response:{_draft:{lesson:ready}},completed:false,score:0,maxScore:0,attempts:0,updatedAt:new Date().toISOString()}};
  else progress.lessons[plan.id]=ready;
 }
 await page.evaluate(value=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,'progress:'+value.notebookId);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}),progress);
 await page.reload();await expect(page.getByRole('heading',{name:'What will you discover today?'})).toBeVisible();
}
export const seedAgedRecallLessons=(page:Page,title:string)=>seedAgedLessons(page,title,false);
export const seedAgedStructuredLessons=(page:Page,title:string)=>seedAgedLessons(page,title,true);
