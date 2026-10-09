import {afterEach,describe,expect,it,vi} from 'vitest';
import {gameCreationRecovery} from '../src/lib/gameCreationRecovery';
import {emptyGameDesign,validateGameDesign} from '../src/lib/gameDesign';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage as usage} from './gameDirector.fixture';

const failedPlan='A source-supported game plan could not be validated after one corrective attempt.';
const oldWriter='This mission could not be grounded in a valid model. The complete source section remains available for study.';
const config={provider:'compatible' as const,model:'new-designer',apiKey:'session-only',baseUrl:'http://127.0.0.1:11434/v1'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
function legacy(){
 const notebook=createNotebook({sources:[createSource(Array.from({length:4},(_,i)=>`# Maintenance procedure ${i+1}\n1. Open the settings panel ${i+1}.\n2. Choose the reset command ${i+1}.\n3. Confirm the selected reset ${i+1}.`).join('\n\n'),'Handbook')]}),design=emptyGameDesign(notebook,{id:'openai',model:'old-designer',endpointFingerprint:null});
 design.receipts=[{id:'historical-plan',stage:'plan',batchId:design.batches[0].id,provider:'openai',model:'old-designer',status:'completed',startedAt:'2026-10-01T12:00:00.000Z',finishedAt:'2026-10-01T12:00:01.000Z',durationMs:1000,usage}];
 design.status='ready';design.batches=design.batches.map((batch,index)=>({...batch,status:'checked',missions:[],drafts:[],checks:[],study:batch.unitIds.map((unitId,i)=>({unitId,reason:index===0&&i<2?failedPlan:'The source does not state a complete standalone model.'}))}));
 notebook.gameDesign=validateGameDesign(design,notebook);return parsePackage(serializePackage(notebook));
}
function provider(invalid=false){const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init.body),stage=body.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data,...body});return{ok:true,json:async()=>({text:JSON.stringify(invalid?{missions:[],study:[]}:directorFixtureResponse(stage,data)),usage})};}));return calls;}
afterEach(()=>vi.unstubAllGlobals());

describe('explicit recovery of legacy validation failures',()=>{
 it('identifies failed plan decisions without rewriting the saved notebook or treating genuine study as failure',()=>{
  const notebook=legacy(),before=structuredClone(notebook),recovery=gameCreationRecovery(notebook.gameDesign);
  expect(recovery.unitCount).toBe(2);expect(recovery.batches[0].unitIds).toEqual(notebook.gameDesign!.batches[0].unitIds.slice(0,2));expect(recovery.ambiguousWriterUnitIds).toEqual([]);expect(notebook).toEqual(before);
 });
 it('does not spend when opening or changing the model without an explicit failed-section retry',async()=>{
  const notebook=legacy(),calls=provider(),result=await prepareGameExperience(notebook,{},options);
  expect(result.creationStatus).toBe('failed');expect(result.ai.message).toContain('explicitly retry');expect(calls).toEqual([]);expect(result.notebook.gameDesign!.batches).toEqual(notebook.gameDesign!.batches);expect(result.notebook.gameDesign!.receipts).toEqual(notebook.gameDesign!.receipts);
  const disconnected=await prepareGameExperience(notebook,{}, {aiPolicy:'required',retryFailedSections:true});expect(disconnected.creationStatus).toBe('needs-connection');expect(calls).toEqual([]);
 });
 it('reopens only failed sections on explicit retry, retaining other decisions, sources and provider-attributed historical receipts',async()=>{
  const notebook=legacy(),original=structuredClone(notebook),calls=provider(),result=await prepareGameExperience(notebook,{}, {...options,retryFailedSections:true});
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(calls.map(call=>call.stage)).toEqual(['plan','write','write','check','overview']);
  expect(calls[0].data.units.map((unit:any)=>unit.unitId)).toEqual(original.gameDesign!.batches[0].unitIds.slice(0,2));expect(calls.every(call=>call.model==='new-designer')).toBe(true);
  expect(result.notebook.gameDesign!.batches[1]).toEqual(original.gameDesign!.batches[1]);expect(result.notebook.gameDesign!.batches[0].study).toEqual(original.gameDesign!.batches[0].study!.slice(2));expect(result.notebook.gameDesign!.receipts[0]).toEqual(original.gameDesign!.receipts[0]);expect(result.notebook.gameDesign!.receipts).toHaveLength(6);expect(result.notebook.aiLearningPlan!.missions).toHaveLength(2);expect(result.notebook.sources).toEqual(original.sources);
  expect(parsePackage(serializePackage(result.notebook)).gameDesign).toEqual(result.notebook.gameDesign);expect(gameCreationRecovery(result.notebook.gameDesign).unitCount).toBe(0);
 });
 it('stops a failed recovery after two responses and keeps the old decisions retryable',async()=>{
  const notebook=legacy(),calls=provider(true),result=await prepareGameExperience(notebook,{}, {...options,retryFailedSections:true});
  expect(result.creationStatus).toBe('failed');expect(calls).toHaveLength(2);expect(result.notebook.gameDesign!.batches).toEqual(notebook.gameDesign!.batches);expect(result.notebook.gameDesign!.receipts.slice(0,1)).toEqual(notebook.gameDesign!.receipts);expect(gameCreationRecovery(result.notebook.gameDesign).unitCount).toBe(2);
 });
 it('keeps ambiguous legacy writer outcomes untouched and requires a matching retained failed diagnostic',()=>{
  const notebook=legacy(),design=notebook.gameDesign!,batch=design.batches[0];batch.study![0].reason=oldWriter;batch.study![1].reason='A genuine source-study decision.';
  expect(gameCreationRecovery(design)).toMatchObject({unitCount:0,ambiguousWriterUnitIds:[batch.unitIds[0]]});
  design.events=[{id:'failed-writer',at:'2026-10-01T12:00:00.000Z',phase:'write',kind:'failed',category:'validation',batchId:batch.id,missionId:'old-mission',message:'Invalid cited model.'}];
  expect(gameCreationRecovery(design)).toMatchObject({unitCount:1,ambiguousWriterUnitIds:[]});
  batch.study![1].reason=oldWriter;expect(gameCreationRecovery(design)).toMatchObject({unitCount:0,ambiguousWriterUnitIds:batch.unitIds.slice(0,2)});
 });
});
