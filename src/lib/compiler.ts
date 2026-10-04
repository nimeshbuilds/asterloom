import type { CompileOptions, CompileResult, LearningCard, Source } from '../types';
import { createId, normalizeText, seededShuffle, stableHash } from './utils';
import { evidenceBlocks, textDigest } from './evidence';
import { isSourceProcedure, segmentSource, sourceConcepts, sourceLearningUnits, sourceSentences, type SourceConcept, type SourceSegment } from './sourceUnits';

const STOP = new Set('a an the of in to for on and or but is are was were be being been it its they them their these those this that with from as by at if then than when where which who how what we you your our can could should would will may might must does do not also into through each all such using used use before after between has have had means called'.split(' '));
const words = (value: string) => normalizeText(value).split(' ').filter(word => word.length > 1 && !STOP.has(word));
interface Candidate { source: Source; answer: string; prompt: string; evidence: string; concept: string; questionType: 'definition' | 'cloze' | 'sequence'; distractors: string[]; start:number; sectionKey:string }
const keyOf = (value:string) => normalizeText(value).replace(/\s+/g,' ');
const containsTerm = (text:string,term:string) => (` ${keyOf(text)} `).includes(` ${keyOf(term)} `);

function contextFor(source:Source,concept:SourceConcept,segments:SourceSegment[],index:number,paragraphConcepts:Map<number,SourceConcept[]>):string {
  const paragraph=segments[index];
  if(!paragraph)return concept.quote;
  // Do not expand a glossary entry into unrelated adjacent definitions. Preserve explanatory prose and examples.
  const peers=paragraphConcepts.get(index)??[];
  const following=peers.find(c=>c.start>concept.start);
  let start=peers.length>1?concept.start:paragraph.start,end=peers.length>1?(following?.start??paragraph.end):paragraph.end;
  while(end>start&&/\s/.test(source.text[end-1]))end--;
  const next=segments[index+1];
  if(next&&next.sectionKey===paragraph.sectionKey&&next.kind==='paragraph'&&!next.fragment&&next.end-start<=1800&&!(paragraphConcepts.get(index+1)?.length)&&containsTerm(next.quote,concept.term))end=next.end;
  return source.text.slice(start,end);
}
function definitions(source:Source,segments:SourceSegment[],concepts:SourceConcept[]):Candidate[]{
  const groups=new Map<string,SourceConcept[]>(), locations=new Map<SourceConcept,number>(),paragraphConcepts=new Map<number,SourceConcept[]>();
  let position=0;
  for(const concept of concepts){
    const group=groups.get(concept.sectionKey)??[];group.push(concept);groups.set(concept.sectionKey,group);
    while(position<segments.length&&segments[position].end<=concept.start)position++;
    locations.set(concept,position);const entries=paragraphConcepts.get(position)??[];entries.push(concept);paragraphConcepts.set(position,entries);
  }
  const result:Candidate[]=[];
  for(const peers of groups.values()){
    const descriptions=new Map<string,Set<string>>(),terms=new Map<string,Set<string>>();
    for(const c of peers){const term=keyOf(c.term),description=keyOf(c.description);const a=descriptions.get(description)??new Set();a.add(term);descriptions.set(description,a);const b=terms.get(term)??new Set();b.add(description);terms.set(term,b);}
    for(let index=0;index<peers.length;index++){
      const concept=peers[index];
      // Ambiguous definitions cannot establish a unique answer. Alternatives come from nearby concepts in this section.
      if(descriptions.get(keyOf(concept.description))!.size>1||terms.get(keyOf(concept.term))!.size>1||containsTerm(concept.description,concept.term))continue;
      const alternatives=new Map<string,string>();
      for(let offset=1;offset<peers.length&&offset<=24&&alternatives.size<8;offset++)for(const candidateIndex of [index+offset,index-offset]){
        const c=peers[candidateIndex];if(c&&keyOf(c.term)!==keyOf(concept.term)&&!containsTerm(concept.description,c.term))alternatives.set(keyOf(c.term),c.term);
      }
      const distractors=[...alternatives.values()];if(!distractors.length)continue;
      result.push({source,answer:concept.term,prompt:`Which source concept matches this description?\n\n${concept.description}`,evidence:contextFor(source,concept,segments,locations.get(concept)!,paragraphConcepts),concept:concept.term,questionType:'definition',distractors,start:concept.start,sectionKey:concept.sectionKey});
    }
  }
  return result;
}
function conceptApplications(source:Source,segments:SourceSegment[],concepts:SourceConcept[]):Candidate[]{
  const candidates:Candidate[]=[];const seen=new Set<string>();
  for(const segment of segments){
    if(segment.fragment||segment.kind!=='paragraph')continue;
    const peers=concepts.filter(c=>c.sectionKey===segment.sectionKey);
    for(const sentence of sourceSentences(segment.quote,segment.start)){
      if(sentence.quote.length<40||sentence.quote.length>650||concepts.some(c=>sentence.start<c.end&&sentence.end>c.start))continue;
      const matches=peers.filter(c=>containsTerm(sentence.quote,c.term));
      if(matches.length!==1)continue;
      const concept=matches[0],key=`${segment.sectionKey}:${keyOf(concept.term)}`;
      if(seen.has(key))continue;
      // Replace an explicitly defined whole concept, never an arbitrarily selected long word.
      const escaped=concept.term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const match=new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu').exec(sentence.quote);
      if(!match)continue;
      const distractors=[...new Map(peers.filter(c=>keyOf(c.term)!==keyOf(concept.term)&&!containsTerm(sentence.quote,c.term)).map(c=>[keyOf(c.term),c.term])).values()];
      if(!distractors.length)continue;
      seen.add(key);const answer=match[0];
      candidates.push({source,answer,prompt:`Use the concept named in the source to complete its explanation.\n\n${sentence.quote.slice(0,match.index)}________${sentence.quote.slice(match.index+answer.length)}`,evidence:segment.quote,concept:concept.term,questionType:'cloze',distractors,start:sentence.start,sectionKey:segment.sectionKey});
    }
  }
  return candidates;
}
function sequences(source:Source,segments:SourceSegment[]):Candidate[]{
  const result:Candidate[]=[];
  for(const segment of segments){
    if(segment.kind!=='list'||segment.fragment)continue;
    const prior=segments.filter(p=>p.end<=segment.start&&p.sectionKey===segment.sectionKey).at(-1);
    const introduction=[...segment.headingPath,prior?.quote??''].join(' ');
    if(!isSourceProcedure(segment,introduction))continue;
    const lines=[...segment.quote.matchAll(/[^\r\n]+/g)];
    const steps=lines.map(m=>{const match=m[0].match(/^\s*(\d{1,2})[.)]\s+(.{5,240})\s*$/);return match?{ordinal:Number(match[1]),text:match[2].trim(),start:segment.start+m.index!,end:segment.start+m.index!+m[0].length}:undefined;});
    if(steps.length<2||steps.length>12||steps.some((step,i)=>!step||step.ordinal!==i+1)||new Set(steps.map(s=>s!.text)).size!==steps.length)continue;
    for(let i=1;i<steps.length;i++){
      const current=steps[i]!,previous=steps[i-1]!;
      result.push({source,answer:current.text,prompt:`In the source procedure, what follows this step?\n\n${previous.text}`,evidence:source.text.slice(segment.start,segment.end),concept:segment.headingPath.at(-1)||'Source procedure',questionType:'sequence',distractors:steps.filter((_,j)=>j!==i).map(s=>s!.text),start:current.start,sectionKey:segment.sectionKey});
    }
  }
  return result;
}
function fingerprint(card:Pick<LearningCard,'id'|'prompt'|'answer'|'options'|'correctIndex'|'explanation'|'sourceId'|'evidence'|'concept'|'questionType'>):string {
  return `compiler-v2-${textDigest(JSON.stringify([card.id,card.prompt,card.answer,card.options,card.correctIndex,card.explanation,card.sourceId,card.evidence,card.concept,card.questionType]))}`;
}
/** Detect unmodified generated drafts across compiler/source revisions without erasing creator edits. */
export function isUnmodifiedCompilerCard(card:LearningCard):boolean{return card.tags.includes(fingerprint(card));}
function spread<T>(items:T[],count:number):T[]{return items.length>count?Array.from({length:count},(_,i)=>items[Math.floor(i*(items.length-1)/Math.max(1,count-1))]):[...items];}
function balancedCandidates(found:Candidate[],count:number):Candidate[]{
  const sections=[...new Set(found.map(c=>c.sectionKey))].map(key=>found.filter(c=>c.sectionKey===key));
  const participating=spread(sections,Math.min(count,sections.length)),shares=participating.map(()=>0);
  for(let left=count;left>0;){let changed=false;for(let i=0;i<participating.length&&left>0;i++)if(shares[i]<participating[i].length){shares[i]++;left--;changed=true;}if(!changed)break;}
  const selected=participating.flatMap((section,i)=>spread(section,shares[i]));
  return selected.sort((a,b)=>a.start-b.start);
}
/** Source-grounded extraction. Unsupported prose produces study units, never manufactured answer alternatives. */
export function compileNotebook(sources:Source[],options:CompileOptions={}):CompileResult{
  const warnings:string[]=[],groups:Candidate[][]=[];
  for(const source of sources){
    if(source.status!=='ready'||!source.text.trim()){warnings.push(`“${source.title}” needs readable text or a transcript before it can produce learning activities.`);continue;}
    const segments=segmentSource(source.text),concepts=sourceConcepts(source.text,segments),units=sourceLearningUnits(source);
    const found=[...definitions(source,segments,concepts),...sequences(source,segments),...conceptApplications(source,segments,concepts)].sort((a,b)=>a.start-b.start);
    const seen=new Set<string>();const unique=found.filter(c=>{const key=`${c.questionType}:${keyOf(c.answer)}:${c.sectionKey}`;if(seen.has(key))return false;seen.add(key);return true;});
    if(unique.length)groups.push(unique);
    else warnings.push(`“${source.title}” is available as ${units.length} source study unit${units.length===1?'':'s'}. It does not provide unambiguous related concepts or an explicitly signalled procedure for scored recall.`);
    const uncovered=units.filter(unit=>!unique.some(c=>c.start>=unit.start&&c.start<unit.end));
    if(unique.length&&uncovered.length)warnings.push(`${uncovered.length} unit${uncovered.length===1?'':'s'} in “${source.title}” remain study/observation material; no unsupported scored task was invented.`);
  }
  const maxCards=Math.max(1,Math.min(300,Math.floor(options.maxCards??60))),participating=spread(groups,Math.min(maxCards,groups.length)),shares=participating.map(()=>0);
  for(let remaining=maxCards;remaining>0;){let allocated=false;for(let i=0;i<participating.length&&remaining>0;i++)if(shares[i]<participating[i].length){shares[i]++;remaining--;allocated=true;}if(!allocated)break;}
  const queues=participating.map((group,i)=>balancedCandidates(group,shares[i])),cards:LearningCard[]=[];
  while(queues.some(q=>q.length)&&cards.length<maxCards)for(const queue of queues){
    const candidate=queue.shift();if(!candidate)continue;
    const key=`${candidate.source.id}:${candidate.questionType}:${candidate.answer}:${candidate.evidence}`,seed=stableHash(key);
    const distractors=seededShuffle(candidate.distractors,seed).slice(0,3),optionList=seededShuffle([candidate.answer,...distractors],seed+1);
    const card:LearningCard={id:`card-${seed.toString(36)}`,prompt:candidate.prompt,answer:candidate.answer,options:optionList,correctIndex:optionList.indexOf(candidate.answer),explanation:`Read the source’s complete statement and explanation:\n\n${candidate.evidence}`,sourceId:candidate.source.id,evidence:candidate.evidence,concept:candidate.concept,tags:['source-recall',candidate.questionType],questionType:candidate.questionType,reviewStatus:candidate.source.transcript||candidate.source.visualEvidence||['transcript','audio','video','image'].includes(candidate.source.kind)?'needs-review':'extractive'};
    card.tags.push(fingerprint(card));cards.push(card);
  }
  if(cards.length)warnings.push('Recall targets use explicit source concepts and source-stated procedures. They do not certify application, transfer or the factual truth of the material.');
  if(groups.reduce((sum,g)=>sum+g.length,0)>maxCards)warnings.push(`Prepared up to ${maxCards} targets spread across sources and sections. The complete source study units remain available beyond this practice sample.`);
  return{cards,warnings,usedSourceIds:[...new Set(cards.map(card=>card.sourceId))]};
}

