import {describe,expect,it} from 'vitest';
import {gameActivityOutputSchema,normalizeActivitySchemaAbsence,activityRuleDefinition,usesRuleDefinition,type ActivityOutputSchema as S} from '../src/lib/gameActivitySchemas';
import {getGameDirectorOutputSchema} from '../src/lib/gameDirectorSchemas';
import {compactGameOutputSchema} from '../src/lib/gameOutputSchema';
import {nativeFactoryFixtures} from './fixtures/nativeFactoryBenchmark';
import {boundedOutputSchema,assertStructuredOutput} from '../server/output-schema.mjs';
import {validateActivity} from '../src/lib/structuredEngine';
import {gameRecipeCoverage} from '../src/lib/gameDraftAdapters';
import {writerInput} from '../scripts/factory-benchmark/writer';
import {resolveGameDraftCitationReply} from '../src/lib/gameDraftCitations';
import {teachingContextWindow} from '../src/lib/gameDirectorSources';
const accept=(schema:S,value:unknown)=>{try{assertStructuredOutput(value,schema);return true;}catch{return false;}};
function wire(schema:S,value:unknown,root=schema):any{
 if(schema.$ref){let resolved:any=root;for(const key of String(schema.$ref).slice(2).split('/'))resolved=resolved[key];return wire(resolved,value,root);}
 if(value===undefined&&Array.isArray(schema.anyOf)&&schema.anyOf.some((s:any)=>s.type==='null'))return null;
 if(Array.isArray(schema.anyOf)){
  for(const option of schema.anyOf as S[]){try{const candidate=wire(option,value,root);if(accept({...option,...(root.$defs?{$defs:root.$defs}:{})},candidate))return candidate;}catch{}}
  return value;
 }
 if(schema.type==='array'&&Array.isArray(value))return value.map(item=>wire(schema.items as S,item,root));
 if(schema.type==='object'&&value&&typeof value==='object'&&!Array.isArray(value)){
  const result={...value} as Record<string,unknown>,properties=schema.properties as Record<string,S>;
  for(const [key,definition]of Object.entries(properties))result[key]=wire(definition,result[key],root);
  if(schema.additionalProperties&&typeof schema.additionalProperties==='object')for(const key of Object.keys(result))if(!Object.hasOwn(properties,key))result[key]=wire(schema.additionalProperties as S,result[key],root);
  return result;
 }
 return value;
}
function shapeProblems(schema:S,value:any,root=schema,path='activity'):string[]{
 if(accept({...schema,...(root.$defs?{$defs:root.$defs}:{})},value))return[];
 if(schema.$ref){let resolved:any=root;for(const key of String(schema.$ref).slice(2).split('/'))resolved=resolved[key];return shapeProblems(resolved,value,root,path);}
 if(schema.type==='object'&&value&&typeof value==='object'){
  const props=schema.properties as Record<string,S>,errors=Object.entries(props).flatMap(([k,v])=>shapeProblems(v,value[k],root,path+'.'+k));
  return errors.length?errors:[path+' keys or bounds'];
 }
 if(schema.type==='array'&&Array.isArray(value)){const errors=value.flatMap((v,i)=>shapeProblems(schema.items as S,v,root,path+'['+i+']'));return errors.length?errors:[path+': array length '+value.length];}
 return[path+': '+JSON.stringify(value)?.slice(0,80)];
}
function schemaInput(kind:string,scaffoldId:string,sourceId:string){return{ageGroup:'adult',missions:[{plan:{id:'mission-1',kind,scaffoldId},unit:{sourceId},audioChoices:{playTracks:[{id:'play'}],studyTracks:[{id:'study'}],effectProfiles:[{id:'effect'}]}}]};}
describe('complete bounded authoring shape contracts',()=>{
 it('discloses trusted citation choices for all 75 actual source windows without changing provider compatibility',()=>{
  let codex=0,fallback=0;
  for(const fixture of nativeFactoryFixtures()){
   const input=writerInput(fixture),data=JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]),mission=data.missions[0],catalog=mission.citationChoices;
   const activityChoice=catalog.entries.find((e:any)=>e.activity),teachingChoice=catalog.entries.find((e:any)=>e.teaching);
   expect(activityChoice,fixture.scaffoldId).toBeDefined();expect(teachingChoice,fixture.scaffoldId).toBeDefined();
   const schema=getGameDirectorOutputSchema('write',data,{provider:'claude-code'})!;
   expect(schema,fixture.scaffoldId).toBeDefined();expect(()=>boundedOutputSchema(compactGameOutputSchema(schema)),fixture.scaffoldId).not.toThrow();
   const properties=(schema.properties as any).missions.anyOf[0].items.properties,refs=properties.activity.properties.sourceRefs.items,citations=properties.teaching.properties.chunks.items.properties.citations.items;
   const ref={sourceId:input.source.id,evidenceId:activityChoice.evidenceId},teach={sourceId:input.source.id,evidenceId:teachingChoice.evidenceId};
   expect(accept(refs,ref),fixture.scaffoldId).toBe(true);expect(accept(citations,teach),fixture.scaffoldId).toBe(true);
   expect(accept(refs,{...ref,evidenceId:'forged'})).toBe(false);expect(accept(refs,{...ref,evidence:'invented'})).toBe(false);
   const resolved=resolveGameDraftCitationReply({missions:[{activity:{sourceRefs:[ref]},teaching:{chunks:[{citations:[teach]}]}}]},{source:input.source,primaryWindow:input.unit,teachingWindow:teachingContextWindow(input.unit,[input.unit],input.notebook)}) as any;
   expect(resolved.missions[0].activity.sourceRefs).toEqual([{sourceId:input.source.id,evidence:activityChoice.evidence}]);
   expect(resolved.missions[0].teaching.chunks[0].citations).toEqual([{sourceId:input.source.id,evidence:teachingChoice.evidence}]);
   if(getGameDirectorOutputSchema('write',data,{provider:'chatgpt'}))codex++;else fallback++;
  }
  expect({codex,fallback}).toEqual({codex:56,fallback:19});
 });
 it('supplies provider-valid schemas for every actual recipe with no invented fixed dictionary keys',()=>{
  const coverage=gameRecipeCoverage();expect(coverage).toHaveLength(75);const kinds=new Set<string>();
  for(const recipe of coverage){
   const input=schemaInput(recipe.kind!,recipe.scaffoldId,'primary-source'),schema=getGameDirectorOutputSchema('write',input,{provider:'claude-code'})!;
   expect(schema,recipe.scaffoldId).toBeDefined();expect(()=>boundedOutputSchema(compactGameOutputSchema(schema)),recipe.scaffoldId).not.toThrow();
   kinds.add(recipe.kind!);
   const act=(schema.properties as any).missions.anyOf[0].items.properties.activity;
   expect(act.additionalProperties).toBe(false);
  }
  expect(kinds.size).toBe(18);
 });
 it('accepts all authored fixtures with bounded exact citations and documented wire-null normalization',()=>{
  const failures:string[]=[];
  for(const fixture of nativeFactoryFixtures()){
   const {scaffoldIds:_binding,extractedFrom:_extracted,...model}=fixture.activity;
   const schema=gameActivityOutputSchema(model.kind,model.sourceRefs[0].sourceId,fixture.scaffoldId)!;
   const root=usesRuleDefinition(schema)?{...schema,$defs:{rule:activityRuleDefinition}}:schema;
   const expected=structuredClone({...model,id:'assistant-draft',reviewStatus:'needs-review'});
   // The two saved campaign fixtures have nine exact citations. The AI writer
   // budget is eight: consolidate only the adjacent final passages from their
   // real source, without changing a rule, answer, action or factual word.
   if(expected.sourceRefs.length===9){
    expect(accept(root,wire(root,expected))).toBe(false);
    const prior=expected.sourceRefs[7],last=expected.sourceRefs[8],source=fixture.sources.find(s=>s.id===prior.sourceId)!;
    expect(last.sourceId).toBe(prior.sourceId);const start=source.text.indexOf(prior.evidence),end=source.text.indexOf(last.evidence)+last.evidence.length;
    expected.sourceRefs=[...expected.sourceRefs.slice(0,7),{sourceId:source.id,evidence:source.text.slice(start,end)}];
    const remap=(v:any):void=>{if(Array.isArray(v))v.forEach(remap);else if(v&&typeof v==='object')for(const [key,entry]of Object.entries(v)){if(key==='evidenceRefs'&&Array.isArray(entry))v[key]=[...new Set(entry.map(i=>i===8?7:i))];else remap(entry);}};remap(expected);
    expect(validateActivity(expected,fixture.sources).success).toBe(true);
   }
   const prepared=wire(root,expected);
   if(!accept(root,prepared))failures.push(fixture.scaffoldId+': '+shapeProblems(root,prepared).join('; '));
   else{
    const restored=structuredClone(prepared);normalizeActivitySchemaAbsence(restored);expect(restored,fixture.scaffoldId).toEqual(expected);
    for(const key of Object.keys((schema.properties as Record<string,S>))){const missing=structuredClone(prepared);delete missing[key];expect(accept(root,missing),fixture.scaffoldId+' missing '+key).toBe(false);}
    const unknown={...prepared,executeCode:'untrusted'};expect(accept(root,unknown)).toBe(false);
   }
  }
  expect(failures).toEqual([]);
 });
 it('requires selected specialized capability fields and rejects another mode under the same engine kind',()=>{
  for(const fixture of nativeFactoryFixtures().filter(f=>f.requiredCapabilities.some(c=>c.startsWith('scenario:')||c.startsWith('explanation:')||c==='completion:pattern'))){
   const schema=gameActivityOutputSchema(fixture.activity.kind,fixture.activity.sourceRefs[0].sourceId,fixture.scaffoldId)!;
   const property=fixture.activity.kind==='completion'?'pattern':fixture.activity.kind==='explanation'?fixture.requiredCapabilities.includes('explanation:partner')?'partner':'codeReview':'scenarioPresentation';
   expect((schema.required as string[]),fixture.scaffoldId).toContain(property);
   expect((schema.properties as any)[property].additionalProperties).toBe(false);
  }

 });
 it('preserves factual nulls and unsupported null fields while removing only declared absence',()=>{
  const decision={kind:'decision',context:{unknown:null},unsupported:null};normalizeActivitySchemaAbsence(decision);expect(decision).toEqual({kind:'decision',context:{unknown:null},unsupported:null});
  const data:any={kind:'data',rows:[{values:{missing:null}}],questions:[{columnId:null,unsupported:null}]};normalizeActivitySchemaAbsence(data);expect(data.rows[0].values.missing).toBe(null);expect(data.questions[0]).toEqual({unsupported:null});
 });
});
