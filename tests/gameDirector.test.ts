import {childPlaySources,puppetStoryFixture} from '../src/data/childPlayFixtures';
import {ruleSwitchSources,ruleSwitchFixture} from '../src/data/ruleSwitchFixtures';
import {directorFixtureResponse as response} from './gameDirector.fixture';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {createGameDesignValidator,gameDesignProgress,validateGameDesign,type GameDesign} from '../src/lib/gameDesign';
import * as learningPlans from '../src/lib/aiLearningPlan';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {evaluateActivity} from '../src/lib/structuredEngine';
import {summarizeAIUsage} from '../src/lib/aiUsage';
import type {Notebook} from '../src/types';
import {LEGACY_CODE_STUDY_LIMITATION,MIXED_CODE_PROSE_LIMITATION} from '../src/lib/gameDirectorSources';
import {evidenceBlocks,evidenceReference} from '../src/lib/evidence';
import {prepareAutomaticLearning} from '../src/lib/automaticLearning';

const config={provider:'compatible' as const,model:'source-designer',apiKey:'only-in-session',baseUrl:'http://127.0.0.1:11434/v1'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
const n=(count=1)=>createNotebook({sources:[createSource(Array.from({length:count},(_,i)=>`# Maintenance procedure ${i+1}\n1. Open the settings panel ${i+1}.\n2. Choose the reset command ${i+1}.\n3. Confirm the selected reset ${i+1}.`).join('\n\n'),'Maintenance handbook')]});
const usage={status:'reported',inputTokens:100,outputTokens:60,cachedInputTokens:30,cacheWriteTokens:0,reasoningTokens:10,totalTokens:160};
function parse(body:any){const request=JSON.parse(body.body),stage=request.prompt.match(/STAGE: (\w+)/)[1];return{request,stage,data:JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1])};}

function mock(transform?:(stage:string,data:any,value:any)=>any){const requests:{stage:string;data:any;request:any}[]=[];const fetch=vi.fn(async(_url:string,body:any)=>{const parsed=parse(body);requests.push(parsed);const value=transform?transform(parsed.stage,parsed.data,response(parsed.stage,parsed.data)):response(parsed.stage,parsed.data);return{ok:true,json:async()=>({text:JSON.stringify(value),usage,actualModels:['actual-provider-model']})};});vi.stubGlobal('fetch',fetch);return{fetch,requests};}
afterEach(()=>vi.unstubAllGlobals());

