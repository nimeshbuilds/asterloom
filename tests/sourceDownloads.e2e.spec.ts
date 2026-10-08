import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {campaignTeachingFixture} from './campaignTeaching.fixture';
import type {Notebook,Source} from '../src/types';
import {learnBeforeQuest} from './teachingDriver.mjs';

const original=Buffer.from('%PDF-1.4\r\n% preserved fixture bytes\r\n%%EOF\r\n');
const snapshot=Buffer.from('Original captured page wording.\n');
const readable='Corrected source wording — the learner can keep this exact text.\nSecond line.';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const addedAt='2026-10-08T12:00:00.000Z';
function attachment(name:string,mime:string,bytes:Buffer){return {name,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),dataUrl:`data:${mime};base64,${bytes.toString('base64')}`};}
function fixture():Notebook{
 const n=campaignTeachingFixture();
 const sources:Source[]=[
  {id:'download-pdf',title:'Field manual.pdf',kind:'document',text:'The field manual describes the inspection procedure.',originalFile:attachment('Field manual.pdf','application/pdf',original),status:'ready',addedAt},
  {id:'download-notes',title:'My pasted notes',kind:'text',text:readable,status:'ready',addedAt},
  {id:'download-page',title:'Captured article',kind:'website',url:'https://example.com/article',text:'Edited page text for learning.',originalFile:attachment('article.txt','text/plain',snapshot),webImport:{requestedUrl:'https://example.com/article',retrievedAt:addedAt,extractor:'readability',contentStatus:'partial',warnings:[]},status:'ready',addedAt},
  {id:'download-link',title:'Linked NotebookLM',kind:'notebooklm',url:'https://notebooklm.google.com/notebook/example',text:'',status:'needs-transcript',addedAt},
  {id:'download-image',title:'Source diagram.png',kind:'image',text:'',dataUrl:`data:image/png;base64,${png.toString('base64')}`,mime:'image/png',status:'needs-transcript',addedAt},
 ];return {...n,sources:[...n.sources,...sources]};
}
async function open(page:Page,n=fixture()){
 await page.addInitScript(notebook=>{(window as any).__ASTERLOOM_NOTEBOOK__=notebook;localStorage.setItem('asterloom:guide-preferences:v1',JSON.stringify({mode:'quiet',dismissed:[]}));},n);
 await page.goto('/');await expect(page.getByRole('heading',{name:n.title,exact:true})).toBeVisible();
}
async function download(page:Page,row:Locator,name:RegExp){const event=page.waitForEvent('download');await row.getByRole('button',{name}).click();const file=await event;return {name:file.suggestedFilename(),bytes:await readFile((await file.path())!)};}

test('bundled and saved games expose exact originals, edited readable text and images offline; link-only sources do not invent files',async({page,context})=>{
 await open(page);await context.setOffline(true);
 await page.getByRole('button',{name:'Source materials',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Source materials',exact:true});
 const pdf=await download(page,dialog.getByRole('article',{name:'Field manual.pdf',exact:true}),/original/i);expect(pdf.name).toBe('Field manual.pdf');expect(pdf.bytes).toEqual(original);
 const notes=await download(page,dialog.getByRole('article',{name:'My pasted notes',exact:true}),/readable text/i);expect(notes.name).toMatch(/\.txt$/);expect(notes.bytes.toString()).toBe(readable);
 const web=dialog.getByRole('article',{name:'Captured article',exact:true});await expect(web).toContainText('Partial page');
 expect((await download(page,web,/original/i)).bytes).toEqual(snapshot);
 expect((await download(page,web,/readable text/i)).bytes.toString()).toBe('Edited page text for learning.');
 const image=await download(page,dialog.getByRole('article',{name:'Source diagram.png',exact:true}),/original/i);expect(image.bytes).toEqual(png);
 const link=dialog.getByRole('article',{name:'Linked NotebookLM',exact:true});await expect(link.getByRole('button')).toHaveCount(0);await expect(link).toContainText('no saved file or readable text');
 await expect(link.getByRole('link',{name:'Visit original link',exact:true})).toHaveAttribute('href','https://notebooklm.google.com/notebook/example');
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:'Your games',exact:true}).last().click();
 await page.getByRole('button',{name:new RegExp(fixture().title)}).first().click();
 await page.getByRole('button',{name:'Source materials',exact:true}).click();
 expect((await download(page,dialog.getByRole('article',{name:'Field manual.pdf',exact:true}),/original/i)).bytes).toEqual(original);
});

test('source downloads remain available in the lesson and quest and mark assistance before saving a copy',async({page})=>{
 const n=fixture();await open(page,n);
 await page.locator('.campaign-invitation').getByRole('button',{name:'Learn & play this mission',exact:true}).click();
 await page.getByRole('button',{name:'Source materials',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Source materials',exact:true});
 expect((await download(page,dialog.getByRole('article',{name:'Field manual.pdf',exact:true}),/original/i)).bytes).toEqual(original);
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await learnBeforeQuest(page);
 await page.getByRole('button',{name:'Source materials',exact:true}).click();
 await expect(dialog).toContainText('source-supported practice');
 expect((await download(page,dialog.getByRole('article',{name:'My pasted notes',exact:true}),/readable text/i)).bytes.toString()).toBe(readable);
 const stored=await page.evaluate(id=>new Promise<any>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('records').objectStore('records').get('progress:'+id);read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}),n.id);
 expect(stored.structured[n.activities![0].id].response._draft.hintUsed).toBe(true);expect(stored.xp).toBe(0);expect(stored.mastery).toBe(0);
});

