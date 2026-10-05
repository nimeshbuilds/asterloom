import prepared from '../data/interactiveScores.generated.json' with {type:'json'};
import type {InteractiveScore} from './scoreTypes';
export const INTERACTIVE_SCORES=prepared.scores as unknown as InteractiveScore[];
export interface MusicTrack {id:string;name:string;mood:string;bpm:number;notes:number[];bass:number[];kind:'recording'|'interactive';collection:string;license:string;composer:string;description:string;scaffoldId?:string}
export const RECORDING_TRACKS = [
 {id:'first-light',name:'A Place I Call Home',mood:'Warm · piano',bpm:68,notes:[60,64,67,72,67,64,62,67],bass:[48,45,41,43]},
 {id:'paper-stars',name:'Childhood Friends',mood:'Light · bells',bpm:76,notes:[72,76,79,76,74,77,81,77],bass:[48,53,45,43]},
 {id:'moss-and-morning',name:'Peaceful Days',mood:'Gentle · woodland',bpm:62,notes:[62,65,69,74,69,65,67,64],bass:[50,46,43,45]},
 {id:'tidepool',name:'Sand Castles',mood:'Flowing · marimba',bpm:74,notes:[65,69,72,77,72,69,67,72],bass:[41,46,48,43]},
 {id:'little-machines',name:'Swinging Sweet',mood:'Playful · plucked',bpm:90,notes:[60,67,64,72,62,69,65,74],bass:[48,50,45,43]},
 {id:'the-quiet-atlas',name:'Winter Dust',mood:'Spacious · ambient',bpm:54,notes:[57,64,69,71,64,60,67,64],bass:[45,41,48,43]},
 {id:'golden-hour',name:'Summer Memories',mood:'Bright · keys',bpm:78,notes:[67,71,74,79,74,71,69,72],bass:[43,48,40,45]},
 {id:'moon-library',name:'A Brand New Wisdom',mood:'Reflective · soft bells',bpm:58,notes:[64,67,71,76,71,67,69,66],bass:[40,45,43,47]},
 {id:'pocket-adventure',name:'Just Saying Tho',mood:'Curious · pizzicato',bpm:84,notes:[62,69,66,74,64,71,67,76],bass:[50,47,43,45]},
 {id:'homeward',name:'Innocence',mood:'Comforting · piano',bpm:66,notes:[60,65,69,72,69,65,64,67],bass:[41,48,45,46]},
];
export const MUSIC_TRACKS:MusicTrack[]=[...RECORDING_TRACKS.map(t=>({...t,kind:'recording' as const,collection:'CC0 recordings',license:'CC0 1.0',composer:['little-machines','the-quiet-atlas','moon-library','pocket-adventure'].includes(t.id)?'hernandack':'Juhani Junkala / SubspaceAudio',description:'An included original Ogg recording; creator credit and CC0 license are available offline.'})),...INTERACTIVE_SCORES.map(s=>({...s,kind:'interactive' as const,notes:s.layers.melody.slice(0,8).map(n=>n[2]),bass:s.layers.foundation.filter(n=>n[3]>.3).slice(0,4).map(n=>n[2])}))];

/** Whole-file stereo RMS from the bundled, unchanged recordings decoded to 24 kHz PCM.
 * Attenuation brings their baseline near the synthesized scores; this is not LUFS metering.
 */
export const RECORDING_PLAYBACK_GAINS:Record<string,number>={
 'first-light':.292,'paper-stars':.350,'moss-and-morning':.218,'tidepool':.346,
 'little-machines':.130,'the-quiet-atlas':.382,'golden-hour':.223,'moon-library':.171,
 'pocket-adventure':.130,'homeward':.477,
};
