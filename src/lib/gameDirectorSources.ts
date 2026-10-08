import type {Notebook,Source} from '../types';
import {sourceLearningUnits,segmentSource,type SourceLearningUnit} from './sourceUnits';
import {sourceRevision,textDigest} from './evidence';
import {isReadyLearningSource} from './scaffoldRuntime';
import {sourceContentExclusions} from './sourceContent';

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

export const LEGACY_CODE_STUDY_LIMITATION='This code remains available for source study; this bounded game writer does not execute or infer an unprovided program specification.';
export const MIXED_CODE_PROSE_LIMITATION='This unit includes inert code for context. A mission may teach only its explicit non-code explanations, definitions or instructions. Preserve all stated conditions; do not execute code or infer behavior, rules or answers from it. If the prose depends on unprovided code semantics, use source study.';

/** Mixed technical material keeps its complete context. Only the evidence used to
 * teach a bounded mission must be entirely supported by complete non-code spans. */
export function assertDirectorProseEvidence(unit:DirectorSourceUnit,sources:Source[],references:{sourceId:string;evidence:string;start?:number;end?:number}[]):void {
 const source=sources.find(source=>source.id===unit.sourceId);if(!source)throw new Error('The mission source is unavailable.');
 const segments=segmentSource(source.text).filter(segment=>segment.end>unit.start&&segment.start<unit.end);
 if(!segments.some(segment=>segment.kind==='code'))return;
 const prose=segments.filter(segment=>segment.kind!=='code'&&!segment.fragment);
 const rangeSupported=(start:number,end:number)=>{
  let cursor=start;
  for(const span of prose){
   if(span.end<=cursor||span.start>=end)continue;
   if(span.start>cursor&&source.text.slice(cursor,Math.min(span.start,end)).trim())return false;
   cursor=Math.max(cursor,Math.min(span.end,end));if(cursor===end)break;
  }
  return cursor===end||!source.text.slice(cursor,end).trim();
 };
 const supported=(reference:typeof references[number])=>{
  const quote=reference.evidence;if(!quote.trim())return false;
  if(reference.start!==undefined||reference.end!==undefined){
   const {start,end}=reference;return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start!>=unit.start&&end!<=unit.end&&end!>start!&&source.text.slice(start,end)===quote&&rangeSupported(start!,end!);
  }
  let offset=unit.excerpt.indexOf(quote);
  while(offset>=0){if(rangeSupported(unit.start+offset,unit.start+offset+quote.length))return true;offset=unit.excerpt.indexOf(quote,offset+1);}
  return false;
 };
 if(references.some(reference=>reference.sourceId!==unit.sourceId||!supported(reference)))throw new Error('For a source unit containing code, cite only complete non-code explanations or instructions. Keep code as context, not as an inferred answer or teaching claim.');
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
  if(!parsed.length){unavailableSources.push({sourceId:source.id,reason:sourceContentExclusions(source.text).length?'Only publication, cover, or navigation material was found; add the document’s actual explanation or examples.':'No readable learning passage was found in this source.'});continue;}
  for(const unit of parsed){
   const fragmented=unit.passages.some(p=>p.fragment),hasCode=unit.passages.some(p=>p.kind==='code');
   const mixedProse=hasCode&&unit.passages.some(p=>p.kind!=='code'&&!p.fragment&&p.quote.trim().length>=40);
   const limitation=fragmented?'This fragment needs its larger source context; use source study instead of inventing a standalone answer.':hasCode?mixedProse?MIXED_CODE_PROSE_LIMITATION:LEGACY_CODE_STUDY_LIMITATION:unit.quote.length<40?'This passage is too short to justify a standalone game model.':undefined;
   const missionEligible=!fragmented&&(mixedProse||!limitation);
   units.push({id:unit.id,sourceId:source.id,sourceRevision:sourceRevision(source),sourceTitle:source.title.slice(0,150),title:unit.title.slice(0,160),start:unit.start,end:unit.end,excerpt:unit.quote,headingPath:unit.headingPath.map(h=>h.slice(0,200)),kind:unit.kind,missionEligible,...(limitation?{limitation}:{})});
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
 return textDigest(JSON.stringify({version:notebook.sources.some(source=>sourceContentExclusions(source.text).length)?2:1,sources,ageGroup:notebook.ageGroup,goal:notebook.goal,provider:provider.provider,model:provider.model,endpoint:provider.endpointFingerprint??(provider.baseUrl?textDigest(provider.baseUrl):null)}));
}
