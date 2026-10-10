import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {prepareAutomaticLearning} from '../src/lib/automaticLearning';
import {gameCheckingPrompt,gameRuntimeControlPresentation,runGameDirector} from '../src/lib/gameDirector';
import {gameRecipeMetadata} from '../src/lib/gameDraftAdapters';
import {scaffoldStoryContext} from '../src/lib/scaffoldStoryContext';
import {emptyGameDesign,gameDesignProgress,type GameDesignBatch} from '../src/lib/gameDesign';
import {hasAmbiguousExtractedRelationships,type DependencyActivity} from '../src/lib/structuredEngine';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage as usage} from './gameDirector.fixture';

const config={provider:'compatible' as const,model:'test-designer',apiKey:'session-only',baseUrl:'http://127.0.0.1:11434/v1'};
const options={ai:{config,consent:'create-game' as const}};
const notebook=(count=1)=>createNotebook({sources:[createSource(Array.from({length:count},(_,i)=>`# Maintenance procedure ${i+1}\n1. Open the settings panel ${i+1}.\n2. Choose the reset command ${i+1}.\n3. Confirm the selected reset ${i+1}.`).join('\n\n'),'Maintenance handbook')]});
function mock(){
 const calls:{stage:string;data:any}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const request=JSON.parse(body.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data});return{ok:true,json:async()=>({text:JSON.stringify(directorFixtureResponse(stage,data)),usage})};}));
 return calls;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('finite complete creation without forced manual continuation',()=>{
 it('finishes all37 source units in one action beyond the former60-request cutoff',async()=>{
  const calls=mock(),input=notebook(37),result=await runGameDirector(input,options);
  expect(result.status,result.message).toBe('ready');expect(calls).toHaveLength(64);expect(result.requestCount).toBe(64);
  expect(gameDesignProgress(result.notebook.gameDesign!)).toMatchObject({coveredUnits:37,totalUnits:37,completedBatches:13,pendingBatches:0,missionCount:37,percent:100});
  expect(result.notebook.sources).toEqual(input.sources);expect(result.notebook.aiLearningPlan?.missions).toHaveLength(37);
  expect(new Set(result.notebook.gameDesign!.receipts.map(receipt=>receipt.id)).size).toBe(64);
  expect(result.notebook.gameDesign!.receipts.every(receipt=>receipt.status==='completed'&&typeof receipt.finishedAt==='string'&&Number.isSafeInteger(receipt.durationMs))).toBe(true);
 },15000);
 it('honors an explicit60-request pause and resumes only the four unsent requests including its overview',async()=>{
  const calls=mock(),first=await runGameDirector(notebook(37),{...options,maxRequests:60});
  expect(first.status).toBe('incomplete');expect(first.requestCount).toBe(60);expect(first.notebook.gameDesign!.status).toBe('preparing');
  const receipts=structuredClone(first.notebook.gameDesign!.receipts);
  const second=await runGameDirector(parsePackage(serializePackage(first.notebook)),options);
  expect(second.status,second.message).toBe('ready');expect(second.requestCount).toBe(4);expect(calls).toHaveLength(64);
  expect(second.notebook.gameDesign!.receipts.slice(0,60)).toEqual(receipts);
  expect(gameDesignProgress(second.notebook.gameDesign!)).toMatchObject({coveredUnits:37,pendingBatches:0});
 },15000);
 it('measures dispatched request time separately from durable checkpoint work',async()=>{
  let elapsed=100;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
  vi.stubGlobal('fetch',vi.fn(async(_url,body)=>{const request=JSON.parse(body.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);elapsed+=125;return{ok:true,json:async()=>({text:JSON.stringify(directorFixtureResponse(stage,data)),usage})};}));
  const result=await runGameDirector(notebook(),{...options,onCheckpoint:async()=>{elapsed+=9000;return true;}});
  expect(result.status,result.message).toBe('ready');expect(result.notebook.gameDesign!.receipts.map(receipt=>receipt.durationMs)).toEqual([125,125,125,125]);
  expect(parsePackage(serializePackage(result.notebook)).gameDesign!.receipts).toEqual(result.notebook.gameDesign!.receipts);
 });
 it('records measured network-failure duration without retrying or fabricating token usage',async()=>{
  let elapsed=100;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
  const fetch=vi.fn(async()=>{elapsed+=42;throw new TypeError('Connection ended.');});vi.stubGlobal('fetch',fetch);
  const result=await runGameDirector(notebook(),options);expect(result.status).toBe('failed');expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.notebook.gameDesign!.receipts[0]).toMatchObject({status:'failed',durationMs:42,finishedAt:expect.any(String),usage:{status:'unavailable',inputTokens:null,outputTokens:null}});
  expect(result.notebook.gameDesign!.batches[0].status).toBe('pending');
 });
 it('stops before spending when the complete historical ledger is full instead of inventing source-study coverage',async()=>{
  const calls=mock(),input=notebook(),receipts=Array.from({length:10000},(_,index)=>({id:`old-${index}`,stage:'plan',provider:config.provider,model:config.model,startedAt:'2026-01-01T00:00:00Z',status:'completed' as const,usage}));
  input.gameDesign=emptyGameDesign(input,{id:config.provider,model:config.model,endpointFingerprint:null},receipts);
  const result=await runGameDirector(input,options);expect(result.status).toBe('failed');expect(result.message).toContain('history limit');expect(calls).toHaveLength(0);
  expect(result.notebook.gameDesign!.receipts).toEqual(receipts);expect(result.notebook.gameDesign!.batches.every(batch=>batch.status==='pending')).toBe(true);expect(result.notebook.sources).toEqual(input.sources);
 });
});

