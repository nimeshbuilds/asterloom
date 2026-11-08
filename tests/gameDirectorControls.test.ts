import {afterEach,describe,expect,it,vi} from 'vitest';
import {gameRuntimeControlPresentation,runGameDirector} from '../src/lib/gameDirector';
import {questDirections} from '../src/components/questDirections';
import {buildLessonActionGuide} from '../src/lib/lessonStory';
import {learnerControlWording} from '../src/lib/learnerWording';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import type {StructuredActivity} from '../src/lib/structuredEngine';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';

const options={ai:{config:{provider:'compatible' as const,model:'mock-controls',apiKey:'mock-session',baseUrl:'http://127.0.0.1:11434/v1'},consent:'create-game' as const}};
const input=()=>createNotebook({sources:[createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Public maintenance guide')]});
const steps=['Choose a step, then move it into position. Arrange opening the panel first.','Place choosing the reset command after opening the panel.','Keep confirming the selected reset after choosing the command.','Choose Check my work and compare the result with the taught order.'];
function mock(conflict=false){
 const calls:{stage:string;data:any;prompt:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init:any)=>{
  const {prompt}=JSON.parse(init.body),stage=prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data,prompt});
  const value=directorFixtureResponse(stage,data);
  if(stage==='write')for(const mission of value.missions){mission.activity.instruction='Choose a step, move it into position, then choose Check my work.';mission.teaching.guidedApplication.steps=conflict?[...steps.slice(0,3),'Choose Launch live terminal to execute the procedure.']:[...steps];}
  if(stage==='check'){
   for(const mission of data.missions){
    // Reproduce the live review's missing-control condition against the complete
    // presentation: generated source steps alone intentionally omit these names.
    expect(mission.teaching.guidedApplication.steps.join(' ')).not.toContain('Move earlier');
    expect(mission.renderedControls).toEqual({origin:'application',lessonFirstMove:'Choose a step card, then use Move earlier or Move later to put it in order.',questAction:'Choose a step card, then use Move earlier or Move later to put it in order.',commit:'Check my work'});
   }
   if(conflict)for(const check of value.checks){check.decision='source-study';check.quality.controlsMatch=false;check.reason='The proposed live terminal action is unavailable and contradicts the displayed controls.';}
  }
  return{ok:true,json:async()=>({text:JSON.stringify(value),usage:directorFixtureUsage})};
 }));return calls;
}
afterEach(()=>vi.unstubAllGlobals());

describe('source guidance plus the actual app control instructions',()=>{
 it('keeps every source-specific step and citation while disclosing exact controls to the writer and checker',async()=>{
  const calls=mock(),original=input(),first=await runGameDirector(original,{...options,maxRequests:3});expect(first.status).toBe('incomplete');
  const draft=structuredClone(first.notebook.gameDesign!.batches[0].drafts![0]),receipts=structuredClone(first.notebook.gameDesign!.receipts);
  expect(draft.teaching.guidedApplication.steps).toEqual(steps);
  const written=calls.find(call=>call.stage==='write')!;expect(written.data.missions[0].storyContext.actionGuide.act).toContain('Move earlier or Move later');
  const resumed=await runGameDirector(parsePackage(serializePackage(first.notebook)),options);expect(resumed.status,resumed.message).toBe('ready');
  expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','check','overview']);expect(resumed.notebook.gameDesign!.receipts.slice(0,3)).toEqual(receipts);
  expect(resumed.notebook.gameDesign!.batches[0].drafts![0]).toEqual(draft);expect(resumed.notebook.sources).toEqual(original.sources);
  const check=calls.find(call=>call.stage==='check')!;expect(check.prompt).toContain('COMPLETE displayed instructions');expect(check.prompt).toContain('Still reject any contradiction');expect(check.prompt).toContain('never subject evidence');
  const saved=parsePackage(serializePackage(resumed.notebook));expect(saved.aiLearningPlan!.missions[0].guidedApplication.steps).toEqual(steps);expect(saved.aiLearningPlan!.missions[0].chunks).toEqual(draft.teaching.chunks);expect(saved.aiLearningPlan!.missions[0].sourceWindows).toEqual(draft.teaching.sourceWindows);
 });
 it('does not hide contradictory generated steps or bypass a negative controls review',async()=>{
  const calls=mock(true),result=await runGameDirector(input(),options);expect(result.status).toBe('needs-source');expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','check']);
  const checked=calls.find(call=>call.stage==='check')!.data.missions[0];expect(checked.teaching.guidedApplication.steps.at(-1)).toBe('Choose Launch live terminal to execute the procedure.');
  expect(result.notebook.gameDesign!.batches[0].checks![0]).toMatchObject({decision:'source-study',quality:{controlsMatch:false}});expect(result.activityIds).toEqual([]);
 });
 it.each(['sequence','classification','dependency','completion','budget','construction','explanation','scenario','child-play','rule-switch'] as const)('uses the same implemented %s control helper as the lesson and quest',kind=>{
  const activity={kind,version:1,id:'control-check',title:'Control check',instruction:'A source-grounded task.',explanation:'Source reason.',hint:'Source hint.',sourceRefs:[],reviewStatus:'needs-review',...(kind==='sequence'?{items:Array(4)}:{})} as unknown as StructuredActivity;
  const guide=buildLessonActionGuide(activity),presentation=gameRuntimeControlPresentation(activity);
  expect(presentation).toEqual({origin:'application',lessonFirstMove:learnerControlWording(guide.act,false),questAction:questDirections(activity).action,commit:'Check my work'});
  expect(presentation.lessonFirstMove).toBeTruthy();expect(presentation.questAction).toBeTruthy();
 });
 it('keeps large legacy placement controls and specialized controls instead of inventing sequence buttons',()=>{
  const base={version:1,id:'old',title:'Saved task',instruction:'Saved instructions.',explanation:'Saved reason.',hint:'Saved hint.',sourceRefs:[],reviewStatus:'needs-review'} as const;
  const large={...base,kind:'sequence',items:Array(25),constraints:[]} as StructuredActivity;expect(gameRuntimeControlPresentation(large).questAction).toContain('Place here');expect(gameRuntimeControlPresentation(large).questAction).not.toContain('Move earlier');
  const dependency={...base,kind:'dependency',nodes:[],edges:[],acyclic:true} as StructuredActivity;expect(gameRuntimeControlPresentation(dependency).questAction).toContain('Connect concepts');
  const reflection={...base,kind:'rubric',mode:'self-assessment'} as unknown as StructuredActivity;expect(gameRuntimeControlPresentation(reflection).commit).toBe('Save my reflection');
 });
});
