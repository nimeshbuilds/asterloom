import {expect} from '@playwright/test';

/** Follow the visible teaching flow; never mark a lesson complete behind the UI. */
export async function learnBeforeQuest(page) {
 const briefing=page.getByRole('region',{name:'Learning briefing',exact:true});
 if(!await briefing.count())return;
 const explore=briefing.getByRole('button',{name:'Explore the source',exact:true});
 if(await explore.count()){await explore.click();await expect(briefing.locator('.lesson-context')).toBeVisible();}
 const context=briefing.locator('.lesson-context');
 if(await context.count()){
  const unread=context.getByRole('button',{name:/^Mark passage \d+ explored$/});
  while(await unread.count()){const name=await unread.first().innerText();await unread.first().click();await expect(context.getByRole('button',{name,exact:true})).toHaveCount(0);}
  await context.getByRole('button',{name:'Study the walkthrough',exact:true}).click();await expect(briefing.locator('.lesson-walkthrough')).toBeVisible();
 }
 const quotedSteps=[];
 while(await briefing.locator('.lesson-walkthrough').count()){
  quotedSteps.push((await briefing.locator('.lesson-worked-step blockquote').first().innerText()).trim());
  const next=briefing.getByRole('button',{name:'Next walkthrough step',exact:true});
  if(await next.count()){const label=await briefing.locator('.lesson-section-label').textContent();await next.click();await expect(briefing.locator('.lesson-section-label')).not.toHaveText(label);}
  else {await briefing.getByRole('button',{name:'Build my field note',exact:true}).click();await expect(briefing.locator('.lesson-practice')).toBeVisible();break;}
 }
 if(await briefing.locator('.lesson-practice').count()){
  await briefing.locator('.lesson-focus-options input').first().check();
  // Explicit procedures use the source's displayed order, not a hidden answer key.
  const rows=briefing.locator('.lesson-order li');
  if(await rows.count())for(let target=0;target<quotedSteps.length;target++){
   const texts=await rows.locator(':scope > span').allTextContents();
   let position=texts.findIndex(text=>text.trim()===quotedSteps[target]);
   while(position>target){await rows.nth(position).getByRole('button',{name:/Move practice step \d+ up/}).click();position--;}
  }
  await briefing.getByRole('textbox',{name:'Explain it in your own words',exact:true}).fill('I will keep the source conditions attached to the idea and separate observations from my own explanation.');
  await briefing.getByRole('textbox',{name:'Connect it or name a question',exact:true}).fill('What other evidence would I need before applying this idea in a different situation?');
  await briefing.getByLabel('I compared my note with the source',{exact:true}).check();
  await briefing.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();
 }
 const start=briefing.getByRole('button',{name:'Start quest',exact:true});
 if(await start.count())await start.click();
 await expect(briefing).toHaveCount(0);
}