function unpooledMissions(batch:GameDesignBatch){return(batch.drafts??[]).map(draft=>{
 const citations=[...draft.activity.sourceRefs.map(reference=>({sourceId:reference.sourceId,evidence:reference.evidence})),...draft.teaching.sourceWindows.map(reference=>({sourceId:reference.sourceId,evidence:reference.quote}))];
 const exactEvidence=citations.filter((reference,index)=>!citations.some((other,otherIndex)=>index!==otherIndex&&other.sourceId===reference.sourceId&&other.evidence.includes(reference.evidence)&&(other.evidence.length>reference.evidence.length||otherIndex<index)));
 const plan=batch.missions!.find(mission=>mission.id===draft.missionId)!;
 return{missionId:draft.missionId,plan,recipe:gameRecipeMetadata(plan.scaffoldId),storyContext:scaffoldStoryContext(plan.scaffoldId,draft.teaching.ageGroup,draft.activity),renderedControls:gameRuntimeControlPresentation(draft.activity),activity:draft.activity,teaching:draft.teaching,exactEvidence};
});}
function decode(value:any,evidencePool:{id:string;sourceId:string;text:string}[]):any{
 if(Array.isArray(value))return value.map(item=>decode(item,evidencePool));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item]:[string,any])=>{
  if((key==='quote'||key==='evidence')&&item&&typeof item==='object'&&item.evidenceId){const entry=evidencePool.find(entry=>entry.id===item.evidenceId);expect(entry).toBeDefined();expect(entry!.sourceId).toBe(value.sourceId);return[key,entry!.text];}
  return[key,decode(item,evidencePool)];
 }));
}
describe('lossless compact source checking',()=>{
 it('reconstructs every mission field and precise citation without changing source context',async()=>{
  mock();const input=notebook(3);input.sources[0].text=input.sources[0].text.replaceAll(/3\. Confirm the selected reset (\d+)\./g,match=>`${match}\n\nThe recorded procedure applies only after the operator has inspected the selected settings and confirmed that the correct panel is open. Keep the equipment isolated while making these changes. Confirming an unrelated reset does not satisfy this procedure. Preserve the original selections if the documented conditions cannot be established.`);
  const result=await runGameDirector(input,options),batch=result.notebook.gameDesign!.batches[0],before=structuredClone(batch);
  const prompt=gameCheckingPrompt(batch),data=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]),original=unpooledMissions(batch);
  expect(decode(data.missions,data.evidencePool)).toEqual(original);expect(batch).toEqual(before);
  expect(prompt).toContain('COMPLETE verbatim text');expect(prompt).toContain('The pool is included in full');
  expect(prompt).toContain('Reject unsupported claims that these game controls');expect(prompt).toContain('source-supported factual statement about peer-reviewed research');
  const writingPrompt=JSON.parse((vi.mocked(fetch).mock.calls.find(([,body])=>JSON.parse((body as any).body).prompt.includes('STAGE: write'))![1] as any).body).prompt;
  expect(writingPrompt).toContain('this AI output always remains needs-review');expect(writingPrompt).toContain('does not prohibit an accurately cited source claim about peer-reviewed research');
  expect(JSON.stringify(data).length).toBeLessThan(JSON.stringify({missions:original}).length*0.9);
  expect(data.evidencePool.every((entry:any)=>original.some(mission=>mission.activity.sourceRefs.some(reference=>reference.sourceId===entry.sourceId&&reference.evidence.includes(entry.text))||mission.teaching.sourceWindows.some(reference=>reference.sourceId===entry.sourceId&&reference.quote.includes(entry.text))))).toBe(true);
  const disclosed=JSON.parse(writingPrompt.split('REFERENCE DATA (JSON):\n')[1]).missions;expect(disclosed.every((mission:any)=>(mission.teachingContextWindow.excerpt??mission.teachingContextWindow.beforeUnit+mission.unit.excerpt+mission.teachingContextWindow.afterUnit).includes(mission.unit.excerpt))).toBe(true);
  expect(data.evidencePool.every((entry:any)=>input.sources.some(source=>source.id===entry.sourceId&&source.text.includes(entry.text)))).toBe(true);
 });
 it('keeps identical quoted wording from different sources as distinct evidence entries',async()=>{
  mock();const result=await runGameDirector(notebook(),options),batch=structuredClone(result.notebook.gameDesign!.batches[0]);
  const sameText=batch.drafts![0].activity.sourceRefs[0].evidence;
  batch.drafts![0].activity.sourceRefs.push({sourceId:'another-source',evidence:sameText});
  const data=JSON.parse(gameCheckingPrompt(batch).split('REFERENCE DATA (JSON):\n')[1]);
  expect(decode(data.missions,data.evidencePool)).toEqual(unpooledMissions(batch));
  expect(data.evidencePool.filter((entry:any)=>entry.text===sameText)).toHaveLength(2);
 });
});

