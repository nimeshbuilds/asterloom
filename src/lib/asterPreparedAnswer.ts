import type {EvidenceReference} from '../types';
import type {AsterAwarenessContext} from './asterAwareness';
import {asterCurrentTopic,normalizeAsterQuestion} from './asterAwareness';
import {currentAILearningMission} from './aiLearningPlan';
import {evidenceReference,isCurrentEvidence} from './evidence';
import {validateGameDesign} from './gameDesign';
import {gameOverviewView} from './gameOverview';
import {hasCurrentActivityEvidence} from './scaffoldRuntime';

export interface AsterPreparedAnswer {title:string;text:string;citations:EvidenceReference[];kind:'lesson'|'overview';origin?:'saved-lessons'|'generated'}
const uniqueReferences=(references:EvidenceReference[])=>[...new Map(references.map(ref=>[`${ref.sourceId}:${ref.sourceRevision}:${ref.start}:${ref.end}`,evidenceReference(ref)])).values()];

/** Reuse complete, already prepared explanations for explicit screen-relative
 * requests. This is not a free-form answer generator: subject questions continue
 * to retrieval, and every saved artifact is checked against current material. */
export function preparedAsterAnswer(question:unknown,context:AsterAwarenessContext):AsterPreparedAnswer|undefined {
 if(typeof question!=='string'||!question.trim()||question.length>500||!context.notebook||context.mode==='library')return;
 const notebook=context.notebook,q=normalizeAsterQuestion(question);
 const overview=/^(?:(?:what does|what will) (?:this|my|our) (?:game|notebook) (?:teach|cover)|what (?:will|can) i learn (?:in|from) (?:this|my|our) (?:game|notebook)|(?:tell me about|describe|summarize|explain) (?:this|my|our) (?:game|notebook)|give me an overview of (?:this|my|our) (?:game|notebook))$/.test(q);
 if(overview){
  let gameDesign=notebook.gameDesign;
  if(gameDesign)try{gameDesign=validateGameDesign(gameDesign,notebook);}catch{gameDesign=undefined;}
  const view=gameOverviewView({...notebook,gameDesign}),content=view.content;if(!content)return;
  const claims=[content.introduction,...content.keyIdeas];
  if(claims.some(claim=>!claim.citations.length||claim.citations.some(ref=>!isCurrentEvidence(ref,notebook.sources))))return;
  const introduction=view.origin==='generated'?'Here is the introduction prepared for this game.':'Here are selected explanations from your saved lessons. This preview does not cover every source detail.';
  const paragraphs=[content.introduction.text,...content.keyIdeas.map(idea=>`${idea.title}\n${idea.text}`)];
  return{kind:'overview',origin:view.origin==='generated'?'generated':'saved-lessons',title:view.origin==='generated'?'Prepared game introduction':'Preview from saved lessons',text:[introduction,...new Set(paragraphs)].join('\n\n'),citations:uniqueReferences(claims.flatMap(claim=>claim.citations))};
 }
 if(!asterCurrentTopic(question,context)||!context.activityId||!['play','study'].includes(context.mode))return;
 const activity=notebook.activities?.find(item=>item.id===context.activityId);
 if(!activity||!hasCurrentActivityEvidence(activity,notebook.sources))return;
 const lesson=currentAILearningMission(notebook,activity);if(!lesson)return;
 const claims=[lesson.conceptExplanation,...lesson.chunks];
 if(claims.some(claim=>!claim.citations.length||claim.citations.some(ref=>!isCurrentEvidence(ref,notebook.sources))))return;
 // Never substitute a guessed example for an explicit request for one.
 if(/^give (?:me )?an example of this$/.test(q)){
  if(!lesson.workedExample)return;
  const example=lesson.workedExample,refs=[example.sourceEvidence,...example.steps.flatMap(step=>step.citations)];
  if(refs.some(ref=>!isCurrentEvidence(ref,notebook.sources)))return;
  return{kind:'lesson',title:'Prepared lesson example',text:[example.title,...example.steps.map(step=>`${step.title}\n${step.text}`)].join('\n\n'),citations:uniqueReferences(refs)};
 }
 return{kind:'lesson',title:'Prepared lesson explanation',text:[`Here is the explanation prepared for “${lesson.title}”.`,lesson.conceptExplanation.text,...lesson.chunks.map(chunk=>`${chunk.title}\n${chunk.text}`)].join('\n\n'),citations:uniqueReferences(claims.flatMap(claim=>claim.citations))};
}
