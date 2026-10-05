import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareGameExperience,getGameExperience,selectGameDraftCandidates,createGameExperiencePrompt,type GameDraftCandidate} from '../src/lib/prepareGameExperience';
import {createNotebook,createSource} from '../src/lib/utils';
import {evaluateActivity,validateActivity,type StructuredActivity} from '../src/lib/structuredEngine';
import {serializePackage,parsePackage} from '../src/lib/package';
import type {Notebook} from '../src/types';

const config={provider:'compatible' as const,model:'local-model',apiKey:'secret-session-value',baseUrl:'http://127.0.0.1:11434/v1'};
const options={ai:{config,consent:'create-game' as const},onAIUsage:async()=>true};
const source=()=>({...createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance notes'),id:'maintenance-source'});
const notebook=()=>createNotebook({id:'preparation-world',sources:[source()]});
const plainNotebook=()=>createNotebook({sources:[createSource('# Field observations\nThe group recorded changing cloud shapes during the afternoon. Some sketches showed broad layers while others showed separate patches. Their notes preserve the weather observations without asserting a general rule.','Observation journal')]});
function units(body:unknown):GameDraftCandidate[]{const request=JSON.parse((body as {body:string}).body);return JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]).units;}
function draft(candidate:GameDraftCandidate):Record<string,unknown>{return{version:1,id:'assistant-draft',kind:'sequence',title:'Restore the prepared settings',instruction:'Arrange the documented maintenance steps.',explanation:'Use the supplied sequence.',hint:'Begin with opening the panel.',reviewStatus:'reviewed',sourceRefs:[{sourceId:candidate.sourceId,evidence:candidate.excerpt}],items:[{id:'open',label:'Open the settings panel.'},{id:'choose',label:'Choose the reset command.'},{id:'confirm',label:'Confirm the selected reset.'}],constraints:[{before:'open',after:'choose'},{before:'choose',after:'confirm'}]};}
function provider(reply?:(c:GameDraftCandidate,all:GameDraftCandidate[])=>unknown){const fetch=vi.fn(async(_url:string,body:unknown)=>{const all=units(body),c=all[0];return{ok:true,json:async()=>({text:JSON.stringify(reply?reply(c,all):{unitId:c.unitId,activity:draft(c)})})};});vi.stubGlobal('fetch',fetch);return fetch;}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('one-action source-grounded game preparation',()=>{
 it('always prepares local lessons and source-supported activities without a connection',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const n=notebook(),result=await prepareGameExperience(n);
  expect(fetch).not.toHaveBeenCalled();expect(n.activities).toBeUndefined();expect(result.notebook.sources).toEqual(n.sources);
  expect(result.launch.kind).toBe('activity');expect(result.summary.description).toContain('documented steps');expect(result.ai.status).toBe('not-requested');
  const a=result.notebook.activities![0];expect(a.kind).toBe('sequence');expect(a.reviewStatus).toBe('needs-review');expect(result.notebook.scaffoldIds[0]).toBe('process-reconstruction');
  expect(evaluateActivity(a,{order:['open','choose','confirm']}).score).toBe(0);
 });
 it('keeps ordinary prose useful through source study instead of fabricating an answer model',async()=>{
  const result=await prepareGameExperience(plainNotebook());expect(result.launch.kind).toBe('study');expect(result.summary.chapterCount).toBeGreaterThan(0);expect(result.summary.description).toContain('No answer key is guessed');expect(result.notebook.cards).toEqual([]);expect(result.notebook.scaffoldIds).toEqual([]);
 });
 it('describes existing work without mutations or inference and blocks stale/unready models',()=>{
  const n=notebook(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);const before=JSON.stringify(n);expect(getGameExperience(n).launch.kind).toBe('study');expect(JSON.stringify(n)).toBe(before);expect(fetch).not.toHaveBeenCalled();
  const c=selectGameDraftCandidates(n)[0],activity=draft(c) as unknown as StructuredActivity;
  expect(getGameExperience({...n,activities:[activity],sources:[{...n.sources[0],text:'Replaced text.'}]}).summary.activityCount).toBe(0);
  expect(getGameExperience({...n,activities:[activity],sources:[{...n.sources[0],status:'needs-transcript'}]}).launch.kind).toBe('materials');
 });
 it('never requests inference merely because credentials were supplied without explicit create consent',async()=>{
  const fetch=provider();const result=await prepareGameExperience(notebook(),{}, {ai:{config} as any});expect(fetch).not.toHaveBeenCalled();expect(result.ai.status).toBe('not-requested');
  const missing=await prepareGameExperience(notebook(),{}, {ai:{config:{...config,model:''},consent:'create-game'}});expect(fetch).not.toHaveBeenCalled();expect(missing.ai.status).toBe('unavailable');
 });
 it('does not spend on the compatibility request without a durable usage recorder or when its preflight save fails',async()=>{
  const fetch=provider();const absent=await prepareGameExperience(notebook(),{}, {ai:options.ai,quality:'fast'});expect(absent.ai.status).toBe('unavailable');expect(absent.ai.requestCount).toBe(0);
  for(const onAIUsage of [async()=>false,async()=>{throw new Error('Storage unavailable');}]){const failed=await prepareGameExperience(notebook(),{}, {...options,quality:'fast',onAIUsage});expect(failed.ai.requestCount).toBe(0);expect(failed.notebook.aiToolReceipts??[]).toEqual([]);}expect(fetch).not.toHaveBeenCalled();
 });
 it('retains measured compatibility usage through local content rejection and portable roundtrip without recounting a cache hit',async()=>{
  const receipts:any[]=[];vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({text:JSON.stringify({unitId:'not-disclosed',activity:{}}),usage:{status:'reported',inputTokens:90,outputTokens:30,cachedInputTokens:20,cacheWriteTokens:0,reasoningTokens:10,totalTokens:120}})})));
  const rejected=await prepareGameExperience(notebook(),{}, {...options,onAIUsage:async receipt=>{receipts.push(receipt);return true;}});expect(rejected.ai.status).toBe('failed');expect(receipts.map(r=>r.status)).toEqual(['started','completed']);expect(rejected.notebook.aiToolReceipts).toHaveLength(1);expect(parsePackage(serializePackage(rejected.notebook)).aiToolReceipts?.[0].usage).toMatchObject({inputTokens:90,outputTokens:30,cachedInputTokens:20});
  const fetch=provider(),first=await prepareGameExperience(notebook(),{},options),again=await prepareGameExperience(first.notebook,{},options);expect(again.ai.status).toBe('kept-existing');expect(again.notebook.aiToolReceipts).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(1);expect(again.notebook.aiToolReceipts?.[0].usage.inputTokens).toBeNull();
 });
 it('makes one bounded request, chooses a source unit and automatically launches an unscored reviewed-later model',async()=>{
  const fetch=provider(),progress:string[]=[];const result=await prepareGameExperience(notebook(),{goal:'Apply the maintenance instructions'}, {...options,onProgress:p=>progress.push(p.stage)});
  expect(fetch).toHaveBeenCalledTimes(1);const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.maxOutputTokens).toBe(6000);expect(body.prompt).not.toContain(config.apiKey);
  expect(result.ai.status).toBe('draft-added');expect(result.launch).toMatchObject({kind:'activity',activityId:result.ai.activityId,reviewRequired:true});
  const activity=result.notebook.activities!.find(a=>a.id===result.ai.activityId)!;expect(activity.reviewStatus).toBe('needs-review');expect(activity.scaffoldIds).toEqual(['process-reconstruction']);expect(validateActivity(activity,result.notebook.sources).success).toBe(true);
  const scored=evaluateActivity(activity,{order:['open','choose','confirm']});expect(scored).toMatchObject({valid:false,correct:null,outcome:'draft-preview',score:0,maxScore:0});
  expect(progress).toEqual(['local','selecting','drafting','validating','ready']);expect(JSON.stringify(result)).not.toContain(config.apiKey);
  const restored=parsePackage(serializePackage(result.notebook));expect(restored.activities!.find(a=>a.id===activity.id)?.reviewStatus).toBe('needs-review');expect(JSON.stringify(restored)).not.toContain(config.baseUrl);
 });
 it('reuses the same preparation without repeated tokens, and preserves subsequent author changes/review',async()=>{
  const fetch=provider(),first=await prepareGameExperience(notebook(),{},options);
  const edited={...first.notebook,activities:first.notebook.activities!.map(a=>a.id===first.ai.activityId?{...a,title:'My checked maintenance challenge',reviewStatus:'reviewed' as const}:a)};
  const second=await prepareGameExperience(edited,{},options);expect(fetch).toHaveBeenCalledTimes(1);expect(second.ai.status).toBe('kept-existing');expect(second.ai.requestCount).toBe(0);expect(second.notebook.activities).toHaveLength(first.notebook.activities!.length);expect(second.notebook.activities!.find(a=>a.id===first.ai.activityId)).toMatchObject({title:'My checked maintenance challenge',reviewStatus:'reviewed'});
 });
 it('uses six exact coherent source units at most while preserving full local chapter coverage',async()=>{
  const sources=Array.from({length:9},(_,i)=>({...createSource(`# Region ${i}\n`+'Observers recorded the field conditions in their notebooks. '.repeat(15),`Journal ${i}`),id:`journal-${i}`}));const n=createNotebook({sources});
  const candidates=selectGameDraftCandidates(n);expect(candidates).toHaveLength(6);expect(new Set(candidates.map(c=>c.sourceId)).size).toBe(6);expect(candidates.reduce((sum,c)=>sum+c.excerpt.length,0)).toBeLessThanOrEqual(12000);
  for(const c of candidates)expect(sources.find(s=>s.id===c.sourceId)!.text.slice(c.start,c.end)).toBe(c.excerpt);
  const fetch=provider(()=>({cannotBuild:'No explicit game rule here.'})),result=await prepareGameExperience(n,{},options);expect(fetch).toHaveBeenCalledTimes(1);expect(result.ai.status).toBe('declined');expect(result.summary.sourceCount).toBe(9);expect(result.notebook.sources).toEqual(sources);expect(result.summary.chapterCount).toBeGreaterThanOrEqual(9);
 });
 it('keeps an explicit case’s final conditions in its bounded excerpt without crossing titled sections',()=>{
  const text='# Case A\n'+Array.from({length:7},(_,i)=>`Observation ${i}: the source states the condition for this step and the documented result.`).join('\n\n')+'\n\n# Different topic\nThis paragraph belongs to a separate topic and must not be attached to Case A.';
  const n=createNotebook({sources:[createSource(text)]}),candidates=selectGameDraftCandidates(n),first=candidates.find(c=>c.excerpt.includes('Observation 0'))!;expect(first.excerpt).toContain('Observation 6');expect(first.excerpt).not.toContain('separate topic');expect(candidates.some(c=>c.excerpt.includes('separate topic'))).toBe(true);
 });
 it('excludes unresolved recordings, stale transcripts and code-only sources from the disclosed request',()=>{
  const n=notebook();const hidden={...createSource('Bearer private text from an unreadable import','Pending'),status:'needs-transcript' as const};const code=createSource('```js\n'+ 'const command = "not a learning instruction";\n'.repeat(3)+'```','Code');
  const prompt=createGameExperiencePrompt({...n,sources:[hidden,code,...n.sources]});expect(prompt).not.toContain(hidden.text);expect(prompt).not.toContain('const command');
 });
 it('selects only age-compatible adapters and retains the author’s visual theme',async()=>{
  const fetch=provider(),result=await prepareGameExperience({...notebook(),theme:'forest'},{ageGroup:'6-8'},options);expect(result.ai.status).toBe('draft-added');expect(result.notebook.activities!.find(a=>a.id===result.ai.activityId)?.scaffoldIds).toEqual(['step-train']);expect(result.notebook.theme).toBe('forest');
  const youngest=await prepareGameExperience(notebook(),{ageGroup:'3-5'},options);expect(fetch).toHaveBeenCalledTimes(2);expect(youngest.ai.status).toBe('failed');expect(youngest.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);
  await expect(prepareGameExperience(notebook(),{ageGroup:'unknown' as any})).rejects.toThrow('audience');
 });
 it.each(['unknown-unit','other-source','unsupported-kind','specialized-binding','extraction-claim','over-limit','bad-json'])('rejects %s and leaves the local game ready',async failure=>{
  const fetch=provider((c)=>{const activity=draft(c);if(failure==='other-source')activity.sourceRefs=[{sourceId:'undisclosed',evidence:c.excerpt}];if(failure==='unsupported-kind')activity.kind='picture';if(failure==='specialized-binding')activity.scaffoldIds=['clinical-reasoning-casebook'];if(failure==='extraction-claim')activity.extractedFrom=c.sourceId;if(failure==='over-limit')activity.items=Array.from({length:9},(_,i)=>({id:`item-${i}`,label:'Open the panel.'}));return failure==='bad-json'?'not-json':{unitId:failure==='unknown-unit'?'unknown':c.unitId,activity};});
  const result=await prepareGameExperience(notebook(),{},options);expect(fetch).toHaveBeenCalledTimes(1);expect(result.ai.status).toBe('failed');expect(result.launch.kind).toBe('activity');expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);
 });
 it('does not let a selected unit cite a different unit that happened to be disclosed',async()=>{
  const n={...notebook(),sources:[...notebook().sources,{...createSource('Warm > Red\nWarm > Orange\nCool > Blue\nCool > Green','Color categories'),id:'colors'}]};
  provider((c,all)=>({unitId:c.unitId,activity:{...draft(c),sourceRefs:[{sourceId:all[1].sourceId,evidence:all[1].excerpt}]}}));expect((await prepareGameExperience(n,{},options)).ai.status).toBe('failed');
 });
 it('returns the local game promptly on cancel even if the provider ignores AbortSignal; late replies cannot mutate it',async()=>{
  const controller=new AbortController();let resolve!:(value:unknown)=>void;const fetch=vi.fn(()=>new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
  const pending=prepareGameExperience(notebook(),{}, {...options,signal:controller.signal});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));controller.abort();const result=await pending;expect(result.ai.status).toBe('canceled');expect(result.launch.kind).toBe('activity');const before=JSON.stringify(result);resolve({ok:true,json:async()=>({text:'{}'})});await Promise.resolve();expect(JSON.stringify(result)).toBe(before);
  const preCanceled=await prepareGameExperience(notebook(),{}, {...options,signal:controller.signal});expect(preCanceled.ai.requestCount).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['selecting','drafting','validating'])('honors cancellation at %s without committing a late activity',async stage=>{
  const fetch=provider(),controller=new AbortController();const result=await prepareGameExperience(notebook(),{}, {...options,signal:controller.signal,onProgress:p=>{if(p.stage===stage)controller.abort();}});expect(result.ai.status).toBe('canceled');expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);expect(fetch).toHaveBeenCalledTimes(stage==='validating'?1:0);expect(result.ai.requestCount).toBe(stage==='validating'?1:0);
 });
 it('times out once without retries and never exposes provider errors or credentials in the returned notebook',async()=>{
  vi.useFakeTimers();const fetch=vi.fn(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetch);const pending=prepareGameExperience(notebook(),{}, {...options,timeoutMs:1000});await vi.advanceTimersByTimeAsync(1001);const result=await pending;expect(result.ai.status).toBe('failed');expect(fetch).toHaveBeenCalledTimes(1);expect(result.launch.kind).toBe('activity');expect(JSON.stringify(result)).not.toContain(config.apiKey);
 });
 it('handles provider transport failure without discarding local preparation or echoing unsafe error data',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error(`Server echoed ${config.apiKey}`)));const result=await prepareGameExperience(notebook(),{}, {...options,onProgress:()=>{throw new Error('View callback failed');}});expect(result.ai.status).toBe('failed');expect(result.summary.activityCount).toBeGreaterThan(0);expect(JSON.stringify(result)).not.toContain(config.apiKey);
 });
});

