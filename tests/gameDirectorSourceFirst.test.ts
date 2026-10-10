import {afterEach,describe,expect,it,vi} from 'vitest';
import {GAME_TEMPLATE_SKILL_VERSION,templateSkillFor} from '../src/lib/gameTemplateSkills';
import {getGameDirectorOutputSchema} from '../src/lib/gameDirectorSchemas';
import {runGameDirector} from '../src/lib/gameDirector';
import {createGameDesignValidator,gameDesignProgress,validateGameDesign,type GameDesign} from '../src/lib/gameDesign';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';
const config={provider:'compatible' as const,model:'first-model',apiKey:'session-only',baseUrl:'http://127.0.0.1:11434/v1'};
const options={ai:{config,consent:'create-game' as const}};
const notebook=(count=1)=>createNotebook({sources:[createSource(Array.from({length:count},(_,i)=>`# Procedure ${i+1}\n1. Open the settings panel ${i+1}.\n2. Choose the reset command ${i+1}.\n3. Confirm the selected reset ${i+1}.`).join('\n\n'),'Maintenance procedures')]});
function provider(transform?:(stage:string,data:any,value:any)=>any){
 const requests:{stage:string;data:any;prompt:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init.body),stage=body.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);requests.push({stage,data,prompt:body.prompt});let value=directorFixtureResponse(stage,data);if(transform)value=transform(stage,data,value);return{ok:true,json:async()=>({text:JSON.stringify(value),usage:directorFixtureUsage})};}));return requests;
}
afterEach(()=>vi.unstubAllGlobals());
describe('source-first campaign creation',()=>{
 it('analyzes every group before choosing a shared story, then uses it in all writers and reviewers',async()=>{
  const requests=provider(),saved:GameDesign[]=[],progress:any[]=[];
  const result=await runGameDirector(notebook(7),{...options,onCheckpoint:async design=>{saved.push(design);return true;},onProgress:p=>progress.push(p)});
  expect(result.status,result.message).toBe('ready');
  expect(requests.slice(0,4).map(r=>r.stage)).toEqual(['plan','plan','plan','direction']);
  const plans=requests.filter(request=>request.stage==='plan');
  expect(plans.map(request=>request.data.planningHistory.plannedMissionCount)).toEqual([0,3,6]);
  expect(plans[2].data.planningHistory.byKind).toEqual([{kind:'sequence',count:6}]);
  expect(plans[2].data.planningHistory.recentMissions).toHaveLength(6);
  expect(plans[2].data.planningHistory.recentMissions.every((mission:any)=>Object.keys(mission).sort().join(',')==='kind,objective,scaffoldId')).toBe(true);
  const direction=requests.find(r=>r.stage==='direction')!,design=result.notebook.gameDesign!;
  expect(direction.data.templateSkillVersion).toBe(GAME_TEMPLATE_SKILL_VERSION);
  expect(direction.data.choices.every((choice:any)=>choice.templateSkill.learningPrinciple&&choice.templateSkill.challengeFrame)).toBe(true);
  expect(direction.data.nativeTemplates.every((template:any)=>template.skill.version===1&&template.skill.engineOwns)).toBe(true);
  expect(direction.data.sourceAnalysis).toMatchObject({unitCount:7,missionCount:7,studyCount:0});
  expect(direction.data.sourceAnalysis.exampleObjectives.at(-1).title).toContain('7');
  for(const request of requests.filter(r=>r.stage==='write'||r.stage==='check')){
   expect(request.data.creativeDirection).toEqual(design.creativeDirection);
   for(const mission of request.data.missions){expect(mission.templateSkill).toMatchObject({version:GAME_TEMPLATE_SKILL_VERSION,scaffoldId:mission.plan.scaffoldId,authoring:'ai-writable'});expect(mission.templateSkill.beats.map((beat:any)=>beat.id)).toEqual(['briefing','teach','guided-practice','challenge','feedback','debrief']);}
   expect(request.prompt).toContain('Fill the lesson and activity content, not a new game design');
   expect(request.prompt).toContain('never relocate its authored setting or role');
  }
  expect(saved.every(d=>!d.batches.some(b=>b.drafts?.length)||!!d.creativeDirection)).toBe(true);
  expect(saved.some(d=>!!d.creativeDirection&&d.batches.every(b=>b.status==='planned'&&!b.drafts?.length))).toBe(true);
  expect(design).not.toHaveProperty('planningHistory');
  expect(progress.some(p=>p.currentPhase==='direction'&&p.completedSteps===7&&p.totalSteps===23)).toBe(true);
  expect(progress.map(p=>p.percent)).toEqual(progress.map(p=>p.percent).sort((a,b)=>a-b));
  expect(gameDesignProgress(design)).toMatchObject({completedSteps:23,totalSteps:23,percent:100});
  expect(design.receipts.filter(r=>r.stage==='direction')).toMatchObject([{status:'completed',validation:'accepted',usage:directorFixtureUsage}]);
  for(const batch of design.batches)for(const draft of batch.drafts??[])expect(draft.audioDirection).toEqual(design.creativeDirection!.audioDirection);
 });
 it('constrains primary writer sound to its saved choice and sends only the selected full skill',async()=>{
  const requests=provider();const result=await runGameDirector(notebook(),options);expect(result.status).toBe('ready');
  const write=requests.find(request=>request.stage==='write')!,mission=write.data.missions[0];
  expect(mission.templateSkill).toEqual(templateSkillFor(mission.plan.scaffoldId,'adult',{kind:'sequence',items:[]}));
  expect(write.data).not.toHaveProperty('templateSkills');expect(write.data.missions).toHaveLength(1);
  const schema:any=getGameDirectorOutputSchema('write',write.data),fields=schema.properties.missions.anyOf[0].items.properties.audioDirection.properties;
  for(const key of ['playTrackId','studyTrackId','effectProfileId','effects'])expect(fields[key].enum).toEqual([result.notebook.gameDesign!.creativeDirection!.audioDirection[key as 'playTrackId']]);
  expect(requests.map(request=>request.stage)).toEqual(['plan','direction','write','check','overview']);
 });
 it('saves direction before writing and reuses it after portable restore and an explicit provider/model switch',async()=>{
  const requests=provider(),first=await runGameDirector(notebook(4),{...options,maxRequests:3});
  expect(first.status).toBe('incomplete');expect(requests.map(r=>r.stage)).toEqual(['plan','plan','direction']);
  const restored=parsePackage(serializePackage(first.notebook)),direction=structuredClone(restored.gameDesign!.creativeDirection),receipts=structuredClone(restored.gameDesign!.receipts);
  expect(restored.gameDesign!.batches.every(b=>!b.drafts?.length)).toBe(true);
  const next=await runGameDirector(restored,{ai:{config:{provider:'chatgpt',model:'gpt-6.1-sol',apiKey:''},consent:'create-game'}});
  expect(next.status,next.message).toBe('ready');expect(next.notebook.gameDesign!.creativeDirection).toEqual(direction);
  expect(requests.filter(r=>r.stage==='direction')).toHaveLength(1);expect(requests.filter(r=>r.stage==='plan')).toHaveLength(2);
  expect(next.notebook.gameDesign!.receipts.slice(0,3)).toEqual(receipts);
  const count=requests.length,ready=await runGameDirector(next.notebook,{});expect(ready.status).toBe('ready');expect(ready.requestCount).toBe(0);expect(requests).toHaveLength(count);
 });
 it('never spends on direction if its request cannot be durably recorded',async()=>{
  const requests=provider(),result=await runGameDirector(notebook(),{...options,onCheckpoint:async d=>!d.receipts.some(r=>r.stage==='direction'&&r.status==='started')});
  expect(result.status).toBe('failed');expect(requests.map(r=>r.stage)).toEqual(['plan']);
  expect(result.notebook.gameDesign!.creativeDirection).toBeUndefined();expect(result.notebook.gameDesign!.batches[0].status).toBe('planned');
  expect(result.notebook.gameDesign!.receipts).toHaveLength(1);
 });
 it('retries a malformed direction once and resumes only that unfinished stage',async()=>{
  let invalid=true;const requests=provider((stage,_data,value)=>stage==='direction'&&invalid?{...value,primaryScaffoldId:'invented-world'}:value);
  const first=await runGameDirector(notebook(),options);expect(first.status).toBe('failed');
  expect(requests.map(r=>r.stage)).toEqual(['plan','direction','direction']);expect(first.notebook.gameDesign!.batches[0].drafts).toEqual([]);
  expect(first.notebook.gameDesign!.events?.filter(e=>e.phase==='direction').every(e=>e.batchId===undefined)).toBe(true);
  expect(first.notebook.gameDesign!.receipts.filter(r=>r.stage==='direction').every(r=>r.validation==='rejected')).toBe(true);
  invalid=false;const next=await runGameDirector(parsePackage(serializePackage(first.notebook)),options);
  expect(next.status,next.message).toBe('ready');expect(requests.map(r=>r.stage)).toEqual(['plan','direction','direction','direction','write','check','overview']);
 });
 it('does not add a campaign direction request to legacy saved writers or ready games',async()=>{
  const requests=provider(),first=await runGameDirector(notebook(),{...options,maxRequests:3});
  expect(first.notebook.gameDesign!.batches[0].status).toBe('written');
  const legacy=structuredClone(first.notebook);delete legacy.gameDesign!.directionPolicy;delete legacy.gameDesign!.creativeDirection;
  const next=await runGameDirector(parsePackage(serializePackage(legacy)),options);
  expect(next.status,next.message).toBe('ready');expect(requests.slice(3).map(r=>r.stage)).toEqual(['check','overview']);
  expect(next.notebook.gameDesign!.creativeDirection).toBeUndefined();
  const count=requests.length;expect((await runGameDirector(next.notebook,{})).status).toBe('ready');expect(requests).toHaveLength(count);
 });
 it('restarts direction for changed source inputs even if the editor already reset its old design',async()=>{
  const requests=provider(),first=await runGameDirector(notebook(),options),changed=structuredClone(first.notebook);
  changed.goal='Practice the maintenance order carefully.';changed.gameDesign=validateGameDesign(changed.gameDesign,changed);
  expect(changed.gameDesign.creativeDirection).toBeUndefined();expect(changed.gameDesign.batches.every(b=>b.status==='pending')).toBe(true);
  const next=await runGameDirector(changed,options);expect(next.status,next.message).toBe('ready');
  expect(next.notebook.gameDesign!.creativeDirection!.inputFingerprint).not.toBe(first.notebook.gameDesign!.creativeDirection!.inputFingerprint);
  expect(requests.filter(r=>r.stage==='direction')).toHaveLength(2);expect(next.notebook.gameDesign!.receipts.slice(0,first.requestCount)).toEqual(first.notebook.gameDesign!.receipts);
 });
 it('rejects changed sound choices in stored campaigns and does not trust hidden mutations of cached direction',async()=>{
  provider();const result=await runGameDirector(notebook(),options),original=result.notebook.gameDesign!,validate=createGameDesignValidator(result.notebook);
  expect(validate(original)).toEqual(original);
  const changed=structuredClone(original);changed.creativeDirection!.audioDirection.effects='off';
  expect(()=>validate(changed)).toThrow(/sound choices/);expect(()=>parsePackage(serializePackage({...result.notebook,gameDesign:changed}))).toThrow(/sound choices/);
  const hidden=structuredClone(original);(hidden.creativeDirection as any).unrecognized=undefined;
  expect(()=>validate(hidden)).toThrow(/unsupported/);
  const returned=validate(original);returned.creativeDirection!.title='Mutation of the returned copy';
  expect(validate(original).creativeDirection!.title).toBe(original.creativeDirection!.title);
 });
 it('refuses writer audio that conflicts with the saved source-selected soundtrack',async()=>{
  const requests=provider((stage,_data,value)=>{if(stage==='write')value.missions[0].audioDirection={...value.missions[0].audioDirection,effects:'off'};return value;});
  const result=await runGameDirector(notebook(),options);expect(result.status).toBe('failed');
  expect(requests.map(r=>r.stage)).toEqual(['plan','direction','write','write']);
  expect(result.notebook.gameDesign!.batches[0].drafts).toEqual([]);expect(result.message).toContain('audioDirection exactly');
 });
});
