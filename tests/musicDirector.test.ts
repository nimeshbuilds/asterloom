import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {INTERACTIVE_SCORES,MUSIC_TRACKS} from '../src/lib/musicCatalog';
import {selectLearningSoundtrack,type SoundtrackContext} from '../src/lib/musicSelection';
import {audioDirectionCatalog,type GameAudioDirection} from '../src/lib/gameArtDirection';
import {arrangedScoreEvents,cuePitchOffset} from '../src/lib/musicSynthesis';
const adaptive={mode:'adaptive' as const,trackId:'first-light'};
const context:SoundtrackContext={notebookId:'plant-notebook',missionId:'seed-mission',missionIndex:0,scaffoldId:'recall-escape-mission',theme:'islands',ageGroup:'adult',phase:'quest'};

describe('source-game soundtrack selection',()=>{
 it('walks a compatible musical palette across missions instead of replaying one recall track',()=>{
  const choices=Array.from({length:6},(_,missionIndex)=>selectLearningSoundtrack({...context,missionIndex,missionId:`mission-${missionIndex}`},adaptive));
  expect(new Set(choices.map(choice=>choice.trackId)).size).toBeGreaterThanOrEqual(3);
  expect(choices.every((choice,i)=>i===0||choice.trackId!==choices[i-1].trackId)).toBe(true);
  expect(selectLearningSoundtrack({...context},adaptive)).toEqual(selectLearningSoundtrack({...context},adaptive));
  expect(selectLearningSoundtrack({...context,phase:'practice'},adaptive).trackId).toBe(choices[0].trackId);
  const games=['sequence','classification','construction','explanation','diagram'].map(activityKind=>selectLearningSoundtrack({notebookId:'project',activityKind,missionId:'one',phase:'quest',ageGroup:'adult'},adaptive));
  expect(new Set(games.map(choice=>choice.trackId)).size).toBeGreaterThanOrEqual(4);
 });
 it('keeps every recipe selection within its actual mechanic and age palette',()=>{
  for(const scaffold of SCAFFOLDS){const ageGroup=scaffold.ages.includes('adult')?'adult':scaffold.ages[0];for(let missionIndex=0;missionIndex<8;missionIndex++){
   const selected=selectLearningSoundtrack({notebookId:'age-test',scaffoldId:scaffold.id,ageGroup,missionIndex,phase:'quest'},adaptive);
   const score=INTERACTIVE_SCORES.find(score=>score.id===selected.trackId)!;const owner=SCAFFOLDS.find(candidate=>candidate.id===score.scaffoldId)!;
   expect(owner.family,scaffold.id).toBe(scaffold.family);expect(owner.ages,scaffold.id).toContain(ageGroup);expect(owner.visual.scene,scaffold.id).toBe(scaffold.visual.scene);
  }}
 });
 it('uses different recorded study music and honours a deliberately pinned choice across contexts',()=>{
  const study=selectLearningSoundtrack({...context,phase:'study'},adaptive),quest=selectLearningSoundtrack(context,adaptive);
  expect(MUSIC_TRACKS.find(track=>track.id===study.trackId)?.kind).toBe('recording');expect(MUSIC_TRACKS.find(track=>track.id===quest.trackId)?.kind).toBe('interactive');
  for(const phase of ['intro','study','practice','quest'] as const)expect(selectLearningSoundtrack({...context,notebookId:'different',phase},{mode:'pinned',trackId:'moon-library'})).toMatchObject({trackId:'moon-library',mode:'pinned',variation:0});
  expect(new Set(['notebook-a','notebook-b','notebook-c','notebook-d'].map(notebookId=>selectLearningSoundtrack({...context,notebookId},adaptive).trackId)).size).toBeGreaterThan(1);
 });
 it('advances an authored opening through a compatible deterministic playlist while pins repeat',()=>{
  const catalog=audioDirectionCatalog(context),artDirection:GameAudioDirection={version:1,playTrackId:catalog.playTracks[1].id,studyTrackId:catalog.studyTracks[0].id,effectProfileId:catalog.effectProfiles[0].id,effects:'standard'};
  for(const phase of ['study','quest'] as const){const directed={...context,phase,artDirection},first=selectLearningSoundtrack(directed,adaptive);expect(first.trackId).toBe(phase==='study'?artDirection.studyTrackId:artDirection.playTrackId);expect(first.playlist!.length).toBeGreaterThan(1);
   const allowed=(phase==='study'?catalog.studyTracks:catalog.playTracks).map(track=>track.id);
   const programme=first.playlist!.map((_,step)=>selectLearningSoundtrack(directed,adaptive,step));expect(new Set(programme.map(item=>item.trackId)).size).toBe(programme.length);expect(programme.every(item=>allowed.includes(item.trackId))).toBe(true);
   expect(selectLearningSoundtrack(directed,adaptive,programme.length).trackId).toBe(first.trackId);
   expect(selectLearningSoundtrack(directed,{mode:'pinned',trackId:first.trackId},8)).toMatchObject({trackId:first.trackId,playlist:[first.trackId],progression:0});
  }
 });
 it('changes harmony and melodic register across long form sections for every procedural score',()=>{
  for(const score of INTERACTIVE_SCORES){const original=JSON.stringify(score);const foundation=(cycle:number)=>arrangedScoreEvents(score,0,cycle).filter(event=>event.layer==='foundation').map(event=>event.note[2]);
   expect(foundation(2),score.id).not.toEqual(foundation(0));
   const sections=Array.from({length:8},(_,cycle)=>arrangedScoreEvents(score,0,cycle));expect(new Set(sections.map(events=>JSON.stringify(events))).size,score.id).toBeGreaterThanOrEqual(6);
   for(const events of sections)for(const {note} of events){expect(note[0]+note[1]).toBeLessThanOrEqual(score.beats);expect(note[2]).toBeGreaterThanOrEqual(28);expect(note[2]).toBeLessThanOrEqual(96);}
   expect(JSON.stringify(score)).toBe(original);
  }
 });
 it('keeps sound-effect tonal centres aligned with a prepared score without changing contour or loudness',()=>{
  for(const anchor of [52,60,67,75])for(const tonic of [48,50,52,53,55,57]){const offset=cuePitchOffset(anchor,tonic);expect(offset).toBeGreaterThanOrEqual(-6);expect(offset).toBeLessThanOrEqual(5);expect((anchor+offset)%12).toBe(tonic%12);expect((anchor+7+offset)-(anchor+offset)).toBe(7);}
  expect(cuePitchOffset(60)).toBe(0);expect(cuePitchOffset(60,NaN)).toBe(0);
 });
 it('develops eight existing phrase arrangements without rewriting catalog notes or inventing new tracks',()=>{
  const score=INTERACTIVE_SCORES.find(score=>score.scaffoldId==='step-train')!,original=JSON.stringify(score);
  const variations=Array.from({length:8},(_,variation)=>arrangedScoreEvents(score,variation,0));
  expect(new Set(variations.map(notes=>JSON.stringify(notes))).size).toBe(8);
  for(const events of variations){expect(events.length).toBeGreaterThan(20);for(const event of events){expect(event.note.every(Number.isFinite)).toBe(true);expect(event.note[0]).toBeGreaterThanOrEqual(0);expect(event.note[0]+event.note[1]).toBeLessThanOrEqual(score.beats);expect(event.note[3]).toBeGreaterThan(0);expect(event.note[3]).toBeLessThanOrEqual(.5);}}
  expect(arrangedScoreEvents(score,0,3).length).toBeLessThan(arrangedScoreEvents(score,0,2).length);expect(JSON.stringify(score)).toBe(original);expect(MUSIC_TRACKS).toHaveLength(100);
 });
});

