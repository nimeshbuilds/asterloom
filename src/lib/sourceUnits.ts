import type { Source } from '../types';
import { normalizeText, stableHash } from './utils';
import {sourceContentExclusions} from './sourceContent';

export interface SourceSegment {
  start: number; end: number; quote: string;
  headingPath: string[]; sectionKey: string;
  kind: 'paragraph' | 'list' | 'table' | 'code';
  /** A size-limited piece of a sentence is useful for retrieval, never a complete claim. */
  fragment: boolean;
}
export interface SourceConcept {
  term: string; description: string; start: number; end: number;
  quote: string; sectionKey: string; headingPath: string[];
  form: 'label' | 'definition';
}
export interface SourceLearningUnit {
  id: string; sourceId: string; title: string; start: number; end: number; quote: string;
  headingPath: string[]; sectionKey: string;
  kind: 'concept' | 'procedure' | 'explanation' | 'reference';
  passages: SourceSegment[]; concepts: SourceConcept[]; warnings: string[];
}
const TIME = /^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/;
const PAGE = /^\[(?:Page|Slide|Sheet):?\s+[^\]\n]+\][ \t]*$/;
const cleanTitle = (value: string) => value.replace(/^#+\s*|\s*#+$/g, '').trim();
const termKey = (value: string) => normalizeText(value).replace(/\s+/g, ' ');
export const PROCEDURE_CUE = /\b(?:procedure|steps|method|workflow|instructions|protocol|recipe|process)\b/i;

const ACTION_START=/^(?:add|allow|assemble|attach|calculate|check|choose|close|collect|compare|confirm|connect|count|disconnect|draw|enter|find|identify|inspect|install|keep|label|measure|mix|move|observe|open|place|plan|read|record|remove|repeat|report|review|rinse|select|set|sort|start|stop|test|turn|verify|wait|write)\b/i;
/** Numbering alone proves no dependency. An explicit process cue or a complete ordered list of imperative actions supplies a conservative practice signal. */
export function isSourceLabeledProcedure(segment:SourceSegment, context=''):boolean {
  if(segment.kind!=='list'||segment.fragment)return false;
  const lines=segment.quote.split(/\r?\n/).filter(line=>line.trim()),steps=lines.map(line=>line.match(/^\s*(\d+)[.)]\s+(.+)$/));
  if(steps.length<2||steps.some((step,i)=>!step||Number(step[1])!==i+1))return false;
  const heading=segment.headingPath.at(-1)??'';
  const headingCue=/^(?:(?:the|a|an|our|your|source|supplied|documented|training|practice|experimental)\s+){0,3}(?:procedure|steps|method|workflow|instructions|protocol|recipe|process)\b/i.test(heading)&&!/\b(?:types|kinds|examples|features|requirements|criteria|components|materials|contents|overview)\b/i.test(heading);
  const contextCue=/\b(?:follow|following|perform|carry out|complete)\s+(?:the\s+|these\s+|this\s+)?(?:[a-z-]+\s+){0,2}(?:steps|procedure|instructions|protocol|workflow|process)\b/i.test(context)&&!/\b(?:not|no|without)\s+(?:an?\s+)?(?:ordered\s+)?(?:procedure|process|sequence|steps)\b/i.test(context);
  return headingCue||contextCue;
}

/** Inventory may also recognize an unambiguous complete list of imperative steps. */
export function isSourceProcedure(segment:SourceSegment, context=''):boolean {
  if(isSourceLabeledProcedure(segment,context))return true;
  if(segment.kind!=='list'||segment.fragment)return false;
  const steps=segment.quote.split(/\r?\n/).filter(line=>line.trim()).map(line=>line.match(/^\s*(\d+)[.)]\s+(.+)$/));
  return steps.length>=2&&steps.every((step,i)=>!!step&&Number(step[1])===i+1&&ACTION_START.test(step[2]));
}
/** The cited range must contain the complete list. Its explicit procedure label can live
 * in the source heading, which is preserved as structure rather than copied into a quote. */
