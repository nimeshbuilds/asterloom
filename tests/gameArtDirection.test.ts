import {describe,expect,it} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {MUSIC_TRACKS} from '../src/lib/musicCatalog';
import {audioDirectionCatalog,validateGameAudioDirection,resolveGameAudioDirection,type AudioDirectionContext,type GameAudioDirection} from '../src/lib/gameArtDirection';
import {selectLearningSoundtrack} from '../src/lib/musicSelection';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import ReactionEffects from '../src/components/ReactionEffects';
const context:AudioDirectionContext={ageGroup:'adult',scaffoldId:'recall-escape-mission'};
const directionFor=(context:AudioDirectionContext):GameAudioDirection=>{const catalog=audioDirectionCatalog(context);return{version:1,playTrackId:catalog.playTracks[0]?.id,studyTrackId:catalog.studyTracks[0]?.id,effectProfileId:catalog.effectProfiles[0]?.id,effects:'standard'};};
describe('portable AI art direction',()=>{
 it('offers a real compatible palette for every recipe and supported age, using only bundled catalog assets',()=>{
  const ids=new Set(MUSIC_TRACKS.map(track=>track.id));for(const scaffold of SCAFFOLDS)for(const ageGroup of scaffold.ages){const context={ageGroup,scaffoldId:scaffold.id};const catalog=audioDirectionCatalog(context);expect(catalog.playTracks.length,scaffold.id).toBeGreaterThan(1);expect(catalog.studyTracks.length,scaffold.id).toBeGreaterThan(1);expect(catalog.effectProfiles.length,scaffold.id).toBeGreaterThan(0);expect(validateGameAudioDirection(directionFor(context),context),scaffold.id).toEqual([]);for(const track of [...catalog.playTracks,...catalog.studyTracks])expect(ids.has(track.id)).toBe(true);for(const profile of catalog.effectProfiles){const owner=SCAFFOLDS.find(item=>item.id===profile.id)!;expect(owner.family).toBe(scaffold.family);expect(owner.ages).toContain(ageGroup);expect(owner.visual.scene).toBe(scaffold.visual.scene);}}
 });
 it('lists the exact recipe identity first without removing compatible alternatives or mutating the catalog',()=>{
  const original=MUSIC_TRACKS.map(track=>track.id);
  for(const scaffold of SCAFFOLDS)for(const ageGroup of scaffold.ages){
   const context={scaffoldId:scaffold.id,ageGroup},catalog=audioDirectionCatalog(context);
   expect(catalog.playTracks[0].id,scaffold.id).toBe(`score-${scaffold.id}`);
   expect(catalog.effectProfiles[0].id,scaffold.id).toBe(scaffold.id);
   expect(new Set(catalog.playTracks.map(track=>track.id)).size).toBe(catalog.playTracks.length);
   if(catalog.effectProfiles.length>1){
    const alternative={...directionFor(context),effectProfileId:catalog.effectProfiles[1].id};
    expect(resolveGameAudioDirection(alternative,context)).toEqual(alternative);
   }
  }
  expect(MUSIC_TRACKS.map(track=>track.id)).toEqual(original);
 });
 it('varies the first reading choice by recipe without losing options or changing saved directions',()=>{
  const firstChoices=new Map<string,Set<string>>(),sceneOptions=new Map<string,string[]>();
  for(const scaffold of SCAFFOLDS){const ageGroup=scaffold.ages.includes('adult')?'adult':scaffold.ages[0],context={scaffoldId:scaffold.id,ageGroup},catalog=audioDirectionCatalog(context),ids=catalog.studyTracks.map(track=>track.id);
   expect(catalog).toEqual(audioDirectionCatalog(context));expect(catalog.studyTracks[0].kind).toBe('recording');expect(new Set(ids).size).toBe(ids.length);
   const scene=scaffold.visual.scene,prior=sceneOptions.get(scene);if(prior)expect([...ids].sort()).toEqual(prior);else sceneOptions.set(scene,[...ids].sort());
   const choices=firstChoices.get(scene)??new Set<string>();choices.add(ids[0]);firstChoices.set(scene,choices);
   // Every earlier saved compatible ID remains accepted, not just the new first choice.
   for(const studyTrackId of ids)expect(validateGameAudioDirection({...directionFor(context),studyTrackId},context)).toEqual([]);
  }
  for(const [scene,choices]of firstChoices)expect(choices.size,scene).toBeGreaterThan(1);
 });
 it('rejects unknown assets, remote references, arbitrary programs, incompatible age/scene/mechanic and policies',()=>{
  const direction=directionFor(context);for(const patch of [{playTrackId:'https://example.com/live.mp3'},{effectProfileId:'alert.exe'},{studyTrackId:'not-bundled'},{effects:'always-on'},{version:2},{script:'run()'}])expect(validateGameAudioDirection({...direction,...patch},context).length).toBeGreaterThan(0);
  expect(resolveGameAudioDirection(direction,{...context,ageGroup:'3-5'})).toBeUndefined();expect(resolveGameAudioDirection(direction,{...context,scaffoldId:'concept-map-repair'})).toBeUndefined();expect(resolveGameAudioDirection(direction,{...context,theme:'ocean'})).toBeUndefined();expect(resolveGameAudioDirection(direction,{...context,ageGroup:'mystery'})).toBeUndefined();
  for(const value of [null,[],true,'music',Object.create({version:1})])expect(validateGameAudioDirection(value,context).length).toBeGreaterThan(0);
 });
 it('preserves exact prepared choices across JSON transport and chooses them by learning phase',()=>{
  const direction=JSON.parse(JSON.stringify(directionFor(context)));expect(resolveGameAudioDirection(direction,context)).toEqual(direction);
  for(const phase of ['intro','study','practice','quest'] as const){const chosen=selectLearningSoundtrack({...context,notebookId:'prepared',artDirection:direction,phase},{mode:'adaptive',trackId:'first-light'});expect(chosen.trackId).toBe(phase==='study'||phase==='intro'?direction.studyTrackId:direction.playTrackId);expect(chosen.artDirected).toBe(true);}
  expect(selectLearningSoundtrack({...context,notebookId:'prepared',artDirection:direction,phase:'quest'},{mode:'pinned',trackId:'homeward'})).toMatchObject({trackId:'homeward',mode:'pinned'});
 });
 it('falls back when a saved direction is incompatible without invoking providers or accepting the bad asset',()=>{
  const bad={...directionFor(context),playTrackId:'untrusted'};const original={...context,notebookId:'prepared',phase:'quest' as const};const choice=selectLearningSoundtrack({...original,artDirection:bad},{mode:'adaptive',trackId:'first-light'});expect(choice.trackId).toBe(selectLearningSoundtrack(original,{mode:'adaptive',trackId:'first-light'}).trackId);expect(choice.artDirected).toBeUndefined();
 });
 it('uses the same validated effect identity in the actual visual feedback component',()=>{
  const catalog=audioDirectionCatalog(context),direction={...directionFor(context),effectProfileId:catalog.effectProfiles.find(profile=>profile.id!==context.scaffoldId)!.id};
  const html=renderToStaticMarkup(createElement(ReactionEffects,{outcome:'success',scaffoldId:context.scaffoldId,ageGroup:'adult',artDirection:direction}));expect(html).toContain(`data-effect-profile="${direction.effectProfileId}"`);expect(html).toContain(`data-scaffold="${context.scaffoldId}"`);
  const fallback=renderToStaticMarkup(createElement(ReactionEffects,{outcome:'retry',scaffoldId:context.scaffoldId,ageGroup:'adult',artDirection:{...direction,effectProfileId:'missing'}}));expect(fallback).toContain(`data-effect-profile="${context.scaffoldId}"`);
 });
});
