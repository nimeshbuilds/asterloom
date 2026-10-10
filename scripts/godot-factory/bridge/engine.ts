import {designedMission} from '../../../src/lib/gameDesign';
import {validateNotebook} from '../../../src/lib/package';
import {validateActivity,evaluateActivity,evaluateActivityForAuthoring,type StructuredActivity,type ActivityResponse} from '../../../src/lib/structuredEngine';
import {initialActivityResponse} from '../../../src/lib/activityResponse';
import {hasCurrentActivityEvidence,getScaffoldRuntimeDefinition,fitsSpecificContract} from '../../../src/lib/scaffoldRuntime';
import {scaffoldById} from '../../../src/data/scaffolds';
import {currentAILearningMission} from '../../../src/lib/aiLearningPlan';
import {scaffoldStoryContext} from '../../../src/lib/scaffoldStoryContext';
import {replayScenario,scenarioAvailableActions,advanceScenario,recordScenarioCommitment,scenarioConditionMet,type ScenarioResponse} from '../../../src/lib/scenarioEngine';
import type {ScenarioCommitmentInput} from '../../../src/lib/scenarioCommitments';
import {activeDialogueTurn} from '../../../src/lib/scenarioInteractions';
import {replayChildPlay,advanceChildPlay,type ChildPlayResponse} from '../../../src/lib/childPlayEngine';
import {acknowledgePartnerTurn,advancePartnerTurn,restartPartnerRound} from '../../../src/lib/compositionModes';
import type {ExplanationResponse} from '../../../src/lib/compositionEngine';
import type {Notebook,Source} from '../../../src/types';
import {canScoreRecallCard} from '../../../src/lib/utils';
import type {RecallActivity} from '../../../src/lib/recallEngine';

export interface FactoryPack { format:'asterloom-godot-factory';version:1;notebook:Notebook;missions:{scaffoldId:string;activityId:string;teaching?:ReturnType<typeof currentAILearningMission>;story?:ReturnType<typeof scaffoldStoryContext>}[] }
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Expected a data object.');return value as Record<string,unknown>;};
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}':JSON.stringify(value);
const boundedString=(value:unknown,max=100):string=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('An identifier is missing or too long.');return value;};
const exactKeys=(value:Record<string,unknown>,keys:string[])=>{if(Object.keys(value).some(key=>!keys.includes(key)))throw Error('The request contains unsupported fields.');};

/** Native gameplay shares the shipping engine's evidence and scoring rules.
 * Pack data cannot select a program, path, network address or executable code. */
export function validateFactoryPack(input:unknown):FactoryPack {
  const value=record(input);exactKeys(value,['format','version','notebook','missions']);
  if(value.format!=='asterloom-godot-factory'||value.version!==1)throw Error('Choose a supported Asterloom native game.');
  const notebook=validateNotebook(value.notebook);
  if(!Array.isArray(value.missions)||!value.missions.length||value.missions.length>300)throw Error('A native game needs 1–300 prepared missions.');
  const ids=new Set<string>();
  const missions=value.missions.map(raw=>{
    const entry=record(raw);exactKeys(entry,['scaffoldId','activityId','teaching','story','audioDirection']);
    const scaffoldId=boundedString(entry.scaffoldId),activityId=boundedString(entry.activityId);
    if(ids.has(activityId))throw Error('Each mission must identify a different activity.');ids.add(activityId);
    const activity=notebook.activities?.find(item=>item.id===activityId),scaffold=scaffoldById(scaffoldId),runtime=getScaffoldRuntimeDefinition(scaffoldId);
    if(!activity||!scaffold||!scaffold.ages.includes(notebook.ageGroup)||!runtime.engineReady||runtime.mode!=='structured'||!runtime.activityKinds.includes(activity.kind)||!activity.scaffoldIds?.includes(scaffoldId)||!fitsSpecificContract(scaffoldId,activity))throw Error('A mission does not implement its bound native template and age group.');
    if(!hasCurrentActivityEvidence(activity,notebook.sources))throw Error('A mission has missing, changed or unready source evidence.');
    // Ignore imported presentation caches; rebuild them from validated notebook data.
    const teaching=currentAILearningMission(notebook,activity),direction=designedMission(notebook.gameDesign,activity.id)?.audioDirection;
    return {scaffoldId,activityId,...(direction?{audioDirection:direction}:{}),...(teaching?{teaching}:{}),story:scaffoldStoryContext(scaffoldId,notebook.ageGroup,activity)};
  });
  return {format:'asterloom-godot-factory',version:1,notebook,missions};
}

