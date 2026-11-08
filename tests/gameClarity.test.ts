import {afterEach,describe,expect,it,vi} from 'vitest';
import {validateNewMissionClarity} from '../src/lib/gameClarity';
import {validateGameBatchChecks} from '../src/lib/gameDesign';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {createNotebook,createSource} from '../src/lib/utils';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import {parsePackage,serializePackage} from '../src/lib/package';
const config={provider:'compatible' as const,model:'clarity-review',apiKey:'session-only',baseUrl:'http://127.0.0.1:11434/v1'},options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
const input=()=>createNotebook({sources:[createSource('# Reset procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Procedure')]});
function provider(transform:(stage:string,value:any,call:number)=>any){const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init.body),stage=body.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,prompt:body.prompt});return{ok:true,json:async()=>({text:JSON.stringify(transform(stage,directorFixtureResponse(stage,data),calls.filter(call=>call.stage===stage).length)),usage:directorFixtureUsage})};}));return calls;}
afterEach(()=>vi.unstubAllGlobals());
describe('learner readiness before generated gameplay',()=>{
 it('keeps a planning objective bounded instead of accepting an entire lesson in that field',async()=>{
  const calls=provider((stage,value,call)=>{if(stage==='plan'&&call===1)value.missions[0].objective='Teach every condition and interaction in this planning objective. '.repeat(9);return value;});
  const notebook=input(),result=await prepareGameExperience(notebook,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(calls.map(call=>call.stage)).toEqual(['plan','plan','direction','write','check','overview']);expect(result.notebook.gameDesign!.batches[0].missions![0].objective.length).toBeLessThanOrEqual(400);expect(calls[1].prompt).toContain('Invalid mission objective');expect(result.notebook.sources).toEqual(notebook.sources);expect(result.notebook.gameDesign!.receipts).toHaveLength(6);
  expect(calls[0].prompt).toContain('Planning scope only');expect(calls[0].prompt).not.toContain('Learner-readiness contract:');expect(calls.find(call=>call.stage==='write')!.prompt).toContain('Learner-readiness contract:');
 });
 it('omits double-escaped optional summary citations without discarding the plan or rewriting source bytes',async()=>{
  const calls=provider((stage,value,call)=>{if(stage==='plan'&&call===1)for(const note of value.overviewNotes)if(note.summary)for(const ref of note.summary.citations)ref.evidence=ref.evidence.replaceAll('\n','\\n');return value;});
  const notebook=input(),result=await prepareGameExperience(notebook,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','check','overview']);expect(result.notebook.sources).toEqual(notebook.sources);expect(result.notebook.gameDesign!.batches[0].overviewNotes).toBeUndefined();const quote=result.notebook.gameDesign!.batches[0].drafts![0].teaching.conceptExplanation.citations[0].quote;expect(quote).toContain('\n');expect(quote).not.toContain('\\n');expect(result.notebook.gameDesign!.receipts).toHaveLength(5);expect(parsePackage(serializePackage(result.notebook)).gameDesign).toEqual(result.notebook.gameDesign);
 });
 it('repairs a concrete incomprehensible action prompt without changing its source or answer rules',async()=>{
  const calls=provider((stage,value,call)=>{if(stage==='write'&&call===1)value.missions[0].activity.instruction='Inspect the source-supported purpose and membership feedback.';return value;});
  const notebook=input(),result=await prepareGameExperience(notebook,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','write','check','overview']);expect(calls[3].prompt).toContain('Replace authoring jargon');
  const activity=result.notebook.activities!.find(activity=>activity.id===result.ai.activityId)!;expect(activity.instruction).toBe('Arrange the documented maintenance steps.');expect(activity.kind==='sequence'&&activity.constraints).toEqual([{before:'open',after:'choose'},{before:'choose',after:'confirm'}]);expect(result.notebook.sources).toEqual(notebook.sources);expect(result.notebook.gameDesign!.receipts).toHaveLength(6);
 });
 it.each(['understandable','lessonSupportsTask','controlsMatch','feedbackExplains'])('will not publish a task when review says %s is false, even with exact source citations',async(flag)=>{
  provider((stage,value)=>{if(stage==='check')value.checks=value.checks.map((check:any)=>({...check,quality:{...check.quality,[flag]:false}}));return value;});
  const notebook=input(),result=await prepareGameExperience(notebook,{},options);expect(result.creationStatus).toBe('failed');expect(result.ai.activityIds).toEqual([]);expect(result.notebook.gameDesign!.batches[0].status).toBe('written');expect(result.notebook.gameDesign!.batches[0].checks).toBeUndefined();expect(result.notebook.gameDesign!.batches[0].drafts).toHaveLength(1);expect(result.notebook.gameDesign!.receipts.filter(receipt=>receipt.stage==='check')).toHaveLength(2);expect(result.notebook.sources).toEqual(notebook.sources);
 });
 it('retains an explicit teaching gap as reading-only material rather than inventing a missing prerequisite',async()=>{
  const calls=provider((stage,value)=>{if(stage==='check')value.checks=value.checks.map((check:any)=>({...check,decision:'source-study',reason:'The task requires a distinction that the prepared lesson never explains.',quality:{...check.quality,lessonSupportsTask:false}}));return value;});
  const result=await prepareGameExperience(input(),{},options);expect(result.creationStatus).toBe('needs-source');expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','check']);const check=result.notebook.gameDesign!.batches[0].checks![0];expect(check.quality?.lessonSupportsTask).toBe(false);expect(check.reason).toContain('never explains');expect(parsePackage(serializePackage(result.notebook)).gameDesign!.batches[0].checks).toEqual([check]);
 });
 it('requires explicit checks for new reviews but preserves old portable check records',()=>{
  const batch={id:'batch',unitIds:['unit'],status:'written' as const,drafts:[{missionId:'mission'} as any]},old={checks:[{missionId:'mission',decision:'retain',reason:'Previously retained source model.'}]};expect(validateGameBatchChecks(old,batch)).toEqual(old.checks);expect(()=>validateGameBatchChecks(old,batch,true)).toThrow(/readiness/);
 });
 it('targets action jargon and nonexistent controls without banning legitimate technical concepts',()=>{
  const teaching:any={objective:'Understand set membership.',guidedApplication:{prompt:'Connect each relation.',steps:['Select both concepts and attach the relation label.']}};
  expect(()=>validateNewMissionClarity({kind:'dependency',instruction:'Connect the concepts.',hint:'Match the named relationship.'} as any,teaching)).toThrow(/Connect concepts/);
  teaching.guidedApplication.steps=['Choose the starting concept, relationship and target, then press Connect concepts.'];expect(()=>validateNewMissionClarity({kind:'dependency',instruction:'Connect the concepts.',hint:'Match the named relationship.'} as any,teaching)).not.toThrow();
  expect(()=>validateNewMissionClarity({kind:'classification',instruction:'Classify set membership.',hint:'Use the membership rule.'} as any,{...teaching,objective:'Explain source-supported claims in this research-methods lesson.'})).not.toThrow();
 });
});