export function explicitSourceProcedures(text:string,start=0,end=text.length):SourceSegment[] {
  const segments=segmentSource(text);
  return segments.filter((segment,index)=>{
    if(segment.start<start||segment.end>end||segment.kind!=='list')return false;
    const previous=segments[index-1],next=segments[index+1];
    // Size-bounded list pieces are not a complete procedure merely because the
    // first piece still starts at 1. Keep a continued list in source study.
    const last=segment.quote.trim().split(/\r?\n/).at(-1)?.match(/^\s*(\d+)[.)]\s+/);
    const following=next?.quote.match(/^\s*(\d+)[.)]\s+/);
    if(next?.kind==='list'&&next.sectionKey===segment.sectionKey&&last&&following&&Number(following[1])===Number(last[1])+1&&!text.slice(segment.end,next.start).trim())return false;
    const context=previous&&previous.sectionKey===segment.sectionKey&&previous.kind==='paragraph'?previous.quote.slice(-180):'';
    return isSourceLabeledProcedure(segment,context);
  });
}

/** Intl sentence boundaries keep decimals and common abbreviations inside their original sentence. */
export function sourceSentences(text: string, offset = 0): { start: number; end: number; quote: string }[] {
  const result: { start: number; end: number; quote: string }[] = [];
  for (const part of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
    const quote = part.segment.trim(); if (!quote) continue;
    const start = offset + part.index + part.segment.indexOf(quote);
    const previous=result.at(-1);
    if(previous&&/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\.$|^[A-Z]\.$)/.test(previous.quote)){previous.end=start+quote.length;previous.quote=text.slice(previous.start-offset,previous.end-offset);}
    else result.push({ start, end: start + quote.length, quote });
  }
  return result;
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}
function splitRange(text: string, start: number, end: number, limit: number, lineBoundaries: boolean): { start: number; end: number; fragment: boolean }[] {
  if (end - start <= limit) return [{ start, end, fragment: false }];
  const atoms = lineBoundaries
    ? [...text.slice(start, end).matchAll(/[^\r\n]+/g)].map(m => ({ start: start + m.index!, end: start + m.index! + m[0].length }))
    : sourceSentences(text.slice(start, end), start);
  const pieces: { start: number; end: number; fragment: boolean }[] = [];
  for (const atom of atoms) {
    let position = atom.start;
    if (atom.end - position <= limit) {
      const previous = pieces.at(-1);
      if (previous && !previous.fragment && atom.end - previous.start <= limit) previous.end = atom.end;
      else pieces.push({ ...atom, fragment: false });
      continue;
    }
    while (position < atom.end) {
      let finish = Math.min(atom.end, position + limit);
      if (finish < atom.end) {
        // Leave a usable tail instead of a final orphan word. These pieces remain explicitly fragments.
        const target = atom.end - finish < 40 ? Math.max(position + Math.floor(limit / 2), atom.end - 40) : finish;
        const whitespace = [...text.slice(position, target).matchAll(/\s+/g)].at(-1);
        finish = whitespace && whitespace.index! > limit / 3 ? position + whitespace.index! : target;
        if (/[\uD800-\uDBFF]/.test(text[finish - 1])) finish--;
      }
      const range = trimRange(text, position, finish);
      if (range.end > range.start) pieces.push({ ...range, fragment: true });
      position = finish; while (position < atom.end && /\s/.test(text[position])) position++;
    }
  }
  return pieces;
}

