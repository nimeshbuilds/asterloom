import {useEffect,useState,type CSSProperties} from 'react';
import {ArrowDown,ArrowUp,ArrowRight,GripVertical,Play,Pause,RotateCcw,Route} from 'lucide-react';
import type {SequenceActivity} from '../lib/structuredEngine';
import {worldForScaffold,worldPalette} from '../data/worlds';
import {gameActionFeedback} from '../lib/music';
import './sequence-workshop.css';

/** Route construction uses the source's actual steps. Tracing previews the learner's model, never an invented simulation. */
export default function SequenceWorkshop({activity,order,onChange,scaffoldId,theme='islands',ageGroup='adult',paused=false}:{activity:SequenceActivity;order:string[];onChange:(next:{order:string[]})=>void;scaffoldId?:string;theme?:string;ageGroup?:string;paused?:boolean}){
 const [selected,setSelected]=useState(''),[trace,setTrace]=useState(-1),[announcement,setAnnouncement]=useState(''),[running,setRunning]=useState(false);
 const palette=worldPalette(theme,ageGroup),world=worldForScaffold(scaffoldId);
 useEffect(()=>{setTrace(-1);setRunning(false);},[JSON.stringify(order)]);
 useEffect(()=>{const pause=()=>{if(document.hidden)setRunning(false);};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
 useEffect(()=>{if(paused)setRunning(false);},[paused]);
 useEffect(()=>{
  if(!running||paused)return;
  const timer=window.setTimeout(()=>{
   if(trace>=order.length-1){setRunning(false);setAnnouncement('Route preview finished. Check my work compares this arrangement with the source.');return;}
   const next=trace+1;setTrace(next);gameActionFeedback('inspect',scaffoldId,ageGroup);setAnnouncement(`Preview station ${next+1}: ${activity.items.find(item=>item.id===order[next])?.label}.`);
  },1800);
  return()=>window.clearTimeout(timer);
 },[running,paused,trace,order.length,scaffoldId,ageGroup]);
 const move=(id:string,to:number)=>{const from=order.indexOf(id);if(from<0||from===to)return;const next=order.filter(x=>x!==id);next.splice(to,0,id);onChange({order:next});setSelected(id);setAnnouncement(`${activity.items.find(x=>x.id===id)?.label} moved to station ${to+1}.`);};
 const select=(id:string)=>{if(selected!==id)gameActionFeedback('select',scaffoldId,ageGroup);setSelected(id);};
 const advance=()=>{setRunning(false);const next=trace+1;if(next>=order.length){setTrace(-1);return;}setTrace(next);gameActionFeedback('inspect',scaffoldId,ageGroup);setAnnouncement(`Trace station ${next+1}: ${activity.items.find(x=>x.id===order[next])?.label}. This previews your current route.`);};
 return <section className="sequence-workshop structured-sequence" aria-label="Process route workshop" style={{'--route-accent':palette.accent,'--route-paper':palette.paper,'--route-sky':palette.sky,'--route-ink':palette.ink,'--route-on-accent':['adult','15-17'].includes(ageGroup)?palette.sky:'#ffffff'} as CSSProperties}>
  <div className="route-intro"><span className="route-emblem"><Route size={29}/></span><div><span className="route-kicker">{world.name} · ROUTE WORKSHOP</span><h3>Build a route that works.</h3><p>These are steps from your material. Drag a step to a new station, or select it and choose a destination. Trace your route before checking it.</p></div></div>
  <div className="route-toolbar"><span>{order.length} stations · {selected?'Choose a destination':'Select or drag a step'}</span><div className="route-playback"><button type="button" aria-pressed={running} onClick={()=>{if(running){setRunning(false);return;}setTrace(0);setRunning(true);gameActionFeedback('inspect',scaffoldId,ageGroup);}}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'Pause route':'Play route'}</button><button type="button" onClick={advance}>{trace<0?<Play size={15}/>:trace===order.length-1?<RotateCcw size={15}/>:<ArrowRight size={15}/>} {trace<0?'Trace my route':trace===order.length-1?'Reset trace':'Next station'}</button></div></div>
  <div className="route-flightline" aria-label="Route preview progress">{order.map((id,index)=><div key={id} data-visited={trace>=index} data-current={trace===index}><span>{index+1}</span><i/></div>)}</div>
  <ol className="route-stations">{order.map((id,index)=>{const item=activity.items.find(x=>x.id===id)!;return <li key={id} className={`route-station${selected===id?' selected':''}${trace===index?' tracing':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(e.dataTransfer.getData('application/asterloom-step'),index);}}>
   <div className="route-station-marker"><span>{String(index+1).padStart(2,'0')}</span><small>{index===0?'START':index===order.length-1?'FINISH':'STATION'}</small></div>
   <button type="button" className="route-step" draggable onDragStart={e=>{e.dataTransfer.setData('application/asterloom-step',id);e.dataTransfer.effectAllowed='move';select(id);}} onClick={()=>select(id)} aria-pressed={selected===id} aria-label={`Select step ${item.label}`}><GripVertical size={16}/><strong>{item.label}</strong></button>
   <div className="route-controls"><button type="button" disabled={!selected||selected===id} onClick={()=>move(selected,index)} aria-label={`Move selected step to station ${index+1}`}>Place here</button><button type="button" disabled={index===0} aria-label={`Move ${item.label} up`} onClick={()=>move(id,index-1)}><ArrowUp size={16}/></button><button type="button" disabled={index===order.length-1} aria-label={`Move ${item.label} down`} onClick={()=>move(id,index+1)}><ArrowDown size={16}/></button></div>
  </li>;})}</ol>
  {trace>=0&&<div className="route-trace"><span className="route-traveler" aria-hidden="true"><Route size={21}/></span><div><span className="route-kicker">TRACE · {trace+1} OF {order.length}</span><strong>{activity.items.find(x=>x.id===order[trace])?.label}</strong><p>{trace===0?'This is where your process begins.':`Following: ${activity.items.find(x=>x.id===order[trace-1])?.label}`}</p><small>A preview of your arrangement. Use Check my work to evaluate the source's ordering requirements.</small></div></div>}
  <p className="route-announcement" role="status">{announcement||'Your arrangement is saved as you build. Multiple valid routes are accepted when the source permits them.'}</p>
 </section>;
}