test('source materials explain native cancellation and failure, allow retry, and stay accessible at narrow widths',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{(window as any).downloadResult='canceled';(window as any).sourceSaveRequests=[];(window as any).asterloomDesktop={availableExports:[],saveSourceMaterial:async(request:any)=>{(window as any).sourceSaveRequests.push(request);return (window as any).downloadResult==='error'?{error:'The destination could not be written.'}:{status:(window as any).downloadResult,filename:request.filename};}};});
 await open(page);await page.getByRole('button',{name:'Source materials',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Source materials',exact:true});
 const button=dialog.getByRole('article',{name:'Field manual.pdf',exact:true}).getByRole('button',{name:/original/i});
 await button.click();await expect(dialog.getByRole('status')).toHaveText('Save canceled. Your material is still here.');
 await page.evaluate(()=>(window as any).downloadResult='error');await button.click();await expect(dialog.getByRole('alert')).toHaveText('The destination could not be written.');
 await page.evaluate(()=>(window as any).downloadResult='saved');await button.click();await expect(dialog.getByRole('status')).toHaveText('Saved Field manual.pdf.');await expect(dialog.getByRole('alert')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 expect((await new AxeBuilder({page}).include('.dialog').analyze()).violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 await page.screenshot({path:info.outputPath('source-materials-mobile.png'),animations:'disabled'});
 const requests=await page.evaluate(()=>(window as any).sourceSaveRequests);expect(requests).toHaveLength(3);expect(requests[0].sha256).toBe(createHash('sha256').update(original).digest('hex'));
});


test('reading sources after an independent result preserves its credit and supports only the revised attempt',async({page})=>{
 const n=fixture(),activityId=n.activities![0].id;
 n.activities=n.activities!.map(activity=>({...activity,reviewStatus:'reviewed'}));
 if(n.aiLearningPlan)n.aiLearningPlan={...n.aiLearningPlan,missions:n.aiLearningPlan.missions.map(mission=>({...mission,reviewStatus:'reviewed'}))};
 await page.clock.setFixedTime(new Date('2026-10-08T12:00:00.000Z'));
 await open(page,n);
 await page.locator('.campaign-invitation').getByRole('button',{name:'Learn & play this mission',exact:true}).click();
 await learnBeforeQuest(page);
 // A real completed lesson becomes independent retrieval on a later day.
 await page.clock.setFixedTime(new Date('2026-10-10T12:00:00.000Z'));
 const readProgress=()=>page.evaluate(id=>new Promise<any>((resolve,reject)=>{const request=indexedDB.open('asterloom-local-v1',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('records').objectStore('records').get('progress:'+id);read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}),n.id);
 const labels=['Read the task description.','Compare the stated tool limits.','Record the decision and its conditions.'];
 for(let target=0;target<labels.length;target++){let position=(await page.locator('.route-step strong').allTextContents()).indexOf(labels[target]);while(position>target){await page.getByRole('button',{name:`Move ${labels[target]} up`,exact:true}).click();position--;}}
 await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Your work holds together.');
 const hud=page.getByRole('region',{name:'Game progress',exact:true});
 await expect(hud).toHaveAttribute('data-mode','independent');
 await expect(hud.locator('[data-hud=score]')).toContainText('Mission score');
 const earned=await readProgress();expect(earned.xp).toBe(50);expect(earned.structured[activityId].response._draft.hintUsed).toBe(false);
 expect(earned.structured[activityId].review.independentSuccesses).toBe(1);
 await page.getByRole('button',{name:'Source materials',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Source materials',exact:true});
 expect((await download(page,dialog.getByRole('article',{name:'Field manual.pdf',exact:true}),/original/i)).bytes).toEqual(original);
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(hud).toHaveAttribute('data-mode','independent');
 await expect(hud.locator('[data-hud=score]')).toContainText('Mission score');
 const afterDownload=await readProgress();expect(afterDownload.structured[activityId].response._draft).toMatchObject({checked:true,hintUsed:false,postResultAssistance:true});
 expect(afterDownload.xp).toBe(earned.xp);expect(afterDownload.mastery).toBe(earned.mastery);expect(afterDownload.independentActivityAwards).toEqual(earned.independentActivityAwards);expect(afterDownload.structured[activityId].review).toEqual(earned.structured[activityId].review);
 await page.reload();await page.locator('.campaign-chapters').getByRole('button',{name:'Learn & play this mission',exact:true}).click();
 await expect(hud).toHaveAttribute('data-mode','independent');await expect(hud.locator('[data-hud=score]')).toContainText('Mission score');
 await expect(page.locator('.structured-feedback .reaction-effects')).toHaveAttribute('data-motion','still');
 await page.getByRole('button',{name:'Move Read the task description. down',exact:true}).click();
 await expect(hud).toHaveAttribute('data-mode','practice');
 await expect.poll(async()=> (await readProgress()).structured[activityId].response._draft.hintUsed).toBe(true);
 await page.getByRole('button',{name:'Move Read the task description. up',exact:true}).click();
 await page.getByRole('button',{name:'Check my work',exact:true}).click();
 await expect(page.locator('.structured-feedback')).toContainText('Your work holds together.');
 await expect(hud.locator('[data-hud=score]')).toContainText('Practice score');
 const revised=await readProgress();expect(revised.xp).toBe(earned.xp);expect(revised.mastery).toBe(earned.mastery);expect(revised.independentActivityAwards).toEqual(earned.independentActivityAwards);expect(revised.structured[activityId].review.independentSuccesses).toBe(1);expect(revised.structured[activityId].response._draft).toMatchObject({checked:true,hintUsed:true});
});