/** Parse document structure without rewriting a single source character or spanning section/cue boundaries. */
export function segmentSource(text: string, maxLength = 1200): SourceSegment[] {
  const limit = Math.max(120, Math.min(1200, Math.floor(maxLength) || 1200));
  const excluded=sourceContentExclusions(text);let excludedIndex=0,scanIndex=0;
  const lines = [...text.matchAll(/[^\r\n]*(?:\r?\n|$)/g)].filter(m => m[0].length).flatMap(m => {
    const start=m.index!,end=start+m[0].replace(/\r?\n$/, '').length;
    const parts:{raw:string;clean:string;start:number;end:number}[]=[];
    const add=(a:number,b:number)=>{const raw=text.slice(a,b);parts.push({raw,clean:raw.trim(),start:a,end:b});};
    while(scanIndex<excluded.length&&excluded[scanIndex].end<=start)scanIndex++;
    let cursor=start;
    for(let i=scanIndex;i<excluded.length&&excluded[i].start<end;i++){
      const range=excluded[i];if(range.start>cursor)add(cursor,Math.min(range.start,end));cursor=Math.max(cursor,range.end);
    }
    if(cursor<end||start===end)add(Math.min(cursor,end),end);return parts;
  });
  const subtitles = /^\uFEFF?WEBVTT\b/.test(text) || lines.some(line => TIME.test(line.clean));
  const result: SourceSegment[] = []; let headingPath: string[] = [], sectionKey = 'root', code = false, metadata = false;
  let pending: { start: number; end: number; kind: SourceSegment['kind'] } | undefined;
  const flush = () => {
    if (!pending) return;
    const range = trimRange(text, pending.start, pending.end);
    if (range.end > range.start) for (const part of splitRange(text, range.start, range.end, limit, pending.kind !== 'paragraph')) {
      result.push({ ...part, quote: text.slice(part.start, part.end), headingPath: [...headingPath], sectionKey, kind: pending.kind });
    }
    pending = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], next = lines[index + 1];
    while(excludedIndex<excluded.length&&excluded[excludedIndex].end<=line.start){flush();sectionKey=`content-${excluded[excludedIndex].end}`;excludedIndex++;}
    if (!line.clean) { flush(); metadata = false; continue; }
    if (subtitles && (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(line.clean) || metadata)) { flush(); metadata = true; continue; }
    if (subtitles && (/^\uFEFF?WEBVTT(?:\s|$)/.test(line.clean) || TIME.test(line.clean) || next && TIME.test(next.clean))) {
      flush(); if (TIME.test(line.clean)) sectionKey = `cue-${line.start}`; continue;
    }
    if (PAGE.test(line.clean)) { flush(); sectionKey = `location-${line.start}`; continue; }
    if (/^\s*(```|~~~)/.test(line.raw)) { flush(); code = !code; continue; }
    if (!code) {
      const markdown = line.clean.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      const setext = next && /^(?:={3,}|-{3,})$/.test(next.clean);
      const label = /^(?:[\p{L}\p{N}][^:：.!?]{0,100})[:：]$/u.test(line.clean) && line.clean.split(/\s+/).length <= 12;
      if (markdown || setext || label) {
        flush(); const level = markdown ? markdown[1].length : setext ? next.clean[0] === '=' ? 1 : 2 : 2;
        headingPath = [...headingPath.slice(0, level - 1), cleanTitle(markdown?.[2] ?? line.clean.replace(/[:：]$/, ''))];
        sectionKey = `section-${line.start}`; if (setext) index++; continue;
      }
    }
    const kind: SourceSegment['kind'] = code ? 'code' : /^\s*(?:\d+[.)]|[-*•])\s+/.test(line.raw) ? 'list' : line.clean.includes('\t') || /^\|.*\|$/.test(line.clean) ? 'table' : 'paragraph';
    if (pending && pending.kind !== kind) flush();
    if (pending) pending.end = line.end;
    else pending = { start: line.start, end: line.end, kind };
  }
  flush(); return result;
}

function validTerm(term: string): boolean {
  return term.length >= 2 && term.length <= 85 && term.split(/\s+/).length <= 9 && /[\p{L}]/u.test(term)
    && !/[.!?;{}=<>]/.test(term) && !/^(?:https?|note|example|warning|chapter|section|some|many|most|all|every|each|any|both|several|few|other|another|implemented|implementation|author|published|copyright|license|licence|isbn|issn|step\s*\d+|if|when|because|however|therefore|it|this|that|these|those|they|we|you|there|here)\b/i.test(term);
}
/** Conservative language patterns identify concepts explicitly named by the source, never the longest word. */
export function sourceConcepts(text: string, segments = segmentSource(text)): SourceConcept[] {
  const concepts: SourceConcept[] = [];
  const add = (term: string, description: string, start: number, end: number, segment: SourceSegment, form: SourceConcept['form']) => {
    term = term.replace(/^\*\*|\*\*$/g, '').trim(); description = description.trim();
    if (!validTerm(term) || description.length < 12 || description.length > 650 || description.split(/\s+/).length < 3) return;
    if (!text.slice(start, end).includes(term)) return;
    concepts.push({ term, description, start, end, quote: text.slice(start, end), sectionKey: segment.sectionKey, headingPath: segment.headingPath, form });
  };
  for (const segment of segments) {
    if (segment.fragment || segment.kind === 'code' || segment.kind === 'table') continue;
    for (const match of segment.quote.matchAll(/[^\r\n]+/g)) {
      const line = match[0], clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
      const label = clean.match(/^(?:\*\*)?([^:：\n]{2,85}?)(?:\*\*)?\s*[:：]\s*(.{12,650})$/u);
      if (label) {
        const start = segment.start + match.index! + line.indexOf(clean);
        add(label[1], label[2], start, start + clean.length, segment, 'label');
        continue;
      }
      if (segment.kind === 'list') continue;
      for (const sentence of sourceSentences(line, segment.start + match.index!)) {
        const explicit = sentence.quote.match(/^(?:\*\*)?([^:：.!?\n]{2,85}?)(?:\*\*)?\s+(?:is defined as|are defined as|refers to|means|is|are)\s+(.{12,650})$/iu);
        if (explicit) {
          const strong=/\s(?:is defined as|are defined as|refers to|means)\s/iu.test(sentence.quote);
          const nounDefinition=/^(?:a|an|the)\s+/i.test(explicit[2]);
          if((strong||nounDefinition)&&!/(?:\b(?:above|below|here|there))$/i.test(explicit[1]))add(explicit[1],explicit[2],sentence.start,sentence.end,segment,'definition');
        }
      }
    }
  }
  const seen = new Set<string>();
  return concepts.filter(c => { const key = `${c.sectionKey}:${termKey(c.term)}:${termKey(c.description)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Study units retain the explanation/example paragraphs even when no defensible scored task can be compiled. */
export function sourceLearningUnits(source: Pick<Source, 'id' | 'title' | 'text' | 'status'>): SourceLearningUnit[] {
  if (source.status !== 'ready') return [];
  const passages = segmentSource(source.text), concepts = sourceConcepts(source.text, passages), units: SourceLearningUnit[] = [];
  let group: SourceSegment[] = [];
  const flush = () => {
    if (!group.length) return;
    const start = group[0].start, end = group.at(-1)!.end, included = concepts.filter(c => c.start >= start && c.end <= end);
    const headingPath = group[0].headingPath;
    const procedure = group.some(p=>isSourceProcedure(p,source.text.slice(Math.max(start,p.start-180),p.start)));
    const kind = procedure ? 'procedure' : included.length ? 'concept' : group.every(p => p.kind === 'table' || p.kind === 'code') ? 'reference' : 'explanation';
    const quote = source.text.slice(start, end);
    const title = (headingPath.at(-1) || included.slice(0, 3).map(c => c.term).join(' · ') || sourceSentences(quote)[0]?.quote || source.title).slice(0, 160);
    units.push({ id: `unit-${stableHash(source.id + ':' + start + ':' + group[0].sectionKey + ':' + quote).toString(36)}`, sourceId: source.id, title, start, end, quote, headingPath, sectionKey: group[0].sectionKey, kind, passages: group, concepts: included, warnings: group.some(p => p.fragment) ? ['A source sentence exceeds the passage limit; read its adjacent pieces together.'] : [] });
    group = [];
  };
  for (const passage of passages) {
    if (group.length && (passage.sectionKey !== group[0].sectionKey || passage.end - group[0].start > 3600 || group.length >= 6)) flush();
    group.push(passage);
  }
  flush(); return units;
}

/** Exact overlap, rather than title matching, binds generated work to its teaching unit. */
export function unitsForEvidence(units: readonly SourceLearningUnit[], sourceId: string, evidence: string): string[] {
  if (!evidence.trim()) return [];
  return units.filter(unit => unit.sourceId === sourceId && (unit.quote.includes(evidence) || evidence.includes(unit.quote))).map(unit => unit.id);
}
