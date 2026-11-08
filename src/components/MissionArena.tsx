import {useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight,Box,Check,Compass,Database,GitBranch,Layers,Leaf,Maximize2,Minimize2,Radio,RotateCcw,ScanLine,Theater} from 'lucide-react';
import {getAgePresentation,worldForScaffold,type SceneLayout} from '../data/worlds';
import {worldArtworkFor} from '../lib/worldArtwork';
import {worldBackdropMarkup} from '../lib/worldIllustration';
import type {SceneAction,SceneSnapshot} from '../lib/worldScene';
import {useWorldArtwork} from './useWorldArtwork';
import {resolveGameAudioDirection,type GameAudioDirection} from '../lib/gameArtDirection';
import type {SceneFeedbackEvent} from '../lib/sceneFeedback';
import SceneEventEffects from './SceneEventEffects';
import './mission-arena.css';

const families:Record<SceneLayout,{label:string;verb:string;icon:typeof Compass}>={
 trail:{label:'Expedition route',verb:'Choose a step to work on your route.',icon:Compass},
 network:{label:'Connection field',verb:'Inspect a concept and its current connections.',icon:GitBranch},
 workbench:{label:'Assembly deck',verb:'Choose a piece to work with.',icon:Box},
 console:{label:'Command station',verb:'Select a signal to inspect your options.',icon:Radio},
 archive:{label:'Evidence desk',verb:'Open a record to examine it.',icon:Database},
 garden:{label:'Discovery clearing',verb:'Choose something to explore.',icon:Leaf},
 stage:{label:'Story stage',verb:'Choose a part of your story.',icon:Theater},
};
export interface MissionArenaProps {
 scaffoldId:string;theme?:string;ageGroup?:string;snapshot:SceneSnapshot;selectedId:string;
 onSelect:(id:string)=>void;actions:SceneAction[];onAction:(action:SceneAction)=>void;
 sorting?:{categories:{id:string;label:string}[];assignments:Record<string,string[]>;checked?:{event:number;details:{id:string;correct:boolean|null;message:string}[]}};
 mode?:'play'|'backdrop';actionFeedback?:SceneFeedbackEvent;artDirection?:GameAudioDirection;activityKind?:string;storySetting?:string;feedback?:{event:number;outcome:'complete'|'retry'|'reflection'};
}
/** An accessible scene for the learner's actual response. Selection and allocation
 * are work-in-progress, never correctness. Rewards arrive only after durable commit. */
