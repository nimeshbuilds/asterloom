import type {CSSProperties} from 'react';
import {resolveGameAudioDirection} from '../lib/gameArtDirection';
import type {GameAudioDirection} from '../lib/gameArtDirection';
import {worldForScaffold} from '../data/worlds';
import {glyphMarkup} from '../lib/worldIllustration';
import {reactionProfile,type ReactionOutcome} from '../data/reactionProfiles';
import './reaction-effects.css';
export interface ReactionEffectsProps {outcome:ReactionOutcome;scaffoldId?:string;ageGroup?:string;eventKey?:string|number;reducedMotion?:boolean;animate?:boolean;compact?:boolean;artDirection?:GameAudioDirection;theme?:string;activityKind?:string}
/** Decorative feedback only. The player owns the source-grounded result and live
 * announcement. No reward is inferred from this visual or its animation. */
export default function ReactionEffects({outcome,scaffoldId,ageGroup,eventKey,reducedMotion=false,animate=true,compact=false,artDirection,theme,activityKind}:ReactionEffectsProps){
 const direction=resolveGameAudioDirection(artDirection,{scaffoldId,ageGroup,theme,activityKind});
 const profile=reactionProfile(direction?.effectProfileId??scaffoldId),world=worldForScaffold(profile.id),young=ageGroup==='3-5'||ageGroup==='6-8',retry=outcome==='retry',complete=outcome==='complete';
 const palette={ '--reaction-accent':retry?'#9a7446':profile.accent,'--reaction-secondary':profile.secondary,'--reaction-ink':profile.ink,'--reaction-shift':`${profile.seed%9-4}px` } as CSSProperties;
 const points=Array.from({length:young?7:11},(_,i)=>{const angle=(i/(young?7:11))*Math.PI*2+(profile.seed%50)/50;return{x:300+Math.cos(angle)*(58+(i%3)*14),y:81+Math.sin(angle)*(30+(i%2)*13),r:young?3.6:2.3,delay:`${i*.045}s`};});
 const marker=(x:number,y:number,i:number)=><g key={i} className="ae-node" style={{animationDelay:`${i*.065}s`}}><circle cx={x} cy={y} r={young?8:5.5}/><circle className="ae-node-core" cx={x} cy={y} r={2}/></g>;
 const glyph=<g className="ae-emblem" transform="translate(300 79)">{retry?<><path d="M-12 -2a13 13 0 1 1 2 14"/><path d="M-12 -13v12h12"/></>:complete?<><path d="m0-18 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z"/><path className="ae-core-check" d="m-5 1 4 4 8-9"/></>:<path d="m-12 0 8 8 17-18"/>}</g>;
 return <div key={`${eventKey??''}:${outcome}:${profile.id}`} className={`aster-reaction reaction-effects ae-${profile.family} ae-${outcome}${young?' ae-young':''}${compact?' ae-compact':''}`} data-reaction={outcome} data-outcome={outcome} data-motifs={world.objects.map(o=>o.glyph).join(" ")} data-scaffold={scaffoldId??profile.id} data-effect-profile={profile.id} data-family={profile.family} data-motion={!animate?'still':reducedMotion?'reduced':'full'} aria-hidden="true" style={palette}>
  <svg viewBox="0 0 600 156" focusable="false">
   <g className="ae-signal-halo"><circle className="ae-shockwave" cx="300" cy="79" r={complete?49:37}/><circle className="ae-inner-orbit" cx="300" cy="79" r="39"/></g>
   {!retry&&Array.from({length:complete?10:6},(_,i)=>{const angle=(i/(complete?10:6))*Math.PI*2;const x=300+Math.cos(angle)*97,y=79+Math.sin(angle)*48;return <path key={`ray-${i}`} className="ae-signal-ray" d={`M${x-3} ${y}h6M${x} ${y-3}v6`} style={{animationDelay:`${i*.055}s`}}/>;})}
   {world.objects.map((object,i)=><g key={object.glyph} className="ae-world-mark" transform={`translate(${[43,556,300][i]} ${i===2?137:51}) scale(${i===2?.23:young?.46:.36})`} dangerouslySetInnerHTML={{__html:glyphMarkup(object.glyph,profile.ink,'none')}}/>)}
   <path className="ae-horizon" d="M12 117Q160 99 300 120T588 113"/>
   <ellipse className="ae-ground" cx="300" cy="121" rx="145" ry="9"/>
   {profile.family==='constellation'&&<g className="ae-field"><path className="ae-connection" d="m190 96 43-51 67 34 60-43 49 64-109-21-110 17"/>{[[190,96],[233,45],[300,79],[360,36],[409,100]].map(([x,y],i)=>marker(x,y,i))}<ellipse className="ae-orbit" cx="300" cy="79" rx="130" ry="53"/><path className="ae-sweep" d="M185 61q110-81 222 8"/></g>}
   {profile.family==='circuit'&&<g className="ae-field"><path className="ae-connection" d="M117 87h63V52h61v27h118V45h69v47h54M180 87v24h66V79m113 0v31h69V92"/>{[[117,87],[180,52],[246,111],[300,79],[359,45],[428,110],[482,92]].map(([x,y],i)=>marker(x,y,i))}<rect className="ae-frame" x="272" y="51" width="56" height="56" rx="15"/></g>}
   {profile.family==='assembly'&&<g className="ae-field">{[-3,-2,-1,1,2,3].map((n,i)=><g key={n} className="ae-piece" style={{animationDelay:`${i*.06}s`}} transform={`translate(${300+n*48} ${75+Math.abs(n)*6}) rotate(${n*4})`}><rect x="-16" y="-17" width="32" height="34" rx="7"/><path d="M-8 0h16M0-8v16"/></g>)}<path className="ae-connection" d="M158 121h284"/><rect className="ae-frame" x="273" y="48" width="54" height="59" rx="13"/></g>}
   {profile.family==='path'&&<g className="ae-field"><path className="ae-route-shadow" d="M77 112c55 0 51-54 111-54s50 63 112 21 80-8 122 12 41 6 97-29"/><path className="ae-connection" d="M77 112c55 0 51-54 111-54s50 63 112 21 80-8 122 12 41 6 97-29"/>{[[77,112],[188,58],[300,79],[422,91],[519,62]].map(([x,y],i)=>marker(x,y,i))}<path className="ae-flag" d="M505 60V30l24 5-24 8"/></g>}
   {profile.family==='bloom'&&<g className="ae-field">{[-2,-1,1,2].map((n,i)=><g key={n} className="ae-sprout" style={{animationDelay:`${i*.08}s`}} transform={`translate(${300+n*60} 116)`}><path d={`M0 0q${n*3}-26 0-${42+Math.abs(n)*7}`}/><path className="ae-leaf" d="M0-18q-27-1-22-23 20-3 22 23M0-31q25-2 24-25-22 0-24 25"/></g>)}{Array.from({length:6},(_,i)=><ellipse key={i} className="ae-petal" cx="300" cy="53" rx="12" ry="22" transform={`rotate(${i*60} 300 79)`}/>)}<circle className="ae-frame" cx="300" cy="79" r="24"/></g>}
   {profile.family==='ripple'&&<g className="ae-field">{[0,1,2].map(i=><ellipse key={i} className="ae-ripple" cx="300" cy="95" rx={65+i*42} ry={15+i*10} style={{animationDelay:`${i*.14}s`}}/>)}<path className="ae-wave" d="M68 99q33-23 65 0t65 0M405 99q33-23 65 0t65 0"/><path className="ae-drop" d="M300 28q-29 36-22 55 22 29 44 0 7-19-22-55Z"/></g>}
   {profile.family==='lens'&&<g className="ae-field">{[-2,-1,1,2].map((n,i)=><g className="ae-page" key={n} transform={`translate(${300+n*63} ${68+Math.abs(n)*4}) rotate(${n*3})`} style={{animationDelay:`${i*.05}s`}}><rect x="-18" y="-28" width="36" height="56" rx="5"/><path d="M-10-13h20M-10-4H8M-10 5H3"/></g>)}<circle className="ae-frame" cx="300" cy="79" r="29"/><path className="ae-lens-handle" d="m321 100 23 23"/></g>}
   {profile.family==='ribbon'&&<g className="ae-field"><path className="ae-ribbon-band" d="m127 62 42-16 58 26 73-28 73 28 58-26 42 16-25 25 25 25-42 16-58-26-73 28-73-28-58 26-42-16 25-25Z"/><path className="ae-connection" d="M172 88h65m126 0h65"/><circle className="ae-frame" cx="300" cy="79" r="31"/>{[[179,40],[420,40],[179,123],[420,123]].map(([x,y],i)=>marker(x,y,i))}</g>}
   {!retry&&points.map((p,i)=><circle key={i} className="ae-mote" cx={p.x} cy={p.y} r={p.r} style={{animationDelay:p.delay}}/>)}
   <circle className="ae-center-disc" cx="300" cy="79" r={complete?27:23}/>{glyph}
   {retry&&<path className="ae-retry-thread" d="M255 127q45 7 90 0"/>}
  </svg>
 </div>;
}
