import {SCAFFOLDS} from '../data/scaffolds';
import {REACTION_PROFILES} from '../data/reactionProfiles';
import {MUSIC_TRACKS} from './musicCatalog';

/** A portable choice among shipped assets, not executable content, source evidence, or permission to enable sound. */
export interface GameAudioDirection {
 version:1;
 playTrackId:string;
 studyTrackId:string;
 effectProfileId:string;
 /** A game can soften/disable sound effects. Only the learner can opt in or set volume. */
 effects:'standard'|'quiet'|'off';
}
export interface AudioDirectionContext {ageGroup?:string;scaffoldId?:string;activityKind?:string;theme?:string}
export interface AudioTrackDescriptor {id:string;name:string;description:string;mood:string;kind:'recording'|'interactive'}
export interface EffectProfileDescriptor {id:string;name:string;description:string;family:string}
export interface AudioDirectionCatalog {playTracks:AudioTrackDescriptor[];studyTracks:AudioTrackDescriptor[];effectProfiles:EffectProfileDescriptor[]}
export const AUDIO_KIND_FAMILIES:Readonly<Record<string,readonly string[]>>={sequence:['sequence'],classification:['sort','match'],decision:['scenario'],dependency:['connect','sequence'],budget:['scenario'],rubric:['explain'],diagram:['diagram'],completion:['cloze','sequence'],data:['sort','connect'],media:['explain'],scenario:['scenario'],construction:['connect','sequence'],explanation:['explain'],picture:['match','recall'],'rule-switch':['sort'],'child-play':['match','sequence'],'picture-build':['explain','match']};
const ages=new Set(['3-5','6-8','9-11','12-14','15-17','adult']);
const scenes=new Set(['islands','observatory','forest','workshop','ocean','library']);
const scaffoldLookup=new Map(SCAFFOLDS.map(scaffold=>[scaffold.id,scaffold]));
const sceneRecordings:Record<string,readonly string[]>={forest:['moss-and-morning','homeward','first-light','paper-stars'],ocean:['tidepool','homeward','the-quiet-atlas','first-light'],observatory:['the-quiet-atlas','moon-library','paper-stars','golden-hour'],workshop:['moon-library','first-light','golden-hour','little-machines'],library:['moon-library','the-quiet-atlas','first-light','moss-and-morning'],islands:['tidepool','paper-stars','golden-hour','homeward']};
const sceneFocus:Record<string,readonly string[]>={forest:['score-cedar-room','score-pressed-leaves'],ocean:['score-river-notes','score-tide-and-time'],observatory:['score-quiet-orbit','score-small-constellation','score-cloud-ledger'],workshop:['score-copper-lines','score-blueprint-nocturne','score-dawn-workshop'],library:['score-ink-and-lantern','score-walking-home'],islands:['score-open-window','score-saffron-sky','score-lantern-festival']};
function rotateForRecipe<T>(items:T[],seed:string):T[]{let value=2166136261;for(const letter of seed)value=Math.imul(value^letter.charCodeAt(0),16777619);const offset=items.length?(value>>>0)%items.length:0;return[...items.slice(offset),...items.slice(0,offset)];}
function contextRules(context:AudioDirectionContext){
 const scaffold=scaffoldLookup.get(context.scaffoldId??''),age=context.ageGroup==='adults'?'adult':context.ageGroup??'adult';
 const scene=context.theme??scaffold?.visual.scene??'islands';
 const families=scaffold?[scaffold.family]:context.activityKind?AUDIO_KIND_FAMILIES[context.activityKind]:undefined;
 const valid=ages.has(age)&&scenes.has(scene)&&(!context.scaffoldId||!!scaffold)&&(!context.activityKind||!!AUDIO_KIND_FAMILIES[context.activityKind]);
 return{age,scene,families,valid};
}
/** Compact creation-time descriptors: public bundled metadata only. Catalog choices are revalidated at import and play. */
export function audioDirectionCatalog(context:AudioDirectionContext):AudioDirectionCatalog {
 const {age,scene,families,valid}=contextRules(context);
 if(!valid)return{playTracks:[],studyTracks:[],effectProfiles:[]};
 const compatible=SCAFFOLDS.filter(scaffold=>scaffold.ages.includes(age)&&scaffold.visual.scene===scene&&(!families||families.includes(scaffold.family)));
 const ids=new Set(compatible.map(scaffold=>scaffold.id));
 const descriptor=(track:typeof MUSIC_TRACKS[number]):AudioTrackDescriptor=>({id:track.id,name:track.name,description:track.description,mood:track.mood,kind:track.kind});
 // A first-choice model should not give every workshop the same reading piece.
 // Reorder only the compatible set; existing saved IDs remain equally valid.
 const studySeed=`${context.scaffoldId??context.activityKind??scene}|${age}`;
 const studyTracks=[...rotateForRecipe(MUSIC_TRACKS.filter(track=>sceneRecordings[scene].includes(track.id)),studySeed),...rotateForRecipe(MUSIC_TRACKS.filter(track=>sceneFocus[scene].includes(track.id)),studySeed)].map(descriptor);
 // Put the recipe's own identity first. A creator may still choose any validated
 // compatible alternative, but first-choice models must not converge on the
 // same global catalog entry for every related game.
 const playTracks=MUSIC_TRACKS.filter(track=>track.scaffoldId&&ids.has(track.scaffoldId)).sort((a,b)=>Number(b.scaffoldId===context.scaffoldId)-Number(a.scaffoldId===context.scaffoldId)).map(descriptor);
 // Quiet, non-domain focus scores and recordings are suitable alternative backgrounds; they do not impersonate another mechanic.
 playTracks.push(...studyTracks);
 const effectProfiles=REACTION_PROFILES.filter(profile=>ids.has(profile.id)).sort((a,b)=>Number(b.id===context.scaffoldId)-Number(a.id===context.scaffoldId)).map(profile=>({id:profile.id,name:scaffoldLookup.get(profile.id)!.name,description:profile.description,family:profile.family}));
 return{playTracks,studyTracks,effectProfiles};
}
const fields=['version','playTrackId','studyTrackId','effectProfileId','effects'];
export function validateGameAudioDirection(value:unknown,context:AudioDirectionContext):string[] {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return['Audio direction must be a plain data object.'];
 const input=value as Record<string,unknown>,errors:string[]=[];
 for(const key of Object.keys(input))if(!fields.includes(key))errors.push(`Audio direction contains an unsupported field: ${key}.`);
 if(input.version!==1)errors.push('Audio direction version must be 1.');
 if(!['standard','quiet','off'].includes(String(input.effects)))errors.push('Audio effect policy must be standard, quiet, or off.');
 const catalog=audioDirectionCatalog(context);
 if(!contextRules(context).valid)errors.push('Audio direction needs a supported age, mechanic, and scene.');
 for(const [key,items] of [['playTrackId',catalog.playTracks],['studyTrackId',catalog.studyTracks],['effectProfileId',catalog.effectProfiles]] as const){
  if(typeof input[key]!=='string'||input[key].length>128||!items.some(item=>item.id===input[key]))errors.push(`${key} must identify a bundled option compatible with this game's age, mechanic, and scene.`);
 }
 return errors;
}
/** Invalid or stale presentation metadata falls back to the existing deterministic director. */
export function resolveGameAudioDirection(value:unknown,context:AudioDirectionContext):GameAudioDirection|undefined {
 if(validateGameAudioDirection(value,context).length)return undefined;
 const input=value as GameAudioDirection;
 return{version:1,playTrackId:input.playTrackId,studyTrackId:input.studyTrackId,effectProfileId:input.effectProfileId,effects:input.effects};
}