describe('optional richer source-backed mission journeys',()=>{
 it('accepts three distinct stronger models in one bounded request and retains the review gate for all',async()=>{
  const {CLEAN_DATA_CONSTRUCTION,PLANT_EXPLANATION,COMPOSITION_EXAMPLE_SOURCE}=await import('../src/lib/compositionExamples');
  const {SCENARIO_EXAMPLES,SCENARIO_EXAMPLE_SOURCES}=await import('../src/lib/scenarioEngine');
  const sourceList=[COMPOSITION_EXAMPLE_SOURCE,SCENARIO_EXAMPLE_SOURCES[0]],models=[CLEAN_DATA_CONSTRUCTION,PLANT_EXPLANATION,SCENARIO_EXAMPLES[0]];
  const fetch=provider((_candidate,all)=>({missions:models.map(model=>{const {scaffoldIds:_,...activity}=structuredClone(model);return{unitId:all.find(c=>activity.sourceRefs.every(r=>r.sourceId===c.sourceId&&c.excerpt.includes(r.evidence)))!.unitId,activity};})}));
  const result=await prepareGameExperience(createNotebook({sources:sourceList}),{},options);
  expect(fetch).toHaveBeenCalledTimes(1);expect(result.ai.status).toBe('draft-added');expect(result.ai.activityIds).toHaveLength(3);expect(result.launch).toMatchObject({kind:'activity',activityId:result.ai.activityIds![0],reviewRequired:true});
  const accepted=result.notebook.activities!.filter(a=>result.ai.activityIds?.includes(a.id));expect(accepted.map(a=>a.kind)).toEqual(['construction','explanation','scenario']);
  for(const activity of accepted){expect(validateActivity(activity,result.notebook.sources).success).toBe(true);expect(activity.reviewStatus).toBe('needs-review');expect(evaluateActivity(activity,{}).score).toBe(0);}
  const roundtrip=parsePackage(serializePackage(result.notebook));expect(roundtrip.activities!.filter(a=>result.ai.activityIds?.includes(a.id)).map(a=>a.reviewStatus)).toEqual(['needs-review','needs-review','needs-review']);
  const again=await prepareGameExperience(result.notebook,{},options);expect(again.ai.status).toBe('kept-existing');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['unreachable-case','impossible-build','invented-evidence-piece'])('rejects %s using the real engine checks rather than trusting an AI witness or citation flag',async failure=>{
  const {CLEAN_DATA_CONSTRUCTION,PLANT_EXPLANATION,COMPOSITION_EXAMPLE_SOURCE}=await import('../src/lib/compositionExamples');
  const {SCENARIO_EXAMPLES,SCENARIO_EXAMPLE_SOURCES}=await import('../src/lib/scenarioEngine');
  const model=structuredClone(failure==='unreachable-case'?SCENARIO_EXAMPLES[0]:failure==='impossible-build'?CLEAN_DATA_CONSTRUCTION:PLANT_EXPLANATION);
  if(model.kind==='scenario')model.budget.limit=1;
  if(model.kind==='construction')model.resources[0].limit=0;
  if(model.kind==='explanation')model.pieces.find(p=>p.role==='evidence')!.text='Invented observation not in the source.';
  const {scaffoldIds:_,...activity}=model;
  provider((_c,all)=>({missions:[{unitId:all.find(c=>activity.sourceRefs.every(r=>r.sourceId===c.sourceId&&c.excerpt.includes(r.evidence)))!.unitId,activity}]}));
  const result=await prepareGameExperience(createNotebook({sources:[COMPOSITION_EXAMPLE_SOURCE,SCENARIO_EXAMPLE_SOURCES[0]]}),{},options);expect(result.ai.status).toBe('failed');expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);expect(result.summary.chapterCount).toBeGreaterThan(0);
 });
 it('rejects duplicated or oversized mission lists and keeps the optional set atomic if one mission is invalid',async()=>{
  for(const count of [2,4]){provider(c=>({missions:Array.from({length:count},()=>({unitId:c.unitId,activity:draft(c)}))}));const result=await prepareGameExperience(notebook(),{},options);expect(result.ai.status).toBe('failed');expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);}
  provider(c=>({missions:[{unitId:c.unitId,activity:draft(c)},{unitId:'missing-unit',activity:draft(c)}]}));const result=await prepareGameExperience(notebook(),{},options);expect(result.ai.status).toBe('failed');expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);
 });
});


