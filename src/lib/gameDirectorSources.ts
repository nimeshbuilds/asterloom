import type {Notebook,Source} from '../types';
import {sourceLearningUnits,type SourceLearningUnit} from './sourceUnits';
import {sourceRevision,textDigest} from './evidence';
import {isReadyLearningSource} from './scaffoldRuntime';

/** A creation inventory, not an assertion that every passage supports a scored game. */
export interface DirectorSourceUnit {
 id:string;sourceId:string;sourceRevision:string;sourceTitle:string;title:string;
 start:number;end:number;excerpt:string;headingPath:string[];
 kind:SourceLearningUnit['kind'];missionEligible:boolean;limitation?:string;
}
export interface DirectorSourceBatch {id:string;unitIds:string[]}
export interface DirectorSourceInventory {
 units:DirectorSourceUnit[];batches:DirectorSourceBatch[];
 unavailableSources:{sourceId:string;reason:string}[];
}

function groupedUnits(source:Source):SourceLearningUnit[]{
 const result:SourceLearningUnit[]=[];
 for(const unit of sourceLearningUnits(source)){
  const previous=result.at(-1),unsafe=unit.passages.some(p=>p.fragment||p.kind==='code');
  if(previous&&!unsafe&&!previous.passages.some(p=>p.fragment||p.kind==='code')&&previous.sectionKey===unit.sectionKey&&JSON.stringify(previous.headingPath)===JSON.stringify(unit.headingPath)&&unit.end-previous.start<=6000){
   const excerpt=source.text.slice(previous.start,unit.end);
   result[result.length-1]={...previous,id:`director-unit-${textDigest(JSON.stringify([source.id,previous.start,unit.end,excerpt])).slice(0,32)}`,end:unit.end,quote:excerpt,passages:[...previous.passages,...unit.passages],concepts:[...previous.concepts,...unit.concepts],warnings:[...new Set([...previous.warnings,...unit.warnings])]};
  }else result.push(unit);
 }
 return result;
}

/** Every readable unit appears exactly once. No first-six selection or silent character cap. */
export function buildDirectorSourceInventory(notebook:Pick<Notebook,'sources'>):DirectorSourceInventory {
 const units:DirectorSourceUnit[]=[],unavailableSources:DirectorSourceInventory['unavailableSources']=[];
 for(const source of [...notebook.sources].sort((a,b)=>a.id.localeCompare(b.id))){
  if(!isReadyLearningSource(source,notebook.sources)){
   unavailableSources.push({sourceId:source.id,reason:source.status==='error'?'This source needs its import error repaired.':'This source needs current readable text or checked media evidence.'});continue;
  }
  const parsed=groupedUnits(source);
  if(!parsed.length){unavailableSources.push({sourceId:source.id,reason:'No readable learning passage was found in this source.'});continue;}
  for(const unit of parsed){
   const limitation=unit.passages.some(p=>p.fragment)?'This fragment needs its larger source context; use source study instead of inventing a standalone answer.':unit.passages.some(p=>p.kind==='code')?'This code remains available for source study; this bounded game writer does not execute or infer an unprovided program specification.':unit.quote.length<40?'This passage is too short to justify a standalone game model.':undefined;
   units.push({id:unit.id,sourceId:source.id,sourceRevision:sourceRevision(source),sourceTitle:source.title.slice(0,150),title:unit.title.slice(0,160),start:unit.start,end:unit.end,excerpt:unit.quote,headingPath:unit.headingPath.map(h=>h.slice(0,200)),kind:unit.kind,missionEligible:!limitation,...(limitation?{limitation}:{})});
  }
 }
 // ID-keyed source collections may be reordered by durable merges. Canonical source
 // order keeps cached batches stable; passage order inside each document is preserved.
 const batches:DirectorSourceBatch[]=[];let pending:DirectorSourceUnit[]=[],characters=0;
 const flush=()=>{if(!pending.length)return;batches.push({id:`batch-${textDigest(JSON.stringify(pending.map(u=>[u.id,u.sourceRevision]))).slice(0,32)}`,unitIds:pending.map(u=>u.id)});pending=[];characters=0;};
 for(const unit of units){if(pending.length>=3||characters+unit.excerpt.length>12000)flush();pending.push(unit);characters+=unit.excerpt.length;}flush();
 return{units,batches,unavailableSources};
}

/** Cached planning is invalid after content, audience, goal or selected provider/model changes. */
export function directorInputRevision(notebook:Pick<Notebook,'sources'|'ageGroup'|'goal'>,provider:{provider:string;model:string;baseUrl?:string;endpointFingerprint?:string|null}):string {
 const sources=notebook.sources.map(source=>({id:source.id,title:source.title,revision:sourceRevision(source),status:source.status,transcript:source.transcript,visualEvidence:source.visualEvidence,asset:source.asset?.sha256})).sort((a,b)=>a.id.localeCompare(b.id));
 return textDigest(JSON.stringify({version:1,sources,ageGroup:notebook.ageGroup,goal:notebook.goal,provider:provider.provider,model:provider.model,endpoint:provider.endpointFingerprint??(provider.baseUrl?textDigest(provider.baseUrl):null)}));
}
