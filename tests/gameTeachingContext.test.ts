import {afterEach,describe,expect,it,vi} from 'vitest';
import {createNotebook,createSource} from '../src/lib/utils';
import {buildDirectorSourceInventory,teachingContextWindow} from '../src/lib/gameDirectorSources';
import {validateAILearningMissionDraft,validateAILearningPlan} from '../src/lib/aiLearningPlan';
import {validateGameMissionProse,validateGameDesign} from '../src/lib/gameDesign';
import {validatePreparedGameDraft} from '../src/lib/gameDraftAdapters';
import {runGameDirector} from '../src/lib/gameDirector';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import {parsePackage,serializePackage} from '../src/lib/package';
import type {SequenceActivity} from '../src/lib/structuredEngine';

const definition='A delivery record lists the parcel label expected by the workshop. A label matches when its words are exactly the same as the delivery record. The workshop records a parcel as received only after this comparison.';
const procedure='1. Read the label on the parcel.\n2. Compare the label with the delivery record.\n3. Record the parcel as received if the label matches.\n\nWhen the label does not match, keep the parcel unrecorded and ask the sender to correct the delivery record. A readable label alone does not establish a match.';
function fixture(before=definition,after=''){
 const source={...createSource('# Receive a workshop parcel\n'+before+'\n\n# The receiving procedure has three steps in this order\n'+procedure+after,'Workshop guide'),id:'workshop-source'};
 const notebook=createNotebook({sources:[source]}),units=buildDirectorSourceInventory(notebook).units,unit=units.find(item=>item.excerpt.includes('1. Read the label'))!;
 const activity:SequenceActivity={version:1,id:'receiving',kind:'sequence',title:'Arrange the receiving steps',instruction:'Arrange the three stated steps.',explanation:'The label comparison precedes recording. Recording is conditional on a match.',hint:'Reading comes before comparing.',reviewStatus:'needs-review',sourceRefs:[{sourceId:source.id,evidence:procedure}],items:[{id:'read',label:'Read the label on the parcel.'},{id:'compare',label:'Compare the label with the delivery record.'},{id:'record',label:'Record the parcel as received if the label matches.'}],constraints:[{before:'read',after:'compare'},{before:'compare',after:'record'}]};
 const cite=(evidence:string)=>({sourceId:source.id,evidence});
 const draft={title:'Understand parcel receiving',objective:'Arrange the source procedure while retaining its matching condition.',conceptExplanation:{text:'Receiving is conditional: a readable label is insufficient. Its words must exactly match the delivery record before the parcel is recorded.',citations:[cite(definition)]},chunks:[{id:'compare',title:'Compare the words',text:'Compare the parcel label with the delivery record before recording receipt.',citations:[cite('Compare the label with the delivery record.')]},{id:'condition',title:'Keep the condition',text:'If the label does not match, leave the parcel unrecorded and request a correction.',citations:[cite('When the label does not match, keep the parcel unrecorded and ask the sender to correct the delivery record.')]}],guidedApplication:{prompt:'Arrange the stated steps. This quest checks their order.',steps:['Choose a step and use the move controls to place it.','Choose Check my work when the order is ready.']}};
 return{source,notebook,units,unit,activity,draft};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('bounded neighboring teaching context',()=>{
 it('discloses the preceding definition with exact intervening headings while preserving primary units',()=>{
  const f=fixture(),before=structuredClone(f.units),window=teachingContextWindow(f.unit,f.units,f.notebook);
  expect(f.units).toHaveLength(2);expect(window.start).toBe(f.units[0].start);expect(window.end).toBe(f.unit.end);
  expect(window.excerpt).toBe(f.source.text.slice(window.start,window.end));expect(window.excerpt).toContain(definition);expect(window.excerpt).toContain('# The receiving procedure');
  expect(f.units).toEqual(before);expect(f.unit.excerpt).not.toContain(definition);
 });
 it('keeps complete nearest neighbors, prioritizes preceding context, and never crosses a source',()=>{
  const paragraph=(name:string)=>`${name}: `+'A complete source explanation retains its stated conditions. '.repeat(42);
  const source=createSource('# Before\n'+paragraph('Before')+'\n\n# Primary\n'+paragraph('Primary')+'\n\n# Following\n'+paragraph('Following'));
  const other=createSource('An unrelated document definition must never enter the window.'),notebook=createNotebook({sources:[source,other]}),units=buildDirectorSourceInventory(notebook).units,own=units.filter(unit=>unit.sourceId===source.id);
  expect(own).toHaveLength(3);const result=teachingContextWindow(own[1],units,notebook);
  expect(result.start).toBe(own[0].start);expect(result.end).toBe(own[1].end);expect(result.excerpt.length).toBeLessThanOrEqual(6000);expect(result.excerpt).not.toContain('Following:');expect(result.excerpt).not.toContain(other.text);
 });
 it('includes a following qualification when it fits and stops at distant or fragmented neighbors',()=>{
  const f=fixture(definition,'\n\n# Exception\nThe comparison is limited to the record supplied for this parcel.');
  const window=teachingContextWindow(f.unit,f.units,f.notebook);expect(window.end).toBe(f.units.at(-1)!.end);expect(window.excerpt).toContain('limited to the record supplied');
  const fragmented=f.units.map((unit,index)=>index===0?{...unit,missionEligible:false,limitation:'This fragment needs its larger source context; use source study instead of inventing a standalone answer.'}:unit);
  expect(teachingContextWindow(f.unit,fragmented,f.notebook).start).toBe(f.unit.start);
  const distant=fixture(definition+'\n'.repeat(600));expect(teachingContextWindow(distant.unit,distant.units,distant.notebook).start).toBe(distant.unit.start);
  expect(()=>teachingContextWindow({...f.unit,end:f.unit.end+1},f.units,f.notebook)).toThrow(/current source unit/);
  expect(()=>teachingContextWindow(f.unit,[],f.notebook)).toThrow(/inventory/);
 });
 it('allows new teaching to explain the preceding definition while keeping activity scoring strictly in the primary unit',()=>{
  const f=fixture(),window=teachingContextWindow(f.unit,f.units,f.notebook),context={activity:f.activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:window};
  const teaching=validateAILearningMissionDraft(f.draft,context);
  expect(()=>validateGameMissionProse(f.unit,f.notebook,f.activity,teaching,f.units)).not.toThrow();expect(teaching.conceptExplanation.citations[0].quote).toBe(definition);
  expect(validateAILearningPlan({version:1,missions:[teaching]},{...f.notebook,activities:[f.activity]}).missions[0]).toEqual(teaching);
  expect(()=>validateAILearningMissionDraft(f.draft,{...context,sourceWindow:f.unit})).toThrow(/exact substring/);
  const leaked={...f.activity,sourceRefs:[{sourceId:f.source.id,evidence:definition}]};
  expect(()=>validatePreparedGameDraft(f.source,f.unit.excerpt,{activity:leaked},f.activity.id,['sequence'])).toThrow();
  expect(()=>validateGameMissionProse(f.unit,f.notebook,leaked,teaching,f.units)).toThrow(/primary/);
 });
 it('checks code at the actual teaching location even when code occurs only in neighboring context',()=>{
  const code='const secret = "do not infer a matching rule";',f=fixture(definition+'\n\n```js\n'+code+'\n```'),window=teachingContextWindow(f.unit,f.units,f.notebook);
  expect(f.unit.excerpt).not.toContain(code);expect(window.excerpt).toContain(code);
  const good=validateAILearningMissionDraft(f.draft,{activity:f.activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:window});
  expect(()=>validateGameMissionProse(f.unit,f.notebook,f.activity,good,f.units)).not.toThrow();
  const bad=validateAILearningMissionDraft({...f.draft,conceptExplanation:{text:'An unsupported inference from code.',citations:[{sourceId:f.source.id,evidence:code}]}},{activity:f.activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:window});
  expect(()=>validateGameMissionProse(f.unit,f.notebook,f.activity,bad,f.units)).toThrow(/non-code/);
  const primaryCode=fixture(definition,'\n\n```js\n'+code+'\n```'),widened=teachingContextWindow(primaryCode.unit,primaryCode.units,primaryCode.notebook);
  const lesson=validateAILearningMissionDraft(primaryCode.draft,{activity:primaryCode.activity,ageGroup:primaryCode.notebook.ageGroup,sources:primaryCode.notebook.sources,sourceWindow:widened});
  expect(()=>validateGameMissionProse(primaryCode.unit,primaryCode.notebook,primaryCode.activity,lesson,primaryCode.units)).not.toThrow();
 });
 it('rejects undisclosed wider windows instead of treating any exact same-source passage as permission',()=>{
  const f=fixture(),window=teachingContextWindow(f.unit,f.units,f.notebook),teaching=validateAILearningMissionDraft(f.draft,{activity:f.activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:window});
  const forged=structuredClone(teaching);forged.sourceWindows[0]={...forged.sourceWindows[0],start:0,quote:f.source.text.slice(0,window.end)};
  expect(()=>validateGameMissionProse(f.unit,f.notebook,f.activity,forged,f.units)).toThrow(/disclosed primary or neighboring/);
 });
});

describe('new writer disclosure and legacy ready compatibility',()=>{
 const config={provider:'compatible' as const,model:'context-test',apiKey:'session-only',baseUrl:'http://127.0.0.1:11434/v1'},options={ai:{config,consent:'create-game' as const}};
 it('writes a nearby definition into portable teaching without moving its scored evidence or repeating saved requests',async()=>{
  const f=fixture(),calls:{stage:string;data:any}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
   const request=JSON.parse(init.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data});
   let reply=directorFixtureResponse(stage,data);
   if(stage==='plan'){reply.missions=reply.missions.filter((item:any)=>item.unitId===f.unit.id);reply.study=[{unitId:f.units[0].id,reason:'The definition supports the following procedure lesson.'}];}
   if(stage==='write'){expect(data.missions[0].teachingContextWindow).toEqual(teachingContextWindow(f.unit,f.units,f.notebook));reply.missions[0].activity={...f.activity,id:'assistant-draft'};reply.missions[0].teaching=f.draft;}
   return{ok:true,json:async()=>({text:JSON.stringify(reply),usage:directorFixtureUsage})};
  }));
  const result=await runGameDirector(f.notebook,options);expect(result.status,result.message).toBe('ready');
  const saved=result.notebook.aiLearningPlan!.missions[0],design=result.notebook.gameDesign!;
  expect(saved.conceptExplanation.citations[0].quote).toBe(definition);expect(result.notebook.activities![0].sourceRefs).toEqual(f.activity.sourceRefs);expect(result.notebook.sources).toEqual(f.notebook.sources);
  expect(calls.find(call=>call.stage==='check')!.data.evidencePool.some((item:any)=>item.text.includes(definition))).toBe(true);
  const restored=parsePackage(serializePackage(result.notebook));expect(restored.aiLearningPlan).toEqual(result.notebook.aiLearningPlan);expect(validateGameDesign(design,restored)).toEqual(design);
  const previousCalls=calls.length,again=await runGameDirector(restored,{});expect(again.status).toBe('ready');expect(again.requestCount).toBe(0);expect(calls).toHaveLength(previousCalls);expect(again.notebook.gameDesign!.receipts).toEqual(design.receipts);
 });
 it('retains exact historical primary-only teaching, ready status, IDs and paid receipts',async()=>{
  const source=createSource('# Earlier context\nThe procedure retains the original settings before a reset is made.\n\n# Procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.');
  const input=createNotebook({sources:[source]}),units=buildDirectorSourceInventory(input).units,primary=units.find(unit=>unit.excerpt.includes('1. Open'))!;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const request=JSON.parse(init.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]),reply=directorFixtureResponse(stage,data);if(stage==='plan'){reply.missions=reply.missions.filter((item:any)=>item.unitId===primary.id);reply.study=units.filter(unit=>unit.id!==primary.id).map(unit=>({unitId:unit.id,reason:'Context retained for source study.'}));}return{ok:true,json:async()=>({text:JSON.stringify(reply),usage:directorFixtureUsage})};}));
  const result=await runGameDirector(input,options);expect(result.status,result.message).toBe('ready');
  const historical=structuredClone(result.notebook),draft=historical.gameDesign!.batches.flatMap(batch=>batch.drafts??[])[0],activity=draft.activity;
  const {activityId:_id,activityFingerprint:_fingerprint,ageGroup:_age,sourceWindows:_windows,reviewStatus:_review,...content}=draft.teaching;
  const {activityId:_guidedId,...guide}=content.guidedApplication;
  const citation=(reference:{sourceId:string;quote:string})=>({sourceId:reference.sourceId,evidence:reference.quote});
  const legacy=validateAILearningMissionDraft({...content,conceptExplanation:{...content.conceptExplanation,citations:content.conceptExplanation.citations.map(citation)},chunks:content.chunks.map(chunk=>({...chunk,citations:chunk.citations.map(citation)})),guidedApplication:guide},{activity,ageGroup:historical.ageGroup,sources:historical.sources,sourceWindow:primary});
  draft.teaching=legacy;historical.aiLearningPlan!.missions[0]=legacy;
  const before=JSON.stringify(historical),restored=parsePackage(serializePackage(historical));expect(restored.aiLearningPlan).toEqual(historical.aiLearningPlan);expect(validateGameDesign(historical.gameDesign,restored)).toEqual(historical.gameDesign);
  const callCount=vi.mocked(fetch).mock.calls.length,replay=await runGameDirector(restored,{});expect(replay.status).toBe('ready');expect(replay.requestCount).toBe(0);expect(vi.mocked(fetch).mock.calls).toHaveLength(callCount);expect(replay.notebook.gameDesign!.receipts).toEqual(historical.gameDesign!.receipts);expect(JSON.stringify(historical)).toBe(before);
 });
});
