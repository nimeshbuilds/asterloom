import {useId,useState,type CSSProperties} from 'react';
import {ArrowRight,Compass,LockKeyhole,Radio,ScanLine} from 'lucide-react';
import type {ScenarioActionAvailability,ScenarioActivity,ScenarioResponse,ScenarioSnapshot} from '../lib/scenarioEngine';
import {worldForScaffold} from '../data/worlds';
import {worldArtworkFor} from '../lib/worldArtwork';
import {useWorldArtwork} from './useWorldArtwork';
import SceneEventEffects from './SceneEventEffects';
import type {SceneFeedbackEvent} from '../lib/sceneFeedback';
import {resolveGameAudioDirection,type GameAudioDirection} from '../lib/gameArtDirection';
import './scenario-world.css';

interface Props {
 activity:ScenarioActivity;response:ScenarioResponse;snapshot:ScenarioSnapshot;
 choices:ScenarioActionAvailability[];disabled:boolean;onSelect:(id:string)=>void;onAct:()=>void;
 scaffoldId?:string;theme?:string;ageGroup?:string;
 storySetting?:string;artDirection?:GameAudioDirection;actionFeedback?:SceneFeedbackEvent;feedback?:{event:number;outcome:'complete'|'retry'|'reflection'};
}

/** A station represents an authored action, not a place invented by the model.
 * The paths are a record of decisions taken, never unobserved causal relations. */
