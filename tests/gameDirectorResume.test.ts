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
 it('requests Codex structured output at each supported stage and normalizes only optional null fields',async()=>{
  const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{
   const r=request(body);requests.push(r);const value=directorFixtureResponse(r.stage,r.data);
   if(r.stage==='plan')for(const mission of value.missions)mission.asterDirection=null;
   if(r.stage==='write'){value.cannotBuild=null;for(const mission of value.missions){mission.teaching.workedExample=null;mission.teaching.storyFrame=null;}}
   if(r.stage==='direction')value.nativeTemplateId=null;
   if(r.stage==='overview')value.cannotSummarize=null;
   return reply(value);
  }));
  const result=await prepareGameExperience(notebook(),{}, {...options,ai:{config:{provider:'chatgpt',model:'gpt-6.1-sol',apiKey:''},consent:'create-game'}});
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','check','overview']);
  for(const r of requests){expect(r.outputSchema).toMatchObject({type:'object',additionalProperties:false});expect(r.prompt).toContain('use null for absence');expect(r.prompt).toContain(`STRUCTURED REQUIRED ROOT KEYS: ${JSON.stringify(r.outputSchema.required)}.`);}
  expect(result.notebook.gameDesign!.receipts.every(r=>r.validation==='accepted')).toBe(true);
  expect(parsePackage(serializePackage(result.notebook)).gameDesign!.receipts).toEqual(result.notebook.gameDesign!.receipts);
 });
 it('repairs an ambiguous adapter final once, retaining its measured usage and saved work',async()=>{
  let calls=0;const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{
   const r=request(body);requests.push(r);
   if(++calls===1)return{ok:false,status:502,json:async()=>({code:'PROVIDER_INVALID_RESPONSE',usage})};
   return reply(directorFixtureResponse(r.stage,r.data));
  }));
  const result=await prepareGameExperience(notebook(),{},options);
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','plan','direction','write','check','overview']);
  expect(requests[1].prompt).toContain('one unambiguous final answer');expect(requests[0].outputSchema).toBeUndefined();
  expect(result.notebook.gameDesign!.receipts[0]).toMatchObject({status:'failed',validation:'rejected',usage});
  expect(result.notebook.gameDesign!.receipts.slice(1).every(r=>r.validation==='accepted')).toBe(true);
 });
 it('does not invent a plan from partial JSON, and resumes the saved stage with precise format feedback',async()=>{
  let fail=true;const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{
   const r=request(body);requests.push(r);
   return fail?{ok:true,json:async()=>({text:'{"missions":[',usage})}:reply(directorFixtureResponse(r.stage,r.data));
  }));
  const first=await prepareGameExperience(notebook(),{},options);
  expect(first.creationStatus).toBe('failed');expect(first.ai.requestCount).toBe(2);expect(first.ai.message).toContain('unfinished JSON');
  expect(first.notebook.gameDesign!.batches[0].status).toBe('pending');expect(first.notebook.gameDesign!.receipts.every(r=>r.validation==='rejected')).toBe(true);
  const saved=parsePackage(serializePackage(first.notebook));fail=false;
  const resumed=await prepareGameExperience(saved,{},options);
  expect(resumed.creationStatus,resumed.ai.message).toBe('ready');expect(requests[2].prompt).toContain('unfinished JSON');
  expect(resumed.notebook.gameDesign!.receipts.slice(0,2)).toEqual(saved.gameDesign!.receipts);
 });
 it('allows a slow complete mission beyond the old120-second deadline and sends a bounded server deadline',async()=>{
  vi.useFakeTimers();let entered!:()=>void,release!:(value:any)=>void,settled=false;const started=new Promise<void>(resolve=>{entered=resolve;});const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'){entered();return new Promise(resolve=>{release=resolve;});}return reply(directorFixtureResponse(r.stage,r.data));}));
  const pending=prepareGameExperience(notebook(),{},options).then(result=>{settled=true;return result;});await started;await vi.advanceTimersByTimeAsync(125000);expect(settled).toBe(false);
  const writing=requests.find(r=>r.stage==='write')!;expect(writing).toMatchObject({timeoutMs:295000,maxOutputTokens:8000});expect(writing.requestId).toMatch(/^request-[a-f0-9-]+$/);expect(writing.data.missions).toHaveLength(1);
  release(reply(directorFixtureResponse('write',writing.data)));const result=await pending;expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests).toHaveLength(5);
 });
 it('times out a stalled response body without an automatic retry or invented zero usage',async()=>{
  vi.useFakeTimers();let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let calls=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);calls++;if(r.stage==='write')return{ok:true,json:()=>{entered();return new Promise(()=>{});}};return reply(directorFixtureResponse(r.stage,r.data));}));
  const pending=prepareGameExperience(notebook(),{}, {...options,timeoutMs:1000});await started;await vi.advanceTimersByTimeAsync(1001);const result=await pending;
  expect(result.creationStatus).toBe('failed');expect(calls).toBe(3);expect(result.notebook.gameDesign!.receipts.find(r=>r.stage==='write')!).toMatchObject({status:'failed',usage:{inputTokens:null,outputTokens:null}});expect(result.notebook.gameDesign!.events?.at(-1)?.category).toBe('timeout');expect(result.notebook.gameDesign!.batches[0].study).toEqual([]);
 });
 it('never repairs or spends again when a durable mission save throws, and reports only committed progress',async()=>{
  let calls=0;const progress:PreparationProgress[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);calls++;return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(3),{}, {...options,onProgress:p=>progress.push(p),onCheckpoint:async d=>{if(d.batches[0].drafts?.length)throw new Error('storage write rejected');return true;}});
  expect(result.creationStatus).toBe('failed');expect(calls).toBe(3);expect(result.notebook.gameDesign!.batches[0].drafts).toHaveLength(1);expect(result.notebook.gameDesign!.events?.at(-1)?.category).toBe('storage');expect(progress.at(-1)).toMatchObject({stage:'blocked',percent:36,completedMissions:0});
 });
 it('retains a provider timeout without automatic spending or turning a valid source into study',async()=>{
  const requests:any[]=[];let timeout=true;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&timeout)return{ok:false,json:async()=>({code:'PROVIDER_TIMEOUT',usage:{status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null}})};return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(),{},options);expect(first.creationStatus).toBe('failed');expect(first.ai.requestCount).toBe(3);expect(first.notebook.gameDesign!.batches[0]).toMatchObject({status:'planned',study:[],drafts:[]});expect(first.notebook.gameDesign!.events?.at(-1)).toMatchObject({phase:'write',kind:'failed',category:'timeout'});
  timeout=false;const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','write','check','overview']);expect(second.notebook.gameDesign!.receipts).toHaveLength(6);expect(second.notebook.gameDesign!.receipts.find(r=>r.stage==='write')!.usage.inputTokens).toBeNull();
 });
 it('saves one mission before a sibling connection failure, and resumes only unfinished missions after export/import',async()=>{
  let writes=0,fail=true;const requests:any[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&++writes===2&&fail)throw new TypeError('fetch failed');return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(3),{},options);expect(first.creationStatus).toBe('failed');expect(requests).toHaveLength(4);const batch=first.notebook.gameDesign!.batches[0];expect(batch.status).toBe('planned');expect(batch.drafts).toHaveLength(1);expect(batch.study).toEqual([]);expect(first.notebook.gameDesign!.events?.at(-1)?.category).toBe('provider');expect(gameDesignProgress(first.notebook.gameDesign!)).toMatchObject({completedSteps:5,totalSteps:11,percent:45,completedMissions:1});
  const firstMission=batch.drafts![0].missionId;fail=false;const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');const resumed=requests.slice(4);expect(resumed.map(r=>r.stage)).toEqual(['write','write','check','overview']);expect(resumed.filter(r=>r.stage==='write').every(r=>r.data.missions.length===1&&r.data.missions[0].plan.id!==firstMission)).toBe(true);expect(second.notebook.aiLearningPlan?.missions).toHaveLength(3);
 });
 it('corrects one invalid model automatically using its local error while preserving every consumed receipt',async()=>{
  let writes=0;const prompts:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);prompts.push(r.prompt);if(r.stage==='write'&&++writes===1)value.missions[0].teaching.chunks[0].citations[0].evidence='Unsupported invented passage.';return reply(value);}));
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(result.ai.requestCount).toBe(6);expect(prompts[3]).toContain('LOCAL VALIDATION REPAIR:');expect(prompts[3].indexOf('LOCAL VALIDATION REPAIR:')).toBeLessThan(prompts[3].indexOf('REFERENCE DATA (JSON):'));expect(result.notebook.gameDesign!.events).toContainEqual(expect.objectContaining({phase:'write',kind:'retry',category:'validation'}));expect(result.notebook.gameDesign!.receipts.every(r=>r.usage.inputTokens===100)).toBe(true);
 });
 it('repairs explicit provider truncation once while keeping its reported paid usage',async()=>{
  let writes=0;const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&++writes===1)return{ok:false,status:422,json:async()=>({code:'PROVIDER_TRUNCATED',truncated:true,finishReason:'max_tokens',usage})};return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','write','check','overview']);expect(requests[3].prompt).toContain('Make this single mission and its teaching more concise');expect(result.notebook.gameDesign!.receipts[2]).toMatchObject({status:'failed',usage:{inputTokens:100,outputTokens:60}});
 });
 it('stops after two invalid responses while preserving a valid sibling, then explicitly resumes only unfinished work',async()=>{
  const requests:any[]=[];let invalid=true,writes=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);requests.push(r);if(r.stage==='write'&&++writes>1&&invalid)value.missions[0].activity.sourceRefs[0].evidence='Invented citation.';return reply(value);}));
  const result=await prepareGameExperience(notebook(3),{},options);expect(result.creationStatus).toBe('failed');expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','write','write']);
  const saved=parsePackage(serializePackage(result.notebook)),draft=saved.gameDesign!.batches[0].drafts![0],receipts=structuredClone(saved.gameDesign!.receipts);
  expect(saved.gameDesign!.batches[0].drafts).toHaveLength(1);expect(saved.gameDesign!.batches[0].missions).toHaveLength(3);expect(saved.gameDesign!.batches[0].study).toEqual([]);expect(result.ai.message).toContain('does not mean your material cannot make a game');
  const missingConnection=await prepareGameExperience(saved,{}, {aiPolicy:'required'});expect(missingConnection.creationStatus).toBe('needs-connection');expect(requests).toHaveLength(5);
  invalid=false;const nextConfig={...config,model:'corrected-model'},again=await prepareGameExperience(saved,{}, {...options,ai:{config:nextConfig,consent:'create-game'}});
  expect(again.creationStatus,again.ai.message).toBe('ready');expect(requests.slice(5).map(r=>r.stage)).toEqual(['write','write','check','overview']);expect(requests.slice(5).every(r=>r.model==='corrected-model')).toBe(true);
  expect(again.notebook.gameDesign!.batches[0].drafts![0]).toEqual(draft);expect(again.notebook.gameDesign!.receipts.slice(0,5)).toEqual(receipts);expect(again.notebook.aiLearningPlan?.missions).toHaveLength(3);expect(again.notebook.sources).toEqual(saved.sources);
 });
 it('gives each explicit resumed stage two bounded attempts even after earlier validation failures',async()=>{
  const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);return reply({missions:[],study:[]});}));
  const first=await prepareGameExperience(notebook(9),{},options);expect(first.creationStatus).toBe('failed');expect(requests).toHaveLength(2);
  const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus).toBe('failed');expect(second.ai.requestCount).toBe(2);expect(requests).toHaveLength(4);
  expect(second.notebook.gameDesign!.receipts.slice(0,2)).toEqual(first.notebook.gameDesign!.receipts);expect(second.notebook.gameDesign!.batches.every(batch=>batch.status==='pending'&&!batch.study)).toBe(true);
  expect(requests[2].prompt).toContain('explicit new attempt');expect(requests[3].prompt).toContain('final automatic repair attempt for this run');
 });
 it.each(['', '   ', 'x'.repeat(501)])('does not turn a malformed writer refusal into a source-study decision (%#)',async(reason)=>{
  const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);calls.push(r.stage);return reply(r.stage==='write'?{cannotBuild:reason}:directorFixtureResponse(r.stage,r.data));}));
  const input=notebook(),result=await prepareGameExperience(input,{},options);
  expect(result.creationStatus).toBe('failed');expect(calls).toEqual(['plan','direction','write','write']);expect(result.ai.message).toContain('cannotBuild needs a nonempty reason');expect(result.notebook.gameDesign!.batches[0].status).toBe('planned');expect(result.notebook.gameDesign!.batches[0].study).toEqual([]);expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.gameDesign!.receipts).toHaveLength(4);
 });
 it('finishes unsupported source disposition once without advertising an endless resume',async()=>{
  const fetch=vi.fn(async(_url,body)=>{const r=request(body);return reply(r.stage==='write'?{cannotBuild:'The evidence cannot justify the plan.'}:directorFixtureResponse(r.stage,r.data));});vi.stubGlobal('fetch',fetch);
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus).toBe('needs-source');expect(result.launch.kind).toBe('materials');expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({coveredUnits:1,studyOnlyCount:1,canResume:false});expect(result.notebook.gameDesign!.events?.at(-1)).toMatchObject({phase:'finish',kind:'source-study'});
  const again=await prepareGameExperience(result.notebook,{},options);expect(again.creationStatus).toBe('needs-source');expect(again.ai.requestCount).toBe(0);expect(fetch).toHaveBeenCalledTimes(3);
 });
 it('cancels after a durably saved first mission and preserves its nonzero stage progress',async()=>{
  const controller=new AbortController(),progress:PreparationProgress[]=[],checkpoints:GameDesign[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);return reply(directorFixtureResponse(r.stage,r.data));}));
  const result=await prepareGameExperience(notebook(3),{}, {...options,signal:controller.signal,onProgress:p=>progress.push(p),onCheckpoint:async d=>{checkpoints.push(d);if(d.batches[0]?.drafts?.length===1)controller.abort();return true;}});
  expect(result.creationStatus).toBe('canceled');expect(result.ai.requestCount).toBe(3);expect(parsePackage(serializePackage(result.notebook)).gameDesign!.batches[0].drafts).toHaveLength(1);expect(gameDesignProgress(checkpoints.at(-1)!)).toMatchObject({percent:45,canResume:true});const percentages=progress.flatMap(p=>p.percent===undefined?[]:[p.percent]);expect(percentages).toEqual([...percentages].sort((a,b)=>a-b));expect(percentages).not.toContain(100);
 });
 it('pauses an in-flight write, rejects its late response and resumes only unfinished work with a different provider',async()=>{
  const controller=new AbortController(),input=notebook(3),requests:any[]=[];let entered!:()=>void,release!:(value:any)=>void,transport:AbortSignal|undefined;
  const started=new Promise<void>(resolve=>{entered=resolve;});let writes=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);requests.push(r);if(r.stage==='write'&&++writes===2){transport=body.signal;entered();return new Promise(resolve=>{release=resolve;});}return{ok:true,json:async()=>({text:JSON.stringify(directorFixtureResponse(r.stage,r.data)),usage,actualModels:[`${r.model}-actual`]})};}));
  const pending=prepareGameExperience(input,{}, {...options,signal:controller.signal});await started;controller.abort('pause');const first=await pending;
  expect(first.creationStatus).toBe('paused');expect(transport!.aborted).toBe(true);expect(first.notebook.gameDesign).toMatchObject({status:'preparing',control:'paused'});expect(first.notebook.gameDesign!.events?.at(-1)?.kind).toBe('paused');
  const saved=parsePackage(serializePackage(first.notebook)),draft=saved.gameDesign!.batches[0].drafts![0],receipts=structuredClone(saved.gameDesign!.receipts);
  expect(saved.gameDesign!.batches[0].drafts).toHaveLength(1);expect(receipts).toHaveLength(4);expect(receipts[3]).toMatchObject({provider:'compatible',model:config.model,status:'canceled',usage:{inputTokens:null,outputTokens:null}});expect(receipts[0].actualModels).toEqual([`${config.model}-actual`]);
  const before=JSON.stringify(saved);release(reply(directorFixtureResponse('write',requests[3].data)));await Promise.resolve();expect(JSON.stringify(saved)).toBe(before);expect(requests).toHaveLength(4);
  const nextConfig={provider:'anthropic' as const,model:'next-designer',apiKey:'session-only'};
  const second=await prepareGameExperience(saved,{}, {...options,ai:{config:nextConfig,consent:'create-game'}});
  expect(second.creationStatus,second.ai.message).toBe('ready');expect(second.notebook.gameDesign!.control).toBeUndefined();expect(second.notebook.sources).toEqual(saved.sources);
  expect(second.notebook.gameDesign!.batches[0].drafts![0]).toEqual(draft);expect(second.notebook.gameDesign!.receipts.slice(0,4)).toEqual(receipts);expect(requests.slice(4).map(r=>r.stage)).toEqual(['write','write','check','overview']);
  expect(requests.slice(4).every(r=>r.provider==='anthropic'&&r.model==='next-designer')).toBe(true);expect(second.notebook.gameDesign!.receipts.slice(4).every(r=>r.provider==='anthropic'&&r.actualModels?.[0]==='next-designer-actual')).toBe(true);
  expect(second.notebook.gameDesign!.batches[0].drafts![0].activity.id).toBe(draft.activity.id);expect(second.notebook.gameDesign!.receipts.reduce((n,r)=>n+(r.usage.inputTokens??0),0)).toBe(700);
 });
 it('stops after a completed check checkpoint before building the overview or announcing ready',async()=>{
  const controller=new AbortController(),stages:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);stages.push(r.stage);return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(),{}, {...options,signal:controller.signal,onCheckpoint:async d=>{if(d.batches.every(b=>b.status==='checked'))controller.abort('pause');return true;}});
  expect(first.creationStatus).toBe('paused');expect(stages).toEqual(['plan','direction','write','check']);expect(first.notebook.gameDesign!.control).toBe('paused');expect(first.notebook.gameDesign!.overview).toBeUndefined();expect(first.ai.activityIds).toEqual([]);
  const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus).toBe('ready');expect(stages).toEqual(['plan','direction','write','check','overview']);
 });
 it('does not reuse stale source work or accept forged cached evidence during a provider switch',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);return reply(directorFixtureResponse(r.stage,r.data));}));
  const first=await prepareGameExperience(notebook(),{}, {...options,maxRequests:3}),saved=parsePackage(serializePackage(first.notebook));expect(saved.gameDesign!.control).toBe('paused');
  const forged=structuredClone(saved);forged.gameDesign!.batches[0].drafts![0].activity.sourceRefs[0].evidence='A nonexistent source instruction.';
  const switched={...options,ai:{config:{...config,model:'next-model'},consent:'create-game' as const}};
  const rejected=await prepareGameExperience(forged,{},switched);expect(rejected.creationStatus).toBe('failed');expect(rejected.ai.requestCount).toBe(0);
  const revised={...saved,sources:saved.sources.map(source=>({...source,text:source.text+'\n4. Close the settings panel.'}))};
  const replan=await prepareGameExperience(revised,{}, {...switched,maxRequests:1});expect(replan.ai.requestCount).toBe(1);expect(replan.notebook.gameDesign!.receipts.at(-1)?.stage).toBe('plan');expect(replan.notebook.gameDesign!.batches[0].drafts).toHaveLength(0);expect(replan.notebook.gameDesign!.receipts.slice(0,3)).toEqual(saved.gameDesign!.receipts);
 });
 it('does not claim a saved pause when the interruption checkpoint fails',async()=>{
  const controller=new AbortController();let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});vi.stubGlobal('fetch',vi.fn(async()=>{entered();return new Promise(()=>{});}));
  const pending=prepareGameExperience(notebook(),{}, {...options,signal:controller.signal,onCheckpoint:async d=>!d.control});await started;controller.abort('pause');const result=await pending;
  expect(result.creationStatus).toBe('failed');expect(result.ai.message).toMatch(/could not be saved/);expect(result.notebook.gameDesign!.receipts[0].status).toBe('canceled');
 });
 it('continues the correction after a request-budget pause instead of replaying the identical invalid prompt',async()=>{
  let writes=0;const prompts:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body),value=directorFixtureResponse(r.stage,r.data);prompts.push(r.prompt);if(r.stage==='write'&&++writes===1)value.missions[0].missionId='wrong-mission';return reply(value);}));
  const first=await prepareGameExperience(notebook(),{}, {...options,maxRequests:3});expect(first.creationStatus).toBe('incomplete');expect(first.notebook.gameDesign!.events?.at(-1)).toMatchObject({kind:'retry',category:'validation'});
  const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(prompts[3]).toContain('Keep the supplied missionId exactly');expect(prompts[3]).toContain('LOCAL VALIDATION REPAIR:');
 });
 it('validates bounded event metadata, clears source-stale diagnostics, and retains historical usage',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const r=request(body);return reply(directorFixtureResponse(r.stage,r.data));}));const result=await prepareGameExperience(notebook(),{},options),design=result.notebook.gameDesign!;
  expect(()=>validateGameDesign({...design,events:[{...design.events![0],prompt:'source text'}]},result.notebook)).toThrow(/unsupported/);expect(()=>validateGameDesign({...design,events:Array(121).fill(design.events![0])},result.notebook)).toThrow(/events/);expect(()=>validateGameDesign({...design,events:[{...design.events![0],category:'raw-provider-error'}]},result.notebook)).toThrow(/classification/);
  const changed={...result.notebook,sources:result.notebook.sources.map(s=>({...s,text:s.text+'\nA new source condition.'}))};const next=validateGameDesign(design,changed);expect(next.events).toBeUndefined();expect(next.receipts).toHaveLength(5);expect(gameDesignProgress(emptyGameDesign(notebook(),design.provider))).toMatchObject({percent:0,completedSteps:0});
 });
});
