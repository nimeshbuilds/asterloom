import {feedbackCuePlan, type ReactionFamily, type ReactionOutcome} from '../data/reactionProfiles';
import {actionCuePlan, type GameActionCue} from './actionFeedback';

export type SceneEventKind = GameActionCue | ReactionOutcome | 'reflection';
export interface SceneFeedbackEvent {event:number;kind:SceneEventKind}
export const SCENE_MECHANISMS:Record<ReactionFamily,string>={
 constellation:'orbital-alignment',circuit:'signal-routing',assembly:'precision-assembly',
 path:'route-activation',bloom:'living-growth',ripple:'water-channel',lens:'archive-focus',ribbon:'stage-reveal',
};
/** Visual and audio use the same identity and onset clock. This describes an
 * acknowledged event, never evaluates an answer or grants a reward. */
export function sceneFeedbackPlan(kind:SceneEventKind,scaffoldId?:string,ageGroup?:string){
 const result=kind==='success'||kind==='complete'||kind==='retry'||kind==='reflection';
 const cue=result?feedbackCuePlan(kind==='reflection'?'complete':kind,scaffoldId,ageGroup):actionCuePlan(kind,scaffoldId,ageGroup);
 return{profile:cue.profile,mechanism:SCENE_MECHANISMS[cue.profile.family],result,
  duration:cue.maxDuration,beats:cue.notes.map(note=>note.at),
  // Movement is neutral; only committed correctness may finish in a reward seal.
  reward:kind==='success'||kind==='complete',retry:kind==='retry',reverse:kind==='remove',
 };
}
