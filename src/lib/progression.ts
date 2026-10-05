import type {IndependentActivityAward,LearningCard,Notebook,PracticeAward,Progress,Source} from '../types';
import {evaluateActivityForAuthoring,type StructuredActivity} from './structuredEngine';
import {textDigest} from './evidence';
import {sourceMediaIdentity} from './mediaAssets';
import {sourceLearningUnits,type SourceLearningUnit} from './sourceUnits';
import {hasLearningContentQuote} from './sourceContent';
import {modelPracticeResponse} from './modelPractice';

export const MAX_PRACTICE_AWARDS=10_000;
export const PRACTICE_XP={card:10,activity:20,study:5} as const;
export const MAX_INDEPENDENT_ACTIVITY_AWARDS=10_000;
export const INDEPENDENT_ACTIVITY_XP=50;
export type PracticeObjective={kind:'card';card:LearningCard}|{kind:'activity';activity:StructuredActivity}|{kind:'study';unit:SourceLearningUnit};
const objectiveId=(objective:PracticeObjective)=>objective.kind==='card'?objective.card.id:objective.kind==='activity'?objective.activity.id:objective.unit.id;

export function practiceXp(progress:Progress):number{return progress.practice?.xp??0;}
export function journeyXp(progress:Progress):number{return progress.xp+practiceXp(progress);}

