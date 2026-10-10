import type {CSSProperties} from 'react';
import {sceneFeedbackPlan,type SceneEventKind} from '../lib/sceneFeedback';
import {worldForScaffold} from '../data/worlds';
import {glyphMarkup} from '../lib/worldIllustration';
import './scene-event-effects.css';

export interface SceneEventEffectsProps {
 kind:SceneEventKind;scaffoldId?:string;ageGroup?:string;eventKey?:string|number;
 animate?:boolean;reducedMotion?:boolean;surface?:'panel'|'scene';
}
/** Decorative mechanisms for the authored world. There are no controls, source
 * assertions or scores here; callers own committed results and live announcements. */
export default function SceneEventEffects({kind,scaffoldId,ageGroup,eventKey,animate=true,reducedMotion=false,surface='panel'}:SceneEventEffectsProps){
 const plan=sceneFeedbackPlan(kind,scaffoldId,ageGroup),{profile}=plan,world=worldForScaffold(profile.id);
 const motion=!animate?'still':reducedMotion?'reduced':'full',young=ageGroup==='3-5'||ageGroup==='6-8';
 const style={'--event-accent':plan.retry?'#e8c593':profile.accent,'--event-secondary':profile.secondary,
  '--event-duration':`${plan.duration}s`,'--event-land':`${plan.beats.at(-1)??0}s`,
  '--event-turn':`${15+(profile.seed%5)*9}deg`,'--event-direction':plan.reverse?'reverse':'normal',
 } as CSSProperties;
 const beat=(i:number)=>({'--event-beat':`${plan.beats[i%plan.beats.length]}s`,'--piece-offset':`${i%2?-1:1}`}) as CSSProperties;
 const nodes=(positions:number[][])=>positions.map(([x,y],i)=><g key={i} className="se-node" style={beat(i)}><circle cx={x} cy={y} r={young?7:5}/><circle cx={x} cy={y} r="2" className="se-node-core"/></g>);
 return <div key={`${profile.id}:${kind}:${eventKey??''}`} className={`scene-event-effects se-${profile.family} se-${kind} se-surface-${surface}${young?' se-young':''}`} data-mechanism={plan.mechanism} data-kind={kind} data-event={eventKey} data-effect-profile={profile.id} data-motion={motion} data-duration={plan.duration} data-reward={plan.reward} aria-hidden="true" style={style}>
  <svg viewBox="0 0 600 180" focusable="false">
   <path className="se-ground" d="M24 143H576M48 150H552"/>
   {profile.family==='circuit'&&<g className="se-machine"><path className="se-track" d="M48 119H124V62H230V90H370V48H476V117H552"/><path className="se-flow" pathLength="1" d="M48 119H124V62H230V90H370V48H476V117H552"/>{nodes([[48,119],[124,62],[230,90],[370,48],[476,117],[552,117]])}<rect className="se-core" x="272" y="63" width="56" height="54" rx="9"/><path className="se-detail" d="M263 75h-12m12 15h-12m12 15h-12m86-30h12m-12 15h12m-12 15h12"/><circle className="se-traveler se-packet" r="5"/></g>}
   {profile.family==='assembly'&&<g className="se-machine"><path className="se-track" d="M80 126H520M140 130v11m80-11v11m160-11v11m80-11v11"/>{[0,1,2,3].map(i=><g key={i} transform={`translate(${185+i*77} 92)`}><g className="se-join" style={beat(i)}><path className="se-block" d="M-28-24h18v-9H7v9h21v17h9V9h-9v19H9v-9H-8v9h-20V9h9V-7h-9Z"/><path className="se-detail" d="M-8-6H9V10H-8Z"/></g></g>)}<path className="se-press" d="M162 26H438V39H162ZM300 13V26"/><path className="se-flow" pathLength="1" d="M90 128H510"/></g>}
   {profile.family==='path'&&<g className="se-machine"><path className="se-track" d="M40 128C130 128 116 53 205 53S274 127 361 127 445 56 560 56"/><path className="se-flow" pathLength="1" d="M40 128C130 128 116 53 205 53S274 127 361 127 445 56 560 56"/>{nodes([[40,128],[205,53],[361,127],[560,56]])}<path className="se-landmark" d="M531 50V17l30 6-30 11M153 116l15-17 15 17m242 26 16-17 16 17"/><circle className="se-traveler se-route-marker" r="6"/></g>}
   {profile.family==='constellation'&&<g className="se-machine"><ellipse className="se-track" cx="300" cy="90" rx="175" ry="57"/><ellipse className="se-orbit" cx="300" cy="90" rx="130" ry="46"/><path className="se-flow" pathLength="1" d="M109 101L203 45 300 90 401 37 490 113"/>{nodes([[109,101],[203,45],[300,90],[401,37],[490,113]])}<g className="se-alignment"><path d="M291 18h18m-9-9v18M426 104h14m-7-7v14M156 86h14m-7-7v14"/></g></g>}
   {profile.family==='bloom'&&<g className="se-machine"><path className="se-track" d="M90 141Q300 116 510 141"/>{[0,1,2,3,4].map(i=><g key={i} transform={`translate(${144+i*78} ${i%2?137:133})`}><g className="se-grow" style={beat(i)}><path className="se-stem" d={`M0 0V-${50+(profile.seed+i)%3*10}`}/><path className="se-leaf" d="M0-17Q-30-18-27-40-5-39 0-17M0-33Q27-34 29-59 3-58 0-33"/><g className="se-flower" transform="translate(0 -65)"><path d="M0 0C-24-5-12-24 0-11 12-24 24-5 0 0Z"/><circle cy="-5" r="3"/></g></g></g>)}</g>}
   {profile.family==='ripple'&&<g className="se-machine"><path className="se-channel" d="M40 80H145V122H250V82H360V119H465V64H560"/><path className="se-flow" pathLength="1" d="M40 80H145V122H250V82H360V119H465V64H560"/>{[0,1,2].map(i=><ellipse key={i} className="se-water-ring" cx="300" cy="90" rx={40+i*27} ry={14+i*8} style={beat(i)}/>)}<circle className="se-traveler se-water-drop" r="5"/><path className="se-detail" d="M72 104q15-12 30 0m394-15q15-12 30 0"/></g>}
   {profile.family==='lens'&&<g className="se-machine">{[0,1,2,3].map(i=><g key={i} transform={`translate(${154+i*98} 91)`}><g className="se-file" style={beat(i)}><path className="se-block" d="M-28-40H10L28-22V40H-28Z"/><path className="se-detail" d="M10-40v18h18M-17-8H17M-17 4H17M-17 16H7"/></g></g>)}<g className="se-loupe"><circle className="se-core" cx="300" cy="86" r="36"/><path className="se-handle" d="M325 113l27 27"/><path className="se-scan" d="M278 80h44m-44 10h44"/></g></g>}
   {profile.family==='ribbon'&&<g className="se-machine"><path className="se-track" d="M80 137H520M96 31H504"/><path className="se-curtain se-left-curtain" d="M96 31H228V108Q160 98 96 125Z"/><path className="se-curtain se-right-curtain" d="M372 31H504V125Q440 98 372 108Z"/>{[0,1,2,3,4].map(i=><g key={i} className="se-stage-light" style={beat(i)}><path d={`M${172+i*64} 40l-22 90h44Z`}/><circle cx={172+i*64} cy="35" r="5"/></g>)}</g>}
   {world.objects.slice(0,2).map((object,i)=><g key={object.glyph} className="se-world-mark" transform={`translate(${i?565:35} 28) scale(.27)`} dangerouslySetInnerHTML={{__html:glyphMarkup(object.glyph,profile.ink,'none')}}/>)}
   {plan.result&&<g className="se-result-seal"><circle className="ae-shockwave" cx="300" cy="90" r="34"/><circle className="se-seal-disc" cx="300" cy="90" r="25"/><g className="ae-emblem" transform="translate(300 90)">{plan.retry?<><path d="M-11-3a12 12 0 1 1 1 14"/><path d="M-11-13v11H0"/></>:kind==='reflection'?<><path d="M0-11v24m0-22Q-7-15-15-10V10Q-7 5 0 13q7-8 15-3v-20Q7-15 0-9"/></>:<path d="m-12 0 8 8 18-18"/>}</g></g>}
   {plan.retry&&<path className="se-reconsider" d="M253 148q47 7 94 0"/>}
  </svg>
 </div>;
}
