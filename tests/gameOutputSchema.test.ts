import {describe,it,expect} from 'vitest';
import {compactGameOutputSchema} from '../src/lib/gameOutputSchema';
import {getGameDirectorOutputSchema} from '../src/lib/gameDirectorSchemas';
import {gamePlanningPrompt,gameWritingPrompt} from '../src/lib/gameDirector';
import {emptyGameDesign} from '../src/lib/gameDesign';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {createNotebook,createSource} from '../src/lib/utils';

type Schema=Record<string,any>;
const size=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
function expand(schema:Schema):Schema {
 const defs=schema.$defs??{},active=new Set<string>();
 const visit=(node:Schema):Schema=>{
  if(node.$ref){expect(Object.keys(node)).toEqual(['$ref']);expect(node.$ref).toMatch(/^#\/\$defs\/s\d+$/);expect(active.has(node.$ref)).toBe(false);active.add(node.$ref);const value=defs[node.$ref.slice('#/$defs/'.length)];expect(value).toBeDefined();const result=visit(value);active.delete(node.$ref);return result;}
  const result={...node};delete result.$defs;
  if(node.properties)result.properties=Object.fromEntries(Object.entries(node.properties).map(([key,value])=>[key,visit(value as Schema)]));
  for(const key of ['items','additionalProperties'])if(node[key]&&typeof node[key]==='object')result[key]=visit(node[key]);
  for(const key of ['anyOf','allOf','oneOf'])if(Array.isArray(node[key]))result[key]=node[key].map(visit);
  return result;
 };
 return visit(schema);
}
function bounds(schema:Schema){
 let nodes=0,depth=0,scalars=0;
 const walk=(value:unknown,level=0)=>{nodes++;depth=Math.max(depth,level);if(typeof value==='string')scalars+=new TextEncoder().encode(value).length;else if(Array.isArray(value))value.forEach(child=>walk(child,level+1));else if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){scalars+=new TextEncoder().encode(key).length;if(key==='$ref')expect(child).toMatch(/^#\/\$defs\/s\d+$/);walk(child,level+1);}};
 walk(schema);expect(size(schema)).toBeLessThanOrEqual(65536);expect(scalars).toBeLessThanOrEqual(65536);expect(nodes).toBeLessThanOrEqual(4096);expect(depth).toBeLessThanOrEqual(32);expect(schema.type).toBe('object');expect(schema.$ref).toBeUndefined();
}
const disclosed=(prompt:string)=>JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);
function schemas(){
 const result:{name:string;schema:Schema}[]=[];
 for(const ageGroup of ['3-5','6-8','9-11','12-14','15-17','adult']){
  const source={...createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.'),id:'schema-source'},notebook=createNotebook({ageGroup,sources:[source]}),inventory=buildDirectorSourceInventory(notebook),batch=emptyGameDesign(notebook,{id:'chatgpt',model:'test',endpointFingerprint:null}).batches[0];
  const planData=disclosed(gamePlanningPrompt(notebook,batch,inventory.units));result.push({name:`${ageGroup}/plan`,schema:getGameDirectorOutputSchema('plan',planData)!});
  // Exercise all emitted writer shapes for every set of age-specific bounds.
  const choice=gameRecipeChoices('adult').find(c=>c.scaffoldId==='process-reconstruction')!;
  for(const kind of ['sequence','classification','dependency','completion','explanation']){
   const plan={id:'mission-1',unitId:inventory.units[0].id,kind:choice.kind,scaffoldId:choice.scaffoldId,title:'Arrange the steps',objective:'Use the stated order.',visualDirection:{scene:choice.scene,sourceAssetIds:[]}},data=disclosed(gameWritingPrompt({...notebook,ageGroup:'adult'},{...batch,missions:[plan]},inventory.units,plan.id));data.ageGroup=ageGroup;data.missions[0].plan.kind=kind;
   result.push({name:`${ageGroup}/${kind}`,schema:getGameDirectorOutputSchema('write',data)!});
  }
  result.push({name:`${ageGroup}/check`,schema:getGameDirectorOutputSchema('check',{missions:[{missionId:'first'},{missionId:'second'},{missionId:'third'}]})!});
  const reference={sourceId:source.id,sourceRevision:'current-source-revision',start:0,end:10,quote:'Source text',locator:{kind:'text',label:'Lines 1–2',lineStart:1,lineEnd:2}},saved={text:'A saved source explanation.',citations:[reference]},raw={unitId:'unit-1',sourceId:source.id,excerpt:source.text};
  for(const [label,context]of Object.entries({raw:{units:[raw]},saved:{summaries:[{content:{introduction:saved,learningGoals:[saved],keyIdeas:[{title:'Idea',...saved}]}}]},mixed:{units:[raw,{unitId:'unit-2',savedSummary:saved}]},empty:{units:[]}}))result.push({name:`${ageGroup}/overview-${label}`,schema:getGameDirectorOutputSchema('overview',{ageGroup,missionIds:['mission-1'],...context})!});
 }
 return result;
}
describe('lossless local schema factoring',()=>{
 it('expands every current stage, writer shape and age bound to exactly the original schema',()=>{
  let beforeBytes=0,afterBytes=0;
  for(const{name,schema}of schemas()){
   const original=structuredClone(schema),compact=compactGameOutputSchema(schema);expect(expand(compact),name).toEqual(schema);expect(schema).toEqual(original);expect(size(compact),name).toBeLessThanOrEqual(size(schema));bounds(compact);beforeBytes+=size(schema);afterBytes+=size(compact);
   expect(compactGameOutputSchema(schema),name).toEqual(compact);expect(compactGameOutputSchema(compact),name).toEqual(compact);
  }
  // Source-ineligible optional structures are now removed before factoring.
  // The remaining redundancy varies by schema; factoring must still save bytes
  // while every individual schema above remains lossless and never grows.
  expect(afterBytes).toBeLessThan(beforeBytes);
 });
 it('retains distinct enum values and constraints, and never rewrites objects inside literal enum data',()=>{
  const text={type:'string',enum:['one','two'],minLength:1,maxLength:200},schema={type:'object',properties:{a:text,b:text,c:{...text,enum:['one','three']},d:{...text,maxLength:100},literal:{enum:[{type:'string',minLength:1,maxLength:200},{type:'string',minLength:1,maxLength:200}]},special:{type:'object',properties:{type:text,items:text},required:['type','items'],additionalProperties:false}},required:['a','b','c','d','literal','special'],additionalProperties:false};
  const compact=compactGameOutputSchema(schema);expect(expand(compact)).toEqual(schema);expect(compact.properties.literal).toEqual(schema.properties.literal);expect(size(compact)).toBeLessThan(size(schema));
 });
 it('does not add definitions when there is no encoded-byte saving or relocate existing reference scopes',()=>{
  const tiny={type:'object',properties:{a:{type:'boolean'},b:{type:'boolean'}},required:['a','b'],additionalProperties:false};expect(compactGameOutputSchema(tiny)).toEqual(tiny);
  const existing={type:'object',$defs:{own:{type:'string'}},properties:{a:{$ref:'#/$defs/own'}},required:['a'],additionalProperties:false};expect(compactGameOutputSchema(existing)).toEqual(existing);
  const anchor={...tiny,$id:'local-schema'};expect(compactGameOutputSchema(anchor)).toEqual(anchor);
 });
 it('enforces the same bounded JSON and local-reference transport limits as the desktop adapter',()=>{
  const base={type:'object',properties:{},required:[],additionalProperties:false};
  let deep:any={type:'string'};for(let i=0;i<34;i++)deep={items:deep};
  const cycle:any={...base};cycle.self=cycle;
  for(const invalid of [{...base,description:'é'.repeat(33000)},{...base,anyOf:Array.from({length:4100},()=>true)},{...base,items:deep},{...base,$ref:'https://outside.example/schema'},{...base,$dynamicRef:'file:///source.txt'},{...base,invalid:undefined},{...base,invalid:Infinity},cycle])expect(()=>compactGameOutputSchema(invalid)).toThrow(/bounded JSON/);
 });
});
