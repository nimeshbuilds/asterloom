import {customizeLearning} from './learningJourney.helpers';
import {test,expect,type Page,type Locator} from '@playwright/test';
import type {Notebook} from '../src/types';
import {AGE_GROUPS} from '../src/data/scaffolds';
import {createNotebook,createSource} from '../src/lib/utils';
import {ACTIVITY_EXAMPLES} from '../src/lib/structuredEngine';

const glossary='# Plant glossary\n1. Seed: Contains an embryo from which a new plant can grow.\n2. Leaf: Supports photosynthesis in the plant.\n3. Root: Absorbs water and minerals from the soil.';
const procedure='# Safe reset procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.';
const unsupported=['incident-response-command','cloud-architecture-builder','pretend-play-stations'];
async function saved(page:Page,title:string):Promise<Notebook|undefined>{
 return page.evaluate(title=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('asterloom-local-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('records','readonly').objectStore('records').getAll();q.onsuccess=()=>{db.close();resolve(q.result.find(value=>value?.title===title&&Array.isArray(value.sources)));};q.onerror=()=>{db.close();reject(q.error);};};}),title);
}
async function create(page:Page,title:string){await page.goto('/');await expect(page.getByRole('heading',{name:'What will you discover today?',exact:true})).toBeVisible();await page.getByRole('button',{name:'Create a game',exact:true}).last().click();await page.getByLabel('Notebook title',{exact:true}).fill(title);await expect.poll(async()=>(await saved(page,title))?.scaffoldIds).toEqual([]);}
async function paste(page:Page,title:string,text:string){const materials=page.getByRole('tab',{name:/Materials/});if(await materials.isVisible())await materials.click();await page.getByRole('button',{name:'Paste notes',exact:true}).click();await page.getByLabel('Source title',{exact:true}).fill(title);await page.getByLabel('Your material',{exact:true}).fill(text);await page.getByRole('button',{name:'Add material',exact:false}).click();}
async function changeAge(page:Page,title:string,id:string){await customizeLearning(page);await page.getByRole('tab',{name:/Game design/}).click();const label=AGE_GROUPS.find(a=>a.id===id)!.label;await page.locator('.age-options').getByRole('button').filter({has:page.getByText(label,{exact:true})}).click();await expect.poll(async()=>(await saved(page,title))?.ageGroup).toBe(id);}
function notProcedure(n:Notebook){expect(n.activities?.some(a=>a.kind==='sequence')??false).toBe(false);for(const id of ['process-reconstruction','step-train',...unsupported])expect(n.scaffoldIds).not.toContain(id);}

for(const method of ['paste','upload'] as const)test(`numbered facts stay facts through ${method}, rebuilding and age changes`,async({page})=>{
 const title=`Cybersecurity cloud reset procedure · ${method} glossary`;await create(page,title);
 if(method==='paste')await paste(page,'Plant glossary',glossary);else await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'plant-glossary.txt',mimeType:'text/plain',buffer:Buffer.from(glossary)});
 await expect.poll(async()=>(await saved(page,title))?.sources.length).toBe(1);let n=(await saved(page,title))!;expect(n.sources[0].text).toBe(glossary);expect(n.cards.length+(n.activities?.length??0)).toBeGreaterThan(0);notProcedure(n);
 await customizeLearning(page);await page.getByRole('tab',{name:/Challenges/}).click();await page.getByRole('button',{name:'Rebuild from sources',exact:true}).click();await expect(page.locator('.save-state')).toHaveText('Saved on this device');n=(await saved(page,title))!;notProcedure(n);
 await changeAge(page,title,'6-8');notProcedure((await saved(page,title))!);await changeAge(page,title,'adult');notProcedure((await saved(page,title))!);
 await expect(page.locator('.scaffold-checks')).toHaveCount(0);expect((await saved(page,title))!.scaffoldIds).not.toContain('process-reconstruction');
 await page.reload();await expect(page.getByRole('button',{name:`Open ${title}`,exact:true})).toBeVisible();notProcedure((await saved(page,title))!);
});

