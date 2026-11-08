import {scaffoldRequiredCapabilities} from './scaffoldRuntime';
/** Provider shape contracts mirror the bounded authoring engines. They do not
 * establish source truth, reachability, solvability, or accepted capability. */
export type ActivityOutputSchema=Record<string,unknown>;
type S=ActivityOutputSchema;
const txt=(maxLength=4000,minLength=1):S=>({type:'string',minLength,maxLength});
const num=(minimum=-1e9,maximum=1e9):S=>({type:'number',minimum,maximum});
const int=(minimum=0,maximum=1e9):S=>({type:'integer',minimum,maximum});
const bool:S={type:'boolean'},nil:S={type:'null'};
const lit=(value:string|number|boolean):S=>({type:typeof value==='number'?'integer':typeof value,enum:[value]});
const en=(values:string[]):S=>({type:'string',enum:values});
const id:S={type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z][A-Za-z0-9_-]*$'};
const obj=(properties:Record<string,S>):S=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const arr=(items:S,minItems=1,maxItems=8):S=>({type:'array',items,minItems,maxItems});
const union=(...anyOf:S[]):S=>({anyOf});
const optional=(schema:S)=>union(schema,nil);
const ids=(min=1,max=8)=>arr(id,min,max);
const refs=arr(int(0,7));
const cited={evidenceRefs:refs};
const item={id,label:txt(1000)};
const primitive=union(txt(2000,0),num(),bool,nil);
const dictionary=(values:S,minProperties=0,maxProperties=8):S=>({type:'object',properties:{},required:[],additionalProperties:values,minProperties,maxProperties});
const rule:S={$ref:'#/$defs/rule'};
export const activityRuleDefinition:S=union(
 obj({op:en(['eq','neq']),field:id,value:primitive}),
 obj({op:en(['gt','gte','lt','lte']),field:id,value:num()}),
 obj({op:lit('in'),field:id,value:arr(primitive,1,8)}),
 obj({op:en(['and','or']),rules:arr(rule,1,8)}),
 obj({op:lit('not'),rule}),
);
const reviewChoice=obj({...item,...cited});
const debrief=obj({prompt:txt(2000),choices:arr(reviewChoice,2,4),acceptedChoiceIds:ids(1,4),...cited});
function scenarioPresentation(capabilities:readonly string[]):S|undefined{
 if(capabilities.includes('scenario:prediction'))return obj({prediction:obj({prompt:txt(2000),revisionPrompt:txt(2000),hypotheses:arr(obj({...item,prediction:txt(2000),...cited}),2,4),beforeActionIds:ids(),outcomeObservationIds:ids(),acceptedFinalHypothesisIds:ids(1,4),reviewPrompt:txt(2000),reviewChoices:arr(reviewChoice,2,4),acceptedReviewIds:ids(1,4),...cited})});
 if(capabilities.includes('scenario:transfer-debrief'))return obj({campaign:obj({planningPrompt:txt(2000),revisionReasons:arr(reviewChoice,2,4),stages:arr(obj({id,title:txt(200),briefing:txt(2000),actionIds:ids(),completionWhen:rule,focusObservationIds:ids(0,12),transfer:bool,changedContext:txt(2000),learningToTransfer:txt(2000),debrief,...cited}),2,3),...cited})});
 const perspective=capabilities.includes('scenario:perspective');
 if(perspective||capabilities.includes('scenario:dialogue'))return obj({dialogue:obj({mode:lit(perspective?'perspective':'conversation'),roles:arr(obj({id,name:txt(100),description:txt(2000),observationIds:ids(1,12),...cited}),2,4),initialRoleId:id,requiredRoleIds:ids(perspective?2:0,perspective?4:0),turns:arr(obj({id,speakerRoleId:id,when:rule,line:txt(2000),choices:arr(obj({actionId:id,utterance:txt(1200),...cited}),2,4),...cited}),2,4),debrief,...cited})});
 if(capabilities.includes('scenario:prompt-comparison'))return obj({promptComparison:obj({briefing:txt(2000),baselineCaseId:id,modelLabel:txt(2000),modelVersion:txt(2000),recordedAt:txt(2000),rubricVersion:txt(2000),cases:arr(obj({id,title:txt(2000),changeDescription:txt(2000),prompt:txt(4000),output:txt(4000),inspectActionId:id,observationId:id,...cited}),2,3),prediction:obj({prompt:txt(2000),choices:arr(reviewChoice,2,4),...cited}),criteria:arr(obj({...item,description:txt(2000),acceptedCaseIds:ids(1,3),...cited}),1,4),review:debrief,...cited})});
}
function explanationMode(capabilities:readonly string[]):Record<string,S>{
 if(capabilities.includes('explanation:partner'))return{partner:obj({roles:arr(obj({id,label:txt(100),instruction:txt(2000),...cited}),2,2),turns:arr(obj({id,roleId:id,task:en(['construct','review']),argumentIds:ids(1,3),instruction:txt(2000),...cited}),2,6)})};
 if(capabilities.includes('explanation:code-review'))return{codeReview:obj({sourceRefIndex:int(0,7),language:txt(80),code:txt(6000),spans:arr(obj({id,label:txt(200),start:int(0,5999),end:int(1,6000),...cited}),2,8),repairs:arr(obj({id,label:txt(200),text:txt(5000),...cited}),2,6),findings:arr(obj({id,label:txt(400),argumentId:id,alternatives:arr(obj({id,explanationAlternativeId:id,spanIds:ids(),repairId:id,explanation:txt(),...cited}),1,8),...cited}),1,3)})};
 return{};
}
export function gameActivityOutputSchema(kind:string,sourceId:unknown,scaffoldId:string,sourceCitation?:S):S|undefined{
 const capabilities=scaffoldRequiredCapabilities(scaffoldId);
 const base={version:lit(1),id:lit('assistant-draft'),kind:lit(kind),title:txt(),instruction:txt(),explanation:txt(),hint:txt(),reviewStatus:lit('needs-review'),sourceRefs:arr(sourceCitation??obj({sourceId:typeof sourceId==='string'?lit(sourceId):id,evidence:txt(6000)}))};
 const build=(fields:Record<string,S>)=>obj({...base,...fields});
 switch(kind){
  case 'sequence':return build({items:arr(obj(item),2),constraints:arr(obj({before:id,after:id}),1,12)});
  case 'classification':return build({categories:arr(obj(item),2),items:arr(obj(item),2),membership:arr(obj({itemId:id,categoryIds:ids()}),2)});
  case 'dependency':return build({nodes:arr(obj(item),2),edges:arr(obj({from:id,to:id,relation:txt(120)}),1,12),acyclic:bool});
  case 'recall':return build({questions:arr(obj({id,prompt:txt(1000),answer:txt(500),acceptedAnswers:arr(txt(500),0),reason:txt(2000),...cited}))});
  case 'completion':return build({context:txt(),tokens:arr(obj(item),2),slots:arr(obj({id,before:txt(4000,0),after:txt(4000,0),acceptedTokenIds:ids(),reason:txt(),...cited})),...(capabilities.includes('completion:pattern')?{pattern:obj({cycle:ids(2),shown:ids(2,12),offset:int(0,7)})}:{})});
  case 'decision':return build({context:dictionary(primitive,1),choices:arr(obj(item),2),rules:arr(obj({id,when:rule,choiceId:id,reason:txt()})),defaultChoiceId:id,defaultReason:txt()});
  case 'budget':return build({budget:num(0),currency:txt(100),items:arr(obj({...item,cost:num(0),unit:txt(100),maxQuantity:int(1,10000)}),2),requirements:arr(obj({...item,minimum:num(0),contributions:dictionary(num(0),1)}))});
  case 'rubric':return build({mode:en(['sample-review','self-assessment']),sample:txt(6000),criteria:arr(obj({...item,levels:arr(txt(1000),2,6),expectedLevel:optional(int(0,5))}),1,6)});
  case 'diagram':return build({targets:arr(obj({...item,x:num(0,100),y:num(0,100)}),2),labels:arr(obj(item),2),mapping:arr(obj({labelId:id,targetId:id}),2)});
  case 'data':return build({datasetTitle:txt(),limitations:txt(),columns:arr(obj({...item,type:en(['number','text']),unit:txt(100,0)}),1,6),rows:arr(obj({...item,values:dictionary(union(txt(4000,0),num(),nil),1,6),...cited}),2),chartColumnId:id,questions:arr(obj({id,prompt:txt(),operation:en(['count','sum','mean','min','max']),columnId:optional(id),filters:arr(obj({columnId:id,op:en(['eq','neq','gt','gte','lt','lte']),value:union(txt(4000,0),num())}),0,4),tolerance:num(0),requireEvidenceRows:bool,reason:txt(),...cited}),1,4)});
  case 'media':return build({mediaSourceId:id,duration:num(.001,86400),cues:arr(obj({id,start:num(0,86400),end:num(0,86400),text:txt(),...cited})),checkpoints:arr(obj({id,at:num(0,86400),prompt:txt(),choices:arr(obj(item),2,6),correctChoiceIds:ids(1,6),reason:txt(),...cited}),1,4)});
  case 'scenario':{
   const variable={id,label:txt(500),visibility:en(['visible','hidden']),...cited};
   const value=union(txt(500),int(-1000000,1000000),bool);
   const presentation=scenarioPresentation(capabilities);
   return build({variables:arr(union(obj({...variable,type:lit('boolean'),initial:bool}),obj({...variable,type:lit('number'),initial:int(-1000000,1000000),min:int(-1000000,1000000),max:int(-1000000,1000000)}),obj({...variable,type:lit('enum'),initial:txt(500),values:arr(txt(500),2,8)}))),budget:obj({label:txt(500),limit:int(1,10000),...cited}),maxSteps:int(1,8),observations:arr(obj({id,label:txt(500),text:txt(2000),...cited}),1,12),initialObservationIds:ids(0,12),actions:arr(obj({id,label:txt(500),description:txt(2000),cost:int(0,10000),maxUses:int(1,8),guard:optional(rule),transitions:arr(obj({id,when:optional(rule),effects:arr(union(obj({field:id,op:lit('set'),value}),obj({field:id,op:lit('add'),value:int(-1000000,1000000)})),0,8),reveal:ids(0,12),consequence:txt(2000),...cited}),1,4),...cited})),objectives:arr(obj({id,label:txt(500),when:rule,requiredObservations:ids(0,12),...cited})),successWhen:rule,failureWhen:optional(rule),...(presentation?{scenarioPresentation:presentation}:{})});
  }
  case 'construction':{
   const requirement={...item,...cited};
   return build({components:arr(obj({...item,description:txt(),maxInstances:int(1,8),ports:arr(obj({...item,direction:en(['in','out']),type:id,maxConnections:int(1,16)}),1,8),costs:dictionary(num(0,1e6)),...cited}),2),resources:arr(obj({...item,unit:txt(100),limit:num(0,1e6),...cited}),0),requirements:arr(union(obj({...requirement,kind:lit('instances'),componentIds:ids(),minimum:int(0,32),maximum:int(0,32)}),obj({...requirement,kind:lit('path'),from:ids(),to:ids(),through:arr(ids(),0,8),avoid:ids(0),scope:en(['some','every-target'])}))),allowCycles:bool,requireAllConnected:bool,referenceBuilds:arr(obj({instances:arr(obj({id,componentId:id,x:num(0,100),y:num(0,100)}),1,12),edges:arr(obj({from:id,fromPort:id,to:id,toPort:id}),0,24)}),1,2)});
  }
  case 'explanation':return build({pieces:arr(obj({id,role:en(['claim','evidence','warrant','counterpoint','rebuttal']),text:txt(),...cited}),3,12),arguments:arr(obj({...item,prompt:txt(),...cited,alternatives:arr(obj({id,claimId:id,evidenceIds:ids(1,12),warrantId:id,explanation:txt(),...cited,counterpointId:optional(id),rebuttalId:optional(id)}),1,8)}),1,3),...explanationMode(capabilities)});
  case 'picture':return build({mode:capabilities.includes('picture:word-picture')?lit('word-picture'):capabilities.includes('picture:discovery')?lit('discovery'):en(['discovery','word-picture']),sceneSourceId:typeof sourceId==='string'?lit(sourceId):id,sceneAlt:txt(2000),caregiverNote:txt(2000),tokens:arr(obj({id,label:txt(200),x:num(0,100),y:num(0,100),width:num(2,100),height:num(2,100),...cited}),2),rounds:arr(obj({id,prompt:txt(2000),tokenIds:ids(2,6),correctTokenIds:ids(1,6),reason:txt(2000),...cited}),1,4)});
  case 'rule-switch':return build({items:arr(obj({...item,attributes:dictionary(id,2,2),...cited}),3),rounds:arr(obj({id,feature:id,featureLabel:optional(txt(200)),label:txt(500),instruction:txt(2000),categories:arr(obj(item),2,5),...cited}),2,2),transitionInstruction:txt(2000)});
  case 'child-play':{
   const action={id,fromSceneId:id,toSceneId:id,actorId:id,label:txt(250),...cited};
   return build({mode:capabilities.includes('child-play:puppet-story')?lit('puppet-story'):capabilities.includes('child-play:pretend-play')?lit('pretend-play'):en(['puppet-story','pretend-play']),characters:arr(obj({id,name:txt(100),role:txt(200),puppet:en(['round','pointed','long-ears']),color:en(['sage','coral','blue','gold']),...cited}),2,4),props:arr(obj({id,name:txt(100),symbol:en(['apple','cup','book','parcel','seed','basket','token']),...cited}),1,4),stations:arr(obj({id,name:txt(100),...cited}),2,4),scenes:arr(obj({id,title:txt(150),narrative:txt(2000),speakerId:id,propLocations:dictionary(id,1,4),mood:en(['ready','thinking','celebrating']),ending:optional(en(['goal','reflect'])),...cited}),3,6),actions:arr(union(obj({...action,kind:lit('say')}),obj({...action,kind:lit('use-prop'),propId:id,stationId:id})),2),objectives:arr(union(obj({...item,kind:lit('perform'),actionIds:ids(),...cited}),obj({...item,kind:lit('place'),propId:id,stationId:id,...cited})),1,6),startSceneId:id,maxTurns:int(2,8),caregiverNote:txt(2000)});
  }
  case 'picture-build':{
   const requirement={...item,...cited},color=txt(7,7);
   return build({parts:arr(obj({...item,shape:en(['circle','rectangle','triangle','leaf','drop','cloud','star']),color,width:num(5,45),height:num(5,45),maxInstances:int(1,8),...cited}),2),zones:arr(obj({...item,x:num(0,100),y:num(0,100),width:num(10,100),height:num(10,100),color,...cited}),0,4),rules:arr(union(obj({...requirement,kind:lit('count'),partIds:ids(),minimum:int(0,24),maximum:int(0,24)}),obj({...requirement,kind:lit('zone'),partIds:ids(),zoneId:id,minimum:int(1,24),every:bool}),obj({...requirement,kind:lit('position'),subjectIds:ids(),objectIds:ids(),relation:en(['above','below','left-of','right-of']),minimumGap:num(0,80),scope:en(['some','every-subject'])}))),referenceBuilds:arr(obj({parts:arr(obj({id,partId:id,x:num(0,100),y:num(0,100)}),1,12)}),1,2),tell:obj({prompt:txt(2000),caregiverChecks:arr(obj({...item,...cited}),1,4),narrationSourceIds:arr(id,0,0),...cited})});
  }
 }
}
/** Optional budget witness is separate from the activity wire model. */
export const gameBudgetSolutionSchema:S=obj({quantities:dictionary(int(0,10000),1,8)});
/** Required only for the Codex strict subset: do not silently substitute guessed
 * dictionary keys. Claude supports these typed bounded additional properties. */
