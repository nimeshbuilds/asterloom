import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {createNotebook} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {validateGameDesign} from '../src/lib/gameDesign';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import {pictureAuthoringFixture,mediaAuthoringFixture,codeAuthoringFixture,recallAuthoringFixture,dialogueAuthoringFixture,type AuthoringFixture} from './gameDraftAuthoring.fixture';
import {evidenceReference,evidenceBlocks} from '../src/lib/evidence';
const config={provider:'chatgpt' as const,model:'bounded-contract-fixture',apiKey:'session-only'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
afterEach(()=>vi.unstubAllGlobals());
function mockWriter(fixture:AuthoringFixture,mutate?:(activity:any)=>void,useCitationIds=false){
 const requests:{stage:string;data:any;request:any}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  const request=JSON.parse(init.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);requests.push({stage,data,request});
  let reply=directorFixtureResponse(stage,data);
  if(stage==='plan'){
   const choice=data.choices.find((choice:any)=>choice.scaffoldId===fixture.recipe);expect(choice).toBeTruthy();
   reply={missions:[{id:'source-mission',unitId:data.units[0].unitId,kind:fixture.activity.kind,scaffoldId:fixture.recipe,title:fixture.activity.title,objective:fixture.lesson.slice(0,300),visualDirection:{scene:choice.scene,sourceAssetIds:[]}}],study:data.units.slice(1).map((unit:any)=>({unitId:unit.unitId,reason:'This remaining passage is available as source study.'}))};
  }else if(stage==='write'){
   const activity=structuredClone(fixture.activity);delete activity.scaffoldIds;delete activity.extractedFrom;activity.id='assistant-draft';activity.reviewStatus='needs-review';mutate?.(activity);
   const citations=[{sourceId:fixture.source.id,evidence:fixture.prose}],mission=reply.missions[0];
   mission.activity=activity;mission.teaching={title:fixture.activity.title,objective:fixture.lesson.slice(0,300),conceptExplanation:{text:fixture.lesson,citations},chunks:[{id:'meaning',title:'Understand the source idea',text:fixture.lesson.split(/(?<=\.)\s+/)[0],citations},{id:'apply',title:'Apply its distinction',text:fixture.lesson.split(/(?<=\.)\s+/).slice(1).join(' '),citations}],guidedApplication:{prompt:fixture.activity.instruction,steps:[fixture.activity.hint]}};
   if(useCitationIds){
    const catalog=data.missions[0].citationChoices,encode=(ref:any,scope:string)=>{const entry=catalog.entries.find((entry:any)=>entry[scope]&&entry.evidence===ref.evidence);expect(entry,ref.evidence).toBeDefined();return{sourceId:ref.sourceId,evidenceId:entry.evidenceId};};
    mission.activity.sourceRefs=mission.activity.sourceRefs.map((ref:any)=>encode(ref,'activity'));
    mission.teaching.conceptExplanation.citations=citations.map(ref=>encode(ref,'teaching'));
    mission.teaching.chunks.forEach((chunk:any)=>chunk.citations=citations.map(ref=>encode(ref,'teaching')));
   }
  }
  return{ok:true,json:async()=>({text:JSON.stringify(reply),usage:directorFixtureUsage,actualModels:['deterministic-contract-fixture']})};
 }));
 return requests;
}
const fixtureCases=[pictureAuthoringFixture,mediaAuthoringFixture,codeAuthoringFixture,recallAuthoringFixture,dialogueAuthoringFixture];
describe('director writes and restores real previously excluded contracts',()=>{
 it.each([recallAuthoringFixture,codeAuthoringFixture,mediaAuthoringFixture].map(make=>[make().recipe,make] as const))('resolves provider citation IDs before all production checks and saves for %s',async(_recipe,make)=>{
  const fixture=make();mockWriter(fixture,undefined,true);
  const result=await prepareGameExperience(createNotebook({ageGroup:fixture.ageGroup,sources:[fixture.source,...fixture.assets??[]]}),{},options);
  expect(result.creationStatus,result.ai.message+' '+JSON.stringify(result.notebook.gameDesign?.events?.filter(event=>event.category==='validation'))).toBe('ready');
  const activity=result.notebook.activities!.find(a=>a.id===result.ai.activityId)!;
  expect(activity.sourceRefs).toEqual(fixture.activity.sourceRefs);expect(JSON.stringify(result.notebook.activities)).not.toContain('"evidenceId":');
  expect(()=>parsePackage(serializePackage(result.notebook))).not.toThrow();
 });
 it.each(fixtureCases.map(make=>[make().recipe,make] as const))('prepares %s through plan, write, check and persistence',async(_recipe,make)=>{
  const fixture=make(),requests=mockWriter(fixture),input=createNotebook({ageGroup:fixture.ageGroup,sources:[fixture.source,...fixture.assets??[]]});
  const result=await prepareGameExperience(input,{},options);
  expect(result.creationStatus,result.ai.message+' '+JSON.stringify(result.notebook.gameDesign?.events?.filter(event=>event.category==='validation'))).toBe('ready');
  expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','check','overview']);
  const writer=requests.find(r=>r.stage==='write')!,written=result.notebook.activities!.find(a=>a.id===result.ai.activityId)!;
  expect(written).toMatchObject({kind:fixture.activity.kind,scaffoldIds:[fixture.recipe],reviewStatus:'needs-review'});
  if(fixture.recipe==='discovery-scenes')expect(writer.data.missions[0].sourceContext.picture.regions).toHaveLength(3);
  if(fixture.recipe==='media-checkpoints')expect(writer.data.missions[0].sourceContext.recording.cues).toHaveLength(2);
  if(['secure-code-review','language-dialogue-trail','discovery-scenes'].includes(fixture.recipe))expect(writer.request.outputSchema).toBeDefined();
  if(fixture.recipe==='recall-escape-mission')expect(writer.request.outputSchema).toBeDefined();
  expect(writer.request.prompt).not.toContain('base64,');
  const restored=parsePackage(serializePackage(result.notebook));expect(restored.gameDesign).toEqual(result.notebook.gameDesign);expect(restored.activities?.find(a=>a.id===written.id)).toEqual(written);
  expect(validateGameDesign(restored.gameDesign,restored)).toEqual(restored.gameDesign);
 });
 it('rejects code-inferred claims and repairs even when exact code is accepted as an observation',async()=>{
  const fixture=codeAuthoringFixture();mockWriter(fixture,activity=>activity.codeReview.repairs[0].evidenceRefs=[0]);
  const result=await prepareGameExperience(createNotebook({sources:[fixture.source]}),{},options);
  expect(result.creationStatus).toBe('failed');expect(result.notebook.gameDesign?.events?.some(event=>event.message.includes('non-code prose'))).toBe(true);
 });
 it('rejects a teaching citation moved into code after a successful secure-code draft',async()=>{
  const fixture=codeAuthoringFixture();mockWriter(fixture);const result=await prepareGameExperience(createNotebook({sources:[fixture.source]}),{},options);
  expect(result.creationStatus,result.ai.message).toBe('ready');
  const design=structuredClone(result.notebook.gameDesign!),code=fixture.activity.kind==='explanation'?fixture.activity.codeReview!.code:'';
  const ref=evidenceReference(evidenceBlocks(fixture.source).find(block=>block.quote===code)!);
  design.batches[0].drafts![0].teaching.conceptExplanation.citations=[ref];
  expect(()=>validateGameDesign(design,result.notebook)).toThrow(/non-code/);
 });
 it('does not accept arbitrary code quotations or a mixed code/prose quote as the dedicated code observation',async()=>{
  const fixture=codeAuthoringFixture();mockWriter(fixture,activity=>activity.sourceRefs[0].evidence=fixture.prose+'\n\n```js\n'+activity.codeReview.code);
  const result=await prepareGameExperience(createNotebook({sources:[fixture.source]}),{},options);
  expect(result.creationStatus).toBe('failed');expect(result.notebook.gameDesign?.events?.some(event=>event.message.includes('dedicated source quotation')),JSON.stringify(result.notebook.gameDesign?.events?.filter(event=>event.category==='validation'))).toBe(true);
 });
});
