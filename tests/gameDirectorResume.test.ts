import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareGameExperience,type PreparationProgress} from '../src/lib/prepareGameExperience';
import {emptyGameDesign,gameDesignProgress,validateGameDesign,type GameDesign} from '../src/lib/gameDesign';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage as usage} from './gameDirector.fixture';

const config={provider:'compatible' as const,model:'source-designer',apiKey:'only-in-session',baseUrl:'http://127.0.0.1:11434/v1'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
const notebook=(count=1)=>createNotebook({sources:[createSource(Array.from({length:count},(_,i)=>`# Maintenance procedure ${i+1}\n1. Open the settings panel ${i+1}.\n2. Choose the reset command ${i+1}.\n3. Confirm the selected reset ${i+1}.`).join('\n\n'),'Maintenance handbook')]});
function request(body:any){const value=JSON.parse(body.body),stage=value.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(value.prompt.split('REFERENCE DATA (JSON):\n')[1]);return{...value,stage,data};}
const reply=(value:any)=>({ok:true,json:async()=>({text:JSON.stringify(value),usage})});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('creation resumes real mission work without a paid retry loop',()=>{
 it('allows a slow complete mission beyond the old120-second deadline and sends a bounded server deadline',async()=>{
  vi.useFakeTimers();let entered!:()=>void,release!:(value:any)=>void,settled=false;const started=new Promise<void>(resolve=>{entered=resolve;});const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'){entered();return new Promise(resolve=>{release=resolve;});}return reply(directorFixtureResponse(r.stage,r.data));}));
  const pending=prepareGameExperience(notebook(),{},options).then(result=>{settled=true;return result;});await started;await vi.advanceTimersByTimeAsync(125000);expect(settled).toBe(false);
  expect(requests[1]).toMatchObject({timeoutMs:295000,maxOutputTokens:8000});expect(requests[1].requestId).toMatch(/^request-[a-f0-9-]+$/);expect(requests[1].data.missions).toHaveLength(1);
  release(reply(directorFixtureResponse('write',requests[1].data)));const result=await pending;expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests).toHaveLength(4);
 });
 it('times out a stalled response body without an automatic retry or invented zero usage',async()=>{
  vi.useFakeTimers();let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let calls=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);calls++;if(r.stage==='write')return{ok:true,json:()=>{entered();return new Promise(()=>{});}};return reply(directorFixtureResponse(r.stage,r.data));}));
  const pending=prepareGameExperience(notebook(),{}, {...options,timeoutMs:1000});await started;await vi.advanceTimersByTimeAsync(1001);const result=await pending;
  expect(result.creationStatus).toBe('failed');expect(calls).toBe(2);expect(result.notebook.gameDesign!.receipts[1]).toMatchObject({status:'failed',usage:{inputTokens:null,outputTokens:null}});expect(result.notebook.gameDesign!.events?.at(-1)?.category).toBe('timeout');expect(result.notebook.gameDesign!.batches[0].study).toEqual([]);
 });
 it('never repairs or spends again when a durable mission save throws, and reports only committed progress',async()=>{
  let calls=0;const progress:PreparationProgress[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);calls++;return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(3),{}, {...options,onProgress:p=>progress.push(p),onCheckpoint:async d=>{if(d.batches[0].drafts?.length)throw new Error('storage write rejected');return true;}});
  expect(result.creationStatus).toBe('failed');expect(calls).toBe(2);expect(result.notebook.gameDesign!.batches[0].drafts).toHaveLength(1);expect(result.notebook.gameDesign!.events?.at(-1)?.category).toBe('storage');expect(progress.at(-1)).toMatchObject({stage:'blocked',percent:30,completedMissions:0});
 });
 it('retains a provider timeout without automatic spending or turning a valid source into study',async()=>{
  const requests:any[]=[];let timeout=true;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&timeout)return{ok:false,json:async()=>({code:'PROVIDER_TIMEOUT',usage:{status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null}})};return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(),{},options);expect(first.creationStatus).toBe('failed');expect(first.ai.requestCount).toBe(2);expect(first.notebook.gameDesign!.batches[0]).toMatchObject({status:'planned',study:[],drafts:[]});expect(first.notebook.gameDesign!.events?.at(-1)).toMatchObject({phase:'write',kind:'failed',category:'timeout'});
  timeout=false;const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','write','write','check','overview']);expect(second.notebook.gameDesign!.receipts).toHaveLength(5);expect(second.notebook.gameDesign!.receipts[1].usage.inputTokens).toBeNull();
 });
 it('saves one mission before a sibling connection failure, and resumes only unfinished missions after export/import',async()=>{
  let writes=0,fail=true;const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&++writes===2&&fail)throw new TypeError('fetch failed');return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(3),{},options);expect(first.creationStatus).toBe('failed');expect(requests).toHaveLength(3);const batch=first.notebook.gameDesign!.batches[0];expect(batch.status).toBe('planned');expect(batch.drafts).toHaveLength(1);expect(batch.study).toEqual([]);expect(first.notebook.gameDesign!.events?.at(-1)?.category).toBe('provider');expect(gameDesignProgress(first.notebook.gameDesign!)).toMatchObject({completedSteps:4,totalSteps:10,percent:40,completedMissions:1});
  const firstMission=batch.drafts![0].missionId;fail=false;const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');const resumed=requests.slice(3);expect(resumed.map(r=>r.stage)).toEqual(['write','write','check','overview']);expect(resumed.filter(r=>r.stage==='write').every(r=>r.data.missions.length===1&&r.data.missions[0].plan.id!==firstMission)).toBe(true);expect(second.notebook.aiLearningPlan?.missions).toHaveLength(3);
 });
 it('corrects one invalid model automatically using its local error while preserving every consumed receipt',async()=>{
  let writes=0;const prompts:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);prompts.push(r.prompt);if(r.stage==='write'&&++writes===1)value.missions[0].teaching.chunks[0].citations[0].evidence='Unsupported invented passage.';return reply(value);}));
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(result.ai.requestCount).toBe(5);expect(prompts[2]).toContain('LOCAL VALIDATION REPAIR:');expect(prompts[2].indexOf('LOCAL VALIDATION REPAIR:')).toBeLessThan(prompts[2].indexOf('REFERENCE DATA (JSON):'));expect(result.notebook.gameDesign!.events).toContainEqual(expect.objectContaining({phase:'write',kind:'retry',category:'validation'}));expect(result.notebook.gameDesign!.receipts.every(r=>r.usage.inputTokens===100)).toBe(true);
 });
 it('repairs explicit provider truncation once while keeping its reported paid usage',async()=>{
  let writes=0;const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&++writes===1)return{ok:false,status:422,json:async()=>({code:'PROVIDER_TRUNCATED',truncated:true,finishReason:'max_tokens',usage})};return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','write','write','check','overview']);expect(requests[2].prompt).toContain('Make this single mission and its teaching more concise');expect(result.notebook.gameDesign!.receipts[1]).toMatchObject({status:'failed',usage:{inputTokens:100,outputTokens:60}});
 });
 it('bounds repeated invalid content, keeps a valid sibling, and does not repeat declined missions on Continue',async()=>{
  let badMission:string|undefined;const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);requests.push(r);if(r.stage==='write'){badMission??=r.data.missions[0].plan.id;if(r.data.missions[0].plan.id===badMission)value.missions[0].activity.sourceRefs[0].evidence='Invented citation.';}return reply(value);}));
  const result=await prepareGameExperience(notebook(2),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','write','write','write','check','overview']);expect(result.notebook.aiLearningPlan?.missions).toHaveLength(1);expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({studyOnlyCount:1,missionCount:1,canResume:false,percent:100});
  const again=await prepareGameExperience(parsePackage(serializePackage(result.notebook)),{}, {aiPolicy:'required'});expect(again.creationStatus).toBe('ready');expect(again.ai.requestCount).toBe(0);expect(requests).toHaveLength(6);
 });
 it('finishes unsupported source disposition once without advertising an endless resume',async()=>{
  const fetch=vi.fn(async(_url,body)=>{const r=request(body);return reply(r.stage==='write'?{cannotBuild:'The evidence cannot justify the plan.'}:directorFixtureResponse(r.stage,r.data));});vi.stubGlobal('fetch',fetch);
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus).toBe('needs-source');expect(result.launch.kind).toBe('materials');expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({coveredUnits:1,studyOnlyCount:1,canResume:false});expect(result.notebook.gameDesign!.events?.at(-1)).toMatchObject({phase:'finish',kind:'source-study'});
  const again=await prepareGameExperience(result.notebook,{},options);expect(again.creationStatus).toBe('needs-source');expect(again.ai.requestCount).toBe(0);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('cancels after a durably saved first mission and preserves its nonzero stage progress',async()=>{
  const controller=new AbortController(),progress:PreparationProgress[]=[],checkpoints:GameDesign[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(3),{}, {...options,signal:controller.signal,onProgress:p=>progress.push(p),onCheckpoint:async d=>{checkpoints.push(d);if(d.batches[0]?.drafts?.length===1)controller.abort();return true;}});
  expect(result.creationStatus).toBe('canceled');expect(result.ai.requestCount).toBe(2);expect(parsePackage(serializePackage(result.notebook)).gameDesign!.batches[0].drafts).toHaveLength(1);expect(gameDesignProgress(checkpoints.at(-1)!)).toMatchObject({percent:40,canResume:true});const percentages=progress.flatMap(p=>p.percent===undefined?[]:[p.percent]);expect(percentages).toEqual([...percentages].sort((a,b)=>a-b));expect(percentages).not.toContain(100);
 });
 it('continues the correction after a request-budget pause instead of replaying the identical invalid prompt',async()=>{
  let writes=0;const prompts:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);prompts.push(r.prompt);if(r.stage==='write'&&++writes===1)value.missions[0].missionId='wrong-mission';return reply(value);}));
  const first=await prepareGameExperience(notebook(),{}, {...options,maxRequests:2});expect(first.creationStatus).toBe('incomplete');expect(first.notebook.gameDesign!.events?.at(-1)).toMatchObject({kind:'retry',category:'validation'});
  const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(prompts[2]).toContain('Keep the supplied missionId exactly');expect(prompts[2]).toContain('LOCAL VALIDATION REPAIR:');
 });
 it('validates bounded event metadata, clears source-stale diagnostics, and retains historical usage',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);return reply(directorFixtureResponse(r.stage,r.data));}));const result=await prepareGameExperience(notebook(),{},options),design=result.notebook.gameDesign!;
  expect(()=>validateGameDesign({...design,events:[{...design.events![0],prompt:'source text'}]},result.notebook)).toThrow(/unsupported/);expect(()=>validateGameDesign({...design,events:Array(121).fill(design.events![0])},result.notebook)).toThrow(/events/);expect(()=>validateGameDesign({...design,events:[{...design.events![0],category:'raw-provider-error'}]},result.notebook)).toThrow(/classification/);
  const changed={...result.notebook,sources:result.notebook.sources.map(s=>({...s,text:s.text+'\nA new source condition.'}))};const next=validateGameDesign(design,changed);expect(next.events).toBeUndefined();expect(next.receipts).toHaveLength(4);expect(gameDesignProgress(emptyGameDesign(notebook(),design.provider))).toMatchObject({percent:0,completedSteps:0});
 });
});
