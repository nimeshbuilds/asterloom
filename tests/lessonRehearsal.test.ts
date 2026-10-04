import {describe,it,expect} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {beginLessonRehearsal,buildLearningBriefing,completeLesson,initialLessonState,lessonQuestSupport,lessonReady,lessonRehearsalChecks,lessonRehearsalReady,lessonToolkit,validateLessonState,type LearningPlan,type LessonState} from '../src/lib/learningBriefing';
import {createNotebook,createSource} from '../src/lib/utils';
import {isCurrentEvidence} from '../src/lib/evidence';
import {emptyProgress} from '../src/lib/storage';
import {parseProgress,serializeProgress} from '../src/lib/package';
import type {LearningCard} from '../src/types';
const text='Packet: a small unit of data used by this training model.\nFrame: the enclosing structure described only in this model.\nBuffer: a temporary holding place in the modeled receiver.';
function fixture(material=text){
 const source={...createSource(material,'Network field guide'),id:'field-source'};
 const card:LearningCard={id:'packet',prompt:'Use the supplied source.',answer:'Packet',options:['Packet','Frame'],correctIndex:0,explanation:'Read the supplied source.',sourceId:source.id,evidence:material,concept:'Packet',tags:[],questionType:'definition',reviewStatus:'extractive'};
 const notebook=createNotebook({id:'field-notebook',title:'Deliver the field guide',sources:[source],cards:[card],ageGroup:'adult'});
 return {notebook,plan:buildLearningBriefing({notebook,scaffold:SCAFFOLDS.find(s=>s.id==='recall-escape-mission')!})};
}
function assembled(plan:LearningPlan):LessonState{const state=beginLessonRehearsal(plan);return{...state,rehearsal:{...state.rehearsal!,answers:Object.fromEntries(plan.rehearsal!.slots.map(s=>[s.id,s.acceptedTileIds[0]])),checked:true}};}
describe('active source-backed preparation',()=>{
 it('builds a useful source kit with exact evidence and a demonstrated first move, not an invented explanation',()=>{
  const{notebook,plan}=fixture();expect(plan.rehearsal?.kind).toBe('reference-kit');expect(plan.rehearsal?.slots).toHaveLength(3);
  for(const item of [...plan.rehearsal!.tiles,...plan.rehearsal!.slots])expect(isCurrentEvidence(item.reference,notebook.sources)).toBe(true);
  expect(plan.mission.sourceTitles).toEqual(['Network field guide']);expect(plan.mission.assignmentOrigin).toBe('source-guide');expect(plan.mission.evidence.every(r=>isCurrentEvidence(r,notebook.sources))).toBe(true);
  const state=beginLessonRehearsal(plan);expect(state.stage).toBe('practice');expect(Object.keys(state.rehearsal!.answers)).toHaveLength(1);expect(state.rehearsal!.revealed).toHaveLength(1);expect(lessonRehearsalReady(plan,state.rehearsal)).toBe(false);expect(completeLesson(plan,state).completedAt).toBeUndefined();
 });
 it('uses explicitly defined prose concepts without turning arbitrary sentences into new term meanings',()=>{
  const{notebook,plan}=fixture('A packet is a small unit of data used only in this training model. A frame is the enclosing structure described by this training model.');
  expect(plan.rehearsal?.tiles.map(tile=>tile.label)).toEqual(['A packet','A frame']);expect(plan.mission.assignment).toContain('A packet · A frame');
  for(const tile of plan.rehearsal!.tiles)expect(isCurrentEvidence(tile.reference,notebook.sources)).toBe(true);
 });
 it('requires every source relationship to be correct and explicitly checked before carrying the kit forward',()=>{
  const{plan}=fixture(),state=assembled(plan);state.rehearsal!.answers['meaning-2']='term-1';
  expect(lessonRehearsalChecks(plan,state.rehearsal).map(x=>x.correct)).toEqual([true,true,false]);expect(lessonRehearsalReady(plan,state.rehearsal)).toBe(false);expect(lessonToolkit(plan,state)).toEqual([]);
  state.rehearsal!.answers['meaning-2']='term-2';state.rehearsal!.checked=false;expect(lessonRehearsalReady(plan,state.rehearsal)).toBe(false);
  state.rehearsal!.checked=true;expect(lessonRehearsalReady(plan,state.rehearsal)).toBe(true);
  const completed=completeLesson(plan,state,1000);expect(lessonReady(plan,completed)).toBe(true);expect(completed.viewedPassageIds).toEqual([]);expect(completed.walkthroughStep).toBe(0);expect(completed.practice.explanation).toBe('');expect(lessonQuestSupport(plan,completed,1000).assisted).toBe(true);
  expect(lessonToolkit(plan,completed).map(x=>[x.label,x.meaning])).toEqual([['Packet','a small unit of data used by this training model.'],['Frame','the enclosing structure described only in this model.'],['Buffer','a temporary holding place in the modeled receiver.']]);
 });
 it('preserves the partially built arrangement and selected piece across portable progress backup without XP',()=>{
  const{notebook,plan}=fixture(),state=beginLessonRehearsal(plan);state.rehearsal!.selectedTileId='term-2';state.rehearsal!.answers['meaning-1']='term-2';
  const progress={...emptyProgress(notebook.id),lessons:{[plan.id]:state}},restored=parseProgress(serializeProgress(progress));
  expect(initialLessonState(plan,restored.lessons?.[plan.id])).toEqual(state);expect(restored.xp).toBe(0);expect(restored.attempts).toEqual([]);
  expect(lessonReady(plan,restored.lessons?.[plan.id])).toBe(false);
 });
 it('does not trust checked flags, unknown pieces, extra fields, or a stale source revision',()=>{
  const{notebook,plan}=fixture(),state=assembled(plan),completed=completeLesson(plan,state,1000);
  const forged={...completed,rehearsal:{...completed.rehearsal!,answers:{'meaning-0':'unknown'},checked:true}};
  expect(lessonReady(plan,forged)).toBe(false);expect(initialLessonState(plan,forged).rehearsal!.answers).toEqual({});
  expect(validateLessonState({...state,rehearsal:{...state.rehearsal,sourceFacts:'untrusted'}})).toBeUndefined();
  expect(validateLessonState({...state,rehearsal:{...state.rehearsal,answers:JSON.parse('{"__proto__":"term-1"}')}})).toBeUndefined();
  notebook.sources[0].text=text.replace('small','large');const changed=buildLearningBriefing({notebook,scaffold:SCAFFOLDS.find(s=>s.id==='recall-escape-mission')!});expect(lessonReady(changed,completed)).toBe(false);expect(initialLessonState(changed,completed).rehearsal).toBeUndefined();
 });
 it('rehearses only an explicitly labeled procedure and retains source order rather than asserting causality',()=>{
  const{notebook,plan}=fixture('Procedure for this training example:\n1. Read the supplied observation.\n2. Compare the observation with the supplied rule.\n3. Record the decision with its source reference.');expect(plan.rehearsal?.kind).toBe('route-kit');expect(plan.rehearsal!.purpose).toContain('not an unstated cause');for(const tile of plan.rehearsal!.tiles)expect(isCurrentEvidence(tile.reference,notebook.sources)).toBe(true);
  const state=assembled(plan);[state.rehearsal!.answers['place-1'],state.rehearsal!.answers['place-2']]=[state.rehearsal!.answers['place-2'],state.rehearsal!.answers['place-1']];expect(lessonRehearsalReady(plan,state.rehearsal)).toBe(false);
  expect(fixture('1. Read the supplied observation.\n2. Record the supplied observation.').plan.rehearsal).toBeUndefined();
 });
 it('keeps free prose and ambiguous definitions in the ungraded reading path, without synthesizing a matching truth',()=>{
  expect(fixture('The receiver holds data temporarily in this training model. The source leaves other systems unspecified.').plan.rehearsal).toBeUndefined();
  expect(fixture('Packet: a small unit of data used by this training model.\nPacket: the larger container in a different model.\nFrame: a wrapper used only in the first training model.').plan.rehearsal).toBeUndefined();
  expect(fixture('Note: read this source carefully before studying its details.\nWarning: this source is only a simplified training model.').plan.rehearsal).toBeUndefined();
  expect(fixture(Array.from({length:7},(_,i)=>`Term${i}: the explicitly supplied description for item ${i}.`).join('\n')).plan.rehearsal).toBeUndefined();
 });
 it('does not convert a prepared draft into independent credit even after the normal support window',()=>{
  const{notebook}=fixture();notebook.cards[0].reviewStatus='needs-review';const plan=buildLearningBriefing({notebook,scaffold:SCAFFOLDS.find(s=>s.id==='recall-escape-mission')!}),state=completeLesson(plan,assembled(plan),1000);expect(lessonQuestSupport(plan,state,1000+5*86400000).assisted).toBe(true);
 });
});
