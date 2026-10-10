import type {CSSProperties} from 'react';
import {resolveGameAudioDirection,type GameAudioDirection} from '../lib/gameArtDirection';
import {worldForScaffold} from '../data/worlds';
import {reactionProfile,type ReactionOutcome} from '../data/reactionProfiles';
import SceneEventEffects from './SceneEventEffects';
import './reaction-effects.css';
export interface ReactionEffectsProps {outcome:ReactionOutcome|'reflection';scaffoldId?:string;ageGroup?:string;eventKey?:string|number;reducedMotion?:boolean;animate?:boolean;compact?:boolean;artDirection?:GameAudioDirection;theme?:string;activityKind?:string}
/** The player owns grading and durable rewards; this is decorative feedback only. */
export default function ReactionEffects({outcome,scaffoldId,ageGroup,eventKey,reducedMotion=false,animate=true,compact=false,artDirection,theme,activityKind}:ReactionEffectsProps){
 const direction=resolveGameAudioDirection(artDirection,{scaffoldId,ageGroup,theme,activityKind});
 const profile=reactionProfile(direction?.effectProfileId??scaffoldId),world=worldForScaffold(profile.id),young=ageGroup==='3-5'||ageGroup==='6-8';
 const palette={'--reaction-accent':profile.accent,'--reaction-ink':profile.ink} as CSSProperties;
 return <div className={`aster-reaction reaction-effects ae-${profile.family} ae-${outcome}${young?' ae-young':''}${compact?' ae-compact':''}`} data-reaction={outcome} data-outcome={outcome} data-motifs={world.objects.map(o=>o.glyph).join(' ')} data-scaffold={scaffoldId??profile.id} data-effect-profile={profile.id} data-family={profile.family} data-motion={!animate?'still':reducedMotion?'reduced':'full'} aria-hidden="true" style={palette}>
  <SceneEventEffects kind={outcome} scaffoldId={profile.id} ageGroup={ageGroup} eventKey={eventKey} animate={animate} reducedMotion={reducedMotion}/>
 </div>;
}
