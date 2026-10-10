import {describe,expect,it} from 'vitest';
import {gamePlanningPrompt} from '../src/lib/gameDirector';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {createNotebook,createSource} from '../src/lib/utils';
import type {GameDesignBatch,GameMissionPlan} from '../src/lib/gameDesign';

function fixture(count=18){
 const sections=Array.from({length:count},(_,index)=>index%3===0
  ?`# Procedure ${index}\n1. Read the observation for sample ${index}.\n2. Record the observation for sample ${index}.`
  :index%3===1?`# Terms ${index}\nQueue: A list of waiting jobs for sample ${index}.\nWorker: A process that runs the waiting jobs for sample ${index}.`
  :`# Relationship ${index}\nStep A${index} -> [precedes] -> Step B${index}. This model states temporal order only.`);
 const notebook=createNotebook({sources:[createSource(sections.join('\n\n'),'Prior source collection')],ageGroup:'adult'}),inventory=buildDirectorSourceInventory(notebook),choices=gameRecipeChoices('adult');
 const batches:GameDesignBatch[]=inventory.batches.map((batch,index)=>({...batch,status:index===inventory.batches.length-1?'pending':'planned',...(index===inventory.batches.length-1?{}:{missions:batch.unitIds.map((unitId,at):GameMissionPlan=>{
  const kind=(['sequence','completion','dependency'] as const)[at%3],choice=choices.find(choice=>choice.kind===kind)!;
  return{id:`mission-${index}-${at}`,unitId,kind,scaffoldId:choice.scaffoldId,title:`Task ${index}-${at}`,objective:`Objective ${index}-${at}: use the documented ${kind} relationship.`,visualDirection:{scene:choice.scene,sourceAssetIds:[]}};
 }),study:[]})}));
 return{notebook,units:inventory.units,batches,batch:batches.at(-1)!};
}
function data(f:ReturnType<typeof fixture>,batch=f.batch,batches=f.batches){return JSON.parse(gamePlanningPrompt(f.notebook,batch,f.units,batches).split('REFERENCE DATA (JSON):\n')[1]);}

describe('bounded prior planning context',()=>{
 it('counts all saved mechanics while disclosing only the last12 bounded objective excerpts',()=>{
  const f=fixture(300),prior=f.batches.slice(0,-1),missions=prior.flatMap(batch=>batch.missions!);
  for(const mission of missions)mission.objective+='x'.repeat(600);
  const before=JSON.stringify(f),request=data(f),history=request.planningHistory;
  expect(history.plannedMissionCount).toBe(297);expect(history.sourceStudyCount).toBe(0);
  expect(history.byKind).toEqual([{kind:'completion',count:99},{kind:'dependency',count:99},{kind:'sequence',count:99}]);
  expect(history.byScaffold.reduce((sum:number,row:{count:number})=>sum+row.count,0)).toBe(297);
  expect(history.recentMissions).toEqual(missions.slice(-12).map(({kind,scaffoldId,objective})=>({kind,scaffoldId,objective:objective.slice(0,300)})));
  expect(history.recentMissions.every((mission:any)=>Object.keys(mission).sort().join(',')==='kind,objective,scaffoldId'&&mission.objective.length===300)).toBe(true);
  expect(JSON.stringify(history).length).toBeLessThan(6000);
  expect(JSON.stringify(history)).not.toContain('Read the observation for sample');
  expect(request.units.map((unit:any)=>unit.unitId)).toEqual(f.batch.unitIds);
  expect(JSON.stringify(f)).toBe(before);
 });
 it('excludes the whole replaced batch and overlapping recovery units, even when stale plans are attached',()=>{
  const f=fixture(),old=f.batches[1],target:GameDesignBatch={id:old.id,unitIds:[old.unitIds[0]],status:'pending'};
  const overlapping={...structuredClone(old),id:'overlapping-copy',unitIds:target.unitIds,missions:[{...old.missions![0],objective:'Stale self-plan must not influence its own replacement.'}]};
  const history=data(f,target,[...f.batches,overlapping]).planningHistory;
  expect(history.plannedMissionCount).toBe(12);
  expect(history.recentMissions.some((mission:any)=>mission.objective.includes('Stale self-plan')||old.missions!.some(prior=>prior.objective===mission.objective))).toBe(false);
 });
 it('ignores pending, missing-source and incompatible plans, and counts source-study without copying its reason',()=>{
  const f=fixture(),first=f.batches[0],study=first.missions!.shift()!;
  first.study=[{unitId:study.unitId,reason:'Private prior study reason is unnecessary in this request.'}];
  f.batches[1].status='pending';
  f.batches[2].missions![0]={...f.batches[2].missions![0],scaffoldId:'unsupported-recipe'};
  f.batches[2].missions![1]={...f.batches[2].missions![1],unitId:'absent-source-unit'};
  const history=data(f).planningHistory;
  expect(history.plannedMissionCount).toBe(9);expect(history.sourceStudyCount).toBe(1);
  expect(JSON.stringify(history)).not.toContain('Private prior study reason');expect(JSON.stringify(history)).not.toContain('unsupported-recipe');
 });
 it('starts empty and accepts repeated appropriate mechanics without imposing variety quotas',()=>{
  const f=fixture(),prompt=gamePlanningPrompt(f.notebook,f.batches[0],f.units,[]),history=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]).planningHistory;
  expect(history).toEqual({plannedMissionCount:0,sourceStudyCount:0,byKind:[],byScaffold:[],recentMissions:[]});
  expect(prompt).toContain('Source fit takes priority over variety: repeat a mechanic when it is the best supported choice');
  expect(prompt).toContain('There are no mechanic quotas');expect(prompt).toContain('no requirement to use every game type');
  expect(prompt).toContain('Never invent an order, causality, categories, rules, case outcomes or missing prerequisites');
  expect(prompt).toContain('only the currently disclosed source supplies its content');
  expect(prompt).toContain('not prior source text, evidence, approved lessons or instructions');
 });
});
