import {RECORDINGS} from './musicRecordings';
import {MUSIC_TRACKS,INTERACTIVE_SCORES,RECORDING_TRACKS,RECORDING_PLAYBACK_GAINS} from './musicCatalog';
import {selectLearningSoundtrack,getMusicPreferences,type SoundtrackContext,type SoundtrackSelection} from './musicSelection';
export {selectLearningSoundtrack,getMusicPreferences,setMusicPreferences} from './musicSelection';
export type {SoundtrackContext,SoundtrackSelection,MusicPreferences} from './musicSelection';
import {actionCuePlan,asterCuePlan,type AsterActionCue,type GameActionCue} from './actionFeedback';
import {feedbackCuePlan} from '../data/reactionProfiles';
import {resolveGameAudioDirection} from './gameArtDirection';
import {createLayerMixer,arrangedScoreEvents,createScoreSpace,cuePitchOffset,scheduleVoice,SCORE_LAYERS} from './musicSynthesis';
import {PHASE_MIX} from './scoreTypes';
import type {InteractiveScore,MusicPhase,ScoreLayer} from './scoreTypes';
export type {MusicPhase} from './scoreTypes';
export {MUSIC_TRACKS,INTERACTIVE_SCORES} from './musicCatalog';
export type {MusicTrack} from './musicCatalog';
const scoreLookup=new Map(INTERACTIVE_SCORES.map(s=>[s.id,s]));
export interface SoundPreferences {enabled:boolean;volume:number}
const preferenceKey='asterloom:sound-preferences:v1';
const clamp=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;
let preferences:SoundPreferences={enabled:false,volume:.32},preferencesLoaded=false;
export function getSoundPreferences():SoundPreferences {listen();if(!preferencesLoaded){preferencesLoaded=true;try{const stored=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(stored&&typeof stored==='object')preferences={enabled:stored.enabled===true,volume:clamp(stored.volume,.32)};}catch{}}return{...preferences};}
export function setSoundPreferences(patch:Partial<SoundPreferences>):SoundPreferences {
 const previous=getSoundPreferences();preferences={enabled:typeof patch.enabled==='boolean'?patch.enabled:previous.enabled,volume:clamp(patch.volume,previous.volume)};
 try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{}
 if(preferences.enabled&&preferences.volume>0)ensureContext(); // Called synchronously from the explicit sound opt-in gesture.
 if(!preferences.enabled||preferences.volume<=0){stopVoices(effectVoices);stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;}
 refreshOutput();if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:sound-preferences',{detail:{...preferences}}));return{...preferences};
}
export interface MusicRuntimeStatus {state:'stopped'|'playing'|'suspended'|'unavailable';source:'recording'|'interactive'|null;trackId:string|null;phase:MusicPhase;effects?:'standard'|'quiet'|'off';reason?:string;selection?:SoundtrackSelection;phrase?:number;positionBeats?:number}
let status:MusicRuntimeStatus={state:'stopped',source:null,trackId:null,phase:'practice'};
export function getMusicRuntimeStatus():MusicRuntimeStatus{return{...status,effects:directedFeedback().policy,...(currentScore&&context?{phrase:scoreCycle,positionBeats:hidden()?pausedBeat:Math.max(0,(context.currentTime-loopStart)/(60/currentScore.bpm))}:{})};}
function updateStatus(patch:Partial<MusicRuntimeStatus>){status={...status,...patch};if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:music-status',{detail:{...status}}));}
let context:AudioContext|undefined,musicBus:GainNode|undefined,effectBus:GainNode|undefined,limiter:DynamicsCompressorNode|undefined;
let layers:Record<ScoreLayer,GainNode>|undefined,timer:ReturnType<typeof setInterval>|undefined,phaseTimer:ReturnType<typeof setTimeout>|undefined,transitionTimer:ReturnType<typeof setTimeout>|undefined;
let scoreSpace:ReturnType<typeof createScoreSpace>|undefined,learningContext:SoundtrackContext|null=null,activeVariation=0,basePhase:MusicPhase='practice',transitioning=false;
let rewardDuckUntil=0,rewardDuckLevel=1,rewardDuckTimer:ReturnType<typeof setTimeout>|undefined,lastCueKind:'success'|'try-again'|'complete'|null=null;
let pendingSelection:SoundtrackSelection|undefined,programmeKey='',programmeStep=0,scoreCycle=0,pausedBeat=0;
let recording:HTMLAudioElement|undefined,recordingNode:MediaElementAudioSourceNode|undefined,currentVolume=.15,musicWanted=false,manualDuck=false;
let currentScore:InteractiveScore|undefined,nextIndex=0,loopStart=0,generation=0,listening=false,lastCue=-Infinity,lastAction=-Infinity,lastAster=-Infinity,lastAsterKind:AsterActionCue|null=null,asterTail=0;
const musicVoices=new Set<OscillatorNode>(),effectVoices=new Set<OscillatorNode>(),actionVoices=new Set<OscillatorNode>(),asterVoices=new Set<OscillatorNode>(),playingSourceMedia=new Set<HTMLMediaElement>();
const hidden=()=>typeof document!=='undefined'&&document.visibilityState==='hidden';
function ducked():boolean {
 // Media events are asynchronous. A paused element removed in the same turn
 // cannot deliver its pause event to the document; check live state before
 // every cue's eligibility gate, including effects-only playback.
 let audible=false;
 for(const media of playingSourceMedia){
  if(media.paused||media.ended||!media.isConnected)playingSourceMedia.delete(media);
  else if(!media.muted&&media.volume>0)audible=true;
 }
 // Keep connected playing but silent elements tracked, so synchronous unmute
 // restores narration priority before its volumechange event is dispatched.
 return manualDuck||audible||(typeof window!=='undefined'&&window.speechSynthesis?.speaking===true);
}
function stopVoices(voices:Set<OscillatorNode>){for(const node of voices){try{node.stop();}catch{}}voices.clear();}
function keepVoice(node:OscillatorNode,set:Set<OscillatorNode>){set.add(node);node.addEventListener('ended',()=>set.delete(node),{once:true});}
function listen(){if(listening||typeof document==='undefined')return;listening=true;
 const prime=()=>{if((getSoundPreferences().enabled&&getSoundPreferences().volume>0)||musicWanted)ensureContext();};document.addEventListener('pointerdown',prime,{capture:true,passive:true});document.addEventListener('keydown',prime,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(hidden()){if(currentScore&&context)pausedBeat=Math.max(0,(context.currentTime-loopStart)/(60/currentScore.bpm));if(timer)clearInterval(timer);timer=undefined;recording?.pause();stopVoices(musicVoices);stopVoices(effectVoices);stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;void context?.suspend().catch(()=>{});if(musicWanted)updateStatus({state:'suspended'});}else if(musicWanted||getSoundPreferences().enabled){ensureContext();if(musicWanted){if(recording){const version=generation;void recording.play().then(()=>{if(version===generation&&musicWanted)updateStatus({state:'playing'});}).catch(()=>{if(version===generation&&musicWanted)updateStatus({state:'suspended',reason:'Select play to enable audio.'});});}else startSchedule(true);}}});
 const media=(event:Event)=>{const node=event.target;if(!(node instanceof HTMLMediaElement)||node===recording)return;if(!node.paused&&!node.ended&&node.isConnected)playingSourceMedia.add(node);else playingSourceMedia.delete(node);refreshOutput();};
 for(const event of ['play','pause','ended','volumechange'])document.addEventListener(event,media,true);
 window.addEventListener('asterloom:music-preferences',()=>{if(learningContext)applyLearningSelection();});
 window.addEventListener('storage',event=>{if(event.key===preferenceKey){preferencesLoaded=false;getSoundPreferences();if(!preferences.enabled||preferences.volume<=0){stopVoices(effectVoices);stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;}refreshOutput();window.dispatchEvent(new CustomEvent('asterloom:sound-preferences',{detail:getSoundPreferences()}));}});
}
function ensureContext():AudioContext|undefined {
 listen();if(typeof window==='undefined')return;
 try{
  if(!context||context.state==='closed'){
   const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Constructor){updateStatus({state:'unavailable',reason:'This browser does not support game audio.'});return;}
   context=new Constructor();musicBus=context.createGain();effectBus=context.createGain();limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=18;limiter.ratio.value=5;limiter.attack.value=.012;limiter.release.value=.2;musicBus.connect(limiter);effectBus.connect(limiter);limiter.connect(context.destination);refreshOutput();
  }
  const active=context,requestGeneration=generation;if(active.state==='suspended'&&!hidden())void active.resume().then(()=>{if(context===active&&generation===requestGeneration&&musicWanted)updateStatus({state:active.state==='running'?'playing':'suspended'});}).catch(()=>{if(context===active&&generation===requestGeneration&&musicWanted)updateStatus({state:'suspended',reason:'Select play to enable audio.'});});
  return context;
 }catch{updateStatus({state:'unavailable',reason:'Audio could not start in this browser.'});return;}
}
function refreshOutput(){if(!context)return;const suppressed=ducked()||hidden(),rewardLevel=context.currentTime<rewardDuckUntil?rewardDuckLevel:1;
 const phaseLevel=recording?({intro:.66,study:.44,practice:.82,quest:1,success:.85,retry:.5}[status.phase])*(RECORDING_PLAYBACK_GAINS[status.trackId??'']??1):1;
 musicBus?.gain.setTargetAtTime(musicWanted&&!hidden()&&!transitioning?currentVolume*phaseLevel*rewardLevel*(suppressed?.06:1):0,context.currentTime,.055);
 const pref=getSoundPreferences(),directed=directedFeedback();effectBus?.gain.setTargetAtTime(pref.enabled&&!suppressed&&directed.policy!=='off'?pref.volume*directed.level:0,context.currentTime,.015);
}
function stopSchedule(){if(timer)clearInterval(timer);timer=undefined;stopVoices(musicVoices);for(const node of Object.values(layers??{}))node.disconnect();layers=undefined;scoreSpace?.dispose();scoreSpace=undefined;}
function stopPlayback(){musicWanted=false;generation++;if(phaseTimer)clearTimeout(phaseTimer);phaseTimer=undefined;if(transitionTimer)clearTimeout(transitionTimer);transitionTimer=undefined;pendingSelection=undefined;transitioning=false;stopSchedule();if(recording){recording.pause();recording.removeAttribute('src');recording.load();recording=undefined;}recordingNode?.disconnect();recordingNode=undefined;currentScore=undefined;refreshOutput();updateStatus({state:'stopped',source:null,trackId:null,reason:undefined});}
export function stopMusic(){learningContext=null;programmeKey='';programmeStep=0;stopPlayback();stopVoices(effectVoices);stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;if(rewardDuckTimer)clearTimeout(rewardDuckTimer);rewardDuckTimer=undefined;rewardDuckUntil=0;rewardDuckLevel=1;lastCue=-Infinity;lastCueKind=null;updateStatus({selection:undefined});}
/** Unlock synchronously in a button handler; never required for the learning controls to work. */
export function unlockGameAudio(){
 ensureContext();
 if(musicWanted&&recording&&!hidden()){
  const active=recording,version=generation;
  void active.play().then(()=>{if(version===generation&&recording===active&&musicWanted)updateStatus({state:'playing',source:'recording',reason:undefined});}).catch(()=>{if(version===generation&&recording===active&&musicWanted)updateStatus({state:'suspended',source:'recording',reason:'Select play to enable audio.'});});
 }
}
function startSchedule(resume=false){
 if(!currentScore||!context||!musicBus||hidden())return;stopSchedule();const score=currentScore,beat=60/score.bpm;
 if(!resume){scoreCycle=0;pausedBeat=0;}
 // Keep elapsed phrase time across a hidden tab. Its AudioContext is suspended,
 // so background time cannot silently skip the music or reset it to the intro.
 while(pausedBeat>=score.beats){pausedBeat-=score.beats;scoreCycle++;}
 let events=arrangedScoreEvents(score,activeVariation,scoreCycle);
 scoreSpace=createScoreSpace(context,musicBus);layers=createLayerMixer(context,scoreSpace.input,status.phase);
 nextIndex=resume?events.findIndex(event=>event.note[0]>=pausedBeat):0;if(nextIndex<0)nextIndex=events.length;
 loopStart=context.currentTime+(resume?-pausedBeat*beat:.035);
 const tick=()=>{if(!context||!layers||!musicWanted||hidden())return;refreshOutput();if(context.state!=='running')return;const now=context.currentTime;
  // Advance transport after long task stalls instead of resetting the opening.
  if(now>=loopStart+score.beats*beat){const skipped=Math.floor((now-loopStart)/(score.beats*beat));scoreCycle+=skipped;loopStart+=skipped*score.beats*beat;events=arrangedScoreEvents(score,activeVariation,scoreCycle);nextIndex=events.findIndex(event=>loopStart+event.note[0]*beat>=now-.02);if(nextIndex<0)nextIndex=events.length;}
  // Complete four phrases before changing pieces, at a boundary rather than
  // cutting off the last scheduled notes when the scheduler reaches their end.
  if(scoreCycle>=4&&now>=loopStart&&advanceProgramme())return;
  let scheduled=0;
  while(scheduled<256){
   if(nextIndex>=events.length){if(loopStart+score.beats*beat>now+.18)break;nextIndex=0;loopStart+=score.beats*beat;scoreCycle++;events=arrangedScoreEvents(score,activeVariation,scoreCycle);if(scoreCycle>=4)break;}
   const event=events[nextIndex];if(!event)break;const at=loopStart+event.note[0]*beat;if(at>now+.18)break;
   if(at>=now-.02){const [_,duration,midi,velocity]=event.note;keepVoice(scheduleVoice(context,layers[event.layer],{at:Math.max(at,now),duration:duration*beat,midi,velocity,instrument:score.instruments[event.layer],pan:event.layer==='detail'?.32:event.layer==='melody'?-.12:0,musical:true}),musicVoices);}nextIndex++;scheduled++;
  }
 };tick();timer=setInterval(tick,60);updateStatus({state:context.state==='running'?'playing':'suspended',source:'interactive'});
}
/** Advance only a currently playing adaptive programme; pins are deliberate repeats. */
function advanceProgramme():boolean{
 if(!learningContext||!musicWanted||hidden()||pendingSelection||getMusicPreferences().mode==='pinned')return false;
 const selection=selectLearningSoundtrack({...learningContext,phase:basePhase},getMusicPreferences(),programmeStep+1);
 if((selection.playlist?.length??1)<2)return false;
 programmeStep++;applyLearningSelection();return true;
}
/** Explicit Next track action. Never opts into sound or overrides a deliberate pin. */
export function skipLearningSoundtrack():boolean{return advanceProgramme();}
export function playMusic(id:string,volume=.15){learningContext=null;programmeKey='';programmeStep=0;startPlayback(id,volume,0);}
function startPlayback(id:string,volume=.15,variation=0){
 stopPlayback();activeVariation=variation;currentVolume=clamp(volume,.15);musicWanted=true;const track=MUSIC_TRACKS.find(t=>t.id===id)??MUSIC_TRACKS[0];updateStatus({trackId:track.id,reason:undefined});const active=ensureContext();if(!active||!musicBus)return;refreshOutput();const version=generation;
 const fallback=()=>{if(!musicWanted||version!==generation)return;recording?.pause();recordingNode?.disconnect();recording=undefined;recordingNode=undefined;currentScore=scoreLookup.get(track.id)??INTERACTIVE_SCORES[RECORDING_TRACKS.findIndex(t=>t.id===track.id)%INTERACTIVE_SCORES.length]??INTERACTIVE_SCORES[0];startSchedule();};
 if(track.kind==='recording'&&typeof Audio!=='undefined'&&new Audio().canPlayType('audio/ogg; codecs=vorbis')){
  try{recording=new Audio(RECORDINGS[track.id]);recording.loop=!learningContext||getMusicPreferences().mode==='pinned';recording.preload='auto';recordingNode=active.createMediaElementSource(recording);recordingNode.connect(musicBus);refreshOutput();recording.addEventListener('error',fallback,{once:true});recording.addEventListener('ended',()=>{if(version!==generation||!musicWanted)return;if(!advanceProgramme()&&recording){recording.currentTime=0;void recording.play().catch(()=>{if(version===generation&&musicWanted)updateStatus({state:'suspended',reason:'Select play to enable audio.'});});}});void recording.play().then(()=>{if(version===generation)updateStatus({state:'playing',source:'recording'});}).catch(error=>{if(version!==generation)return;if(error?.name==='NotAllowedError')updateStatus({state:'suspended',source:'recording',reason:'Select play to enable audio.'});else fallback();});return;}catch{fallback();return;}
 }fallback();
}
export function setMusicVolume(volume:number){currentVolume=clamp(volume,currentVolume);refreshOutput();}
export function setLearningMusicPhase(phase:MusicPhase){
 if(!(phase in PHASE_MIX))return;if(phaseTimer)clearTimeout(phaseTimer);phaseTimer=undefined;
 if(phase!=='success'&&phase!=='retry')basePhase=phase;
 updateStatus({phase});if(context&&layers)for(const layer of SCORE_LAYERS)layers[layer].gain.setTargetAtTime(PHASE_MIX[phase][layer],context.currentTime,.4);
 refreshOutput();if(learningContext&&phase!=='success'&&phase!=='retry')applyLearningSelection();
 if(musicWanted&&(phase==='success'||phase==='retry'))phaseTimer=setTimeout(()=>setLearningMusicPhase(basePhase),phase==='success'?3200:4400);
}
function applyLearningSelection(){
 if(!learningContext)return;
 const preferences=getMusicPreferences(),initial=selectLearningSoundtrack({...learningContext,phase:basePhase},preferences);
 const key=initial.contextKey+'|'+initial.arrangement+'|'+initial.mode+(initial.mode==='pinned'?'|'+initial.trackId:'');
 if(key!==programmeKey){programmeKey=key;programmeStep=0;}
 const selection=selectLearningSoundtrack({...learningContext,phase:basePhase},preferences,programmeStep);updateStatus({selection});
 if(recording)recording.loop=selection.mode==='pinned';
 if(!musicWanted)return;
 if(status.trackId===selection.trackId&&activeVariation===selection.variation){if(transitionTimer)clearTimeout(transitionTimer);transitionTimer=undefined;pendingSelection=undefined;transitioning=false;refreshOutput();return;}
 if(pendingSelection?.trackId===selection.trackId&&pendingSelection.variation===selection.variation)return;
 if(transitionTimer)clearTimeout(transitionTimer);
 pendingSelection=selection;
 if(status.trackId){transitioning=true;refreshOutput();transitionTimer=setTimeout(()=>{transitionTimer=undefined;pendingSelection=undefined;transitioning=false;if(!musicWanted||!learningContext)return;startPlayback(selection.trackId,currentVolume,selection.variation);updateStatus({selection});},160);}
 else{startPlayback(selection.trackId,currentVolume,selection.variation);updateStatus({selection});}
}
/** One owner in App synchronizes context. Preferences never opt a muted learner back into sound. */
export function syncLearningSoundtrack(next:SoundtrackContext|null,{enabled,volume}:{enabled:boolean;volume:number}):SoundtrackSelection|null {
 listen();currentVolume=clamp(volume,currentVolume);
 if(!next){stopMusic();return null;}
 const changed=next.notebookId!==learningContext?.notebookId||next.missionId!==learningContext?.missionId||next.scaffoldId!==learningContext?.scaffoldId||next.activityKind!==learningContext?.activityKind||next.missionIndex!==learningContext?.missionIndex||next.theme!==learningContext?.theme||next.phase!==learningContext?.phase;
 learningContext={...next};
 if(changed&&next.phase&&next.phase in PHASE_MIX&&next.phase!=='success'&&next.phase!=='retry'){basePhase=next.phase;updateStatus({phase:basePhase});if(context&&layers)for(const layer of SCORE_LAYERS)layers[layer].gain.setTargetAtTime(PHASE_MIX[basePhase][layer],context.currentTime,.4);}
 if(!enabled){programmeStep=0;programmeKey='';stopPlayback();learningContext={...next};const selection=selectLearningSoundtrack({...next,phase:basePhase});updateStatus({selection,phase:basePhase});return selection;}
 if(!musicWanted){musicWanted=true;updateStatus({phase:basePhase});}
 applyLearningSelection();refreshOutput();return status.selection??null;
}
/** Prepared motif identity for every recipe, plus a safe default for custom recipes. */
export function soundtrackForScaffold(scaffold:{id:string;family:string;visual?:{scene:string};ages?:string[]}):{trackId:string;reason:string}{
 const trackId=`score-${scaffold.id}`;if(scoreLookup.has(trackId))return{trackId,reason:'An original interactive score prepared for this recipe. Its layers become quieter while reading and respond gently to practice.'};
 const id=scaffold.family==='explain'?'ink-and-lantern':scaffold.family==='sequence'?'copper-lines':scaffold.visual?.scene==='ocean'?'river-notes':'quiet-orbit';return{trackId:`score-${id}`,reason:'A prepared original score with adjustable learning-phase layers.'};
}
function directedFeedback(scaffoldId?:string,ageGroup?:string){
 const direction=learningContext&&resolveGameAudioDirection(learningContext.artDirection,{...learningContext,...(scaffoldId?{scaffoldId}:{}),...(ageGroup?{ageGroup}:{})});
 return{profileId:direction?.effectProfileId??scaffoldId,policy:direction?.effects??'standard',level:direction?.effects==='quiet'?.55:1};
}
/** Give committed results an audible foreground without turning up the user's mix.
 * A completion supersedes the final answer's short cue instead of being lost to
 * click-rate limiting. Duplicate completions still stay silent. */
