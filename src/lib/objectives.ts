import type { EvidenceBlock, EvidenceReference, LearningCard, LearningObjective, Source } from '../types';
import { evidenceBlocks, evidenceReference, isCurrentEvidence, textDigest } from './evidence';
import { PROCEDURE_CUE, sourceConcepts, sourceLearningUnits } from './sourceUnits';
import { compileNotebook } from './compiler';
import { normalizeText } from './utils';

export interface ObjectiveCandidate extends LearningObjective { rationale:string; supportedMechanics:string[] }
/** Templates describe a bounded observable task. They do not infer prerequisite knowledge or semantic truth. */
export function proposeObjectives(blocks:readonly EvidenceBlock[]):ObjectiveCandidate[]{
  const meaningful=blocks.filter(block=>block.quote.trim().length>=24);
  const selected=meaningful.length>8?Array.from({length:8},(_,i)=>meaningful[Math.floor(i*(meaningful.length-1)/7)]):meaningful;
  return selected.map(block=>{
    const lines=block.quote.split(/\r?\n/).map(x=>x.trim()),definition=lines.find(line=>/^[^:]{2,70}:\s+\S/.test(line)),steps=lines.filter(line=>/^\d+[.)]\s+\S/.test(line));
    let operation:LearningObjective['operation']='recall',title:string,rationale:string,supportedMechanics:string[];
    if(steps.length>=2&&PROCEDURE_CUE.test(block.quote)){operation='sequence';title='Reconstruct the stated sequence';rationale='This passage contains numbered steps. Check that the numbering expresses an intended order.';supportedMechanics=['Source recall','Author-reviewed sequence'];}
    else if(definition){const term=definition.slice(0,definition.indexOf(':')).trim();title=`Recall the source definition of ${term}`;rationale='The source explicitly pairs a term with a definition. Review alternatives before using it for assessment.';supportedMechanics=['Source recall','Definition match'];}
    else {const concept=sourceConcepts(block.quote)[0];const topic=concept?.term??block.quote.split(/[.!?\n]/)[0].trim().slice(0,110);operation='explanation';title=`Explain the source idea: ${topic}`;rationale='Read the complete passage, describe its meaning, and check your explanation against the source. This is unscored study until an author supplies a reviewed assessment model.';supportedMechanics=['Source study','Evidence field note'];}
    return{id:`objective-${textDigest(`${block.sourceId}:${block.sourceRevision}:${block.start}:${operation}`).slice(0,24)}`,title:title.slice(0,300),operation,reviewStatus:'needs-review',evidence:[evidenceReference(block)],rationale,supportedMechanics};
  });
}
/** Bounded portable objectives accompany complete, uncapped source units; no inferred answer keys. */
export function proposeSourceObjectives(sources:readonly Source[],limit=100):ObjectiveCandidate[]{
  const result:ObjectiveCandidate[]=[];
  for(const source of sources){
    const blocks=evidenceBlocks(source,1200);
    for(const unit of sourceLearningUnits(source)){
      if(unit.quote.trim().length<24)continue;
      const evidence=blocks.filter(block=>block.start>=unit.start&&block.end<=unit.end).map(evidenceReference);
      if(!evidence.length)continue;
      const comparison=unit.concepts.length>=2&&new Set(unit.concepts.map(c=>normalizeText(c.description))).size===unit.concepts.length&&new Set(unit.concepts.map(c=>normalizeText(c.term))).size===unit.concepts.length;
      const operation=unit.kind==='procedure'?'sequence':unit.kind==='concept'&&comparison?'recall':'explanation';
      result.push({id:`objective-unit-${textDigest(`${source.id}:${unit.id}:${unit.quote}`).slice(0,24)}`,title:`${operation==='sequence'?'Reconstruct':operation==='recall'?'Distinguish':'Explain'}: ${unit.title}`.slice(0,300),operation,reviewStatus:'needs-review',evidence:evidence.slice(0,8),rationale:operation==='sequence'?'The source marks a procedure and supplies its ordered steps. Review the sequence before scoring.':operation==='recall'?'The source names these concepts explicitly. Read their explanations before comparing the related definitions.':'This source unit supports reading, observation and a source-checked field note; it does not supply an automatic grading model.',supportedMechanics:operation==='sequence'?['Source study','Author-reviewed sequence']:operation==='recall'?['Source study','Concept comparison']:['Source study','Evidence field note']});
    }
  }
  const count=Math.max(1,Math.min(100,Math.floor(limit)||100));
  return result.length>count?Array.from({length:count},(_,i)=>result[Math.floor(i*(result.length-1)/Math.max(1,count-1))]):result;
}
export function saveObjective(candidate:LearningObjective,sources:readonly Source[]):LearningObjective {
  if(!candidate.evidence.length||!candidate.evidence.every(ref=>isCurrentEvidence(ref,sources)))throw new Error('The selected source changed. Choose its evidence again.');
  return{id:candidate.id,title:candidate.title,operation:candidate.operation,reviewStatus:'needs-review',evidence:candidate.evidence.map(evidenceReference)};
}
/** Scope deterministic compilation to chosen exact passages; no model determines the answer. */
export function compileEvidenceRecall(refs:readonly EvidenceReference[],sources:readonly Source[]):{cards:LearningCard[];warnings:string[]}{
  if(!refs.length||refs.length>8||refs.some(ref=>!isCurrentEvidence(ref,sources)))throw new Error('Choose 1–8 current source passages before creating practice.');
  const slices=refs.map((ref,i)=>({...sources.find(s=>s.id===ref.sourceId)!,id:`selection-${i}`,text:ref.quote}));
  const result=compileNotebook(slices,{maxCards:24});
  const cards=result.cards.map(card=>{const index=Number(card.sourceId.slice('selection-'.length)),ref=refs[index];return{...card,id:`card-evidence-${textDigest(`${ref.sourceId}:${card.prompt}:${card.evidence}`).slice(0,24)}`,sourceId:ref.sourceId,reviewStatus:'needs-review' as const,tags:[...card.tags,'selected-evidence']};});
  return{cards,warnings:cards.length?['Created draft recall challenges from your selected evidence. Review each answer and its alternatives before scored play.']:['These passages do not contain enough explicit material for distinct recall choices. Add another related passage or write a challenge with your own reviewed alternatives.']};
}
