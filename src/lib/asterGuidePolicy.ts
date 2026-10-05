import type {EvidenceReference,Notebook} from '../types';
import {currentAILearningMission} from './aiLearningPlan';
import {hasCurrentActivityEvidence} from './scaffoldRuntime';
import {sourceRevision} from './evidence';

export type AsterMode='library'|'creation'|'world'|'play'|'study';
export interface AsterGuideContext {notebook?:Notebook;mode:AsterMode;activityId?:string;creationStage?:string;feedback?:{outcome:'success'|'retry';eventKey:string;committed?:boolean;score?:{value:number;max?:number;xp?:number}}}
export interface AsterTip {id:string;title:string;text:string}
export interface AsterPreferences {mode:'helpful'|'quiet'|'off';dismissed:string[]}
export interface AsterSessionPolicy {shown:number;lastShownAt:number}
const key='asterloom:guide-preferences:v1';
let memory:AsterPreferences|undefined,storageListener=false;
export function getAsterPreferences():AsterPreferences {
 if(!storageListener&&typeof window!=='undefined'){storageListener=true;window.addEventListener('storage',event=>{if(event.key===key){memory=undefined;window.dispatchEvent(new CustomEvent('asterloom:guide-preferences'));}});}
 if(memory)return{...memory,dismissed:[...memory.dismissed]};
 let raw:unknown;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 memory={mode:value.mode==='quiet'||value.mode==='off'?value.mode:'helpful',dismissed:Array.isArray(value.dismissed)?value.dismissed.filter((id):id is string=>typeof id==='string'&&id.length<=240).slice(-100):[]};
 return{...memory,dismissed:[...memory.dismissed]};
}
export function setAsterPreferences(patch:Partial<AsterPreferences>):AsterPreferences {
 const previous=getAsterPreferences(),mode=patch.mode==='helpful'||patch.mode==='quiet'||patch.mode==='off'?patch.mode:previous.mode;
 memory={mode,dismissed:patch.dismissed?[...new Set(patch.dismissed.filter(id=>typeof id==='string'&&id.length<=240))].slice(-100):previous.dismissed};
 try{localStorage.setItem(key,JSON.stringify(memory));}catch{}
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:guide-preferences',{detail:getAsterPreferences()}));
 return getAsterPreferences();
}
export function dismissAsterTip(tip:AsterTip){const preference=getAsterPreferences();return setAsterPreferences({dismissed:[...preference.dismissed,tip.id]});}
/** The automatic bubble contains process guidance only; facts, answer hints, and sources require a deliberate reveal. */
export function contextualAsterTip(context:AsterGuideContext):AsterTip {
 const notebook=context.notebook,scope=notebook?.id??'library';
 const make=(key:string,title:string,text:string):AsterTip=>({id:`${scope}:${key}`,title,text});
 if(context.mode==='library')return make('welcome','A small start is enough','Choose one topic and add your own material. I can help you find your way as you build and learn.');
 if(context.mode==='creation'){
  if(!notebook?.sources.length)return make('add-sources','Begin with what you want to learn','Add a file, a link, or some notes. Then choose who the game is for and what you want to practice.');
  if(context.creationStage)return make('creating','Your material is becoming a game','You can let this step finish. The game designer uses your source material to prepare the learning activities.');
  if(notebook.sources.some(source=>source.status!=='ready'))return make('prepare-source','One useful next step','Open material that needs preparation and add or review its readable text. Clear source material gives your game a stronger foundation.');
  return make('review-sources','A quick source check helps','Check that the imported text says what you expect, especially captions or text read from images. Keep the source’s examples and conditions.');
 }
 if(context.mode==='play'){
  const score=context.feedback?.committed===true?context.feedback.score:undefined;
  if(score&&Number.isFinite(score.value)&&score.value>=0&&(score.max===undefined||Number.isFinite(score.max)&&score.max>=score.value)&&(score.xp===undefined||Number.isFinite(score.xp)&&score.xp>=0)){
   const points=score.max===undefined?`${score.value}`:`${score.value} / ${score.max}`;
   const xp=score.xp===undefined?'':score.xp>0?` This result added ${score.xp} XP.`:' This attempt adds no new XP.';
   const event=context.feedback!.eventKey.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
   return make(`saved:${event}`,'Your result is saved',`Saved score: ${points}.${xp} ${context.feedback!.outcome==='retry'?'Choose one source-backed change to try next.':'Take a moment to explain what made your approach work.'}`);
  }

  if(context.feedback?.outcome==='retry')return make(`retry:${context.activityId??'practice'}`,'Try one deliberate change','Choose one failed check, compare it with the source, and revise that part. You do not need to change everything at once.');
  if(context.feedback?.outcome==='success')return make(`success:${context.activityId??'practice'}`,'Make the idea yours','Pause and explain why your approach worked. When you are ready, try the next challenge with a little less help.');
  return make(`play:${context.activityId??'practice'}`,'Your next move matters','Look at the goal, try an action, and inspect what changes. Ask me for source help when you want it.');
 }
 if(context.mode==='study')return make('study','Read with a question in mind','What is the main relationship here? Put it into your own words, then compare your explanation with the source.');
 return make('world','Choose your next step','Pick a mission you want to practice. You can return to the material, try a different approach, or stop and come back later.');
}
export function shouldOfferAsterTip(context:AsterGuideContext,preferences:AsterPreferences,session:AsterSessionPolicy,now:number):boolean {
 if(preferences.mode!=='helpful'||session.shown>=4||now-session.lastShownAt<90_000)return false;
 if(context.mode==='play'&&(!context.feedback||context.feedback.committed!==true))return false;
 return !preferences.dismissed.includes(contextualAsterTip(context).id);
}
export interface AsterMissionHelp {title:string;text:string;steps:string[];citations:EvidenceReference[];origin:'prepared-teaching'|'ai-practice'|'authored-hint'}
/** Reviewed, current teaching is reused locally. Exact provenance is necessary; draft or stale lessons are not exposed as approved guidance. */
export function asterMissionHelp(notebook:Notebook|undefined,activityId:string|undefined):AsterMissionHelp|undefined {
 const activity=notebook?.activities?.find(item=>item.id===activityId);
 if(!notebook||!activity||!hasCurrentActivityEvidence(activity,notebook.sources))return undefined;
 const teaching=currentAILearningMission(notebook,activity);
 if(teaching)return{title:teaching.title,text:teaching.conceptExplanation.text,steps:[teaching.guidedApplication.prompt,...teaching.guidedApplication.steps],citations:teaching.conceptExplanation.citations,origin:teaching.reviewStatus==='reviewed'?'prepared-teaching':'ai-practice'};
 if(activity.reviewStatus!=='reviewed'||!activity.hint?.trim())return undefined;
 const citations=activity.sourceRefs.flatMap(ref=>{const source=notebook.sources.find(source=>source.id===ref.sourceId);if(!source)return[];const start=source.text.indexOf(ref.evidence);if(start<0)return[];const lineStart=source.text.slice(0,start).split('\n').length,lineEnd=lineStart+(ref.evidence.match(/\n/g)?.length??0);return[{sourceId:source.id,sourceRevision:sourceRevision(source),start,end:start+ref.evidence.length,quote:ref.evidence,locator:{kind:'text' as const,label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}}];}).slice(0,3);
 return{title:activity.title,text:activity.hint,steps:[],citations,origin:'authored-hint'};
}
