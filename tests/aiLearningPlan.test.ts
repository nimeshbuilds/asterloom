import {describe,it,expect} from 'vitest';
import {createNotebook,createSource} from '../src/lib/utils';
import {isCurrentEvidence} from '../src/lib/evidence';
import {validateAILearningMissionDraft,validateAILearningPlan,reconcileAILearningPlan,currentAILearningMission,AI_TEACHING_VERIFICATION_NOTE,type AILearningMission} from '../src/lib/aiLearningPlan';
import {buildLearningBriefing,initialLessonState,completeLesson,completeGuidedLesson,restartLesson,validateLessonState,lessonAllowsGuidedStart,lessonQuestSupport,lessonReady,lessonContextReady,lessonTeachingChunkIds,beginLessonRehearsal,beginLessonPractice,lessonRequiresWalkthrough} from '../src/lib/learningBriefing';
import {emptyProgress} from '../src/lib/storage';
import {parseProgress,serializeProgress,parsePackage,serializePackage} from '../src/lib/package';
import {recallAuthoringFixture} from './gameDraftAuthoring.fixture';
import {SCAFFOLDS} from '../src/data/scaffolds';
import type {StructuredActivity} from '../src/lib/structuredEngine';

const overview='A field check preserves the observation and the rule before deciding. This training procedure does not establish real-world safety.';
const procedure='Procedure for the training model:\n1. Read the supplied observation.\n2. Compare the observation with the rule.\n3. Record the decision and its evidence.';
function fixture(ageGroup='adult'){
 const source={...createSource('[Page 2]\n\n'+overview+'\n\n'+procedure,'A field-check guide'),id:'field-source'};
 const activity:StructuredActivity={version:1,id:'field-activity',kind:'sequence',title:'Build a field-check route',instruction:'Arrange the documented steps into the order supplied by the procedure.',explanation:'The source explicitly supplies the order.',hint:'Start by reading the supplied observation.',reviewStatus:'reviewed',sourceRefs:[{sourceId:source.id,evidence:procedure}],scaffoldIds:['process-reconstruction'],items:[{id:'read',label:'Read the supplied observation.'},{id:'compare',label:'Compare the observation with the rule.'},{id:'record',label:'Record the decision and its evidence.'}],constraints:[{before:'read',after:'compare'},{before:'compare',after:'record'}]};
 const notebook=createNotebook({id:'ai-field-guide',sources:[source],activities:[activity],ageGroup,cards:[]});
 const cite=(evidence:string)=>({sourceId:source.id,evidence});
 const draft={title:'Prepare a traceable field check',objective:'Use the documented order to build a check with evidence.',conceptExplanation:{text:'This check keeps observations and a stated rule available before making a decision. Its scope is the supplied training model.',citations:[cite(overview)]},chunks:[{id:'observe',title:'Start with the observation',text:'Read what the model supplies before you compare it with a rule.',citations:[cite('Read the supplied observation.')]},{id:'compare',title:'Keep the decision traceable',text:'Compare the observation with the given rule, then record the decision with its supporting evidence.',citations:[cite('Compare the observation with the rule.'),cite('Record the decision and its evidence.')]}],guidedApplication:{prompt:'Use the three step tiles to build this mission’s documented route.',steps:['Place the step tiles into the route.','Check the order against the supplied procedure.']},workedExample:{title:'Walk through the supplied procedure',sourceEvidence:cite(procedure),steps:[{title:'Read first',text:'The first source step asks you to read the supplied observation.',citations:[cite('Read the supplied observation.')]},{title:'Compare and record',text:'Next compare it with the rule. The final step records the decision together with its evidence.',citations:[cite('Compare the observation with the rule.'),cite('Record the decision and its evidence.')]}]},storyFrame:{fictional:true,setting:'an imaginary field-guide studio',role:'field-guide maker',mission:'Prepare a route another learner can inspect.',success:'A traceable route through the supplied steps'}};
 const context={activity,ageGroup,sources:notebook.sources,sourceWindow:{sourceId:source.id,start:0,end:source.text.length}};
 return{notebook,source,activity,draft,context};
}
function generated(){const f=fixture(),mission=validateAILearningMissionDraft(f.draft,f.context);const notebook={...f.notebook,aiLearningPlan:{version:1 as const,missions:[mission]}};return{...f,mission,notebook};}
describe('source-cited digestible AI teaching',()=>{
 it('round-trips one concise chunk for a short source while rejecting empty or ungrounded teaching',()=>{
  const f=recallAuthoringFixture(),citations=[{sourceId:f.source.id,evidence:f.prose}],context={activity:f.activity,ageGroup:f.ageGroup,sources:[f.source],sourceWindow:{sourceId:f.source.id,start:0,end:f.source.text.length}};
  const draft={title:'Queue and worker',objective:'Recall which term names the waiting jobs and which names the process.',conceptExplanation:{text:'A queue holds waiting jobs. A worker runs those jobs.',citations},chunks:[{id:'distinction',title:'List and process',text:'Remember the distinction: queue names the list, and worker names the process.',citations}],guidedApplication:{prompt:'Write the term matching each definition.',steps:['Read each definition and enter its source term.']}};
  const mission=validateAILearningMissionDraft(draft,context),notebook=createNotebook({sources:[f.source],activities:[f.activity],ageGroup:f.ageGroup,aiLearningPlan:{version:1,missions:[mission]}});
  expect(mission.chunks).toHaveLength(1);expect(mission.reviewStatus).toBe('needs-review');
  const restored=parsePackage(serializePackage(notebook));expect(restored.aiLearningPlan).toEqual(notebook.aiLearningPlan);expect(validateAILearningPlan(restored.aiLearningPlan,restored)).toEqual(notebook.aiLearningPlan);
  expect(()=>validateAILearningMissionDraft({...draft,chunks:[]},context)).toThrow(/1–5/);
  expect(()=>validateAILearningPlan({version:1,missions:[{...mission,chunks:[]}]},notebook)).toThrow(/1–5/);
  expect(()=>validateAILearningMissionDraft({...draft,conceptExplanation:undefined},context)).toThrow();
  expect(()=>validateAILearningMissionDraft({...draft,guidedApplication:undefined},context)).toThrow();
  expect(()=>validateAILearningMissionDraft({...draft,chunks:[{...draft.chunks[0],citations:[]}]},context)).toThrow();
  expect(()=>validateAILearningMissionDraft({...draft,chunks:[{...draft.chunks[0],citations:[{sourceId:f.source.id,evidence:'A queue runs jobs immediately.'}]}]},context)).toThrow(/exact substring/);
 });
 it('binds generated explanations to exact page citations, actual mission, audience and unapproved review state',()=>{
  const {notebook,mission,activity}=generated();expect(mission.reviewStatus).toBe('needs-review');expect(mission.guidedApplication.activityId).toBe(activity.id);expect(mission.conceptExplanation.citations[0].locator.kind).toBe('page');expect(mission.conceptExplanation.citations[0].locator.label).toContain('Page 2');
  const references=[...mission.conceptExplanation.citations,...mission.chunks.flatMap(chunk=>chunk.citations),...mission.workedExample!.steps.flatMap(step=>step.citations)];expect(references.every(ref=>isCurrentEvidence(ref,notebook.sources))).toBe(true);expect(validateAILearningPlan(JSON.parse(JSON.stringify(notebook.aiLearningPlan)),notebook)).toEqual(notebook.aiLearningPlan);expect(currentAILearningMission(notebook,activity)).toEqual(mission);expect(AI_TEACHING_VERIFICATION_NOTE).toContain('do not automatically prove');
 });
 it('rejects fabricated citations, outside-window sources, hidden fields and claims of approval',()=>{
  const {draft,context}=fixture();const wrong=structuredClone(draft);wrong.chunks[0].citations[0].evidence='Invented source sentence.';expect(()=>validateAILearningMissionDraft(wrong,context)).toThrow(/exact substring/);
  const undisclosed=structuredClone(draft);undisclosed.conceptExplanation.citations[0].sourceId='other';expect(()=>validateAILearningMissionDraft(undisclosed,context)).toThrow(/not disclosed/);
  expect(()=>validateAILearningMissionDraft({...draft,reviewStatus:'reviewed'},context)).toThrow(/unsupported field/);
  expect(()=>validateAILearningMissionDraft({...draft,tools:['execute']},context)).toThrow(/unsupported field/);
  const copied=structuredClone(draft);copied.chunks[1].id=copied.chunks[0].id;expect(()=>validateAILearningMissionDraft(copied,context)).toThrow(/unique ID/);
  expect(()=>validateAILearningMissionDraft(draft,{...context,sourceWindow:{...context.sourceWindow,start:context.sources[0].text.indexOf(procedure)}})).toThrow(/exact substring/);
 });
 it('permits a source-provided worked example but rejects an invented or unrelated example',()=>{
  const {draft,context}=fixture();const unlabeled=structuredClone(draft);unlabeled.workedExample.sourceEvidence.evidence=overview;expect(()=>validateAILearningMissionDraft(unlabeled,context)).toThrow(/source-provided example/);
  const unrelated=structuredClone(draft);unrelated.workedExample.steps[0].citations[0].evidence=overview;expect(()=>validateAILearningMissionDraft(unrelated,context)).toThrow(/unrelated material/);
  const implicit=structuredClone(draft);implicit.storyFrame.fictional=false;expect(()=>validateAILearningMissionDraft(implicit,context)).toThrow(/explicitly fictional/);
  const absent=structuredClone(draft) as Partial<typeof draft>;delete absent.workedExample;expect(validateAILearningMissionDraft(absent,context).workedExample).toBeUndefined();
 });
 it('allows a whole procedure cited below its actual source heading, but not a numbered list under an unrelated heading',()=>{
  const f=fixture(),steps=procedure.slice(procedure.indexOf('1.'));
  const draft=structuredClone(f.draft);draft.workedExample.sourceEvidence.evidence=steps;draft.conceptExplanation.citations=[{sourceId:f.source.id,evidence:steps}];
  const source={...f.source,text:'# Procedure for the training model\n'+steps},start=source.text.indexOf(steps),activity={...f.activity,sourceRefs:[{sourceId:source.id,evidence:steps}]};
  const context={...f.context,activity,sources:[source],sourceWindow:{sourceId:source.id,start,end:source.text.length}};
  const mission=validateAILearningMissionDraft(draft,context);expect(mission.workedExample?.sourceEvidence.quote).toBe(steps);
  const notebook={...f.notebook,activities:[activity],sources:[source],aiLearningPlan:{version:1 as const,missions:[mission]}};
  expect(validateAILearningPlan(notebook.aiLearningPlan,notebook).missions[0]).toEqual(mission);
  expect(buildLearningBriefing({notebook,activity,scaffold:SCAFFOLDS.find(s=>s.id==='process-reconstruction')!}).rehearsal?.kind).toBe('route-kit');
  for(const heading of ['# Observations','# Types of procedures','# Procedure\nIntroduction only.\n# Other material']){
   const text=heading+'\n'+steps,changed={...source,text};
   expect(()=>validateAILearningMissionDraft(draft,{...context,sources:[changed],sourceWindow:{sourceId:source.id,start:text.indexOf(steps),end:text.length}})).toThrow(/source-provided example/);
  }
 });
 it('enforces age-specific chunk sizes and avoids a wall of copied source text',()=>{
  const {draft,context}=fixture();const tooLong=structuredClone(draft);tooLong.chunks[0].text='word '.repeat(101);expect(()=>validateAILearningMissionDraft(tooLong,context)).toThrow(/age-appropriate/);
  const child={...context,ageGroup:'3-5'},tooLongForChild=structuredClone(draft);tooLongForChild.chunks[0].text='word '.repeat(26);expect(()=>validateAILearningMissionDraft(tooLongForChild,child)).toThrow(/180 characters|age-appropriate/);
  const short=structuredClone(draft);short.objective='Use the source steps.';short.conceptExplanation.text='Look first. Compare next. Then record the decision.';short.chunks[1].text='Compare what you see with the rule. Then record the decision.';short.guidedApplication.prompt='Build the source route.';short.workedExample.steps[1].text='Compare next. Record the decision last.';expect(validateAILearningMissionDraft(short,child).ageGroup).toBe('3-5');
  const longText='This sentence supplies a deliberately lengthy definition for a bounded training task and preserves its stated condition in the model. '.repeat(2),longSource={...context.sources[0],text:longText+procedure};const copied=structuredClone(draft);copied.conceptExplanation={text:longText.trim(),citations:[{sourceId:longSource.id,evidence:longText.trim()}]};expect(()=>validateAILearningMissionDraft(copied,{...context,sources:[longSource],sourceWindow:{sourceId:longSource.id,start:0,end:longSource.text.length}})).toThrow(/long quotation/);
 });
 it('invalidates obsolete teaching after source, model, audience or exact citation edits without dropping valid peer missions',()=>{
  const {notebook,mission,activity}=generated();const changed={...notebook,sources:[{...notebook.sources[0],text:notebook.sources[0].text+'\nMore context.'}]};expect(currentAILearningMission(changed,activity)).toBeUndefined();expect(reconcileAILearningPlan(notebook.aiLearningPlan,changed)).toBeUndefined();
  expect(currentAILearningMission({...notebook,ageGroup:'15-17'},activity)).toBeUndefined();expect(currentAILearningMission(notebook,{...activity,instruction:'A different task.'})).toBeUndefined();
  expect(currentAILearningMission(notebook,{...activity,reviewStatus:'needs-review'})).toEqual(mission);
  const forged=structuredClone(notebook.aiLearningPlan);forged.missions[0].chunks[0].citations[0].locator.label='Page 99';expect(()=>validateAILearningPlan(forged,notebook)).toThrow(/locator/);
  const secondActivity={...activity,id:'second-activity'},second=validateAILearningMissionDraft(fixture().draft,{...fixture().context,activity:secondActivity});const both={...notebook,activities:[{...activity,instruction:'Changed task'},secondActivity]};expect(reconcileAILearningPlan({version:1,missions:[mission,second]},both)?.missions.map(item=>item.activityId)).toEqual(['second-activity']);
 });
 it('preserves more than12 bounded teaching missions for a complete campaign and rejects duplicate or oversized plans',()=>{
  const f=fixture(),activities=Array.from({length:13},(_,i)=>({...f.activity,id:`mission-${i}`})),missions=activities.map(activity=>validateAILearningMissionDraft(f.draft,{...f.context,activity}));const notebook={...f.notebook,activities};expect(validateAILearningPlan({version:1,missions},notebook).missions).toHaveLength(13);expect(reconcileAILearningPlan({version:1,missions},notebook)?.missions).toHaveLength(13);expect(()=>validateAILearningPlan({version:1,missions:[missions[0],missions[0]]},notebook)).toThrow(/unique/);expect(()=>validateAILearningPlan({version:1,missions:Array.from({length:301},()=>missions[0])},notebook)).toThrow(/300/);
 });
});
describe('AI teaching runtime with existing lesson gates',()=>{
 function plan(){const f=generated();return{...f,plan:buildLearningBriefing({notebook:f.notebook,activity:f.activity,scaffold:SCAFFOLDS.find(s=>s.id==='process-reconstruction')!})};}
 function guidedPlan(){
  const f=fixture(),source={...f.source,text:overview+'\n\nRead the supplied observation. Compare the observation with the rule. Record the decision and its evidence.'},activity={...f.activity,sourceRefs:[{sourceId:f.source.id,evidence:overview}]};
  const draft={...f.draft,workedExample:undefined},mission=validateAILearningMissionDraft(draft,{...f.context,sources:[source],activity,sourceWindow:{sourceId:source.id,start:0,end:source.text.length}});
  const notebook={...f.notebook,sources:[source],activities:[activity],aiLearningPlan:{version:1 as const,missions:[mission]}},p=buildLearningBriefing({notebook,activity,scaffold:SCAFFOLDS.find(s=>s.id==='process-reconstruction')!});
  const initial=initialLessonState(p),practice=beginLessonPractice(p,{...initial,missionAccepted:true,stage:'context',viewedPassageIds:lessonTeachingChunkIds(p)});
  return{notebook,p,practice};
 }
 it('saves a guided handoff with no mandatory writing and preserves its bounded state through a portable progress backup',()=>{
  const {notebook,p,practice}=guidedPlan(),now=Date.parse('2026-10-09T12:00:00.000Z');
  expect(lessonAllowsGuidedStart(p)).toBe(true);expect(practice.practice.explanation).toBe('');expect(lessonReady(p,practice)).toBe(false);
  const ready=completeGuidedLesson(p,practice,now);
  expect(ready.practice).toMatchObject({guidedStart:true,explanation:'',compared:false});expect(lessonReady(p,ready)).toBe(true);expect(lessonQuestSupport(p,ready,now).assisted).toBe(true);
  expect(completeGuidedLesson(p,ready,now+5000)).toEqual(ready);
  const progress={...emptyProgress(notebook.id),lessons:{[p.id]:ready}},restored=parseProgress(serializeProgress(progress));
  expect(restored.lessons![p.id]).toEqual(ready);expect(restored.xp).toBe(0);expect(restored.mastery).toBe(0);expect(initialLessonState(p,restored.lessons![p.id])).toEqual(ready);
 });
 it('cannot use a handoff flag to bypass source identity, explored teaching, real walkthroughs, kits or ordered practice',()=>{
  const {p,practice}=guidedPlan(),ready=completeGuidedLesson(p,practice);
  expect(lessonReady(p,{...ready,viewedPassageIds:[]})).toBe(false);
  expect(completeGuidedLesson(p,{...practice,viewedPassageIds:[]}).practice.guidedStart).toBeUndefined();
  expect(lessonReady({...p,id:'lesson-'+'a'.repeat(64)},ready)).toBe(false);
  const noTeaching={...p,teaching:undefined};expect(lessonAllowsGuidedStart(noTeaching)).toBe(false);expect(lessonReady(noTeaching,ready)).toBe(false);
  const real=plan().plan;expect(lessonAllowsGuidedStart(real)).toBe(false);expect(completeGuidedLesson(real,initialLessonState(real)).completedAt).toBeUndefined();
  const ordered={...p,practice:{...p.practice,orderIds:['step-0','step-1']}};expect(lessonAllowsGuidedStart(ordered)).toBe(false);expect(lessonReady(ordered,ready)).toBe(false);
  const example={...p,teaching:{...p.teaching!,workedExample:plan().mission.workedExample}};
  expect(completeGuidedLesson(example,practice).completedAt).toBeUndefined();
  expect(validateLessonState({...ready,practice:{...ready.practice,guidedStart:'yes'}})).toBeUndefined();
 });
 it('retains existing notes when starting guided play, changing the lesson, and revisiting its teaching',()=>{
  const {p,practice}=guidedPlan(),origin='lesson-'+'b'.repeat(64),notes={explanation:'My preserved source explanation.',connection:'A question I want to return to.',notesFromPlanKey:origin};
  const ready=completeGuidedLesson(p,{...practice,practice:{...practice.practice,...notes,focusId:''}});
  expect(ready.practice).toMatchObject(notes);expect(ready.practice.focusId).toBe('');
  const restarted=restartLesson(p,ready);expect(restarted.practice).toMatchObject(notes);expect(restarted.practice.guidedStart).toBeUndefined();expect(restarted.completedAt).toBeUndefined();expect(restarted.viewedPassageIds).toEqual([]);expect(lessonReady(p,restarted)).toBe(false);
  const changed={...p,id:'lesson-'+'c'.repeat(64)},migrated=initialLessonState(changed,ready);expect(migrated.practice).toMatchObject(notes);expect(migrated.practice.guidedStart).toBeUndefined();expect(migrated.practice.focusId).toBe('');expect(lessonReady(changed,migrated)).toBe(false);
 });
 it('uses the generated teaching and fictional frame while retaining source evidence and an honest draft assessment',()=>{const f=plan();expect(f.plan.teaching).toEqual(f.mission);expect(f.plan.title).toBe(f.draft.title);expect(f.plan.story.setting).toBe(f.draft.storyFrame.setting);expect(f.plan.walkthrough.steps[0].instruction).toBe(f.draft.workedExample.steps[0].text);expect(f.plan.mission.assignment).toBe(f.activity.instruction);expect(f.plan.reviewed).toBe(false);});
 it('keeps the lesson in the retained mission world instead of changing to the notebook-wide theme',()=>{
  const f=plan(),notebook={...f.notebook,theme:'ocean',gameDesign:{version:1 as const,inputRevision:'fixture',status:'ready' as const,provider:{id:'compatible',model:'fixture',endpointFingerprint:null},units:[],unavailableSources:[],receipts:[],generatedModels:[],batches:[{id:'batch',unitIds:[],status:'checked' as const,missions:[{id:'planned',unitId:'unit',kind:'sequence' as const,scaffoldId:'process-reconstruction',title:f.activity.title,objective:f.draft.objective,visualDirection:{scene:'workshop' as const,sourceAssetIds:[]}}],drafts:[{missionId:'planned',activity:f.activity,teaching:f.mission,audioDirection:{version:1 as const,playTrackId:'fixture-play',studyTrackId:'fixture-study',effectProfileId:'fixture-effect',effects:'off' as const}}],checks:[{missionId:'planned',decision:'retain' as const,reason:'Fixture retained mission.'}]}]}};
  const selected=SCAFFOLDS.find(s=>s.id==='process-reconstruction')!,p=buildLearningBriefing({notebook,activity:f.activity,scaffold:selected});expect(p.theme).toBe('workshop');expect(p.id).toBe(f.plan.id);
  const pending={...notebook,gameDesign:{...notebook.gameDesign,batches:notebook.gameDesign.batches.map(batch=>({...batch,status:'written' as const}))}};expect(buildLearningBriefing({notebook:pending,activity:f.activity,scaffold:selected}).theme).toBe('ocean');
 });
 it('keeps an AI explanation paired with all citations instead of choosing a document heading for reflection',()=>{
  const f=plan(),options=f.plan.practice.focusOptions;
  expect(options[0].explanation).toBe(f.mission.conceptExplanation.text);
  expect(options[0].references).toEqual(f.mission.conceptExplanation.citations);
  expect(options.slice(1).map(option=>option.explanation)).toEqual(f.mission.chunks.map(chunk=>chunk.text));
  for(const option of options)expect(option.references!.every(ref=>isCurrentEvidence(ref,f.notebook.sources))).toBe(true);
 });
 it('moves complete AI ideas directly to practice when there is no actual worked example, without bypassing the ideas or saved practice',()=>{
  const f=fixture(),source={...f.source,text:overview+'\n\nThe documented check reads an observation, compares it with the rule, and records the decision.'},activity={...f.activity,sourceRefs:[{sourceId:f.source.id,evidence:overview}]};
  const draft={...f.draft,workedExample:undefined,chunks:[{...f.draft.chunks[0],citations:[{sourceId:source.id,evidence:overview}]},{...f.draft.chunks[1],citations:[{sourceId:source.id,evidence:source.text.split('\n\n')[1]}]}]};
  const mission=validateAILearningMissionDraft(draft,{...f.context,sources:[source],activity,sourceWindow:{sourceId:source.id,start:0,end:source.text.length}});
  const notebook={...f.notebook,sources:[source],activities:[activity],aiLearningPlan:{version:1 as const,missions:[mission]}},p=buildLearningBriefing({notebook,activity,scaffold:SCAFFOLDS.find(s=>s.id==='process-reconstruction')!});
  expect(p.walkthrough.kind).toBe('source-reading');expect(lessonRequiresWalkthrough(p)).toBe(false);
  const initial=initialLessonState(p);expect(beginLessonPractice(p,initial)).toEqual(initial);
  const reading={...initial,stage:'context' as const,missionAccepted:true,viewedPassageIds:[lessonTeachingChunkIds(p)[0]]};expect(beginLessonPractice(p,reading).stage).toBe('context');
  const explored={...reading,viewedPassageIds:lessonTeachingChunkIds(p)},practice=beginLessonPractice(p,explored);
  expect(practice.stage).toBe('practice');expect(practice.walkthroughStep).toBe(0);expect(lessonReady(p,completeLesson(p,practice))).toBe(false);
  const prepared={...practice,practice:{...practice.practice,explanation:'I will keep observations connected to the supplied rule and evidence.',compared:true}},ready=completeLesson(p,prepared);
  expect(lessonReady(p,ready)).toBe(true);expect(initialLessonState(p,JSON.parse(JSON.stringify(ready)))).toEqual(ready);
  expect(lessonReady(p,{...ready,viewedPassageIds:[]})).toBe(false);
  expect(initialLessonState(p,{...explored,stage:'walkthrough'}).stage).toBe('practice');
 });
 it('requires teaching and walkthrough before a source kit can unlock the quest, saves chunk progress, and rejects forged completion',()=>{
  const {plan:p}=plan();const state=initialLessonState(p);expect(lessonRequiresWalkthrough(p)).toBe(true);expect(beginLessonRehearsal(p,state).rehearsal).toBeUndefined();const first={...state,stage:'context' as const,missionAccepted:true,viewedPassageIds:[lessonTeachingChunkIds(p)[0]]};expect(initialLessonState(p,JSON.parse(JSON.stringify(first)))).toEqual(first);expect(lessonContextReady(p,first)).toBe(false);
  const viewed={...first,viewedPassageIds:lessonTeachingChunkIds(p),walkthroughStep:p.walkthrough.steps.length};expect(lessonContextReady(p,viewed)).toBe(true);const kit=beginLessonRehearsal(p,viewed);kit.rehearsal={...kit.rehearsal!,checked:true,answers:Object.fromEntries(p.rehearsal!.slots.map(slot=>[slot.id,slot.acceptedTileIds[0]]))};const complete=completeLesson(p,kit);expect(lessonReady(p,complete)).toBe(true);expect(lessonReady(p,{...complete,viewedPassageIds:[]})).toBe(false);expect(lessonReady(p,{...complete,walkthroughStep:0})).toBe(false);
 });
 it('binds saved preparation to teaching text and clears obsolete approval without losing unchanged progress',()=>{
  const f=plan(),initial={...initialLessonState(f.plan),missionAccepted:true,stage:'context' as const,viewedPassageIds:[lessonTeachingChunkIds(f.plan)[0]]};expect(initialLessonState(f.plan,initial).viewedPassageIds).toEqual(initial.viewedPassageIds);
  const changed:AILearningMission={...f.mission,chunks:f.mission.chunks.map((chunk,i)=>i?chunk:{...chunk,text:'Inspect the supplied observation first.'})};const updated=buildLearningBriefing({notebook:{...f.notebook,aiLearningPlan:{version:1,missions:[changed]}},activity:f.activity,scaffold:SCAFFOLDS.find(s=>s.id==='process-reconstruction')!});expect(updated.id).not.toBe(f.plan.id);expect(initialLessonState(updated,initial).viewedPassageIds).toEqual([]);
 });
});