export interface SearchHit { sourceId: string; title: string; snippet: string; score: number; index: number }
/** BM25-style local retrieval; no embedding API or source upload is necessary. */
export function searchSources(sources: Source[], query: string, limit = 6): SearchHit[] {
  const queryTerms = [...new Set(words(query))];
  if (!queryTerms.length) return [];
  const chunks = sources.flatMap(source => evidenceBlocks(source,1000).map((block,index)=>({sourceId:source.id,title:source.title,snippet:block.quote,index,terms:words(block.quote)})));
  if (!chunks.length) return [];
  const average = chunks.reduce((sum, chunk) => sum + chunk.terms.length, 0) / chunks.length || 1;
  const documentFrequencies = new Map(queryTerms.map(term => [term, chunks.filter(chunk => chunk.terms.includes(term)).length]));
  return chunks.map(chunk => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = chunk.terms.filter(value => value === term).length;
      if (!frequency) continue;
      const idf = Math.log(1 + (chunks.length - (documentFrequencies.get(term) ?? 0) + 0.5) / ((documentFrequencies.get(term) ?? 0) + 0.5));
      score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * chunk.terms.length / average));
    }
    return { sourceId: chunk.sourceId, title: chunk.title, snippet: chunk.snippet, score, index: chunk.index };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.index - b.index).slice(0, Math.max(1, limit));
}