async function openManual(page:Page):Promise<Locator>{await customizeLearning(page);await page.getByRole('tab',{name:/Challenges/}).click();await page.getByRole('button',{name:'Write a challenge',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Write a challenge',exact:true})});await dialog.getByLabel('Question or situation',{exact:true}).fill('Which part contains the embryo?');await dialog.getByLabel('Correct answer',{exact:true}).fill('Seed');await dialog.getByLabel('Other choices · one per line',{exact:true}).fill('Leaf\nRoot');return dialog;}
async function rejected(page:Page,dialog:Locator,title:string){const before=(await saved(page,title))!.cards;await dialog.getByRole('button',{name:'Save challenge',exact:true}).click();await expect(page.locator('.error-message')).toContainText('Choose a ready source and add the exact passage');expect((await saved(page,title))!.cards).toEqual(before);await page.getByRole('button',{name:'Got it',exact:true}).click();await expect(dialog).toBeVisible();}

test('manual challenges require a ready selected source and its exact supporting passage',async({page})=>{
 const title='Manual evidence gate';await create(page,title);let dialog=await openManual(page);await dialog.getByRole('textbox',{name:'Exact passage from the source',exact:true}).fill('Seed: Contains an embryo from which a new plant can grow.');await rejected(page,dialog,title);await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 // The original image is a real imported source, but unreadable bytes are not an answer key.
 await page.getByRole('tab',{name:/Materials/}).click();await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'unread-image.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V7cAAAAASUVORK5CYII=','base64')});await expect.poll(async()=>(await saved(page,title))?.sources[0]?.status).toBe('needs-transcript');
 dialog=await openManual(page);await expect(dialog.getByRole('combobox',{name:'Source',exact:true}).locator('option')).toHaveCount(1);await dialog.getByRole('textbox',{name:'Exact passage from the source',exact:true}).fill('Seed: Contains an embryo from which a new plant can grow.');await rejected(page,dialog,title);await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
 const evidence='Seed: Contains an embryo from which a new plant can grow.';await paste(page,'Reviewed planting notes',evidence);await expect.poll(async()=>(await saved(page,title))?.sources.length).toBe(2);const source=(await saved(page,title))!.sources.find(s=>s.title==='Reviewed planting notes')!;
 dialog=await openManual(page);await dialog.getByRole('combobox',{name:'Source',exact:true}).selectOption(source.id);await dialog.getByRole('textbox',{name:'Exact passage from the source',exact:true}).fill('A seed always grows successfully.');await rejected(page,dialog,title);await dialog.getByRole('textbox',{name:'Exact passage from the source',exact:true}).fill(evidence);await dialog.getByRole('button',{name:'Save challenge',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect.poll(async()=>(await saved(page,title))?.cards.filter(c=>c.prompt==='Which part contains the embryo?').length).toBe(1);const manual=(await saved(page,title))!.cards.find(c=>c.prompt==='Which part contains the embryo?')!;expect(manual).toMatchObject({sourceId:source.id,evidence,answer:'Seed',reviewStatus:'reviewed',questionType:'manual'});
 await page.reload();expect((await saved(page,title))!.cards.find(c=>c.id===manual.id)).toEqual(manual);
});

test('an explicit procedure creates only source-supported draft recipes, regardless of title and age',async({page})=>{
 const title='Cloud architecture and incident-response simulation';await create(page,title);await paste(page,'Safe reset instructions',procedure);await expect.poll(async()=>(await saved(page,title))?.activities?.filter(a=>a.kind==='sequence').length).toBe(1);let n=(await saved(page,title))!,sequence=n.activities!.find(a=>a.kind==='sequence')!;expect(sequence.reviewStatus).toBe('needs-review');if(sequence.kind==='sequence')expect(sequence.items.map(i=>i.label)).toEqual(['Open the settings panel.','Choose the reset command.','Confirm the selected reset.']);expect(n.scaffoldIds).toContain('process-reconstruction');for(const id of unsupported)expect(n.scaffoldIds).not.toContain(id);
 const pendingModels=structuredClone(n.activities);await changeAge(page,title,'3-5');n=(await saved(page,title))!;expect(n.activities).toEqual(pendingModels);for(const id of unsupported)expect(n.scaffoldIds).not.toContain(id);expect(n.scaffoldIds).not.toContain('process-reconstruction');
 await changeAge(page,title,'adult');n=(await saved(page,title))!;expect(n.activities).toEqual(pendingModels);expect(n.scaffoldIds).toContain('process-reconstruction');await expect(page.locator('.scaffold-checks')).toHaveCount(0);expect(n.activities!.find(a=>a.id===sequence.id)?.reviewStatus).toBe('needs-review');
 await customizeLearning(page);await page.getByRole('tab',{name:/Challenges/}).click();await page.getByRole('button',{name:'Rebuild from sources',exact:true}).click();await expect(page.locator('.save-state')).toHaveText('Saved on this device');expect((await saved(page,title))!.activities).toEqual(pendingModels);
});


test('replaced source evidence cannot launch stale missions or expose them in the learner sidebar',async({page})=>{
 const base=ACTIVITY_EXAMPLES.find(activity=>activity.kind==='sequence')!;
 const firstSource=createSource(base.sourceRefs[0].evidence,'Original survey instructions');
 const secondSource=createSource(base.sourceRefs[0].evidence,'Current survey instructions');
 const first={...structuredClone(base),id:'authored-original-survey',title:'Original survey mission',sourceRefs:[{sourceId:firstSource.id,evidence:firstSource.text}]};
 const second={...structuredClone(base),id:'authored-current-survey',title:'Current survey mission',sourceRefs:[{sourceId:secondSource.id,evidence:secondSource.text}]};
 const n=createNotebook({title:'Source revisions keep the learning honest',sources:[firstSource,secondSource],cards:[],activities:[first,second],scaffoldIds:['process-reconstruction']});
 await page.addInitScript(value=>{(window as any).__ASTERLOOM_NOTEBOOK__=value;},n);
 await page.goto('/');await expect(page.getByRole('heading',{name:n.title,exact:true})).toBeVisible();
 const replaceSource=async(sourceTitle:string,text:string)=>{
  await page.getByRole('tab',{name:/Materials/}).click();
  await page.locator('.source-main').filter({hasText:sourceTitle}).click();
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:sourceTitle,exact:true})});
  await dialog.getByRole('textbox',{name:'Readable source text',exact:true}).fill(text);
  await expect.poll(async()=>(await saved(page,n.title))?.sources.find(source=>source.title===sourceTitle)?.text).toBe(text);
  await dialog.getByRole('button',{name:'Done',exact:false}).click();
 };
 const revised='# Revised field notes\nThe survey recorded the river level after rainfall. The observations do not establish what caused the change, so a comparison remains an open question.';
 await page.getByRole('button',{name:'Edit materials',exact:true}).click();await customizeLearning(page);
 await replaceSource(firstSource.title,revised);
 await page.getByRole('button',{name:'Play game',exact:true}).click();
 await expect(page.locator('.structured-path button')).toHaveCount(1);
 await expect(page.locator('.structured-path button')).toContainText(second.title);
 await expect(page.locator('.structured-path')).not.toContainText(first.title);
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save & return',exact:true}).click();
 await expect(page.locator(`[data-activity-id="${first.id}"]`)).toHaveCount(0);
 await page.getByRole('button',{name:'Edit materials',exact:true}).click();await customizeLearning(page);
 await replaceSource(secondSource.title,'The second survey remains incomplete. Its notes contain no validated order of work, so the learner should study the available observations.');
 const retained=(await saved(page,n.title))!.activities!;
 expect(retained).toHaveLength(2);expect(retained.every(activity=>activity.reviewStatus==='needs-review')).toBe(true);
 expect(retained.find(activity=>activity.id===first.id)?.sourceRefs).toEqual(first.sourceRefs);
 await page.getByRole('button',{name:'Play game',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Investigate the source',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Chapter material',exact:true})).toContainText('The survey recorded the river level');
 await expect(page.locator('.structured-game')).toHaveCount(0);
 await page.getByRole('button',{name:'Save & return',exact:true}).click();
 await expect(page.locator('[data-activity-id]')).toHaveCount(0);
 await page.getByRole('button',{name:'Edit materials',exact:true}).click();await customizeLearning(page);
 await page.getByRole('tab',{name:/Challenges/}).click();
 await expect(page.locator('.activity-library article')).toHaveCount(2);
 await page.getByRole('button',{name:`Edit ${first.title}`,exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Activity JSON',exact:true});await expect(editor).toBeEditable();
 expect(JSON.parse(await editor.inputValue())).toMatchObject({id:first.id,sourceRefs:first.sourceRefs,reviewStatus:'needs-review'});
});
