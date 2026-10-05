import {SCAFFOLDS} from '../data/scaffolds';
import {MUSIC_TRACKS,INTERACTIVE_SCORES} from './musicCatalog';
import type {MusicPhase} from './scoreTypes';
import {resolveGameAudioDirection,audioDirectionCatalog} from './gameArtDirection';
import type {GameAudioDirection} from './gameArtDirection';

export interface SoundtrackContext {
 notebookId:string; missionId?:string; missionIndex?:number; scaffoldId?:string;
 activityKind?:string; theme?:string; ageGroup?:string; phase?:MusicPhase; artDirection?:GameAudioDirection;
}
export interface MusicPreferences {mode:'adaptive'|'pinned';trackId:string}
export interface SoundtrackSelection {
 trackId:string; variation:number; arrangement:'reading'|'gameplay'; contextKey:string;
 mode:MusicPreferences['mode']; reason:string; playlist?:string[]; progression?:number; artDirected?:boolean; effectProfileId?:string; effects?:GameAudioDirection['effects'];
}
const preferenceKey='asterloom:music-preferences:v1';
let cachedPreferences:MusicPreferences|undefined;
let preferenceListener=false;
const knownTracks=new Set(MUSIC_TRACKS.map(track=>track.id));
const scaffoldLookup=new Map(SCAFFOLDS.map(scaffold=>[scaffold.id,scaffold]));
const hash=(value:string)=>{let n=2166136261;for(const character of value)n=Math.imul(n^character.charCodeAt(0),16777619);return n>>>0;};
const kindFamilies:Record<string,string[]>={sequence:['sequence'],classification:['sort','match'],decision:['scenario'],dependency:['connect','sequence'],budget:['scenario'],rubric:['explain'],diagram:['diagram'],completion:['cloze','sequence'],data:['sort','connect'],media:['explain'],scenario:['scenario'],construction:['connect','sequence'],explanation:['explain'],picture:['match','recall'],'rule-switch':['sort'],'child-play':['match','sequence'],'picture-build':['explain','match']};
const readingPools:Record<string,string[]>={forest:['moss-and-morning','homeward','first-light','paper-stars'],ocean:['tidepool','homeward','the-quiet-atlas','first-light'],observatory:['the-quiet-atlas','moon-library','paper-stars','golden-hour'],workshop:['moon-library','first-light','golden-hour','little-machines'],library:['moon-library','the-quiet-atlas','first-light','moss-and-morning'],islands:['tidepool','paper-stars','golden-hour','homeward']};