export function createManualCard(values: Partial<LearningCard> & Pick<LearningCard, 'prompt' | 'answer'>): LearningCard {
  if (!values.prompt.trim() || !values.answer.trim()) throw new Error('A challenge needs a question and an answer.');
  const optionList = [values.answer.trim(), ...(values.options ?? []).map(option => option.trim()).filter(Boolean)];
  const options = optionList.filter((option, index) => optionList.findIndex(other => other.toLocaleLowerCase() === option.toLocaleLowerCase()) === index);
  if (options.length < 2 || options.length > 8) throw new Error('Add one to seven distinct alternatives to the correct answer.');
  return { id: values.id ?? createId('card'), prompt: values.prompt.trim(), answer: values.answer.trim(), options, correctIndex: options.indexOf(values.answer.trim()), explanation: values.explanation?.trim() || `The author’s answer is: ${values.answer.trim()}`, sourceId: values.sourceId ?? '', evidence: values.evidence ?? '', concept: values.concept?.trim() || 'Author-created challenge', tags: values.tags ?? ['manual'], questionType: 'manual', reviewStatus: values.reviewStatus ?? 'needs-review' };
}

/** Normalize common timestamped subtitle formats before source compilation. */
export function transcriptToText(text: string): string {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => !/^\s*(?:WEBVTT.*|\d+|(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->.*)\s*$/.test(line)).map(line => line.replace(/<[^>]*>/g, '').trim()).filter(Boolean).filter((line, index, lines) => line !== lines[index - 1]).join('\n');
}