function canonical(value:unknown):string {
 if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return`{${Object.entries(value).filter(([,child])=>child!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>`${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
 return JSON.stringify(value)??'null';
}
function cardModel(card:LearningCard){
 const {prompt,answer,options,correctIndex,sourceId,evidence,questionType}=card;
 return{prompt,answer,options,correctIndex,sourceId,evidence,questionType};
}
function withoutModelCosmetics(value:unknown,depth=0):unknown{
 if(depth>20)throw new Error('This activity exceeds the practice model nesting limit.');
 if(Array.isArray(value))return value.map(child=>withoutModelCosmetics(child,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['title','reviewStatus','hint','explanation','scaffoldIds','extractedFrom','presentation'].includes(key)).map(([key,child])=>[key,withoutModelCosmetics(child,depth+1)]));
 return value;
}
function activityModel(activity:StructuredActivity){
 const {id:_id,title:_title,reviewStatus:_review,explanation:_explanation,hint:_hint,scaffoldIds:_recipes,extractedFrom:_origin,...model}=activity;
 // Target coordinates position artwork; the labels and mapping define the answer.
 if(model.kind==='diagram')return{...model,targets:model.targets.map(({id,label})=>({id,label})),sourceRefs:model.sourceRefs.map(({sourceId,evidence})=>({sourceId,evidence}))};
 // A construction witness may move on the canvas without changing its graph.
 if(model.kind==='construction')return{...model,referenceBuilds:model.referenceBuilds.map(build=>({...build,instances:build.instances.map(({id,componentId})=>({id,componentId}))})),sourceRefs:model.sourceRefs.map(({sourceId,evidence})=>({sourceId,evidence}))};
 return{...model,sourceRefs:model.sourceRefs.map(({sourceId,evidence})=>({sourceId,evidence}))};
}
function citedSourceIds(objective:PracticeObjective):string[]{
 if(objective.kind==='card')return objective.card.sourceId?[objective.card.sourceId]:[];
 if(objective.kind==='study')return[objective.unit.sourceId];
 const ids=new Set(objective.activity.sourceRefs.map(reference=>reference.sourceId));
 const visit=(value:unknown,key='',depth=0)=>{
  if(depth>20)throw new Error('This activity exceeds the practice model nesting limit.');
  if(/sourceId$/i.test(key)&&typeof value==='string')ids.add(value);
  if(/sourceIds$/i.test(key)&&Array.isArray(value))for(const id of value)if(typeof id==='string')ids.add(id);
  if(Array.isArray(value))value.forEach(child=>visit(child,'',depth+1));
  else if(value&&typeof value==='object')for(const[childKey,child]of Object.entries(value))visit(child,childKey,depth+1);
 };
 visit(objective.activity);return[...ids].sort();
}
function citedMedia(objective:PracticeObjective,notebook:Notebook){
 const sources=new Map(notebook.sources.map(source=>[source.id,source])),ids=new Set(citedSourceIds(objective));
 // Retained transcripts and captured frames refer to their original recording.
 const addParents=(source:Source|undefined,seen=new Set<string>())=>{
  if(!source||seen.has(source.id))return;seen.add(source.id);
  const parentIds=[source.transcript?.mediaSourceId,source.visualEvidence?.parentSourceId].filter((id):id is string=>!!id);
  for(const id of parentIds){ids.add(id);addParents(sources.get(id),seen);}
 };
 for(const id of [...ids])addParents(sources.get(id));
 return[...ids].sort().map(id=>[id,sourceMediaIdentity(sources.get(id))]);
}
function contentKey(notebook:Notebook,objective:PracticeObjective):string {
 const model=objective.kind==='card'?cardModel(objective.card):objective.kind==='activity'?activityModel(objective.activity):{sourceId:objective.unit.sourceId,quote:objective.unit.quote};
 return textDigest(canonical({version:'practice-v1',kind:objective.kind,model:withoutModelCosmetics(model),media:citedMedia(objective,notebook)}));
}
function legacyIndependentAwards(progress:Progress,notebook:Notebook,at:string):Record<string,IndependentActivityAward>{
 if((notebook.activities?.length??0)>300)throw new Error('This notebook exceeds the independent activity objective limit.');
 const awards:Record<string,IndependentActivityAward>={};let count=0;
 for(const activity of notebook.activities??[]){
  const saved=progress.structured?.[activity.id];
  if(!saved)continue;
  const response=saved.response&&typeof saved.response==='object'&&!Array.isArray(saved.response)?saved.response as Record<string,unknown>:undefined;
  const rawDraft=response?._draft,draft=rawDraft&&typeof rawDraft==='object'&&!Array.isArray(rawDraft)?rawDraft as Record<string,unknown>:undefined;
  const evaluation=saved.completed&&draft?.checked===true&&draft.hintUsed===false?evaluateActivityForAuthoring(activity,modelPracticeResponse(response)):undefined;
  // Old spacing counters sometimes missed a paid checked result. An explicit
  // assisted result keeps its entitlement; ambiguous legacy completion is consumed.
  const completedIndependent=saved.completed&&draft?.hintUsed!==true&&(!saved.review||draft?.hintUsed===undefined||(evaluation?.valid===true&&evaluation.correct===true));
  if(!(saved.review?.independentSuccesses&&saved.review.independentSuccesses>0)&&!completedIndependent)continue;
  if(count>=MAX_INDEPENDENT_ACTIVITY_AWARDS)break;
  const key=contentKey(notebook,{kind:'activity',activity});
  if(!Object.hasOwn(awards,key)){awards[key]={objectiveId:activity.id,at};count++;}
 }
 return awards;
}
/** Capture reliable legacy milestones against their old content before clearing answers. */
export function migrateIndependentActivityAwards(progress:Progress,notebook:Notebook,now=new Date()):Progress{
 if(progress.independentActivityAwards!==undefined)return progress;
 if(progress.notebookId!==notebook.id)throw new Error('Independent activity progress belongs to a different notebook.');
 const at=now.toISOString(),awards=legacyIndependentAwards(progress,notebook,at);
 if(!Object.keys(awards).length)return progress;
 return{...progress,independentActivityAwards:awards,updatedAt:at,revision:Math.min(1_000_000,progress.revision+1)};
}
/** Award the first eligible independent result for exact content in one saveable snapshot. */
export async function awardIndependentActivityXp(progress:Progress,notebook:Notebook,activity:StructuredActivity,eligible:boolean,now=new Date(),legacyAlreadyEarned=false):Promise<Progress>{
 if(eligible!==true)return progress;
 if(progress.notebookId!==notebook.id)throw new Error('Independent activity progress belongs to a different notebook.');
 const key=contentKey(notebook,{kind:'activity',activity}),at=now.toISOString();
 let awards=progress.independentActivityAwards??legacyIndependentAwards(progress,notebook,at),count=Object.keys(awards).length,xp=progress.xp;
 if(progress.independentActivityAwards===undefined&&legacyAlreadyEarned&&!Object.hasOwn(awards,key)&&count<MAX_INDEPENDENT_ACTIVITY_AWARDS){awards={...awards,[key]:{objectiveId:activity.id,at}};count++;}
 if(!Object.hasOwn(awards,key)&&count<MAX_INDEPENDENT_ACTIVITY_AWARDS){xp+=INDEPENDENT_ACTIVITY_XP;awards={...awards,[key]:{objectiveId:activity.id,at}};}
 if(awards===progress.independentActivityAwards)return progress;
 return{...progress,xp,independentActivityAwards:awards,updatedAt:at,revision:Math.min(1_000_000,progress.revision+1)};
}
function legacyAwards(progress:Progress,notebook:Notebook,at:string):Record<string,PracticeAward>{
 if(notebook.cards.length>2000||(notebook.activities?.length??0)>300)throw new Error('This notebook exceeds the practice objective limit.');
 const awards:Record<string,PracticeAward>={};
 let count=0;
 const succeededCards=new Set([...progress.completedCardIds,...progress.attempts.filter(attempt=>attempt.correct).map(attempt=>attempt.cardId),...Object.entries(progress.cards).filter(([,saved])=>saved.correct>0||saved.lastCorrect).map(([id])=>id),...progress.journal.filter(entry=>entry.cardId&&entry.text.trim()).map(entry=>entry.cardId!)]);
 const seed=(objective:PracticeObjective)=>{
  if(count>=MAX_PRACTICE_AWARDS)return;
  const key=contentKey(notebook,objective);
  if(!Object.hasOwn(awards,key)){awards[key]={kind:objective.kind,objectiveId:objectiveId(objective),xp:0,at};count++;}
 };
 for(const card of notebook.cards)if(succeededCards.has(card.id))seed({kind:'card',card});
 for(const activity of notebook.activities??[]){
  const saved=progress.structured?.[activity.id];if(!saved)continue;
  if(saved.completed){seed({kind:'activity',activity});continue;}
  const response=saved.response&&typeof saved.response==='object'&&!Array.isArray(saved.response)?saved.response as Record<string,unknown>:undefined;
  const draft=response?._draft;
  if(draft&&typeof draft==='object'&&!Array.isArray(draft)&&(draft as Record<string,unknown>).checked===true){
   const evaluation=evaluateActivityForAuthoring(activity,modelPracticeResponse(response));
   if(evaluation.valid&&(evaluation.correct===true||evaluation.outcome==='self-reviewed'))seed({kind:'activity',activity});
  }
 }
 const completedStudies=new Map<string,string[]>();
 for(const study of Object.values(progress.studies??{}))if(study.completed&&study.quote.trim())completedStudies.set(study.sourceId,[...(completedStudies.get(study.sourceId)??[]),study.quote]);
 for(const source of notebook.sources){
  const quotes=completedStudies.get(source.id);if(!quotes)continue;
  for(const unit of sourceLearningUnits(source))if(quotes.some(quote=>hasLearningContentQuote(source.text,quote,unit.start,unit.end)))seed({kind:'study',unit});
 }
 return awards;
}

/** Return a single saveable snapshot. The caller owns correctness and durable saving.
 * Exact content can earn game points once; historical keys are never discarded. */
export async function awardPracticeXp(progress:Progress,notebook:Notebook,objective:PracticeObjective,eligible:boolean,now=new Date(),legacyAlreadySucceeded=false):Promise<Progress>{
 if(eligible!==true)return progress;
 if(progress.notebookId!==notebook.id)throw new Error('Practice progress belongs to a different notebook.');
 const key=contentKey(notebook,objective),at=now.toISOString();
 const id=objectiveId(objective);
 let awards=progress.practice?.awards??legacyAwards(progress,notebook,at),xp=practiceXp(progress);
 let count=Object.keys(awards).length;
 if(progress.practice===undefined&&legacyAlreadySucceeded&&!Object.hasOwn(awards,key)&&count<MAX_PRACTICE_AWARDS){awards={...awards,[key]:{kind:objective.kind,objectiveId:id,xp:0,at}};count++;}
 if(!Object.hasOwn(awards,key)&&count<MAX_PRACTICE_AWARDS){
  const gained=PRACTICE_XP[objective.kind];xp+=gained;awards={...awards,[key]:{kind:objective.kind,objectiveId:id,xp:gained,at}};
 }
 if(awards===progress.practice?.awards)return progress;
 return{...progress,practice:{xp,awards},updatedAt:at,revision:Math.min(1_000_000,progress.revision+1)};
}