describe('AI creation does not promote untreated extraction drafts into missions',()=>{
 it('retains legacy ambiguity provenance and preserves reviewed or edited authored models',()=>{
  const source=createSource('parse -> chunk -> embed','Source pipeline');
  const old:DependencyActivity={version:1,id:'old-extraction',kind:'dependency',extractedFrom:source.id,title:'Source pipeline: relationships',instruction:'Reconstruct the structure explicitly stated in the source.',explanation:'This answer follows the supplied source structure. Review factual accuracy before publishing.',hint:'Use the exact relationships, categories or order stated in the source.',reviewStatus:'needs-review',sourceRefs:[{sourceId:source.id,evidence:source.text}],nodes:[{id:'node-1',label:'parse'},{id:'node-2',label:'embed'}],edges:[{from:'node-1',to:'node-2',relation:'chunk'}],acyclic:false};
  expect(hasAmbiguousExtractedRelationships(old)).toBe(true);
  const words={...old,id:'edited-words',instruction:'An author changed these directions.'};
  const nodes={...old,id:'edited-nodes',nodes:[{id:'node-1',label:'Document parsing'},{id:'node-2',label:'Document embedding'}]};
  const reviewed={...old,id:'reviewed-extraction',reviewStatus:'reviewed' as const};
  const result=prepareAutomaticLearning(createNotebook({sources:[source],activities:[old,words,nodes,reviewed]})),byId=new Map(result.notebook.activities!.map(activity=>[activity.id,activity]));
  expect(byId.get(old.id)).toEqual(old);expect(hasAmbiguousExtractedRelationships(byId.get(old.id)!)).toBe(true);
  expect(byId.get(words.id)).toEqual(words);expect(result.replaceableTextActivityIds).not.toContain(words.id);
  expect(byId.get(nodes.id)).toMatchObject({nodes:nodes.nodes});expect(byId.get(nodes.id)?.extractedFrom).toBeUndefined();
  expect(byId.get(reviewed.id)).toEqual(reviewed);expect(result.replaceableTextActivityIds).toEqual([old.id]);
 });
 it('keeps full source material while removing unmatched automatic text models from a fresh AI game',async()=>{
  const calls=mock(),input=notebook();input.sources[0].text+='\n\n# Source categories\nSensors > pressure sensor\nSensors > temperature sensor\nControllers > controller';
  const prepared=prepareAutomaticLearning(input).notebook;expect(prepared.activities!.some(activity=>activity.extractedFrom&&activity.kind==='classification')).toBe(true);
  // The separate relation unit is explicitly retained as study by the mock planner.
  const priorFetch=fetch;vi.stubGlobal('fetch',async(url:any,body:any)=>{
   const request=JSON.parse(body.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);
   if(stage!=='plan')return priorFetch(url,body);
   const value=directorFixtureResponse(stage,data);value.study=[...value.study,...value.missions.filter((mission:any)=>!data.units.find((unit:any)=>unit.unitId===mission.unitId).excerpt.includes('1. Open')).map((mission:any)=>({unitId:mission.unitId,reason:'Source study for these relationships.'}))];value.missions=value.missions.filter((mission:any)=>data.units.find((unit:any)=>unit.unitId===mission.unitId).excerpt.includes('1. Open'));calls.push({stage,data});return{ok:true,json:async()=>({text:JSON.stringify(value),usage})};
  });
  const result=await prepareGameExperience(prepared,{}, {...options,aiPolicy:'required'});
  expect(result.creationStatus,result.ai.message).toBe('ready');expect(result.notebook.sources).toEqual(input.sources);
  expect(result.notebook.activities!.every(activity=>!activity.extractedFrom)).toBe(true);
  expect(result.notebook.activities!.filter(activity=>activity.kind==='classification')).toHaveLength(0);
  expect(result.notebook.gameDesign!.batches.flatMap(batch=>batch.study??[]).length).toBeGreaterThan(0);
 });
 it('preserves reviewed, edited, authored, and recording-derived activities',async()=>{
  mock();const input=prepareAutomaticLearning(notebook()).notebook,base=input.activities![0];expect(base.extractedFrom).toBeTruthy();
  const edited={...base,instruction:'An author changed the directions deliberately.'};
  const reviewed={...base,id:'reviewed-model',reviewStatus:'reviewed' as const};
  const media={...base,id:'media-recording-model'};
  const authored={...base,id:'authored-model',extractedFrom:undefined};
  const result=await prepareGameExperience({...input,activities:[edited,reviewed,media,authored]}, {}, {...options,aiPolicy:'required'});
  expect(result.creationStatus,result.ai.message).toBe('ready');
  const retained=new Map(result.notebook.activities!.map(activity=>[activity.id,activity]));
  expect(retained.get(edited.id)?.instruction).toBe(edited.instruction);expect(retained.get(edited.id)?.extractedFrom).toBeUndefined();
  expect(retained.get(reviewed.id)).toEqual(reviewed);expect(retained.get(media.id)).toEqual(media);expect(retained.get(authored.id)).toEqual(authored);
 });
});
