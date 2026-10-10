import type {DirectorSourceUnit,DirectorTeachingWindow} from './gameDirectorSources';
import type {AudioDirectionCatalog,AudioTrackDescriptor} from './gameArtDirection';

export interface LinkedTeachingContextWindow {
 sourceId:string;start:number;end:number;
 /** The primary excerpt remains present in full in this mission's unit. */
 primaryUnitId:string;beforeUnit:string;afterUnit:string;
}
export type PromptTeachingContextWindow=DirectorTeachingWindow|LinkedTeachingContextWindow;

export const LINKED_TEACHING_CONTEXT_INSTRUCTION=' If teachingContextWindow has primaryUnitId, its COMPLETE verbatim text is beforeUnit + unit.excerpt + afterUnit, without added separators. The ID is this mission’s unit.unitId. All strings are supplied whole. The primary unit remains the only activity/scoring evidence.';

/** Prompt-only, lossless reuse of the primary source text. Saved source units,
 * checkpoints and validation windows retain their original representation. */
export function compactTeachingContextWindow(unit:DirectorSourceUnit,window:DirectorTeachingWindow):PromptTeachingContextWindow {
 const start=unit.start-window.start,end=unit.end-window.start;
 if(unit.sourceId!==window.sourceId||![unit.start,unit.end,window.start,window.end].every(Number.isSafeInteger)||window.start<0||start<0||end<=start||unit.end>window.end||window.end-window.start!==window.excerpt.length||unit.end-unit.start!==unit.excerpt.length||window.excerpt.slice(start,end)!==unit.excerpt)throw Error('The prompt context must contain the complete exact primary source unit.');
 const linked:LinkedTeachingContextWindow={sourceId:window.sourceId,start:window.start,end:window.end,primaryUnitId:unit.id,beforeUnit:window.excerpt.slice(0,start),afterUnit:window.excerpt.slice(end)};
 // A tiny excerpt can be cheaper than its reference. Never enlarge the JSON
 // payload merely to apply the encoding; full windows remain valid too.
 return JSON.stringify(linked).length<JSON.stringify(window).length?linked:{...window};
}

export interface PromptAudioDirectionCatalog extends Omit<AudioDirectionCatalog,'studyTracks'> {
 studyTracks:(AudioTrackDescriptor|Pick<AudioTrackDescriptor,'id'>)[];
}
export const LINKED_AUDIO_CATALOG_INSTRUCTION=' In audioChoices, a studyTracks entry with only id reuses the COMPLETE descriptor with that ID in playTracks. All study choices remain available, in their original order.';

/** Study music is also offered as a quiet play alternative. Its full description
 * need only be disclosed once; IDs and preference order stay directly readable. */
export function compactAudioDirectionCatalog(catalog:AudioDirectionCatalog):PromptAudioDirectionCatalog {
 const playById=new Map(catalog.playTracks.map(track=>[track.id,track]));
 return{
  playTracks:catalog.playTracks.map(track=>({...track})),
  studyTracks:catalog.studyTracks.map(track=>{
   const play=playById.get(track.id);
   return play&&JSON.stringify(play)===JSON.stringify(track)?{id:track.id}:{...track};
  }),
  effectProfiles:catalog.effectProfiles.map(profile=>({...profile})),
 };
}
