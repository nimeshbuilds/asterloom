import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer,type Server} from 'node:http';
import AxeBuilder from '@axe-core/playwright';

let server:Server,folder:string,address:string;
// Actual production lesson, players, evaluators and reactions. Only the expensive
// decorative world renderer and audio output are replaced in this focused harness.
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'asterloom-learning-journey-'));
 await build({stdin:{contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';
 import Player from'./src/components/Player';import StructuredBoard from'./src/components/StructuredBoard';
 import{createNotebook}from'./src/lib/utils';import{emptyProgress}from'./src/lib/storage';
 import{SCAFFOLDS}from'./src/data/scaffolds';
 import{buildLearningBriefing,initialLessonState,completeLesson,lessonReady,lessonQuestSupport}from'./src/lib/learningBriefing';
 import{COMPLETION_EXAMPLES}from'./src/lib/extendedExamples';
 import{reviewAfterEvaluation}from'./src/lib/structuredReview';
 const params=new URLSearchParams(location.search),structured=params.has('structured');
 const evidence='Packet: A small unit of information carried across a computer network.';
 const source={id:'notes',title:'Network field notes',kind:'text',text:'A network carries information between connected devices. These notes distinguish a unit of information from the devices that carry it.\\n\\n'+evidence+'\\n\\nA router forwards packets between networks. A switch connects devices within a local network. These roles describe this source model rather than every possible network design.',status:'ready',addedAt:'2026-10-01T00:00:00.000Z'};
 const card={id:'packet',prompt:'Choose the source term.',answer:'Packet',options:['Packet','Router'],correctIndex:0,explanation:evidence,sourceId:'notes',evidence,concept:'Network vocabulary',tags:[],questionType:'definition',reviewStatus:'reviewed'};
 const activity=COMPLETION_EXAMPLES[0];const activitySource={...source,id:activity.sourceRefs[0].sourceId,title:'Observation field notes',text:activity.sourceRefs[0].evidence};
 const notebook=createNotebook({id:structured?'journey-model':'journey-recall',title:'The source expedition',ageGroup:params.has('young')?'3-5':'adult',cards:structured?[]:[card],sources:[structured?activitySource:source],activities:structured?[activity]:[]});
 const scaffold=SCAFFOLDS.find(s=>s.id===(structured?'definition-building':'recall-escape-mission'));
 const plan=buildLearningBriefing({notebook,scaffold,...(structured?{activity}:{cardIds:[card.id]})});
 let initial=emptyProgress(notebook.id);const key='journey-durable-'+notebook.id;
 if(localStorage.getItem(key))initial=JSON.parse(localStorage.getItem(key));
 else if(params.has('aged')){const s=initialLessonState(plan);const ready=completeLesson(plan,{...s,stage:'practice',missionAccepted:true,viewedPassageIds:plan.passages.map(p=>p.id),walkthroughStep:plan.walkthrough.steps.length,practice:{...s.practice,focusId:plan.practice.focusOptions[0].id,explanation:'The source distinguishes the unit of information from the forwarding device.',connection:'I will use this distinction when reading a network diagram.',compared:true,order:plan.practice.orderIds}},Date.now()-48*3600000);if(!lessonReady(plan,ready)||lessonQuestSupport(plan,ready).assisted)throw Error('Invalid older lesson fixture');initial={...initial,lessons:{[plan.id]:ready},...(structured?{structured:{[activity.id]:{response:{_draft:{lesson:ready}},attempts:0,score:0,maxScore:0,completed:false,updatedAt:new Date().toISOString()}}}:{})};}
 const controls=window.journey={mode:'immediate',writes:[],pending:[],completed:[],exits:0,durable:initial,plan,notebook,key,release(ok){const job=this.pending.shift();if(!job)throw Error('No pending durable write');if(ok){this.durable=structuredClone(job.progress);localStorage.setItem(key,JSON.stringify(job.progress));}job.resolve(ok);}};
 function Harness(){const[progress,setProgress]=useState(initial),[open,setOpen]=useState(true);const save=async(p)=>{const copy=structuredClone(p);controls.writes.push(copy);setProgress(p);if(controls.mode==='delay')return new Promise(resolve=>controls.pending.push({progress:copy,resolve}));if(controls.mode==='fail')return false;controls.durable=copy;localStorage.setItem(key,JSON.stringify(copy));return true;};
 const saveResponse=async(response,evaluation)=>{const prior=progress.structured?.[activity.id];const next={...progress,structured:{...progress.structured,[activity.id]:{...prior,response,attempts:(prior?.attempts??0)+(evaluation?.valid?1:0),score:evaluation?.score??prior?.score??0,maxScore:evaluation?.maxScore??prior?.maxScore??0,completed:!!evaluation?.valid&&evaluation?.correct===true,updatedAt:new Date().toISOString(),...(evaluation?{review:reviewAfterEvaluation(activity.id,prior,evaluation)}:{})}}};const ok=await save(next);if(ok&&evaluation)controls.completed.push(evaluation);return ok;};
 if(!open)return <main><h1>Expedition paused</h1><button onClick={()=>setOpen(true)}>Resume expedition</button></main>;
 return structured?<main><StructuredBoard notebook={notebook} activity={activity} sources={notebook.sources} scaffoldId={scaffold.id} savedResponse={progress.structured?.[activity.id]?.response} onSave={r=>saveResponse(r)} onComplete={()=>true} onCommit={saveResponse}/></main>:<Player notebook={notebook} scaffold={scaffold} progress={progress} onProgress={save} onError={s=>controls.error=s} onExit={()=>{controls.exits++;setOpen(false);}} onComplete={(score,total)=>controls.completed.push({score,total})}/>;}
 createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',target:'es2022',outfile:path.join(folder,'journey.js'),jsx:'automatic',plugins:[{name:'presentation-only-stubs',setup(builder){builder.onResolve({filter:/^(\.\/WorldPreview|\.\/LearningScene|\.\.\/lib\/music)$/},args=>({path:args.path,namespace:'presentation-stub'}));builder.onLoad({filter:/.*/,namespace:'presentation-stub'},args=>({contents:args.path.includes('/music')?'export const gameActionFeedback=()=>{};export const musicFeedback=()=>{};export const duckMusic=()=>{};export const setLearningMusicPhase=()=>{};export const asterFeedback=()=>false;export const getSoundPreferences=()=>({enabled:false,volume:0});':'export default function Presentation(){return null;}',loader:'js'}));}}]});
 server=createServer(async(req,res)=>{try{const name=req.url?.split('?')[0];if(name==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><title>Learning journey verification</title><link rel="stylesheet" href="/journey.css"></head><body><div id="root"></div><script type="module" src="/journey.js"></script></body></html>');return;}const file=name==='/journey.js'?'journey.js':name==='/journey.css'?'journey.css':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(folder,file)));}catch{res.writeHead(500);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address='http://127.0.0.1:'+(server.address() as any).port;
});
test.afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder)await rm(folder,{recursive:true,force:true});});

async function openJourney(page:Page,query='') {await page.goto(address+'/'+query);await expect(page.getByRole('button',{name:'Explore the source',exact:true})).toBeVisible();}
async function exploreSource(page:Page) {
 await page.getByRole('button',{name:'Explore the source',exact:true}).click();
 const passages=page.getByRole('button',{name:/^Mark passage \d+ explored$/});
 while(await passages.count())await passages.first().click();
 await page.getByRole('button',{name:'Study the walkthrough',exact:true}).click();
}
async function walkthrough(page:Page) {
 const next=page.getByRole('button',{name:'Next walkthrough step',exact:true});
 while(await next.count())await next.click();
 await page.getByRole('button',{name:'Build my field note',exact:true}).click();
}
async function fieldNote(page:Page) {
 await page.getByRole('radio').first().check();
 await page.getByRole('textbox',{name:'Explain it in your own words',exact:true}).fill('The source distinguishes a measured observation from an interpretation or a named unit from the device carrying it.');
 await page.getByRole('textbox',{name:'Connect it or name a question',exact:true}).fill('I will check what was actually measured before explaining it.');
 await page.getByLabel('I compared my note with the source',{exact:true}).check();
}
async function completeBriefing(page:Page) {await exploreSource(page);await walkthrough(page);await fieldNote(page);await page.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();}
const durable=(page:Page)=>page.evaluate(()=>(window as any).journey.durable);

test('a fresh expedition teaches from the source and restores unfinished context and field notes',async({page})=>{
 await openJourney(page);await expect(page.getByRole('button',{name:'Check my answer'})).toHaveCount(0);await expect(page.locator('.answer-option')).toHaveCount(0);
 await page.getByRole('button',{name:'Explore the source',exact:true}).click();
 await expect(page.locator('.lesson-citation').filter({hasText:'Network field notes'}).first()).toBeVisible();
 await expect(page.getByText(/A network carries information between connected devices/).first()).toBeVisible();
 await page.getByRole('button',{name:'Mark passage 1 explored',exact:true}).click();
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();await expect(page.getByRole('heading',{name:'Expedition paused'})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Explore the source',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Mark passage 1 explored',exact:true})).toHaveCount(0);
 const remaining=page.getByRole('button',{name:/^Mark passage \d+ explored$/});while(await remaining.count())await remaining.first().click();
 await page.getByRole('button',{name:'Study the walkthrough',exact:true}).click();await walkthrough(page);
 await page.getByRole('radio').first().check();await page.getByRole('textbox',{name:'Explain it in your own words',exact:true}).fill('I can distinguish the information from the device carrying it.');
 await page.getByRole('textbox',{name:'Connect it or name a question',exact:true}).fill('What changes when a packet reaches another network?');
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();await expect(page.getByRole('heading',{name:'Expedition paused'})).toBeVisible();
 await page.reload();await expect(page.getByRole('textbox',{name:'Explain it in your own words',exact:true})).toHaveValue('I can distinguish the information from the device carrying it.');await expect(page.getByRole('textbox',{name:'Connect it or name a question',exact:true})).toHaveValue('What changes when a packet reaches another network?');
 await expect(page.getByRole('button',{name:'Check my answer'})).toHaveCount(0);
});

