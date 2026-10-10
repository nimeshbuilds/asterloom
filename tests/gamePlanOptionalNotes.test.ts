import {afterEach,describe,expect,it,vi} from 'vitest';
import {createNotebook,createSource} from '../src/lib/utils';
import {emptyGameDesign,validateGameBatchPlan,validateGameDesign,validateNewGameBatchPlan} from '../src/lib/gameDesign';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {parsePackage,serializePackage} from '../src/lib/package';
import {summarizeAIUsage} from '../src/lib/aiUsage';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import {scaffoldById} from '../src/data/scaffolds';

const config={provider:'compatible' as const,model:'plan-test',apiKey:'ephemeral',baseUrl:'http://127.0.0.1:11434/v1'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
function fixture(){
 const notebook=createNotebook({sources:[createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance handbook')]}),inventory=buildDirectorSourceInventory(notebook),design=emptyGameDesign(notebook,{id:config.provider,model:config.model,endpointFingerprint:null});
 const plan=directorFixtureResponse('plan',{choices:[{kind:'sequence',scaffoldId:'process-reconstruction',scene:scaffoldById('process-reconstruction')!.visual.scene}],units:inventory.units.map(unit=>({unitId:unit.id,excerpt:unit.excerpt,title:unit.title,missionEligible:unit.missionEligible}))});
 return{notebook,inventory,design,batch:design.batches[0],plan};
}
afterEach(()=>vi.unstubAllGlobals());
describe('fresh planning keeps optional summaries separate from mission evidence',()=>{
 it.each(['nonexact','escaped-newlines','undisclosed-unit','too-long','missing-coverage'] as const)('omits %s notes without losing or mutating the valid source-bound plan',fault=>{
  const {notebook,inventory,batch,plan}=fixture(),core=validateGameBatchPlan({missions:plan.missions,study:plan.study},batch,inventory.units,notebook);
  if(fault==='nonexact')plan.overviewNotes[0].summary.citations[0].evidence='An invented instruction.';
  if(fault==='escaped-newlines')plan.overviewNotes[0].summary.citations[0].evidence=inventory.units[0].excerpt.replaceAll('\n','\\n');
  if(fault==='undisclosed-unit')plan.overviewNotes[0].summary.citations[0].unitId='unseen-unit';
  if(fault==='too-long')plan.overviewNotes[0].summary.text='Unsupported detail. '.repeat(100);
  if(fault==='missing-coverage')plan.overviewNotes=[];
  const original=structuredClone(plan);
  expect(()=>validateGameBatchPlan(plan,batch,inventory.units,notebook)).toThrow();
  expect(validateNewGameBatchPlan(plan,batch,inventory.units,notebook)).toEqual(core);
  expect(plan).toEqual(original);
 });
 it('keeps valid optional notes with their exact located citations',()=>{
  const {notebook,inventory,batch,plan}=fixture();
  const result=validateNewGameBatchPlan(plan,batch,inventory.units,notebook);
  expect(result).toEqual(validateGameBatchPlan(plan,batch,inventory.units,notebook));
  expect(result.overviewNotes![0].summary!.citations[0].quote).toBe(inventory.units[0].excerpt);
 });
 it.each(['coverage','unknown-field','unknown-top-level','kind','scene','source-unit','aster-pose'] as const)('still rejects invalid core %s even when optional notes are invalid',fault=>{
  const {notebook,inventory,batch,plan}=fixture();plan.overviewNotes[0].summary.citations[0].evidence='Invented';
  if(fault==='coverage')plan.missions=[];
  if(fault==='unknown-field')plan.missions[0].answerKey='forged';
  if(fault==='unknown-top-level')plan.execute='forged';
  if(fault==='kind')plan.missions[0].kind='unimplemented-game';
  if(fault==='scene')plan.missions[0].visualDirection.scene='invented-world';
  if(fault==='source-unit')plan.missions[0].unitId='undisclosed-source-unit';
  if(fault==='aster-pose')plan.missions[0].asterDirection={welcome:'invented-expression'};
  expect(()=>validateNewGameBatchPlan(plan,batch,inventory.units,notebook)).toThrow();
 });
 it('names bounded unsupported schema keys for repair without exposing their values or arbitrary key text',()=>{
  const {notebook,inventory,batch,plan}=fixture();plan.missions[0].rationale='PRIVATE VALUE THAT MUST NOT BE ECHOED';
  expect(()=>validateNewGameBatchPlan(plan,batch,inventory.units,notebook)).toThrow('Mission plan contains an unsupported field: rationale.');
  plan.missions[0]['https://example.test/?access_token=private']='another private value';
  plan.missions[0]['sk-secret-in-a-property-name']='third private value';
  plan.missions[0]['many'.repeat(50)]='fourth private value';
  try{validateNewGameBatchPlan(plan,batch,inventory.units,notebook);throw Error('Expected rejection');}
  catch(error){const message=(error as Error).message;expect(message).toContain('rationale, [nonstandard key], [nonstandard key] (and more)');expect(message).not.toMatch(/PRIVATE VALUE|private value|access_token|sk-secret|https:/);expect(message.length).toBeLessThan(220);}
 });
 it('does not sanitize corrupted optional notes in saved designs',()=>{
  const {notebook,inventory,batch,design,plan}=fixture();
  Object.assign(design.batches[0],validateNewGameBatchPlan(plan,batch,inventory.units,notebook),{status:'planned'});
  const current=validateGameDesign(design,notebook);expect(current.batches[0].overviewNotes).toEqual(design.batches[0].overviewNotes);
  const forged=structuredClone(current);forged.batches[0].overviewNotes![0].summary!.citations[0].quote='Not in the source';
  expect(()=>validateGameDesign(forged,notebook)).toThrow();
  expect(validateGameDesign(current,notebook)).toEqual(current);
 });
 it('creates and packages the checked mission without a paid plan repair for a bad optional summary',async()=>{
  const {notebook}=fixture(),calls:{stage:string;data:any}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
   const request=JSON.parse(init.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data});
   const response=directorFixtureResponse(stage,data);if(stage==='plan')response.overviewNotes[0].summary.citations[0].evidence='Invented optional summary evidence.';
   return{ok:true,json:async()=>({text:JSON.stringify(response),usage:directorFixtureUsage})};
  }));
  const result=await prepareGameExperience(notebook,{},options);
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(calls.map(call=>call.stage)).toEqual(['plan','direction','write','check','overview']);
  expect(result.notebook.aiLearningPlan!.missions).toHaveLength(1);expect(result.notebook.gameDesign!.batches[0].overviewNotes).toBeUndefined();
  expect(result.notebook.sources).toEqual(notebook.sources);
  const design=result.notebook.gameDesign!,teaching=design.batches[0].drafts![0].teaching;
  expect(calls.at(-1)!.data.units[0].savedSummary).toEqual(teaching.conceptExplanation);
  expect(summarizeAIUsage(design.receipts)).toMatchObject({requests:5,input:{value:500},output:{value:300}});
  const restored=parsePackage(serializePackage(result.notebook));expect(restored.gameDesign).toEqual(design);expect(restored.aiLearningPlan).toEqual(result.notebook.aiLearningPlan);
 });
});