class AudioParameter {value=0;setValueAtTime(value:number){this.value=value;}setTargetAtTime(value:number){this.value=value;}exponentialRampToValueAtTime(value:number){this.value=value;}}
class AudioNodeMock extends EventTarget {gain=new AudioParameter();frequency=new AudioParameter();Q=new AudioParameter();pan=new AudioParameter();delayTime=new AudioParameter();threshold=new AudioParameter();knee=new AudioParameter();ratio=new AudioParameter();attack=new AudioParameter();release=new AudioParameter();type='';disconnected=false;startedAt:number[]=[];stopCalls:(number|undefined)[]=[];onended?:()=>void;connect(){return this;}disconnect(){this.disconnected=true;}setPeriodicWave(){}start(at=0){this.startedAt.push(at);}stop(at?:number){this.stopCalls.push(at);if(at===undefined){this.onended?.();this.dispatchEvent(new Event('ended'));}}}
class AudioContextMock {static instances:AudioContextMock[]=[];state='running';destination=new AudioNodeMock();started=Date.now();oscillators:AudioNodeMock[]=[];gains:AudioNodeMock[]=[];get currentTime(){return(Date.now()-this.started)/1000;}constructor(){AudioContextMock.instances.push(this);}createGain(){const gain=new AudioNodeMock();this.gains.push(gain);return gain;}createBiquadFilter(){return new AudioNodeMock();}createDynamicsCompressor(){return new AudioNodeMock();}createStereoPanner(){return new AudioNodeMock();}createDelay(){return new AudioNodeMock();}createMediaElementSource(){return new AudioNodeMock();}createPeriodicWave(){return{};}createOscillator(){const oscillator=new AudioNodeMock();this.oscillators.push(oscillator);return oscillator;}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}}
let storage:Map<string,string>;
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();storage=new Map();AudioContextMock.instances=[];vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});const win=Object.assign(new EventTarget(),{AudioContext:AudioContextMock});vi.stubGlobal('window',win);vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));vi.stubGlobal('Audio',class{canPlayType(){return'';}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

describe('soundtrack persistence and lifecycle',()=>{
 it('preserves the explicit choice across reload while migrating old automatic last-track settings',async()=>{
  storage.set('asterloom-setting:music','score-recall-escape-mission');const music=await import('../src/lib/musicSelection');
  expect(music.getMusicPreferences()).toEqual({mode:'adaptive',trackId:'score-recall-escape-mission'});
  music.setMusicPreferences({mode:'pinned',trackId:'homeward'});vi.resetModules();const reloaded=await import('../src/lib/musicSelection');expect(reloaded.getMusicPreferences()).toEqual({mode:'pinned',trackId:'homeward'});
  reloaded.setMusicPreferences({trackId:'missing-track'});expect(reloaded.getMusicPreferences().trackId).toBe('homeward');
 });
 it('retains preferences in memory when durable browser storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}});const music=await import('../src/lib/musicSelection');
  expect(()=>music.setMusicPreferences({mode:'pinned',trackId:'tidepool'})).not.toThrow();expect(music.getMusicPreferences()).toEqual({mode:'pinned',trackId:'tidepool'});
 });
 it('never creates audio while muted, including automatic preferences and chapter changes',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:false,volume:.2});music.setMusicPreferences({mode:'pinned',trackId:'score-step-train'});music.syncLearningSoundtrack({...context,missionIndex:1},{enabled:false,volume:.3});
  expect(AudioContextMock.instances).toHaveLength(0);expect(music.getMusicRuntimeStatus().state).toBe('stopped');expect(vi.getTimerCount()).toBe(0);music.stopMusic();
 });
 it('does not restart music on identical context or volume updates and cancels pending transitions on mute',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:true,volume:.2});const audio=AudioContextMock.instances[0],opening=audio.oscillators.length;
  for(let i=0;i<5;i++)music.syncLearningSoundtrack({...context},{enabled:true,volume:.2+i*.01});expect(audio.oscillators).toHaveLength(opening);expect(AudioContextMock.instances).toHaveLength(1);expect(vi.getTimerCount()).toBe(1);
  music.syncLearningSoundtrack({...context,missionId:'next',missionIndex:1},{enabled:true,volume:.2});expect(vi.getTimerCount()).toBe(2);
  music.syncLearningSoundtrack({...context,missionIndex:1},{enabled:false,volume:.2});const stopped=audio.oscillators.length;vi.advanceTimersByTime(10000);expect(audio.oscillators).toHaveLength(stopped);expect(vi.getTimerCount()).toBe(0);expect(music.getMusicRuntimeStatus().state).toBe('stopped');music.stopMusic();
 });
 it('cancels a pending switch when navigation returns to the already playing mission',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:true,volume:.2});const audio=AudioContextMock.instances[0],opening=audio.oscillators.length;
  music.syncLearningSoundtrack({...context,missionIndex:1},{enabled:true,volume:.2});music.syncLearningSoundtrack(context,{enabled:true,volume:.2});expect(vi.getTimerCount()).toBe(1);expect(audio.oscillators).toHaveLength(opening);expect(music.getMusicRuntimeStatus().trackId).toBe(music.selectLearningSoundtrack(context).trackId);music.stopMusic();
 });
 it('keeps only the newest rapid transition and clears success timers on exit',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:true,volume:.2});music.syncLearningSoundtrack({...context,missionIndex:1},{enabled:true,volume:.2});const finalContext={...context,missionIndex:2};music.syncLearningSoundtrack(finalContext,{enabled:true,volume:.2});vi.advanceTimersByTime(170);
  expect(music.getMusicRuntimeStatus().trackId).toBe(music.selectLearningSoundtrack(finalContext).trackId);expect(vi.getTimerCount()).toBe(1);
  music.setLearningMusicPhase('success');expect(vi.getTimerCount()).toBe(2);music.stopMusic();const snapshot=music.getMusicRuntimeStatus();vi.advanceTimersByTime(10000);expect(music.getMusicRuntimeStatus()).toEqual(snapshot);expect(vi.getTimerCount()).toBe(0);
 });
 it('uses saved AI choices offline, respects a pin, and applies the game effect ceiling without opting into sound',async()=>{
  const music=await import('../src/lib/music');const catalog=audioDirectionCatalog(context);
  const direction:GameAudioDirection={version:1,playTrackId:catalog.playTracks[1].id,studyTrackId:catalog.studyTracks[0].id,effectProfileId:catalog.effectProfiles[1].id,effects:'quiet'};
  const directed={...context,artDirection:direction};music.syncLearningSoundtrack(directed,{enabled:false,volume:.2});expect(AudioContextMock.instances).toHaveLength(0);expect(music.musicFeedback('success',context.scaffoldId,'adult')).toBe(false);
  music.setSoundPreferences({enabled:true,volume:.4});music.syncLearningSoundtrack(directed,{enabled:true,volume:.2});const audio=AudioContextMock.instances[0];expect(music.getMusicRuntimeStatus().trackId).toBe(direction.playTrackId);expect(music.getMusicRuntimeStatus().selection?.effectProfileId).toBe(direction.effectProfileId);expect(audio.gains[1].gain.value).toBeCloseTo(.22);
  music.setMusicPreferences({mode:'pinned',trackId:'score-quiet-orbit'});vi.advanceTimersByTime(170);expect(music.getMusicRuntimeStatus().trackId).toBe('score-quiet-orbit');expect(audio.gains[1].gain.value).toBeCloseTo(.22);
  music.syncLearningSoundtrack({...directed,artDirection:{...direction,effects:'off'}},{enabled:true,volume:.2});expect(audio.gains[1].gain.value).toBe(0);expect(music.musicFeedback('success',context.scaffoldId,'adult')).toBe(false);expect(music.gameActionFeedback('place',context.scaffoldId,'adult')).toBe(false);
  music.stopMusic();expect(vi.getTimerCount()).toBe(0);
 });
 it('actually synthesizes the directed effect profile rather than the original recipe motif',async()=>{
  const music=await import('../src/lib/music'),{actionCuePlan}=await import('../src/lib/actionFeedback');const catalog=audioDirectionCatalog(context);
  const direction:GameAudioDirection={version:1,playTrackId:catalog.playTracks[0].id,studyTrackId:catalog.studyTracks[0].id,effectProfileId:catalog.effectProfiles.find(profile=>profile.id!==context.scaffoldId)!.id,effects:'standard'};
  music.syncLearningSoundtrack({...context,artDirection:direction},{enabled:false,volume:.2});music.setSoundPreferences({enabled:true,volume:.4});const audio=AudioContextMock.instances[0],start=audio.oscillators.length;
  expect(music.gameActionFeedback('place',context.scaffoldId,'adult')).toBe(true);const added=audio.oscillators.slice(start);const expected=actionCuePlan('place',direction.effectProfileId,'adult');const frequencies=expected.notes.map(note=>440*2**((note.midi-69)/12));
  for(const frequency of frequencies)expect(added.some(node=>Math.abs(node.frequency.value-frequency)<.001)).toBe(true);
  music.setSoundPreferences({enabled:false});music.stopMusic();
 });

 it('rotates after four complete procedural phrases and preserves the progression during UI updates',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:true,volume:.2});const first=music.getMusicRuntimeStatus(),score=INTERACTIVE_SCORES.find(score=>score.id===first.trackId)!;
  vi.advanceTimersByTime(score.beats*60/score.bpm*4*1000+400);
  const next=music.getMusicRuntimeStatus();expect(next.selection?.progression).toBe(1);expect(next.trackId).not.toBe(first.trackId);expect(next.trackId).toBe(next.selection?.playlist?.[1]);
  const count=AudioContextMock.instances[0].oscillators.length;music.syncLearningSoundtrack({...context},{enabled:true,volume:.3});expect(music.getMusicRuntimeStatus().trackId).toBe(next.trackId);expect(AudioContextMock.instances[0].oscillators).toHaveLength(count);
  music.stopMusic();expect(vi.getTimerCount()).toBe(0);
 });
 it('resumes the existing phrase after hiding, and does not restart its opening',async()=>{
  const music=await import('../src/lib/music');music.syncLearningSoundtrack(context,{enabled:true,volume:.2});const score=INTERACTIVE_SCORES.find(score=>score.id===music.getMusicRuntimeStatus().trackId)!;
  vi.advanceTimersByTime((score.beats+6)*60/score.bpm*1000);const before=music.getMusicRuntimeStatus();expect(before.phrase).toBe(1);
  Object.assign(document,{visibilityState:'hidden'});document.dispatchEvent(new Event('visibilitychange'));expect(vi.getTimerCount()).toBe(0);vi.advanceTimersByTime(60000);Object.assign(document,{visibilityState:'visible'});document.dispatchEvent(new Event('visibilitychange'));
  const after=music.getMusicRuntimeStatus();expect(after.phrase).toBe(before.phrase);expect(after.positionBeats).toBeCloseTo(before.positionBeats!,5);expect(vi.getTimerCount()).toBe(1);music.stopMusic();
 });
 it('advances real recording ended events, while explicit pin and muted skip remain authoritative',async()=>{
  class Recording extends EventTarget{static all:Recording[]=[];loop=false;paused=true;currentTime=0;preload='';src='';constructor(src=''){super();this.src=src;Recording.all.push(this);}canPlayType(){return'probably';}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}}
  vi.stubGlobal('Audio',Recording);const music=await import('../src/lib/music');const study={...context,phase:'study' as const};music.syncLearningSoundtrack(study,{enabled:true,volume:.2});await Promise.resolve();
  const first=music.getMusicRuntimeStatus().trackId,recording=Recording.all.at(-1)!;expect(recording.loop).toBe(false);recording.dispatchEvent(new Event('ended'));vi.advanceTimersByTime(170);await Promise.resolve();expect(recording.paused).toBe(true);expect(music.getMusicRuntimeStatus().trackId).not.toBe(first);expect(music.getMusicRuntimeStatus().selection?.progression).toBe(1);
  const second=Recording.all.at(-1)!;music.setMusicPreferences({mode:'pinned',trackId:music.getMusicRuntimeStatus().trackId!});expect(second.loop).toBe(true);expect(music.skipLearningSoundtrack()).toBe(false);
  music.setMusicPreferences({mode:'adaptive'});vi.advanceTimersByTime(170);expect(Recording.all.at(-1)!.loop).toBe(false);expect(music.skipLearningSoundtrack()).toBe(true);expect(music.skipLearningSoundtrack()).toBe(false);music.syncLearningSoundtrack(study,{enabled:false,volume:.2});expect(music.skipLearningSoundtrack()).toBe(false);vi.advanceTimersByTime(500);expect(music.getMusicRuntimeStatus().state).toBe('stopped');music.stopMusic();
 });
 it('never creates silent effect voices at zero volume and cancels queued companion audio',async()=>{
  const music=await import('../src/lib/music');music.setSoundPreferences({enabled:true,volume:0});expect(AudioContextMock.instances).toHaveLength(0);
  expect(music.musicFeedback('success')).toBe(false);expect(music.gameActionFeedback('place')).toBe(false);expect(music.asterFeedback('open')).toBe(false);expect(AudioContextMock.instances).toHaveLength(0);
  music.setSoundPreferences({enabled:true,volume:.3});expect(music.asterFeedback('ask')).toBe(true);expect(music.asterFeedback('answer')).toBe(true);const voices=AudioContextMock.instances[0].oscillators;expect(voices.length).toBeGreaterThan(1);music.setSoundPreferences({volume:0});expect(voices.every(node=>node.stopCalls.includes(undefined))).toBe(true);
 });
 it('keeps automatic companion notices quiet until unlocked and sequences immediate answers',async()=>{
  storage.set('asterloom:sound-preferences:v1',JSON.stringify({enabled:true,volume:.3}));const music=await import('../src/lib/music');expect(music.asterFeedback('notice')).toBe(false);expect(music.asterFeedback('answer')).toBe(false);expect(AudioContextMock.instances).toHaveLength(0);
  expect(music.asterFeedback('ask')).toBe(true);const audio=AudioContextMock.instances[0],asked=audio.oscillators.length;expect(music.asterFeedback('answer')).toBe(true);expect(music.asterFeedback('answer')).toBe(false);
  const answers=audio.oscillators.slice(asked);expect(answers.length).toBeGreaterThan(0);expect(Math.min(...answers.flatMap(node=>node.startedAt))).toBeGreaterThan(.1);expect(Math.min(...answers.flatMap(node=>node.startedAt))).toBeLessThanOrEqual(.35);
  music.duckMusic(true);expect(audio.oscillators.every(node=>node.stopCalls.includes(undefined))).toBe(true);expect(music.asterFeedback('notice')).toBe(false);music.duckMusic(false);vi.advanceTimersByTime(1000);expect(music.asterFeedback('open')).toBe(true);
  const before=audio.oscillators.length;expect(music.musicFeedback('complete')).toBe(true);expect(audio.oscillators.slice(0,before).every(node=>node.stopCalls.includes(undefined))).toBe(true);expect(music.asterFeedback('notice')).toBe(false);
  vi.advanceTimersByTime(1000);Object.assign(document,{visibilityState:'hidden'});expect(music.asterFeedback('open')).toBe(false);music.stopMusic();
 });

 it('rechecks source media before cue eligibility when lifecycle events cannot bubble to the document',async()=>{
  class SourceMedia {paused=false;ended=false;muted=false;volume=1;isConnected=true;}
  vi.stubGlobal('HTMLMediaElement',SourceMedia);const music=await import('../src/lib/music');music.setSoundPreferences({enabled:true,volume:.3});const audio=AudioContextMock.instances[0];
  const play=(media:SourceMedia)=>{const event=new Event('play');Object.defineProperty(event,'target',{value:media});document.dispatchEvent(event);};
  for(const change of [(m:SourceMedia)=>{m.paused=true;},(m:SourceMedia)=>{m.ended=true;},(m:SourceMedia)=>{m.isConnected=false;},(m:SourceMedia)=>{m.muted=true;},(m:SourceMedia)=>{m.volume=0;}]){
   const media=new SourceMedia();play(media);const before=audio.oscillators.length;expect(music.asterFeedback('ask')).toBe(false);expect(music.gameActionFeedback('place')).toBe(false);expect(audio.oscillators).toHaveLength(before);change(media);
   // No pause/ended/volumechange dispatch: removal can lose the event, and
   // property changes take effect before their asynchronous event is delivered.
   vi.advanceTimersByTime(1000);expect(music.asterFeedback('ask')).toBe(true);expect(music.asterFeedback('answer')).toBe(true);expect(music.gameActionFeedback('place')).toBe(true);expect(audio.gains[1].gain.value).toBeGreaterThan(0);expect(audio.oscillators.length).toBeGreaterThan(before);
  }
  music.setSoundPreferences({enabled:false});music.stopMusic();expect(vi.getTimerCount()).toBe(0);
 });
 it('keeps all genuinely audible sources authoritative, including synchronous unmute and manual narration',async()=>{
  class SourceMedia {paused=false;ended=false;muted=false;volume=1;isConnected=true;}
  vi.stubGlobal('HTMLMediaElement',SourceMedia);const music=await import('../src/lib/music');music.setSoundPreferences({enabled:true,volume:.3});const first=new SourceMedia(),second=new SourceMedia();
  const play=(media:SourceMedia)=>{const event=new Event('play');Object.defineProperty(event,'target',{value:media});document.dispatchEvent(event);};play(first);play(second);first.paused=true;first.isConnected=false;expect(music.asterFeedback('ask')).toBe(false);expect(music.musicFeedback('success')).toBe(false);
  second.muted=true;expect(music.asterFeedback('ask')).toBe(true);vi.advanceTimersByTime(1000);second.muted=false;expect(music.asterFeedback('ask')).toBe(false);second.volume=0;expect(music.gameActionFeedback('place')).toBe(true);vi.advanceTimersByTime(1000);second.volume=1;expect(music.gameActionFeedback('place')).toBe(false);second.paused=true;
  music.duckMusic(true);expect(music.asterFeedback('ask')).toBe(false);music.duckMusic(false);Object.assign(window,{speechSynthesis:{speaking:true}});expect(music.asterFeedback('ask')).toBe(false);Object.assign(window,{speechSynthesis:{speaking:false}});expect(music.asterFeedback('ask')).toBe(true);music.setSoundPreferences({enabled:false});music.stopMusic();
 });

 it('retries a blocked recording from an explicit gesture without replaying music after mute',async()=>{
  class Recording extends EventTarget{static all:Recording[]=[];loop=false;paused=true;currentTime=0;preload='';src='';plays=0;constructor(src=''){super();this.src=src;Recording.all.push(this);}canPlayType(){return'probably';}play(){this.plays++;if(this.plays===1)return Promise.reject(Object.assign(new Error('gesture needed'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}}
  vi.stubGlobal('Audio',Recording);const music=await import('../src/lib/music');music.syncLearningSoundtrack({...context,phase:'study'},{enabled:true,volume:.2});await Promise.resolve();await Promise.resolve();expect(music.getMusicRuntimeStatus().state).toBe('suspended');const audio=Recording.all.at(-1)!;
  music.unlockGameAudio();await Promise.resolve();expect(audio.plays).toBe(2);expect(music.getMusicRuntimeStatus().state).toBe('playing');expect(music.getMusicRuntimeStatus().reason).toBeUndefined();
  music.stopMusic();music.unlockGameAudio();await Promise.resolve();expect(audio.plays).toBe(2);expect(music.getMusicRuntimeStatus().state).toBe('stopped');
 });

});

describe('reward cue foreground and completion priority',()=>{
 it('promotes the final successful answer into a completion fanfare and restores the score mix',async()=>{
  const music=await import('../src/lib/music');
  music.setSoundPreferences({enabled:true,volume:.32});
  music.syncLearningSoundtrack(context,{enabled:true,volume:.2});
  const audio=AudioContextMock.instances[0],scoreLevel=audio.gains[0].gain.value;
  expect(music.musicFeedback('success',context.scaffoldId,'adult')).toBe(true);
  expect(audio.gains[0].gain.value).toBeCloseTo(scoreLevel*.4);
  const afterAnswer=audio.oscillators.length;
  expect(music.musicFeedback('complete',context.scaffoldId,'adult')).toBe(true);
  expect(audio.oscillators.length).toBeGreaterThan(afterAnswer);
  expect(audio.gains[0].gain.value).toBeCloseTo(scoreLevel*.24);
  expect(music.musicFeedback('complete',context.scaffoldId,'adult')).toBe(false);
  vi.advanceTimersByTime(2100);
  expect(audio.gains[0].gain.value).toBeCloseTo(scoreLevel);
  music.stopMusic();expect(vi.getTimerCount()).toBe(0);
 });
 it('previews only after sound opt-in without changing the lesson phase and cancels on exit',async()=>{
  const music=await import('../src/lib/music');
  music.syncLearningSoundtrack(context,{enabled:false,volume:.2});
  expect(music.previewRewardSound()).toBe(false);
  expect(AudioContextMock.instances).toHaveLength(0);
  music.setSoundPreferences({enabled:true,volume:.32});
  const phase=music.getMusicRuntimeStatus().phase;
  expect(music.previewRewardSound()).toBe(true);
  expect(music.getMusicRuntimeStatus().phase).toBe(phase);
  const audio=AudioContextMock.instances[0];
  music.stopMusic();expect(audio.oscillators.every(node=>node.stopCalls.includes(undefined))).toBe(true);
  const stopped=audio.oscillators.length;vi.advanceTimersByTime(10000);
  expect(audio.oscillators).toHaveLength(stopped);expect(vi.getTimerCount()).toBe(0);
 });
});

describe('prepared effect profiles execute across the full recipe catalog',()=>{
 it('honors each recipe’s validated AI choice at the actual audio scheduler',async()=>{
  const music=await import('../src/lib/music');
  const {feedbackCuePlan}=await import('../src/data/reactionProfiles');
  music.setSoundPreferences({enabled:true,volume:.32});
  const audio=AudioContextMock.instances[0],identities=new Set<string>();
  for(const scaffold of SCAFFOLDS){
   const ageGroup=scaffold.ages.includes('adult')?'adult':scaffold.ages[0];
   const directedContext={notebookId:'profile-coverage',missionId:scaffold.id,scaffoldId:scaffold.id,ageGroup,phase:'quest' as const};
   const catalog=audioDirectionCatalog(directedContext);
   const direction:GameAudioDirection={version:1,playTrackId:`score-${scaffold.id}`,studyTrackId:catalog.studyTracks[0].id,effectProfileId:scaffold.id,effects:'standard'};
   music.syncLearningSoundtrack({...directedContext,artDirection:direction},{enabled:false,volume:.2});
   expect(music.getMusicRuntimeStatus().selection?.effectProfileId,scaffold.id).toBe(scaffold.id);
   vi.advanceTimersByTime(2100);
   const start=audio.oscillators.length,at=audio.currentTime;
   expect(music.musicFeedback('success',scaffold.id,ageGroup),scaffold.id).toBe(true);
   const plan=feedbackCuePlan('success',scaffold.id,ageGroup),notes=[...plan.notes,...plan.support],voices=audio.oscillators.slice(start);
   expect(voices,scaffold.id).toHaveLength(notes.length);
   for(let i=0;i<notes.length;i++){
    expect(voices[i].frequency.value,scaffold.id).toBeCloseTo(440*2**((notes[i].midi-69)/12),5);
    expect(voices[i].startedAt[0]-at,scaffold.id).toBeCloseTo(notes[i].at+.015,5);
   }
   identities.add(JSON.stringify(voices.map(voice=>[voice.frequency.value,Math.round((voice.startedAt[0]-at)*1000),Math.round(((voice.stopCalls[0]??at)-at)*1000)])));
  }
  expect(identities.size).toBe(SCAFFOLDS.length);
  music.stopMusic();expect(vi.getTimerCount()).toBe(0);
 });
});
