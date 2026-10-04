import type { LearningCard, Notebook } from '../types';
import { compileNotebook, isUnmodifiedCompilerCard } from './compiler';
import { proposeSourceObjectives } from './objectives';
import { reconcileObjectives } from './evidence';
import { sourceLearningUnits } from './sourceUnits';
import { extractStructuredActivities, type StructuredActivity } from './structuredEngine';

function same(value:unknown):string {
  if(Array.isArray(value))return`[${value.map(same).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${same(v)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
/** Recognize the old compiler's literal template, without assuming an untagged pending draft is disposable. */
function originalExtractedWording(card:LearningCard):boolean {
  if(card.explanation!==`The source states: “${card.evidence}”`)return false;
  if(card.questionType==='definition'){
    const description=card.evidence.replace(/^\s*[-*•]\s+/,'').match(/^(?:\*\*)?([^:：\n]{2,85}?)(?:\*\*)?\s*[:：]\s*(.{12,650})$/u)?.[2]?.trim();
    return !!description&&/^Which term is paired with this description in “[^”]*”\?\n\n/.test(card.prompt)&&card.prompt.split('\n\n').slice(1).join('\n\n')===description;
  }
  if(card.questionType==='cloze')return /^Recall the exact missing word from “[^”]*”\.\n\n/.test(card.prompt)&&card.prompt.split('\n\n').slice(1).join('\n\n')===card.evidence.replace(card.answer,'________');
  if(card.questionType==='sequence'){
    const previous=card.evidence.split(/\r?\n/)[0].match(/^\s*\d+[.)]\s+(.+)$/)?.[1]?.trim();
    return !!previous&&/^In the numbered sequence in “[^”]*”, which step comes immediately after this one\?\n\n/.test(card.prompt)&&card.prompt.split('\n\n').slice(1).join('\n\n')===previous;
  }
  return false;
}
function authoredCard(card:LearningCard,baseline:LearningCard|undefined):boolean {
  if(card.questionType==='manual'||card.reviewStatus==='reviewed'||!card.tags.includes('source-recall')||card.tags.includes('ai-refined')||card.tags.includes('author-edited'))return true;
  if(isUnmodifiedCompilerCard(card))return false;
  if(card.tags.some(tag=>tag.startsWith('compiler-v2-')))return true;
  if(originalExtractedWording(card))return false;
  if(baseline&&same({...card,reviewStatus:undefined,tags:[]})===same({...baseline,reviewStatus:undefined,tags:[]}))return false;
  // Unknown legacy text may contain a creator's changes even if an old UI did not update its review flag.
  return true;
}
function comparableActivity(activity:StructuredActivity):string {
  // Recipe bindings and review state are independent of whether the author changed the generated teaching/model.
  const {reviewStatus:_review,scaffoldIds:_bindings,...model}=activity;return same(model);
}
function priorExtraction(activity:StructuredActivity,notebook:Notebook):StructuredActivity|undefined {
  const source=notebook.sources.find(s=>s.id===activity.extractedFrom);
  if(!source)return;
  const refs=activity.sourceRefs.filter(r=>r.sourceId===source.id);
  if(!refs.length)return;
  // Reconstruct only the old, explicitly cited structure. Never use a generated answer to invent source text.
  return extractStructuredActivities([{...source,status:'ready',text:refs.map(r=>r.evidence).join('\n')}]).activities.find(a=>a.id===activity.id);
}

/** Prepare from the entire readable collection. A focused passage selection is never an input requirement. */
export function prepareAutomaticLearning(notebook: Notebook): { notebook: Notebook; warnings: string[] } {
  const readable = notebook.sources.filter(source => source.status === 'ready' && source.text.trim());
  const compiled = compileNotebook(readable, { maxCards: 120, ageGroup: notebook.ageGroup, goal: notebook.goal });
  const units=readable.flatMap(sourceLearningUnits);
  // A document may contain unrelated category systems or rule sets. Parse each coherent source unit separately.
  const sourceById=new Map(readable.map(source=>[source.id,source]));
  const extracted = extractStructuredActivities(units.flatMap(unit=>(unit.passages.some(p=>p.kind==='code')?unit.passages.filter(p=>p.kind!=='code').map(p=>p.quote):[unit.quote]).map(text=>({...sourceById.get(unit.sourceId)!,text}))));
  const unsupportedSequences=extracted.activities.filter(activity=>activity.kind==='sequence'&&!activity.sourceRefs.some(ref=>units.some(unit=>unit.sourceId===ref.sourceId&&unit.kind==='procedure'&&unit.quote.includes(ref.evidence))));
  if(unsupportedSequences.length)extracted.warnings.push(`${unsupportedSequences.length} numbered list${unsupportedSequences.length===1?' was':'s were'} kept for source study because the material did not identify a procedure. Numbering alone is not a process rule.`);
  extracted.activities=extracted.activities.filter(activity=>!unsupportedSequences.includes(activity));
  const compiledById=new Map(compiled.cards.map(card=>[card.id,card]));
  const preservedCards = notebook.cards.filter(card=>authoredCard(card,compiledById.get(card.id))).map(card=>{
    // Mark recognized legacy edits so a later source revision cannot make them look disposable again.
    if(card.reviewStatus==='needs-review'&&card.tags.includes('source-recall')&&!card.tags.includes('ai-refined')&&!card.tags.includes('author-edited')&&card.tags.length<30)return{...card,tags:[...card.tags,'author-edited']};
    return card;
  });
  const cards = [...preservedCards, ...compiled.cards.filter(card => !preservedCards.some(saved => saved.id === card.id))].slice(0, 2000);
  const generatedById=new Map(extracted.activities.map(activity=>[activity.id,activity]));
  const existing=new Map<string,StructuredActivity>();
  for(const activity of notebook.activities??[]){
    if(!activity.extractedFrom||activity.reviewStatus==='reviewed'||/^media-/.test(activity.id)){existing.set(activity.id,activity);continue;}
    const baseline=generatedById.get(activity.id)??priorExtraction(activity,notebook);
    if(baseline&&comparableActivity(activity)===comparableActivity(baseline))continue;
    // This was edited (or its origin can no longer be established). Retain the authored model,
    // keeping its sourceRefs/review status, and stop treating it as a replaceable extraction.
    const {extractedFrom:_extraction,...authored}=activity;existing.set(activity.id,authored as StructuredActivity);
  }
  const defaults = { sequence:'process-reconstruction', classification:'classification-workshop', dependency:'concept-map-repair', data:'chart-and-data-investigation' };
  for (const activity of extracted.activities) {
    if (existing.has(activity.id)) continue;
    // Link only compatible primitives. A parsed conditional is not a branching simulation.
    const scaffoldId = defaults[activity.kind as keyof typeof defaults];
    existing.set(activity.id, { ...activity, ...(scaffoldId ? { scaffoldIds:[scaffoldId] } : {}) });
  }
  const authoredObjectives=(reconcileObjectives(notebook.learningObjectives,readable)??[]);
  const generatedObjectives=proposeSourceObjectives(readable).filter(objective=>!authoredObjectives.some(saved=>saved.id===objective.id)).map(({rationale:_r,supportedMechanics:_s,...objective})=>objective);
  const learningObjectives=[...authoredObjectives,...generatedObjectives].slice(0,100);
  return { notebook: { ...notebook, generationVersion:2, cards, learningObjectives, activities:[...existing.values()].slice(0, 300), scaffoldIds:[...new Set([...notebook.scaffoldIds, ...(cards.length ? ['recall-escape-mission'] : [])])] }, warnings:[...new Set([...compiled.warnings, ...extracted.warnings])] };
}

/** Upgrade only recognizably generated legacy work. Authored/sample notebooks are never silently recompiled. */
export function migrateAutomaticLearning(notebook:Notebook):{notebook:Notebook;changed:boolean;warnings:string[]}{
  if(notebook.generationVersion===2)return{notebook,changed:false,warnings:[]};
  const legacy=notebook.cards.some(card=>card.tags.includes('source-recall')&&card.questionType!=='manual'&&card.reviewStatus!=='reviewed'&&!card.tags.some(tag=>['ai-refined','author-edited'].includes(tag)||tag.startsWith('compiler-v2-'))&&originalExtractedWording(card));
  if(!legacy)return{notebook,changed:false,warnings:[]};
  const prepared=prepareAutomaticLearning(notebook);
  return{...prepared,changed:true,warnings:['Updated legacy word-blank practice into source concepts and complete study units. Authored and reviewed work was preserved.',...prepared.warnings]};
}
