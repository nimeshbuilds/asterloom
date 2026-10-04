import type { CompileOptions, CompileResult, LearningCard, Source } from '../types';
import { createId, normalizeText, seededShuffle, stableHash } from './utils';

const STOP = new Set('a an the of in to for on and or but is are was were be being been it its they them their these those this that with from as by at if then than when where which who how what we you your our can could should would will may might must does do not also into through each all such using used use before after between has have had means called'.split(' '));
const words = (value: string) => normalizeText(value).split(' ').filter(word => word.length > 1 && !STOP.has(word));
interface Candidate { source: Source; answer: string; prompt: string; evidence: string; concept: string; questionType: 'definition' | 'cloze' | 'sequence'; distractors?: string[] }

/** Ignore subtitle control records without changing offsets or inventing a normalized quotation. */
function maskSubtitleMetadata(text: string): string {
  const timestamp = /^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/;
  if (!/^\uFEFF?WEBVTT\b/.test(text) && !text.split(/\r?\n/).some(line => timestamp.test(line.trim()))) return text;
  const lines = [...text.matchAll(/[^\r\n]+|\r?\n/g)];
  let inMetadata = false;
  return lines.map((match, index) => {
    const line = match[0]; if (/^\r?\n$/.test(line)) { if (index > 0 && /^\r?\n$/.test(lines[index - 1][0])) inMetadata = false; return line; }
    const clean = line.trim(); if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(clean)) inMetadata = true;
    const nextContent = lines[index + 1]?.[0] === '\n' || lines[index + 1]?.[0] === '\r\n' ? lines[index + 2]?.[0] : undefined;
    const metadata = inMetadata || /^\uFEFF?WEBVTT(?:\s|$)/.test(clean) || timestamp.test(clean) || !!nextContent && timestamp.test(nextContent.trim());
    // A nonempty marker also breaks numbered-step runs across distinct subtitle cues.
    return metadata ? '#'.repeat(line.length) : line;
  }).join('');
}

function definitions(source: Source): Candidate[] {
  const result: Candidate[] = [];
  for (const line of source.text.split(/\r?\n/)) {
    const clean = line.replace(/^\s*[-*•]\s+/, '').trim();
    // A delimiter explicitly supplied by the author is a stronger signal than guessing a definition.
    const match = clean.match(/^(?:\*\*)?([^:：\n]{2,85}?)(?:\*\*)?\s*[:：]\s*(.{12,650})$/u);
    if (!match || /https?$/i.test(match[1]) || /^(?:note|example|warning|chapter|section|step\s*\d+)$/i.test(match[1].trim())) continue;
    const answer = match[1].trim().replace(/^\*\*|\*\*$/g, '');
    if (answer.split(/\s+/).length > 12 || /[.!?]$/.test(answer)) continue;
    result.push({ source, answer, prompt: `Which term is paired with this description in “${source.title}”?\n\n${match[2].trim()}`, evidence: line.trim(), concept: answer, questionType: 'definition' });
  }
  return result;
}

function sequences(source: Source): Candidate[] {
  const result: Candidate[] = [];
  let run: { ordinal: number; text: string; start: number; end: number }[] = [];
  function flush() {
    if (run.length >= 3 && run.length <= 12 && new Set(run.map(item => item.text)).size === run.length) {
      const steps = run.map(item => item.text);
      for (let i = 1; i < run.length; i++) {
        result.push({ source, answer: run[i].text, prompt: `In the numbered sequence in “${source.title}”, which step comes immediately after this one?\n\n${run[i - 1].text}`, evidence: source.text.slice(run[i - 1].start, run[i].end).trim(), concept: 'Sequence and procedure', questionType: 'sequence', distractors: steps.filter((_, j) => j !== i) });
      }
    }
    run = [];
  }
  for (const lineMatch of source.text.matchAll(/[^\r\n]+/g)) {
    const line = lineMatch[0]; const start = lineMatch.index ?? 0;
    const match = line.match(/^\s*(\d{1,2})[.)]\s+(.{5,240})\s*$/);
    if (!match) { if (line.trim()) flush(); continue; }
    const ordinal = Number(match[1]);
    if (run.length && ordinal !== run[run.length - 1].ordinal + 1) flush();
    run.push({ ordinal, text: match[2].trim(), start, end: start + line.length });
  }
  flush(); return result;
}

