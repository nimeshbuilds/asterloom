import {afterEach,describe,it,expect,vi} from 'vitest';
import {SCAFFOLDS,scaffoldById} from '../src/data/scaffolds';
import {worldForScaffold} from '../src/data/worlds';
import {ARTWORK_SETTINGS,worldArtworkFor} from '../src/lib/worldArtwork';
import {buildLessonStory,buildLessonActionGuide} from '../src/lib/lessonStory';
import {scaffoldStoryContext,scaffoldStorySummary} from '../src/lib/scaffoldStoryContext';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {buildLearningBriefing} from '../src/lib/learningBriefing';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
import type {Notebook} from '../src/types';

const config={provider:'compatible' as const,model:'mock-story-writer',apiKey:'synthetic-session-key',baseUrl:'http://127.0.0.1:11434/v1'};
const options={aiPolicy:'required' as const,ai:{config,consent:'create-game' as const}};
function input(){return createNotebook({sources:[createSource('# Reset procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance guide')]});}
function mockWriter(withAlternateFrame=false){
 const requests:{stage:string;data:any;prompt:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,body:any)=>{
  const request=JSON.parse(body.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);requests.push({stage,data,prompt:request.prompt});
  const value=directorFixtureResponse(stage,data);
  if(stage==='write'&&withAlternateFrame)for(const mission of value.missions)mission.teaching.storyFrame={fictional:true,setting:'A moon castle with flying chariots.',role:'dragon rider',mission:'Restore the documented reset route for the next traveler.',success:'A reset route that keeps the source order intact.'};
  return{ok:true,json:async()=>({text:JSON.stringify(value),usage:directorFixtureUsage,actualModels:['mock-story-writer']})};
 }));return requests;
}
afterEach(()=>vi.unstubAllGlobals());
function savedContent(notebook:Notebook){
 const {events:_events,...design}=notebook.gameDesign!;
 return{design,teaching:notebook.aiLearningPlan,activities:notebook.activities,sources:notebook.sources};
}
function expectResumePreserved(before:Notebook,after:Notebook){
 expect(savedContent(after)).toEqual(savedContent(before));
 const previous=before.gameDesign!.events??[],next=after.gameDesign!.events??[];
 expect(next.slice(0,previous.length)).toEqual(previous);
 expect(next.slice(previous.length)).toEqual([expect.objectContaining({phase:'finish',kind:'completed'})]);
}

describe('one visual setting for authored and AI learning stories',()=>{
 it('binds every supported scaffold audience to its actual bundled image without altering its authored role',()=>{
  for(const scaffold of SCAFFOLDS)for(const age of scaffold.ages){
   const art=worldArtworkFor(worldForScaffold(scaffold.id),age),story=buildLessonStory(scaffold,age),summary=scaffoldStorySummary(scaffold.id,age);
   expect(story.setting).toBe(`${art.name}: ${ARTWORK_SETTINGS[art.id]}`);expect(story.setting.length).toBeLessThanOrEqual(350);expect(story.role.length).toBeLessThanOrEqual(100);expect(summary).toEqual({setting:art.name,role:story.role});
  }
 });
 it('uses child art for children and the actual dedicated grown-up art for common scaffolds',()=>{
  for(const [scaffoldId,artId,kind] of [['process-reconstruction','process-waterworks','sequence'],['classification-workshop','sorting-foundry','classification'],['concept-map-repair','systems-observatory','dependency']] as const){
   const adult=scaffoldStoryContext(scaffoldId,'adult',{kind}),child=scaffoldStoryContext(scaffoldId,'6-8',{kind});
   expect(adult.artwork.id).toBe(artId);expect(child.artwork.id).toBe('junior-discovery');expect(child.setting).not.toBe(adult.setting);expect(adult.actionGuide).toEqual(buildLessonActionGuide({kind}));expect(adult.visibleMotifs).toBe(ARTWORK_SETTINGS[artId]);expect(adult.boundaries.join(' ')).toContain('not evidence');
  }
 });
 it('keeps planning choices compact while including the actual setting and role',()=>{
  for(const choice of gameRecipeChoices('adult')){
   expect(choice.story).toEqual(scaffoldStorySummary(choice.scaffoldId,'adult'));expect(Object.keys(choice.story)).toEqual(['setting','role']);expect(choice).not.toHaveProperty('storyContext');
  }
 });
 it('describes real placement and connection controls rather than abstract engine terminology',()=>{
  expect(buildLessonActionGuide({kind:'classification'}).act).toBe('Choose an item, then place it in every group the source supports.');
  expect(buildLessonActionGuide({kind:'sequence'}).act).toBe('Choose a step, then move it into the order the source supports.');
  expect(buildLessonActionGuide({kind:'sequence',items:Array(24)}).act).toBe('Choose a step card, then use Move earlier or Move later to put it in order.');
  expect(buildLessonActionGuide({kind:'sequence',items:Array(25)}).act).toBe('Choose a step, then choose Place here at its destination.');
  expect(buildLessonActionGuide({kind:'dependency'}).act).toBe('Choose a starting concept, its relationship, and a target; then connect them.');
 });
});

