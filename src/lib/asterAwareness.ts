import type {Notebook,Progress} from '../types';
import {gameDesignProgress,type GameCreationEvent} from './gameDesign';
import {directorInputRevision} from './gameDirectorSources';
import {isReadyLearningSource} from './scaffoldRuntime';
import type {AsterGuideContext} from './asterGuidePolicy';

/** Live UI state supplied by the host. Saved scores come separately from Progress/feedback. */
export interface AsterLearningState {
 title:string;phase:'lesson'|'answering'|'saving'|'feedback'|'complete'|'study';
 position?:number;total?:number;sourceId?:string;supported?:boolean;saveFailed?:boolean;nextAction?:string;
 lessonStage?:'mission'|'context'|'walkthrough'|'practice'|'ready';lessonStep?:number;lessonSteps?:number;
}
export interface AsterAwarenessContext extends AsterGuideContext {
 progress?:Progress;creationRunning?:boolean;learningState?:AsterLearningState;
 creationConnection?:{provider:string;model:string;endpointFingerprint:string|null};
}
export type AsterContextIntent='status'|'failure'|'next'|'progress'|'task'|'game'|'sources'|'log';
export interface AsterLogLine {id:string;at:string;label:string;message:string}
export interface AsterContextAnswer {intent:AsterContextIntent;title:string;lines:string[];log?:AsterLogLine[]}
export interface AsterAwareness {title:string;summary:string;details:string[];nextAction:string;failure:string;log:AsterLogLine[]}
const clean=(value:unknown,max=600)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const phaseLabel={plan:'Planning',write:'Writing',check:'Checking',finish:'Finishing'} as const;
const eventLabel={completed:'saved',retry:'retry recorded',failed:'failed', 'source-study':'source study retained',resumed:'resumed'} as const;
/** Deliberately narrow app intents; concept questions continue to cited source retrieval. */
export function asterContextIntent(question:unknown):AsterContextIntent|undefined {
 if(typeof question!=='string'||!question.trim()||question.length>500)return undefined;
 const q=question.toLowerCase().replace(/[’]/g,"'").replace(/[?!.]/g,'').replace(/\s+/g,' ').trim().replace(/^(please |can you |could you )/,'');
 if(/\b(logs?|history|diagnostics)\b/.test(q)&&/\b(show|see|read|tell|explain|what|view|creation|activity|recent)\b/.test(q)||/^(what happened|what has happened|what did you do)( so far| here| during creation)?$/.test(q))return'log';
 if(/^(?:explain |tell me )?(what failed|what went wrong|what is the (?:last |current )?(?:error|failure)|why did (?:it|this|the game|creation|the save) (?:fail|stop)|why is (?:it|this|the game|creation) stuck)(?: here| now| during creation)?$/.test(q)||/\b(why|what|which|explain|tell)\b/.test(q)&&/\b(failed|failure|error|went wrong|didn't finish|did not finish|stuck|stopped)\b/.test(q)&&/\b(?:my|our|this|current|latest|last) (?:game|creation|save|request|step|mission|activity)\b/.test(q))return'failure';
 if(/^(what|which)( should i do| do i do| is| comes|'s)? next\b/.test(q)||/\b(next step|next action|what should i do now|how do i continue|how can i continue|how do i resume)\b/.test(q))return'next';
 if(/\b(my|our|saved|current|game|learning|creation) (score|points|xp|progress)\b/.test(q)||/\b(how much|how many)\b.*\b(completed|finished|done|left|remaining)\b/.test(q)||/^(show|tell me|what is|what's|how is)( the)? progress$/.test(q))return'progress';
 if(/\b(which|what)\b.*\b(mission|challenge|activity|task|lesson|chapter)\b.*\b(am i|are we|current|on now|doing|working)\b/.test(q)||/^(what am i doing|what are we learning|where am i|where are we)$/.test(q))return'task';
 if(/\b(which|what|how many|show|tell me)\b.*\b(sources|materials|files)\b/.test(q)||/\b(which|what) source\b.*\b(using|reading|current|open|this)\b/.test(q))return'sources';
 if(/\b(which|what) (game|notebook)\b.*\b(this|open|playing|creating|called|name)\b/.test(q)||/^(tell me about|describe) (this|my|our) (game|notebook)$/.test(q))return'game';
 if(/^(?:explain |tell me )?(what('s| is) happening|what is going on|what's going on|what are you doing|what are we doing|what is the current (phase|state|status)|what's the current (phase|state|status)|how is it going)( right now| now| here| with (my|the) game| with creation)?$/.test(q)||/\b(creation|game creation|current activity) (status|phase|state)\b/.test(q))return'status';
 return undefined;
}
function logLines(events:GameCreationEvent[]|undefined):AsterLogLine[]{
 return (events??[]).filter(event=>event.phase in phaseLabel&&event.kind in eventLabel&&Number.isFinite(Date.parse(event.at))).map(event=>({id:event.id,at:event.at,label:`${phaseLabel[event.phase]} · ${eventLabel[event.kind]}${event.category?` · ${event.category}`:''}`,message:clean(event.message)}));
}
function learningLogLines(notebook:Notebook|undefined,progress:Progress|undefined):AsterLogLine[]{
 if(!notebook||progress?.notebookId!==notebook.id)return[];
 return[
  ...progress.attempts.slice(-20).map(attempt=>({id:`recall:${attempt.id}`,at:attempt.at,label:'Recall attempt saved',message:`${attempt.correct?'Correct':'Needs another attempt'}.${count(attempt.xp)?` ${attempt.xp} XP recorded.`:''}`})),
  ...Object.entries(progress.structured??{}).map(([id,state])=>({id:`activity:${id}:${state.updatedAt}`,at:state.updatedAt,label:state.attempts?'Activity progress saved':'Activity draft saved',message:`${clean(notebook.activities?.find(activity=>activity.id===id)?.title,180)||'Game activity'}: ${state.completed?'completed':'in progress'}.${state.attempts?` ${state.attempts} saved attempts.`:''}`})),
  ...Object.values(progress.studies??{}).filter(state=>state.completed).map(state=>({id:`study:${state.unitId}:${state.updatedAt}`,at:state.updatedAt,label:'Source study saved',message:`A source-study section is complete${notebook.sources.find(source=>source.id===state.sourceId)?` in ${clean(notebook.sources.find(source=>source.id===state.sourceId)!.title,180)}`:''}.`}))
 ].filter(line=>Number.isFinite(Date.parse(line.at)));
}
function currentDesign(notebook:Notebook|undefined){
 const design=notebook?.gameDesign;
 return design&&design.inputRevision===directorInputRevision(notebook!,{provider:design.provider.id,model:design.provider.model,endpointFingerprint:design.provider.endpointFingerprint})?design:undefined;
}
function lastFailure(context:AsterAwarenessContext):string {
 if(context.learningState?.saveFailed)return'Your latest progress save did not finish. That pending result has not been confirmed as saved; retry saving before continuing.';
 const design=currentDesign(context.notebook);
 const failed=[...(design?.events??[])].reverse().find(event=>event.kind==='failed'||event.kind==='retry');
 if(failed)return`Last recorded creation issue: ${phaseLabel[failed.phase]}${failed.category?` (${failed.category})`:''}. ${clean(failed.message)}`;
 const receipt=[...(design?.receipts??[])].reverse().find(receipt=>receipt.status==='failed'||receipt.status==='canceled'||receipt.status==='started'&&context.creationRunning===false);
 if(receipt){const stage=/writ/i.test(receipt.stage)?'writing':/plan/i.test(receipt.stage)?'planning':/check|valid/i.test(receipt.stage)?'checking':'AI';return`The last ${stage} request ${receipt.status==='canceled'?'was canceled':'did not finish'}. This older record does not include a failure reason.`;}
 return'No failure is recorded in the current local activity history. An older request may have ended without saving a reason.';
}
export function buildAsterAwareness(context:AsterAwarenessContext):AsterAwareness {
 const {notebook,learningState:task}=context,details:string[]=[];
 const title=clean(task?.title,180)||clean(notebook?.activities?.find(activity=>activity.id===context.activityId)?.title,180)||clean(notebook?.title,180)||'Your library';
 let summary='',nextAction='Choose a notebook to create a game or continue learning.';
 if(notebook){
  details.push(`Notebook: ${clean(notebook.title,180)}.`);
  const readable=notebook.sources.filter(source=>isReadyLearningSource(source,notebook.sources)).length;
  details.push(`${notebook.sources.length} source${notebook.sources.length===1?'':'s'} added; ${readable} ready for learning. ${notebook.activities?.length??0} game activities and ${notebook.cards.length} recall challenges are stored.`);
  if(context.mode==='creation'){
   const design=currentDesign(notebook);
   if(design){
    const p=gameDesignProgress(design),sourceReviewOnly=design.status==='ready'&&!p.missionCount,ready=design.status==='ready'&&notebook.creation?.status!=='draft';
    const selection=context.creationConnection,differentSelection=selection&&(selection.provider!==design.provider.id||selection.model!==design.provider.model||selection.endpointFingerprint!==design.provider.endpointFingerprint),changedSelection=context.creationRunning!==true&&differentSelection;
    const percent=ready||sourceReviewOnly?p.percent:Math.min(99,p.percent);
    details.push(`Saved ${sourceReviewOnly?'source-review':'creation'} progress${differentSelection?' from the previous AI selection':''}: ${p.completedSteps} of ${p.totalSteps} logical steps (${percent}%). ${p.coveredUnits} of ${p.totalUnits} source sections checked; ${p.completedBatches} of ${p.totalBatches} groups checked.`);
    details.push(`${p.completedMissions} of ${p.plannedMissions} planned mission models written; ${p.missionCount} retained game missions and ${p.studyOnlyCount} source-study sections after checking.`);
    summary=context.creationRunning===true?`Game creation is running. ${clean(context.creationStage)||`${phaseLabel[p.currentPhase??'finish']} the game${p.currentPhase!=='finish'?` in group ${p.currentBatch} of ${p.totalBatches}`:''}.`}`:changedSelection?'The saved creation records belong to a different AI selection. Your newly selected model has not started creating this game.':sourceReviewOnly?'Source review is complete and saved, but it did not retain a playable game mission.':ready?'Game creation is complete and saved.':`Game creation is unfinished${context.creationRunning===false?' and is not running in this screen':''}. The next saved phase is ${phaseLabel[p.currentPhase??'finish'].toLowerCase()}${p.currentPhase!=='finish'?` in group ${p.currentBatch} of ${p.totalBatches}`:''}.`;
    nextAction=context.creationRunning===true?'Let the current step finish. Saved checkpoints show completed work; they are not an estimate of time remaining.':changedSelection?'Choose Create my game to run the newly selected AI model.':sourceReviewOnly?'Add material with concrete supported examples, rules or procedures, or choose another AI model, then create the game again. You can also study the retained source sections.':ready?'Open the game and choose a mission.':p.canResume?'Choose Continue creating to resume from the saved checkpoint. Finished work is kept.':'Prepare readable source material, then create the game.';
   }else{
    summary=context.creationRunning===true?`Game preparation is running. ${clean(context.creationStage)||'Preparing your materials.'}`:'You are setting up a learning game. Creation has not saved a game plan yet.';
    nextAction=context.creationRunning===true?'Let the current preparation step finish.':!notebook.sources.length?'Add a file, a link, or notes, then choose your audience and learning goal.':readable?'Choose Create my game when the material and learning goal are ready.':'Open material that needs preparation and add or review its readable text.';
   }
  }else summary=context.mode==='world'?'You are choosing what to learn in this game.':context.mode==='study'?'You are studying source material.':'You are practicing a learning activity.';
 }
 if(task){
  const phaseText={lesson:'You are preparing the lesson before its challenge.',answering:'You are working on the current challenge.',saving:'Your current work is being saved. Wait for confirmation before continuing.',feedback:'The current task is showing feedback from its saved attempt.',complete:'This learning session is complete.',study:'You are studying the current source material.'};
  summary=task.saveFailed?'Your latest progress save did not finish. The pending result is waiting for a retry.':phaseText[task.phase];
  details.push(`Current task: ${title}.`);
  if(task.lessonStage&&task.phase==='lesson')details.push(`Lesson phase: ${({mission:'understand the mission',context:'read the source context',walkthrough:'follow the worked walkthrough',practice:'prepare and compare your explanation',ready:'ready for the challenge'})[task.lessonStage]}.${task.lessonStage==='walkthrough'&&count(task.lessonStep)&&count(task.lessonSteps)&&task.lessonSteps>0?` Step ${Math.min(task.lessonSteps,task.lessonStep)} of ${task.lessonSteps}.`:''}`);
  if(count(task.position)&&count(task.total)&&task.total>0&&task.position<=task.total)details.push(`Position: ${task.position} of ${task.total}.`);
  if(task.supported!==undefined&&task.phase!=='lesson'&&task.phase!=='study')details.push(task.supported?'This attempt uses learning support.':'This attempt has not used source help.');
  nextAction=task.saveFailed?clean(task.nextAction)||'Keep this page open and choose Retry saving progress.':task.phase==='saving'?'Wait for the save confirmation.':clean(task.nextAction)||({lesson:'Finish the lesson checkpoints, then enter the challenge.',answering:'Make your next move, then check your answer when ready.',saving:'Wait for the save confirmation.',feedback:'Read the feedback, then revise your attempt or continue.',complete:'Return to the notebook to choose another mission.',study:'Read the source and complete its study checkpoints.'})[task.phase];
 }
 const source=notebook?.sources.find(source=>source.id===task?.sourceId);
 if(source)details.push(`Current source: ${clean(source.title,180)} (${source.kind}; ${isReadyLearningSource(source,notebook!.sources)?'ready':'needs preparation'}).`);
 const progress=context.progress?.notebookId===notebook?.id?context.progress:undefined;
 if(progress){
  if(count(progress.xp))details.push(`Saved total game XP: ${progress.xp}.`);
  details.push(`Saved learning history: ${progress.attempts.length} recall attempts; ${progress.completedCardIds.length} recall challenges completed; ${Object.values(progress.structured??{}).filter(state=>state.completed).length} game activities completed; ${Object.values(progress.studies??{}).filter(state=>state.completed).length} source-study sections completed.`);
 }
 const score=context.feedback?.committed===true?context.feedback.score:undefined;
 if(score&&count(score.value)&&(score.max===undefined||count(score.max)&&score.max>=score.value)&&(score.xp===undefined||count(score.xp)))details.push(`Last saved score: ${score.value}${score.max===undefined?'':` / ${score.max}`}.${score.xp===undefined?'':` This result added ${score.xp} XP.`}`);
 const log=[...logLines(currentDesign(notebook)?.events),...learningLogLines(notebook,progress)].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id)).slice(-20);
 return{title,summary:summary||'You are in your library. No notebook is currently open.',details,nextAction,failure:lastFailure(context),log};
}
export function answerAsterContext(question:unknown,context:AsterAwarenessContext):AsterContextAnswer|undefined {
 const intent=asterContextIntent(question);if(!intent)return undefined;
 const state=buildAsterAwareness(context);
 const next=`Next available action: ${state.nextAction}`;
 const lines=intent==='failure'?[state.failure,next]:intent==='next'?[next]:intent==='log'?[state.summary,state.log.length?`Showing the latest ${state.log.length} saved activity records. Older events may be outside the retained history.`:'No detailed activity records are stored for this game yet.',state.failure]:intent==='sources'?[...state.details.filter(line=>line.startsWith('Current source:')||line.includes('source')), ...(context.notebook?.sources.slice(0,12).map(source=>`${clean(source.title,180)} · ${source.kind} · ${isReadyLearningSource(source,context.notebook!.sources)?'ready':'needs preparation'}`)??[]),...((context.notebook?.sources.length??0)>12?['Open the material list to see the remaining sources.']:[])]:intent==='progress'?state.details.filter(line=>/Saved |saved score|planned mission/.test(line)):intent==='game'?state.details.filter(line=>line.startsWith('Notebook:')||line.includes('source')):intent==='task'?[state.summary,...state.details.filter(line=>/Current task:|Lesson phase:|Position:|Current source:|This attempt/.test(line)),next]:[state.summary,...state.details,next];
 return{intent,title:({status:'What is happening',failure:'Last recorded issue',next:'Your next step',progress:'Your saved progress',task:'Your current task',game:'This learning game',sources:'Your learning material',log:'Local activity log'})[intent],lines:lines.length?lines:[context.notebook?'No saved score or learning progress has been supplied for this screen yet.':'Open a notebook to see its saved progress.'],...(intent==='log'?{log:state.log}:{})};
}
