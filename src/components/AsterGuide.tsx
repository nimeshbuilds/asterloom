import {useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import {BookOpen,ChevronDown,Download,MessageCircle,Send,Settings2,Sparkles,X} from 'lucide-react';
import type {Notebook,EvidenceReference,Progress} from '../types';
import {askAster} from '../lib/asterKnowledge';
import {preparedAsterAnswer} from '../lib/asterPreparedAnswer';
import {askAsterAI,asterRuntimeFingerprint,AsterAIError,type AsterAIResult,type AsterConversationTurn} from '../lib/asterAI';
import {useAsterConnection} from './AsterConnection';
import AsterAIAnswer,{AsterAIUsage,renderAsterText} from './AsterAIAnswer';
import {sourceRevision,textDigest} from '../lib/evidence';
import {listSourceDownloads,downloadSourceMaterial} from '../lib/sourceDownloads';
import {parseAsterDownloadIntent,resolveAsterDownloadChoices,type AsterDownloadIntent,type AsterDownloadChoice} from '../lib/asterDownloadIntent';
import {answerAsterContext,asterCurrentTopic,buildAsterAwareness,type AsterAwarenessContext,type AsterLearningState} from '../lib/asterAwareness';
import {asterMissionHelp,contextualAsterTip,dismissAsterTip,getAsterPreferences,setAsterPreferences,shouldOfferAsterTip,type AsterGuideContext,type AsterMode,type AsterPreferences,type AsterSessionPolicy} from '../lib/asterGuidePolicy';
import {ASTER_BASE_PORTRAIT,resolveAsterEmotion,type AsterEmotionId,type AsterEmotionOptions,type AsterMoment} from '../lib/asterEmotions';
import {asterFeedback,getSoundPreferences} from '../lib/music';
import './aster-guide.css';
export interface AsterGuideProps {
 notebook?:Notebook;mode:AsterMode;activityId?:string;creationStage?:string;
 progress?:Progress;creationRunning?:boolean;learningState?:AsterLearningState;
 creationConnection?:AsterAwarenessContext['creationConnection'];
 creationState?:AsterAwarenessContext['creationState'];
 library?:AsterAwarenessContext['library'];
 /** Changes when the current learning task changes within the same notebook. */
 contextKey?:string;
 feedback?:{outcome:'success'|'retry';eventKey:string;committed?:boolean;score?:{value:number;max?:number;xp?:number}};
 expressions?:Partial<Record<AsterMoment,AsterEmotionId>>;
 onOpenSource?:(sourceId:string,evidence?:string)=>void;
 onAssistance?:()=>void|boolean|Promise<void|boolean>;
 /** Test/embedded hosts can supply the same bundled portrait at their own asset base. */
 portraitUrl?:string;
 /** Visual state only; the host owns provider access and connection truth. */
 aiConnected?:boolean;
}
type SearchResult=Awaited<ReturnType<typeof askAster>>;
interface ChatTurn {
 id:string;question:string;scope:string;materialScope:string;connectionKey:string;forceLocal:boolean;
 runtimeFingerprint?:string;savePending?:boolean;status:'pending'|'answered'|'error'|'stopped';message?:string;ai?:AsterAIResult;local?:SearchResult;
 context?:NonNullable<ReturnType<typeof answerAsterContext>>;prepared?:NonNullable<ReturnType<typeof preparedAsterAnswer>>;
}
// Session memory only: never write questions, answers or provider credentials into a game.
const chatSessions=new Map<string,ChatTurn[]>();
let nextChatTurn=0;
const rememberChat=(key:string,turns:ChatTurn[])=>{chatSessions.delete(key);chatSessions.set(key,turns.slice(-40));while(chatSessions.size>8)chatSessions.delete(chatSessions.keys().next().value!);};
let automaticSession:AsterSessionPolicy={shown:0,lastShownAt:-Infinity};
export default function AsterGuide({notebook,mode,activityId,creationStage,contextKey,feedback,progress,creationRunning,creationConnection,creationState,library,learningState,expressions,onOpenSource,onAssistance,portraitUrl=ASTER_BASE_PORTRAIT,aiConnected:visualConnection=false}:AsterGuideProps){
 const connection=useAsterConnection(),aiConnected=connection?.enabled??visualConnection;
 const sessionKey=notebook?.id??'library';
 const [turns,setTurns]=useState<ChatTurn[]>(()=>chatSessions.get(sessionKey)??[]);
 const [revealedHistory,setRevealedHistory]=useState<string[]>([]);
 const activeSession=useRef(sessionKey),chatEnd=useRef<HTMLDivElement>(null);
 const pendingAI=useRef<{turnId:string;answer:AsterAIResult;scope:string;connectionKey:string}|null>(null);
 const updateTurns=(change:(previous:ChatTurn[])=>ChatTurn[])=>setTurns(previous=>{const next=change(previous).slice(-40);rememberChat(sessionKey,next);return next;});
 const finishTurn=(turnId:string,patch:Partial<ChatTurn>)=>updateTurns(previous=>previous.map(turn=>turn.id===turnId?{...turn,...patch}:turn));
 const stopPending=(message='Answer stopped. You can ask again when you are ready.')=>updateTurns(previous=>previous.map(turn=>turn.status==='pending'?{...turn,status:'stopped',message}:turn));
 const currentConnection=useRef(connection);currentConnection.current=connection;
 const lastSuccessfulTopic=useRef<string|undefined>(undefined);
 const assistance=useRef(onAssistance);assistance.current=onAssistance;
 const previousConnection=useRef(aiConnected),transitionSequence=useRef(0);
 const [connectionTransition,setConnectionTransition]=useState<{id:number;direction:'connect'|'disconnect'}|null>(null);
 const connectionArrival=connectionTransition?.direction==='connect';
 useEffect(()=>{
  const previous=previousConnection.current;previousConnection.current=aiConnected;if(previous===aiConnected)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(motion.matches||document.visibilityState==='hidden'){setConnectionTransition(null);return;}
  const sequence=++transitionSequence.current;setConnectionTransition({id:sequence,direction:aiConnected?'connect':'disconnect'});
  const reduced=()=>{if(motion.matches)setConnectionTransition(null);};motion.addEventListener('change',reduced);
  const timer=setTimeout(()=>setConnectionTransition(current=>current?.id===sequence?null:current),2800);
  return()=>{clearTimeout(timer);motion.removeEventListener('change',reduced);};
 },[aiConnected]);
 const id=useId().replace(/:/g,''),launcher=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),downloadSummary=useRef<HTMLHeadingElement>(null),request=useRef(0),searchAbort=useRef<AbortController|null>(null),hintInFlight=useRef<number|null>(null);
 const [preferences,setPreferences]=useState<AsterPreferences>(getAsterPreferences),[open,setOpen]=useState(false),[bubble,setBubble]=useState(false),[question,setQuestion]=useState(''),[searching,setSearching]=useState(false),[error,setError]=useState(''),[showHint,setShowHint]=useState(false),[portraitFailed,setPortraitFailed]=useState(false),[failedExpression,setFailedExpression]=useState('');
 const [downloads,setDownloads]=useState<{scope:string;choices:AsterDownloadChoice[];message:string}|null>(null),[downloadPending,setDownloadPending]=useState(false);
 const busy=searching||downloadPending;
 const context:AsterGuideContext={notebook,mode,activityId,creationStage,creationRunning,feedback},tip=contextualAsterTip(context),young=notebook?.ageGroup==='3-5'||notebook?.ageGroup==='6-8';
 const awarenessContext=useMemo<AsterAwarenessContext>(()=>({notebook,mode,activityId,creationStage,creationRunning,feedback,progress,creationConnection,creationState,library,learningState}),[notebook,mode,activityId,creationStage,creationRunning,feedback,progress,creationConnection,creationState,library,learningState]);
 const awareness=useMemo(()=>buildAsterAwareness(awarenessContext),[awarenessContext]);
 const liveAwareness=useRef(awarenessContext);liveAwareness.current=awarenessContext;
 const runtimeFingerprint=useMemo(()=>asterRuntimeFingerprint(awarenessContext),[awarenessContext]);
 const automaticTipVisible=bubble&&!open&&preferences.mode==='helpful'&&!(mode==='creation'&&creationRunning===true);
 // An automatic portrait belongs to the text being offered. Hidden panel state or
 // feedback from another screen must not turn a source-check tip into a celebration.
 const studyingConcept=mode==='study'&&learningState?.phase==='lesson'&&(learningState.lessonStage==='context'||learningState.lessonStage==='walkthrough');
 const manualMoment:AsterMoment=searching?'concept':showHint?'hint':feedback?.committed&&mode==='play'?feedback.outcome==='retry'?'retry':'success':mode==='study'?studyingConcept?'concept':'reflection':mode==='play'?'concept':'welcome';
 const moment:AsterMoment=automaticTipVisible?tip.moment:manualMoment;
 const activity=notebook?.activities?.find(item=>item.id===activityId);
 const emotionIntent:AsterEmotionOptions['intent']=automaticTipVisible?mode==='creation'&&moment==='concept'?'evidence':mode==='world'?'orient':mode==='study'?'explain':undefined:searching||showHint?'evidence':learningState?.phase==='lesson'&&learningState.lessonStage==='context'?'reading':learningState?.phase==='lesson'&&learningState.lessonStage==='practice'?'explain':undefined;
 const emotionStep=!automaticTipVisible&&learningState?.phase==='lesson'&&learningState.lessonStage==='walkthrough'?learningState.lessonStep:undefined;
 const emotion=resolveAsterEmotion({moment,preferredId:searching&&!automaticTipVisible?'thinking':expressions?.[moment],activityKind:activity?.kind,quiet:preferences.mode==='quiet',intent:emotionIntent,step:emotionStep,contextSeed:`${notebook?.id??'library'}:${activityId??mode}:${contextKey??''}:${automaticTipVisible?tip.id:moment}`});
 const imageUrl=portraitUrl!==ASTER_BASE_PORTRAIT?portraitUrl:failedExpression===emotion.assetPath?ASTER_BASE_PORTRAIT:emotion.assetPath;
 const help=useMemo(()=>asterMissionHelp(notebook,activityId),[notebook,activityId]);
 // Creation checkpoints change notebook revision without changing the material. Preserve
 // questions across those saves, while task/evidence changes still invalidate source help.
 const materialScope=useMemo(()=>textDigest(JSON.stringify(notebook?.sources.map(source=>[source.id,source.title,source.status,sourceRevision(source),source.originalFile?.sha256,source.originalFile?.name,source.originalFile?.mime,source.originalFile?.size,source.asset,source.dataUrl?textDigest(source.dataUrl):undefined,source.transcript]))),[notebook?.sources]);
 const taskScope=useMemo(()=>textDigest(JSON.stringify([activity,help])),[activity,help]);
 const scope=`${notebook?.id??'library'}:${materialScope}:${taskScope}:${activityId??''}:${mode}:${contextKey??''}`;
 const connectionKey=textDigest(JSON.stringify(connection?.config??{}));
 const currentScope=useRef(scope);currentScope.current=scope;
 const availableDownloads=useMemo(()=>notebook?.sources.flatMap(source=>listSourceDownloads(source).map(option=>({sourceId:source.id,sourceTitle:source.title,sourceKind:source.kind,option})))??[],[notebook?.sources]);
 const visibleDownloads=downloads?.scope===scope?downloads:null;
 // Register the persisted-effects gesture listener without creating an audio context.
 // An automatic tip may make a sound only after the learner has unlocked audio.
 useEffect(()=>{getSoundPreferences();},[]);
 useEffect(()=>{
  if(activeSession.current!==sessionKey){activeSession.current=sessionKey;setTurns(chatSessions.get(sessionKey)??[]);}
  pendingAI.current=null;lastSuccessfulTopic.current=undefined;request.current++;searchAbort.current?.abort();setSearching(false);setError('');setShowHint(false);setQuestion('');setDownloads(null);setDownloadPending(false);setRevealedHistory([]);
  stopPending('The material or activity changed, so that answer was stopped. Ask again using the current screen.');
  return()=>{request.current++;searchAbort.current?.abort();};
 },[scope]);
 useEffect(()=>{pendingAI.current=null;lastSuccessfulTopic.current=undefined;request.current++;searchAbort.current?.abort();setSearching(false);setError('');stopPending('The AI connection changed, so that answer was stopped. You can send your question again.');return()=>{request.current++;searchAbort.current?.abort();};},[connection?.enabled,connectionKey]);
 useEffect(()=>{if(open)chatEnd.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[turns,open]);
 useEffect(()=>{const changed=()=>setPreferences(getAsterPreferences());window.addEventListener('asterloom:guide-preferences',changed);return()=>window.removeEventListener('asterloom:guide-preferences',changed);},[]);
 useEffect(()=>{
  if(preferences.mode!=='helpful'||open||!shouldOfferAsterTip(context,preferences,automaticSession,Date.now())){setBubble(false);return;}
  const timeout=setTimeout(()=>{if(document.visibilityState==='hidden'||!shouldOfferAsterTip(context,getAsterPreferences(),automaticSession,Date.now()))return;automaticSession={shown:automaticSession.shown+1,lastShownAt:Date.now()};dismissAsterTip(tip);setBubble(true);asterFeedback('notice',notebook?.ageGroup);},1800);
  return()=>clearTimeout(timeout);
 },[tip.id,preferences.mode,open,creationRunning]);
 useEffect(()=>{if(!bubble)return;const timeout=setTimeout(()=>setBubble(false),14000);return()=>clearTimeout(timeout);},[bubble]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 useEffect(()=>{if(visibleDownloads)downloadSummary.current?.scrollIntoView({block:'nearest'});},[visibleDownloads]);
 const close=()=>{request.current++;searchAbort.current?.abort();stopPending();setSearching(false);setDownloads(null);setDownloadPending(false);setOpen(false);launcher.current?.focus();};
 const reveal=()=>{if(open)return;asterFeedback('open',notebook?.ageGroup);setBubble(false);setOpen(true);};
 const revealHint=async()=>{const version=request.current,activeScope=scope;if(showHint||hintInFlight.current===version)return;hintInFlight.current=version;asterFeedback('ask',notebook?.ageGroup);try{if(await assistance.current?.()===false)throw Error('Help save failed');if(version!==request.current||activeScope!==currentScope.current)return;setShowHint(true);setError('');asterFeedback('answer',notebook?.ageGroup);}catch{if(version===request.current&&activeScope===currentScope.current){setError('This mission could not open source help. Try again after returning to the mission.');asterFeedback('answer',notebook?.ageGroup);}}finally{if(hintInFlight.current===version)hintInFlight.current=null;}};
 const requestDownloads=async(intent?:AsterDownloadIntent,selected?:AsterDownloadChoice)=>{
  if(downloadPending)return;
  const version=++request.current,activeScope=scope,isCurrent=()=>version===request.current&&activeScope===currentScope.current;
  searchAbort.current?.abort();setSearching(false);setDownloads(null);setError('');
  asterFeedback('ask',notebook?.ageGroup);
  if(!notebook){setError('Open a game to download its bundled source material.');return;}
  setDownloadPending(true);let assistanceSaved=false;
  try{
   // The assistance receipt must be durable before source choices or bytes are
   // exposed. Recheck the scope after every await, including a held save dialog.
   if(await assistance.current?.()===false)throw Error('assistance');
   if(!isCurrent())return;
   assistanceSaved=true;
   const matches=selected?availableDownloads.filter(choice=>choice.sourceId===selected.sourceId&&choice.option.id===selected.option.id):intent?resolveAsterDownloadChoices(intent,availableDownloads):availableDownloads;
   const direct=(!!intent||!!selected)&&matches.length===1;
   const choices=matches.length?matches:availableDownloads;
   const message=!availableDownloads.length?'This game has no bundled source files or readable text to download.':!matches.length?'I could not find that exact source or format. Choose an available file below.':direct?'Preparing your source download…':'Choose the source and file version you want to save.';
   setDownloads({scope:activeScope,choices,message});
   if(!direct){asterFeedback('answer',notebook.ageGroup);return;}
   const choice=matches[0],source=notebook.sources.find(source=>source.id===choice.sourceId);
   if(!source||!isCurrent())return;
   const outcome=await downloadSourceMaterial(source,choice.option.id);
   if(!isCurrent())return;
   setDownloads({scope:activeScope,choices,message:outcome.status==='canceled'?'Download canceled. Nothing was saved.':outcome.status==='saved'?`Saved ${outcome.filename}.`:`Download started: ${outcome.filename}.`});
   asterFeedback('answer',notebook.ageGroup);
  }catch{if(isCurrent()){setError(assistanceSaved?'I could not download this source. Try again, or choose another available version.':'Your progress could not be saved, so source downloads stayed closed. Try again after returning to the mission.');asterFeedback('answer',notebook?.ageGroup);}}
  finally{if(isCurrent())setDownloadPending(false);}
 };
 const connectAI=()=>{close();connection?.connect();};
 const search=async(asked=question,forceLocal=false)=>{
  asked=asked.trim();if(busy||!asked)return;
  const useAI=!!connection?.enabled&&!forceLocal;
  // Only explicit local commands perform actions. Ordinary connected chat goes
  // to the chosen model, including greetings and questions in an empty library.
  if(!useAI&&connection&&/^(?:(?:please\s+)?(?:connect|enable|activate|set up|turn on))\b.*\b(?:ai|agent|aster|claude|codex|grok|subscription|api)\b/i.test(asked)){connectAI();return;}
  const turnId=`chat-${++nextChatTurn}`;updateTurns(previous=>[...previous,{id:turnId,question:asked,scope,materialScope,connectionKey,forceLocal,runtimeFingerprint,status:'pending'}]);setQuestion('');setError('');
  const downloadIntent=parseAsterDownloadIntent(asked);
  if(downloadIntent){await requestDownloads(downloadIntent);finishTurn(turnId,{status:'answered',message:'See the download result below. Only files included with an open game can be saved.'});return;}
  setDownloads(null);asterFeedback('ask',notebook?.ageGroup);
  const previousLocal=turns.at(-1);
  const localFollowup=!useAI&&previousLocal?.context&&/^(?:why|why is that|tell me more|explain that|what do you mean(?: by that)?|how do i do that|more please)[?!.]*$/i.test(asked)?previousLocal.question:asked;
  const localContext=!useAI?answerAsterContext(localFollowup,awarenessContext):undefined;
  if(localContext){lastSuccessfulTopic.current=undefined;finishTurn(turnId,{status:'answered',context:localContext});asterFeedback('answer',notebook?.ageGroup);return;}
  if(!notebook&&!useAI){finishTurn(turnId,{status:'answered',message:/^(?:what(?: is|'s) your name|who are you)\??$/i.test(asked)?'I’m Aster, your learning companion. I can guide you around the app. Add AI for deeper explanations, or open a game to explore its material.':'I can guide you around the app offline. Open a game to explore its material, or connect me to AI to chat here.'});asterFeedback('answer');return;}
  const version=++request.current,activeScope=scope;searchAbort.current?.abort();const controller=new AbortController();searchAbort.current=controller;setSearching(true);
  const isCurrent=()=>version===request.current&&activeScope===currentScope.current&&!controller.signal.aborted&&(!useAI||currentConnection.current?.enabled===true&&currentConnection.current.config===connection?.config);
  try{
   if(useAI&&connection){
    if(!isCurrent())return;
    const conversation:AsterConversationTurn[]=turns.filter(turn=>turn.materialScope===materialScope&&turn.connectionKey===connectionKey&&turn.status==='answered').flatMap(turn=>{
     if(turn.ai?.status==='answered')return[{question:turn.question,answer:turn.ai.answer,citations:turn.ai.citations,...(turn.ai.contextFingerprint?{contextFingerprint:turn.ai.contextFingerprint}:{})}];
     if(turn.context)return[{question:turn.question,answer:turn.context.lines.join(' '),citations:[],contextFingerprint:turn.runtimeFingerprint}];
     if(turn.prepared)return[{question:turn.question,answer:turn.prepared.text,citations:turn.prepared.citations}];
     if(turn.local?.status==='found')return[{question:turn.question,answer:turn.local.passages.map(p=>p.reference.quote).join(' '),citations:turn.local.passages.flatMap(p=>[p.reference,...(p.contextReferences??[])])}];
     return[];
    });
    const answer=await askAsterAI({notebook,question:asked,previousQuestion:lastSuccessfulTopic.current,retrievalQuestion:lastSuccessfulTopic.current?undefined:asterCurrentTopic(asked,liveAwareness.current),conversation,awarenessContext:liveAwareness.current,readContext:()=>liveAwareness.current,activityId,progress,learningState,config:connection.config,signal:controller.signal});
    if(answer.receipt)connection.recordReceipt(answer.receipt);
    if(!isCurrent())return;
    // Conversation and live app status are not subject help. Commit support only
    // before exposing source-based answers or related evidence, including refusals.
    if(answer.citations.length||answer.status==='not-supported'&&answer.retrieval.passages.length){pendingAI.current={turnId,answer,scope:activeScope,connectionKey};if(await assistance.current?.()===false)throw Error('Help save failed');}
    if(isCurrent())pendingAI.current=null;
    if(!isCurrent())return;
    if(answer.status==='answered')lastSuccessfulTopic.current=answer.citations.length?answer.retrieval.topicQuestion??answer.retrieval.question:undefined;
    finishTurn(turnId,{status:'answered',ai:answer});
   }else if(notebook){
    const prepared=preparedAsterAnswer(asked,liveAwareness.current);
    if(prepared){if(await assistance.current?.()===false)throw Error('Help save failed');if(isCurrent()){finishTurn(turnId,{status:'answered',prepared});lastSuccessfulTopic.current=prepared.kind==='overview'?'Summarize this material.':asterCurrentTopic(asked,liveAwareness.current);}}
    else{const queried=lastSuccessfulTopic.current?asked:asterCurrentTopic(asked,liveAwareness.current)??asked;
     const searched=await askAster(notebook,queried,{limit:4,previousQuestion:lastSuccessfulTopic.current,activityId,signal:controller.signal});const answer={...searched,question:asked};if(!isCurrent())return;if(answer.passages.length&&await assistance.current?.()===false)throw Error('Help save failed');if(isCurrent()){finishTurn(turnId,{status:'answered',local:answer});if(answer.status==='found')lastSuccessfulTopic.current=answer.topicQuestion??answer.question;}}
   }
   if(isCurrent()){asterFeedback('answer',notebook?.ageGroup);input.current?.focus();}
  }
  catch(error){if(error instanceof AsterAIError&&error.receipt)connection?.recordReceipt(error.receipt);if(isCurrent()){finishTurn(turnId,{status:'error',savePending:pendingAI.current?.turnId===turnId,message:useAI?(error instanceof AsterAIError?error.message:'Aster has answered, but your progress could not be saved. The answer stays closed until that save succeeds. Retry saving help to use the same answer without another AI request.'):'I could not search these materials. Your game is safe; try opening a source directly.'});asterFeedback('answer',notebook?.ageGroup);}}
  finally{if(version===request.current)setSearching(false);}
 };
 const retrySavingHelp=async(turn:ChatTurn)=>{
  const saved=pendingAI.current;if(busy||!saved||saved.turnId!==turn.id||saved.scope!==scope||saved.connectionKey!==connectionKey)return;
  const version=++request.current,isCurrent=()=>version===request.current&&saved===pendingAI.current&&saved.scope===currentScope.current;
  setSearching(true);finishTurn(turn.id,{status:'pending',message:undefined,savePending:true});
  try{
   if(await assistance.current?.()===false)throw Error('save');if(!isCurrent())return;
   pendingAI.current=null;finishTurn(turn.id,{status:'answered',ai:saved.answer,savePending:false});
   if(saved.answer.status==='answered')lastSuccessfulTopic.current=saved.answer.citations.length?saved.answer.retrieval.topicQuestion??saved.answer.retrieval.question:undefined;
   asterFeedback('answer',notebook?.ageGroup);
  }catch{if(isCurrent())finishTurn(turn.id,{status:'error',savePending:true,message:'Your progress still could not be saved. Retry saving help when ready; Aster’s answer is held here without another AI request.'});}
  finally{if(version===request.current)setSearching(false);}
 };
 const openEvidence=async(reference:EvidenceReference)=>{const version=request.current,activeScope=scope;try{if(await assistance.current?.()===false)throw Error('Help save failed');if(version!==request.current||activeScope!==currentScope.current)return;onOpenSource?.(reference.sourceId,reference.quote);}catch{if(version===request.current&&activeScope===currentScope.current)setError('This source could not be opened. You can read the excerpt here.');}};
 const changePreference=(mode:AsterPreferences['mode'])=>{setAsterPreferences({mode});setBubble(false);if(mode==='off')close();};
 const portrait=(className:string)=><span className={className} aria-hidden="true">{portraitFailed?<span className="aster-initial">A</span>:<img src={imageUrl} alt="" onError={()=>{if(imageUrl!==portraitUrl)setFailedExpression(emotion.assetPath);else setPortraitFailed(true);}} draggable={false}/>}{className==='aster-launcher-portrait'&&connectionTransition&&<video key={connectionTransition.id} className="aster-transformation-video" data-direction={connectionTransition.direction} src={`/assets/aster/transitions/${connectionTransition.direction}.webm`} muted autoPlay playsInline preload="auto" tabIndex={-1} onEnded={()=>setConnectionTransition(current=>current?.id===connectionTransition.id?null:current)} onError={()=>setConnectionTransition(current=>current?.id===connectionTransition.id?null:current)}/>}</span>;
 if(preferences.mode==='off')return <div className="aster-restore"><button type="button" onClick={()=>changePreference('quiet')}><MessageCircle size={13} aria-hidden="true"/>Show Aster</button></div>;
 return <aside className={`aster-guide${open?' aster-open':''}${automaticTipVisible?' aster-automatic':''}${aiConnected?' aster-connected':''}${connectionArrival?' aster-connection-arrival':''}${connectionTransition?' aster-mode-transition':''}${searching?' aster-thinking':''}`} data-connection={aiConnected?'connected':'local'} style={{'--aster-aura-image':"url('/assets/aster/agentic-aura.png')"} as CSSProperties} aria-label="Aster learning companion" data-mode={mode} data-preference={preferences.mode} data-guidance={automaticTipVisible?'automatic':open?'manual':'idle'} data-moment={moment} data-expression={emotion.id}>
  {open&&<section id={`${id}-panel`} className="aster-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
   <header className="aster-header">{portrait('aster-portrait')}<div><span className="aster-eyebrow">{aiConnected?'YOUR CONNECTED LEARNING COMPANION':'YOUR LEARNING COMPANION'}</span><h2 id={`${id}-title`}>Ask Aster</h2><p>{young?'Let’s explore together.':'Your companion for learning and getting unstuck.'}</p></div><button type="button" className="aster-icon" aria-label="Close Aster" onClick={close}><X size={18} aria-hidden="true"/></button></header>
   <div className="aster-panel-body">
    {connection&&<div className="aster-ai-controls"><strong>{connection.enabled?'AI Aster · ready when you ask':'Regular Aster · works offline'}</strong><button type="button" onClick={connectAI}>{connection.enabled?'AI connection':'Connect Aster to AI'}</button>{connection.enabled&&<button type="button" onClick={connection.disable}>Use regular Aster</button>}<p>{connection.enabled?`Your messages use ${connection.config.model}. Local activity buttons and source downloads stay on this device.`:'Find source passages, get prepared hints and follow your saved progress. Add AI for live explanations.'}</p></div>}
    <details className="aster-chat-tools"><summary>Current activity & tools</summary><div className="aster-context"><Sparkles size={16} aria-hidden="true"/><div><h3>{awareness.title}</h3><p>{awareness.summary}</p><p>{awareness.nextAction}</p></div></div>
    <div className="aster-context-actions" aria-label="Ask about your current activity">{['What is happening?','What is next?','Show local log'].map(value=><button type="button" key={value} disabled={busy} onClick={()=>{setQuestion(value);void search(value,true);}}>{value}</button>)}</div>
    <button type="button" className="aster-download-launcher" disabled={busy} onClick={()=>void requestDownloads()}><Download size={16} aria-hidden="true"/>Download sources<span>Keep a copy of your learning material</span></button>
    {help&&<section className="aster-mission-help" aria-label="Help with this mission">{!showHint?<button type="button" className="aster-help-button" disabled={busy} onClick={revealHint}><BookOpen size={16} aria-hidden="true"/>Help with this mission<ChevronDown size={15} aria-hidden="true"/></button>:<><span className="aster-eyebrow">{help.origin==='ai-practice'?'AI-PREPARED PRACTICE GUIDANCE':help.origin==='prepared-teaching'?'PREPARED FOR THIS MISSION':'AUTHOR’S SOURCE HINT'}</span><h3>{help.title}</h3><p>{help.text}</p>{help.steps.length>0&&<ol>{help.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>}<div className="aster-citation-links">{help.citations.map((reference,index)=><span key={`${reference.sourceId}-${reference.start}-${index}`}>{onOpenSource?<button type="button" onClick={()=>openEvidence(reference)}>{notebook?.sources.find(source=>source.id===reference.sourceId)?.title??'Source'} · {reference.locator.label}</button>:<span>{notebook?.sources.find(source=>source.id===reference.sourceId)?.title??'Source'} · {reference.locator.label}</span>}</span>)}</div><small>Source help supports this attempt; it does not establish independent mastery.</small></>}</section>}
    </details>
    <section className="aster-conversation" aria-label="Conversation with Aster" role="log" aria-live="polite" aria-relevant="additions text">
     {!turns.length&&<div className="aster-chat-welcome"><Sparkles size={20} aria-hidden="true"/><h3>Hi, I’m Aster.</h3><p>{connection?.enabled?'Ask me a question, talk through an idea, or tell me where you’re stuck.':'I can help you find your next step and explore saved material. Add AI for deeper explanations.'}</p></div>}
     {turns.map((turn,index)=>{const currentMaterial=turn.materialScope===materialScope,currentTask=turn.scope===scope,latest=index===turns.length-1&&currentTask,contextAnswer=turn.context,preparedAnswer=turn.prepared,result=turn.local,sourceBased=!!(turn.ai?.citations.length||turn.ai?.status==='not-supported'&&turn.ai.retrieval.passages.length||turn.local?.passages.length||turn.prepared),concealed=sourceBased&&!currentTask&&!revealedHistory.includes(turn.id);
      return <article key={turn.id} className="aster-chat-turn" data-status={turn.status}>
       <div className="aster-chat-user"><span>You</span><p>{turn.question}</p></div>
       <div className="aster-chat-reply"><span className="aster-chat-speaker">Aster</span>
        {(!currentMaterial||!currentTask||!!turn.context&&turn.runtimeFingerprint!==runtimeFingerprint)&&<small className="aster-chat-history-note">Earlier conversation · the current activity may be different.</small>}
        {turn.status==='pending'&&<p className="aster-search-status" role="status">{turn.savePending?'Saving source help…':connection?.enabled&&!turn.forceLocal?'Aster is preparing an answer…':'Looking through your material…'}</p>}
        {turn.message&&<p className={turn.status==='error'?'aster-search-error':'aster-chat-message'} role={turn.status==='error'&&latest?'alert':undefined}>{turn.message}</p>}
        {concealed?<button type="button" className="aster-history-review" disabled={busy} onClick={async()=>{const version=request.current;try{if(await assistance.current?.()===false)throw Error('save');if(version===request.current)setRevealedHistory(previous=>[...previous,turn.id]);}catch{setError('Your progress could not be saved, so earlier source help stayed closed.');}}}>Review earlier source help</button>:null}
        {!concealed&&turn.ai&&<AsterAIAnswer result={turn.ai} label={latest?'Aster AI answer':'Earlier Aster AI answer'} historical={!currentTask||!!turn.ai.contextFingerprint&&turn.ai.contextFingerprint!==runtimeFingerprint} onSource={reference=>void openEvidence(reference)} onHelp={()=>void revealHint()} onConnect={connectAI} canOpenSource={currentMaterial&&!!onOpenSource} canHelp={currentTask&&!!help&&!showHint}/>}
    {!concealed&&contextAnswer&&<section className="aster-context-answer aster-results" aria-label={latest&&turn.runtimeFingerprint===runtimeFingerprint?"Current activity answer":"Earlier current activity answer"}><h3>{contextAnswer.title}</h3><div role="status">{contextAnswer.lines.map((line,index)=><p key={index}>{line}</p>)}</div>{contextAnswer.log?.length!==undefined&&contextAnswer.log.length>0&&<ol className="aster-event-log">{contextAnswer.log.map(event=><li key={event.id}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><strong>{event.label}</strong><p>{event.message}</p></li>)}</ol>}<small>From the screen and saved records when you asked. Asking about app status does not mark your attempt as supported.</small></section>}
    {!concealed&&preparedAnswer&&<section className="aster-prepared-answer aster-ai-answer" aria-label={latest?"Aster prepared explanation":"Earlier prepared explanation"}><span className="aster-eyebrow">OFFLINE LEARNING HELP</span><h3>{preparedAnswer.title}</h3>{preparedAnswer.text.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}<details><summary>Read the supporting passages</summary>{preparedAnswer.citations.map((reference,index)=><blockquote key={`${reference.sourceId}-${reference.start}-${index}`}><p>{reference.quote}</p><footer>{currentMaterial&&onOpenSource?<button type="button" onClick={()=>openEvidence(reference)}>{reference.locator.label} · Open source</button>:reference.locator.label}</footer></blockquote>)}</details><small>From this game’s saved learning material. No live AI request.</small></section>}
    {!concealed&&result&&<section className="aster-results" aria-label={latest?"Source search results":"Earlier source search results"}><h3>{result.coverage?.overview?'Explore your material':'Relevant passages'}</h3><p role="status">{result.message}</p>{result.coverage&&<small>Searched {result.coverage.sources} source{result.coverage.sources===1?'':'s'} in this game.</small>}{result.passages.map(({reference,sourceTitle},index)=><article key={`${reference.sourceId}-${reference.start}-${index}`}><div className="aster-result-title"><span>{index+1}</span><strong>{sourceTitle}</strong></div>{result.passages[index].contextReferences?.map(context=><p className="aster-source-context" key={`${context.start}-${context.end}`}><small>Source context · {context.locator.label}</small>{context.quote}</p>)}<blockquote>{reference.quote}</blockquote>{currentMaterial&&onOpenSource?<button type="button" onClick={()=>openEvidence(reference)}><BookOpen size={13} aria-hidden="true"/>{reference.locator.label} · Open source</button>:<small>{reference.locator.label}</small>}</article>)}{result.passages.length>0&&<small>Original source excerpts, found on this device.{connection&&!connection.enabled&&' Connect Aster to AI for a source-based explanation.'}</small>}</section>}

        {(turn.status==='error'||turn.status==='stopped')&&latest&&<div className="aster-ai-actions"><button type="button" disabled={busy} onClick={()=>turn.savePending&&pendingAI.current?.turnId===turn.id?void retrySavingHelp(turn):void search(turn.question,turn.forceLocal)}>{turn.savePending&&pendingAI.current?.turnId===turn.id?'Retry saving help':'Try again'}</button>{notebook&&<button type="button" disabled={busy} onClick={()=>void search(turn.question,true)}>Search sources offline</button>}{connection&&<button type="button" onClick={connectAI}>Check AI connection</button>}</div>}
       </div>
      </article>;
     })}
     <div ref={chatEnd}/>
    </section>
    {error&&<p className="aster-search-error" role="alert">{error}</p>}
    {downloadPending&&!visibleDownloads&&<p className="aster-search-status" role="status">Opening source downloads…</p>}
    {visibleDownloads&&<section className="aster-downloads" aria-label="Source downloads"><h3 ref={downloadSummary}>Your source material</h3><p role="status">{visibleDownloads.message}</p>{visibleDownloads.choices.map(choice=><article key={`${choice.sourceId}:${choice.option.id}`}><strong>{choice.sourceTitle}</strong><p>{choice.option.description}</p><button type="button" disabled={busy} onClick={()=>void requestDownloads(undefined,choice)}><Download size={14} aria-hidden="true"/>{choice.option.label}<span>{choice.option.filename}</span></button></article>)}<small>Only sources bundled with this game. Source help supports this attempt; it does not establish independent mastery.</small></section>}
    {connection&&<AsterAIUsage receipts={connection.receipts}/>}
    <details className="aster-preferences"><summary><Settings2 size={14} aria-hidden="true"/>How Aster appears</summary><label htmlFor={`${id}-frequency`}>Guidance frequency<select id={`${id}-frequency`} value={preferences.mode} onChange={event=>changePreference(event.target.value as AsterPreferences['mode'])}><option value="helpful">Occasional tips</option><option value="quiet">Only when I ask</option><option value="off">Hide Aster</option></select></label><p>Aster never takes away saved points. Source help marks the current attempt as supported. {connection?.enabled?'AI questions and relevant passages go to your selected provider only when you ask.':'Offline questions stay on this device.'}</p></details>
   </div>
   <form onSubmit={event=>{event.preventDefault();void search();}} className="aster-search aster-chat-composer"><label htmlFor={`${id}-question`}>{young?'Talk with Aster · with a grown-up':'Message Aster'}</label><div><input ref={input} id={`${id}-question`} value={question} maxLength={500} placeholder={connection?.enabled?'Ask a question or follow up…':'Ask about your game or material…'} disabled={busy} onChange={event=>setQuestion(event.target.value)} autoComplete="off"/><button type="submit" disabled={busy||!question.trim()} aria-label={connection?.enabled?'Ask AI Aster':'Find in my sources'}><Send size={17} aria-hidden="true"/></button></div><div className="aster-composer-meta"><small>{connection?.enabled?`AI · ${connection.config.model}`:'Offline · no AI request'}</small>{searching?<button type="button" onClick={()=>{request.current++;searchAbort.current?.abort();stopPending();setSearching(false);}}>Stop answer</button>:turns.length>0&&<button type="button" onClick={()=>{pendingAI.current=null;updateTurns(()=>[]);lastSuccessfulTopic.current=undefined;setQuestion('');setError('');input.current?.focus();}}>Start a new conversation</button>}</div></form>
  </section>}
  {automaticTipVisible&&<div className="aster-bubble"><button type="button" className="aster-icon" aria-label="Dismiss Aster tip" onClick={()=>{dismissAsterTip(tip);setBubble(false);}}><X size={15} aria-hidden="true"/></button><strong>{tip.title}</strong><p>{tip.text}</p><button type="button" className="aster-bubble-action" onClick={reveal}>Ask Aster <MessageCircle size={12} aria-hidden="true"/></button></div>}
  <div className="aster-launcher-shell">{portrait('aster-launcher-portrait')}<button type="button" ref={launcher} className="aster-launcher" aria-label={open?'Close Aster companion':'Ask Aster'} aria-expanded={open} aria-controls={open?`${id}-panel`:undefined} onClick={()=>open?close():reveal()}><span>{open?'Close':'Ask Aster'}<MessageCircle size={12} aria-hidden="true"/></span></button></div>
 </aside>;
}
