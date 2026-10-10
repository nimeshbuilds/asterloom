import {describe,expect,it} from 'vitest';
import {getGameDirectorOutputSchema,normalizeGameDirectorStructuredReply,type GameDirectorOutputSchema} from '../src/lib/gameDirectorSchemas';
import {gamePlanningPrompt,gameWritingPrompt,gameCheckingPrompt} from '../src/lib/gameDirector';
import {buildDirectorSourceInventory,teachingContextWindow} from '../src/lib/gameDirectorSources';
import {emptyGameDesign,validateGameBatchChecks,validateNewGameBatchPlan,validateGameMissionProse,type GameDesignBatch} from '../src/lib/gameDesign';
import {validatePreparedGameDraft} from '../src/lib/gameDraftAdapters';
import {validateAILearningMissionDraft} from '../src/lib/aiLearningPlan';
import {createOverviewWork,overviewRequestData,validateOverviewDraft} from '../src/lib/gameOverview';
import {createNotebook,createSource} from '../src/lib/utils';
import {directorFixtureResponse} from './gameDirector.fixture';

// Independent evaluator for the deliberately small emitted JSON Schema subset.
// Unknown schema keywords fail this test rather than being silently ignored.
function accepts(schema:GameDirectorOutputSchema,value:unknown):boolean{
 if(Array.isArray(schema.anyOf))return schema.anyOf.some(option=>accepts(option as GameDirectorOutputSchema,value));
 if(Array.isArray(schema.enum)&&!schema.enum.some(item=>JSON.stringify(item)===JSON.stringify(value)))return false;
 if(schema.type==='null')return value===null;
 if(schema.type==='string')return typeof value==='string'&&value.length>=Number(schema.minLength??0)&&value.length<=Number(schema.maxLength??Infinity)&&(!schema.pattern||new RegExp(String(schema.pattern)).test(value));
 if(schema.type==='integer')return typeof value==='number'&&Number.isInteger(value)&&value>=Number(schema.minimum??-Infinity)&&value<=Number(schema.maximum??Infinity);
 if(schema.type==='boolean')return typeof value==='boolean';
 if(schema.type==='array')return Array.isArray(value)&&value.length>=Number(schema.minItems??0)&&value.length<=Number(schema.maxItems??Infinity)&&value.every(item=>accepts(schema.items as GameDirectorOutputSchema,item));
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const properties=schema.properties as Record<string,GameDirectorOutputSchema>,item=value as Record<string,unknown>;
  return (schema.required as string[]).every(key=>Object.hasOwn(item,key))&&Object.keys(item).every(key=>Object.hasOwn(properties,key)&&accepts(properties[key],item[key]));
 }
 throw Error('Unsupported schema type in test evaluator: '+String(schema.type));
}
function assertStrictSubset(schema:GameDirectorOutputSchema){
 expect(Object.keys(schema).every(key=>['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','pattern','enum','anyOf'].includes(key))).toBe(true);
 if(schema.type==='object'){expect(schema.additionalProperties).toBe(false);const properties=schema.properties as Record<string,GameDirectorOutputSchema>;expect(schema.required).toEqual(Object.keys(properties));Object.values(properties).forEach(assertStrictSubset);}
 if(schema.items)assertStrictSubset(schema.items as GameDirectorOutputSchema);
 if(Array.isArray(schema.anyOf))schema.anyOf.forEach(option=>assertStrictSubset(option as GameDirectorOutputSchema));
}
const disclosed=(prompt:string)=>JSON.parse(prompt.split('REFERENCE DATA (JSON):\n')[1]);
function fixture(ageGroup='adult'){
 const notebook=createNotebook({ageGroup,sources:[createSource('# Maintenance procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.','Maintenance guide')]});
 const units=buildDirectorSourceInventory(notebook).units,batch=emptyGameDesign(notebook,{id:'chatgpt',model:'test',endpointFingerprint:null}).batches[0],planData=disclosed(gamePlanningPrompt(notebook,batch,units));
 const plan=directorFixtureResponse('plan',planData),wirePlan={...plan,missions:plan.missions.map((mission:any)=>({...mission,asterDirection:null}))};
 const planned={...batch,...validateNewGameBatchPlan(normalizeGameDirectorStructuredReply('plan',wirePlan),batch,units,notebook),status:'planned' as const},writeData=disclosed(gameWritingPrompt(notebook,planned,units,planned.missions![0].id));
 const written=directorFixtureResponse('write',writeData);written.missions[0].activity.reviewStatus='needs-review';written.cannotBuild=null;written.missions[0].teaching.workedExample=null;written.missions[0].teaching.storyFrame=null;
 return{notebook,units,batch,planData,wirePlan,planned,writeData,written};
}

