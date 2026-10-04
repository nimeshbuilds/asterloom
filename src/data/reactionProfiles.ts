import {SCAFFOLDS} from './scaffolds';
import {worldForScaffold,WORLD_PALETTES} from './worlds';
export type ReactionOutcome='success'|'retry'|'complete';
export type ReactionFamily='constellation'|'circuit'|'assembly'|'path'|'bloom'|'ripple'|'lens'|'ribbon';
export interface ReactionProfile {id:string;family:ReactionFamily;accent:string;secondary:string;ink:string;glyph:string;seed:number;motif:number[];description:string}
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const families:Record<string,ReactionFamily>={trail:'path',network:'circuit',workbench:'assembly',stage:'ribbon',garden:'bloom',archive:'lens',console:'constellation'};
const tones:Record<ReactionFamily,number[]>={constellation:[0,7,12,16],circuit:[0,4,7,12],assembly:[0,5,9,12],path:[0,2,7,12],bloom:[0,4,9,12],ripple:[0,7,9,14],lens:[0,4,7,14],ribbon:[0,5,7,12]};
export const REACTION_PROFILES:ReactionProfile[]=SCAFFOLDS.map(s=>{const world=worldForScaffold(s.id),palette=WORLD_PALETTES[s.visual.scene]??WORLD_PALETTES.islands;const family=s.visual.scene==='ocean'&&s.family!=='sequence'?'ripple':families[world.layout];return{id:s.id,family,accent:palette.accent,secondary:palette.secondary,ink:palette.ink,glyph:world.objects[0]?.glyph??'star',seed:hash(s.id),motif:[0,[4,5,7][(hash(s.id)>>>5)%3],[7,9,12][(hash(s.id)>>>12)%3],tones[family][3]],description:`${world.name}: ${family} feedback. Decorative response; learning evidence remains in the activity.`};});
const lookup=new Map(REACTION_PROFILES.map(p=>[p.id,p]));
export function reactionProfile(scaffoldId?:string):ReactionProfile{return lookup.get(scaffoldId??'')??lookup.get('recall-escape-mission')!;}
/** Warm acknowledgment after a retry; never a failure alarm, mocking voice or punishment cue. */
export function feedbackCuePlan(outcome:ReactionOutcome,scaffoldId?:string,ageGroup?:string){
 const profile=reactionProfile(scaffoldId),young=ageGroup==='3-5'||ageGroup==='6-8',root=(young?60:62)+[0,2,5,7][profile.seed%4];
 const intervals=outcome==='retry'?[profile.motif[1],profile.motif[0]]:outcome==='complete'?profile.motif:[profile.motif[0],profile.motif[1],profile.motif[2]];
 const spacing=(outcome==='retry'?.19:young?.18:.13)+(profile.seed%17)*.003;
 const duration=(outcome==='retry'?.34:.43)+((profile.seed>>>8)%13)*.008;
 const instrument=outcome==='retry'?'felt' as const:({bloom:'marimba',ripple:'glass',constellation:'glass',circuit:'plucked',assembly:'round',path:'marimba',lens:'felt',ribbon:'air'} as const)[profile.family];
 return{profile,notes:intervals.map((interval,index)=>({at:index*spacing,midi:root+interval,duration,velocity:outcome==='retry'?.28:young?.34:.4})),instrument,support:outcome==='retry'?[]:[{at:.01,midi:root-12,duration:outcome==='complete'?.95:.65,velocity:.17,instrument:'air' as const},{at:spacing*.5,midi:root+7,duration:.35,velocity:.13,instrument:'round' as const}],maxDuration:(intervals.length-1)*spacing+duration+.45};
}