export default function MissionArena({scaffoldId,theme='islands',ageGroup='adult',snapshot,selectedId,onSelect,actions,onAction,feedback,actionFeedback,artDirection,activityKind,storySetting,sorting,mode='play'}:MissionArenaProps){
 const playable=mode==='play';
 const world=worldForScaffold(scaffoldId),family=families[world.layout],Icon=family.icon,age=getAgePresentation(ageGroup);
 const art=worldArtworkFor(world,ageGroup,storySetting),artStatus=useWorldArtwork(art.assetPath),id=useId();
 const [expanded,setExpanded]=useState(true),[page,setPage]=useState(0),[moveAnnouncement,setMoveAnnouncement]=useState('');
 const selected=snapshot.nodes.find(node=>node.id===selectedId),pages=Math.max(1,Math.ceil(snapshot.nodes.length/6));
 const currentPage=Math.min(page,pages-1),nodes=snapshot.nodes.slice(currentPage*6,currentPage*6+6);
 const positions=useMemo(()=>new Map(nodes.map((node,index)=>[node.id,{x:nodes.length===1?50:nodes.length===2?28+index*44:18+(world.layout==='trail'&&index>=3?2-index%3:index%3)*32,y:nodes.length<=3?55:33+Math.floor(index/3)*43}])),[nodes.map(node=>node.id).join('|'),world.layout]);
 const backdrop=useMemo(()=>worldBackdropMarkup(world,theme,ageGroup),[world,theme,ageGroup]);
 const selectedLinks=selected?snapshot.links.filter(link=>link.from===selected.id||link.to===selected.id):[];
 const dispatchIntent=useRef<{objectId:string;categoryId:string}|undefined>(undefined),[routeCue,setRouteCue]=useState<{event:number;objectId:string;categoryId:string;kind:string}>();
 const choose=(nodeId:string)=>{setRouteCue(undefined);onSelect(nodeId);};
 const act=(action:SceneAction)=>{if(action.id==='category'&&action.value)dispatchIntent.current={objectId:action.objectId,categoryId:action.value};onAction(action);const label=snapshot.nodes.find(node=>node.id===action.objectId)?.label??'';setMoveAnnouncement(`${label}. ${action.label}. Check your work for feedback.`);};
 const result=feedback&&feedback.event>0?feedback:undefined;
 const effectProfile=resolveGameAudioDirection(artDirection,{scaffoldId,ageGroup,theme,activityKind})?.effectProfileId??scaffoldId;
 const visual=result?{event:result.event,kind:result.outcome}:actionFeedback;
 const sortingScene=playable&&sorting;
 const placedCount=sorting?snapshot.nodes.filter(node=>sorting.assignments[node.id]?.length).length:0;
 const dispatchRef=useRef<HTMLDivElement>(null),payloadRef=useRef<HTMLDivElement>(null),terminalRefs=useRef(new Map<string,HTMLElement>());
 const [routes,setRoutes]=useState<{id:string;path:string}[]>([]);
 useLayoutEffect(()=>{const intent=dispatchIntent.current;if(!intent||!actionFeedback?.event||!['place','remove'].includes(actionFeedback.kind))return;setRouteCue({...intent,event:actionFeedback.event,kind:actionFeedback.kind});dispatchIntent.current=undefined;},[actionFeedback?.event,actionFeedback?.kind]);
 const checkedItem=selected&&sorting?.checked?.details.find(item=>item.id===selected.id);
 const nextPiece=snapshot.nodes.find(node=>node.id!==selectedId&&!sorting?.assignments[node.id]?.length);
 useLayoutEffect(()=>{
  const field=dispatchRef.current,payload=payloadRef.current;if(!sortingScene||!expanded||!field||!payload){setRoutes([]);return;}
  const measure=()=>{
   const origin=field.getBoundingClientRect(),start=payload.getBoundingClientRect();
   const next=sorting.categories.flatMap(category=>{const target=terminalRefs.current.get(category.id);if(!target)return[];const end=target.getBoundingClientRect();const x=start.right-origin.left,y=start.top+start.height/2-origin.top,tx=end.left-origin.left,ty=end.top+Math.min(42,end.height/2)-origin.top;return[{id:category.id,path:`M ${x} ${y} C ${x+24} ${y}, ${tx-24} ${ty}, ${tx} ${ty}`}];});
   setRoutes(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(field);observer.observe(payload);terminalRefs.current.forEach(node=>observer.observe(node));
  return()=>observer.disconnect();
 },[!!sortingScene,expanded,selectedId,JSON.stringify(sorting?.assignments),sorting?.checked?.event,snapshot.nodes.length]);
 return <section className={`mission-arena arena-family-${world.layout} arena-age-${age.density}${playable?'':' arena-backdrop-only'}${sortingScene?' arena-sorting':''}${expanded?'':' arena-collapsed'}`} aria-label={`${art.name}: mission arena`} data-scaffold={scaffoldId} data-world-art={art.id} data-art-status={artStatus}>
  <header className="arena-heading"><div><Icon size={17}/><span>{family.label}</span></div><button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded} aria-controls={`${id}-stage`}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{expanded?'Compact scene':'Open scene'}</span></button></header>
  <div className="arena-stage" id={`${id}-stage`} hidden={!expanded}>
   <svg className="arena-vector" viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g dangerouslySetInnerHTML={{__html:backdrop}}/></svg>
   {artStatus==='ready'&&<img className="arena-environment" src={art.assetPath} alt="" aria-hidden="true" draggable={false}/>}
   <div className="arena-scrim" aria-hidden="true"/>
   <div className="arena-location"><span>MISSION LOCATION</span><h3>{art.name}</h3></div>
   {sortingScene?<div className="arena-sort-field" ref={dispatchRef}>
    <svg className="arena-dispatch-routes" aria-hidden="true">{routes.map(route=>{const connected=!!selected&&sorting.assignments[selected.id]?.includes(route.id);return <g key={route.id} data-route={route.id} data-connected={connected?'true':'false'}><path className="arena-route-rail" d={route.path}/><path className="arena-route-signal" d={route.path}/>{routeCue?.objectId===selectedId&&routeCue.categoryId===route.id&&<path key={routeCue.event} className={`arena-route-transfer ${routeCue.kind==='remove'?'is-returning':''}`} d={route.path} pathLength={1}/>}</g>;})}</svg>
    <div className="arena-sort-tray" role="group" aria-label="Source pieces"><div className="arena-tray-heading"><Layers size={15}/><span>Source pieces</span><small>{placedCount} / {snapshot.nodes.length} placed</small></div>{snapshot.nodes.map((node,index)=>{const check=sorting.checked?.details.find(item=>item.id===node.id);return <button type="button" key={node.id} className={`arena-piece arena-sort-piece${selectedId===node.id?' arena-piece-selected':''}${sorting.assignments[node.id]?.length?' arena-piece-placed':''}`} data-check={check?.correct===true?'correct':check?.correct===false?'retry':undefined} aria-pressed={selectedId===node.id} draggable onDragStart={event=>{event.dataTransfer.setData('application/asterloom-arena-piece',node.id);event.dataTransfer.effectAllowed='copy';choose(node.id);}} onClick={()=>choose(node.id)}><span className="arena-piece-marker"><span>{String(index+1).padStart(2,'0')}</span><small>{check?.correct===true?<><Check size={11} aria-hidden="true"/> Checked</>:check?.correct===false?<><RotateCcw size={11} aria-hidden="true"/> Revisit</>:sorting.assignments[node.id]?.length?`${sorting.assignments[node.id].length} group${sorting.assignments[node.id].length===1?'':'s'}`:'In tray'}</small></span><strong>{node.label}</strong></button>;})}</div>
    <div className="arena-dispatch-platform">
     <div className="arena-payload" role="group" aria-label={selected&&expanded?'Selected scene piece':undefined} ref={payloadRef} data-state={selected?'loaded':'empty'} data-check={checkedItem?.correct===true?'correct':checkedItem?.correct===false?'retry':undefined}>
      <div className="arena-payload-gantry" aria-hidden="true"><span/><ScanLine size={22}/><span/></div>
      <span className="arena-payload-caption">{selected?'ON THE DISPATCH DECK':'READY TO INSPECT'}</span>
      {selected?<><div className="arena-payload-core" key={selected.id}><span className="arena-payload-number" aria-hidden="true">{String(snapshot.nodes.findIndex(node=>node.id===selected.id)+1).padStart(2,'0')}</span><strong>{selected.label}</strong></div><div className="arena-payload-route-state"><span>{sorting.assignments[selected.id]?.length?'Your current destinations':'Choose its destination'}</span><p>{sorting.assignments[selected.id]?.length?sorting.categories.filter(category=>sorting.assignments[selected.id]?.includes(category.id)).map(category=>category.label).join(' · '):'Inspect the piece, then place it in each group that applies.'}</p></div></>:<div className="arena-payload-empty"><Box size={42} aria-hidden="true"/><strong>Every piece has a place.</strong><p>Choose a piece from the rack to inspect and route it.</p>{snapshot.nodes[0]&&<button type="button" onClick={()=>choose(snapshot.nodes[0].id)}>Inspect first piece <ArrowRight size={15}/></button>}</div>}
      {checkedItem&&checkedItem.correct!==null&&<div className={`arena-payload-check ${checkedItem.correct?'is-correct':'needs-retry'}`} role="status"><strong>{checkedItem.correct?<><Check size={15}/> Placements checked</>:<><RotateCcw size={15}/> Revisit this piece</>}</strong><p>{checkedItem.message}</p></div>}
     </div>
     <div className="arena-platform-base" aria-hidden="true"><span/><span/><span/></div>
     {selected&&nextPiece&&<button type="button" className="arena-next-piece" onClick={()=>choose(nextPiece.id)}>Inspect next unplaced piece <ArrowRight size={14}/></button>}
    </div>
    <div className="arena-terminal-field" role="group" aria-label="Source category terminals"><p className="arena-terminal-instruction">{selected?<>Route <strong>{selected.label}</strong> to its groups.</>:'Destination bays · select a piece or drag it here'}</p><div className="arena-terminals">{sorting.categories.map((category,index)=>{
     const action=actions.find(candidate=>candidate.id==='category'&&candidate.value===category.id),placed=snapshot.nodes.filter(node=>sorting.assignments[node.id]?.includes(category.id)),contains=!!selected&&sorting.assignments[selected.id]?.includes(category.id);
     return <section ref={node=>{if(node)terminalRefs.current.set(category.id,node);else terminalRefs.current.delete(category.id);}} className={`arena-terminal${contains?' contains-selected':''}`} key={category.id} data-category-id={category.id} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDrop={event=>{event.preventDefault();const objectId=event.dataTransfer.getData('application/asterloom-arena-piece');if(snapshot.nodes.some(node=>node.id===objectId)&&!sorting.assignments[objectId]?.includes(category.id))act({id:'category',objectId,value:category.id,label:`Place in ${category.label}`});}} aria-labelledby={`${id}-category-${category.id}`}><div className="arena-bay-id" aria-hidden="true"><span className="arena-terminal-signal"/>BAY {String(index+1).padStart(2,'0')}<span>{placed.length} placed</span></div><div className="arena-terminal-heading"><h4 id={`${id}-category-${category.id}`}>{category.label}</h4></div><button type="button" className="arena-terminal-action" disabled={!action||action.disabled} onClick={()=>action&&act(action)}>{contains?<RotateCcw size={15}/>:<ArrowRight size={15}/>}{contains?'Remove from':'Place in'} {category.label}</button><ul aria-label={`${category.label} placements`}>{placed.map(node=><li key={node.id}><button type="button" className="arena-docked-piece" aria-pressed={selectedId===node.id} onClick={()=>choose(node.id)}><Box size={12} aria-hidden="true"/><span>{node.label}</span></button></li>)}</ul>{!placed.length&&<div className="arena-empty-dock" aria-hidden="true"><span/><span/><span/></div>}</section>;
    })}</div></div>
   </div>:<div className="arena-field" data-rows={nodes.length>3?2:1} aria-label="Your working pieces" hidden={!playable}>
    <svg className="arena-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={`${id}-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 7 3.5, 0 7" fill="var(--arena-accent)"/></marker></defs>{snapshot.links.map((link,index)=>{const a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)return null;const dx=b.x-a.x,dy=b.y-a.y,scale=Math.min(14/Math.max(.01,Math.abs(dx)),18/Math.max(.01,Math.abs(dy))),from={x:a.x+dx*scale,y:a.y+dy*scale},to={x:b.x-dx*scale,y:b.y-dy*scale};return <path key={`${link.from}-${link.to}-${index}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} markerEnd={`url(#${id}-arrow)`} vectorEffect="non-scaling-stroke"/>;})}</svg>
    {nodes.map((node,index)=>{const position=positions.get(node.id)!;return <button type="button" key={node.id} className={`arena-piece${selectedId===node.id?' arena-piece-selected':''}`} aria-pressed={selectedId===node.id} onClick={()=>choose(node.id)} style={{'--piece-x':`${position.x}%`,'--piece-y':`${position.y}%`,'--piece-index':index} as CSSProperties}>
      <span className="arena-piece-marker"><Icon size={20}/><span>{String(currentPage*6+index+1).padStart(2,'0')}</span></span><strong>{node.label}</strong><small>{node.quantity!==undefined?`${node.quantity} allocated`:node.detail}</small>
     </button>;})}
    {!nodes.length&&<div className="arena-empty"><Icon size={38}/><strong>Your world is ready</strong><span>Use the workspace below to bring it to life.</span></div>}
   </div>}

   {visual&&visual.event>0&&<div className={result?`arena-result-flare arena-result-${result.outcome}`:'arena-action-effect'}><SceneEventEffects kind={visual.kind} scaffoldId={effectProfile} ageGroup={ageGroup} eventKey={`${result?'result':'action'}:${visual.event}`} surface="scene"/></div>}
   <div className="arena-world-label">Fictional setting · your source-based work</div>
  </div>
  <p className="sr-only" role="status" aria-live="polite">{moveAnnouncement}</p>
  <div className="arena-console" hidden={!playable}>
   <div className="arena-readout"><span className="arena-readout-light" aria-hidden="true"/><p>{sortingScene?sorting.checked?.details.length?sorting.checked.details.some(item=>item.correct===false)?'Some pieces need another look. Choose a marked piece to inspect its feedback.':'Your placements have been checked. Inspect any piece, or revise and check again.':'Your placements are a working idea. Check your work when you are ready.':snapshot.summary}</p>{!sortingScene&&pages>1&&<nav className="arena-pagination" aria-label="Scene pages"><button type="button" aria-label="Previous scene pieces" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ArrowLeft size={16}/></button><span>{currentPage+1} / {pages}</span><button type="button" aria-label="Next scene pieces" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}><ArrowRight size={16}/></button></nav>}</div>
   {snapshot.metrics.length>0&&<dl className="arena-meters">{snapshot.metrics.map((metric,index)=><div key={index}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>}
   {selected?<div className="arena-command" role="group" aria-label={sortingScene&&expanded?undefined:'Selected scene piece'}><div className="arena-command-copy"><span>SELECTED PIECE</span><strong>{selected.label}</strong><p>{selected.detail}</p>{selectedLinks.length>0&&<ul className="arena-connections" aria-label="Your current connections">{selectedLinks.map((link,index)=><li key={index}><GitBranch size={14}/><span>{link.from===selected.id?'To: ':'From: '}{snapshot.nodes.find(node=>node.id===(link.from===selected.id?link.to:link.from))?.label}{link.label?` · ${link.label}`:''}</span></li>)}</ul>}</div>{actions.length>0&&(!sortingScene||!expanded)?<div className="arena-command-actions">{actions.map(action=><button type="button" key={`${action.id}-${action.value??''}`} disabled={action.disabled} onClick={()=>act(action)}><ArrowRight size={15}/>{action.label}</button>)}</div>:!sortingScene&&<p className="arena-continue">Use the task controls below to change this part of your model.</p>}</div>:!sortingScene&&<p className="arena-prompt"><Icon size={16}/>{family.verb} Selections do not show whether an answer is correct.</p>}
  </div>
 </section>;
}
