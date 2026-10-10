import {planningExpressions} from './gamePlanningCatalog';
/** Structured generation constrains response shape, not source truth or playability.
 * Existing director, evidence, teaching and gameplay validators remain mandatory.
 * Use only closed objects, explicit required keys and nested nullable alternatives;
 * optional nulls are removed at the new-provider-reply boundary below, never on save.
 */
export type GameDirectorSchemaStage='direction'|'plan'|'write'|'check'|'overview';
export type GameDirectorOutputSchema=Record<string,unknown>;
type Data=Record<string,unknown>;
const object=(value:unknown):value is Data=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const data=(value:unknown):Data=>{if(!object(value))throw Error('Structured creation requires the disclosed request data.');return value;};
const rows=(value:unknown):Data[]=>Array.isArray(value)?value.filter(object):[];
const strings=(value:unknown[]):string[]=>[...new Set(value.filter((item):item is string=>typeof item==='string'&&!!item))];
const text=(maxLength=4000,minLength=1):GameDirectorOutputSchema=>({type:'string',minLength,maxLength});
const enumeration=(values:unknown[]):GameDirectorOutputSchema=>{const allowed=strings(values);return allowed.length?{type:'string',enum:allowed}:text(200);};
const literal=(value:string|number|boolean):GameDirectorOutputSchema=>({type:typeof value==='number'?'integer':typeof value,enum:[value]});
const closed=(properties:Record<string,GameDirectorOutputSchema>):GameDirectorOutputSchema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=(items:GameDirectorOutputSchema,minItems:number,maxItems:number):GameDirectorOutputSchema=>({type:'array',items,minItems,maxItems});
const nullable=(schema:GameDirectorOutputSchema):GameDirectorOutputSchema=>({anyOf:[schema,{type:'null'}]});
const boolean:GameDirectorOutputSchema={type:'boolean'};
const identifier:GameDirectorOutputSchema={type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z][A-Za-z0-9_-]*$'};
const integer=(minimum:number,maximum:number):GameDirectorOutputSchema=>({type:'integer',minimum,maximum});
const MOMENTS=['welcome','concept','hint','retry','success','reflection'] as const;
const ageBounds=(age:unknown)=>age==='3-5'?{text:180,chunks:3,overview:180,ideas:3}:age==='6-8'?{text:280,chunks:3,overview:280,ideas:3}:age==='9-11'?{text:420,chunks:4,overview:420,ideas:4}:age==='12-14'?{text:520,chunks:5,overview:650,ideas:5}:age==='15-17'?{text:620,chunks:5,overview:650,ideas:5}:{text:700,chunks:5,overview:650,ideas:5};
const draftCitation=(sourceIds:unknown[])=>closed({sourceId:enumeration(sourceIds),evidence:text(1200)});
const unitCitation=(unitIds:unknown[])=>closed({unitId:enumeration(unitIds),evidence:text(1200)});
const claim=(citation:GameDirectorOutputSchema,max:number,maxCitations=2)=>closed({text:text(max),citations:array(citation,1,maxCitations)});

function directionSchema(input:Data){
 const choices=rows(input.choices),audioChoices=choices.map(choice=>dataOrEmpty(choice.audioChoices));
 // A missing catalog must not turn an allowlist into unrestricted free text.
 const disclosedEnum=(values:unknown[])=>{const allowed=strings(values);if(!allowed.length)throw Error('Story and sound selection requires a nonempty disclosed catalog.');return enumeration(allowed);};
 const audioIds=(key:string)=>audioChoices.flatMap(choice=>Array.isArray(choice[key])?choice[key]:[]);
 const nativeIds=strings(choices.flatMap(choice=>Array.isArray(choice.nativeTemplateIds)?choice.nativeTemplateIds:[])).filter(id=>['signalwright-workshop','restoration-field-station','archive-investigation'].includes(id));
 // Cross-field compatibility still requires the direction validator: a valid
 // catalog ID alone does not make a sound or native world fit the chosen game.
 return closed({primaryScaffoldId:disclosedEnum(choices.map(choice=>choice.scaffoldId)),title:text(120),premise:text(600),throughline:text(600),fitReason:text(500),audioDirection:closed({version:literal(1),playTrackId:disclosedEnum(audioIds('playTrackIds')),studyTrackId:disclosedEnum(audioIds('studyTrackIds')),effectProfileId:disclosedEnum(audioIds('effectProfileIds')),effects:enumeration(['standard','quiet','off'])}),nativeTemplateId:nativeIds.length?nullable(enumeration(nativeIds)):{type:'null'}});
}

