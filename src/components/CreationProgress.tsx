import {gameCreationRecovery,gameCreationReview} from '../lib/gameCreationRecovery';
import {useEffect,useState} from 'react';
import AIActivityPanel from './AIActivityPanel';
import {CheckCircle2,Clock3,LoaderCircle} from 'lucide-react';
import {gameDesignProgress,type GameDesign} from '../lib/gameDesign';

const phaseNames={plan:'Planning your journey',write:'Building lessons and missions',check:'Checking source support',finish:'Saving your game'};
export default function CreationProgress({design,running,ready,stage,notice,stopping,saving,onPause,onCancel}:{design?:GameDesign;running:boolean;ready:boolean;stage:string;notice?:string;stopping?:'pause'|'cancel'|null;saving?:boolean;onPause:()=>void;onCancel:()=>void}){
 const [now,setNow]=useState(Date.now),[started,setStarted]=useState(Date.now);
 useEffect(()=>{if(!running)return;setStarted(Date.now());setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running]);
 if(!design&&!running)return null;
 const recovery=gameCreationRecovery(design);
 const progress=design?gameDesignProgress(design):undefined;
 const lastEvent=design?.events?.at(-1),latestReceipt=design?.receipts.at(-1);
 const issue=!running&&!ready&&!design?.control&&lastEvent?.kind==='failed'?lastEvent:undefined;
 const activeReceipt=running&&latestReceipt?.status==='started'&&Date.parse(latestReceipt.startedAt)>=started-1000?latestReceipt:undefined;
 const elapsed=Math.max(0,Math.floor((now-(activeReceipt?Date.parse(activeReceipt.startedAt):started))/1000));
 const time=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
 const needsRecovery=recovery.unitCount>0;
 const noMissions=!running&&!ready&&design?.status==='ready'&&progress?.missionCount===0;
 const rejected=noMissions?gameCreationReview(design):[];
 const percent=ready&&!needsRecovery||noMissions&&!needsRecovery?100:Math.min(99,progress?.percent??0);
 const heading=saving?'Saving your creation…':stopping?(stopping==='pause'?'Pausing creation…':'Canceling creation…'):!running&&design?.control==='paused'?'Creation is paused':!running&&design?.control==='canceled'?'Creation is canceled':!running&&needsRecovery?'Some sections need another creation attempt':ready?'Your game is saved':running?(stage||phaseNames[progress?.currentPhase??'plan']):issue?'Creation needs attention':rejected.length?'No mission passed review':noMissions?'Source review is finished':'Your creation progress is saved';
 const recent=design?.events?.slice(-12).reverse()??[];
 return <section className={`creation-progress${issue?' creation-needs-attention':''}`} aria-label="Game creation status">
  <div className="creation-progress-title">{ready?<CheckCircle2 size={18}/>:running?<LoaderCircle size={18} className="spin"/>:<Clock3 size={18}/>}<strong>{heading}</strong></div>
  <div className="creation-percent"><span>{needsRecovery?'Saved source review':noMissions?'Source review completed':'Saved creation work'}</span><strong aria-hidden="true">{needsRecovery?`${recovery.unitCount} ${recovery.unitCount===1?'section needs':'sections need'} retry`:rejected.length?'0 playable missions':`${percent}%`}</strong></div>
  {!needsRecovery&&!rejected.length&&<progress aria-label="Game creation progress" max={100} value={percent}/>}
  <p className="creation-progress-detail">{needsRecovery?`${progress?.coveredUnits??0} of ${progress?.totalUnits??0} source sections were reviewed. A playable game has not been completed from these failed sections.`:progress?`${progress.completedSteps} of ${progress.totalSteps} preparation steps saved · ${progress.coveredUnits} of ${progress.totalUnits} source sections checked.`:'Organizing your material before counting the preparation steps.'}</p>
  {running?<><p className="creation-current" role="status">{activeReceipt?`Waiting for ${activeReceipt.model} · ${time}`:`Working · ${time}`}<span>{saving?'Saving the creation result on this device…':stopping?'Stopping the active request and saving your completed work…':'Each completed step is saved. Pause to change AI or model; cancel to stop this run.'}</span></p><div className="button-row"><button className="button secondary" disabled={!!stopping||saving} onClick={onPause}>Pause creation</button><button className="text-button" disabled={!!stopping||saving} onClick={onCancel}>Cancel creation</button></div></>:issue?<p className="creation-issue" role="status">{issue.message}</p>:!ready&&!needsRecovery&&<p className="creation-current" role="status">{notice||(rejected.length?`Mission review: ${rejected[0].reason} Your source, drafts and usage records are kept.`:undefined)||(design?.control==='paused'?'Your completed work is saved. You can change AI or model below, then choose Resume creation.':design?.control==='canceled'?'This run has stopped. Your sources and completed work are kept. Resume creation starts only when you choose it.':noMissions?'The source review finished, but this material did not support a playable mission. Add a concrete example, procedure or relationship to continue.':latestReceipt?.status==='started'?'The previous request was interrupted. Its completion could not be confirmed.':'You can resume from the saved work below.')}</p>}
  {!running&&recovery.unitCount>0&&<p className="creation-issue" role="status">The earlier AI responses failed validation for {recovery.unitCount} source sections. This does not mean your material cannot make a game. Choose an AI/model, then Retry failed sections. Other saved decisions and all usage records stay kept.</p>}
  {latestReceipt&&<AIActivityPanel receipt={latestReceipt} running={running}/>}
  {!needsRecovery&&!rejected.length&&<small className="creation-progress-note">Progress counts completed work, not elapsed time. A step advances after its result is checked and saved. A playable game reaches 100% after its final save.</small>}
  {recent.length>0&&<details className="creation-history"><summary>Creation activity · {recent.length} recent events</summary><ol>{recent.map(event=><li key={event.id} data-kind={event.kind}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time><span>{event.message}</span></li>)}</ol></details>}
 </section>;
}
