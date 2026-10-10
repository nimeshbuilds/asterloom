import {useEffect,useState} from 'react';
import type {AIUsageReceipt} from '../lib/aiUsage';

type Phase='accepted'|'connecting'|'generating'|'receiving'|'completed'|'failed'|'canceled';
interface Activity {requestId:string;status:'running'|'completed'|'failed'|'canceled';phase:Phase;startedAt:string;updatedAt:string;outputCharacters?:number;events:{at:string;phase:Phase;message:string}[];reasoningSummaryAvailable?:boolean;reasoningSummary?:string}
const phases:Record<Phase,string>={accepted:'Request received',connecting:'Connecting to your AI',generating:'AI is preparing the response',receiving:'Receiving the AI response',completed:'AI response received',failed:'Request stopped',canceled:'Request canceled'};
function readActivity(value:unknown,requestId:string):Activity|undefined {
 if(!value||typeof value!=='object')return;
 const v=value as Partial<Activity>;
 if(v.requestId!==requestId||!['running','completed','failed','canceled'].includes(v.status??'')||!Object.hasOwn(phases,v.phase??'')||!v.startedAt||!v.updatedAt||!Number.isFinite(Date.parse(v.startedAt))||!Number.isFinite(Date.parse(v.updatedAt))||!Array.isArray(v.events))return;
 const events=v.events.filter(e=>e&&typeof e.at==='string'&&Number.isFinite(Date.parse(e.at))&&Object.hasOwn(phases,e.phase)&&typeof e.message==='string').slice(-64).map(e=>({...e,message:e.message.slice(0,600)}));
 return{requestId,status:v.status!,phase:v.phase!,startedAt:v.startedAt,updatedAt:v.updatedAt,events,...(Number.isSafeInteger(v.outputCharacters)&&v.outputCharacters!>=0?{outputCharacters:v.outputCharacters}:{}),reasoningSummaryAvailable:v.reasoningSummaryAvailable===true,...(v.reasoningSummaryAvailable===true&&typeof v.reasoningSummary==='string'?{reasoningSummary:v.reasoningSummary.slice(0,4000)}:{})};
}
/** Fetch only while the learner deliberately opens the panel. These are reported
 * lifecycle events, never simulated thinking or a guessed completion percentage. */
export default function AIActivityPanel({receipt,running}:{receipt?:AIUsageReceipt;running:boolean}){
 const [open,setOpen]=useState(false),[activity,setActivity]=useState<Activity>(),[notice,setNotice]=useState('');
 const requestId=receipt?.id;
 useEffect(()=>{
  setActivity(undefined);setNotice('');
  if(!open||!requestId)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  const stoppedPollDeadline=Date.now()+30000;
  const poll=async()=>{
   let finished=false;
   try{
    const response=await fetch(`/api/generate/status/${encodeURIComponent(requestId)}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),cache:'no-store'});
    if(stopped)return;
    if(response.status===404){setNotice('Live details are unavailable for this request. Your saved creation activity is still available above.');}
    else if(!response.ok){setNotice('Live activity is temporarily unavailable. This does not stop creation.');}
    else{const next=readActivity(await response.json(),requestId);if(stopped)return;if(next){setActivity(next);setNotice('');finished=next.status!=='running';}else setNotice('The provider did not return readable activity details.');}
   }catch{if(!stopped)setNotice('Live activity is temporarily unavailable. This does not stop creation.');}
   if(!stopped&&!finished){
    if(running||Date.now()<stoppedPollDeadline)timer=setTimeout(poll,1500);
    else setNotice('Creation is stopped. The provider’s final status could not be confirmed.');
   }
  };
  void poll();return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);};
 },[open,requestId,running]);
 return <details className="ai-activity-panel" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>AI activity <span>See what’s happening</span></summary>
  {open&&<div className="ai-activity-content">
   <p className="ai-activity-model">{receipt?`${receipt.model} · ${receipt.stage==='direction'?'Choosing the story and sound':receipt.stage==='plan'?'Planning':receipt.stage==='write'?'Writing a mission':receipt.stage==='check'?'Checking source support':receipt.stage}`:'Preparing the first request'}</p>
   <p role="status">{notice||(activity?(activity.status==='running'&&!running?'Creation is no longer running. Checking the provider’s final status…':phases[activity.phase]):'Loading reported activity…')}</p>
   {activity&&<>{(notice||activity.status==='running'&&!running)&&<p>Last reported: {phases[activity.phase]} at {new Date(activity.updatedAt).toLocaleTimeString()}.</p>}<dl><div><dt>Request time</dt><dd>{Math.max(0,Math.round(((activity.status==='running'&&running&&!notice?Date.now():Date.parse(activity.updatedAt))-Date.parse(activity.startedAt))/1000))} seconds</dd></div>{activity.outputCharacters!==undefined&&<div><dt>Response received</dt><dd>{activity.outputCharacters.toLocaleString()} characters</dd></div>}</dl><ol>{activity.events.map((event,index)=><li key={`${event.at}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}</time><span>{event.message}</span></li>)}</ol>{activity.reasoningSummary&&<section aria-label="Provider reasoning summary"><strong>Provider reasoning summary</strong><p>{activity.reasoningSummary}</p></section>}</>}
   <small>{activity?.reasoningSummaryAvailable?'Any reasoning summary shown is supplied by your provider.':'This connection does not expose a public reasoning summary. These are reported request events, not the AI’s private thinking.'} A received response still needs the game’s validation and save checks.</small>
  </div>}
 </details>;
}