function playRewardCue(kind:'success'|'try-again'|'complete',scaffoldId?:string,ageGroup?:string):boolean {
 try {
 const directed=directedFeedback(scaffoldId,ageGroup);
 if(directed.policy==='off'||!getSoundPreferences().enabled||getSoundPreferences().volume<=0||ducked()||hidden())return false;
 const active=ensureContext();if(!active||!effectBus||active.state!=='running')return false;
 if(active.currentTime-lastCue<.14&&!(kind==='complete'&&lastCueKind==='success'))return false;
 lastCue=active.currentTime;lastCueKind=kind;
 stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;stopVoices(effectVoices);
 const plan=feedbackCuePlan(kind==='try-again'?'retry':kind,directed.profileId,ageGroup);
 if(rewardDuckTimer)clearTimeout(rewardDuckTimer);
 rewardDuckUntil=active.currentTime+plan.maxDuration;rewardDuckLevel=kind==='complete'?.24:kind==='success'?.4:.7;
 refreshOutput();
 rewardDuckTimer=setTimeout(()=>{rewardDuckTimer=undefined;rewardDuckUntil=0;rewardDuckLevel=1;try{refreshOutput();}catch{feedbackUnavailable();}},Math.ceil(plan.maxDuration*1000));
 const notes=[...plan.notes.map(n=>({...n,instrument:plan.instrument})),...plan.support],offset=cuePitchOffset(Math.min(...notes.map(note=>note.midi)),currentScore?.tonic);
 for(const note of notes)keepVoice(scheduleVoice(active,effectBus,{...note,midi:note.midi+offset,at:active.currentTime+.015+note.at}),effectVoices);
 return true;
 }catch{return feedbackUnavailable();}
}
export function musicFeedback(kind:'success'|'try-again'|'complete',scaffoldId?:string,ageGroup?:string):boolean {
 setLearningMusicPhase(kind==='try-again'?'retry':'success');
 return playRewardCue(kind,scaffoldId,ageGroup);
}
/** A labeled, user-triggered sound check. It never awards points or changes the lesson phase. */
export function previewRewardSound():boolean {
 return playRewardCue('complete',learningContext?.scaffoldId,learningContext?.ageGroup);
}
/** Speech and source recordings always take priority; feedback cues are suppressed. */
export function duckMusic(duck:boolean){manualDuck=duck;if(duck){stopVoices(effectVoices);stopVoices(actionVoices);stopVoices(asterVoices);asterTail=0;}refreshOutput();}

