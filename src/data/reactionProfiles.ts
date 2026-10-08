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
/** Warm acknowledgment after a retry; never a failure alarm, mocking voice or punishment cue.
 * Completion has a second, resolved phrase and a soft landing chord. Its
 * stronger identity comes from arrangement, not overriding the learner's volume. */
export function feedbackCuePlan(outcome:ReactionOutcome,scaffoldId?:string,ageGroup?:string){
 const profile=reactionProfile(scaffoldId),young=ageGroup==='3-5'||ageGroup==='6-8',root=(young?60:62)+[0,2,5,7][profile.seed%4];
 const intervals=outcome==='retry'?[profile.motif[1],profile.motif[0]]:outcome==='complete'?[...profile.motif,12]:[profile.motif[0],profile.motif[1],profile.motif[2]];
 const spacing=(outcome==='retry'?.19:young?.16:.12)+(profile.seed%17)*.002;
 const duration=(outcome==='retry'?.34:.34)+((profile.seed>>>8)%13)*.006;
 const instrument=outcome==='retry'?'felt' as const:({bloom:'marimba',ripple:'glass',constellation:'glass',circuit:'plucked',assembly:'round',path:'marimba',lens:'felt',ribbon:'air'} as const)[profile.family];
 const landing=outcome==='complete'?spacing*(intervals.length-1)+.09:0;
 const notes=intervals.map((interval,index)=>({at:index*spacing+(outcome==='complete'&&index===intervals.length-1?.09:0),midi:root+interval,duration:outcome==='complete'&&index===intervals.length-1?.55:duration,velocity:outcome==='retry'?.25:young?.32:.4,pan:outcome==='retry'?0:(index%2?1:-1)*.15}));
 const support=outcome==='retry'?[]:[{at:.01,midi:root-12,duration:outcome==='complete'?.9:.6,velocity:.17,instrument:'air' as const,pan:0},{at:spacing*.5,midi:root+7,duration:.3,velocity:.13,instrument:'round' as const,pan:.2},...(outcome==='complete'?[{at:landing,midi:root,duration:.55,velocity:.2,instrument:'round' as const,pan:-.2},{at:landing,midi:root+7,duration:.55,velocity:.14,instrument:'air' as const,pan:.2}]:[])];
 return{profile,notes,instrument,support,maxDuration:Math.max(...notes.map(note=>note.at+note.duration),...support.map(note=>note.at+note.duration))+.47};
}
