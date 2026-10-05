import {useEffect,useState} from 'react';
import AIActivityPanel from './AIActivityPanel';
import {CheckCircle2,Clock3,LoaderCircle} from 'lucide-react';
import {gameDesignProgress,type GameDesign} from '../lib/gameDesign';

const phaseNames={plan:'Planning your journey',write:'Building lessons and missions',check:'Checking source support',finish:'Saving your game'};
export default function CreationProgress({design,running,ready,stage,notice,onCancel}:{design?:GameDesign;running:boolean;ready:boolean;stage:string;notice?:string;onCancel:()=>void}){
 const [now,setNow]=useState(Date.now),[started,setStarted]=useState(Date.now);
 useEffect(()=>{if(!running)return;setStarted(Date.now());setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running]);
 if(!design&&!running)return null;
 const progress=design?gameDesignProgress(design):undefined;
 const lastEvent=design?.events?.at(-1),latestReceipt=design?.receipts.at(-1);
 const issue=!running&&!ready&&lastEvent?.kind==='failed'?lastEvent:undefined;
 const activeReceipt=running&&latestReceipt?.status==='started'&&Date.parse(latestReceipt.startedAt)>=started-1000?latestReceipt:undefined;
 const elapsed=Math.max(0,Math.floor((now-(activeReceipt?Date.parse(activeReceipt.startedAt):started))/1000));
 const time=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
 const noMissions=!running&&!ready&&design?.status==='ready'&&progress?.missionCount===0;
 const percent=ready||noMissions?100:Math.min(99,progress?.percent??0);
 const heading=ready?'Your game is saved':running?(stage||phaseNames[progress?.currentPhase??'plan']):issue?'Creation needs attention':noMissions?'More source detail is needed':'Your creation progress is saved';
 const recent=design?.events?.slice(-12).reverse()??[];
 return <section className={`creation-progress${issue?' creation-needs-attention':''}`} aria-label="Game creation status">
  <div className="creation-progress-title">{ready?<CheckCircle2 size={18}/>:running?<LoaderCircle size={18} className="spin"/>:<Clock3 size={18}/>}<strong>{heading}</strong></div>
  <div className="creation-percent"><span>{noMissions?'Source review completed':'Saved creation work'}</span><strong aria-hidden="true">{percent}%</strong></div>
  <progress aria-label="Game creation progress" max={100} value={percent}/>
  <p className="creation-progress-detail">{progress?`${progress.completedSteps} of ${progress.totalSteps} preparation steps saved · ${progress.coveredUnits} of ${progress.totalUnits} source sections checked.`:'Organizing your material before counting the preparation steps.'}</p>
  {running?<><p className="creation-current" role="status">{activeReceipt?`Waiting for ${activeReceipt.model} · ${time}`:`Working · ${time}`}<span>Creation continues automatically. No need to press Continue between steps.</span></p><button className="text-button" onClick={onCancel}>Cancel creation</button></>:issue?<p className="creation-issue" role="status">{issue.message}</p>:!ready&&<p className="creation-current" role="status">{notice||(noMissions?'The source review finished, but this material did not support a playable mission. Add a concrete example, procedure or relationship to continue.':latestReceipt?.status==='started'?'The previous request was interrupted. Its completion could not be confirmed.':'You can resume from the saved work below.')}</p>}
  {latestReceipt&&<AIActivityPanel receipt={latestReceipt} running={running}/>}
  <small className="creation-progress-note">Progress counts completed work, not elapsed time. A step advances after its result is checked and saved. A playable game reaches 100% after its final save.</small>
  {recent.length>0&&<details className="creation-history"><summary>Creation activity · {recent.length} recent events</summary><ol>{recent.map(event=><li key={event.id} data-kind={event.kind}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time><span>{event.message}</span></li>)}</ol></details>}
 </section>;
}
