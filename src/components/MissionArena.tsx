import {useId,useMemo,useState,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight,Box,Compass,Database,GitBranch,Layers,Leaf,Maximize2,Minimize2,Radio,Theater} from 'lucide-react';
import {getAgePresentation,worldForScaffold,type SceneLayout} from '../data/worlds';
import {worldArtworkFor} from '../lib/worldArtwork';
import {worldBackdropMarkup} from '../lib/worldIllustration';
import type {SceneAction,SceneSnapshot} from '../lib/worldScene';
import {useWorldArtwork} from './useWorldArtwork';
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
 mode?:'play'|'backdrop';feedback?:{event:number;outcome:'complete'|'retry'|'reflection'};
}
/** An accessible scene for the learner's actual response. Selection and allocation
 * are work-in-progress, never correctness. Rewards arrive only after durable commit. */
export default function MissionArena({scaffoldId,theme='islands',ageGroup='adult',snapshot,selectedId,onSelect,actions,onAction,feedback,mode='play'}:MissionArenaProps){
 const playable=mode==='play';
 const world=worldForScaffold(scaffoldId),family=families[world.layout],Icon=family.icon,age=getAgePresentation(ageGroup);
 const art=worldArtworkFor(world,ageGroup),artStatus=useWorldArtwork(art.assetPath),id=useId();
 const [expanded,setExpanded]=useState(true),[page,setPage]=useState(0),[move,setMove]=useState(0);
 const selected=snapshot.nodes.find(node=>node.id===selectedId),pages=Math.max(1,Math.ceil(snapshot.nodes.length/6));
 const currentPage=Math.min(page,pages-1),nodes=snapshot.nodes.slice(currentPage*6,currentPage*6+6);
 const positions=useMemo(()=>new Map(nodes.map((node,index)=>[node.id,{x:nodes.length===1?50:nodes.length===2?28+index*44:18+(world.layout==='trail'&&index>=3?2-index%3:index%3)*32,y:nodes.length<=3?55:33+Math.floor(index/3)*43}])),[nodes.map(node=>node.id).join('|'),world.layout]);
 const backdrop=useMemo(()=>worldBackdropMarkup(world,theme,ageGroup),[world,theme,ageGroup]);
 const selectedLinks=selected?snapshot.links.filter(link=>link.from===selected.id||link.to===selected.id):[];
 const choose=(nodeId:string)=>{onSelect(nodeId);};
 const result=feedback&&feedback.event>0?feedback:undefined;
 return <section className={`mission-arena arena-family-${world.layout} arena-age-${age.density}${playable?'':' arena-backdrop-only'}${expanded?'':' arena-collapsed'}`} aria-label={`${art.name}: mission arena`} data-scaffold={scaffoldId} data-world-art={art.id} data-art-status={artStatus}>
  <header className="arena-heading"><div><Icon size={17}/><span>{family.label}</span></div><button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded} aria-controls={`${id}-stage`}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{expanded?'Compact scene':'Open scene'}</span></button></header>
  <div className="arena-stage" id={`${id}-stage`} hidden={!expanded}>
   <svg className="arena-vector" viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g dangerouslySetInnerHTML={{__html:backdrop}}/></svg>
   {artStatus==='ready'&&<img className="arena-environment" src={art.assetPath} alt="" aria-hidden="true" draggable={false}/>}
   <div className="arena-scrim" aria-hidden="true"/>
   <div className="arena-location"><span>MISSION LOCATION</span><h3>{art.name}</h3></div>
   <div className="arena-field" data-rows={nodes.length>3?2:1} aria-label="Your working pieces" hidden={!playable}>
    <svg className="arena-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={`${id}-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 7 3.5, 0 7" fill="var(--arena-accent)"/></marker></defs>{snapshot.links.map((link,index)=>{const a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)return null;const dx=b.x-a.x,dy=b.y-a.y,scale=Math.min(14/Math.max(.01,Math.abs(dx)),18/Math.max(.01,Math.abs(dy))),from={x:a.x+dx*scale,y:a.y+dy*scale},to={x:b.x-dx*scale,y:b.y-dy*scale};return <path key={`${link.from}-${link.to}-${index}`} d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} markerEnd={`url(#${id}-arrow)`} vectorEffect="non-scaling-stroke"/>;})}</svg>
    {nodes.map((node,index)=>{const position=positions.get(node.id)!;return <button type="button" key={node.id} className={`arena-piece${selectedId===node.id?' arena-piece-selected':''}`} aria-pressed={selectedId===node.id} onClick={()=>choose(node.id)} style={{'--piece-x':`${position.x}%`,'--piece-y':`${position.y}%`,'--piece-index':index} as CSSProperties}>
      <span className="arena-piece-marker"><Icon size={20}/><span>{String(currentPage*6+index+1).padStart(2,'0')}</span></span><strong>{node.label}</strong><small>{node.quantity!==undefined?`${node.quantity} allocated`:node.detail}</small>
     </button>;})}
    {!nodes.length&&<div className="arena-empty"><Icon size={38}/><strong>Your world is ready</strong><span>Use the workspace below to bring it to life.</span></div>}
   </div>
   {move>0&&<span key={`move-${move}`} className="arena-move-signal" aria-hidden="true"><Layers size={15}/>Move applied</span>}
   {result&&<div key={`feedback-${result.event}`} className={`arena-result-flare arena-result-${result.outcome}`} aria-hidden="true"><span/><span/><span/></div>}
   <div className="arena-world-label">Fictional setting · your source-based work</div>
  </div>
  <div className="arena-console" hidden={!playable}>
   <div className="arena-readout"><span className="arena-readout-light" aria-hidden="true"/><p>{snapshot.summary}</p>{pages>1&&<nav className="arena-pagination" aria-label="Scene pages"><button type="button" aria-label="Previous scene pieces" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ArrowLeft size={16}/></button><span>{currentPage+1} / {pages}</span><button type="button" aria-label="Next scene pieces" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}><ArrowRight size={16}/></button></nav>}</div>
   {snapshot.metrics.length>0&&<dl className="arena-meters">{snapshot.metrics.map((metric,index)=><div key={index}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>}
   {selected?<div className="arena-command" aria-label="Selected scene piece"><div className="arena-command-copy"><span>SELECTED PIECE</span><strong>{selected.label}</strong><p>{selected.detail}</p>{selectedLinks.length>0&&<ul className="arena-connections" aria-label="Your current connections">{selectedLinks.map((link,index)=><li key={index}><GitBranch size={14}/><span>{link.from===selected.id?'To: ':'From: '}{snapshot.nodes.find(node=>node.id===(link.from===selected.id?link.to:link.from))?.label}{link.label?` · ${link.label}`:''}</span></li>)}</ul>}</div>{actions.length>0?<div className="arena-command-actions">{actions.map(action=><button type="button" key={`${action.id}-${action.value??''}`} disabled={action.disabled} onClick={()=>{onAction(action);setMove(value=>value+1);}}><ArrowRight size={15}/>{action.label}</button>)}</div>:<p className="arena-continue">Use the task controls below to change this part of your model.</p>}</div>:<p className="arena-prompt"><Icon size={16}/>{family.verb} Selections do not show whether an answer is correct.</p>}
  </div>
 </section>;
}
