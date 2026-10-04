import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import prepared from '../src/data/interactiveScores.generated.json';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {REACTION_PROFILES,feedbackCuePlan,reactionProfile} from '../src/data/reactionProfiles';
import {PHASE_MIX} from '../src/lib/scoreTypes';
import {scoreEvents} from '../src/lib/musicSynthesis';
import type {InteractiveScore} from '../src/lib/scoreTypes';
const scores=prepared.scores as unknown as InteractiveScore[];
describe('prepared interactive soundtrack',()=>{
 it('has 90 playable original arrangements and covers all 75 recipes without transposed duplicates',()=>{
  expect(scores).toHaveLength(90);expect(new Set(scores.map(s=>s.id)).size).toBe(90);
  expect(new Set(scores.map(s=>JSON.stringify([s.harmony,s.layers.melody.map(([t,d,p])=>[t,d,p-s.tonic])]))).size).toBe(90);
  for(const scaffold of SCAFFOLDS)expect(scores.filter(s=>s.scaffoldId===scaffold.id)).toHaveLength(1);
  for(const s of scores){expect(s.bpm).toBeGreaterThanOrEqual(58);expect(s.bpm).toBeLessThanOrEqual(94);expect(s.beats).toBe(32);expect(s.layers.melody.length).toBeGreaterThanOrEqual(16);for(const events of Object.values(s.layers))for(const [at,length,midi,gain]of events){expect([at,length,midi,gain].every(Number.isFinite)).toBe(true);expect(at).toBeGreaterThanOrEqual(0);expect(at+length).toBeLessThanOrEqual(s.beats);expect(midi).toBeGreaterThanOrEqual(28);expect(midi).toBeLessThanOrEqual(96);expect(gain).toBeGreaterThan(0);expect(gain).toBeLessThanOrEqual(.5);}const events=scoreEvents(s);expect(events.every((e,i)=>i===0||e.note[0]>=events[i-1].note[0])).toBe(true);expect(s.license).toBe('LicenseRef-Asterloom-Personal-Learning');}
 });
 it('keeps reading and retry mixes quieter with no pulse, leaving the composition identity intact',()=>{for(const phase of ['study','retry']as const){expect(PHASE_MIX[phase].pulse).toBe(0);expect(PHASE_MIX[phase].melody).toBeLessThan(PHASE_MIX.practice.melody);expect(PHASE_MIX[phase].detail).toBeLessThan(PHASE_MIX.practice.detail);}expect(PHASE_MIX.quest.pulse).toBeGreaterThan(PHASE_MIX.practice.pulse);});
 it('retains exact licensed recording bytes and creator credits, separate from original scores',async()=>{const manifest=JSON.parse(await readFile(new URL('../src/assets/music/manifest.json',import.meta.url),'utf8'));expect(manifest).toHaveLength(10);for(const file of manifest){const bytes=await readFile(new URL(`../src/assets/music/${file.file}`,import.meta.url));expect(bytes.length).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);}const credits=await readFile(new URL('../public/assets/licenses/MUSIC-CREDITS.md',import.meta.url),'utf8');for(const word of ['90 original','ten unmodified','not 90 additional recordings','hernandack','SubspaceAudio','not labeled CC0'])expect(credits).toContain(word);});
 it('checks the generated score data against its reproducible original composition script',()=>{execFileSync(process.execPath,['--import','tsx','scripts/compose-interactive-scores.ts','--check'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});});
});
describe('recipe-aware supportive reaction cues',()=>{
 it('covers each scaffold and bounds cues for adult and child playback',()=>{expect(REACTION_PROFILES).toHaveLength(SCAFFOLDS.length);expect(new Set(SCAFFOLDS.map(s=>JSON.stringify(feedbackCuePlan('success',s.id,'adult').notes))).size).toBe(75);for(const scaffold of SCAFFOLDS){expect(reactionProfile(scaffold.id).id).toBe(scaffold.id);for(const age of ['3-5','adult'])for(const kind of ['success','retry','complete']as const){const cue=feedbackCuePlan(kind,scaffold.id,age);expect(cue.notes.length).toBeGreaterThanOrEqual(2);expect(cue.maxDuration).toBeLessThan(2);expect(cue.notes.every(n=>n.midi>=60&&n.midi<=90&&n.velocity<=.4&&n.at>=0)).toBe(true);}const retry=feedbackCuePlan('retry',scaffold.id,'3-5'),success=feedbackCuePlan('success',scaffold.id,'3-5');expect(retry.notes[0].velocity).toBeLessThan(success.notes[0].velocity);expect(retry.notes.length).toBeLessThan(success.notes.length);}});
 it('uses multiple mechanic-specific visual grammars and a safe custom-recipe fallback',()=>{expect(new Set(REACTION_PROFILES.map(p=>p.family)).size).toBe(8);expect(reactionProfile('custom')).toEqual(reactionProfile('recall-escape-mission'));expect(reactionProfile('concept-map-repair').family).toBe('circuit');expect(reactionProfile('step-train').family).toBe('path');expect(reactionProfile('discovery-scenes').family).toBe('bloom');});
});
