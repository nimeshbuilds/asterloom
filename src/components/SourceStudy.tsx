import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,Flag,Pin,Sparkles} from 'lucide-react';
import type {Source,SourceStudyState} from '../types';
import {restoreSourceStudy,type CampaignChapter} from '../lib/campaign';
import {gameActionFeedback} from '../lib/music';
import ReactionEffects from './ReactionEffects';
import type {GameAudioDirection} from '../lib/gameArtDirection';
import './campaign.css';
import './source-library.css';
import {sourceDisplayTitle,sourceReadingPages} from './sourceReaderModel';

interface Props {chapter:CampaignChapter;source?:Source;saved?:SourceStudyState;ageGroup:string;scaffoldId?:string;theme?:string;artDirection?:GameAudioDirection;audioControls?:ReactNode;hud?:ReactNode;onSave:(state:SourceStudyState)=>Promise<boolean>;onExit:()=>void;onPractice?:()=>void;onNext?:()=>void}
export default function SourceStudy({chapter,source,saved,ageGroup,scaffoldId,theme,artDirection,audioControls,hud,onSave,onExit,onPractice,onNext}:Props){
 const [state,setState]=useState(()=>restoreSourceStudy(chapter,saved));
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[compare,setCompare]=useState(false);
 const [savedReaction,setSavedReaction]=useState(0);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const latest=useRef(state);latest.current=state;const writer=useRef(onSave);writer.current=onSave;const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 useEffect(()=>{
  if(!dirty||saving)return;
  const snapshot=state;
  const timer=window.setTimeout(()=>{void writer.current({...snapshot,updatedAt:new Date().toISOString()}).then(ok=>{if(!mounted.current||latest.current!==snapshot)return;if(ok){setDirty(false);setError('');}else setError('Your field note has not been saved. Retry before leaving.');}).catch(()=>{if(mounted.current)setError('Your field note could not be saved. Keep this chapter open and retry.');});},800);
  return()=>window.clearTimeout(timer);
 },[state,dirty,saving]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>()=>{if(dirtyRef.current)void writer.current({...latest.current,updatedAt:new Date().toISOString()}).catch(()=>{});},[]);
 const young=ageGroup==='3-5'||ageGroup==='6-8';
 const location=useMemo(()=>source?sourceReadingPages(source).find(page=>page.start<=chapter.unit.start&&chapter.unit.start<page.end)?.label:undefined,[source,chapter.unit.start]);
 const change=(patch:Partial<SourceStudyState>)=>{const next={...latest.current,...patch,completed:false};latest.current=next;dirtyRef.current=true;setState(next);setDirty(true);setSavedReaction(0);};
 async function save(complete=false,after?:()=>void){if(saving)return;const next={...state,completed:complete||state.completed,updatedAt:new Date().toISOString()};setSaving(true);setError('');try{if(!await onSave(next))throw new Error('Your field note has not been saved. Retry before leaving.');if(!mounted.current)return;latest.current=next;dirtyRef.current=false;setState(next);setDirty(false);if(complete&&(!state.completed||dirty)){setSavedReaction(value=>value+1);gameActionFeedback('commit',scaffoldId,ageGroup);}after?.();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Your field note could not be saved.');}finally{if(mounted.current)setSaving(false);}}
 const ready=Boolean(state.quote&&state.note.trim().length>=8);
 return <div className={`source-study ${young?'source-study-young':''}`}>
  <header className="source-study-toolbar"><button className="button secondary" disabled={saving} onClick={()=>void save(false,onExit)}><ArrowLeft size={17}/>Save & return</button><span className="eyebrow">OPTIONAL FIELD NOTE</span>{audioControls}</header>
  {hud}
  <div className="source-study-hero"><span className="campaign-emblem"><BookOpen size={28}/></span><div><span className="eyebrow">{sourceDisplayTitle(chapter.sourceTitle)}</span><h1>{chapter.title}</h1><p>{young?'Look or listen together. Find a part worth talking about, then add it to your field guide.':'Keep a personal note about the original material. Reading and field notes are optional; use them whenever you want more context.'}</p></div></div>
  {chapter.teaching&&onPractice&&<section className="source-study-lesson" aria-label="Your guided lesson"><div><span className="eyebrow">YOUR GUIDED LESSON</span><h2>{chapter.teaching.title}</h2><p>{chapter.teaching.objective}</p></div><button className="button primary" disabled={saving} onClick={()=>void save(false,onPractice)}>Learn & play this mission<ArrowRight size={17}/></button></section>}
  <div className="source-study-layout">
   <section className="source-study-material" aria-label="Chapter material"><div className="source-study-section-heading"><span>01</span><h2>Original passages</h2></div><p className="muted">{young?'A grown-up can read this aloud. Point to a passage to keep.':'These are exact excerpts from your uploaded source. Choose one only if you want to add a field note.'}</p><p className="study-source-purpose">{location?`${location} · `:''}Source wording is preserved here. Headings, contents and publication details provide context; they are not teaching explanations.</p>{chapter.unit.passages.map((passage,index)=><article className={`study-passage ${state.quote===passage.quote?'pinned':''}`} key={`${passage.start}-${passage.end}`} data-kind={passage.kind}><div className="study-passage-context"><span>{location??'Original source'} · Passage {index+1}</span><span>{passage.kind==='code'?'Code':passage.kind==='table'?'Table':passage.kind==='list'?'List':'Source excerpt'}</span></div><blockquote>{passage.quote}</blockquote><button aria-pressed={state.quote===passage.quote} disabled={saving} onClick={()=>{if(state.quote!==passage.quote){change({quote:passage.quote});gameActionFeedback('select',scaffoldId,ageGroup);}}}><Pin size={15}/>{state.quote===passage.quote?'Pinned to your field guide':`Pin passage ${index+1}`}</button></article>)}{chapter.unit.warnings.map(w=><p className="notice" key={w}>{w}</p>)}</section>
   <aside className="source-study-notebook" aria-label="Your field note"><div className="source-study-section-heading"><span>02</span><h2>Make a discovery</h2></div>
    {state.quote?<div className="study-pinned"><span><Pin size={15}/>Your source evidence</span><blockquote>{state.quote}</blockquote></div>:<div className="study-pin-empty"><Pin size={23}/><p>Pin a passage from the source to begin your field note.</p></div>}
    <label>{young?'What did you notice?':'Explain what this passage helps you understand'}<textarea value={state.note} maxLength={6000} rows={4} disabled={saving} placeholder={young?'A grown-up can write your words here…':'In my own words… The detail that matters is…'} onChange={e=>change({note:e.target.value})}/></label>
    {young&&<label className="study-caregiver"><input type="checkbox" checked={state.note==='We pointed to the source evidence and talked about what we noticed together.'} disabled={saving} onChange={e=>change({note:e.target.checked?'We pointed to the source evidence and talked about what we noticed together.':''})}/>We pointed to the source and talked about it together</label>}
    <label>{young?'What are you curious about? (optional)':'What would you investigate next? (optional)'}<textarea value={state.question} maxLength={3000} rows={2} disabled={saving} placeholder="A question, a connection, or something to try…" onChange={e=>change({question:e.target.value})}/></label>
    <button className="text-button" disabled={!state.quote} aria-expanded={compare} onClick={()=>setCompare(v=>!v)}><BookOpen size={15}/>{compare?'Close comparison':'Compare your observation with the source'}</button>
    {compare&&<div className="study-self-check"><strong>Keep the meaning intact</strong><p>Does your observation keep the source’s conditions and limits? Separate what it states from a possibility you want to investigate.</p><small>Your explanation is yours to review; it is not automatically graded.</small></div>}
    {error&&<p className="notice" role="alert">{error}</p>}
    <button className="button primary full" disabled={saving||!ready} onClick={()=>void save(true)}>{state.completed&&!dirty?<Check size={18}/>:<Flag size={18}/>} {saving?'Saving discovery…':state.completed&&!dirty?'Discovery saved':'Save this discovery'}</button>
    <p className="study-save-status" role="status">{dirty?'Unsaved field note':state.completed?'Collected in your field guide · Discovery rewards recognize participation; your explanation is not automatically graded.':'Your notes stay on this device'}</p>
   </aside>
  </div>
  {savedReaction>0&&state.completed&&!dirty&&<ReactionEffects outcome="complete" scaffoldId={scaffoldId} ageGroup={ageGroup} theme={theme} artDirection={artDirection} eventKey={`${chapter.id}:${savedReaction}`} compact/>}
  {state.completed&&!dirty&&<div className="study-complete" role="status"><Sparkles size={24}/><div><h2>A discovery worth keeping.</h2><p>{state.question?'Your evidence, observation, and next question are saved.':'Your evidence and observation are saved. Use them in your next mission.'}</p></div>{onPractice&&<button className="button primary" disabled={saving} onClick={()=>void save(false,onPractice)}>Use it in a mission<ArrowRight size={17}/></button>}{onNext&&<button className="button secondary" disabled={saving} onClick={()=>void save(false,onNext)}>Next chapter<ArrowRight size={17}/></button>}</div>}
 </div>;
}
