import type {Notebook,Progress} from '../types';
import {gameDesignProgress,type GameCreationEvent} from './gameDesign';
import {gameCreationRecovery} from './gameCreationRecovery';
import {directorInputRevision} from './gameDirectorSources';
import {isReadyLearningSource} from './scaffoldRuntime';
import {journeyXp,practiceXp} from './progression';
import type {AsterGuideContext} from './asterGuidePolicy';

/** Live UI state supplied by the host. Saved scores come separately from Progress/feedback. */
export interface AsterLearningState {
 title:string;phase:'lesson'|'answering'|'saving'|'feedback'|'complete'|'study';
 position?:number;total?:number;sourceId?:string;supported?:boolean;saveFailed?:boolean;nextAction?:string;
 lessonStage?:'mission'|'context'|'walkthrough'|'practice'|'ready';lessonStep?:number;lessonSteps?:number;
 goal?:string;controls?:string[];readingKind?:'idea'|'passage';
}
/** Ephemeral host state, not inferred from the last provider message or stored as source evidence. */
export interface AsterCreationState {
 status:'setup'|'importing'|'running'|'pausing'|'canceling'|'paused'|'canceled'|'failed'|'saving'|'ready';
 stage?:string;message?:string;error?:string;nextAction?:string;
}
export interface AsterAwarenessContext extends AsterGuideContext {
 progress?:Progress;creationRunning?:boolean;learningState?:AsterLearningState;creationState?:AsterCreationState;
 creationConnection?:{provider:string;model:string;endpointFingerprint:string|null};
}
export type AsterContextIntent='status'|'failure'|'next'|'progress'|'task'|'game'|'sources'|'log'|'greeting'|'capabilities'|'creation-controls'|'configuration'|'timing';
export interface AsterLogLine {id:string;at:string;label:string;message:string}
export interface AsterContextAnswer {intent:AsterContextIntent;title:string;lines:string[];log?:AsterLogLine[]}
export interface AsterAwareness {title:string;summary:string;details:string[];nextAction:string;failure:string;log:AsterLogLine[]}
export interface AsterRuntimeFacts {screen:AsterGuideContext['mode'];title:string;summary:string;details:string[];nextAction:string;failure:string;recentActivity:AsterLogLine[];controls?:string[];savedProgress?:{journeyXp:number;practiceXp:number;recallAttempts:number;completedRecall:number;completedActivities:number}}
const clean=(value:unknown,max=600)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
// Diagnostics may originate in a provider/network error. Keep useful status, not
// credentials, private paths or URLs, in either local replies or an AI snapshot.
const diagnostic=(value:unknown,max=600)=>clean(typeof value==='string'?value.replace(/https?:\/\/\S+/gi,'[address omitted]').replace(/\b(?:Bearer\s+|sk-)[A-Za-z0-9_\-.]+/gi,'[credential omitted]').replace(/\b(?:(?:[A-Z][A-Z0-9]*[_-])?(?:api[_ -]?key|password|access[_ -]?token|refresh[_ -]?token)|authorization)\s*[:=]\s*["']?[^\s,"']+/gi,'[credential omitted]').replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s]+/g,'[local path omitted]'):value,max);
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const phaseLabel={plan:'Planning',write:'Writing',check:'Checking',finish:'Finishing'} as const;
const eventLabel={completed:'saved',retry:'retry recorded',failed:'failed', 'source-study':'source study retained',resumed:'resumed',paused:'paused',canceled:'canceled'} as const;
export const normalizeAsterQuestion=(question:string)=>question.toLowerCase().replace(/[’]/g,"'").replace(/[?!.]/g,'').replace(/\s+/g,' ').trim().replace(/^(?:aster|astra)[,:]?\s+/,'').replace(/^(?:please\s+)?(?:can you\s+|could you\s+)?(?:please\s+)?/,'');
/** Deliberately narrow app intents; concept questions continue to cited source retrieval. */
export function asterContextIntent(question:unknown):AsterContextIntent|undefined {
 if(typeof question!=='string'||!question.trim()||question.length>500)return undefined;
 const q=normalizeAsterQuestion(question);
 if(/^(?:hi|hello|hey|good (?:morning|afternoon|evening)),?(?: aster)?$/.test(q))return'greeting';
 if(/^(?:what can you do|how can you help(?: me)?|what can i ask(?: you)?|who are you|help(?: me)?|help me get started)$/.test(q))return'capabilities';
 if(/^(?:how (?:do|can) i|can i) (?:pause|cancel|stop|resume) (?:creation|game creation|(?:this|my|the) (?:game|creation|run))$/.test(q))return'creation-controls';
 if(/^(?:how (?:do|can) i|can i) (?:change|switch|choose) (?:my |the |a different )?(?:ai|ai provider|provider|model|ai model)(?: (?:provider|model))?$/.test(q))return'configuration';
 if(/^(?:how long (?:will|does) (?:this|it|creation|game creation) take|when will (?:this|it|my game|the game|creation) be (?:ready|done|finished)|how much (?:time is|longer is) left)$/.test(q))return'timing';
 if(/^(?:why (?:am i |are we |is it |is this )?(?:stuck|waiting)|(?:i am|i'm|we are|we're) stuck|why (?:is|has) (?:this|it|creation|my game) (?:taking so long|paused|stopped|not working)|what(?:'s| is) wrong(?: here)?)$/.test(q))return'failure';
 if(/^(?:what (?:was i|were we) doing|where (?:did i|did we) (?:leave off|stop)|where was i|what screen am i on|remind me (?:where i am|what i was doing)|what (?:am i|are we) working on)(?: last| before| now)?$/.test(q))return'task';
 if(/^(?:what(?:'s| is) (?:my|the current) (?:score|xp|points)|how (?:much|many) (?:xp|points) (?:do i have|have i (?:earned|got))|how am i doing|am i making progress|why (?:aren't|are not|isn't|is not) my (?:points|xp|score) (?:going up|increasing|changing))$/.test(q))return'progress';
 if(/^(?:what should i do(?: now)?|what do i do(?: now)?|what am i supposed to do|i (?:don't|do not) know what to do|what can i do here|how do i (?:start|continue|resume)|how can i (?:start|continue|resume)|what (?:can|should) i (?:click|press)|which (?:button|control) (?:should|do) i (?:use|click|press))$/.test(q))return'next';
 if(/^(?:is (?:it|creation|my game|the game) (?:still )?(?:running|paused|canceled|finished|ready)|did (?:creation|my game|the game) finish|what (?:are|were) (?:my|our|the current) sources)$/.test(q))return q.includes('sources')?'sources':'status';
 if(/\b(logs?|history|diagnostics)\b/.test(q)&&/\b(show|see|read|tell|explain|what|view|creation|activity|recent)\b/.test(q)||/^(what happened|what has happened|what did you do)( so far| here| during creation)?$/.test(q))return'log';
 if(/^(?:explain |tell me )?(what failed|what went wrong|what is the (?:last |current )?(?:error|failure)|why did (?:it|this|the game|creation|the save) (?:fail|stop)|why is (?:it|this|the game|creation) stuck)(?: here| now| during creation)?$/.test(q)||/\b(why|what|which|explain|tell)\b/.test(q)&&/\b(failed|failure|error|went wrong|didn't finish|did not finish|stuck|stopped)\b/.test(q)&&/\b(?:my|our|this|current|latest|last) (?:game|creation|save|request|step|mission|activity)\b/.test(q))return'failure';
 if(/^(what|which)( should i do| do i do| is| comes|'s)? next(?: now| here| in (?:this|my) (?:game|lesson))?$/.test(q)||/^(?:what(?:'s| is)|show|tell me) (?:my |the )?next (?:step|action)$/.test(q))return'next';
 if(/\b(my|our|saved|current|game|learning|creation) (score|points|xp|progress)\b/.test(q)||/\b(how much|how many)\b.*\b(completed|finished|done|left|remaining)\b/.test(q)||/^(show|tell me|what is|what's|how is)( the)? progress$/.test(q))return'progress';
 if(/\b(which|what)\b.*\b(mission|challenge|activity|task|lesson|chapter)\b.*\b(am i|are we|current|on now|doing|working)\b/.test(q)||/^(what am i doing|what are we learning|where am i|where are we)$/.test(q))return'task';
 if(/^(?:(?:which|what) (?:sources|materials|files)(?: (?:are|did|do|can) (?:we|i) (?:using|use|add|upload|have))?|how many (?:sources|materials|files)(?: (?:are there|do i have|did i add))?|(?:show|tell me) (?:my |the |our )?(?:sources|materials|files)|(?:which|what) source (?:am i (?:using|reading)|is (?:current|open|this)))(?: in (?:this|my) (?:game|notebook))?$/.test(q))return'sources';
 if(/\b(which|what) (game|notebook)\b.*\b(this|open|playing|creating|called|name)\b/.test(q))return'game';
 if(/^(?:explain |tell me )?(what('s| is) happening|what is going on|what's going on|what are you doing|what are we doing|what is the current (phase|state|status)|what's the current (phase|state|status)|how is it going)( right now| now| here| with (my|the) game| with creation)?$/.test(q)||/\b(creation|game creation|current activity) (status|phase|state)\b/.test(q))return'status';
 return undefined;
}
/** A short screen-relative question needs a topic, not invented source facts.
 * Explicit questions and ordinary follow-ups keep their original retrieval route. */
export function asterCurrentTopic(question:unknown,context:AsterAwarenessContext):string|undefined {
 if(typeof question!=='string'||question.length>500||!['play','study','world'].includes(context.mode)||!context.notebook)return undefined;
 const q=normalizeAsterQuestion(question);
 if(!/^(?:(?:explain|summarize|describe) (?:this|the current)(?: (?:concept|idea|lesson|mission|material|source|passage|part|section|topic))?(?: to me| simply| in simple (?:words|terms))?|help me understand (?:this|the current (?:lesson|concept|topic))|what does this mean|what is this (?:lesson|concept|topic) (?:about|teaching)|give (?:me )?an example of this)$/.test(q))return undefined;
 const task=context.learningState,activity=context.notebook.activities?.find(item=>item.id===context.activityId);
 const source=context.notebook.sources.find(item=>item.id===task?.sourceId);
 return clean(task?.goal,300)||clean(task?.title,180)||clean(activity?.title,180)||(context.mode==='study'?clean(source?.title,180):'')||undefined;
}
function logLines(events:GameCreationEvent[]|undefined):AsterLogLine[]{
 return (events??[]).filter(event=>event.phase in phaseLabel&&event.kind in eventLabel&&Number.isFinite(Date.parse(event.at))).map(event=>({id:event.id,at:event.at,label:`${phaseLabel[event.phase]} · ${eventLabel[event.kind]}${event.category?` · ${event.category}`:''}`,message:diagnostic(event.message)}));
}
function learningLogLines(notebook:Notebook|undefined,progress:Progress|undefined):AsterLogLine[]{
 if(!notebook||progress?.notebookId!==notebook.id)return[];
 return[
  ...progress.attempts.slice(-20).map(attempt=>({id:`recall:${attempt.id}`,at:attempt.at,label:'Recall attempt saved',message:`${attempt.correct?'Correct':'Needs another attempt'}.${count(attempt.xp)?` ${attempt.xp} XP recorded.`:''}`})),
  ...Object.entries(progress.practice?.awards??{}).filter(([,award])=>award.xp>0).map(([key,award])=>{const practice=award.kind==='card'||award.kind==='activity',subject=award.kind==='activity'?notebook.activities?.find(activity=>activity.id===award.objectiveId)?.title:award.kind==='card'?notebook.cards.find(card=>card.id===award.objectiveId)?.prompt:notebook.sources.find(source=>source.id===progress.studies?.[award.objectiveId]?.sourceId)?.title;return{id:`practice:${key}`,at:award.at,label:practice?'Practice XP saved':'Discovery XP saved',message:`${clean(subject,180)||(award.kind==='activity'?'Game activity':award.kind==='card'?'Recall challenge':'Source-study section')}: ${award.xp} ${practice?'practice':'discovery'} XP recorded. This game reward does not establish independent mastery.`};}),
  ...Object.entries(progress.structured??{}).map(([id,state])=>({id:`activity:${id}:${state.updatedAt}`,at:state.updatedAt,label:state.attempts?'Activity progress saved':'Activity draft saved',message:`${clean(notebook.activities?.find(activity=>activity.id===id)?.title,180)||'Game activity'}: ${state.completed?'completed':'in progress'}.${state.attempts?` ${state.attempts} saved attempts.`:''}`})),
  ...Object.values(progress.studies??{}).filter(state=>state.completed).map(state=>({id:`study:${state.unitId}:${state.updatedAt}`,at:state.updatedAt,label:'Source study saved',message:`A source-study section is complete${notebook.sources.find(source=>source.id===state.sourceId)?` in ${clean(notebook.sources.find(source=>source.id===state.sourceId)!.title,180)}`:''}.`}))
 ].filter(line=>Number.isFinite(Date.parse(line.at)));
}
function currentDesign(notebook:Notebook|undefined){
 const design=notebook?.gameDesign;
 return design&&design.inputRevision===directorInputRevision(notebook!,{provider:design.provider.id,model:design.provider.model,endpointFingerprint:design.provider.endpointFingerprint})?design:undefined;
}
function lastFailure(context:AsterAwarenessContext,design=currentDesign(context.notebook)):string {
 if(context.mode!=='creation'&&context.mode!=='library'&&context.learningState?.saveFailed)return'Your latest progress save did not finish. That pending result has not been confirmed as saved; retry saving before continuing.';
 const live=context.mode==='creation'?(context.creationState??(design?.control&&context.creationRunning!==true?{status:design.control}:undefined)):undefined;
 if(live?.error)return`Current creation issue: ${diagnostic(live.error)}`;
 if(live?.status==='pausing')return'A pause has been requested. Creation is stopping at its current checkpoint; the pause is not confirmed yet.';
 if(live?.status==='canceling')return'Cancellation has been requested. The active request is being stopped; cancellation is not confirmed yet.';
 if(live?.status==='paused')return`Creation is paused.${live.message?` ${diagnostic(live.message)}`:' No request is running on this screen.'}`;
 if(live?.status==='canceled')return`Creation was canceled.${live.message?` ${diagnostic(live.message)}`:' Previously saved work is retained.'}`;
 if(live?.status==='failed')return live.message?`Creation needs attention: ${diagnostic(live.message)}`:'Creation stopped, but this screen has not supplied a reason.';
 const recovery=gameCreationRecovery(design);
 if(context.mode==='creation'&&context.creationRunning!==true&&recovery.unitCount)return`Earlier AI replies failed validation for ${recovery.unitCount} source sections. Your material and usage records remain saved; this does not establish that the material cannot support a game.`;
 const failed=[...(design?.events??[])].reverse().find(event=>event.kind==='failed'||event.kind==='retry');
 if(failed)return`Last recorded creation issue: ${phaseLabel[failed.phase]}${failed.category?` (${failed.category})`:''}. ${diagnostic(failed.message)}${context.mode==='creation'&&(live?.status==='running'||context.creationRunning===true)?' Creation is running now; this older issue does not establish a current failure.':''}`;
 const receipt=[...(design?.receipts??[])].reverse().find(receipt=>receipt.status==='failed'||receipt.status==='canceled'||receipt.status==='started'&&context.creationRunning===false);
 if(receipt){const stage=/writ/i.test(receipt.stage)?'writing':/plan/i.test(receipt.stage)?'planning':/check|valid/i.test(receipt.stage)?'checking':'AI';return`The last ${stage} request ${receipt.status==='canceled'?'was canceled':'did not finish'}. This older record does not include a failure reason.`;}
 return'No failure is recorded in the current local activity history. An older request may have ended without saving a reason.';
}
export function buildAsterAwareness(context:AsterAwarenessContext):AsterAwareness {
 const {notebook}=context,task=context.mode==='creation'||context.mode==='library'?undefined:context.learningState,details:string[]=[],design=currentDesign(notebook);
 const title=clean(task?.title,180)||clean(notebook?.activities?.find(activity=>activity.id===context.activityId)?.title,180)||clean(notebook?.title,180)||'Your library';
 let summary='',nextAction='Choose a notebook to create a game or continue learning.';
 if(notebook){
  details.push(`Notebook: ${clean(notebook.title,180)}.`);
  const readable=notebook.sources.filter(source=>isReadyLearningSource(source,notebook.sources)).length;
  details.push(`${notebook.sources.length} source${notebook.sources.length===1?'':'s'} added; ${readable} ready for learning. ${notebook.activities?.length??0} game activities and ${notebook.cards.length} recall challenges are stored.`);
  if(context.mode==='creation'){
   if(design){
    const p=gameDesignProgress(design),recovery=gameCreationRecovery(design),sourceReviewOnly=design.status==='ready'&&!p.missionCount&&!recovery.unitCount,ready=design.status==='ready'&&notebook.creation?.status!=='draft'&&!recovery.unitCount;
    const selection=context.creationConnection,differentSelection=selection&&(selection.provider!==design.provider.id||selection.model!==design.provider.model||selection.endpointFingerprint!==design.provider.endpointFingerprint),changedSelection=context.creationRunning!==true&&differentSelection;
    const percent=ready||sourceReviewOnly?p.percent:Math.min(99,p.percent);
    details.push(recovery.unitCount?`Saved creation work needs repair: ${recovery.unitCount} source sections have known AI validation failures. Earlier source decisions and all usage records are retained.`:`Saved ${sourceReviewOnly?'source-review':'creation'} progress${differentSelection?' from the previous AI selection':''}: ${p.completedSteps} of ${p.totalSteps} logical steps (${percent}%). ${p.coveredUnits} of ${p.totalUnits} source sections checked; ${p.completedBatches} of ${p.totalBatches} groups checked.`);
    details.push(`${p.completedMissions} of ${p.plannedMissions} planned mission models written; ${p.missionCount} retained game missions and ${p.studyOnlyCount} source-study sections after checking.`);
    summary=context.creationRunning===true?`Game creation is running. ${clean(context.creationStage)||`${phaseLabel[p.currentPhase??'finish']} the game${p.currentPhase!=='finish'?` in group ${p.currentBatch} of ${p.totalBatches}`:''}.`}`:changedSelection?'The saved creation records belong to a different AI selection. Your newly selected model has not started; saved checkpoints remain available.':sourceReviewOnly?'Source review is complete and saved, but it did not retain a playable game mission.':ready?'Game creation is complete and saved.':`Game creation is unfinished${context.creationRunning===false?' and is not running in this screen':''}. The next saved phase is ${phaseLabel[p.currentPhase??'finish'].toLowerCase()}${p.currentPhase!=='finish'?` in group ${p.currentBatch} of ${p.totalBatches}`:''}.`;
    nextAction=context.creationRunning===true?'Let the current step finish. Saved checkpoints show completed work; they are not an estimate of time remaining.':changedSelection?'Continue creation with the selected AI model. Saved checkpoints are kept.':sourceReviewOnly?'Add material with concrete supported examples, rules or procedures, then create from the updated sources. You can also study the retained source sections.':ready?'Open the game and choose a mission.':p.canResume?'Choose Continue creating to resume from the saved checkpoint. Finished work is kept.':'Prepare readable source material, then create the game.';
    if(recovery.unitCount&&context.creationRunning!==true){summary='The earlier creation contains recoverable AI validation failures. Your original sources are saved.';nextAction='Choose an AI provider and model, then Retry failed sections. This starts only when you choose it.';}
   }else{
    summary=context.creationRunning===true?`Game preparation is running. ${clean(context.creationStage)||'Preparing your materials.'}`:'You are setting up a learning game. Creation has not saved a game plan yet.';
    nextAction=context.creationRunning===true?'Let the current preparation step finish.':!notebook.sources.length?'Add a file, a link, or notes, then choose your audience and learning goal.':readable?'Choose Create my game when the material and learning goal are ready.':'Open material that needs preparation and add or review its readable text.';
   }
   const live=context.creationState??(design?.control&&context.creationRunning!==true?{status:design.control}:undefined);
   if(live){
    const running=live.status==='running',active=running||live.status==='importing'||live.status==='saving';
    const statuses={setup:'You are setting up a learning game.',importing:'Your source material is being imported.',running:'Game creation is running.',pausing:'Creation is stopping for your requested pause.',canceling:'Creation is stopping for your cancellation request.',paused:'Creation is paused. No creation request is running on this screen.',canceled:'Creation was canceled. Previously saved work is retained.',failed:'Creation needs attention before it can continue.',saving:'The latest creation work is being saved. It is not confirmed as saved yet.',ready:''};
    if(live.status!=='ready')summary=statuses[live.status]+(active&&clean(live.stage)?` ${diagnostic(live.stage)}`:'');
    if(live.message)details.push(`Current creation update: ${diagnostic(live.message)}`);
    if(live.error)details.push(`Current creation issue: ${diagnostic(live.error)}`);
    const waiting=live.status==='pausing'||live.status==='canceling'||live.status==='saving';
    nextAction=waiting?({pausing:'Wait until the pause is confirmed before continuing creation.',canceling:'Wait until cancellation is confirmed before starting another request.',saving:'Wait for confirmation that creation progress was saved.'})[live.status as 'pausing'|'canceling'|'saving']:diagnostic(live.nextAction)||({setup:nextAction,importing:'Let the source import finish, or use the visible cancel control.',running:'Let the current step finish. Saved checkpoints are completed work, not a time estimate.',paused:'Use the visible resume control to continue saved work when ready.',canceled:'Use the visible creation control if you want to start again from retained work.',failed:'Read the current issue and resolve it before continuing.',ready:nextAction})[live.status as Exclude<AsterCreationState['status'],'pausing'|'canceling'|'saving'>];
   }
  }else summary=context.mode==='world'?'You are choosing what to learn in this game.':context.mode==='study'?'You are studying source material.':'You are practicing a learning activity.';
 }
 if(task){
  const phaseText={lesson:'You are preparing the lesson before its challenge.',answering:'You are working on the current challenge.',saving:'Your current work is being saved. Wait for confirmation before continuing.',feedback:'The current task is showing feedback from its saved attempt.',complete:'This learning session is complete.',study:'You are studying the current source material.'};
  summary=task.saveFailed?'Your latest progress save did not finish. The pending result is waiting for a retry.':phaseText[task.phase];
  details.push(`Current task: ${title}.`);
  if(clean(task.goal,300))details.push(`Learning goal: ${clean(task.goal,300)}`);
  const controls=task.controls?.map(control=>clean(control,100)).filter(Boolean).slice(0,8);if(controls?.length)details.push(`Current controls: ${controls.join('; ')}.`);
  if(task.lessonStage&&task.phase==='lesson')details.push(`Lesson phase: ${({mission:'understand the mission',context:'read the source context',walkthrough:'follow the worked walkthrough',practice:'prepare and compare your explanation',ready:'ready for the challenge'})[task.lessonStage]}.${task.lessonStage==='walkthrough'&&count(task.lessonStep)&&count(task.lessonSteps)&&task.lessonSteps>0?` Step ${Math.min(task.lessonSteps,task.lessonStep)} of ${task.lessonSteps}.`:''}`);
  if(task.lessonStage==='context'&&task.readingKind&&count(task.lessonStep)&&count(task.lessonSteps)&&task.lessonStep>0&&task.lessonSteps>=task.lessonStep)details.push(`Current reading: ${task.readingKind==='idea'?'Idea':'Passage'} ${task.lessonStep} of ${task.lessonSteps}.`);
  if(count(task.position)&&count(task.total)&&task.total>0&&task.position<=task.total)details.push(`Position: ${task.position} of ${task.total}.`);
  if(task.supported!==undefined&&task.phase!=='lesson'&&task.phase!=='study')details.push(task.supported?'This attempt uses learning support.':'This attempt has not used source help.');
  nextAction=task.saveFailed?clean(task.nextAction)||'Keep this page open and choose Retry saving progress.':task.phase==='saving'?'Wait for the save confirmation.':clean(task.nextAction)||({lesson:'Finish the lesson checkpoints, then enter the challenge.',answering:'Make your next move, then check your answer when ready.',saving:'Wait for the save confirmation.',feedback:'Read the feedback, then revise your attempt or continue.',complete:'Return to the notebook to choose another mission.',study:'Read the source and complete its study checkpoints.'})[task.phase];
 }
 const source=notebook?.sources.find(source=>source.id===task?.sourceId);
 if(source)details.push(`Current source: ${clean(source.title,180)} (${source.kind}; ${isReadyLearningSource(source,notebook!.sources)?'ready':'needs preparation'}).`);
 const progress=context.progress?.notebookId===notebook?.id?context.progress:undefined;
 if(progress){
  if(count(progress.xp))details.push(`Saved Journey XP: ${journeyXp(progress)} (${practiceXp(progress)} practice XP; ${progress.xp} other game XP). Independent mastery is tracked separately.`);
  details.push(`Saved learning history: ${progress.attempts.length} recall attempts; ${progress.completedCardIds.length} recall challenges completed; ${Object.values(progress.structured??{}).filter(state=>state.completed).length} game activities completed; ${Object.values(progress.studies??{}).filter(state=>state.completed).length} source-study sections completed.`);
 }
 const score=context.feedback?.committed===true?context.feedback.score:undefined;
 if(score&&count(score.value)&&(score.max===undefined||count(score.max)&&score.max>=score.value)&&(score.xp===undefined||count(score.xp)))details.push(`Last saved score: ${score.value}${score.max===undefined?'':` / ${score.max}`}.${score.xp===undefined?'':` This result added ${score.xp} XP.`}`);
 const log=[...logLines(design?.events),...learningLogLines(notebook,progress)].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id)).slice(-20);
 return{title,summary:summary||'You are in your library. No notebook is currently open.',details,nextAction,failure:lastFailure(context,design),log};
}
/** One bounded allowlist shared with AI. It contains screen facts, never source
 * evidence, raw answers, notes, provider configuration or an authority to act. */
export function buildAsterRuntimeFacts(context:AsterAwarenessContext):AsterRuntimeFacts {
 const state=buildAsterAwareness(context),priority=(line:string)=>/^(Current task:|Learning goal:|Current controls:|Current reading:|Lesson phase:|Position:|Saved Journey XP:|Last saved score:|Current creation issue:|Current creation update:)/.test(line)?0:1;
 const progress=context.notebook&&context.progress?.notebookId===context.notebook.id?context.progress:undefined;
 const savedProgress=progress&&count(progress.xp)&&count(journeyXp(progress))&&count(practiceXp(progress))?{journeyXp:journeyXp(progress),practiceXp:practiceXp(progress),recallAttempts:progress.attempts.length,completedRecall:progress.completedCardIds.length,completedActivities:Object.values(progress.structured??{}).filter(state=>state.completed).length}:undefined;
 const controls=['play','study','world'].includes(context.mode)?context.learningState?.controls?.map(control=>diagnostic(control,100)).filter(Boolean).slice(0,8):undefined;
 return{screen:context.mode,title:diagnostic(state.title,180),summary:diagnostic(state.summary,500),details:state.details.map((line,index)=>({line,index})).sort((a,b)=>priority(a.line)-priority(b.line)||a.index-b.index).slice(0,10).map(({line})=>diagnostic(line,300)),nextAction:diagnostic(state.nextAction,500),failure:diagnostic(state.failure,600),recentActivity:state.log.slice(-5).map(line=>({id:clean(line.id,120),at:clean(line.at,60),label:diagnostic(line.label,100),message:diagnostic(line.message,200)})),...(controls?{controls}:{}),...(savedProgress?{savedProgress}:{})};
}
export function answerAsterContext(question:unknown,context:AsterAwarenessContext):AsterContextAnswer|undefined {
 const intent=asterContextIntent(question);if(!intent)return undefined;
 const state=buildAsterAwareness(context);
 const next=`Next available action: ${state.nextAction}`;
 const last=state.log.at(-1);
 const lines=intent==='creation-controls'?context.mode==='creation'?[state.summary,next]:['Game creation is not running on this screen. Open the creator to manage that game’s creation.',next]:intent==='configuration'?context.mode==='creation'?[state.summary,context.creationRunning||['running','pausing','canceling','saving'].includes(context.creationState?.status??'')?'Wait for a pause or cancellation to be confirmed before changing the game’s AI selection.':'Use the game designer’s Change control to choose an AI provider and model. Changing settings alone does not start a request.',next]:['Use Connect Aster to AI, or AI connection if it is already enabled, to choose the connection and model. A new answer is requested only when you ask.']:intent==='timing'?[state.summary,'I do not have a reliable finish-time estimate. Saved progress measures completed work, not time remaining.',...state.details.filter(line=>line.startsWith('Saved creation progress')||line.startsWith('Saved source-review progress')),next]:intent==='greeting'?['Hi, I’m Aster. I can help you find your next step or explore the material in this game.',state.summary,next]:intent==='capabilities'?['Ask me what to do next, what is happening, or how much XP is saved. I use the current screen and saved activity records for those answers.','Ask about your material to find exact source passages. With AI enabled, I can explain supported ideas from those passages.',next]:intent==='failure'?[`${state.summary} ${state.failure}`,next]:intent==='next'?[next,...state.details.filter(line=>line.startsWith('Current controls:'))]:intent==='log'?[state.summary,state.log.length?`Showing the latest ${state.log.length} saved activity records. Older events may be outside the retained history.`:'No detailed activity records are stored for this game yet.',state.failure]:intent==='sources'?[...state.details.filter(line=>line.startsWith('Current source:')||line.includes('source')), ...(context.notebook?.sources.slice(0,12).map(source=>`${clean(source.title,180)} · ${source.kind} · ${isReadyLearningSource(source,context.notebook!.sources)?'ready':'needs preparation'}`)??[]),...((context.notebook?.sources.length??0)>12?['Open the material list to see the remaining sources.']:[])]:intent==='progress'?state.details.filter(line=>/Saved |saved score|planned mission/.test(line)):intent==='game'?state.details.filter(line=>line.startsWith('Notebook:')||line.includes('source')):intent==='task'?[state.summary,...state.details.filter(line=>/Current task:|Learning goal:|Current controls:|Current reading:|Lesson phase:|Position:|Current source:|This attempt/.test(line)),...(!context.learningState&&last?[`Most recent saved activity (${last.at}): ${last.label}. ${last.message}`]:[]),next]:[state.summary,...state.details,next];
 if(intent==='progress'&&(context.learningState?.phase==='saving'||context.learningState?.saveFailed))lines.push(state.summary,next);
 return{intent,title:({status:'What is happening',failure:'Last recorded issue',next:'Your next step',progress:'Your saved progress',task:'Your current task',game:'This learning game',sources:'Your learning material',log:'Local activity log',greeting:'Hello from Aster',capabilities:'How I can help','creation-controls':'Creation controls',configuration:'Choose AI',timing:'Current progress and timing'})[intent],lines:lines.length?lines:[context.notebook?'No saved score or learning progress has been supplied for this screen yet.':'Open a notebook to see its saved progress.'],...(intent==='log'?{log:state.log}:{})};
}