describe('new AI stories are grounded in the selected offline game world',()=>{
 it('propagates the world through plan/write/check, binds supplied fiction locally, and retains it in offline play without extra calls',async()=>{
  const requests=mockWriter(true),result=await prepareGameExperience(input(),{},options);expect(result.creationStatus,result.ai.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','write','check','overview']);
  const activity=result.notebook.activities!.find(a=>a.id===result.ai.activityIds![0])!,scaffoldId=activity.scaffoldIds![0],context=scaffoldStoryContext(scaffoldId,result.notebook.ageGroup,activity),teaching=result.notebook.aiLearningPlan!.missions.find(m=>m.activityId===activity.id)!;
  expect(requests[0].data.choices.find((c:any)=>c.scaffoldId===scaffoldId).story).toEqual(scaffoldStorySummary(scaffoldId,result.notebook.ageGroup));
  expect(requests[1].data.missions[0].storyContext).toEqual(scaffoldStoryContext(scaffoldId,result.notebook.ageGroup,{kind:activity.kind,...(activity.kind==='sequence'?{items:[]}: {})}));expect(requests[2].data.missions[0].storyContext).toEqual(context);
  expect(requests[1].prompt).toContain('setting and role copied EXACTLY');expect(requests[1].prompt).toContain('each chunk one clear idea');expect(requests[2].prompt).toContain('Reject promised unimplemented interactions');
  for(const text of ['meaning','condition','application','source','acronym','referen','actionGuide','title','metacommentary']){expect(requests[1].prompt).toContain(text);expect(requests[2].prompt).toContain(text);}
  expect(requests[1].prompt).toContain('never invent a case');expect(requests[2].prompt).toContain('do not require extra examples');expect(requests[2].prompt).toContain('Choose source-study for dense or incoherent teaching');
  expect(teaching.storyFrame).toEqual({fictional:true,setting:context.setting,role:context.role,mission:'Restore the documented reset route for the next traveler.',success:'A reset route that keeps the source order intact.'});expect(requests[2].data.missions[0].teaching.storyFrame).toEqual(teaching.storyFrame);
  const offline=parsePackage(serializePackage(result.notebook)),scaffold=scaffoldById(scaffoldId)!;
  expect(offline.aiLearningPlan!.missions.find(m=>m.activityId===activity.id)?.storyFrame).toEqual(teaching.storyFrame);
  const lesson=buildLearningBriefing({notebook:offline,scaffold,activity:offline.activities!.find(a=>a.id===activity.id)!});expect(lesson.story).toMatchObject({setting:context.setting,role:context.role,mission:teaching.storyFrame!.mission,payoff:teaching.storyFrame!.success});
  expect(offline.sources).toEqual(result.notebook.sources);expect(offline.gameDesign!.receipts).toEqual(result.notebook.gameDesign!.receipts);
  const resumed=await prepareGameExperience(offline,{}, {aiPolicy:'required'});expect(resumed.ai.requestCount).toBe(0);expect(requests).toHaveLength(4);expectResumePreserved(offline,resumed.notebook);
 });
 it('supplies a source-neutral authored frame when a new writer omits optional fiction',async()=>{
  mockWriter();const result=await prepareGameExperience(input(),{},options);expect(result.creationStatus).toBe('ready');const activity=result.notebook.activities!.find(a=>a.id===result.ai.activityIds![0])!,teaching=result.notebook.aiLearningPlan!.missions.find(m=>m.activityId===activity.id)!,context=scaffoldStoryContext(activity.scaffoldIds![0],result.notebook.ageGroup,activity);
  expect(teaching.storyFrame).toEqual({fictional:true,setting:context.setting,role:context.role,mission:context.storyBeats.arrival,success:context.storyBeats.success});
 });
 it.each(['omitted','custom'] as const)('preserves old paid drafts and %s story frames instead of rebuilding or migrating them',async(mode)=>{
  const requests=mockWriter(),created=await prepareGameExperience(input(),{},options);expect(created.creationStatus).toBe('ready');const old=structuredClone(created.notebook) as Notebook;
  // Existing releases allowed omitted story frames, and saved creative framing.
  const legacy={fictional:true as const,setting:'The previously saved workshop.',role:'archive keeper',mission:'Rebuild the documented sequence.',success:'The saved source order remains intact.'};
  for(const mission of old.aiLearningPlan!.missions){if(mode==='omitted')delete mission.storyFrame;else mission.storyFrame={...legacy};}
  for(const batch of old.gameDesign!.batches)for(const draft of batch.drafts??[]){if(mode==='omitted')delete draft.teaching.storyFrame;else draft.teaching.storyFrame={...legacy};}
  const resumed=await prepareGameExperience(old,{}, {aiPolicy:'required'});expect(resumed.ai.requestCount).toBe(0);expect(requests).toHaveLength(4);expectResumePreserved(old,resumed.notebook);
  const activity=old.activities!.find(a=>a.id===created.ai.activityIds![0])!,scaffold=scaffoldById(activity.scaffoldIds![0])!,lesson=buildLearningBriefing({notebook:old,scaffold,activity});expect(lesson.story.setting).toBe(mode==='custom'?legacy.setting:scaffoldStoryContext(scaffold.id,old.ageGroup,activity).setting);if(mode==='custom')expect(lesson.story).toMatchObject({role:legacy.role,mission:legacy.mission,payoff:legacy.success});
 });
});