describe('bounded director structured response schemas',()=>{
 it('accepts the real source-bound plan contract, with nullable presentation optional fields only',()=>{
  const f=fixture(),schema=getGameDirectorOutputSchema('plan',f.planData)!;expect(accepts(schema,f.wirePlan)).toBe(true);
  const original=structuredClone(f.wirePlan),normalized=normalizeGameDirectorStructuredReply('plan',f.wirePlan);
  expect(f.wirePlan).toEqual(original);expect(validateNewGameBatchPlan(normalized,f.batch,f.units,f.notebook).missions).toHaveLength(1);
  const absent={...f.wirePlan,overviewNotes:null};expect(accepts(schema,absent)).toBe(true);expect(normalizeGameDirectorStructuredReply('plan',absent)).not.toHaveProperty('overviewNotes');
  for(const mutate of [(v:any)=>v.missions[0].rationale='unsupported field',(v:any)=>v.missions[0].objective='x'.repeat(401),(v:any)=>v.missions[0].scaffoldId='invented-world',(v:any)=>v.missions[0].unitId='undisclosed-unit',(v:any)=>v.missions[0].visualDirection.sourceAssetIds=['unprovided-image'],(v:any)=>delete v.study]){const invalid=structuredClone(f.wirePlan);mutate(invalid);expect(accepts(schema,invalid)).toBe(false);}
 });
 it('restricts Aster expressions to the disclosed compatible moment and retains null summaries',()=>{
  const f=fixture(),schema=getGameDirectorOutputSchema('plan',f.planData)!,pose=f.planData.asterExpressions.find((p:any)=>p.moments.includes('welcome'));
  f.wirePlan.missions[0].asterDirection={welcome:pose.id,concept:null,hint:null,retry:null,success:null,reflection:null};f.wirePlan.overviewNotes[0].summary=null;
  expect(accepts(schema,f.wirePlan)).toBe(true);const normalized=normalizeGameDirectorStructuredReply('plan',f.wirePlan) as any;
  expect(normalized.missions[0].asterDirection).toEqual({welcome:pose.id});expect(normalized.overviewNotes[0].summary).toBe(null);
  f.wirePlan.missions[0].asterDirection.welcome='invented-emotion';expect(accepts(schema,f.wirePlan)).toBe(false);
 });
 it('admits actual teaching and gameplay through the existing evidence validators',()=>{
  const f=fixture(),schema=getGameDirectorOutputSchema('write',f.writeData)!;expect(accepts(schema,f.written)).toBe(true);
  const normalized=normalizeGameDirectorStructuredReply('write',f.written) as any,mission=normalized.missions[0];expect(normalized).not.toHaveProperty('cannotBuild');expect(mission.teaching).not.toHaveProperty('workedExample');
  const activity=validatePreparedGameDraft(f.notebook.sources[0],f.units[0].excerpt,{activity:mission.activity},'test-draft',['sequence']);
  const teaching=validateAILearningMissionDraft(mission.teaching,{activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:teachingContextWindow(f.units[0],f.units,f.notebook)});
  expect(()=>validateGameMissionProse(f.units[0],f.notebook,activity,teaching,f.units)).not.toThrow();
  const invalid=structuredClone(f.written);invalid.missions[0].teaching.chunks[0].citations[0].evidence='The reset requires an invented password.';
  expect(accepts(schema,invalid)).toBe(true);expect(()=>validateAILearningMissionDraft((normalizeGameDirectorStructuredReply('write',invalid) as any).missions[0].teaching,{activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:teachingContextWindow(f.units[0],f.units,f.notebook)})).toThrow(/exact substring/);
  for(const mutate of [(v:any)=>v.missions[0].activity.reviewStatus='reviewed',(v:any)=>v.missions[0].missionId='other-mission',(v:any)=>v.missions[0].audioDirection.playTrackId='made-up-track',(v:any)=>v.missions[0].teaching.chunks[0].citations[0].sourceId='another-source',(v:any)=>v.missions[0].activity.pattern={}]){const invalid=structuredClone(f.written);mutate(invalid);expect(accepts(schema,invalid)).toBe(false);}
 });
 it('constrains each supported writer to its actual family without open dictionary substitutes',()=>{
  const f=fixture();for(const kind of ['sequence','classification','dependency','completion','explanation']){const input=structuredClone(f.writeData);input.missions[0].plan.kind=kind;const schema=getGameDirectorOutputSchema('write',input)!;expect(schema).toBeDefined();assertStrictSubset(schema);if(kind!=='sequence')expect(accepts(schema,f.written)).toBe(false);}
  for(const kind of ['budget','construction','scenario','child-play','rule-switch']){const input=structuredClone(f.writeData);input.missions[0].plan.kind=kind;expect(getGameDirectorOutputSchema('write',input)).toBeUndefined();}
 });
 it('accepts representative classification, dependency, completion and explanation models without changing their format',()=>{
  const f=fixture(),{items:_items,constraints:_constraints,...base}=f.written.missions[0].activity;
  const models={
   classification:{...base,kind:'classification',categories:[{id:'first',label:'First step'},{id:'later',label:'Later step'}],items:[{id:'open',label:'Open the settings panel.'},{id:'confirm',label:'Confirm the selected reset.'}],membership:[{itemId:'open',categoryIds:['first']},{itemId:'confirm',categoryIds:['later']}]},
   dependency:{...base,kind:'dependency',nodes:[{id:'open',label:'Open the settings panel.'},{id:'choose',label:'Choose the reset command.'}],edges:[{from:'open',to:'choose',relation:'precedes'}],acyclic:true},
   completion:{...base,kind:'completion',context:'Follow the documented reset procedure.',tokens:[{id:'open',label:'Open the settings panel.'},{id:'choose',label:'Choose the reset command.'}],slots:[{id:'first',before:'First: ',after:'',acceptedTokenIds:['open'],reason:'The procedure begins with opening the panel.',evidenceRefs:[0]}]},
   explanation:{...base,kind:'explanation',pieces:[{id:'claim',role:'claim',text:'Opening the panel is the first step.',evidenceRefs:[0]},{id:'evidence',role:'evidence',text:'1. Open the settings panel.',evidenceRefs:[0]},{id:'warrant',role:'warrant',text:'The numbered procedure places this action first.',evidenceRefs:[0]}],arguments:[{id:'argument',label:'Identify the first step',prompt:'Explain the stated first action.',evidenceRefs:[0],alternatives:[{id:'chain',claimId:'claim',evidenceIds:['evidence'],warrantId:'warrant',explanation:'The source numbers opening the panel as step one.',evidenceRefs:[0],counterpointId:null,rebuttalId:null}]}]},
  };
  for(const [kind,activity] of Object.entries(models)){
   const input=structuredClone(f.writeData);input.missions[0].plan.kind=kind;
   const reply=structuredClone(f.written);reply.missions[0].activity=activity;expect(accepts(getGameDirectorOutputSchema('write',input)!,reply)).toBe(true);
   const mission=(normalizeGameDirectorStructuredReply('write',reply) as any).missions[0];
   expect(()=>validatePreparedGameDraft(f.notebook.sources[0],f.units[0].excerpt,mission,'test-model',[kind as keyof typeof models])).not.toThrow();
  }
 });
 it('requires a complete explicit check for every requested mission while retaining semantic quality checks',()=>{
  const f=fixture(),m=normalizeGameDirectorStructuredReply('write',f.written).missions as any[],activity=validatePreparedGameDraft(f.notebook.sources[0],f.units[0].excerpt,m[0],'test-draft',['sequence']),teaching=validateAILearningMissionDraft(m[0].teaching,{activity,ageGroup:f.notebook.ageGroup,sources:f.notebook.sources,sourceWindow:teachingContextWindow(f.units[0],f.units,f.notebook)}),batch:GameDesignBatch={...f.planned,status:'written',drafts:[{missionId:f.planned.missions![0].id,activity,teaching,audioDirection:m[0].audioDirection}]};
  const input=disclosed(gameCheckingPrompt(batch)),schema=getGameDirectorOutputSchema('check',input)!,reply=directorFixtureResponse('check',input);expect(accepts(schema,reply)).toBe(true);expect(validateGameBatchChecks(reply,batch,true)).toHaveLength(1);
  for(const mutate of [(v:any)=>delete v.checks[0].quality,(v:any)=>v.checks[0].quality.controlsMatch='true',(v:any)=>v.checks[0].missionId='wrong-mission',(v:any)=>v.checks=[]]){const invalid=structuredClone(reply);mutate(invalid);expect(accepts(schema,invalid)).toBe(false);}
  reply.checks[0].quality.controlsMatch=false;expect(accepts(schema,reply)).toBe(true);expect(()=>validateGameBatchChecks(reply,batch,true)).toThrow(/retained mission/);
 });
 it('preserves raw and saved overview citation formats, including exact saved locations',()=>{
  const f=fixture(),context={...f.notebook,units:f.units,batches:[]},work=createOverviewWork(context),node=work.nodes[0],input=overviewRequestData(node,work,context),schema=getGameDirectorOutputSchema('overview',input)!,reply={...directorFixtureResponse('overview',input),cannotSummarize:null};
  expect(accepts(schema,reply)).toBe(true);const valid=validateOverviewDraft(normalizeGameDirectorStructuredReply('overview',reply),node,work,context);expect(valid.introduction.citations[0].quote).toBe(f.units[0].excerpt);
  const savedInput={ageGroup:'adult',summaries:[{content:valid}],missionIds:[]},savedSchema=getGameDirectorOutputSchema('overview',savedInput)!,savedReply={...directorFixtureResponse('overview',savedInput),cannotSummarize:null};expect(accepts(savedSchema,savedReply)).toBe(true);
  const wrong=structuredClone(reply);wrong.keyIdeas[0].activityIds=['unpublished-mission'];expect(accepts(schema,wrong)).toBe(false);
  const changed=structuredClone(reply);changed.introduction.citations[0].evidence='Unseen summary evidence.';expect(accepts(schema,changed)).toBe(true);expect(()=>validateOverviewDraft(normalizeGameDirectorStructuredReply('overview',changed),node,work,context)).toThrow(/exact instructional/);
 });
 it('normalizes only documented absence, rejects mixed refusal, and never hides unknown null fields',()=>{
  expect(normalizeGameDirectorStructuredReply('write',{missions:null,cannotBuild:'The source has no sequence.'})).toEqual({cannotBuild:'The source has no sequence.'});
  expect(normalizeGameDirectorStructuredReply('overview',{title:null,introduction:null,learningGoals:null,keyIdeas:null,cannotSummarize:'No instructional material.'})).toEqual({cannotSummarize:'No instructional material.'});
  expect(()=>normalizeGameDirectorStructuredReply('write',{missions:[],cannotBuild:'decline'})).toThrow(/both/);
  expect(()=>normalizeGameDirectorStructuredReply('overview',{title:'Invented title',cannotSummarize:'decline'})).toThrow(/both/);
  expect(normalizeGameDirectorStructuredReply('plan',{missions:null,study:null,overviewNotes:null,unknown:null})).toEqual({missions:null,study:null,unknown:null});
  const f=fixture(),invalid={...f.wirePlan,unknown:null};expect(()=>validateNewGameBatchPlan(normalizeGameDirectorStructuredReply('plan',invalid),f.batch,f.units,f.notebook)).toThrow(/unsupported/);
 });
 it('all emitted objects are strict, audience bounds match teaching, and schemas stay below provider cap',()=>{
  for(const age of ['3-5','6-8','9-11','12-14','15-17','adult']){
   const f=fixture();f.planData.ageGroup=age;f.writeData.ageGroup=age;
   for(const [stage,input] of [['plan',f.planData],['write',f.writeData],['check',{missions:[{missionId:'mission-1'}]}],['overview',{ageGroup:age,units:[{unitId:'u',excerpt:'Instructional material'}],missionIds:[]}]] as const){const schema=getGameDirectorOutputSchema(stage,input)!;assertStrictSubset(schema);expect(new TextEncoder().encode(JSON.stringify(schema)).byteLength).toBeLessThan(65536);expect(schema.type).toBe('object');expect(schema).not.toHaveProperty('anyOf');}
   const writing=getGameDirectorOutputSchema('write',f.writeData) as any,teaching=writing.properties.missions.anyOf[0].items.properties.teaching;
   expect(teaching.properties.chunks.maxItems).toBe(age==='3-5'||age==='6-8'?3:age==='9-11'?4:5);
   expect(teaching.properties.conceptExplanation.properties.text.maxLength).toBe({'3-5':180,'6-8':280,'9-11':420,'12-14':520,'15-17':620,adult:700}[age]);
  }
 });
});