describe('AI-required creation keeps failure distinct from a finished game',()=>{
 it('keeps local preparation but requires explicit consent and a ready account before new game creation',async()=>{
  const fetch=provider();
  for(const ai of [undefined,{config,consent:undefined},{config:{...config,model:''},consent:'create-game'}]){
   const input=notebook(),result=await prepareGameExperience(input,{}, {aiPolicy:'required',quality:'fast',ai:ai as any});
   expect(result.creationStatus).toBe('needs-connection');expect(result.launch).toEqual({kind:'materials'});expect(result.notebook.sources).toEqual(input.sources);expect(result.summary.activityCount).toBeGreaterThan(0);
   expect(result.ai.message).not.toContain('world is ready');
  }
  expect(fetch).not.toHaveBeenCalled();
 });
 it('returns ready only after validated AI creation, and reopens the same game offline without credentials',async()=>{
  const fetch=provider(),input=notebook(),first=await prepareGameExperience(input,{}, {...options,aiPolicy:'required',quality:'fast'});
  expect(first.creationStatus).toBe('ready');expect(first.suggestedTheme).toBe('workshop');expect(first.notebook.theme).toBe(input.theme);expect(first.ai.status).toBe('draft-added');expect(first.launch.kind).toBe('activity');
  const saved=parsePackage(serializePackage(first.notebook));const reused=await prepareGameExperience(saved,{}, {aiPolicy:'required',quality:'fast'});
  expect(reused.creationStatus).toBe('ready');expect(reused.ai.status).toBe('kept-existing');expect(reused.ai.requestCount).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);
  expect(reused.notebook.activities!.filter(a=>a.id.startsWith('auto-game-')).every(a=>a.reviewStatus==='needs-review')).toBe(true);
  expect(getGameExperience(saved).launch.kind).toBe('activity');expect(JSON.stringify(reused)).not.toContain(config.apiKey);
 });
 it.each(['declined','malformed'])('does not advertise local fallback as an AI-created game after %s',async outcome=>{
  provider(()=>outcome==='declined'?{cannotBuild:'No reliable model.'}:{missions:[{unitId:'missing',activity:{}}]});
  const stages:string[]=[];const result=await prepareGameExperience(notebook(),{}, {...options,aiPolicy:'required',quality:'fast',onProgress:value=>stages.push(value.stage)});
  expect(result.creationStatus).toBe(outcome==='declined'?'needs-source':'failed');expect(result.launch).toEqual({kind:'materials'});expect(result.notebook.activities?.some(a=>a.id.startsWith('auto-game-'))).toBe(false);expect(stages.at(-1)).toBe('blocked');expect(result.ai.message).not.toContain('world is ready');
 });
 it('stops creation promptly on cancellation and preserves materials without a late game appearing',async()=>{
  const controller=new AbortController();let resolve!:(value:any)=>void;const fetch=vi.fn(()=>new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
  const pending=prepareGameExperience(notebook(),{}, {...options,aiPolicy:'required',quality:'fast',signal:controller.signal});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));controller.abort();const result=await pending;
  expect(result.creationStatus).toBe('canceled');expect(result.launch).toEqual({kind:'materials'});expect(result.ai.requestCount).toBe(1);const snapshot=JSON.stringify(result);resolve({ok:true,json:async()=>({text:'{}'})});await Promise.resolve();expect(JSON.stringify(result)).toBe(snapshot);
 });
 it('does not reuse source-stale or age-incompatible prepared journeys',async()=>{
  const fetch=provider(),first=await prepareGameExperience(notebook(),{}, {...options,aiPolicy:'required',quality:'fast'});
  const changed={...first.notebook,sources:first.notebook.sources.map(s=>({...s,text:s.text.replace('settings panel','preferences panel')}))};
  expect((await prepareGameExperience(changed,{}, {aiPolicy:'required',quality:'fast'})).creationStatus).toBe('needs-connection');
  expect((await prepareGameExperience(first.notebook,{ageGroup:'3-5'}, {aiPolicy:'required',quality:'fast'})).creationStatus).toBe('needs-connection');expect(fetch).toHaveBeenCalledTimes(1);
 });
});
