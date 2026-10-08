import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, Compass, Flag, Lightbulb, LockKeyhole, MessageCircle, Save, Sparkles, Target } from 'lucide-react';
import {boundedHudValue} from '../lib/gameplayHud';
import './gameplay-hud.css';
export type GameplayMode='learning'|'practice'|'independent'|'draft'|'reflection';
export interface GameplayOutcome {id:string|number;kind:'correct'|'retry'|'complete'|'reflection';xpDelta:number;label?:string}
export interface GameplayHUDProps {
 totalXp:number;practiceXp?:number;sessionXp?:number;score?:{value:number;max?:number;label?:string};
 mission:{label:string;completed:number;total:number};mode:GameplayMode;modeReason?:string;
 saving?:boolean;saveError?:boolean;outcome?:GameplayOutcome;compact?:boolean;className?:string;
}
const MODES={
 learning:{title:'Learn & explore',note:'Get to know the source ideas, then use them in your mission.',Icon:BookOpen},
 practice:{title:'Practice mission',note:'Use the source and hints as you learn. Practice XP is separate from independent mastery.',Icon:Compass},
 independent:{title:'Independent challenge',note:'Attempt the challenge without opening the source or hints.',Icon:Target},
 draft:{title:'Guided mission',note:'Try the generated rules and earn practice XP. This model has not been reviewed for independent mastery.',Icon:LockKeyhole},
 reflection:{title:'Reflection',note:'Your reflection is saved without an automatic correctness grade.',Icon:MessageCircle},
};
/** Present committed game state only. This component never awards points or changes learning progress. */
export default function GameplayHUD({totalXp,practiceXp,sessionXp,score,mission,mode,modeReason,saving=false,saveError=false,outcome,compact=false,className=''}:GameplayHUDProps){
 const status=MODES[mode],ModeIcon=status.Icon,total=boundedHudValue(mission.total),completed=boundedHudValue(mission.completed,total),max=boundedHudValue(score?.max??0),value=boundedHudValue(score?.value??0,score?.max===undefined?Number.MAX_SAFE_INTEGER:max);
 const [pulse,setPulse]=useState(false),lastOutcome=useRef(outcome?.id);
 useEffect(()=>{if(!outcome||saving||saveError){setPulse(false);return;}if(lastOutcome.current===outcome.id)return;lastOutcome.current=outcome.id;setPulse(true);const timer=window.setTimeout(()=>setPulse(false),1600);return()=>window.clearTimeout(timer);},[outcome?.id,saving,saveError]);
 const result=outcome&&!saving&&!saveError?outcome:undefined;
 const OutcomeIcon=result?.kind==='retry'?Lightbulb:result?.kind==='reflection'?MessageCircle:result?.kind==='complete'?Flag:CheckCircle2;
 const resultText=result?.label??(result?.kind==='correct'?'Your solution works':result?.kind==='retry'?'One more move to discover':result?.kind==='reflection'?'Reflection saved':'Mission saved');
 const format=(number:number)=>boundedHudValue(number).toLocaleString(undefined,{maximumFractionDigits:2});
 return <section className={`gameplay-hud ${compact?'compact':''} ${pulse?'reward-pulse':''} ${className}`} aria-label="Game progress" data-mode={mode} data-reward-xp={!!result&&result.xpDelta>0} data-result={result?.kind} data-save={saveError?'failed':saving?'pending':'saved'}>
  <div className="gameplay-hud-main">
   {score&&<div className="gameplay-hud-score" data-hud="score"><span><Target size={14} aria-hidden="true"/>{score.label??'Mission score'}</span><strong>{format(value)}{score.max!==undefined&&<small> / {format(max)}</small>}</strong></div>}
   <div className="gameplay-hud-xp" data-hud="total-xp"><span><Sparkles size={14} aria-hidden="true"/>Journey XP</span><strong>{format(totalXp)}<small> XP</small></strong></div>
   <div className="gameplay-hud-mission"><div><span>{mission.label}</span><strong>{format(completed)} / {format(total)}</strong></div><progress value={completed} max={total||1} aria-label={mission.label}/></div>
  </div>
  <div className="gameplay-hud-footer">
   <div className="gameplay-hud-mode"><ModeIcon size={13} aria-hidden="true"/><strong>{status.title}</strong></div>
   <details className="gameplay-hud-details"><summary>About this attempt<ChevronDown size={12} aria-hidden="true"/></summary><div className="gameplay-hud-detail-content"><p>{modeReason??status.note}</p>{practiceXp!==undefined&&<span className="gameplay-hud-session" data-hud="practice-xp">{format(practiceXp)} practice XP · {format(Math.max(0,totalXp-practiceXp))} challenge XP</span>}{sessionXp!==undefined&&<span className="gameplay-hud-session" data-hud="session-xp">+{format(sessionXp)} XP this session</span>}</div></details>
   <span className="gameplay-hud-save"><Save size={12} aria-hidden="true"/>{saveError?'Save needs retry':saving?'Saving…':'Saved on this device'}</span>
  </div>
  {result&&<div key={result.id} className={`gameplay-hud-outcome ${result.kind}`} data-outcome={result.kind} role="status"><OutcomeIcon size={17} aria-hidden="true"/><strong>{resultText}</strong><span className="gameplay-hud-delta">{result.xpDelta>0?`+${format(result.xpDelta)} XP saved`:result.kind==='retry'?'Try another move':'Progress saved'}</span></div>}
 </section>;
}