/** Immediate action acknowledgment; grading cues have priority and no points are implied. */
export function gameActionFeedback(kind:GameActionCue|null,scaffoldId?:string,ageGroup?:string):boolean {
 try {
 const directed=directedFeedback(scaffoldId,ageGroup);if(!kind||directed.policy==='off'||!getSoundPreferences().enabled||getSoundPreferences().volume<=0||ducked()||hidden())return false;
 const active=ensureContext();if(!active||!effectBus||active.state!=='running'||active.currentTime-lastCue<.85||active.currentTime-lastAction<.085)return false;
 lastAction=active.currentTime;stopVoices(actionVoices);refreshOutput();const plan=actionCuePlan(kind,directed.profileId,ageGroup);
 const anchor=Math.min(...plan.notes.map(note=>note.midi))-(kind==='remove'?-5:kind==='inspect'?7:0),offset=cuePitchOffset(anchor,currentScore?.tonic);
 for(const note of plan.notes)keepVoice(scheduleVoice(active,effectBus,{...note,midi:note.midi+offset,instrument:plan.instrument,at:active.currentTime+.008+note.at}),actionVoices);
 return true;
 }catch{return feedbackUnavailable();}
}
function feedbackUnavailable():false {
 if(rewardDuckTimer)clearTimeout(rewardDuckTimer);rewardDuckTimer=undefined;rewardDuckUntil=0;rewardDuckLevel=1;try{refreshOutput();}catch{}
 stopVoices(actionVoices);stopVoices(effectVoices);stopVoices(asterVoices);asterTail=0;
 // Optional presentation must never prevent a move or turn a committed result into a save error.
 updateStatus({state:'unavailable',reason:'Game feedback audio is unavailable. Your game and progress still work.'});return false;
}