function planSchema(input:Data){
 const units=rows(input.units),choices=rows(input.choices),unitIds=units.map(unit=>unit.unitId),eligible=units.filter(unit=>unit.missionEligible===true),assets=strings(units.flatMap(unit=>Array.isArray(unit.sourceAssetIds)?unit.sourceAssetIds:[])),expressions=planningExpressions(input);
 const poses=closed(Object.fromEntries(MOMENTS.map(moment=>[moment,nullable(enumeration(expressions.filter(expression=>Array.isArray(expression.moments)&&expression.moments.includes(moment)).map(expression=>expression.id)))])));
 const mission=closed({id:identifier,unitId:enumeration(eligible.map(unit=>unit.unitId)),kind:enumeration(choices.map(choice=>choice.kind)),scaffoldId:enumeration(choices.map(choice=>choice.scaffoldId)),title:text(180),objective:text(400),visualDirection:closed({scene:enumeration(choices.map(choice=>choice.scene)),sourceAssetIds:array(enumeration(assets),0,Math.min(8,assets.length))}),asterDirection:nullable(poses)});
 return closed({missions:array(mission,0,Math.min(3,eligible.length)),study:array(closed({unitId:enumeration(unitIds),reason:text(600)}),0,Math.min(3,units.length)),overviewNotes:nullable(array(closed({unitId:enumeration(unitIds),summary:nullable(claim(unitCitation(unitIds),ageBounds(input.ageGroup).overview))}),units.length,units.length))});
}
function checkSchema(input:Data){
 const missions=rows(input.missions),quality=closed({understandable:boolean,lessonSupportsTask:boolean,controlsMatch:boolean,feedbackExplains:boolean});
 return closed({checks:array(closed({missionId:enumeration(missions.map(mission=>mission.missionId)),decision:enumeration(['retain','source-study']),reason:text(600),quality}),missions.length,missions.length)});
}

function savedCitation(sourceIds:unknown[]){
 return closed({sourceId:enumeration(sourceIds),sourceRevision:text(200),start:integer(0,2_000_000),end:integer(1,2_000_000),quote:text(1200),locator:closed({kind:enumeration(['text','page','slide','sheet','timestamp']),label:text(200),lineStart:integer(1,2_000_001),lineEnd:integer(1,2_000_001)})});
}
function overviewSchema(input:Data){
 const units=rows(input.units),summaries=rows(input.summaries),raw=units.filter(unit=>typeof unit.excerpt==='string'),saved=units.flatMap(unit=>rows(dataOrEmpty(unit.savedSummary).citations));
 for(const summary of summaries){const content=dataOrEmpty(summary.content);saved.push(...rows(dataOrEmpty(content.introduction).citations),...rows(content.learningGoals).flatMap(goal=>rows(goal.citations)),...rows(content.keyIdeas).flatMap(idea=>rows(idea.citations)));}
 const citationOptions:GameDirectorOutputSchema[]=[];
 if(raw.length)citationOptions.push(unitCitation(raw.map(unit=>unit.unitId)));
 if(saved.length)citationOptions.push(savedCitation(saved.map(ref=>ref.sourceId)));
 // No disclosed instructional citation can support a success; the local validator
 // still checks every exact saved object and every raw quotation on admission.
 const citation=citationOptions.length===1?citationOptions[0]:citationOptions.length?{anyOf:citationOptions}:unitCitation([]),bounds=ageBounds(input.ageGroup),missionIds=Array.isArray(input.missionIds)?input.missionIds:[];
 return closed({title:nullable(text(100)),introduction:nullable(claim(citation,bounds.overview)),learningGoals:nullable(array(claim(citation,bounds.overview),1,4)),keyIdeas:nullable(array(closed({title:text(100),text:text(bounds.overview),citations:array(citation,1,2),activityIds:array(enumeration(missionIds),0,Math.min(4,missionIds.length))}),1,bounds.ideas)),cannotSummarize:nullable(text(500))});
}
const dataOrEmpty=(value:unknown):Data=>object(value)?value:{};