export function getMusicPreferences():MusicPreferences {
 if(!preferenceListener&&typeof window!=='undefined'){preferenceListener=true;window.addEventListener('storage',event=>{if(event.key===preferenceKey){cachedPreferences=undefined;window.dispatchEvent(new CustomEvent('asterloom:music-preferences'));}});}
 if(cachedPreferences)return{...cachedPreferences};
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(value&&typeof value==='object'){cachedPreferences={mode:value.mode==='pinned'?'pinned':'adaptive',trackId:knownTracks.has(value.trackId)?value.trackId:'first-light'};return{...cachedPreferences};}}catch{}
 // Old builds saved automatic choices as if they were manual. Keep that choice available,
 // but migrate to adaptive selection instead of pinning everyone to their last recipe.
 let trackId='first-light';try{const old=localStorage.getItem('asterloom-setting:music');if(old&&knownTracks.has(old))trackId=old;}catch{}
 cachedPreferences={mode:'adaptive',trackId};return{...cachedPreferences};
}
export function setMusicPreferences(patch:Partial<MusicPreferences>):MusicPreferences {
 const previous=getMusicPreferences();const next:MusicPreferences={mode:patch.mode==='adaptive'||patch.mode==='pinned'?patch.mode:previous.mode,trackId:patch.trackId&&knownTracks.has(patch.trackId)?patch.trackId:previous.trackId};
 cachedPreferences=next;try{localStorage.setItem(preferenceKey,JSON.stringify(next));}catch{}
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:music-preferences',{detail:next}));
 return{...next};
}
/** Stable scene-aware choices, not a claim that a song teaches or interprets source content. */
function initialLearningSoundtrack(context:SoundtrackContext,preferences:MusicPreferences):SoundtrackSelection {
 const scaffold=scaffoldLookup.get(context.scaffoldId??'');
 const family=scaffold?.family??kindFamilies[context.activityKind??'']?.[0]??'recall';
 const scene=context.theme??scaffold?.visual.scene??'islands';
 const age=context.ageGroup==='adults'?'adult':context.ageGroup??'adult';
 const arrangement=context.phase==='intro'||context.phase==='study'?'reading':'gameplay';
 const contextKey=JSON.stringify([context.notebookId,context.missionId??'',context.missionIndex??null,context.scaffoldId??'',context.activityKind??'',scene,age,context.artDirection??null]);
 const seed=hash(context.notebookId+'|'+(context.scaffoldId??context.activityKind??scene));
 const mission=Number.isSafeInteger(context.missionIndex)&&context.missionIndex!>=0?context.missionIndex!:hash(context.missionId??context.notebookId);
 const variation=(seed+mission)%8;
 if(preferences.mode==='pinned'&&knownTracks.has(preferences.trackId))return{trackId:preferences.trackId,variation:0,arrangement,contextKey,mode:'pinned',reason:'Your chosen soundtrack stays with you across games. Reading and feedback remain quieter.'};
 const direction=resolveGameAudioDirection(context.artDirection,context);
 if(direction)return{trackId:arrangement==='reading'?direction.studyTrackId:direction.playTrackId,variation,arrangement,contextKey,mode:'adaptive',artDirected:true,effectProfileId:direction.effectProfileId,effects:direction.effects,reason:'This game’s prepared art direction selects its bundled soundtrack and effects. Reading stays quieter; your sound preferences remain in control.'};
 if(arrangement==='reading'){
  const pool=readingPools[scene]??readingPools.islands;
  return{trackId:pool[(seed+mission)%pool.length],variation:0,arrangement,contextKey,mode:'adaptive',reason:'A bundled recording for reading, selected for this notebook and chapter. The game uses its own score when you start playing.'};
 }
 const families=scaffold?[scaffold.family]:kindFamilies[context.activityKind??'']??[family];
 const candidates=INTERACTIVE_SCORES.filter(score=>{
  const candidate=scaffoldLookup.get(score.scaffoldId??'');
  return candidate&&(age==='adult'?candidate.ages.includes('adult'):candidate.ages.includes(age))&&families.includes(candidate.family);
 });
 const exactScene=candidates.filter(score=>scaffoldLookup.get(score.scaffoldId!)!.visual.scene===scene);
 // Prefer the actual mechanic/scene/age palette. A narrow child palette keeps its own
 // composition and develops its phrasing instead of borrowing an unrelated adult game.
 const pool=(exactScene.length?exactScene:candidates).sort((a,b)=>(a.scaffoldId===context.scaffoldId?-1:0)-(b.scaffoldId===context.scaffoldId?-1:0)||a.id.localeCompare(b.id)).slice(0,8);
 if(!pool.length){const fallback={forest:'cedar-room',ocean:'river-notes',observatory:'quiet-orbit',workshop:'copper-lines',library:'ink-and-lantern',islands:'open-window'}[scene]??'open-window';pool.push(INTERACTIVE_SCORES.find(score=>score.id===`score-${fallback}`)!);}

 const selected=pool[(seed+mission)%pool.length]??INTERACTIVE_SCORES[0];
 return{trackId:selected.id,variation,arrangement,contextKey,mode:'adaptive',reason:pool.length>1?'A prepared score from this game’s age and mechanic palette. Chapters rotate compositions; phrases develop as you play.':'This game keeps its prepared musical identity, with different openings and phrase responses across missions.'};
}

/** A deterministic listening programme. Authored direction supplies the opening;
 * compatible bundled pieces follow after complete phrases. A learner pin is a
 * deliberate repeat, and neither choice enables audio or calls a provider. */
export function selectLearningSoundtrack(context:SoundtrackContext,preferences:MusicPreferences=getMusicPreferences(),progression=0):SoundtrackSelection {
 const first=initialLearningSoundtrack(context,preferences);
 const step=Number.isSafeInteger(progression)&&progression>=0?progression:0;
 if(first.mode==='pinned')return{...first,playlist:[first.trackId],progression:0};
 const kind=MUSIC_TRACKS.find(track=>track.id===first.trackId)?.kind;
 const catalog=audioDirectionCatalog(context);
 const candidates=(first.arrangement==='reading'?catalog.studyTracks:catalog.playTracks).filter(track=>track.kind===kind&&track.id!==first.trackId).map(track=>track.id).sort();
 // Rotate the alternatives by stable game identity so two games do not play the
 // same generic alphabetical playlist after their deliberately chosen opening.
 const offset=candidates.length?hash(first.contextKey)%candidates.length:0;
 const playlist=[first.trackId,...candidates.slice(offset),...candidates.slice(0,offset)];
 const trackId=playlist[step%playlist.length];
 return{...first,trackId,variation:kind==='recording'?0:(first.variation+step*3)%16,playlist,progression:step,
  reason:first.reason+(playlist.length>1?' Complete pieces and phrases lead into other compatible bundled music.':' Its longer arrangement develops across repeated phrases.')};
}
