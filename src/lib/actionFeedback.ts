import {reactionProfile} from '../data/reactionProfiles';
import type {ScoreInstrument} from './scoreTypes';

export type GameActionCue='select'|'place'|'move'|'connect'|'remove'|'inspect'|'reveal'|'commit';
/** Short tactile acknowledgments, not correctness signals. Every world shares its musical identity. */
export function actionCuePlan(kind:GameActionCue,scaffoldId?:string,ageGroup?:string){
 const profile=reactionProfile(scaffoldId),young=ageGroup==='3-5'||ageGroup==='6-8';
 const instrument:ScoreInstrument=({bloom:'marimba',ripple:'glass',constellation:'glass',circuit:'plucked',assembly:'round',path:'marimba',lens:'felt',ribbon:'air'} as const)[profile.family];
 const root=(young?57:60)+(profile.seed%12),duration=(young?.14:.1)+((profile.seed>>>9)%11)*.003;
 const intervals:Record<GameActionCue,number[]>={select:[0],place:[0,profile.motif[1]],move:[profile.motif[1],0],connect:[0,7,profile.motif[2]],remove:[-5],inspect:[7],reveal:[0,12],commit:[0,7]};
 const spacing=.038+((profile.seed>>>4)%9)*.002,velocity=young?.13:.18;
 return{kind,profile,instrument,notes:intervals[kind].map((interval,index)=>({at:index*spacing,midi:root+interval,duration:duration*({select:.7,place:1,move:.8,connect:1.1,remove:.6,inspect:1.2,reveal:1.3,commit:1.15}[kind]),velocity:index?velocity*.78:velocity})),maxDuration:(intervals[kind].length-1)*spacing+duration+.045};
}

const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const changed=(a:unknown,b:unknown)=>JSON.stringify(a??null)!==JSON.stringify(b??null);
const size=(v:unknown):number=>Array.isArray(v)?v.length:v&&typeof v==='object'?Object.values(v).reduce<number>((sum,x)=>sum+(Array.isArray(x)?x.length:x?1:0),0):v?1:0;
const placement=(a:unknown,b:unknown):GameActionCue=>size(b)<size(a)?'remove':'place';
/** Observe semantic state transitions only. Typing, playback ticks and restoring a save stay silent. */
export function activityActionCue(previous:unknown,next:unknown):GameActionCue|null{
 const a=obj(previous),b=obj(next);
 if(changed(a.order,b.order))return'move';
 if(changed(a.edges,b.edges))return size(b.edges)<size(a.edges)?'remove':'connect';
 for(const key of ['instances','parts'])if(changed(a[key],b[key]))return size(a[key])===size(b[key])?'move':placement(a[key],b[key]);
 for(const key of ['slotTokens','assignments','placements','evidenceRows'])if(changed(a[key],b[key]))return placement(a[key],b[key]);
 if(changed(a.arguments,b.arguments)||changed(a.pairs,b.pairs))return'connect';
 if(changed(a.actions,b.actions)||changed(a.actionIds,b.actionIds)||changed(a.firstCommitted,b.firstCommitted))return'commit';
 for(const key of ['selectedEvidenceIds','exploredTokenIds','listenedRoundIds','listenedSceneIds','activeCheckpointId','activeRoundId'])if(changed(a[key],b[key]))return'inspect';
 for(const key of ['choiceId','selection','ratings','selectedActionId','selectedActorId','selectedPropId'])if(changed(a[key],b[key]))return'select';
 // Data answers and free-text fields are deliberately excluded.
 if(!('evidenceRows'in b)&&changed(a.answers,b.answers)){
  const aa=obj(a.answers),ba=obj(b.answers);
  if(!('activeCheckpointId'in b)||Object.keys(ba).some(key=>Array.isArray(ba[key])&&changed(aa[key],ba[key])))return'select';
 }
 const av=obj(a.view),bv=obj(b.view);
 for(const key of ['inspectedRowId','activeQuestionId','compareRowIds','chartColumnId'])if(changed(av[key],bv[key]))return'inspect';
 if(bv.sourceProofOpen===true&&av.sourceProofOpen!==true)return'reveal';
 const ad=obj(a.draft),bd=obj(b.draft);
 for(const key of ['selectedTokenId','selectedPieceId','selectedInstanceId','activeArgumentId'])if(changed(ad[key],bd[key]))return'select';
 for(const key of ['hint','evidence','figures','reflectionRevealed'])if(b[key]===true&&a[key]!==true)return'reveal';
 return null;
}
export function lessonActionCue(previous:unknown,next:unknown):GameActionCue|null{
 const a=obj(previous),b=obj(next),ar=obj(a.rehearsal),br=obj(b.rehearsal),ap=obj(a.practice),bp=obj(b.practice);
 if(changed(ar.answers,br.answers))return placement(ar.answers,br.answers);
 if(changed(ar.revealed,br.revealed))return'reveal';
 if(changed(ar.selectedTileId,br.selectedTileId))return'select';
 if(changed(ap.order,bp.order))return'move';
 if(changed(a.stage,b.stage)||changed(a.walkthroughStep,b.walkthroughStep)||changed(a.missionAccepted,b.missionAccepted))return'commit';
 if(changed(a.viewedPassageIds,b.viewedPassageIds)||changed(ap.focusId,bp.focusId))return'inspect';
 return null;
}