function teachingSchema(input:Data,mission:Data){
 const unit=dataOrEmpty(mission.unit),story=dataOrEmpty(mission.storyContext),bounds=ageBounds(input.ageGroup),citation=draftCitation([unit.sourceId]);
 const explanation=claim(citation,bounds.text,4),step=closed({title:text(100),text:text(bounds.text),citations:array(citation,1,4)});
 return closed({title:text(150),objective:text(300),conceptExplanation:explanation,chunks:array(closed({id:{...identifier,maxLength:60},title:text(100),text:text(bounds.text),citations:array(citation,1,4)}),2,bounds.chunks),guidedApplication:closed({prompt:text(bounds.text),steps:array(text(bounds.text),1,4)}),workedExample:nullable(closed({title:text(100),sourceEvidence:citation,steps:array(step,1,4)})),storyFrame:nullable(closed({fictional:literal(true),setting:typeof story.setting==='string'?literal(story.setting):text(350),role:typeof story.role==='string'?literal(story.role):text(100),mission:text(350),success:text(250)}))});
}
function activitySchema(kind:string,sourceId:unknown):GameDirectorOutputSchema|undefined{
 const item=closed({id:identifier,label:text()}),refs=array(integer(0,7),1,8);
 const base={version:literal(1),id:literal('assistant-draft'),kind:literal(kind),title:text(),instruction:text(),explanation:text(),hint:text(),reviewStatus:literal('needs-review'),sourceRefs:array(closed({sourceId:enumeration([sourceId]),evidence:text(6000)}),1,8)};
 switch(kind){
  case 'sequence':return closed({...base,items:array(item,2,8),constraints:array(closed({before:identifier,after:identifier}),1,12)});
  case 'classification':return closed({...base,categories:array(item,2,8),items:array(item,2,8),membership:array(closed({itemId:identifier,categoryIds:array(identifier,1,8)}),2,8)});
  case 'dependency':return closed({...base,nodes:array(item,2,8),edges:array(closed({from:identifier,to:identifier,relation:text(120)}),1,12),acyclic:boolean});
  case 'completion':return closed({...base,context:text(),tokens:array(item,2,8),slots:array(closed({id:identifier,before:text(4000,0),after:text(4000,0),acceptedTokenIds:array(identifier,1,8),reason:text(),evidenceRefs:refs}),1,8)});
  case 'explanation':return closed({...base,pieces:array(closed({id:identifier,role:enumeration(['claim','evidence','warrant','counterpoint','rebuttal']),text:text(),evidenceRefs:refs}),3,12),arguments:array(closed({id:identifier,label:text(),prompt:text(),evidenceRefs:refs,alternatives:array(closed({id:identifier,claimId:identifier,evidenceIds:array(identifier,1,12),warrantId:identifier,explanation:text(),evidenceRefs:refs,counterpointId:nullable(identifier),rebuttalId:nullable(identifier)}),1,12)}),1,3)});
  // These contracts contain response-defined dictionary keys or recursive rules.
  // Do not replace their existing valid wire format with invented fixed keys or
  // weak open objects merely to claim universal schema support.
  default:return;
 }
}
function writeSchema(input:Data):GameDirectorOutputSchema|undefined{
 const missions=rows(input.missions);if(missions.length!==1)return;
 const mission=missions[0],plan=dataOrEmpty(mission.plan),unit=dataOrEmpty(mission.unit),activity=activitySchema(String(plan.kind),unit.sourceId);if(!activity)return;
 const audio=dataOrEmpty(mission.audioChoices),direction=dataOrEmpty(input.creativeDirection),shared=dataOrEmpty(direction.audioDirection);
 // Already chosen primary sound needs copying, not another creative decision.
 // Constrain supported structured-output providers to that exact saved choice;
 // the ordinary writer and stored-design validators enforce the same invariant.
 const useShared=direction.primaryScaffoldId===plan.scaffoldId&&shared.version===1;
 const audioField=(key:string,catalog:string)=>useShared&&typeof shared[key]==='string'?literal(shared[key] as string):enumeration(rows(audio[catalog]).map(track=>track.id));
 const audioDirection=closed({version:literal(1),playTrackId:audioField('playTrackId','playTracks'),studyTrackId:audioField('studyTrackId','studyTracks'),effectProfileId:audioField('effectProfileId','effectProfiles'),effects:useShared&&typeof shared.effects==='string'?literal(shared.effects):enumeration(['standard','quiet','off'])});
 return closed({missions:nullable(array(closed({missionId:enumeration([plan.id]),activity,teaching:teachingSchema(input,mission),audioDirection}),1,1)),cannotBuild:nullable(text(500))});
}

