import {describe,expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {INTERACTIVE_SCORES,MUSIC_TRACKS} from '../src/lib/musicCatalog';
import {audioDirectionCatalog} from '../src/lib/gameArtDirection';
import {nativePresentationCatalog,recordingFiles} from '../scripts/godot-factory/tools/prepare-presentation';
import {nativeScorePlan,nativeCuePlan,renderNativePcm,NATIVE_CUES,NATIVE_SAMPLE_RATE} from '../scripts/godot-factory/tools/presentation-audio';
const repo=fileURLToPath(new URL('../',import.meta.url));
describe('native authored world and audio payloads',()=>{
 it('covers every supported recipe and age with existing illustrations and exact compatible direction IDs',()=>{
  const recipes=nativePresentationCatalog();expect(Object.keys(recipes)).toHaveLength(75);
  for(const scaffold of SCAFFOLDS){
   const recipe=recipes[scaffold.id];expect(Object.keys(recipe.ages)).toEqual(scaffold.ages);
   expect(existsSync(`${repo}public/assets/scaffolds/${scaffold.id}.svg`)).toBe(true);
   const svg=readFileSync(`${repo}public/assets/scaffolds/${scaffold.id}.svg`,'utf8');expect(svg).toContain('<svg');expect(svg).not.toMatch(/(?:href|src)="https?:/);
   for(const age of scaffold.ages){
    const settings=recipe.ages[age],catalog=audioDirectionCatalog({scaffoldId:scaffold.id,ageGroup:age});
    expect(settings.playTracks).toEqual(catalog.playTracks.map(t=>t.id));expect(settings.studyTracks).toEqual(catalog.studyTracks.map(t=>t.id));expect(settings.effectProfiles).toEqual(catalog.effectProfiles.map(t=>t.id));
    expect(INTERACTIVE_SCORES.find(t=>t.id===settings.defaultPlay)?.scaffoldId).toBe(scaffold.id);
    for(const id of settings.eligibleArtwork)expect(existsSync(`${repo}public/assets/world-art/${id}.png`)).toBe(true);
    if(age==='3-5'||age==='6-8'||age==='9-11')expect(settings.eligibleArtwork.every(id=>['junior-discovery','junior-expedition','pocket-theater','learning-railway'].includes(id))).toBe(true);
   }
  }
  expect(Object.keys(recordingFiles).sort()).toEqual(MUSIC_TRACKS.filter(t=>t.kind==='recording').map(t=>t.id).sort());
  for(const file of Object.values(recordingFiles))expect(readFileSync(`${repo}src/assets/music/${file}`).subarray(0,4).toString()).toBe('OggS');
 });
 it('renders real, distinct audible recipe scores with bounded PCM samples',()=>{
  const hashes=new Set<string>();
  for(const scaffold of SCAFFOLDS){
   const score=INTERACTIVE_SCORES.find(score=>score.scaffoldId===scaffold.id)!;expect(score).toBeTruthy();
   const plan=nativeScorePlan(score),clip=renderNativePcm(plan.notes.filter(n=>n.at<2),2);
   expect(clip.wav.subarray(0,4).toString()).toBe('RIFF');expect(clip.wav.readUInt32LE(24)).toBe(NATIVE_SAMPLE_RATE);
   expect(clip.nonzero).toBeGreaterThan(NATIVE_SAMPLE_RATE/2);expect(clip.peak).toBeGreaterThan(.001);expect(clip.peak).toBeLessThan(.9);
   hashes.add(createHash('sha256').update(clip.wav).digest('hex'));
  }
  expect(hashes.size).toBe(75);
 });
 it('preserves authored action and feedback plans, supports younger voices, and avoids clipping',()=>{
  const types=new Set<string>();
  for(const cue of NATIVE_CUES){
   const plan=nativeCuePlan(cue,'puppet-stories','3-5'),rendered=renderNativePcm(plan.notes,plan.seconds);
   expect(rendered.nonzero).toBeGreaterThan(100);expect(rendered.peak).toBeLessThan(.9);
   types.add(createHash('sha256').update(rendered.wav).digest('hex'));
  }
  expect(types.size).toBe(NATIVE_CUES.length);
  expect(nativeCuePlan('success','puppet-stories','3-5').notes).not.toEqual(nativeCuePlan('success','puppet-stories','adult').notes);
  expect(()=>renderNativePcm([],Infinity)).toThrow(/budget/);expect(()=>renderNativePcm([{at:0,duration:1,midi:NaN,velocity:1,instrument:'felt'}],1)).toThrow(/Invalid/);
 });
});
