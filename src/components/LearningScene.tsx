import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {ChevronDown,Layers,Leaf,MousePointer2} from 'lucide-react';
import {getAgePresentation,worldPalette,worldForScaffold} from '../data/worlds';
import {worldBackdropMarkup,glyphMarkup} from '../lib/worldIllustration';
import {sceneNodePositions,type SceneAction,type SceneSnapshot} from '../lib/worldScene';
import './learning-scene.css';
export interface LearningSceneProps {scaffoldId?:string;theme?:string;ageGroup?:string;snapshot:SceneSnapshot;selectedId?:string;onSelect?:(id:string)=>void;actions?:SceneAction[];onAction?:(action:SceneAction)=>void;compact?:boolean;interaction?:'overview'|'workspace'}
const empty=()=>{try{return localStorage.getItem('asterloom.scene.simple')==='true';}catch{return false;}};
export default function LearningScene({scaffoldId,theme='islands',ageGroup='adult',snapshot,selectedId='',onSelect,actions=[],onAction,compact=false,interaction='workspace'}:LearningSceneProps){
 const overview=interaction==='overview';
 const world=worldForScaffold(scaffoldId),age=getAgePresentation(ageGroup),palette=worldPalette(theme,ageGroup);
 const [simple,setSimple]=useState(empty),[engine,setEngine]=useState<'loading'|'canvas'|'fallback'>('loading'),[motion,setMotion]=useState(false),[revision,setRevision]=useState(0);
 const animation=useRef<number>(0),previousPositions=useRef(new Map<string,{x:number;y:number}>());
 const host=useRef<HTMLDivElement>(null),runtime=useRef<{app:import('pixi.js').Application;pixi:typeof import('pixi.js')}|null>(null),draw=useRef<()=>void>(()=>{}),select=useRef(onSelect);select.current=onSelect;
 const selected=snapshot.nodes.find(n=>n.id===selectedId),page=Math.max(0,Math.floor(snapshot.nodes.findIndex(n=>n.id===selectedId)/8));
 const nodes=useMemo(()=>sceneNodePositions(overview?[]:snapshot.nodes.slice(page*8,page*8+8),snapshot.layout??world.layout),[JSON.stringify(snapshot.nodes),page,snapshot.layout,world.layout,overview]);
 const backdrop=useMemo(()=>worldBackdropMarkup(world,theme,ageGroup),[world,theme,ageGroup]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setMotion(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{
  let disposed=false,cleanup:(()=>void)|undefined;setEngine('loading');
  const lowMemory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;const saveData=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData;
  if(simple||saveData||(lowMemory!==undefined&&lowMemory<=2)){setEngine('fallback');return;}
  void (async()=>{try{
   const pixi=await import('pixi.js');
   // Pixi's CSP adapter replaces generated JavaScript uniform handlers with static implementations.
   await import('pixi.js/unsafe-eval');if(disposed||!host.current)return;
   const app=new pixi.Application();await app.init({width:800,height:360,backgroundAlpha:0,autoStart:false,preference:'webgl',powerPreference:'low-power',resolution:Math.min(devicePixelRatio||1,1.5),antialias:true});
   if(disposed||!host.current){app.destroy(true,{children:true});return;}
   const canvas=app.canvas;canvas.setAttribute('aria-hidden','true');canvas.tabIndex=-1;host.current.appendChild(canvas);runtime.current={app,pixi};
   const lost=(event:Event)=>{event.preventDefault();setEngine('fallback');};canvas.addEventListener('webglcontextlost',lost);
   const observer=new ResizeObserver(()=>draw.current());observer.observe(host.current);
   cleanup=()=>{observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);runtime.current=null;app.destroy(true,{children:true});};setEngine('canvas');setRevision(v=>v+1);
  }catch{if(!disposed)setEngine('fallback');}})();
  return()=>{disposed=true;cleanup?.();};
 },[simple]);
 useEffect(()=>{
  const render=()=>{cancelAnimationFrame(animation.current);const r=runtime.current;if(!r||!host.current)return;const {app,pixi}=r,width=host.current.clientWidth||800,height=width*360/800;app.renderer.resize(width,height);
   for(const child of app.stage.removeChildren())child.destroy({children:true});
   const root=new pixi.Container();root.scale.set(width/800);app.stage.addChild(root);
   root.addChild(new pixi.Graphics().svg(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360">${worldBackdropMarkup(world,theme,ageGroup,false)}</svg>`));
   for(const [i,object] of world.objects.entries()){const group=new pixi.Container();group.position.set(object.x*8,object.y*3.6);group.scale.set(object.size/43*(age.largeControls?1.1:1));group.addChild(new pixi.Graphics().ellipse(0,40,34,9).fill({color:palette.ink,alpha:.08}).circle(0,0,41).fill({color:palette.paper,alpha:.94}));group.addChild(new pixi.Graphics().svg(`<svg>${glyphMarkup(object.glyph,palette.accent,i===1?palette.ground:palette.paper)}</svg>`));root.addChild(group);}
   for(const link of snapshot.links){const a=nodes.find(n=>n.id===link.from),b=nodes.find(n=>n.id===link.to);if(!a||!b)continue;root.addChild(new pixi.Graphics().moveTo(a.x!*8,a.y!*3.6).lineTo(b.x!*8,b.y!*3.6).stroke({color:palette.accent,width:3,alpha:.7}));}
   const transitions:{group:import('pixi.js').Container;dx:number;dy:number}[]=[];
   nodes.forEach((node,index)=>{const group=new pixi.Container();root.addChild(group);const g=new pixi.Graphics(),x=node.x!*8,y=node.y!*3.6;g.circle(x,y+6,25).fill({color:palette.ink,alpha:.1}).circle(x,y,24).fill(node.active?palette.accent:palette.paper).stroke({color:node.id===selectedId?palette.ink:palette.accent,width:node.id===selectedId?4:2});g.eventMode=onSelect?'static':'none';g.cursor=onSelect?'pointer':'default';g.on('pointertap',()=>select.current?.(node.id));group.addChild(g);const prior=previousPositions.current.get(node.id);transitions.push({group,dx:prior?prior.x-x:0,dy:prior?prior.y-y:0});
    if(node.glyph){const glyph=new pixi.Graphics().svg(`<svg>${glyphMarkup(node.glyph,node.active?palette.paper:palette.accent,'none')}</svg>`);glyph.scale.set(.47);glyph.position.set(x,y);group.addChild(glyph);}else{const label=new pixi.Text({text:String(page*8+index+1),style:{fill:node.active?palette.paper:palette.ink,fontFamily:'Arial',fontSize:18,fontWeight:'bold'}});label.anchor.set(.5);label.position.set(x,y);group.addChild(label);}
   });previousPositions.current=new Map(nodes.map(node=>[node.id,{x:node.x!*8,y:node.y!*3.6}]));
   if(!motion&&!document.hidden&&transitions.some(t=>t.dx||t.dy)){const start=performance.now();const step=()=>{const progress=Math.min(1,(performance.now()-start)/240),remaining=(1-progress)**3;for(const t of transitions)t.group.position.set(t.dx*remaining,t.dy*remaining);app.render();if(progress<1)animation.current=requestAnimationFrame(step);};step();}else app.render();
  };draw.current=render;render();return()=>cancelAnimationFrame(animation.current);
 },[motion,revision,backdrop,JSON.stringify(nodes),JSON.stringify(snapshot.links),palette,selectedId,page,!!onSelect]);
 const toggle=(value:boolean)=>{setSimple(value);try{localStorage.setItem('asterloom.scene.simple',String(value));}catch{/* Preference is optional when storage is unavailable. */}};
 return <section className={`learning-scene ${compact?'scene-compact':''} ${overview?'scene-overview':''} scene-density-${age.density}`} data-scene-engine={engine} data-renderer={engine==='canvas'?'pixi-webgl':engine==='fallback'?'svg-dom':'initializing'} data-reduced-motion={motion} aria-label={`${world.name}: ${overview?'quest context':'live workspace'}`} style={{'--scene-ink':palette.ink,'--scene-accent':palette.accent,'--scene-paper':palette.paper,'--scene-tint':palette.sky} as CSSProperties}>
  <div className="scene-title"><div><span><Leaf size={13}/>{age.label}</span><h3>{world.name}</h3></div><button type="button" className="scene-mode" aria-pressed={simple} onClick={()=>toggle(!simple)}><Layers size={14}/>{simple?'Illustrated view':'Simple view'}</button></div>
  {!simple&&<div className="scene-stage" data-world={world.id}>
   <svg className="scene-fallback" viewBox="0 0 800 360" aria-hidden="true"><g dangerouslySetInnerHTML={{__html:backdrop}}/>{snapshot.links.map((link,i)=>{const a=nodes.find(n=>n.id===link.from),b=nodes.find(n=>n.id===link.to);return a&&b?<line key={i} x1={a.x!*8} y1={a.y!*3.6} x2={b.x!*8} y2={b.y!*3.6} stroke={palette.accent} strokeWidth="3"/>:null;})}{nodes.map((node,i)=><g key={node.id} transform={`translate(${node.x!*8} ${node.y!*3.6})`}><circle r="24" fill={node.active?palette.accent:palette.paper} stroke={palette.accent} strokeWidth="2"/><text textAnchor="middle" dominantBaseline="middle" fontFamily="Arial" fontWeight="bold" fontSize="18" fill={node.active?palette.paper:palette.ink}>{page*8+i+1}</text></g>)}</svg>
   <div ref={host} className={`scene-canvas ${engine==='canvas'?'ready':''}`}/>
   {!overview&&<span className="scene-setting-label">Illustrated setting · your work below</span>}
  </div>}
  <div className="scene-workspace">
   <div className="scene-state-summary"><MousePointer2 size={16}/><p>{snapshot.summary}</p></div>
   {!!snapshot.metrics.length&&<dl className="scene-metrics">{snapshot.metrics.map((metric,index)=><div key={index}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>}
   {!overview&&snapshot.nodes.length>0&&<><div className="scene-object-tray" aria-label="Objects in your working model">{nodes.map((node,i)=><button type="button" key={node.id} aria-pressed={selectedId===node.id} disabled={!onSelect} onClick={()=>onSelect?.(node.id)}><span className={node.active?'is-active':''}>{page*8+i+1}</span><strong>{node.label}</strong>{node.quantity!==undefined&&<small>×{node.quantity}</small>}</button>)}</div>{snapshot.nodes.length>8&&<label className="scene-object-picker">Find a workspace object<select value={selectedId} onChange={event=>onSelect?.(event.target.value)}><option value="">Choose an object</option>{snapshot.nodes.map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label>}</>}
   {!overview&&selected&&<div className="scene-selected" aria-live="polite"><div><strong>{selected.label}</strong><p>{selected.detail}</p></div>{!!actions.length&&<div className="scene-actions">{actions.map((action,i)=><button type="button" key={i} disabled={action.disabled} onClick={()=>onAction?.(action)}>{action.label}</button>)}</div>}</div>}
   {!overview&&!snapshot.nodes.length&&<p className="scene-empty">Add a part in the workspace to bring this model to life.</p>}
  </div>
  <details className="scene-setting-note"><summary>About this scene <ChevronDown size={12}/></summary><p>{world.settingNote} {overview?'The task below contains the controls and evidence.':'Highlighted objects show selections or available actions. They do not indicate a correct answer.'}</p></details>
 </section>;
}
