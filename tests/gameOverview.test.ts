import {afterEach,describe,expect,it,vi} from 'vitest';
import {createNotebook,createSource} from '../src/lib/utils';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {parsePackage,serializePackage} from '../src/lib/package';
import {validateGameDesign} from '../src/lib/gameDesign';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {createOverviewWork,gameOverviewView,overviewRequestData,validateOverviewDraft,validateOverviewNotes} from '../src/lib/gameOverview';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import {summarizeAIUsage} from '../src/lib/aiUsage';
const config={provider:'compatible' as const,model:'overview-test',apiKey:'ephemeral',baseUrl:'http://127.0.0.1:11434/v1'},options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
const notebook=(count=1)=>createNotebook({sources:[createSource(Array.from({length:count},(_,i)=>`# Procedure ${i+1}\n1. Open panel ${i+1}.\n2. Select command ${i+1}.\n3. Confirm command ${i+1}.`).join('\n\n'),'A procedure collection')]});
function provider(transform?:(stage:string,data:any,result:any)=>any){const calls:any[]=[];const fetch=vi.fn(async(_url,init)=>{const body=JSON.parse(init.body),stage=body.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);calls.push({stage,data,body});const result=directorFixtureResponse(stage,data);return{ok:true,json:async()=>({text:JSON.stringify(transform?transform(stage,data,result):result),usage:directorFixtureUsage})};});vi.stubGlobal('fetch',fetch);return{calls,fetch};}
afterEach(()=>vi.unstubAllGlobals());
describe('whole-game introductions without repeated source creation',()=>{
 it('summarizes every planned section including late reading-only material and accounts for the one extra request',async()=>{
  const mock=provider((stage,_data,result)=>{if(stage==='plan'){const last=result.missions.at(-1);result.missions=result.missions.filter((m:any)=>m!==last);result.study.push({unitId:last.unitId,reason:'Useful background without a distinct new mission.'});}return result;});
  const input=notebook(3),result=await prepareGameExperience(input,{},options);expect(result.creationStatus,result.ai.message).toBe('ready');
  const overview=mock.calls.filter(c=>c.stage==='overview');expect(overview).toHaveLength(1);expect(overview[0].data.units).toHaveLength(3);expect(overview[0].data.units.every((unit:any)=>unit.savedSummary&&!unit.excerpt)).toBe(true);
  expect(overview[0].data.units.at(-1).savedSummary.citations[0].quote).toContain('command 3');expect(overview[0].data.units.at(-1).mission).toBeUndefined();
  expect(result.notebook.gameDesign!.overview!.nodes.at(-1)?.status).toBe('ready');expect(result.notebook.sources).toEqual(input.sources);expect(summarizeAIUsage(result.notebook.gameDesign!.receipts).requests).toBe(mock.calls.length);expect(summarizeAIUsage(result.notebook.gameDesign!.receipts).input.value).toBe(mock.calls.length*100);
  const parsed=parsePackage(serializePackage(result.notebook));expect(parsed.gameDesign!.overview).toEqual(result.notebook.gameDesign!.overview);expect(gameOverviewView(parsed).origin).toBe('generated');expect(serializePackage(parsed)).not.toContain(config.apiKey);
 });
 it('pauses before introduction, then resumes only that request after portable restore',async()=>{
  const mock=provider(),first=await prepareGameExperience(notebook(),{}, {...options,maxRequests:3});expect(first.creationStatus).toBe('incomplete');expect(mock.calls.map(c=>c.stage)).toEqual(['plan','write','check']);expect(first.notebook.gameDesign!.overview!.nodes[0].status).toBe('pending');
  const second=await prepareGameExperience(parsePackage(serializePackage(first.notebook)),{},options);expect(second.creationStatus,second.ai.message).toBe('ready');expect(mock.calls.map(c=>c.stage)).toEqual(['plan','write','check','overview']);
  const before=JSON.stringify(second.notebook),again=await prepareGameExperience(second.notebook,{}, {aiPolicy:'required'});expect(again.ai.requestCount).toBe(0);expect(mock.calls).toHaveLength(4);expect(again.notebook.gameDesign!.overview).toEqual(second.notebook.gameDesign!.overview);expect(JSON.stringify(second.notebook)).toBe(before);
 });
 it('resumes an overview without mislabeling a neighboring teaching definition as primary-unit evidence',async()=>{
  const source=createSource('# Matching labels\nA match means the parcel label and the record have exactly the same words.\n\n# Parcel procedure\n1. Read the parcel label.\n2. Compare the label with the record.\n3. Move the parcel only when the words match.','Workshop instructions'),input=createNotebook({sources:[source]});
  const definition='A match means the parcel label and the record have exactly the same words.';
  const mock=provider((stage,data,result)=>{
   if(stage==='plan'){const selected=data.units.find((unit:any)=>unit.excerpt.includes('1. Read'));result.missions=result.missions.filter((mission:any)=>mission.unitId===selected.unitId);result.study=data.units.filter((unit:any)=>unit.unitId!==selected.unitId).map((unit:any)=>({unitId:unit.unitId,reason:'This definition prepares the procedure.'}));delete result.overviewNotes;}
   if(stage==='write'){expect(data.missions[0].unit.excerpt).not.toContain(definition);expect(data.missions[0].teachingContextWindow.excerpt).toContain(definition);result.missions[0].teaching.conceptExplanation={text:'Matching requires exactly the same words on the label and record.',citations:[{sourceId:source.id,evidence:definition}]};}
   return result;
  });
  const first=await prepareGameExperience(input,{}, {...options,maxRequests:3});expect(first.creationStatus,first.ai.message).toBe('incomplete');expect(mock.calls.map(call=>call.stage)).toEqual(['plan','write','check']);
  const saved=parsePackage(serializePackage(first.notebook)),draft=saved.gameDesign!.batches[0].drafts![0];expect(draft.activity.sourceRefs.every(ref=>!ref.evidence.includes(definition))).toBe(true);expect(draft.teaching.conceptExplanation.citations[0].quote).toBe(definition);expect(mock.calls.find(call=>call.stage==='check')!.data.evidencePool.some((ref:any)=>ref.text.includes(definition))).toBe(true);
  const resumed=await prepareGameExperience(saved,{},options);expect(resumed.creationStatus,resumed.ai.message).toBe('ready');expect(mock.calls.map(call=>call.stage)).toEqual(['plan','write','check','overview']);
  const overview=mock.calls.at(-1)!.data,primary=overview.units.find((unit:any)=>unit.mission);expect(primary.excerpt).toContain('1. Read the parcel label.');expect(primary.savedSummary).toBeUndefined();expect(primary.excerpt).not.toContain(definition);expect(overview.units.some((unit:any)=>unit.excerpt?.includes(definition))).toBe(true);
  expect(resumed.notebook.sources).toEqual(input.sources);expect(resumed.notebook.gameDesign!.receipts.slice(0,3)).toEqual(saved.gameDesign!.receipts);expect(parsePackage(serializePackage(resumed.notebook)).gameDesign!.overview).toEqual(resumed.notebook.gameDesign!.overview);
 });
 it('does not send an overview until its request receipt can be saved',async()=>{
  const mock=provider();const result=await prepareGameExperience(notebook(),{}, {...options,onCheckpoint:async design=>!design.receipts.some(receipt=>receipt.stage==='overview'&&receipt.status==='started')});
  expect(result.creationStatus).toBe('failed');expect(mock.calls.map(c=>c.stage)).toEqual(['plan','write','check']);expect(result.notebook.gameDesign!.receipts).toHaveLength(3);expect(result.notebook.gameDesign!.overview!.nodes[0].status).toBe('pending');
 });
 it('bounds invalid overview repair without discarding missions or presenting invented prose',async()=>{
  const mock=provider((stage,_data,result)=>{if(stage==='overview')result.introduction.citations=[{unitId:'invented',evidence:'A fabricated summary.'}];return result;});
  const result=await prepareGameExperience(notebook(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(mock.calls.filter(c=>c.stage==='overview')).toHaveLength(2);expect(result.notebook.aiLearningPlan!.missions).toHaveLength(1);expect(result.notebook.gameDesign!.overview!.nodes[0].status).toBe('unavailable');expect(gameOverviewView(result.notebook).origin).toBe('saved-lessons');expect(result.warnings.join(' ')).toContain('introduction');
  expect(result.notebook.gameDesign!.receipts.filter(r=>r.stage==='overview')).toHaveLength(2);expect(parsePackage(serializePackage(result.notebook)).gameDesign!.overview).toEqual(result.notebook.gameDesign!.overview);
 });
 it('preserves old ready games and gives an honest useful offline preview without automatic spending',async()=>{
  const mock=provider(),built=await prepareGameExperience(notebook(3),{},options),legacy=structuredClone(built.notebook);delete legacy.gameDesign!.overview;for(const batch of legacy.gameDesign!.batches)delete batch.overviewNotes;
  const before=JSON.stringify(legacy),oldReceipts=structuredClone(legacy.gameDesign!.receipts);mock.fetch.mockClear();
  const view=gameOverviewView(legacy);expect(view.origin).toBe('saved-lessons');expect(view.missionCount).toBe(3);expect(view.lessonTitles).toHaveLength(3);expect(view.content!.keyIdeas).toHaveLength(3);
  expect(JSON.stringify(legacy)).toBe(before);expect(mock.fetch).not.toHaveBeenCalled();const result=await prepareGameExperience(legacy,{}, {aiPolicy:'required'});expect(result.creationStatus).toBe('ready');expect(result.ai.requestCount).toBe(0);expect(result.notebook.gameDesign!.overview).toBeUndefined();expect(result.notebook.gameDesign!.batches).toEqual(legacy.gameDesign!.batches);expect(result.notebook.gameDesign!.receipts).toEqual(oldReceipts);
 });
 it('rejects forged citations, coverage, locators, or references to another mission on import',async()=>{
  provider();const built=await prepareGameExperience(notebook(2),{},options),design=built.notebook.gameDesign!;
  for(const corrupt of [(d:any)=>d.overview.nodes[0].unitIds.pop(),(d:any)=>d.overview.nodes[0].content.introduction.citations[0].quote='Invented',(d:any)=>d.overview.nodes[0].content.introduction.citations[0].locator.label='Page99',(d:any)=>d.overview.nodes[0].content.keyIdeas[0].activityIds=['unrelated']]){const changed=structuredClone(design);corrupt(changed);expect(()=>validateGameDesign(changed,built.notebook)).toThrow();}
  const edited={...built.notebook,sources:built.notebook.sources.map(s=>({...s,text:s.text+'\nChanged source detail.'}))};expect(validateGameDesign(design,edited).overview).toBeUndefined();expect(gameOverviewView(edited).origin).not.toBe('generated');
 });
 it('builds a bounded summary tree over every section instead of silently selecting a prefix',()=>{
  const input=notebook(260),inventory=buildDirectorSourceInventory(input),context={...input,units:inventory.units,batches:[]},work=createOverviewWork(context);
  const leaves=work.nodes.filter(node=>!node.children.length);expect(leaves.length).toBeGreaterThan(1);expect(leaves.flatMap(node=>node.unitIds)).toEqual(inventory.units.map(unit=>unit.id));expect(work.nodes.at(-1)!.unitIds).toEqual(inventory.units.map(unit=>unit.id));expect(new Set(leaves.flatMap(node=>node.unitIds)).size).toBe(inventory.units.length);
  for(const node of leaves)expect(new TextEncoder().encode(JSON.stringify(overviewRequestData(node,work,context))).length).toBeLessThan(120000);
 });
 it('rejects cover or code quotations and guessed undisclosed references in summary notes',()=>{
  const source=createSource('# A guide\n\n```js\nconst steps = "open, choose, confirm";\n```\n\n1. Open the panel.\n2. Choose the command.\n3. Confirm the operation.','Technical guide'),input=createNotebook({sources:[source]}),inventory=buildDirectorSourceInventory(input),context={...input,units:inventory.units,batches:[]},unit=inventory.units.find(unit=>unit.excerpt.includes('const steps'))!;
  expect(()=>validateOverviewNotes([{unitId:unit.id,summary:{text:'Run the provided code.',citations:[{unitId:unit.id,evidence:'const steps = "open, choose, confirm";'}]}}],[unit.id],context)).toThrow(/instructional|exact/);
 });
 it('cannot invent a relation between an overview idea and an unrelated mission',async()=>{
  provider();const built=await prepareGameExperience(notebook(2),{},options),inventory=buildDirectorSourceInventory(built.notebook),context={...built.notebook,units:inventory.units,batches:built.notebook.gameDesign!.batches},work=built.notebook.gameDesign!.overview!,node=work.nodes[0],draft=structuredClone(node.content!);
  const other=built.notebook.gameDesign!.batches[0].drafts![1].activity.id;draft.keyIdeas[0].activityIds=[other];expect(()=>validateOverviewDraft(draft,node,work,context)).toThrow(/linked mission/);
 });
});
