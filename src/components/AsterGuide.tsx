import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {BookOpen,ChevronDown,MessageCircle,Search,Settings2,Sparkles,X} from 'lucide-react';
import type {Notebook,EvidenceReference,Progress} from '../types';
import {askAster} from '../lib/asterKnowledge';
import {sourceRevision,textDigest} from '../lib/evidence';
import {answerAsterContext,buildAsterAwareness,type AsterAwarenessContext,type AsterLearningState} from '../lib/asterAwareness';
import {asterMissionHelp,contextualAsterTip,dismissAsterTip,getAsterPreferences,setAsterPreferences,shouldOfferAsterTip,type AsterGuideContext,type AsterMode,type AsterPreferences,type AsterSessionPolicy} from '../lib/asterGuidePolicy';
import {ASTER_BASE_PORTRAIT,resolveAsterEmotion,type AsterEmotionId,type AsterEmotionOptions,type AsterMoment} from '../lib/asterEmotions';
import './aster-guide.css';
export interface AsterGuideProps {
 notebook?:Notebook;mode:AsterMode;activityId?:string;creationStage?:string;
 progress?:Progress;creationRunning?:boolean;learningState?:AsterLearningState;
 creationConnection?:AsterAwarenessContext['creationConnection'];
 /** Changes when the current learning task changes within the same notebook. */
 contextKey?:string;
 feedback?:{outcome:'success'|'retry';eventKey:string;committed?:boolean;score?:{value:number;max?:number;xp?:number}};
 expressions?:Partial<Record<AsterMoment,AsterEmotionId>>;
 onOpenSource?:(sourceId:string,evidence?:string)=>void;
 onAssistance?:()=>void|boolean|Promise<void|boolean>;
 /** Test/embedded hosts can supply the same bundled portrait at their own asset base. */
 portraitUrl?:string;
}
type SearchResult=Awaited<ReturnType<typeof askAster>>;
let automaticSession:AsterSessionPolicy={shown:0,lastShownAt:-Infinity};
export default function AsterGuide({notebook,mode,activityId,creationStage,contextKey,feedback,progress,creationRunning,creationConnection,learningState,expressions,onOpenSource,onAssistance,portraitUrl=ASTER_BASE_PORTRAIT}:AsterGuideProps){
 const assistance=useRef(onAssistance);assistance.current=onAssistance;
 const id=useId().replace(/:/g,''),launcher=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),request=useRef(0),searchAbort=useRef<AbortController|null>(null);
 const [preferences,setPreferences]=useState<AsterPreferences>(getAsterPreferences),[open,setOpen]=useState(false),[bubble,setBubble]=useState(false),[question,setQuestion]=useState(''),[result,setResult]=useState<SearchResult|null>(null),[searching,setSearching]=useState(false),[error,setError]=useState(''),[showHint,setShowHint]=useState(false),[portraitFailed,setPortraitFailed]=useState(false),[failedExpression,setFailedExpression]=useState('');
 const [contextQuestion,setContextQuestion]=useState<string|null>(null);
 const context:AsterGuideContext={notebook,mode,activityId,creationStage,creationRunning,feedback},tip=contextualAsterTip(context),young=notebook?.ageGroup==='3-5'||notebook?.ageGroup==='6-8';
 const awarenessContext:AsterAwarenessContext={...context,progress,creationRunning,creationConnection,learningState},awareness=buildAsterAwareness(awarenessContext),contextAnswer=contextQuestion?answerAsterContext(contextQuestion,awarenessContext):undefined;
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
 const materialScope=useMemo(()=>textDigest(JSON.stringify([notebook?.sources.map(source=>[source.id,source.title,source.status,sourceRevision(source)]),activity,help])),[notebook?.sources,activity,help]);
 const scope=`${notebook?.id??'library'}:${materialScope}:${activityId??''}:${mode}:${contextKey??''}`;
 useEffect(()=>{request.current++;searchAbort.current?.abort();setResult(null);setContextQuestion(null);setSearching(false);setError('');setShowHint(false);setQuestion('');return()=>{request.current++;searchAbort.current?.abort();};},[scope]);
 useEffect(()=>{const changed=()=>setPreferences(getAsterPreferences());window.addEventListener('asterloom:guide-preferences',changed);return()=>window.removeEventListener('asterloom:guide-preferences',changed);},[]);
 useEffect(()=>{
  if(preferences.mode!=='helpful'||open||!shouldOfferAsterTip(context,preferences,automaticSession,Date.now())){setBubble(false);return;}
  const timeout=setTimeout(()=>{if(document.visibilityState==='hidden'||!shouldOfferAsterTip(context,getAsterPreferences(),automaticSession,Date.now()))return;automaticSession={shown:automaticSession.shown+1,lastShownAt:Date.now()};dismissAsterTip(tip);setBubble(true);},1800);
  return()=>clearTimeout(timeout);
 },[tip.id,preferences.mode,open,creationRunning]);
 useEffect(()=>{if(!bubble)return;const timeout=setTimeout(()=>setBubble(false),14000);return()=>clearTimeout(timeout);},[bubble]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 const close=()=>{request.current++;searchAbort.current?.abort();setSearching(false);setOpen(false);launcher.current?.focus();};
 const reveal=()=>{setBubble(false);setOpen(true);};
 const revealHint=async()=>{const version=request.current;try{if(await assistance.current?.()===false)throw Error('Help save failed');if(version!==request.current)return;setShowHint(true);setError('');}catch{if(version===request.current)setError('This mission could not open source help. Try again after returning to the mission.');}};
 const search=async(asked=question)=>{
  if(searching)return;
  if(answerAsterContext(asked,awarenessContext)){request.current++;searchAbort.current?.abort();setError('');setResult(null);setContextQuestion(asked);return;}
  setContextQuestion(null);
  if(!notebook){setError('Open a notebook to search its learning material. You can ask me what is happening or what to do next here.');return;}
  const version=++request.current;searchAbort.current?.abort();const controller=new AbortController();searchAbort.current=controller;setSearching(true);setError('');setResult(null);
  try{const answer=await askAster(notebook,asked,{limit:4,activityId,signal:controller.signal});if(version!==request.current)return;if(answer.passages.length&&await assistance.current?.()===false)throw Error('Help save failed');if(version===request.current)setResult(answer);}
  catch{if(version===request.current)setError('I could not search these materials. Your game is safe; try opening a source directly.');}
  finally{if(version===request.current)setSearching(false);}
 };
 const openEvidence=async(reference:EvidenceReference)=>{const version=request.current;try{if(await assistance.current?.()===false)throw Error('Help save failed');if(version!==request.current)return;onOpenSource?.(reference.sourceId,reference.quote);}catch{if(version===request.current)setError('This source could not be opened. You can read the excerpt here.');}};
 const changePreference=(mode:AsterPreferences['mode'])=>{setAsterPreferences({mode});setBubble(false);if(mode==='off')close();};
 const portrait=(className:string)=><span className={className}>{portraitFailed?<span className="aster-initial" aria-hidden="true">A</span>:<img src={imageUrl} alt="" onError={()=>{if(imageUrl!==portraitUrl)setFailedExpression(emotion.assetPath);else setPortraitFailed(true);}} draggable={false}/>}</span>;
 if(preferences.mode==='off')return <div className="aster-restore"><button type="button" onClick={()=>changePreference('quiet')}><MessageCircle size={13} aria-hidden="true"/>Show Aster</button></div>;
 return <aside className={`aster-guide${open?' aster-open':''}${automaticTipVisible?' aster-automatic':''}`} aria-label="Aster learning companion" data-mode={mode} data-preference={preferences.mode} data-guidance={automaticTipVisible?'automatic':open?'manual':'idle'} data-moment={moment} data-expression={emotion.id}>
  {open&&<section id={`${id}-panel`} className="aster-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
   <header className="aster-header">{portrait('aster-portrait')}<div><span className="aster-eyebrow">YOUR LEARNING COMPANION</span><h2 id={`${id}-title`}>Ask Aster</h2><p>{young?'We can explore your material together.':'A little guidance, when you want it.'}</p></div><button type="button" className="aster-icon" aria-label="Close Aster" onClick={close}><X size={18} aria-hidden="true"/></button></header>
   <div className="aster-panel-body">
    <div className="aster-context"><Sparkles size={16} aria-hidden="true"/><div><h3>{awareness.title}</h3><p>{awareness.summary}</p><p>{awareness.nextAction}</p></div></div>
    <div className="aster-context-actions" aria-label="Ask about your current activity">{['What is happening?','What is next?','Show local log'].map(value=><button type="button" key={value} disabled={searching} onClick={()=>{setQuestion(value);void search(value);}}>{value}</button>)}</div>
    {help&&<section className="aster-mission-help" aria-label="Help with this mission">{!showHint?<button type="button" className="aster-help-button" onClick={revealHint}><BookOpen size={16} aria-hidden="true"/>Help with this mission<ChevronDown size={15} aria-hidden="true"/></button>:<><span className="aster-eyebrow">{help.origin==='ai-practice'?'AI-PREPARED PRACTICE GUIDANCE':help.origin==='prepared-teaching'?'PREPARED FOR THIS MISSION':'AUTHOR’S SOURCE HINT'}</span><h3>{help.title}</h3><p>{help.text}</p>{help.steps.length>0&&<ol>{help.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>}<div className="aster-citation-links">{help.citations.map((reference,index)=><span key={`${reference.sourceId}-${reference.start}-${index}`}>{onOpenSource?<button type="button" onClick={()=>openEvidence(reference)}>{notebook?.sources.find(source=>source.id===reference.sourceId)?.title??'Source'} · {reference.locator.label}</button>:<span>{notebook?.sources.find(source=>source.id===reference.sourceId)?.title??'Source'} · {reference.locator.label}</span>}</span>)}</div><small>Source help supports this attempt; it does not establish independent mastery.</small></>}</section>}
    <form onSubmit={event=>{event.preventDefault();void search();}} className="aster-search"><label htmlFor={`${id}-question`}>{young?'Ask with a grown-up':'What would you like to find?'}</label><div><input ref={input} id={`${id}-question`} value={question} maxLength={500} placeholder="Ask about this screen or your material…" disabled={searching} onChange={event=>setQuestion(event.target.value)} autoComplete="off"/><button type="submit" disabled={searching||!question.trim()} aria-label="Find in my sources"><Search size={17} aria-hidden="true"/></button></div><p>Current screen, saved local records and source search · no live AI call</p></form>
    {searching&&<p className="aster-search-status" role="status">Looking through your material…</p>}
    {error&&<p className="aster-search-error" role="alert">{error}</p>}
    {contextAnswer&&<section className="aster-context-answer aster-results" aria-label="Current activity answer"><h3>{contextAnswer.title}</h3><div role="status">{contextAnswer.lines.map((line,index)=><p key={index}>{line}</p>)}</div>{contextAnswer.log?.length!==undefined&&contextAnswer.log.length>0&&<ol className="aster-event-log">{contextAnswer.log.map(event=><li key={event.id}><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time><strong>{event.label}</strong><p>{event.message}</p></li>)}</ol>}<small>From this screen and saved records on this device. Asking about app status does not mark your attempt as supported.</small></section>}
    {result&&<section className="aster-results" aria-label="Source search results"><p role="status">{result.message}</p>{result.passages.map(({reference,sourceTitle},index)=><article key={`${reference.sourceId}-${reference.start}-${index}`}><div className="aster-result-title"><span>{index+1}</span><strong>{sourceTitle}</strong></div><blockquote>{reference.quote}</blockquote>{onOpenSource?<button type="button" onClick={()=>openEvidence(reference)}><BookOpen size={13} aria-hidden="true"/>{reference.locator.label} · Open source</button>:<small>{reference.locator.label}</small>}</article>)}{result.passages.length>0&&<small>These are source excerpts, not a generated answer. Compare their scope and wording with your question.</small>}</section>}
    <details className="aster-preferences"><summary><Settings2 size={14} aria-hidden="true"/>How Aster appears</summary><label htmlFor={`${id}-frequency`}>Guidance frequency<select id={`${id}-frequency`} value={preferences.mode} onChange={event=>changePreference(event.target.value as AsterPreferences['mode'])}><option value="helpful">Occasional tips</option><option value="quiet">Only when I ask</option><option value="off">Hide Aster</option></select></label><p>Aster never takes away saved points. Source help marks the current attempt as supported. Questions stay on this device.</p></details>
   </div>
  </section>}
  {automaticTipVisible&&<div className="aster-bubble"><button type="button" className="aster-icon" aria-label="Dismiss Aster tip" onClick={()=>{dismissAsterTip(tip);setBubble(false);}}><X size={15} aria-hidden="true"/></button><strong>{tip.title}</strong><p>{tip.text}</p><button type="button" className="aster-bubble-action" onClick={reveal}>Ask Aster <MessageCircle size={12} aria-hidden="true"/></button></div>}
  <button type="button" ref={launcher} className="aster-launcher" aria-label={open?'Close Aster companion':'Ask Aster'} aria-expanded={open} aria-controls={open?`${id}-panel`:undefined} onClick={()=>open?close():reveal()}>{portrait('aster-launcher-portrait')}<span>{open?'Close':'Aster'}<MessageCircle size={12} aria-hidden="true"/></span></button>
 </aside>;
}