describe('resumable AI game director',()=>{
 it('reuses exact unchanged batch checks without exposing mutable cached results or skipping new evidence checks',async()=>{
  mock();const result=await prepareGameExperience(n(4),{},options),notebook=result.notebook,original=structuredClone(notebook.gameDesign!);
  const validate=createGameDesignValidator(notebook),spy=vi.spyOn(learningPlans,'validateAILearningPlan');
  try{
   expect(validate(original)).toEqual(validateGameDesign(original,notebook));
   const calls=spy.mock.calls.length,second=validate(structuredClone(original));
   expect(spy).toHaveBeenCalledTimes(calls);
   second.batches[0].drafts![0].activity.instruction='Mutated returned instruction';
   second.batches[0].unitIds.splice(0,1);
   second.units[0].headingPath.push('Forged source heading');
   second.unavailableSources.push({sourceId:'made-up',reason:'Forged limitation'});
   expect(validate(original)).toEqual(validateGameDesign(original,notebook));
   const forged=structuredClone(original);forged.batches[0].drafts![0].activity.sourceRefs[0].evidence='A claim that the supplied source does not contain.';
   expect(()=>validate(forged)).toThrow();
   const hiddenField=structuredClone(original);(hiddenField.batches[0].missions![0] as any).unsupported=undefined;
   expect(()=>validate(hiddenField)).toThrow(/unsupported/);
   expect(validate(original)).toEqual(validateGameDesign(original,notebook));
  }finally{spy.mockRestore();}
 });
 it('invalidates checkpoint checks for in-place source changes and still validates receipts, coverage and readiness',async()=>{
  mock();const result=await prepareGameExperience(n(2),{},options),notebook=result.notebook,original=structuredClone(notebook.gameDesign!),validate=createGameDesignValidator(notebook);
  validate(original);
  const badReceipt=structuredClone(original);badReceipt.receipts[0].status='fabricated' as any;
  expect(()=>validate(badReceipt)).toThrow();
  const badCoverage=structuredClone(original);badCoverage.units[0].start++;
  expect(()=>validate(badCoverage)).toThrow(/coverage/);
  const unfinished=structuredClone(original);unfinished.batches[0]={id:unfinished.batches[0].id,unitIds:unfinished.batches[0].unitIds,status:'pending'};
  expect(()=>validate(unfinished)).toThrow(/unfinished/);
  notebook.sources[0].text+='\n\n# Additional source condition\nThe maintenance procedure also requires the panel to be disconnected from power.';
  const reset=validate(original);
  expect(reset).toEqual(validateGameDesign(original,notebook));
  expect(reset.inputRevision).not.toBe(original.inputRevision);
  expect(reset.status).toBe('preparing');expect(reset.batches.every(batch=>batch.status==='pending')).toBe(true);
  expect(reset.receipts).toEqual(original.receipts);
 });
 it('keeps wholly ineligible batches as exact source study without any planning request',async()=>{
  const provider=mock(),short=createSource('# First detail\nBrief note.\n\n# Second detail\nAnother short note.\n\n# Third detail\nA final note.','Short fragments');
  const input=createNotebook({sources:[short]}),result=await prepareGameExperience(input,{},options);
  expect(result.creationStatus).toBe('needs-source');expect(provider.fetch).not.toHaveBeenCalled();
  expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.gameDesign!.receipts).toEqual([]);
  const design=result.notebook.gameDesign!;expect(design.units.length).toBeGreaterThan(0);
  expect(design.batches.every(batch=>batch.status==='checked'&&batch.missions!.length===0&&batch.study!.length===batch.unitIds.length)).toBe(true);
  expect(validateGameDesign(design,input)).toEqual(design);
 });
 it('locally skips only pending study batches while still creating supported missions and preserving them on resume',async()=>{
  const provider=mock(),short=createSource('# First detail\nBrief note.\n\n# Second detail\nAnother short note.\n\n# Third detail\nA final note.','Short fragments');short.id='a-short';
  const procedure=n().sources[0];procedure.id='z-procedure';const input=createNotebook({sources:[short,procedure]});
  const first=await prepareGameExperience(input,{},options);expect(first.creationStatus,first.ai.message).toBe('ready');
  expect(provider.requests.map(request=>request.stage)).toEqual(['plan','direction','write','check','overview']);
  expect(first.notebook.gameDesign!.batches[0].study).toHaveLength(3);
  const second=await prepareGameExperience(first.notebook,{}, {aiPolicy:'required'});
  expect(second.creationStatus).toBe('ready');expect(second.ai.requestCount).toBe(0);
  expect(second.notebook.gameDesign!.receipts).toEqual(first.notebook.gameDesign!.receipts);
  expect(second.notebook.gameDesign!.batches).toEqual(first.notebook.gameDesign!.batches);
 });
 it('covers every chapter beyond six using bounded planning, writing and checking, with source-bound teaching and chosen audio',async()=>{
  const provider=mock(),checkpoints:GameDesign[]=[],result=await prepareGameExperience(n(8),{}, {...options,onCheckpoint:async d=>{checkpoints.push(d);return true;}});
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(provider.requests.map(r=>r.stage)).toEqual(['plan','plan','plan','direction','write','write','write','check','write','write','write','check','write','write','check','overview']);
  const design=result.notebook.gameDesign!;expect(gameDesignProgress(design)).toMatchObject({totalUnits:8,coveredUnits:8,completedBatches:3,missionCount:8,pendingBatches:0});
  expect(result.notebook.aiLearningPlan?.missions).toHaveLength(8);expect(design.visualDirection?.scene).toBe(provider.requests[0].data.choices.find((c:any)=>c.kind==='sequence').scene);expect(design.audioDirection?.effects).toBe('quiet');
  expect(design.receipts).toHaveLength(16);expect(design.receipts.every(r=>r.status==='completed'&&r.actualModels?.[0]==='actual-provider-model')).toBe(true);expect(summarizeAIUsage(design.receipts).input.value).toBe(1600);expect(summarizeAIUsage(design.receipts).total.value).toBe(2560);
  expect(checkpoints.some(d=>d.batches[0].status==='written')).toBe(true);expect(checkpoints.some(d=>d.receipts.some(r=>r.status==='started'))).toBe(true);
  const games=result.notebook.activities!.filter(a=>a.id.startsWith('director-'));expect(games).toHaveLength(8);expect(games.every(a=>a.reviewStatus==='needs-review')).toBe(true);
  expect(evaluateActivity(games[0],{order:['open','choose','confirm']})).toMatchObject({valid:false,outcome:'draft-preview',score:0});
  const serialized=serializePackage(result.notebook);expect(serialized).not.toContain(config.apiKey);expect(serialized).not.toContain(config.baseUrl);expect(parsePackage(serialized).aiLearningPlan?.missions).toHaveLength(8);
 });
 it('consolidates exact duplicate AI answer models and replaces only untouched matching local extractions',async()=>{
  mock();const source=createSource('# Procedure one\n1. Open the panel.\n2. Select the command.\n\n# Procedure two\n1. Open the panel.\n2. Select the command.','Repeated steps');
  // Three steps keep the real fixture writer and source procedure aligned.
  source.text=source.text.replaceAll('2. Select the command.','2. Select the command.\n3. Confirm the command.');
  const result=await prepareGameExperience(createNotebook({sources:[source]}),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({totalUnits:2,coveredUnits:2,missionCount:1,studyOnlyCount:1});expect(result.notebook.activities!.filter(a=>a.kind==='sequence')).toHaveLength(1);
 });
 it('resumes a persisted written batch with only its check and overview requests, and reuses a completed game without a connection or recounting tokens',async()=>{
  const provider=mock(),first=await prepareGameExperience(n(),{}, {...options,maxRequests:3});expect(first.creationStatus).toBe('incomplete');expect(first.notebook.gameDesign!.batches[0].status).toBe('written');expect(first.notebook.activities?.some(a=>a.id.startsWith('director-'))).toBe(false);
  const saved=parsePackage(serializePackage(first.notebook)),second=await prepareGameExperience(saved,{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(provider.requests.map(r=>r.stage)).toEqual(['plan','direction','write','check','overview']);
  const third=await prepareGameExperience(second.notebook,{}, {aiPolicy:'required'});expect(third.creationStatus,third.ai.message).toBe('ready');expect(third.ai.requestCount).toBe(0);expect(third.notebook.gameDesign!.receipts).toHaveLength(5);expect(provider.fetch).toHaveBeenCalledTimes(5);
 });
 it('reuses unchanged source batches after an ID-keyed source collection is reordered',async()=>{
  const provider=mock(),firstSource=n().sources[0],secondSource=createSource('# Another maintenance procedure\n1. Open the alternate panel.\n2. Choose its command.\n3. Confirm that selection.','Second procedure');
  const input=createNotebook({sources:[firstSource,secondSource]}),first=await prepareGameExperience(input,{},options);expect(first.creationStatus,first.ai.message).toBe('ready');
  const reordered={...first.notebook,sources:[...first.notebook.sources].reverse()},second=await prepareGameExperience(parsePackage(serializePackage(reordered)),{}, {aiPolicy:'required'});
  expect(second.creationStatus,second.ai.message).toBe('ready');expect(second.ai.requestCount).toBe(0);expect(second.notebook.gameDesign!.receipts).toHaveLength(6);expect(provider.fetch).toHaveBeenCalledTimes(6);
 });
 it('never invokes AI without explicit Create consent, including when a connection is supplied',async()=>{
  const provider=mock();const result=await prepareGameExperience(n(),{}, {aiPolicy:'required',ai:{config} as any});expect(result.creationStatus).toBe('needs-connection');expect(provider.fetch).not.toHaveBeenCalled();
 });
 it('does not silently omit a late unit from a plan, and retains the consumed call receipt',async()=>{
  mock((stage,_data,value)=>stage==='plan'?{...value,missions:value.missions.slice(0,1)}:value);const result=await prepareGameExperience(n(9),{},options);expect(result.creationStatus).toBe('failed');expect(result.notebook.gameDesign!.batches.every(batch=>batch.status==='pending')).toBe(true);expect(result.notebook.gameDesign!.batches.every(batch=>!batch.study?.length)).toBe(true);expect(result.ai.requestCount).toBe(2);expect(result.notebook.gameDesign!.receipts).toHaveLength(2);expect(result.notebook.gameDesign!.receipts[0].usage.inputTokens).toBe(100);
 });
 it('rejects invented citations or teacher text without sacrificing source material or prior stages',async()=>{
  mock((stage,_data,value)=>{if(stage==='write')value.missions[0].teaching.chunks[0].citations[0]={sourceId:'missing',evidence:'An invented statement.'};return value;});const input=n(),result=await prepareGameExperience(input,{},options);expect(result.creationStatus).toBe('failed');expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.gameDesign!.batches[0].status).toBe('planned');expect(result.notebook.gameDesign!.batches[0].study).toEqual([]);expect(result.notebook.gameDesign!.receipts).toHaveLength(4);expect(result.notebook.activities?.some(a=>a.id.startsWith('director-'))).toBe(false);
 });
 it('check-stage rejection becomes explicit source study, never approved gameplay',async()=>{
  mock((stage,_data,value)=>stage==='check'?{checks:value.checks.map((c:any)=>({...c,decision:'source-study',reason:'The source does not justify this model.'}))}:value);const result=await prepareGameExperience(n(),{},options);expect(result.creationStatus).toBe('needs-source');expect(result.launch.kind).toBe('materials');expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({coveredUnits:1,missionCount:0,studyOnlyCount:1});expect(result.notebook.gameDesign!.receipts).toHaveLength(4);
 });
 it('shows the saved mission-review reason instead of preliminary extractor claims about the material',async()=>{
  const input=createNotebook({sources:[createSource('# Maintenance notes\nOpen the settings panel. Then choose the reset command. Finally confirm the selected reset.','Maintenance notes')]}),reason='The lesson promises a route submission control that the displayed game does not provide.';
  expect(prepareAutomaticLearning(input).warnings.some(warning=>warning.startsWith('No explicit structures found.'))).toBe(true);
  const provider=mock((stage,_data,value)=>stage==='check'?{checks:value.checks.map((check:any)=>({...check,decision:'source-study',reason,quality:{...check.quality,controlsMatch:false}}))}:value);
  const result=await prepareGameExperience(input,{},options);expect(result.creationStatus,result.ai.message).toBe('needs-source');expect(provider.requests.map(request=>request.stage)).toEqual(['plan','direction','write','check']);expect(result.ai.message).toContain(reason);expect(result.ai.message).toContain('generated drafts and usage records are kept');expect(result.ai.message).not.toContain('could not justify');expect(result.warnings).toContainEqual(expect.stringContaining(reason));expect(result.warnings.join(' ')).not.toMatch(/No explicit structures|does not provide unambiguous|material did not identify a procedure/);
  expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.gameDesign!.batches[0].drafts).toHaveLength(1);expect(result.notebook.gameDesign!.batches[0].checks![0]).toMatchObject({decision:'source-study',reason});
  const restored=await prepareGameExperience(parsePackage(serializePackage(result.notebook)),{}, {aiPolicy:'required'});expect(restored.ai.message).toBe(result.ai.message);expect(restored.warnings).toEqual(result.warnings);expect(restored.ai.requestCount).toBe(0);expect(provider.requests).toHaveLength(4);
 });
 it('retains actual unreadable-source notices while omitting discarded extraction diagnostics after successful AI creation',async()=>{
  const pending={...createSource('','Recording transcript'),status:'needs-transcript' as const},input=n();input.sources.push(pending);mock();
  const result=await prepareGameExperience(input,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(result.warnings).toContain('Recording transcript: This source needs current readable text or checked media evidence.');expect(result.warnings.join(' ')).not.toContain('Explicit source structures were parsed without AI');expect(result.notebook.sources).toEqual(input.sources);
 });
 it('invalidates source-stale work but reuses validated work when only the model changes',async()=>{
  const provider=mock(),first=await prepareGameExperience(n(),{},options),changed={...first.notebook,sources:first.notebook.sources.map(s=>({...s,text:s.text+'\nA newly documented condition belongs to the source.'}))};
  const next=await prepareGameExperience(changed,{}, {aiPolicy:'required'});expect(next.creationStatus).toBe('needs-connection');expect(next.notebook.gameDesign!.receipts).toHaveLength(5);expect(next.notebook.gameDesign!.batches.every(b=>b.status==='pending')).toBe(true);expect(provider.fetch).toHaveBeenCalledTimes(5);
  const model=await prepareGameExperience(first.notebook,{}, {...options,ai:{config:{...config,model:'second-model'},consent:'create-game'}});expect(model.creationStatus,model.ai.message).toBe('ready');expect(model.notebook.gameDesign!.receipts).toEqual(first.notebook.gameDesign!.receipts);expect(model.ai.requestCount).toBe(0);expect(model.notebook.gameDesign!.batches).toEqual(first.notebook.gameDesign!.batches);expect(model.notebook.gameDesign!.overview).toEqual(first.notebook.gameDesign!.overview);expect(model.notebook.activities!.filter(a=>a.id.startsWith('director-'))).toHaveLength(1);expect(model.notebook.gameDesign!.provider.model).toBe('second-model');expect(provider.fetch).toHaveBeenCalledTimes(5);
 });
 it('never sends a request when its preflight checkpoint fails',async()=>{
  const provider=mock(),result=await prepareGameExperience(n(),{}, {...options,onCheckpoint:async design=>!design.receipts.some(r=>r.status==='started')});expect(result.creationStatus).toBe('failed');expect(provider.fetch).not.toHaveBeenCalled();expect(result.ai.requestCount).toBe(0);expect(result.notebook.gameDesign!.receipts).toEqual([]);
 });
 it('cancels after a saved writer without replaying charged stages on resume',async()=>{
  const provider=mock(),controller=new AbortController();const first=await prepareGameExperience(n(),{}, {...options,signal:controller.signal,onProgress:p=>{if(p.stage==='validating')controller.abort();}});expect(first.creationStatus).toBe('canceled');expect(first.notebook.gameDesign!.batches[0].status).toBe('written');expect(provider.requests.map(r=>r.stage)).toEqual(['plan','direction','write']);
  const second=await prepareGameExperience(first.notebook,{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(provider.requests.map(r=>r.stage)).toEqual(['plan','direction','write','check','overview']);
 });
 it('marks interrupted provider usage unknown and rejects a late response without adding models',async()=>{
  let release!:(value:any)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{release=resolve;})));const controller=new AbortController();let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=prepareGameExperience(n(),{}, {...options,signal:controller.signal,onCheckpoint:async d=>{if(d.receipts.some(r=>r.status==='started'))setTimeout(started,0);return true;}});await ready;controller.abort();const result=await pending;expect(result.creationStatus).toBe('canceled');expect(result.notebook.gameDesign!.receipts[0]).toMatchObject({status:'canceled',usage:{status:'unavailable',inputTokens:null,outputTokens:null}});const before=JSON.stringify(result);release({ok:true,json:async()=>({text:'{}',usage})});await Promise.resolve();expect(JSON.stringify(result)).toBe(before);
 });
 it('keeps later author edits intact when reusing completed generated work',async()=>{
  const provider=mock(),first=await prepareGameExperience(n(),{},options),id=first.ai.activityIds![0];const edited={...first.notebook,activities:first.notebook.activities!.map(a=>a.id===id?{...a,title:'My reviewed procedure',reviewStatus:'reviewed' as const}:a)};const second=await prepareGameExperience(edited,{}, {aiPolicy:'required'});expect(second.creationStatus).toBe('ready');expect(second.notebook.activities!.find(a=>a.id===id)).toMatchObject({title:'My reviewed procedure',reviewStatus:'reviewed'});expect(provider.fetch).toHaveBeenCalledTimes(5);
 });
 it.each([{age:'3-5',kind:'child-play',source:childPlaySources[0],fixture:puppetStoryFixture,recipe:'puppet-stories'},{age:'6-8',kind:'rule-switch',source:ruleSwitchSources[0],fixture:ruleSwitchFixture,recipe:'changing-rule-sorter'}])('prepares $age source-scripted $kind with its actual contract and caregiver-safe draft boundary',async({age,kind,source,fixture,recipe})=>{
  mock((stage,data,value)=>{
   if(stage==='plan'){const choice=data.choices.find((c:any)=>c.scaffoldId===recipe);value.missions=value.missions.map((m:any)=>({...m,kind,scaffoldId:recipe,visualDirection:{scene:choice.scene,sourceAssetIds:[]},asterDirection:{welcome:'welcome-wave',concept:'focused-reading',retry:'patient-support',success:'quiet-celebration'}}));}
   if(stage==='write'){value.missions=value.missions.map((m:any)=>{const {scaffoldIds:_bindings,...activity}=structuredClone(fixture),citations=[{sourceId:source.id,evidence:source.text}];return{...m,activity,teaching:{title:'Discover this source together',objective:'Use the source-supported choices.',conceptExplanation:{text:kind==='child-play'?'Ada and Bo share a cup in this story.':'The same objects can be grouped by color or shape.',citations},chunks:[{id:'notice',title:'Notice the beginning',text:kind==='child-play'?'Ada is the helper. Bo is the friend.':'Color and shape are the two features.',citations},{id:'try',title:'Try the source action',text:kind==='child-play'?'Ada asks Bo about using the cup.':'Changing from color to shape can regroup the objects.',citations}],guidedApplication:{prompt:'Choose a source-supported move with a grown-up.',steps:['Look at the source together.','Use the displayed controls to try the source action.']}}};});}
   return value;
  });
  const result=await prepareGameExperience(createNotebook({sources:[source],ageGroup:age}),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');const game=result.notebook.activities!.find(a=>a.id===result.ai.activityId)!;expect(game.kind).toBe(kind);expect(game.scaffoldIds).toEqual([recipe]);expect(game.reviewStatus).toBe('needs-review');expect(result.notebook.aiLearningPlan!.missions[0].ageGroup).toBe(age);expect(parsePackage(serializePackage(result.notebook)).gameDesign!.batches[0].missions![0].asterDirection?.retry).toBe('patient-support');
 });
 it('bounds repair of an incompatible companion expression and never approves it',async()=>{
  mock((stage,_data,value)=>{if(stage==='plan')value.missions[0].asterDirection={retry:'bright-celebration'};return value;});const result=await prepareGameExperience(n(),{},options);expect(result.creationStatus).toBe('failed');expect(result.ai.requestCount).toBe(2);expect(result.notebook.gameDesign!.batches[0].status).toBe('pending');expect(result.notebook.gameDesign!.batches[0].study).toBeUndefined();
 });
 it('creates a prose-grounded mission from a mixed technical section while every AI stage retains its full code context',async()=>{
  const steps='1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.',code='exampleReset();';
  const input=createNotebook({sources:[createSource('# Procedure\n'+steps+'\n\n```js\n'+code+'\n```','Technical guide')]});
  const provider=mock((stage,_data,value)=>{
   if(stage==='write')for(const item of value.missions){const citations=[{sourceId:input.sources[0].id,evidence:steps}];item.activity.sourceRefs=citations;item.teaching.conceptExplanation.citations=citations;for(const chunk of item.teaching.chunks)chunk.citations=citations;}
   return value;
  });
  const result=await prepareGameExperience(input,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');
  expect(provider.requests[0].data.units[0].excerpt).toContain(code);expect(provider.requests.find(r=>r.stage==='write')!.data.missions[0].unit.excerpt).toContain(code);
  const check=provider.requests.find(r=>r.stage==='check')!.data;
  expect(check.missions[0].exactEvidence.some((ref:any)=>check.evidencePool.find((entry:any)=>entry.id===ref.evidence.evidenceId&&entry.sourceId===ref.sourceId)?.text.includes(code))).toBe(true);
  const design=result.notebook.gameDesign!,draft=design.batches[0].drafts![0];expect(design.units[0].limitation).toBe(MIXED_CODE_PROSE_LIMITATION);expect(draft.teaching.sourceWindows[0].quote).toContain(code);expect(draft.activity.sourceRefs[0].evidence).toBe(steps);
  expect(parsePackage(serializePackage(result.notebook)).gameDesign).toEqual(design);
  const forged=structuredClone(design),codeRef=evidenceReference(evidenceBlocks(input.sources[0]).find(block=>block.quote===code)!);
  forged.batches[0].drafts![0].teaching.conceptExplanation.citations=[codeRef];expect(()=>validateGameDesign(forged,result.notebook)).toThrow(/non-code/);
 });
 it.each(['activity','teaching'])('rejects a mixed-source %s citation that uses code without discarding source material or consumed usage',async(target)=>{
  const steps='1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.',code='exampleReset();';
  const input=createNotebook({sources:[createSource('# Procedure\n'+steps+'\n\n```js\n'+code+'\n```','Technical guide')]});
  mock((stage,_data,value)=>{
   if(stage==='write')for(const item of value.missions){const citations=[{sourceId:input.sources[0].id,evidence:steps}];if(target==='teaching')item.activity.sourceRefs=citations;item.teaching.conceptExplanation.citations=target==='teaching'?[{sourceId:input.sources[0].id,evidence:code}]:citations;for(const chunk of item.teaching.chunks)chunk.citations=citations;}
   return value;
  });
  const result=await prepareGameExperience(input,{},options);expect(result.creationStatus).toBe('failed');expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.gameDesign!.batches[0].status).toBe('planned');expect(result.notebook.gameDesign!.receipts).toHaveLength(4);expect(result.notebook.gameDesign!.events?.some(event=>event.category==='validation'&&event.message.includes('non-code'))).toBe(true);expect(result.ai.activityIds).toEqual([]);
 });
 it('imports the exact legacy mixed-code exclusion without resetting ready games, source windows or historical token receipts',async()=>{
  const normal=n().sources[0],mixed=createSource('# Events\nPublisher: A component that sends messages to a named topic.\nSubscriber: A component that receives messages from a subscribed topic.\n\n```js\npublish("weather", reading);\n```','Technical reference');
  const provider=mock((stage,data,value)=>{
   if(stage==='plan'){const unit=data.units.find((u:any)=>u.sourceId===mixed.id);if(unit){value.missions=value.missions.filter((m:any)=>m.unitId!==unit.unitId);value.study.push({unitId:unit.unitId,reason:LEGACY_CODE_STUDY_LIMITATION});}}
   return value;
  });
  const result=await prepareGameExperience(createNotebook({sources:[normal,mixed]}),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');
  const prior=structuredClone(result.notebook),design=prior.gameDesign!,index=design.units.findIndex(unit=>unit.sourceId===mixed.id);design.units[index]={...design.units[index],missionEligible:false,limitation:LEGACY_CODE_STUDY_LIMITATION};
  const restored=parsePackage(serializePackage(prior)),normalized=restored.gameDesign!;
  expect(normalized.status).toBe('ready');expect(normalized.inputRevision).toBe(design.inputRevision);expect(normalized.batches).toEqual(design.batches);expect(normalized.events).toEqual(design.events);expect(normalized.receipts).toEqual(design.receipts);expect(normalized.generatedModels).toEqual(design.generatedModels);expect(normalized.audioDirection).toEqual(design.audioDirection);expect(normalized.visualDirection).toEqual(design.visualDirection);expect(restored.activities).toEqual(prior.activities);expect(restored.aiLearningPlan).toEqual(prior.aiLearningPlan);
  expect(normalized.units[index]).toEqual({...design.units[index],missionEligible:true,limitation:MIXED_CODE_PROSE_LIMITATION});
  const replay=await prepareGameExperience(restored,{}, {aiPolicy:'required'});expect(replay.creationStatus,replay.ai.message).toBe('ready');expect(replay.ai.requestCount).toBe(0);expect(provider.fetch).toHaveBeenCalledTimes(5);expect(replay.notebook.gameDesign!.receipts).toEqual(design.receipts);
  for(const patch of [{start:design.units[index].start+1},{limitation:'Invented exemption'},{missionEligible:true}]){const forged=structuredClone(design);Object.assign(forged.units[index],patch);expect(()=>validateGameDesign(forged,prior)).toThrow(/coverage/);}
 });
 it('strictly rejects metadata, approval, coverage and audio forgeries on portable import',async()=>{
  mock();const result=await prepareGameExperience(n(),{},options),notebook=result.notebook,design=notebook.gameDesign!;
  expect(()=>validateGameDesign({...design,apiKey:'secret'},notebook)).toThrow(/unsupported/);
  expect(()=>validateGameDesign({...design,units:[]},notebook)).toThrow(/coverage/);
  const forged=structuredClone(design);forged.batches[0].drafts![0].activity.reviewStatus='reviewed';expect(()=>validateGameDesign(forged,notebook)).toThrow(/practice model/);
  const audio=structuredClone(design);audio.batches[0].drafts![0].audioDirection.playTrackId='https://untrusted.invalid/a.mp3';expect(()=>validateGameDesign(audio,notebook)).toThrow(/bundled/);
 });
});
