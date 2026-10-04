import {RECORDINGS} from './musicRecordings';
import prepared from '../data/interactiveScores.generated.json';
import {feedbackCuePlan} from '../data/reactionProfiles';
import {createLayerMixer,scoreEvents,scheduleVoice,SCORE_LAYERS} from './musicSynthesis';
import {PHASE_MIX} from './scoreTypes';
import type {InteractiveScore,MusicPhase,ScoreLayer} from './scoreTypes';
export type {MusicPhase} from './scoreTypes';
export const INTERACTIVE_SCORES=prepared.scores as unknown as InteractiveScore[];
export interface MusicTrack {id:string;name:string;mood:string;bpm:number;notes:number[];bass:number[];kind:'recording'|'interactive';collection:string;license:string;composer:string;description:string;scaffoldId?:string}
const RECORDING_TRACKS = [
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
const scoreLookup=new Map(INTERACTIVE_SCORES.map(s=>[s.id,s]));
export interface SoundPreferences {enabled:boolean;volume:number}
const preferenceKey='asterloom:sound-preferences:v1';
const clamp=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;
let preferences:SoundPreferences={enabled:false,volume:.32},preferencesLoaded=false;
export function getSoundPreferences():SoundPreferences {listen();if(!preferencesLoaded){preferencesLoaded=true;try{const stored=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(stored&&typeof stored==='object')preferences={enabled:stored.enabled===true,volume:clamp(stored.volume,.32)};}catch{}}return{...preferences};}
export function setSoundPreferences(patch:Partial<SoundPreferences>):SoundPreferences {
 const previous=getSoundPreferences();preferences={enabled:typeof patch.enabled==='boolean'?patch.enabled:previous.enabled,volume:clamp(patch.volume,previous.volume)};
 try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{}
 if(preferences.enabled)ensureContext(); // Called synchronously from the explicit sound opt-in gesture.
 if(!preferences.enabled)stopVoices(effectVoices);
 refreshOutput();if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:sound-preferences',{detail:{...preferences}}));return{...preferences};
}
export interface MusicRuntimeStatus {state:'stopped'|'playing'|'suspended'|'unavailable';source:'recording'|'interactive'|null;trackId:string|null;phase:MusicPhase;reason?:string}
let status:MusicRuntimeStatus={state:'stopped',source:null,trackId:null,phase:'practice'};
export function getMusicRuntimeStatus():MusicRuntimeStatus{return{...status};}
function updateStatus(patch:Partial<MusicRuntimeStatus>){status={...status,...patch};if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:music-status',{detail:{...status}}));}
let context:AudioContext|undefined,musicBus:GainNode|undefined,effectBus:GainNode|undefined,limiter:DynamicsCompressorNode|undefined;
let layers:Record<ScoreLayer,GainNode>|undefined,timer:ReturnType<typeof setInterval>|undefined,phaseTimer:ReturnType<typeof setTimeout>|undefined;
let recording:HTMLAudioElement|undefined,recordingNode:MediaElementAudioSourceNode|undefined,currentVolume=.15,musicWanted=false,manualDuck=false;
let currentScore:InteractiveScore|undefined,nextIndex=0,loopStart=0,generation=0,listening=false,lastCue=-Infinity;
const musicVoices=new Set<OscillatorNode>(),effectVoices=new Set<OscillatorNode>(),speakingMedia=new Set<HTMLMediaElement>();
const hidden=()=>typeof document!=='undefined'&&document.visibilityState==='hidden';
const ducked=()=>manualDuck||speakingMedia.size>0||(typeof window!=='undefined'&&window.speechSynthesis?.speaking===true);
function stopVoices(voices:Set<OscillatorNode>){for(const node of voices){try{node.stop();}catch{}}voices.clear();}
function keepVoice(node:OscillatorNode,set:Set<OscillatorNode>){set.add(node);node.addEventListener('ended',()=>set.delete(node),{once:true});}
function listen(){if(listening||typeof document==='undefined')return;listening=true;
 const prime=()=>{if(getSoundPreferences().enabled)ensureContext();};document.addEventListener('pointerdown',prime,{capture:true,passive:true});document.addEventListener('keydown',prime,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(hidden()){if(timer)clearInterval(timer);timer=undefined;recording?.pause();stopVoices(musicVoices);stopVoices(effectVoices);void context?.suspend().catch(()=>{});if(musicWanted)updateStatus({state:'suspended'});}else if(musicWanted||getSoundPreferences().enabled){ensureContext();if(musicWanted){if(recording)void recording.play().catch(()=>updateStatus({state:'suspended',reason:'Select play to enable audio.'}));else startSchedule();}}});
 const media=(event:Event)=>{const node=event.target;if(!(node instanceof HTMLMediaElement)||node===recording)return;if(!node.paused&&!node.ended&&!node.muted&&node.volume>0)speakingMedia.add(node);else speakingMedia.delete(node);refreshOutput();};
 for(const event of ['play','pause','ended','volumechange'])document.addEventListener(event,media,true);
 window.addEventListener('storage',event=>{if(event.key===preferenceKey){preferencesLoaded=false;getSoundPreferences();if(!preferences.enabled)stopVoices(effectVoices);refreshOutput();window.dispatchEvent(new CustomEvent('asterloom:sound-preferences',{detail:getSoundPreferences()}));}});
}
function ensureContext():AudioContext|undefined {
 listen();if(typeof window==='undefined')return;
 try{
  if(!context||context.state==='closed'){
   const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Constructor){updateStatus({state:'unavailable',reason:'This browser does not support game audio.'});return;}
   context=new Constructor();musicBus=context.createGain();effectBus=context.createGain();limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=18;limiter.ratio.value=5;limiter.attack.value=.012;limiter.release.value=.2;musicBus.connect(limiter);effectBus.connect(limiter);limiter.connect(context.destination);refreshOutput();
  }
  const active=context;if(active.state==='suspended'&&!hidden())void active.resume().then(()=>{if(context===active&&musicWanted)updateStatus({state:active.state==='running'?'playing':'suspended'});}).catch(()=>updateStatus({state:'suspended',reason:'Select play to enable audio.'}));
  return context;
 }catch{updateStatus({state:'unavailable',reason:'Audio could not start in this browser.'});return;}
}
function refreshOutput(){if(!context)return;const suppressed=ducked()||hidden();for(const media of speakingMedia)if(media.paused||media.ended||!media.isConnected)speakingMedia.delete(media);
 musicBus?.gain.setTargetAtTime(musicWanted&&!hidden()?currentVolume*(suppressed?.06:1):0,context.currentTime,.11);
 const pref=getSoundPreferences();effectBus?.gain.setTargetAtTime(pref.enabled&&!suppressed?pref.volume:0,context.currentTime,.015);
}
function stopSchedule(){if(timer)clearInterval(timer);timer=undefined;stopVoices(musicVoices);for(const node of Object.values(layers??{}))node.disconnect();layers=undefined;}
export function stopMusic(){musicWanted=false;generation++;stopSchedule();if(recording){recording.pause();recording.removeAttribute('src');recording.load();recording=undefined;}recordingNode?.disconnect();recordingNode=undefined;currentScore=undefined;refreshOutput();updateStatus({state:'stopped',source:null,trackId:null,reason:undefined});}
function startSchedule(){if(!currentScore||!context||!musicBus||hidden())return;stopSchedule();const score=currentScore,events=scoreEvents(score),beat=60/score.bpm;layers=createLayerMixer(context,musicBus,status.phase);nextIndex=0;loopStart=context.currentTime+.035;
 const tick=()=>{if(!context||!layers||!musicWanted||hidden())return;refreshOutput();if(context.state!=='running')return;const now=context.currentTime;if(loopStart+score.beats*beat<now){loopStart=now+.035;nextIndex=0;}
  let scheduled=0;while(scheduled<256){const event=events[nextIndex];const at=loopStart+event.note[0]*beat;if(at>now+.18)break;if(at>=now-.02){const [_,duration,midi,velocity]=event.note;keepVoice(scheduleVoice(context,layers[event.layer],{at:Math.max(at,now),duration:duration*beat,midi,velocity,instrument:score.instruments[event.layer],pan:event.layer==='detail'?.32:event.layer==='melody'?-.12:0}),musicVoices);}nextIndex++;scheduled++;if(nextIndex>=events.length){nextIndex=0;loopStart+=score.beats*beat;}}
 };tick();timer=setInterval(tick,60);updateStatus({state:context.state==='running'?'playing':'suspended',source:'interactive'});
}
export function playMusic(id:string,volume=.15){
 stopMusic();currentVolume=clamp(volume,.15);musicWanted=true;const track=MUSIC_TRACKS.find(t=>t.id===id)??MUSIC_TRACKS[0];updateStatus({trackId:track.id,reason:undefined});const active=ensureContext();if(!active||!musicBus)return;refreshOutput();const version=generation;
 const fallback=()=>{if(!musicWanted||version!==generation)return;recording?.pause();recordingNode?.disconnect();recording=undefined;recordingNode=undefined;currentScore=scoreLookup.get(track.id)??INTERACTIVE_SCORES[RECORDING_TRACKS.findIndex(t=>t.id===track.id)%INTERACTIVE_SCORES.length]??INTERACTIVE_SCORES[0];startSchedule();};
 if(track.kind==='recording'&&typeof Audio!=='undefined'&&new Audio().canPlayType('audio/ogg; codecs=vorbis')){
  try{recording=new Audio(RECORDINGS[track.id]);recording.loop=true;recording.preload='auto';recordingNode=active.createMediaElementSource(recording);recordingNode.connect(musicBus);recording.addEventListener('error',fallback,{once:true});void recording.play().then(()=>{if(version===generation)updateStatus({state:'playing',source:'recording'});}).catch(error=>{if(version!==generation)return;if(error?.name==='NotAllowedError')updateStatus({state:'suspended',source:'recording',reason:'Select play to enable audio.'});else fallback();});return;}catch{fallback();return;}
 }fallback();
}
export function setMusicVolume(volume:number){currentVolume=clamp(volume,currentVolume);refreshOutput();}
export function setLearningMusicPhase(phase:MusicPhase){if(!(phase in PHASE_MIX))return;if(phaseTimer)clearTimeout(phaseTimer);phaseTimer=undefined;const previous=status.phase;updateStatus({phase});if(context&&layers)for(const layer of SCORE_LAYERS)layers[layer].gain.setTargetAtTime(PHASE_MIX[phase][layer],context.currentTime,.4);if(phase==='success'||phase==='retry')phaseTimer=setTimeout(()=>setLearningMusicPhase(previous==='success'||previous==='retry'?'practice':previous),phase==='success'?3200:4400);}
/** Prepared motif identity for every recipe, plus a safe default for custom recipes. */
export function soundtrackForScaffold(scaffold:{id:string;family:string;visual?:{scene:string};ages?:string[]}):{trackId:string;reason:string}{
 const trackId=`score-${scaffold.id}`;if(scoreLookup.has(trackId))return{trackId,reason:'An original interactive score prepared for this recipe. Its layers become quieter while reading and respond gently to practice.'};
 const id=scaffold.family==='explain'?'ink-and-lantern':scaffold.family==='sequence'?'copper-lines':scaffold.visual?.scene==='ocean'?'river-notes':'quiet-orbit';return{trackId:`score-${id}`,reason:'A prepared original score with adjustable learning-phase layers.'};
}
export function musicFeedback(kind:'success'|'try-again'|'complete',scaffoldId?:string,ageGroup?:string):boolean {
 setLearningMusicPhase(kind==='try-again'?'retry':'success');if(!getSoundPreferences().enabled||ducked()||hidden())return false;const active=ensureContext();if(!active||!effectBus||active.state!=='running')return false;if(active.currentTime-lastCue<.14)return false;lastCue=active.currentTime;stopVoices(effectVoices);const plan=feedbackCuePlan(kind==='try-again'?'retry':kind,scaffoldId,ageGroup);refreshOutput();
 for(const note of [...plan.notes.map(n=>({...n,instrument:plan.instrument})),...plan.support])keepVoice(scheduleVoice(active,effectBus,{...note,at:active.currentTime+.015+note.at}),effectVoices);
 return true;
}
/** Speech and source recordings always take priority; feedback cues are suppressed. */
export function duckMusic(duck:boolean){manualDuck=duck;if(duck)stopVoices(effectVoices);refreshOutput();}