/** Companion cues are independent of music. Automatic moments use an already
 * running context only; an explicit open/ask gesture may unlock audio. */
export function asterFeedback(kind:AsterActionCue,ageGroup?:string):boolean {
 try{
  const directed=directedFeedback(undefined,ageGroup);
  if(directed.policy==='off'||!getSoundPreferences().enabled||getSoundPreferences().volume<=0||ducked()||hidden())return false;
  const active=kind==='open'||kind==='ask'?ensureContext():context;
  if(!active||active.state!=='running'||!effectBus||active.currentTime-lastCue<.85)return false;
  if(kind==='notice'&&active.currentTime<asterTail)return false;
  if(kind===lastAsterKind&&active.currentTime-lastAster<.18)return false;
  // A local answer can arrive in the same turn as Ask. Let the short ask motif
  // finish, with a bounded scheduled answer that mute/duck cancels immediately.
  if(kind!=='answer'&&active.currentTime-lastAster<.09)return false;
  if(kind!=='answer'){stopVoices(asterVoices);asterTail=0;}
  const plan=asterCuePlan(kind,ageGroup),start=kind==='answer'?Math.min(active.currentTime+.35,Math.max(active.currentTime+.012,asterTail)):active.currentTime+.012;
  lastAster=active.currentTime;lastAsterKind=kind;refreshOutput();
  for(const note of plan.notes)keepVoice(scheduleVoice(active,effectBus,{...note,instrument:plan.instrument,at:start+note.at}),asterVoices);
  asterTail=start+plan.maxDuration;return true;
 }catch{return feedbackUnavailable();}
}
