import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {SCAFFOLDS} from '../../../src/data/scaffolds';
import {worldForScaffold,worldPalette} from '../../../src/data/worlds';
import {WORLD_ARTWORK,worldArtworkFor} from '../../../src/lib/worldArtwork';
import {audioDirectionCatalog} from '../../../src/lib/gameArtDirection';
import {INTERACTIVE_SCORES,MUSIC_TRACKS,RECORDING_PLAYBACK_GAINS} from '../../../src/lib/musicCatalog';
import {REACTION_PROFILES} from '../../../src/data/reactionProfiles';
import {NATIVE_CUES,nativeCuePlan,nativeScorePlan,renderNativePcm} from './presentation-audio';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const resource='res://presentation/generated/';
export const recordingFiles:Record<string,string>={'first-light':'Calm1 - A Place I Call Home.ogg','paper-stars':'Calm2 - Childhood Friends.ogg','moss-and-morning':'Calm3 - Peaceful Days.ogg','tidepool':'Calm4 - Sand Castles.ogg','little-machines':'swinging-sweet.ogg','the-quiet-atlas':'winter-dust.ogg','golden-hour':'Calm5 - Summer Memories.ogg','moon-library':'a-brand-new-wisdom.ogg','pocket-adventure':'just-saying-tho.ogg',homeward:'Calm6 - Innocence.ogg'};
export function nativePresentationCatalog(){
 return Object.fromEntries(SCAFFOLDS.map(scaffold=>[scaffold.id,{
  id:scaffold.id,name:scaffold.name,illustration:`${resource}scaffolds/${scaffold.id}.svg`,
  world:worldForScaffold(scaffold.id),
  ages:Object.fromEntries(scaffold.ages.map(age=>{
   const world=worldForScaffold(scaffold.id),art=worldArtworkFor(world,age),audio=audioDirectionCatalog({scaffoldId:scaffold.id,ageGroup:age});
   return[age,{artwork:art.id,eligibleArtwork:[...new Set([art.id,age==='3-5'||age==='6-8'?'junior-discovery':age==='9-11'?'junior-expedition':world.layout])],palette:worldPalette(scaffold.visual.scene,age),playTracks:audio.playTracks.map(t=>t.id),studyTracks:audio.studyTracks.map(t=>t.id),effectProfiles:audio.effectProfiles.map(t=>t.id),defaultPlay:audio.playTracks[0].id,defaultStudy:audio.studyTracks[0].id}];
  }))
 }]));
}
export function prepareNativePresentation(output=fileURLToPath(new URL('../project/presentation/generated/',import.meta.url))){
 mkdirSync(output,{recursive:true});
 const assets:Record<string,{sha256:string;bytes:number;origin:string}>={};
 const save=(relative:string,bytes:Buffer,origin:string)=>{
  const dest=path.join(output,relative),digest=createHash('sha256').update(bytes).digest('hex');
  mkdirSync(path.dirname(dest),{recursive:true});
  if(!existsSync(dest)||createHash('sha256').update(readFileSync(dest)).digest('hex')!==digest)writeFileSync(dest,bytes);
  assets[relative]={sha256:digest,bytes:bytes.length,origin};return resource+relative;
 };
 const copy=(relative:string,source:string)=>save(relative,readFileSync(path.join(repo,source)),source);
 const worlds=Object.fromEntries(Object.values(WORLD_ARTWORK).map(art=>[art.id,{name:art.name,path:copy(`worlds/${art.id}.png`,`public/assets/world-art/${art.id}.png`)}]));
 for(const scaffold of SCAFFOLDS)copy(`scaffolds/${scaffold.id}.svg`,`public/assets/scaffolds/${scaffold.id}.svg`);
 const tracks:Record<string,unknown>={};
 for(const score of INTERACTIVE_SCORES){
  const plan=nativeScorePlan(score),rendered=renderNativePcm(plan.notes,plan.seconds,true);
  tracks[score.id]={name:score.name,kind:'interactive',path:save(`music/${score.id}.wav`,rendered.wav,`interactiveScores.generated.json#${score.id}`),duration:plan.seconds,peak:rendered.peak,gain:1,license:score.license,composer:score.composer};
 }
 for(const [id,file]of Object.entries(recordingFiles)){
  const track=MUSIC_TRACKS.find(track=>track.id===id)!;
  tracks[id]={name:track.name,kind:'recording',path:copy(`music/${id}.ogg`,`src/assets/music/${file}`),gain:RECORDING_PLAYBACK_GAINS[id]??1,license:track.license,composer:track.composer};
 }
 const effects=Object.fromEntries(REACTION_PROFILES.map(profile=>[profile.id,Object.fromEntries(['young','standard'].map(age=>[age,Object.fromEntries(NATIVE_CUES.map(cue=>{
  const plan=nativeCuePlan(cue,profile.id,age==='young'?'3-5':'adult'),rendered=renderNativePcm(plan.notes,plan.seconds);
  return[cue,{path:save(`effects/${profile.id}/${age}-${cue}.wav`,rendered.wav,`reactionProfiles/actionFeedback#${profile.id}/${age}/${cue}`),duration:plan.seconds,peak:rendered.peak}];
 }))]))]));
 const manifest={version:1,decorative:true,recipes:nativePresentationCatalog(),worlds,tracks,effects,assets};
 writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest)+'\n');
 copyFileSync(path.join(repo,'public/assets/world-art/provenance.json'),path.join(output,'world-art-provenance.json'));
 writeFileSync(path.join(output,'NOTICE.md'),'# Native presentation assets\n\nWorlds and scaffold illustrations are decorative fiction, never source evidence. World-art provenance is included. Original Asterloom scores and illustrations retain the repository license. Native PCM files render the shipped note plans; they are not additional compositions.\n\nRecordings: Juhani Junkala / SubspaceAudio, JRPG Music Pack #4 [Calm], https://opengameart.org/content/jrpg-pack-4-calm ; hernandack, Short Loops Background Music Pack, https://opengameart.org/content/short-loops-background-music-pack . Both CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ .\n');
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const argv=process.argv.slice(2);let output:string|undefined;
 if(argv.length){if(argv.length===1&&argv[0].startsWith('--output='))output=argv[0].slice(9);else if(argv.length===2&&argv[0]==='--output')output=argv[1];else throw new Error('Usage: prepare-presentation.ts [--output <directory>]');}
 const manifest=prepareNativePresentation(output&&path.resolve(output));
 console.log(`Prepared ${Object.keys(manifest.recipes).length} native worlds, ${Object.keys(manifest.tracks).length} authored tracks and ${Object.keys(manifest.effects).length} effect profiles.`);
}