test('a failed stage save holds the lesson in place and retry durably advances once',async({page})=>{
 await openJourney(page);await page.evaluate(()=>{(window as any).journey.mode='delay';});await page.getByRole('button',{name:'Explore the source',exact:true}).click();
 await expect(page.getByRole('button',{name:/^Mark passage \d+ explored$/})).toHaveCount(0);await expect(page.getByRole('button',{name:'Explore the source',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).journey.pending.length)).toBe(1);
 await page.evaluate(()=>{(window as any).journey.release(false);});await expect(page.getByRole('button',{name:'Retry saving briefing',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Mark passage \d+ explored$/})).toHaveCount(0);
 await page.evaluate(()=>{(window as any).journey.mode='immediate';});await page.getByRole('button',{name:'Retry saving briefing',exact:true}).click();await expect(page.getByRole('button',{name:'Mark passage 1 explored',exact:true})).toBeVisible();
 const p=await durable(page);expect(p.activeSession.state.lesson.stage).toBe('context');expect(p.attempts).toHaveLength(0);expect(p.xp).toBe(0);await page.reload();await expect(page.getByRole('button',{name:'Mark passage 1 explored',exact:true})).toBeVisible();
});

test('fresh lesson practice unlocks recall but awards no independent credit and celebrates only after commit',async({page})=>{
 await openJourney(page);await completeBriefing(page);await expect(page.getByText('Apply what you just learned',{exact:false})).toBeVisible();
 await page.locator('.answer-option').filter({hasText:'Packet'}).click();await expect(page.locator('.player-save-note')).toContainText('Progress saved');
 await page.evaluate(()=>{(window as any).journey.mode='delay';});await page.getByRole('button',{name:'Check my answer',exact:true}).click();await expect(page.locator('.answer-feedback')).toHaveCount(0);await expect(page.locator('.aster-reaction')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).journey.release(true);});await expect(page.locator('.answer-feedback.success')).toBeVisible();await expect(page.locator('.aster-reaction[data-reaction="success"]')).toHaveCount(1);
 const p=await durable(page);expect(p.xp).toBe(0);expect(p.mastery).toBe(0);expect(p.cards.packet.successfulReviews).toBe(0);expect(p.completedCardIds).toEqual([]);expect(p.activeSession.state.independentCount).toBe(0);
 await page.getByRole('button',{name:'Complete this chapter',exact:true}).click();await expect(page.locator('.aster-reaction[data-reaction="complete"]')).toHaveCount(0);await page.evaluate(()=>{(window as any).journey.release(true);});await expect(page.locator('.aster-reaction[data-reaction="complete"]')).toHaveCount(1);expect(await page.evaluate(()=>(window as any).journey.completed)).toEqual([{score:0,total:1}]);
});