function sentences(source: Source): Candidate[] {
  const result: Candidate[] = [];
  // Keep verbatim spans so every generated answer can be checked against the supplied source.
  const spans = source.text.match(/[^\n.!?]+(?:[.!?]+|(?=\n|$))/gu) ?? [];
  const seen = new Set<string>();
  for (const raw of spans) {
    const sentence = raw.trim();
    if (sentence.length < 45 || sentence.length > 450 || /^(?:https?:|\d+[.)])/.test(sentence) || sentence.includes(':') || sentence.includes('：')) continue;
    if (sentence.split(/\s+/).length < 8) continue;
    const matches = [...sentence.matchAll(/[\p{L}][\p{L}\p{N}'’-]{3,}/gu)].filter(match => !STOP.has(match[0].toLocaleLowerCase()));
    if (matches.length < 3) continue;
    matches.sort((a, b) => b[0].length - a[0].length || (a.index ?? 0) - (b.index ?? 0));
    const match = matches[0];
    const answer = match[0];
    const key = normalizeText(answer);
    if (seen.has(key)) continue;
    seen.add(key);
    const start = match.index ?? 0;
    const cloze = sentence.slice(0, start) + '________' + sentence.slice(start + answer.length);
    result.push({ source, answer, prompt: `Recall the exact missing word from “${source.title}”.\n\n${cloze}`, evidence: sentence, concept: answer, questionType: 'cloze' });
  }
  return result;
}

/** Extractive baseline: never claims to understand or establish the truth of supplied text. */
export function compileNotebook(sources: Source[], options: CompileOptions = {}): CompileResult {
  const warnings: string[] = [];
  const candidates: Candidate[] = [];
  const usedSourceIds: string[] = [];
  const sourceVocabulary = new Map<string, string[]>();
  for (const source of sources) {
    if (source.status !== 'ready' || !source.text.trim()) { warnings.push(`“${source.title}” needs readable text or a transcript before it can produce learning activities.`); continue; }
    if (source.text.length > 500_000) warnings.push(`“${source.title}” is large. This local pass uses the first 500,000 characters; split it into sections to include the remainder.`);
    const bounded = { ...source, text: maskSubtitleMetadata(source.text.slice(0, 500_000)) };
    const definitionsFound = definitions(bounded);
    if (definitionsFound.length > 1) {
      const terms = definitionsFound.map(candidate => candidate.answer);
      definitionsFound.forEach(candidate => { candidate.distractors = terms.filter(term => normalizeText(term) !== normalizeText(candidate.answer)); });
    }
    const sequencesFound = sequences(bounded);
    const clozesFound = sentences(bounded);
    const found = [...definitionsFound, ...sequencesFound, ...clozesFound];
    candidates.push(...found);
    if (found.length) usedSourceIds.push(source.id);
    else warnings.push(`No clear fact statements were extracted from “${source.title}”. Add term: definition notes, numbered steps, or manually author a challenge.`);
    sourceVocabulary.set(source.id, [...new Set([...definitionsFound.map(item => item.answer), ...clozesFound.map(item => item.answer), ...(bounded.text.match(/[\p{L}][\p{L}\p{N}'’-]{4,}/gu) ?? []).filter(word => !STOP.has(word.toLocaleLowerCase()))])]);
  }
  const maxCards = Math.max(1, Math.min(300, Math.floor(options.maxCards ?? 60)));
  const seen = new Set<string>();
  const cards: LearningCard[] = [];
  // Round-robin preserves representation across sources when a large document dominates.
  const queues = sources.map(source => candidates.filter(candidate => candidate.source.id === source.id));
  let hasMore = true;
  while (hasMore && cards.length < maxCards) {
    hasMore = false;
    for (const queue of queues) {
      const candidate = queue.shift();
      if (!candidate) continue;
      hasMore = true;
      const key = `${candidate.source.id}:${normalizeText(candidate.prompt)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const seed = stableHash(key);
      const vocabulary = candidate.distractors ?? sourceVocabulary.get(candidate.source.id) ?? [];
      const distractors = seededShuffle([...new Map(vocabulary.filter(value => normalizeText(value) !== normalizeText(candidate.answer) && value.length <= 240).map(value => [normalizeText(value), value])).values()], seed).slice(0, 3);
      if (!distractors.length) continue;
      const optionsList = seededShuffle([candidate.answer, ...distractors], seed + 1);
      const id = `card-${stableHash(key + candidate.evidence).toString(36)}`;
      cards.push({ id, prompt: candidate.prompt, answer: candidate.answer, options: optionsList, correctIndex: optionsList.indexOf(candidate.answer), explanation: `The source states: “${candidate.evidence}”`, sourceId: candidate.source.id, evidence: candidate.evidence, concept: candidate.concept, tags: ['source-recall', candidate.questionType], questionType: candidate.questionType, reviewStatus: candidate.source.transcript||candidate.source.visualEvidence||['transcript','audio','video','image'].includes(candidate.source.kind)?'needs-review':'extractive' });
      if (cards.length >= maxCards) break;
    }
  }
  if (cards.length) warnings.push('Local generation creates source-recall practice. Review factual accuracy and add application challenges before treating it as a complete assessment.');
  if (candidates.length > maxCards) warnings.push(`This pass is limited to ${maxCards} challenges. Smaller source sections give finer control over coverage.`);
  return { cards, warnings, usedSourceIds };
}

export interface SearchHit { sourceId: string; title: string; snippet: string; score: number; index: number }
/** BM25-style local retrieval; no embedding API or source upload is necessary. */
export function searchSources(sources: Source[], query: string, limit = 6): SearchHit[] {
  const queryTerms = [...new Set(words(query))];
  if (!queryTerms.length) return [];
  const chunks = sources.flatMap(source => source.text.split(/\n\s*\n|(?<=[.!?])\s+(?=[\p{Lu}])/u).filter(chunk => chunk.trim()).flatMap((chunk, index) => {
    const segments = chunk.match(/[\s\S]{1,1000}/g) ?? [];
    return segments.map(segment => ({ sourceId: source.id, title: source.title, snippet: segment.trim(), index, terms: words(segment) }));
  }));
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
