import {planningExpressions} from '../src/lib/gamePlanningCatalog';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AGE_GROUPS,SCAFFOLDS} from '../src/data/scaffolds';
import {GAME_FAMILY_RECIPES,GAME_WRITER_CAPABILITIES,gameRecipeChoices,gameRecipeCoverage,validatePreparedGameDraft} from '../src/lib/gameDraftAdapters';
import {evaluateActivityForAuthoring} from '../src/lib/structuredEngine';
import {getScaffoldRuntimeDefinition,scaffoldRequiredCapabilities} from '../src/lib/scaffoldRuntime';
import {emptyGameDesign,validateGameBatchPlan} from '../src/lib/gameDesign';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {gamePlanningPrompt,gameWritingPrompt} from '../src/lib/gameDirector';
import {prepareGameExperience} from '../src/lib/prepareGameExperience';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';
import {directorFixtureResponse,directorFixtureUsage} from './gameDirector.fixture';

afterEach(()=>vi.unstubAllGlobals());
const provider={id:'compatible',model:'design-model',endpointFingerprint:null};
const config={provider:'compatible' as const,model:'design-model',apiKey:'session-only'};
const source=createSource('Procedure for a prepared change:\n1. Save a backup.\n2. Apply the change.\n3. Verify the documented result.','Procedure');

