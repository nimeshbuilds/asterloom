import type {Notebook} from '../types';
import type {StructuredActivity} from './structuredEngine';
import {validateActivity} from './structuredEngine';
import {validateAILearningPlan,type AILearningMission} from './aiLearningPlan';
import {validateAIUsageReceipts,type AIUsageReceipt} from './aiUsage';
import {validateGameAudioDirection,type GameAudioDirection} from './gameArtDirection';
import {buildDirectorSourceInventory,directorInputRevision,type DirectorSourceUnit} from './gameDirectorSources';
import {GAME_FAMILY_RECIPES,type GameDraftKind} from './gameDraftAdapters';
import {scaffoldById} from '../data/scaffolds';
import {fitsSpecificContract} from './scaffoldRuntime';
import {isAsterEmotionForMoment,type AsterEmotionId,type AsterMoment} from './asterEmotions';

export const GAME_SCENES=['islands','observatory','forest','workshop','ocean','library'] as const;
export interface GameVisualDirection {scene:typeof GAME_SCENES[number];sourceAssetIds:string[]}
export interface GameMissionPlan {id:string;unitId:string;kind:GameDraftKind;scaffoldId:string;title:string;objective:string;visualDirection:GameVisualDirection;asterDirection?:Partial<Record<AsterMoment,AsterEmotionId>>}
export interface GameStudyDisposition {unitId:string;reason:string}
export interface GameMissionDraft {missionId:string;activity:StructuredActivity;teaching:AILearningMission;audioDirection:GameAudioDirection}
export interface GameMissionCheck {missionId:string;decision:'retain'|'source-study';reason:string}
export interface GameDesignBatch {
 id:string;unitIds:string[];status:'pending'|'planned'|'written'|'checked';
 missions?:GameMissionPlan[];study?:GameStudyDisposition[];drafts?:GameMissionDraft[];checks?:GameMissionCheck[];
}
export interface GameDesign {
 version:1;inputRevision:string;status:'preparing'|'ready';
 provider:{id:string;model:string;endpointFingerprint:string|null};
 units:Omit<DirectorSourceUnit,'excerpt'>[];batches:GameDesignBatch[];
 unavailableSources:{sourceId:string;reason:string}[];
 receipts:AIUsageReceipt[];
 generatedModels:{id:string;fingerprint:string}[];
 audioDirection?:GameAudioDirection;visualDirection?:GameVisualDirection;
}
const providers=['openai','anthropic','xai','compatible','chatgpt','grok','claude-code'];
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const obj=(value:unknown,name:string)=>{if(!plain(value))throw new Error(`Invalid ${name}.`);return value;};
const fields=(value:Record<string,unknown>,allowed:string[],name:string)=>{if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error(`${name} contains an unsupported field.`);};
const str=(value:unknown,name:string,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${name}.`);return value;};
const id=(value:unknown,name:string)=>{const text=str(value,name,200);if(!/^[\w.:~-]+$/.test(text)||['constructor','prototype','__proto__'].includes(text))throw new Error(`Invalid ${name}.`);return text;};
const list=(value:unknown,name:string,max:number):unknown[]=>{if(!Array.isArray(value)||value.length>max)throw new Error(`Invalid ${name}.`);return value;};
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
const exact=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const unique=(ids:string[],name:string)=>{if(new Set(ids).size!==ids.length)throw new Error(`Repeated ${name}.`);};

export function availableSourceVisuals(notebook:Pick<Notebook,'sources'>,unit:DirectorSourceUnit):string[]{
 const source=notebook.sources.find(s=>s.id===unit.sourceId),parent=source?.visualEvidence?.parentSourceId;
 return notebook.sources.filter(s=>(s.id===unit.sourceId||s.id===parent)&&s.kind==='image'&&(s.dataUrl?.startsWith('data:image/')||s.asset?.mime.startsWith('image/'))).map(s=>s.id);
}
export function validateGameVisualDirection(value:unknown,allowedAssets:string[]):GameVisualDirection {
 const v=obj(value,'visual direction');fields(v,['scene','sourceAssetIds'],'Visual direction');
 if(!GAME_SCENES.includes(v.scene as GameVisualDirection['scene']))throw new Error('Choose a bundled scene.');
 const sourceAssetIds=list(v.sourceAssetIds,'source visual choices',8).map(value=>id(value,'source visual'));
 unique(sourceAssetIds,'source visual');if(sourceAssetIds.some(id=>!allowedAssets.includes(id)))throw new Error('A visual must belong to this mission’s cited source.');
 return{scene:v.scene as GameVisualDirection['scene'],sourceAssetIds};
}
export function validateAsterDirection(value:unknown):Partial<Record<AsterMoment,AsterEmotionId>>{
 const raw=obj(value,'Aster direction'),moments:AsterMoment[]=['welcome','concept','hint','retry','success','reflection'];fields(raw,moments,'Aster direction');
 const result:Partial<Record<AsterMoment,AsterEmotionId>>={};for(const [moment,value] of Object.entries(raw)){if(!isAsterEmotionForMoment(value,moment as AsterMoment))throw new Error('Choose a bundled Aster expression suitable for this moment.');result[moment as AsterMoment]=value;}return result;
}
export function validateGameBatchPlan(value:unknown,batch:GameDesignBatch,units:DirectorSourceUnit[],notebook:Pick<Notebook,'sources'|'ageGroup'>):Pick<GameDesignBatch,'missions'|'study'> {
 const v=obj(value,'game plan');fields(v,['missions','study'],'Game plan');
 const missions=list(v.missions,'planned missions',3).map(raw=>{
  const m=obj(raw,'mission plan');fields(m,['id','unitId','kind','scaffoldId','title','objective','visualDirection','asterDirection'],'Mission plan');
  const unit=units.find(u=>u.id===m.unitId&&batch.unitIds.includes(u.id));if(!unit||!unit.missionEligible)throw new Error('A planned mission must use a disclosed complete source unit.');
  const kind=m.kind as GameDraftKind,scaffold=scaffoldById(String(m.scaffoldId));
  if(!(kind in GAME_FAMILY_RECIPES)||!GAME_FAMILY_RECIPES[kind].includes(String(m.scaffoldId))||!scaffold?.ages.includes(notebook.ageGroup))throw new Error('The planned game must match a supported source contract and audience.');
  const visualDirection=validateGameVisualDirection(m.visualDirection,availableSourceVisuals(notebook,unit));
  // A mission uses its implemented scene, not an unrelated visual template wearing a new label.
  if(visualDirection.scene!==scaffold.visual.scene)throw new Error('The chosen scene must match the supported game world.');
  return{id:id(m.id,'mission plan ID'),unitId:unit.id,kind,scaffoldId:scaffold.id,title:str(m.title,'mission title',180),objective:str(m.objective,'mission objective',400),visualDirection,...(m.asterDirection===undefined?{}:{asterDirection:validateAsterDirection(m.asterDirection)})};
 });
 const study=list(v.study,'source-study dispositions',3).map(raw=>{const s=obj(raw,'source-study disposition');fields(s,['unitId','reason'],'Source-study disposition');const unitId=id(s.unitId,'study unit');if(!batch.unitIds.includes(unitId))throw new Error('A study disposition must identify a disclosed unit.');return{unitId,reason:str(s.reason,'source-study reason',600)};});
 unique(missions.map(m=>m.id),'mission plan IDs');const coverage=[...missions.map(m=>m.unitId),...study.map(s=>s.unitId)];unique(coverage,'source-unit coverage');
 if(coverage.length!==batch.unitIds.length||batch.unitIds.some(id=>!coverage.includes(id)))throw new Error('Every disclosed source unit needs a mission or an explicit study disposition.');
 return{missions,study};
}
export function validateGameBatchChecks(value:unknown,batch:GameDesignBatch):GameMissionCheck[]{
 const v=obj(value,'game check');fields(v,['checks'],'Game check');
 const checks=list(v.checks,'mission checks',3).map(raw=>{const c=obj(raw,'mission check');fields(c,['missionId','decision','reason'],'Mission check');if(!['retain','source-study'].includes(String(c.decision)))throw new Error('Invalid check decision.');return{missionId:id(c.missionId,'checked mission'),decision:c.decision as GameMissionCheck['decision'],reason:str(c.reason,'check reason',600)};});
 unique(checks.map(c=>c.missionId),'checked mission');if(checks.length!==(batch.drafts?.length??0)||batch.drafts?.some(d=>!checks.some(c=>c.missionId===d.missionId)))throw new Error('Every generated mission requires its own check disposition.');return checks;
}
export function emptyGameDesign(notebook:Pick<Notebook,'sources'|'ageGroup'|'goal'>,provider:GameDesign['provider'],receipts:AIUsageReceipt[]=[],generatedModels:GameDesign['generatedModels']=[]):GameDesign {
 const inventory=buildDirectorSourceInventory(notebook);
 if(inventory.units.length>2000)throw new Error('This collection has more than 2,000 learning sections. Split it into smaller games before requesting AI creation.');
 return{version:1,inputRevision:directorInputRevision(notebook,{provider:provider.id,model:provider.model,endpointFingerprint:provider.endpointFingerprint}),status:'preparing',provider,units:inventory.units.map(({excerpt:_excerpt,...unit})=>unit),batches:inventory.batches.map(batch=>({...batch,status:'pending'})),unavailableSources:inventory.unavailableSources,receipts:validateAIUsageReceipts(receipts),generatedModels};
}
export function gameDesignProgress(design:GameDesign){
 const checked=design.batches.filter(b=>b.status==='checked'),accepted=checked.flatMap(b=>(b.checks??[]).filter(c=>c.decision==='retain'));
 return{totalUnits:design.units.length,coveredUnits:checked.reduce((n,b)=>n+b.unitIds.length,0),totalBatches:design.batches.length,completedBatches:checked.length,missionCount:accepted.length,studyOnlyCount:checked.reduce((n,b)=>n+(b.study?.length??0)+(b.checks?.filter(c=>c.decision==='source-study').length??0),0),pendingBatches:design.batches.length-checked.length,canResume:design.status==='preparing'&&checked.length<design.batches.length};
}
export function designedMission(design:GameDesign|undefined,activityId:string){
 for(const batch of design?.batches??[]){if(batch.status!=='checked')continue;const draft=batch.drafts?.find(d=>d.activity.id===activityId),plan=batch.missions?.find(m=>m.id===draft?.missionId);if(draft&&plan&&batch.checks?.some(c=>c.missionId===draft.missionId&&c.decision==='retain'))return{...plan,activityId,audioDirection:draft.audioDirection};}
}

/** Source/model caches are disposable; historical provider measurements survive their invalidation. */
export function validateGameDesign(value:unknown,notebook:Pick<Notebook,'sources'|'ageGroup'|'goal'>):GameDesign {
 const v=obj(value,'game design');fields(v,['version','inputRevision','status','provider','units','batches','unavailableSources','receipts','generatedModels','audioDirection','visualDirection'],'Game design');
 if(v.version!==1||!['preparing','ready'].includes(String(v.status)))throw new Error('Invalid game design version or state.');
 const p=obj(v.provider,'selected provider');fields(p,['id','model','endpointFingerprint'],'Selected provider');if(!providers.includes(String(p.id))||p.endpointFingerprint!==null&&(typeof p.endpointFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.endpointFingerprint)))throw new Error('Invalid selected provider.');
 const provider={id:p.id as string,model:str(p.model,'selected model'),endpointFingerprint:p.endpointFingerprint as string|null},receipts=validateAIUsageReceipts(v.receipts);
 const generatedModels=list(v.generatedModels??[],'generated model provenance',300).map(raw=>{const item=obj(raw,'generated model provenance');fields(item,['id','fingerprint'],'Generated model provenance');const key=id(item.id,'generated model');if(!/^director-[a-f0-9]{40}$/.test(key)||typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint))throw new Error('Invalid generated model provenance.');return{id:key,fingerprint:item.fingerprint};});unique(generatedModels.map(m=>m.id),'generated models');
 const fresh=emptyGameDesign(notebook,provider,receipts,generatedModels);
 if(typeof v.inputRevision!=='string'||!/^[a-f0-9]{64}$/.test(v.inputRevision))throw new Error('Invalid game input revision.');
 if(v.inputRevision!==fresh.inputRevision)return fresh;
 if(!exact(v.units,fresh.units)||!exact(v.unavailableSources,fresh.unavailableSources))throw new Error('The game’s source coverage does not match the current material.');
 const units=buildDirectorSourceInventory(notebook).units,batches=list(v.batches,'game batches',2000).map((raw,index):GameDesignBatch=>{
  const b=obj(raw,'game batch');fields(b,['id','unitIds','status','missions','study','drafts','checks'],'Game batch');const expected=fresh.batches[index];
  if(!expected||b.id!==expected.id||!exact(b.unitIds,expected.unitIds)||!['pending','planned','written','checked'].includes(String(b.status)))throw new Error('Invalid game batch coverage.');
  const batch:GameDesignBatch={...expected,status:b.status as GameDesignBatch['status']};
  if(batch.status==='pending'){if(['missions','study','drafts','checks'].some(k=>b[k]!==undefined))throw new Error('An unplanned batch cannot contain generated models.');return batch;}
  Object.assign(batch,validateGameBatchPlan({missions:b.missions,study:b.study},batch,units,notebook));
  if(batch.status==='planned'){if(b.drafts!==undefined||b.checks!==undefined)throw new Error('An unwritten batch cannot contain checked models.');return batch;}
  batch.drafts=list(b.drafts,'cached mission drafts',3).map(raw=>{
   const d=obj(raw,'cached mission');fields(d,['missionId','activity','teaching','audioDirection'],'Cached mission');const plan=batch.missions!.find(m=>m.id===d.missionId);if(!plan)throw new Error('A cached mission needs its source-bound plan.');
   const checked=validateActivity(d.activity,notebook.sources);if(!checked.success||checked.value.kind!==plan.kind||!fitsSpecificContract(plan.scaffoldId,checked.value)||checked.value.reviewStatus!=='needs-review'||!exact(checked.value.scaffoldIds,[plan.scaffoldId]))throw new Error('Invalid cached practice model.');
   const unit=units.find(u=>u.id===plan.unitId)!;if(checked.value.sourceRefs.some(r=>r.sourceId!==unit.sourceId||!unit.excerpt.includes(r.evidence)))throw new Error('The cached mission left its disclosed source unit.');
   const teaching=validateAILearningPlan({version:1,missions:[d.teaching]},{...notebook,activities:[checked.value]}).missions[0];if(teaching.reviewStatus!=='needs-review')throw new Error('Generated teaching cannot approve itself.');
   const audioErrors=validateGameAudioDirection(d.audioDirection,{ageGroup:notebook.ageGroup,scaffoldId:plan.scaffoldId,activityKind:plan.kind,theme:plan.visualDirection.scene});if(audioErrors.length)throw new Error(audioErrors[0]);
   return{missionId:plan.id,activity:checked.value,teaching,audioDirection:d.audioDirection as GameAudioDirection};
  });
  unique(batch.drafts.map(d=>d.missionId),'cached mission IDs');if(batch.drafts.length!==batch.missions!.length)throw new Error('Every planned mission needs a cached model.');
  if(batch.status==='checked')batch.checks=validateGameBatchChecks({checks:b.checks},batch);else if(b.checks!==undefined)throw new Error('An unchecked batch cannot claim a review result.');return batch;
 });
 if(batches.length!==fresh.batches.length)throw new Error('Game batches omitted a source unit.');
 const ready=batches.every(b=>b.status==='checked');if(v.status==='ready'&&!ready)throw new Error('A game cannot be ready with unfinished source batches.');
 const result:GameDesign={...fresh,status:v.status as GameDesign['status'],batches};
 if(v.visualDirection!==undefined){const accepted=batches.flatMap(b=>(b.drafts??[]).filter(d=>b.checks?.some(c=>c.missionId===d.missionId&&c.decision==='retain')).map(d=>({d,p:b.missions!.find(m=>m.id===d.missionId)!})));if(!accepted.length||!exact(v.visualDirection,accepted[0].p.visualDirection)||!exact(v.audioDirection,accepted[0].d.audioDirection))throw new Error('The world direction must match its first retained mission.');result.visualDirection=accepted[0].p.visualDirection;result.audioDirection=accepted[0].d.audioDirection;}else if(v.audioDirection!==undefined)throw new Error('Audio direction needs its matching visual scene.');
 return result;
}
