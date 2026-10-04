import type { EvidenceBlock, EvidenceReference, LearningCard, LearningObjective, Source } from '../types';
import { evidenceReference, isCurrentEvidence, textDigest } from './evidence';
import { compileNotebook } from './compiler';

export interface ObjectiveCandidate extends LearningObjective { rationale:string; supportedMechanics:string[] }
/** Templates describe a bounded observable task. They do not infer prerequisite knowledge or semantic truth. */
export function proposeObjectives(blocks:readonly EvidenceBlock[]):ObjectiveCandidate[]{
  return blocks.slice(0,8).map(block=>{
    const lines=block.quote.split(/\r?\n/).map(x=>x.trim()),definition=lines.find(line=>/^[^:]{2,70}:\s+\S/.test(line)),steps=lines.filter(line=>/^\d+[.)]\s+\S/.test(line));
    let operation:LearningObjective['operation']='recall',title:string,rationale:string,supportedMechanics:string[];
    if(steps.length>=2){operation='sequence';title='Reconstruct the stated sequence';rationale='This passage contains numbered steps. Check that the numbering expresses an intended order.';supportedMechanics=['Source recall','Author-reviewed sequence'];}
    else if(definition){const term=definition.slice(0,definition.indexOf(':')).trim();title=`Recall the source definition of ${term}`;rationale='The source explicitly pairs a term with a definition. Review alternatives before using it for assessment.';supportedMechanics=['Source recall','Definition match'];}
    else {const topic=block.quote.split(/[.!?\n]/)[0].trim().slice(0,110);title=`Recall the stated idea: ${topic}`;rationale='This is a quotation-backed recall objective. An application or explanation task needs additional authored rules and review.';supportedMechanics=['Source recall'];}
    return{id:`objective-${textDigest(`${block.sourceId}:${block.sourceRevision}:${block.start}:${operation}`).slice(0,24)}`,title:title.slice(0,300),operation,reviewStatus:'needs-review',evidence:[evidenceReference(block)],rationale,supportedMechanics};
  });
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