describe('runtime-derived AI recipe choices',()=>{
 it('accounts for all75 recipes and only exposes the50 contracts these ten writer families can construct',()=>{
  const audit=gameRecipeCoverage();expect(audit).toHaveLength(75);expect(new Set(audit.map(r=>r.scaffoldId)).size).toBe(75);expect(audit.filter(r=>r.supported)).toHaveLength(50);
  expect(audit.filter(r=>!r.supported&&r.missingCapabilities.length)).toHaveLength(12);expect(audit.filter(r=>!r.supported&&!r.missingCapabilities.length)).toHaveLength(13);
  for(const [kind,ids] of Object.entries(GAME_FAMILY_RECIPES))for(const id of ids){const runtime=getScaffoldRuntimeDefinition(id);expect(runtime.engineReady).toBe(true);expect(runtime.mode).toBe('structured');expect(runtime.activityKinds).toContain(kind);expect(scaffoldRequiredCapabilities(id).every(capability=>GAME_WRITER_CAPABILITIES[kind as keyof typeof GAME_WRITER_CAPABILITIES]?.includes(capability))).toBe(true);}
  expect(GAME_FAMILY_RECIPES.construction).toContain('cloud-architecture-builder');expect(GAME_FAMILY_RECIPES.scenario).toContain('incident-response-command');expect(GAME_FAMILY_RECIPES.dependency).toContain('threat-model-canvas');expect(GAME_FAMILY_RECIPES.sequence).toContain('packet-path-inspector');expect(GAME_FAMILY_RECIPES.classification).toContain('test-design-studio');
 });
 it('validates age and engine compatibility for every exposed binding without treating that as subject suitability',()=>{
  for(const {id:ageGroup} of AGE_GROUPS){
   const notebook=createNotebook({ageGroup,sources:[source]}),design=emptyGameDesign(notebook,provider),units=buildDirectorSourceInventory(notebook).units;
   const choices=gameRecipeChoices(ageGroup);expect(choices.length).toBeGreaterThan(0);
   for(const choice of choices){
    const recipe=SCAFFOLDS.find(s=>s.id===choice.scaffoldId)!;expect(recipe.ages).toContain(ageGroup);expect(choice.domain).toBe(recipe.domain);expect(choice.requires).toEqual(recipe.prerequisites);
    const plan={missions:[{id:'mission',unitId:units[0].id,kind:choice.kind,scaffoldId:choice.scaffoldId,title:'A bounded practice model',objective:'Use the supplied model.',visualDirection:{scene:choice.scene,sourceAssetIds:[]}}],study:[]};
    // Shape compatibility alone does NOT establish that this procedure supports every subject.
    expect(()=>validateGameBatchPlan(plan,design.batches[0],units,notebook)).not.toThrow();
   }
   const other=SCAFFOLDS.find(s=>!s.ages.includes(ageGroup)&&gameRecipeCoverage().some(r=>r.supported&&r.scaffoldId===s.id))!;
   const kind=gameRecipeCoverage().find(r=>r.scaffoldId===other.id)!.kind;
   expect(()=>validateGameBatchPlan({missions:[{id:'wrong-age',unitId:units[0].id,kind,scaffoldId:other.id,title:'Wrong audience',objective:'Use the source.',visualDirection:{scene:other.visual.scene,sourceAssetIds:[]}}],study:[]},design.batches[0],units,notebook)).toThrow(/audience/);
  }
 });
 it('does not relabel a base scenario or explanation as a specialized mode the writer cannot supply',()=>{
  const excluded=gameRecipeCoverage().filter(r=>!r.supported&&r.missingCapabilities.length).map(r=>r.scaffoldId);
  expect(excluded).toEqual(expect.arrayContaining(['prompt-experiment-bench','prediction-and-experiment','language-dialogue-trail','strategy-campaign','secure-code-review','partner-helper','pattern-parade']));
  for(const choice of gameRecipeChoices('adult'))expect(excluded).not.toContain(choice.scaffoldId);
  const notebook=createNotebook({sources:[source]}),design=emptyGameDesign(notebook,provider),units=buildDirectorSourceInventory(notebook).units;
  expect(()=>validateGameBatchPlan({missions:[{id:'unsupported',unitId:units[0].id,kind:'scenario',scaffoldId:'prompt-experiment-bench',title:'Pretend prompt comparison',objective:'An ordinary scenario is insufficient.',visualDirection:{scene:'islands',sourceAssetIds:[]}}],study:[]},design.batches[0],units,notebook)).toThrow(/contract/);
 });
 it('supplies concise domain, real mechanic and exact recipe prerequisites to planning and writing',()=>{
  const notebook=createNotebook({sources:[source]}),design=emptyGameDesign(notebook,provider),units=buildDirectorSourceInventory(notebook).units,prompt=gamePlanningPrompt(notebook,design.batches[0],units),data=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);
  expect(data.choices.find((choice:any)=>choice.scaffoldId==='cloud-architecture-builder')).toMatchObject({kind:'construction',domain:'cloud',requires:SCAFFOLDS.find(s=>s.id==='cloud-architecture-builder')!.prerequisites});
  expect(data.familyPrerequisites.scenario).toContain('explicit finite case');expect(prompt).toContain('topic keyword');expect(planningExpressions(data).every((expression:any)=>!('pose' in expression)&&!('assetPath' in expression))).toBe(true);
  const choice=data.choices.find((choice:any)=>choice.scaffoldId==='infrastructure-change-planner');
  const batch={...design.batches[0],status:'planned' as const,missions:[{id:'change',unitId:units[0].id,kind:'sequence' as const,scaffoldId:choice.scaffoldId,title:'Plan the source change',objective:'Preserve the backup and verification order.',visualDirection:{scene:choice.scene,sourceAssetIds:[]}}],study:[]};
  const writing=JSON.parse(gameWritingPrompt(notebook,batch,units).split('REFERENCE DATA (JSON):\n')[1]);expect(writing.missions[0].recipe.domain).toBe('cloud');expect(writing.missions[0].recipe.requires).toEqual(choice.requires);
 });
 it('offers definition building for complete source definitions without demanding invented examples or non-examples',()=>{
  const source=createSource('A queue is a list of jobs waiting to run. A worker is a process that runs queued jobs.','System vocabulary'),notebook=createNotebook({sources:[source]}),inventory=buildDirectorSourceInventory(notebook),design=emptyGameDesign(notebook,provider);
  const data=JSON.parse(gamePlanningPrompt(notebook,design.batches[0],inventory.units).split('REFERENCE DATA (JSON):\n')[1]),choice=data.choices.find((item:any)=>item.scaffoldId==='definition-building');
  expect(choice.kind).toBe('completion');expect(choice.requires.join(' ')).not.toMatch(/example|alternative/i);expect(choice.mechanic).toContain('only when the source provides them');
  const activity=validatePreparedGameDraft(source,inventory.units[0].excerpt,{activity:{version:1,id:'draft',kind:'completion',title:'Build two precise definitions',instruction:'Place each supplied term in its definition.',explanation:'A queue holds waiting jobs. A worker runs queued jobs.',hint:'Distinguish the waiting list from the process.',reviewStatus:'needs-review',sourceRefs:[{sourceId:source.id,evidence:source.text}],context:source.text,tokens:[{id:'queue',label:'queue'},{id:'worker',label:'worker'}],slots:[{id:'waiting',before:'A ',after:' is a list of jobs waiting to run.',acceptedTokenIds:['queue'],reason:'The source defines a queue as the list of waiting jobs.',evidenceRefs:[0]},{id:'running',before:'A ',after:' is a process that runs queued jobs.',acceptedTokenIds:['worker'],reason:'The source defines a worker as the process that runs queued jobs.',evidenceRefs:[0]}]}},'definition-game',['completion']);
  expect(evaluateActivityForAuthoring(activity,{slotTokens:{waiting:'queue',running:'worker'}})).toMatchObject({valid:true,correct:true});
  expect(evaluateActivityForAuthoring(activity,{slotTokens:{waiting:'worker',running:'queue'}})).toMatchObject({valid:true,correct:false});
  expect(activity.sourceRefs).toEqual([{sourceId:source.id,evidence:source.text}]);
 });
});

