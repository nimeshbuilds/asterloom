import {expect} from '@playwright/test';

/** Use the visible disclosure only when a test exercises the detailed board. */
export async function openDetailedWorkspace(page) {
 const details=page.locator('.arena-detailed-workspace');
 if(await details.count()&&await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
}

/** Follow the visible teaching flow; never mark a lesson complete behind the UI. */
export async function learnBeforeQuest(page) {
 const briefing=page.getByRole('region',{name:'Learning briefing',exact:true});
 if(!await briefing.count())return;
 const buildKit=briefing.getByRole('button',{name:'Build my mission kit',exact:true});
 if(await buildKit.count()){await buildKit.click();await expect(briefing.locator('.lesson-workbench')).toBeVisible();}
 const kit=briefing.locator('.lesson-workbench');
 const completeVisibleKit=async()=>{
  // Read the displayed source line for each move, just as a learner can. No hidden answer data.
  const kind=await kit.getAttribute('data-kit'),slots=kit.locator('.lesson-kit-slot');
  for(let i=0;i<await slots.count();i++){
   const slot=slots.nth(i),quote=slot.locator('blockquote');
   if(!await quote.count())await slot.getByRole('button',{name:'Inspect source line',exact:true}).click();
   const sourceLine=(await quote.innerText()).trim();
   const buttons=kit.locator('.lesson-kit-piece');
   const choices=[];for(let j=0;j<await buttons.count();j++)choices.push({index:j,label:(await buttons.nth(j).locator('span').first().innerText()).trim()});
   const cleanLine=sourceLine.replace(/^[-*•]\s+/, '').replace(/\*\*/g,'');
   const found=choices.sort((a,b)=>b.label.length-a.label.length).find(({label})=>kind==='route-kit'?cleanLine===label:cleanLine.startsWith(label)&&/^(?:[:：]|\s+(?:is|are|means|refers to)\b)/i.test(cleanLine.slice(label.length)))?.index??-1;
   if(found<0)throw Error('The visible source line did not identify an available kit piece: '+sourceLine);
   await buttons.nth(found).click();await slot.getByRole('button',{name:`Place selected piece in slot ${i+1}`,exact:true}).click();
  }
  await kit.getByRole('button',{name:'Check my kit against the source',exact:true}).click();
  await expect(kit.getByText('Your kit is ready to carry into the quest.',{exact:false})).toBeVisible();
  await briefing.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();
  await expect(briefing).toHaveCount(0);return;
 };
 if(await kit.count()){await completeVisibleKit();return;}
 const explore=briefing.getByRole('button',{name:/^(?:Explore the source|Learn the ideas)$/,exact:true});
 if(await explore.count()){await explore.click();await expect(briefing.locator('.lesson-context')).toBeVisible();}
 const context=briefing.locator('.lesson-context');
 if(await context.count()){
  const teaching=context.locator('.lesson-teaching');
  if(await teaching.count()){
   const walkthrough=context.getByRole('button',{name:/^(?:Study the walkthrough|Try it in practice|Start guided quest)$/,exact:true});
   for(let step=0;step<12&&!await walkthrough.isEnabled();step++){
    const exploreIdea=teaching.getByRole('button',{name:/^Explore idea \d+$/});
    if(await exploreIdea.count()){const name=await exploreIdea.innerText();await exploreIdea.click();await expect(teaching.getByRole('button',{name,exact:true})).toHaveCount(0);}
    else await teaching.getByRole('button',{name:'Next idea',exact:true}).click();
   }
   await expect(walkthrough).toBeEnabled();
  }
  const unread=context.getByRole('button',{name:/^Mark passage \d+ explored$/});
  while(await unread.count()){const name=await unread.first().innerText();await unread.first().click();await expect(context.getByRole('button',{name,exact:true})).toHaveCount(0);}
  const start=context.getByRole('button',{name:'Start guided quest',exact:true});
  if(await start.count()){await start.click();await expect(briefing).toHaveCount(0);return;}
  await context.getByRole('button',{name:/^(?:Study the walkthrough|Try it in practice)$/,exact:true}).click();await expect(briefing.locator('.lesson-walkthrough,.lesson-practice')).toBeVisible();
 }
 const quotedSteps=[];
 while(await briefing.locator('.lesson-walkthrough').count()){
  const sourceDetail=briefing.locator('.lesson-worked-step .lesson-teaching-evidence');if(await sourceDetail.count()&&await sourceDetail.getAttribute('open')===null)await sourceDetail.locator('summary').click();
  quotedSteps.push((await briefing.locator('.lesson-worked-step blockquote').first().innerText()).trim());
  const next=briefing.getByRole('button',{name:'Next walkthrough step',exact:true});
  if(await next.count()){const label=await briefing.locator('.lesson-section-label').textContent();await next.click();await expect(briefing.locator('.lesson-section-label')).not.toHaveText(label);}
  else {const start=briefing.getByRole('button',{name:'Start guided quest',exact:true});if(await start.count()){await start.click();await expect(briefing).toHaveCount(0);return;}await briefing.getByRole('button',{name:/^(?:Build my field note|Build my mission kit)$/,exact:true}).click();await expect(briefing.locator('.lesson-practice')).toBeVisible();break;}
 }
 if(await kit.count()){await completeVisibleKit();return;}
 const guidedStart=briefing.getByRole('button',{name:'Start guided quest',exact:true});
 if(await guidedStart.count()){await guidedStart.click();await expect(briefing).toHaveCount(0);return;}
 if(await briefing.locator('.lesson-practice').count()){
  await briefing.locator('.lesson-focus-options input').first().check();
  // Explicit procedures use the source's displayed order, not a hidden answer key.
  const rows=briefing.locator('.lesson-order li');
  if(await rows.count())for(let target=0;target<quotedSteps.length;target++){
   const texts=await rows.locator(':scope > span').allTextContents();
   let position=texts.findIndex(text=>text.trim()===quotedSteps[target]);
   while(position>target){await rows.nth(position).getByRole('button',{name:/Move practice step \d+ up/}).click();position--;}
  }
  const spoken=briefing.getByRole('checkbox',{name:'Talk or point with a grown-up instead of typing',exact:true});
  if(await spoken.count()&&await spoken.isChecked())await briefing.getByRole('checkbox',{name:'We talked or pointed through the idea and its source together',exact:true}).check();
  else{
   await briefing.getByRole('textbox',{name:'Explain it in your own words',exact:true}).fill('I will keep the source conditions attached to the idea and separate observations from my own explanation.');
   await briefing.getByRole('textbox',{name:'Connect it or name a question',exact:true}).fill('What other evidence would I need before applying this idea in a different situation?');
  }
  await briefing.getByLabel('I compared my note with the source',{exact:true}).check();
  await briefing.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();
 }
 const start=briefing.getByRole('button',{name:'Start quest',exact:true});
 if(await start.count())await start.click();
 await expect(briefing).toHaveCount(0);
}
