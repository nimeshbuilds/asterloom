import {describe,it,expect} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {createNotebook,createSource} from '../src/lib/utils';
import {compileNotebook} from '../src/lib/compiler';
import {emptyProgress} from '../src/lib/storage';
import {parseProgress,serializeProgress} from '../src/lib/package';
import {buildLearningBriefing,initialLessonState,completeGuidedLesson,lessonAllowsGuidedStart,lessonContextReady,lessonReady,lessonQuestSupport,lessonRequiresWalkthrough,restartLesson,LESSON_SUPPORT_WINDOW_MS,type LearningPlan} from '../src/lib/learningBriefing';
function plan(text='Packet: A small unit of data in the supplied training model.\nFrame: The enclosing structure described only in this model.'){
 const source=createSource(text,'Training notes'),cards=compileNotebook([source],{maxCards:2}).cards;
 const notebook=createNotebook({id:'source-guided',sources:[source],cards});
 return buildLearningBriefing({notebook,scaffold:SCAFFOLDS.find(s=>s.id==='recall-escape-mission')!});
}
function read(p:LearningPlan){return{...initialLessonState(p),missionAccepted:true,stage:'context' as const,viewedPassageIds:p.passages.map(passage=>passage.id)};}
const at=Date.parse('2026-11-07T10:00:00.000Z');
describe('direct source-guided preparation',()=>{
 it('starts after every exact passage without mandatory generic walkthrough, kit or writing',()=>{
  const p=plan(),state=read(p);expect(p.rehearsal).toBeDefined();expect(p.walkthrough.kind).toBe('source-reading');expect(lessonRequiresWalkthrough(p,true)).toBe(false);
  expect(lessonAllowsGuidedStart(p)).toBe(true);expect(lessonContextReady(p,state)).toBe(true);
  const ready=completeGuidedLesson(p,state,at);expect(lessonReady(p,ready)).toBe(true);expect(ready.practice).toMatchObject({guidedStart:true,explanation:'',connection:'',compared:false});expect(ready.rehearsal).toBeUndefined();expect(ready.walkthroughStep).toBe(0);
  const progress=parseProgress(serializeProgress({...emptyProgress('source-guided'),lessons:{[p.id]:ready}}));expect(progress.lessons?.[p.id]).toEqual(ready);expect(progress.xp).toBe(0);expect(progress.mastery).toBe(0);expect(progress.attempts).toEqual([]);
  expect(initialLessonState(p,progress.lessons?.[p.id])).toEqual(ready);expect(lessonQuestSupport(p,ready,at).assisted).toBe(true);expect(lessonQuestSupport(p,ready,at+30*LESSON_SUPPORT_WINDOW_MS).assisted).toBe(true);
 });
 it('cannot replace missing current passages, source coverage or acceptance with a guided-start flag',()=>{
  const p=plan(),ready=completeGuidedLesson(p,read(p),at);
  for(const change of [{viewedPassageIds:[]},{viewedPassageIds:['teaching-some-ai-idea']},{missionAccepted:false}]){expect(lessonReady(p,{...ready,...change})).toBe(false);expect(completeGuidedLesson(p,{...read(p),...change},at).completedAt).toBeUndefined();}
  expect(lessonAllowsGuidedStart({...p,passages:[]})).toBe(false);expect(lessonAllowsGuidedStart({...p,status:'blocked'})).toBe(false);expect(lessonAllowsGuidedStart({...p,coverage:{coveredTargetIds:[],uncoveredTargetIds:p.targets}})).toBe(false);
  expect(lessonReady({...p,id:'lesson-'+'0'.repeat(64)},ready)).toBe(false);
 });
 it.each(['Procedure for this training model:\n1. Read the recorded value.\n2. Record the value and its source.','Example: The receiver can inspect the packet because it has arrived. This example is limited to the supplied model.'])('retains actual source example and procedure prerequisites: %s',text=>{
  const source=createSource(text,'Source example'),seed=plan(),p=buildLearningBriefing({notebook:createNotebook({id:'source-example',sources:[source],cards:[{id:'source-question',prompt:'Use the supplied source.',answer:'Source',options:['Source','Other'],correctIndex:0,explanation:text,sourceId:source.id,evidence:text,concept:'Source',tags:[],questionType:'definition',reviewStatus:'reviewed'}]}),scaffold:SCAFFOLDS.find(s=>s.id===seed.scaffoldId)!});
  expect(lessonRequiresWalkthrough(p,true)).toBe(true);expect(completeGuidedLesson(p,read(p),at).completedAt).toBeUndefined();
  const ready=completeGuidedLesson(p,{...read(p),walkthroughStep:p.walkthrough.steps.length},at);expect(lessonReady(p,ready)).toBe(true);expect(lessonReady(p,{...ready,walkthroughStep:0})).toBe(false);
 });
 it('retains historical notes, and clears reading readiness when revisiting or source content changes',()=>{
  const p=plan(),notes={explanation:'My earlier explanation remains mine.',connection:'Check the framing in another source.'},state=read(p),ready=completeGuidedLesson(p,{...state,practice:{...state.practice,...notes}},at);
  expect(ready.practice).toMatchObject(notes);expect(restartLesson(p,ready).practice).toMatchObject(notes);expect(restartLesson(p,ready).practice.guidedStart).toBeUndefined();expect(restartLesson(p,ready).viewedPassageIds).toEqual([]);
  const changed=plan('Packet: A small unit of data in a different supplied model.\nFrame: A structure used only in the new model.'),restored=initialLessonState(changed,ready);expect(restored.practice).toMatchObject(notes);expect(restored.practice.guidedStart).toBeUndefined();expect(lessonReady(changed,restored)).toBe(false);
 });
});