const cases=[
 {recipe:'infrastructure-change-planner',kind:'sequence',domain:'cloud',text:'Cloud change procedure:\n1. Save the service backup before a configuration change.\n2. Apply the documented configuration change.\n3. Verify the service response against the recorded expectation.',description:'The documented cloud change preserves the backup before changing configuration and checks the service afterward.'},
 {recipe:'threat-model-canvas',kind:'dependency',domain:'cybersecurity',text:'Threat-model fixture: Request crosses Gateway. Gateway is protected by Authentication. Request is an external request; Gateway is the declared trust boundary; Authentication is the documented control. These are the only two modeled relationships. Omitted threats are outside this training model, not proof of security.',description:'The fixture links an external request to its declared gateway boundary and that boundary to its documented authentication control.'},
 {recipe:'cloud-cost-control',kind:'budget',domain:'cloud',text:'Cloud cost fixture dated 2026-10-01 for Example Region: a small unit costs 2 credits and supplies 1 capacity unit; a large unit costs 3 credits and supplies 2 capacity units. At most 4 units of each type are available. The budget is 6 credits and the workload needs at least 3 capacity units. This is a stored training price fixture, not a current purchase quote.',description:'The source gives a six-credit budget, two priced unit sizes and a workload requirement of at least three capacity units.'},
];
describe('source-specific expanded director choices',()=>{
 it.each(cases)('prepares $recipe only from its supplied explicit source model and preserves draft semantics',async({recipe,kind,domain,text,description})=>{
  const stages:string[]=[],material=createSource(text,`${domain} training fixture`);
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const request=JSON.parse(init.body),stage=request.prompt.match(/STAGE: (\w+)/)[1],data=JSON.parse(request.prompt.split('REFERENCE DATA (JSON):\n')[1]);stages.push(stage);let response:any;
   if(stage==='plan'){const choice=data.choices.find((choice:any)=>choice.scaffoldId===recipe);expect(choice).toMatchObject({kind,domain});response={missions:[{id:'source-mission',unitId:data.units[0].unitId,kind,scaffoldId:recipe,title:'Practice the documented model',objective:description,visualDirection:{scene:choice.scene,sourceAssetIds:[]}}],study:[]};}
   else if(stage==='write'){
    response=directorFixtureResponse(stage,data);const mission=response.missions[0],ref={sourceId:material.id,evidence:data.missions[0].unit.excerpt};
    if(kind==='dependency')mission.activity={version:1,id:'draft',kind,title:'Map the declared threat boundary',instruction:'Connect the source relationships.',explanation:description,hint:'Use the two named relations.',reviewStatus:'needs-review',sourceRefs:[ref],nodes:[{id:'request',label:'Request'},{id:'gateway',label:'Gateway'},{id:'authentication',label:'Authentication'}],edges:[{from:'request',to:'gateway',relation:'crosses'},{from:'gateway',to:'authentication',relation:'is protected by'}],acyclic:true};
    if(kind==='budget'){mission.activity={version:1,id:'draft',kind,title:'Allocate the stored workload budget',instruction:'Meet the stated capacity within six credits.',explanation:description,hint:'Compare the quoted cost and capacity of each unit.',reviewStatus:'needs-review',sourceRefs:[ref],budget:6,currency:'credits',items:[{id:'small',label:'Small unit',cost:2,unit:'unit',maxQuantity:4},{id:'large',label:'Large unit',cost:3,unit:'unit',maxQuantity:4}],requirements:[{id:'capacity',label:'Required workload capacity',minimum:3,contributions:{small:1,large:2}}]};mission.solution={quantities:{small:1,large:1}};}
    mission.teaching={title:'Understand the bounded source model',objective:description,conceptExplanation:{text:description,citations:[ref]},chunks:[{id:'scope',title:'Read the model',text:description,citations:[ref]},{id:'limit',title:'Keep its limits',text:kind==='budget'?'These prices are a stored training fixture, not a current purchase quote.':kind==='dependency'?'Omitted threats are outside this training model, not proof of security.':'The documented expectation is used to verify the service response.',citations:[ref]}],guidedApplication:{prompt:kind==='budget'?'Adjust the displayed quantities and check the model.':kind==='dependency'?'Connect the named nodes using the source relations.':'Move the steps into the documented order.',steps:['Compare your choices with the supplied source model.','Use the check control to inspect the prepared constraints.']}};
   }else if(stage==='overview'){response=directorFixtureResponse(stage,data);}else{expect(data.missions[0].recipe.domain).toBe(domain);expect(data.missions[0].recipe.requires.length).toBeGreaterThan(0);response=directorFixtureResponse(stage,data);}
   return{ok:true,json:async()=>({text:JSON.stringify(response),usage:directorFixtureUsage})};
  }));
  const result=await prepareGameExperience(createNotebook({sources:[material]}),{}, {aiPolicy:'required',ai:{config,consent:'create-game'}});expect(result.creationStatus,result.ai.message).toBe('ready');expect(stages).toEqual(['plan','write','check','overview']);
  const activity=result.notebook.activities!.find(a=>a.id===result.ai.activityId)!;expect(activity).toMatchObject({kind,scaffoldIds:[recipe],reviewStatus:'needs-review'});expect(activity.sourceRefs.every(ref=>ref.sourceId===material.id&&text.includes(ref.evidence))).toBe(true);expect(parsePackage(serializePackage(result.notebook)).gameDesign?.receipts).toHaveLength(4);
 });
});
