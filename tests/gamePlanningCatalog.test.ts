import {describe,expect,it} from 'vitest';
import {AGE_GROUPS} from '../src/data/scaffolds';
import {asterEmotionCatalog} from '../src/lib/asterEmotions';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {compactPlanningCatalog,planningExpressions,PLANNING_CATALOG_INSTRUCTION} from '../src/lib/gamePlanningCatalog';
import {getGameDirectorOutputSchema} from '../src/lib/gameDirectorSchemas';
import {gamePlanningPrompt} from '../src/lib/gameDirector';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {emptyGameDesign} from '../src/lib/gameDesign';
import {createNotebook,createSource} from '../src/lib/utils';

const expressions=()=>asterEmotionCatalog().map(({id,moments,purpose})=>({id,moments,purpose}));
const notebook=(ageGroup='adult')=>createNotebook({ageGroup,sources:[createSource('# Maintenance\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance guide')]});

describe('lossless planning catalog encoding',()=>{
 it.each(AGE_GROUPS.map(age=>age.id))('preserves every ordered choice, description and expression for %s',ageGroup=>{
  const choices=gameRecipeChoices(ageGroup),poses=expressions(),before=structuredClone({choices,poses}),compact=compactPlanningCatalog(choices,poses);
  // Independent reconstruction from the disclosed field names, not the schema
  // reader, proves the complete prompt still contains every original value.
  const decoded={choices:compact.choices.map(choice=>({...choice,limitations:'limitations' in choice?choice.limitations:compact.choiceDefaults.limitations})),poses:compact.asterExpressions.map(row=>Object.fromEntries(compact.asterExpressionFields.map((field,index)=>[field,row[index]])))};
  expect(decoded).toEqual(before);expect({choices,poses}).toEqual(before);
  expect(planningExpressions(compact)).toEqual(poses);expect(planningExpressions({asterExpressions:poses})).toEqual(poses);
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify({choices,asterExpressions:poses}).length);
  // The most important matching fields remain named and directly inspectable.
  for(const choice of compact.choices)expect(choice).toHaveProperty('kind',choices.find(item=>item.scaffoldId===choice.scaffoldId)!.kind);
 });
 it.each(AGE_GROUPS.map(age=>age.id))('keeps the exact same strict plan output schema for %s',ageGroup=>{
  const input=notebook(ageGroup),units=buildDirectorSourceInventory(input).units,design=emptyGameDesign(input,{id:'chatgpt',model:'test',endpointFingerprint:null}),prompt=gamePlanningPrompt(input,design.batches[0],units),data=JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);
  const original={...data,choices:gameRecipeChoices(ageGroup),asterExpressions:expressions()};delete original.choiceDefaults;delete original.asterExpressionFields;
  expect(getGameDirectorOutputSchema('plan',data)).toEqual(getGameDirectorOutputSchema('plan',original));
  expect(data.units).toEqual(original.units);expect(prompt).toContain(PLANNING_CATALOG_INSTRUCTION);
  expect(new TextEncoder().encode(JSON.stringify(getGameDirectorOutputSchema('plan',data))).byteLength).toBeLessThan(65536);
 });
 it('preserves nonempty limitations and needs no compact-format mutation of saved plans',()=>{
  const choices=gameRecipeChoices('adult');choices[0].limitations=['Only the explicitly supplied procedure is modeled.'];
  const compact=compactPlanningCatalog(choices,expressions());expect(compact.choices[0].limitations).toEqual(choices[0].limitations);
  compact.choiceDefaults.limitations.push('not shared with input');expect(choices[1].limitations).toEqual([]);
  // This encoder never sees or transforms saved plans/checkpoints: source
  // fingerprints and receipt ledgers are not part of its input or output.
  expect(Object.keys(compact).sort()).toEqual(['asterExpressionFields','asterExpressions','choiceDefaults','choices']);
 });
 it('rejects malformed compact rows instead of weakening expression schema constraints',()=>{
  const good=compactPlanningCatalog(gameRecipeChoices('adult'),expressions());
  for(const mutate of [(data:any)=>data.asterExpressionFields.reverse(),(data:any)=>data.asterExpressions=[],(data:any)=>data.asterExpressions[0].pop(),(data:any)=>data.asterExpressions[0][1]=[],(data:any)=>data.asterExpressions[0][1]=[null],(data:any)=>data.asterExpressions[0][2]=null,(data:any)=>data.asterExpressions.push(data.asterExpressions[0])]){
   const invalid=structuredClone(good);mutate(invalid);expect(()=>planningExpressions(invalid)).toThrow(/catalog/);
  }
 });
 it('reduces the complete adult planning prompt after counting the decoding instructions',()=>{
  const input=notebook(),units=buildDirectorSourceInventory(input).units,batch=emptyGameDesign(input,{id:'chatgpt',model:'test',endpointFingerprint:null}).batches[0],prompt=gamePlanningPrompt(input,batch,units),[instructions,json]=prompt.split('REFERENCE DATA (JSON):\n'),data=JSON.parse(json);
  const original={ageGroup:data.ageGroup,goal:data.goal,choices:gameRecipeChoices(input.ageGroup),familyPrerequisites:data.familyPrerequisites,asterExpressions:expressions(),units:data.units};
  const previousPrompt=instructions.replace(PLANNING_CATALOG_INSTRUCTION,'')+'REFERENCE DATA (JSON):\n'+JSON.stringify(original);
  expect(previousPrompt.length-prompt.length).toBeGreaterThan(1000);
 });
});