export default function ScenarioWorld({activity,response,snapshot,choices,disabled,onSelect,onAct,scaffoldId,theme,ageGroup,actionFeedback,feedback,storySetting,artDirection}:Props){
 const id=useId(),world=worldForScaffold(scaffoldId??activity.scaffoldIds?.[0]);
 const art=worldArtworkFor(world,ageGroup,storySetting),artStatus=useWorldArtwork(art.assetPath);
 const [page,setPage]=useState(0),pages=Math.ceil(choices.length/6),pageIndex=Math.min(page,pages-1);
 const stations=choices.slice(pageIndex*6,pageIndex*6+6),selected=choices.find(choice=>choice.action.id===response.selectedActionId);
 const visible=activity.variables.filter(variable=>variable.visibility==='visible'),last=snapshot.history.at(-1);
 const points=stations.map((_,index)=>({x:18+(index%3)*32,y:stations.length<=3?52:29+Math.floor(index/3)*44}));
 const route=snapshot.history.slice(1).flatMap((entry,index)=>{const from=stations.findIndex(station=>station.action.id===snapshot.history[index].actionId),to=stations.findIndex(station=>station.action.id===entry.actionId);return from>=0&&to>=0?[{from,to}]:[];});
 const effectProfile=resolveGameAudioDirection(artDirection,{scaffoldId:scaffoldId??activity.scaffoldIds?.[0],ageGroup,theme,activityKind:'scenario'})?.effectProfileId??scaffoldId??activity.scaffoldIds?.[0];
 const stateText=(value:unknown)=>typeof value==='boolean'?value?'Yes':'Not yet':String(value);
 return <section className={`operation-world operation-${world.layout}`} aria-label="Interactive operation" data-phase={snapshot.phase}>
  <header className="operation-topline"><span><Radio size={16}/>LIVE OPERATION</span><strong>{art.name}</strong><span>Turn {snapshot.history.length} / {activity.maxSteps}</span></header>
  <div className="operation-layout">
   <div className="operation-scene">
    <img className="operation-world-art" src={artStatus==='ready'?art.assetPath:undefined} alt="" aria-hidden="true"/>
    <div className="operation-atmosphere" aria-hidden="true"/>
    <div className="operation-grid" aria-hidden="true"/>
    {(feedback?.event||actionFeedback?.event)?<div className="operation-event" aria-hidden="true"><SceneEventEffects scaffoldId={effectProfile} ageGroup={ageGroup} kind={feedback?.event?feedback.outcome:actionFeedback!.kind} eventKey={feedback?.event?`result:${feedback.event}`:`action:${actionFeedback!.event}`} surface="scene"/></div>:null}
    <div className="operation-map-caption"><span>YOUR OBJECTIVE</span><p>{activity.objectives.map(objective=>objective.label).join(' · ')}</p></div>
    <div className="operation-stations" role="group" aria-label="Action stations">
     <svg className="operation-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={`${id}-signal`}><stop stopColor="#5edec9"/><stop offset="1" stopColor="#e3bd7b"/></linearGradient></defs>{route.map((step,i)=>{const from=points[step.from],to=points[step.to];return <path key={i} d={`M${from.x} ${from.y} Q50 50 ${to.x} ${to.y}`} stroke={`url(#${id}-signal)`}/>;})}</svg>
     {stations.map(({action,available},index)=>{
      const uses=snapshot.history.filter(entry=>entry.actionId===action.id).length,chosen=selected?.action.id===action.id;
      return <button type="button" key={action.id} className={`operation-station${chosen?' is-selected':''}${uses?' is-visited':''}${available?'':' is-unavailable'}`} style={{'--station-x':`${points[index].x}%`,'--station-y':`${points[index].y}%`,'--station-index':index} as CSSProperties} aria-pressed={chosen} aria-label={`Inspect ${action.label}`} disabled={disabled} onClick={()=>onSelect(action.id)}>
       <span className="operation-station-art" aria-hidden="true"><svg viewBox="0 0 140 110"><ellipse cx="70" cy="89" rx="60" ry="18" className="station-shadow"/><path d="M12 70 70 44 128 70 70 98Z" className="station-platform"/><path d="M12 70 70 98 128 70 128 78 70 106 12 78Z" className="station-platform-edge"/><path d="M38 66V33L70 18 102 33V66L70 83Z" className="station-building"/><path d="M38 33 70 49 102 33 70 18Z" className="station-roof"/><path d="M70 49V83L102 66V33Z" className="station-side"/><path d="M44 42 62 51V61L44 52Z" className="station-screen"/><path d="M78 54 94 46M78 61 94 53M78 68 94 60" className="station-lights"/><path d="M70 18V6" className="station-antenna"/><circle cx="70" cy="6" r="4" className="station-beacon"/></svg><span className="station-number">{String(pageIndex*6+index+1).padStart(2,'0')}</span>{last?.actionId===action.id&&actionFeedback?.kind==='commit'&&actionFeedback.event>0&&<span className="station-pulse" key={last.step}/>}</span>
       <strong>{action.label}</strong><small>{uses?`${uses} / ${action.maxUses} uses · `:''}{available?`${action.cost} ${activity.budget.label}`:<><LockKeyhole size={10}/> Inspect status</>}</small>
      </button>;
     })}
    </div>
    <div className="operation-map-footer"><span>Paths show decisions already taken.</span>{pages>1&&<nav aria-label="Station pages"><button type="button" disabled={!pageIndex} onClick={()=>setPage(pageIndex-1)}>Previous</button><span>{pageIndex+1} / {pages}</span><button type="button" disabled={pageIndex+1===pages} onClick={()=>setPage(pageIndex+1)}>Next</button></nav>}</div>
   </div>
   <aside className="operation-inspector" aria-label="Station inspection">
    <div className="operation-budget"><span>{activity.budget.label} remaining</span><strong>{snapshot.remaining}<small> / {activity.budget.limit}</small></strong><meter min={0} max={activity.budget.limit} value={snapshot.remaining} aria-label={`${activity.budget.label} remaining`}/></div>
    {selected?<div className="operation-selected"><span className="operation-eyebrow">STATION {String(choices.indexOf(selected)+1).padStart(2,'0')}</span><h3>{selected.action.label}</h3><p>{selected.action.description}</p><div className="operation-action-cost"><span>Cost of this move</span><strong>{selected.action.cost} {activity.budget.label}</strong></div>{!selected.available&&<p className="operation-unavailable" role="status"><LockKeyhole size={15}/>{selected.reason}</p>}<button type="button" className="operation-execute" disabled={disabled||!selected.available} onClick={onAct}>Take this action <ArrowRight size={17}/></button></div>:<div className="operation-select-prompt"><ScanLine size={32}/><h3>{last?'What changed':'Your next decision'}</h3><p className="operation-last-consequence">{last?.consequence??activity.observations.find(observation=>snapshot.observationIds.includes(observation.id))?.text??'Select a station to inspect its action and cost.'}</p>{last&&<span className="operation-discovery">{last.revealed.length} new observation{last.revealed.length===1?'':'s'} · action {last.step}</span>}<p className="operation-next-step">{snapshot.phase==='active'?'Inspect a station to choose your next move.':'Open your evidence below, then support your conclusion.'}</p></div>}
    <span className="operation-fiction">Illustrated setting · source-defined simulation</span>
   </aside>
  </div>
  <div className="operation-telemetry" aria-label="Visible situation"><div className="operation-telemetry-label"><Compass size={17}/><span>Situation<br/><small>After your latest move</small></span></div>{visible.map(variable=>{const change=last?.changes.find(change=>change.field===variable.id),value=snapshot.state[variable.id];return <div key={variable.id} className={`operation-instrument${change?' changed':''}`}><span>{variable.label}</span><strong>{stateText(value)}</strong>{variable.type==='number'&&<meter aria-label={variable.label} min={variable.min} max={variable.max} value={Number(value)}/>}<small>{change?`${stateText(change.before)} → ${stateText(change.after)}`:'Current state'}</small></div>;})}</div>
 </section>;
}