test('a reviewed lesson completed 48 hours earlier permits a new independent recall',async({page})=>{
 await page.goto(address+'/?aged=1');await expect(page.getByText('Independent retrieval',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Explore the source'})).toHaveCount(0);
 await page.locator('.answer-option').filter({hasText:'Packet'}).click();await page.getByRole('button',{name:'Check my answer',exact:true}).click();await expect(page.locator('.answer-feedback.success')).toBeVisible();
 const p=await durable(page);expect(p.xp).toBeGreaterThan(0);expect(p.cards.packet.successfulReviews).toBe(1);expect(p.activeSession.state.independentCount).toBe(1);expect(p.completedCardIds).toEqual(['packet']);
});

test('structured missions preserve the lesson gate and immediate support through a delayed result commit',async({page})=>{
 await openJourney(page,'?structured=1');await expect(page.getByLabel('Complete position 1')).toHaveCount(0);await completeBriefing(page);
 if(!await page.getByText('Choose pieces directly',{exact:true}).evaluate(node=>node.closest('details')?.open))await page.getByText('Choose pieces directly',{exact:true}).click();
 await page.getByLabel('Complete position 1').selectOption('observation');await page.getByLabel('Complete position 2').selectOption('interpretation');await page.reload();await expect(page.getByLabel('Complete position 1')).toHaveValue('observation');
 await page.evaluate(()=>{(window as any).journey.mode='delay';});await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.locator('.structured-feedback')).toHaveCount(0);await expect(page.locator('.aster-reaction')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).journey.completed)).toEqual([]);
 await page.evaluate(()=>{(window as any).journey.release(true);});await expect(page.locator('.structured-feedback')).toBeVisible();await expect(page.locator('.aster-reaction[data-reaction="success"]')).toHaveCount(1);
 const p=await durable(page);expect(p.structured['lab-completion'].review.independentSuccesses).toBe(0);expect(p.structured['lab-completion'].response._draft.hintUsed).toBe(true);expect(await page.evaluate(()=>(window as any).journey.completed[0].hintUsed)).toBe(true);
});

