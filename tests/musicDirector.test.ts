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
class AudioNodeMock extends EventTarget {gain=new AudioParameter();frequency=new AudioParameter();Q=new AudioParameter();pan=new AudioParameter();delayTime=new AudioParameter();threshold=new AudioParameter();knee=new AudioParameter();ratio=new AudioParameter();attack=new AudioParameter();release=new AudioParameter();type='';disconnected=false;onended?:()=>void;connect(){return this;}disconnect(){this.disconnected=true;}setPeriodicWave(){}start(){}stop(at?:number){if(at===undefined){this.onended?.();this.dispatchEvent(new Event('ended'));}}}
class AudioContextMock {static instances:AudioContextMock[]=[];state='running';destination=new AudioNodeMock();started=Date.now();oscillators:AudioNodeMock[]=[];gains:AudioNodeMock[]=[];get currentTime(){return(Date.now()-this.started)/1000;}constructor(){AudioContextMock.instances.push(this);}createGain(){const gain=new AudioNodeMock();this.gains.push(gain);return gain;}createBiquadFilter(){return new AudioNodeMock();}createDynamicsCompressor(){return new AudioNodeMock();}createStereoPanner(){return new AudioNodeMock();}createDelay(){return new AudioNodeMock();}createPeriodicWave(){return{};}createOscillator(){const oscillator=new AudioNodeMock();this.oscillators.push(oscillator);return oscillator;}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}}
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

});
