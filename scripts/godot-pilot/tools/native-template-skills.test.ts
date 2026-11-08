import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import skills from '../../../src/data/nativeTemplateSkills.json' with {type:'json'};
import {pilotTemplates,TEMPLATE_IDS} from './template-catalog';
import {CREATIVE_NATIVE_TEMPLATE_IDS} from '../../../src/lib/gameCreativeDirection';

const root=new URL('../../../',import.meta.url),project=new URL('../project/',import.meta.url);
const read=(file:string)=>readFileSync(new URL(file,project),'utf8');
const audio=read('audio/AsterloomAudio.gd'),world=read('presentation/WorldPresentation.gd'),actor=read('presentation/CharacterActor.gd');
/** Read only a JSON-shaped authored constant, never evaluate Godot or source data. */
function literal(source:string,marker:string):any{
 const offset=source.indexOf(marker);assert.notEqual(offset,-1,`Missing authored declaration: ${marker}`);
 const start=offset+marker.length,opening=source[start];
 if(opening!=='{'&&opening!=='[')return JSON.parse(source.slice(start).split('\n')[0]);
 let depth=0,quoted=false,escaped=false;
 for(let index=start;index<source.length;index++){
  const character=source[index];
  if(quoted){if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')quoted=false;continue;}
  if(character==='"'){quoted=true;continue;}
  if(character==='{'||character==='[')depth++;
  if(character==='}'||character===']'){depth--;if(depth===0)return JSON.parse(source.slice(start,index+1));}
 }
 throw Error('Unclosed authored data literal.');
}

test('three native skills cover exactly the shipped profiles, with catalog-bound cast, palette, lighting and beats',()=>{
 assert.equal(skills.version,1);assert.equal(skills.runtimeId,'asterloom-godot-pilot');
 assert.deepEqual(skills.templates.map(template=>template.id),TEMPLATE_IDS);
 assert.deepEqual(CREATIVE_NATIVE_TEMPLATE_IDS,TEMPLATE_IDS);
 for(const profile of pilotTemplates()){
  const template=skills.templates.find(template=>template.id===profile.id)!;
  assert.equal(template.version,1);assert.equal(template.compact.name,profile.name);
  assert.deepEqual(template.compact.compatibleKinds,profile.compatibleKinds);
  assert.equal(template.compact.audioProfile,profile.audioProfile);
  assert.deepEqual(template.compact.cast,profile.cast.map(member=>member.name));
  assert.deepEqual(template.design.cast,profile.cast);
  assert.deepEqual(template.design.palette,profile.palette);
  assert.deepEqual(template.design.lighting,profile.lighting);
  assert.deepEqual(template.design.briefing,profile.briefing);
  assert.deepEqual(Object.fromEntries(template.design.phases.map(beat=>[beat.phase,beat.title])),profile.acts);
  assert.equal(template.design.setting,profile.setting);
  assert.equal(template.design.audio.profileId,profile.audioProfile);
 }
});

test('native skill summaries are concise inert selection data and do not advertise absent engines or expose loading paths',()=>{
 assert.deepEqual(skills.shared.audiences,['adult']);assert.deepEqual(skills.shared.compatibleKinds,['sequence','dependency']);
 const summaries=skills.templates.map(template=>template.compact);
 for(const summary of summaries){
  assert.equal(summary.skill.version,1);assert.ok(JSON.stringify(summary).length<2400);
  assert.match(summary.skill.engineOwns,/AI fills validated source learning content and selects this profile only/);
  assert.match(summary.skill.limits,/Adults; sequence\/dependency only; 2–8 pieces\/nodes and 1–12 rules/);
  assert.ok(!/(?:res|user|file|https?):|\.gd\b|\.tscn\b|\.pck\b|\/SKILL\.md/.test(JSON.stringify(summary)));
 }
 assert.equal(new Set(summaries.map(summary=>summary.skill.visualIdentity)).size,3);
 assert.equal(new Set(summaries.map(summary=>summary.skill.sourceFit)).size,3);
 assert.equal(new Set(summaries.map(summary=>summary.skill.audioIdentity)).size,3);
});

test('phase music, synth identities and available cues match the native audio implementation',()=>{
 const tracks=literal(audio,'const TRACKS := '),playlists=literal(audio,'const PLAYLISTS := '),roots=literal(audio,'const ROOTS := '),phaseTracks=literal(audio,'const PHASE_TRACKS := ');
 assert.deepEqual(skills.shared.audio.cueIds,literal(audio,'const CUE_NAMES := '));
 assert.deepEqual(skills.shared.audio.phaseGainDb,literal(audio,'const PHASE_LEVELS := '));
 assert.equal(skills.shared.audio.crossfadeSeconds,literal(audio,'const CROSSFADE_SECONDS := '));
 assert.equal(skills.shared.audio.cueVoices,literal(audio,'const VOICE_COUNT := '));
 assert.equal(skills.shared.audio.cueSampleRate,literal(audio,'const SAMPLE_RATE := '));
 const materials=literal(audio,'var material: int = ');
 for(const template of skills.templates){
  const contract=template.design.audio;
  assert.deepEqual(contract.playlist,playlists[contract.profileId]);
  assert.deepEqual(contract.phaseTracks,phaseTracks[contract.profileId]);
  assert.equal(contract.rootHz,roots[contract.profileId]);
  assert.equal(contract.materialIndex,materials[contract.profileId]);
 }
 for(const recording of skills.shared.audio.recordings){
  assert.equal(tracks[recording.id].title,recording.name);
  assert.equal(tracks[recording.id].path,`res://audio/music/${recording.file}`);
 }
});

test('documented portrait and recording assets exist and original music hashes/licenses match the shipped manifest',()=>{
 const manifest=JSON.parse(read('audio/music-manifest.json'));
 for(const id of skills.shared.assets.portraitIds)assert.ok(existsSync(new URL(`assets/cast/${id}.png`,project)),id);
 for(const recording of skills.shared.audio.recordings){
  const entry=manifest.recordings.find((entry:any)=>entry.file===`music/${recording.file}`);assert.ok(entry);
  const bytes=readFileSync(new URL(`audio/music/${recording.file}`,project));
  assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(entry.license,recording.license);assert.equal(entry.creator,recording.creator);
 }
});

test('phase and action contracts describe actual bounded procedural animation, not imaginary video or full human rigs',()=>{
 assert.deepEqual(skills.shared.phases,literal(world,'const PHASES := '));
 assert.deepEqual(skills.shared.animation.events,literal(world,'const EVENTS := '));
 assert.deepEqual(skills.shared.animation.poses,literal(actor,'const POSES := '));
 assert.equal(skills.shared.animation.maxTransientGroups,literal(world,'const MAX_EFFECTS := '));
 assert.match(world,new RegExp(`ambient.amount = ${skills.shared.animation.ambientMotes};`));
 assert.match(world,new RegExp(`light_energy = ${skills.shared.lighting.activeGuideEnergy} if id == active else ${skills.shared.lighting.inactiveGuideEnergy}`));
 assert.match(actor,new RegExp(`tween_property\\(head,"rotation",targets\\[0\\],${skills.shared.animation.poseTweenSeconds}\\)`));
 assert.deepEqual(skills.shared.phaseContracts.map(beat=>beat.phase),skills.shared.phases);
 assert.deepEqual(skills.shared.phaseContracts.map(beat=>beat.guide),skills.shared.phases.map(phase=>(skills.shared.animation.phaseGuide as Record<string,string>)[phase]));
 assert.equal(skills.shared.eventContract.find(event=>event.action==='restore/reopen completed work')?.cue,null);
 assert.match(skills.shared.animation.note,/no imported photorealistic rig, video or GIF/);
});

test('each complete skill preserves its distinct authored motif and clearly separates AI content from engine-owned behavior',()=>{
 for(const template of skills.templates){
  const path=new URL(template.skillFile,root),document=readFileSync(path,'utf8');
  assert.ok(document.includes(template.id));assert.ok(document.includes(template.design.metaphorBoundary));
  assert.ok(document.includes(template.design.savedProgressVisual));assert.ok(document.includes(template.design.successShape));
  for(const beat of template.design.phases){assert.ok(document.includes(beat.title));assert.ok(document.includes(beat.purpose));}
  for(const cue of skills.shared.audio.cueIds)assert.ok(document.includes(`\`${cue}\``));
  assert.match(document,/The converter copies accepted sources, teaching, citations, labels and rules unchanged/);
  assert.match(document,/Do not emit GDScript/);assert.match(document,/Generated pilot models award no official XP or mastery/);
  assert.match(document,/does not provide a live AI chatbot/);assert.match(document,/three native templates share two source-construction mechanics/);
 }
});