export function containsDynamicDictionary(value:unknown):boolean{
 if(Array.isArray(value))return value.some(containsDynamicDictionary);
 if(value&&typeof value==='object')return Object.entries(value).some(([key,entry])=>key==='additionalProperties'&&entry!==false||containsDynamicDictionary(entry));
 return false;
}
export function usesRuleDefinition(value:unknown):boolean{
 if(Array.isArray(value))return value.some(usesRuleDefinition);
 if(value&&typeof value==='object')return Object.entries(value).some(([key,entry])=>key==='$ref'&&entry==='#/$defs/rule'||usesRuleDefinition(entry));
 return false;
}
/** Remove documented provider null placeholders only. Real null context/data
 * values and unknown fields must survive for the ordinary validators to judge. */
export function normalizeActivitySchemaAbsence(value:Record<string,unknown>):void{
 const rows=(input:unknown):Record<string,unknown>[]=>Array.isArray(input)?input.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)):[];
 const omit=(input:Record<string,unknown>,key:string)=>{if(input[key]===null)delete input[key];};
 if(value.kind==='explanation')for(const argument of rows(value.arguments))for(const alternative of rows(argument.alternatives)){omit(alternative,'counterpointId');omit(alternative,'rebuttalId');}
 if(value.kind==='rubric')for(const criterion of rows(value.criteria))omit(criterion,'expectedLevel');
 if(value.kind==='data')for(const question of rows(value.questions))omit(question,'columnId');
 if(value.kind==='rule-switch')for(const round of rows(value.rounds))omit(round,'featureLabel');
 if(value.kind==='child-play')for(const scene of rows(value.scenes))omit(scene,'ending');
 if(value.kind==='scenario'){
  omit(value,'failureWhen');for(const action of rows(value.actions)){omit(action,'guard');for(const transition of rows(action.transitions))omit(transition,'when');}
 }
}