/** referenceData is the exact object already disclosed after REFERENCE DATA (JSON).
 * Undefined deliberately means keep the existing validated JSON generation path.
 */
export function getGameDirectorOutputSchema(stage:GameDirectorSchemaStage,referenceData:unknown):GameDirectorOutputSchema|undefined{
 const input=data(referenceData),schema=stage==='direction'?directionSchema(input):stage==='plan'?planSchema(input):stage==='check'?checkSchema(input):stage==='overview'?overviewSchema(input):writeSchema(input);
 if(schema&&new TextEncoder().encode(JSON.stringify(schema)).byteLength>64*1024)return;
 return schema;
}
function omitNull(value:Data,key:string){if(value[key]===null)delete value[key];}
function exclusiveResult(value:Data,refusal:string,success:string[]){
 if(value[refusal]!==undefined&&value[refusal]!==null){
  if(success.some(key=>value[key]!==undefined&&value[key]!==null))throw Error('A structured reply cannot both provide content and decline it.');
  for(const key of success)omitNull(value,key);
 }else omitNull(value,refusal);
}
/** Only call when this request actually used its structured output schema. This
 * does not validate or repair facts, missing required fields, unknown keys,
 * quotations, identifiers, coverage, decisions or malformed non-null content.
 */
export function normalizeGameDirectorStructuredReply(stage:GameDirectorSchemaStage,reply:unknown):Record<string,unknown>{
 const value=structuredClone(data(reply));
 if(stage==='direction')omitNull(value,'nativeTemplateId');
 else if(stage==='plan'){
  omitNull(value,'overviewNotes');
  for(const mission of rows(value.missions)){omitNull(mission,'asterDirection');if(object(mission.asterDirection))for(const moment of MOMENTS)omitNull(mission.asterDirection,moment);}
 }else if(stage==='write'){
  exclusiveResult(value,'cannotBuild',['missions']);
  for(const mission of rows(value.missions)){
   if(object(mission.teaching)){omitNull(mission.teaching,'workedExample');omitNull(mission.teaching,'storyFrame');}
   if(object(mission.activity)&&mission.activity.kind==='explanation')for(const argument of rows(mission.activity.arguments))for(const alternative of rows(argument.alternatives)){omitNull(alternative,'counterpointId');omitNull(alternative,'rebuttalId');}
  }
 }else if(stage==='overview')exclusiveResult(value,'cannotSummarize',['title','introduction','learningGoals','keyIdeas']);
 return value;
}