export function factoryPackFromNotebook(notebook:Notebook):FactoryPack {
  if(!notebook.activities?.length&&scaffoldById('recall-escape-mission')?.ages.includes(notebook.ageGroup)) {
    const cards=notebook.cards.filter(card=>canScoreRecallCard(card,notebook.sources)&&card.evidence.includes(card.answer)&&card.answer.length<=500&&card.prompt.length<=1000);
    const activities:RecallActivity[]=[];
    for(let index=0;index<cards.length;index+=8){
      const group=cards.slice(index,index+8);
      activities.push({version:1,id:`legacy-recall-${index/8+1}`,kind:'recall',scaffoldIds:['recall-escape-mission'],title:`Source recall ${index/8+1}`,instruction:'Recall the source term for each lock. Reveal a term when you need support.',reviewStatus:group.every(card=>card.reviewStatus==='reviewed')?'reviewed':'needs-review',sourceRefs:group.map(card=>({sourceId:card.sourceId,evidence:card.evidence})),explanation:'These locks use the saved questions and their exact source-written answers.',hint:'Review the original passage when a term is unfamiliar.',extractedFrom:'legacy-source-cards',questions:group.map((card,n)=>({id:`lock-${n+1}`,prompt:card.prompt,answer:card.answer,acceptedAnswers:[],reason:card.explanation.slice(0,2000)||'Compare this term with the saved source passage.',evidenceRefs:[n]}))});
    }
    if(activities.length)notebook={...notebook,activities};
  }
  const missions=(notebook.activities??[]).map(activity=>{
    const preferred=[...(activity.scaffoldIds??[])].sort((a,b)=>Number(notebook.scaffoldIds.includes(b))-Number(notebook.scaffoldIds.includes(a)));
    const scaffoldId=preferred.find(id=>{const scaffold=scaffoldById(id),runtime=getScaffoldRuntimeDefinition(id);return scaffold?.ages.includes(notebook.ageGroup)&&runtime.engineReady&&runtime.mode==='structured'&&runtime.activityKinds.includes(activity.kind)&&fitsSpecificContract(id,activity);});
    if(!scaffoldId)throw Error(`The activity “${activity.title}” has no compatible native template.`);
    return {scaffoldId,activityId:activity.id};
  });
  return validateFactoryPack({format:'asterloom-godot-factory',version:1,notebook,missions});
}

function checkedActivity(input:unknown,sources:unknown):{activity:StructuredActivity;sources:Source[]} {
  if(!Array.isArray(sources)||sources.length>300)throw Error('The game sources must accompany every assessment.');
  const validated=validateNotebook({id:'native-assessment',title:'Native assessment',description:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',revision:1,ageGroup:'adult',theme:'islands',goal:'',scaffoldIds:[],sources,cards:[],activities:[input]});
  const activity=validated.activities![0];
  if(!hasCurrentActivityEvidence(activity,validated.sources))throw Error('Assessment requires current, ready source evidence.');
  return {activity,sources:validated.sources};
}

export function factoryView(activity:StructuredActivity,response:ActivityResponse) {
  if(activity.kind==='scenario') {
    const snapshot=replayScenario(activity,response,{practice:true});
    if(snapshot.phase==='invalid')throw Error(snapshot.error??'Invalid scenario state.');
    return {snapshot,availableActions:scenarioAvailableActions(activity,response,{practice:true}),dialogueTurns:activeDialogueTurn(activity,snapshot.state,scenarioConditionMet)??[]};
  }
  if(activity.kind==='child-play') {
    const snapshot=replayChildPlay(activity,response as ChildPlayResponse);
    if(snapshot.phase==='invalid')throw Error(snapshot.error??'Invalid story state.');
    return {snapshot,availableActions:activity.actions.filter(action=>action.fromSceneId===snapshot.scene.id).map(action=>({action,available:snapshot.phase==='active',reason:snapshot.phase==='active'?'':'This scene is complete.'}))};
  }
  return {availableActions:[]};
}

export function factoryRequest(input:unknown):Record<string,unknown> {
  try {
    const request=record(input);exactKeys(request,['version','op','pack','activity','sources','response','action']);
    if(request.version!==undefined&&request.version!==1)throw Error('Unsupported assessment protocol version.');
    if(request.op==='validate-pack')return {ok:true,pack:validateFactoryPack(request.pack)};
    const {activity}=checkedActivity(request.activity,request.sources);
    if(request.op==='initial') {const response=initialActivityResponse(activity,request.response,{practice:true});return {ok:true,response,view:factoryView(activity,response)};}
    if(request.op==='view')return {ok:true,view:factoryView(activity,record(request.response) as unknown as ActivityResponse)};
    if(request.op==='evaluate') {
      const evaluation=evaluateActivity(activity,request.response);
      // Draft play is useful practice, but is never promoted to reviewed mastery.
      const practice=activity.reviewStatus==='needs-review'?evaluateActivityForAuthoring(activity,request.response):undefined;
      return {ok:true,evaluation,...(practice?{practice:{...practice,credit:'practice-only',reviewStatus:'needs-review'}}:{})};
    }
    if(request.op!=='action')throw Error('Unsupported assessment operation.');
    const action=record(request.action);exactKeys(action,['type','actionId','commitment']);
    const response=record(request.response) as unknown as ActivityResponse;
    let next:ActivityResponse;
    if(activity.kind==='scenario'&&(action.type==='advance'||action.type==='commit')) {
      const result=action.type==='advance'?advanceScenario(activity,response as ScenarioResponse,boundedString(action.actionId),{practice:true}):recordScenarioCommitment(activity,response as ScenarioResponse,record(action.commitment) as unknown as ScenarioCommitmentInput,{practice:true});
      if(!result.success)throw Error(result.error);next=result.response;
    } else if(activity.kind==='child-play'&&action.type==='advance') {
      const result=advanceChildPlay(activity,response as ChildPlayResponse,boundedString(action.actionId));if(!result.success)throw Error(result.error);next=result.response;
    } else if(activity.kind==='explanation'&&activity.partner&&['partner-ack','partner-next','partner-restart'].includes(String(action.type))) {
      const before=initialActivityResponse(activity,response) as ExplanationResponse;
      if(canonical(before)!==canonical(response))throw Error('Restore the valid partner session before continuing.');
      next=action.type==='partner-ack'?acknowledgePartnerTurn(activity,before):action.type==='partner-next'?advancePartnerTurn(activity,before):restartPartnerRound(activity,before);
    } else throw Error('That action does not belong to this activity.');
    return {ok:true,response:next,view:factoryView(activity,next)};
  } catch(error) {return {ok:false,error:(error instanceof Error?error.message:'The local assessment failed.').slice(0,1000)};}
}