test('failed final field-note save preserves the note and cannot unlock the quest',async({page})=>{
 await openJourney(page);await exploreSource(page);await walkthrough(page);await fieldNote(page);
 await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeEnabled();
 await page.evaluate(()=>{(window as any).journey.mode='fail';});
 await page.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry saving briefing',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Check my answer',exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Explain it in your own words',exact:true})).toHaveValue(/source distinguishes/);
 const p=await durable(page);expect(p.activeSession.state.lesson.stage).toBe('practice');expect(p.activeSession.state.lesson.completedAt).toBeUndefined();
 await page.evaluate(()=>{(window as any).journey.mode='immediate';});await page.getByRole('button',{name:'Retry saving briefing',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check my answer',exact:true})).toBeVisible();
 expect((await durable(page)).activeSession.state.lesson.stage).toBe('ready');
});

test('the teaching stages remain accessible on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openJourney(page);
 const audit=async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const result=await new AxeBuilder({page}).include('.learning-briefing').analyze();expect(result.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);};
 await audit();await page.getByRole('button',{name:'Explore the source',exact:true}).click();await audit();
 const unread=page.getByRole('button',{name:/^Mark passage \d+ explored$/});while(await unread.count())await unread.first().click();
 await page.getByRole('button',{name:'Study the walkthrough',exact:true}).click();await audit();await walkthrough(page);await fieldNote(page);await audit();
});

test('young learners can use the caregiver conversation route without false independent credit',async({page})=>{
 await openJourney(page,'?young=1');await exploreSource(page);await walkthrough(page);
 await page.locator('.lesson-focus-options input').first().check();
 await page.getByRole('checkbox',{name:'Talk or point with a grown-up instead of typing',exact:true}).check();
 await expect(page.getByRole('textbox',{name:'Explain it in your own words',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save briefing & start quest',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'We talked or pointed through the idea and its source together',exact:true}).check();
 await page.getByRole('checkbox',{name:'I compared my note with the source',exact:true}).check();
 await page.getByRole('button',{name:'Save briefing & start quest',exact:true}).click();
 await page.locator('.answer-option').filter({hasText:'Packet'}).click();await page.getByRole('button',{name:'Check my answer',exact:true}).click();await expect(page.locator('.answer-feedback.success')).toBeVisible();
 const p=await durable(page);expect(p.activeSession.state.lesson.practice).toMatchObject({mode:'spoken',spokenConfirmed:true,compared:true});expect(p.xp).toBe(0);expect(p.activeSession.state.independentCount).toBe(0);
});
