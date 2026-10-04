import type { CardProgress, LearnPackage, LearningCard, Notebook, NotebookArtwork, Progress, Source, SourceKind } from '../types';
import { validateActivity } from './structuredEngine';
import {validateLearningObjectives} from './evidence';
import {validateOriginalFile} from './originalFiles';
import {validateMediaAsset,sourceMediaIdentity} from './mediaAssets';
import {validateMediaTranscript} from './mediaTranscript';
import {validateVisualEvidenceSource,type VisualEvidence} from './visualEvidence';

const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const SOURCE_KINDS: SourceKind[] = ['text', 'document', 'website', 'youtube', 'notebooklm', 'audio', 'video', 'image', 'transcript'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', 'apiKey', 'apikey', 'api_key', 'accessToken', 'refreshToken', 'token', 'authorization', 'password', 'secret', 'providerKey']);

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, name: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) throw new Error(`${name} is missing or exceeds its size limit.`);
  return value;
}
function identifier(value: unknown, name: string): string {
  const result = string(value, name, 200);
  if (!/^[\w.:~-]+$/.test(result) || FORBIDDEN_KEYS.has(result)) throw new Error(`${name} contains unsupported characters.`);
  return result;
}
function array(value: unknown, name: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${name} must be a list with at most ${maximum} entries.`);
  return value;
}
function number(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} is out of range.`);
  return value;
}
function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const result = number(value, name, minimum, maximum);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number.`);
  return result;
}
function date(value: unknown, name: string): string {
  const result = string(value, name, 40);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${name} must be a valid date.`);
  return new Date(result).toISOString();
}
function boolean(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`); return value; }
function unique(items: string[], name: string): void { if (new Set(items).size !== items.length) throw new Error(`${name} contains duplicate identifiers.`); }

/** Portable web-import receipt. Unknown fields and provider credentials do not travel with it. */
export function validateWebImport(input: unknown): NonNullable<Source['webImport']> {
  const value = object(input, 'Web import provenance');
  const requestedUrl = string(value.requestedUrl, 'Requested source URL', 4000);
  let parsed: URL; try { parsed = new URL(requestedUrl); } catch { throw new Error('The requested source URL is invalid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Requested source links must be HTTP(S) URLs without embedded credentials.');
  if (!['extracted', 'partial', 'needs-assistance'].includes(String(value.contentStatus))) throw new Error('Web import content status is invalid.');
  return { requestedUrl, retrievedAt: date(value.retrievedAt, 'Web retrieval date'), extractor: string(value.extractor, 'Web extractor', 200), contentStatus: value.contentStatus as NonNullable<Source['webImport']>['contentStatus'], warnings: array(value.warnings, 'Web import warnings', 20).map(warning => string(warning, 'Web import warning', 2000)) };
}

function validateSource(input: unknown): Source {
  const value = object(input, 'Source');
  const kind = string(value.kind, 'Source type', 30) as SourceKind;
  if (!SOURCE_KINDS.includes(kind)) throw new Error(`Unsupported source type: ${kind}.`);
  const status = value.status;
  if (status !== 'ready' && status !== 'needs-transcript' && status !== 'error') throw new Error('Source status is invalid.');
  const source: Source = { id: identifier(value.id, 'Source ID'), title: string(value.title, 'Source title', 500), kind, text: string(value.text, 'Source text', 2_000_000, true), status, addedAt: date(value.addedAt, 'Source date') };
  if (value.url !== undefined) {
    const url = string(value.url, 'Source URL', 4000);
    let parsed: URL; try { parsed = new URL(url); } catch { throw new Error('A source URL is invalid.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Source links must be HTTP(S) URLs without embedded credentials.');
    source.url = url;
  }
  if (value.mime !== undefined) source.mime = string(value.mime, 'Media type', 100);
  if (value.dataUrl !== undefined) {
    const dataUrl = string(value.dataUrl, 'Embedded media', Math.ceil(20 * 1024 * 1024 * 4 / 3) + 200);
    if (!/^data:(?:image\/(?:png|jpeg|webp|gif)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|webm|mp4|x-m4a|m4a)|video\/(?:mp4|webm|ogg|quicktime));base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)) throw new Error('Embedded media must be a supported image, audio, or video file; executable formats are excluded.');
    source.dataUrl = dataUrl;
  }
  if (value.asset !== undefined) {
    if (source.dataUrl || !['audio','video'].includes(kind)) throw new Error('A recording must have one unambiguous media attachment.');
    source.asset = validateMediaAsset(value.asset);
    if (!source.asset.mime.startsWith(kind + '/')) throw new Error('The recording attachment and source type disagree.');
    source.mime = source.asset.mime;
  }
  if (value.transcript !== undefined) source.transcript = validateMediaTranscript(value.transcript, source.text);
  if (value.visualEvidence !== undefined) {
    source.visualEvidence = value.visualEvidence as VisualEvidence;
    const errors = validateVisualEvidenceSource(source);
    if (errors.length) throw new Error(errors.join(' '));
  }
  if (value.originalFile !== undefined) source.originalFile=validateOriginalFile(value.originalFile);
  if (value.webImport !== undefined) source.webImport=validateWebImport(value.webImport);
  if (value.error !== undefined) source.error = string(value.error, 'Source error', 2000, true);
  return source;
}

function mediaBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

/** Whitelists presentation-only assets with an exact reference to the author's source. */
export function validateArtwork(input: unknown, sources: Source[]): NotebookArtwork {
  const value = object(input, 'Artwork');
  const sourceId = identifier(value.sourceId, 'Artwork source');
  const source = sources.find(item => item.id === sourceId);
  if (!source) throw new Error('Artwork references a missing source.');
  const evidence = string(value.evidence, 'Artwork evidence', 6000);
  if (!source.text.includes(evidence)) throw new Error('Artwork evidence is absent from its source. Review changed sources before exporting.');
  const dataUrl = string(value.dataUrl, 'Artwork image', Math.ceil(20 * 1024 * 1024 * 4 / 3) + 100);
  if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('Artwork must be an embedded PNG, JPEG, WebP, or GIF image; executable formats are excluded.');
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (encoded.length % 4 !== 0 || mediaBytes(dataUrl) > 20 * 1024 * 1024) throw new Error('Artwork contains invalid base64 or exceeds the 20 MB image limit.');
  if (value.purpose !== 'decorative' && value.purpose !== 'instructional') throw new Error('Artwork purpose must be decorative or instructional.');
  if (value.reviewStatus !== 'draft' && value.reviewStatus !== 'reviewed') throw new Error('Artwork review status must be draft or reviewed.');
  return { id: identifier(value.id, 'Artwork ID'), title: string(value.title, 'Artwork title', 500), dataUrl, sourceId, evidence, purpose: value.purpose, reviewStatus: value.reviewStatus, createdAt: date(value.createdAt, 'Artwork date') };
}

export function validateLearningCard(input: unknown, sources: Source[]): LearningCard {
  const value = object(input, 'Challenge');
  const options = array(value.options, 'Answer options', 8).map(option => string(option, 'Answer option', 1000));
  if (options.length < 2 || new Set(options.map(option => option.trim().toLocaleLowerCase())).size !== options.length) throw new Error('Each challenge needs 2–8 distinct answer options.');
  const answer = string(value.answer, 'Correct answer', 1000);
  const correctIndex = integer(value.correctIndex, 'Correct answer index', 0, options.length - 1);
  if (options[correctIndex] !== answer) throw new Error('A challenge’s correct answer and answer index disagree.');
  const sourceId = value.sourceId === '' ? '' : identifier(value.sourceId, 'Challenge source');
  const source = sources.find(item => item.id === sourceId);
  if (!source && sourceId) throw new Error('A challenge references a missing source.');
  const evidence = string(value.evidence, 'Evidence', 6000, true);
  const questionType = value.questionType;
  if (questionType !== undefined && !['definition', 'cloze', 'sequence', 'manual'].includes(String(questionType))) throw new Error('Unknown challenge type.');
  if (!sourceId && questionType !== 'manual') throw new Error('Automatically created challenges must reference a source.');
  if (source && evidence && !source.text.includes(evidence)) throw new Error('A challenge’s evidence is absent from its source. Review changed sources before exporting.');
  if (source && questionType !== 'manual' && (!evidence || !evidence.toLocaleLowerCase().includes(answer.toLocaleLowerCase()))) throw new Error('A source-recall challenge needs a verbatim evidence span containing its answer.');
  const reviewStatus = value.reviewStatus;
  if (reviewStatus !== undefined && !['extractive', 'needs-review', 'reviewed'].includes(String(reviewStatus))) throw new Error('Unknown review status.');
  return { id: identifier(value.id, 'Challenge ID'), prompt: string(value.prompt, 'Question', 6000), answer, options, correctIndex, explanation: string(value.explanation, 'Explanation', 8000, true), sourceId, evidence, concept: string(value.concept, 'Concept', 500), tags: array(value.tags ?? [], 'Tags', 30).map(tag => string(tag, 'Tag', 100)), ...(questionType ? { questionType: questionType as LearningCard['questionType'] } : {}), ...(reviewStatus ? { reviewStatus: reviewStatus as LearningCard['reviewStatus'] } : {}) };
}

/** Explicit field allowlists prevent settings, credentials and arbitrary scripts traveling in notebooks. */
export function validateNotebook(input: unknown): Notebook {
  const value = object(input, 'Notebook');
  const sources = array(value.sources, 'Sources', 300).map(validateSource);
  unique(sources.map(source => source.id), 'Sources');
  for (const source of sources) if (source.transcript) {
    source.transcript = validateMediaTranscript(source.transcript, source.text, sources);
    const recording = sources.find(item=>item.id===source.transcript!.mediaSourceId);
    if (sourceMediaIdentity(recording) !== `bytes:${source.transcript.mediaRevision}`) throw new Error('The transcript does not match its bundled recording. Restore matching original media and captions.');
  }
  for (const source of sources) if (source.visualEvidence) {
    const errors = validateVisualEvidenceSource(source, sources);
    if (errors.length) throw new Error(errors.join(' '));
  }
  const artwork = value.artwork === undefined ? undefined : array(value.artwork, 'Artwork', 20).map(item => validateArtwork(item, sources));
  if (artwork) unique(artwork.map(item => item.id), 'Artwork');
  const mediaLength = sources.reduce((sum, source) => sum + (source.dataUrl ? mediaBytes(source.dataUrl) : 0), 0) + (artwork ?? []).reduce((sum, item) => sum + mediaBytes(item.dataUrl), 0);
  if (mediaLength > 48 * 1024 * 1024) throw new Error('Embedded media exceeds the 48 MB portable notebook limit. Split this notebook into smaller parts.');
  const cards = array(value.cards, 'Challenges', 2000).map(card => validateLearningCard(card, sources));
  unique(cards.map(card => card.id), 'Challenges');
  const activities = value.activities === undefined ? undefined : array(value.activities, 'Structured activities', 300).map((activity, index) => {
    const checked = validateActivity(activity, sources);
    if (!checked.success) throw new Error(`Structured activity ${index + 1} is invalid: ${checked.errors.slice(0, 5).join('; ')}`);
    return checked.value;
  });
  if (activities) unique(activities.map(activity => activity.id), 'Structured activities');
  return { id: identifier(value.id, 'Notebook ID'), title: string(value.title, 'Notebook title', 300), description: string(value.description ?? '', 'Description', 10_000, true), createdAt: date(value.createdAt, 'Creation date'), updatedAt: date(value.updatedAt, 'Updated date'), ageGroup: string(value.ageGroup, 'Age group', 100), goal: string(value.goal, 'Learning goal', 2000, true), theme: string(value.theme, 'Theme', 100), scaffoldIds: array(value.scaffoldIds, 'Game scaffolds', 100).map(id => identifier(id, 'Scaffold ID')), sources, cards, ...(activities ? { activities } : {}), ...(artwork ? { artwork } : {}), ...(value.learningObjectives!==undefined?{learningObjectives:validateLearningObjectives(value.learningObjectives,sources)}:{}), revision: integer(value.revision, 'Revision', 1, 1_000_000) };
}

function parseJson(text: string, maximum = MAX_PACKAGE_BYTES): unknown {
  if (text.length > maximum || new TextEncoder().encode(text).byteLength > maximum) throw new Error('This file exceeds the supported import size.');
  try { return JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose an Asterloom .learnpack or progress backup.'); }
}

export function serializePackage(notebook: Notebook): string {
  const pack: LearnPackage = { format: 'learnpack', version: 1, exportedAt: new Date().toISOString(), notebook: validateNotebook(notebook) };
  const output = JSON.stringify(pack, null, 2);
  if (new TextEncoder().encode(output).byteLength > MAX_PACKAGE_BYTES) throw new Error('This notebook exceeds the 64 MB package limit. Remove embedded media or split it into smaller notebooks.');
  return output;
}

export function parsePackage(text: string): Notebook {
  const value = object(parseJson(text), 'Learning package');
  if (value.format !== 'learnpack' || value.version !== 1) throw new Error('This is not a supported Asterloom learning package (version 1).');
  return validateNotebook(value.notebook);
}

function cleanSessionState(input: unknown, depth = 0): unknown {
  if (depth > 10) throw new Error('Saved session state is nested too deeply.');
  if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
  if (typeof input === 'string') return string(input, 'Session value', 10_000, true);
  if (Array.isArray(input)) return array(input, 'Session state', 2000).map(value => cleanSessionState(value, depth + 1));
  const value = object(input, 'Session state');
  return Object.fromEntries(Object.entries(value).filter(([key]) => !FORBIDDEN_KEYS.has(key)).slice(0, 2000).map(([key, child]) => [key, cleanSessionState(child, depth + 1)]));
}

function validateStructuredResponse(input: unknown): unknown {
  let count = 0;
  function visit(value: unknown, depth: number): unknown {
    if (++count > 4096 || depth > 12) throw new Error('A structured activity response exceeds its complexity limit.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return string(value, 'Activity response value', 10_240, true);
    if (Array.isArray(value)) return value.map(child => visit(child, depth + 1));
    if (!value || typeof value !== 'object') throw new Error('Activity responses must contain only JSON data.');
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Activity responses must contain plain objects.');
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('An activity response contains an unsafe object key.');
      string(key, 'Activity response key', 200);
      return [key, visit(child, depth + 1)];
    }));
  }
  const response = visit(input, 0);
  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 131_072) throw new Error('An activity response exceeds the 128 KB save limit.');
  return response;
}

export function validateProgress(input: unknown): Progress {
  const value = object(input, 'Progress');
  const cards: Record<string, CardProgress> = {};
  const rawCards = object(value.cards, 'Challenge progress');
  if (Object.keys(rawCards).length > 2000) throw new Error('Too many challenge progress records.');
  for (const [id, raw] of Object.entries(rawCards)) {
    identifier(id, 'Progress challenge ID'); const item = object(raw, 'Challenge progress');
    if (item.cardId !== id) throw new Error('A progress record has an inconsistent challenge ID.');
    cards[id] = { cardId: id, attempts: integer(item.attempts, 'Attempt count', 0, 1_000_000), correct: integer(item.correct, 'Correct count', 0, 1_000_000), successfulReviews: integer(item.successfulReviews, 'Review count', 0, 1_000_000), intervalDays: number(item.intervalDays, 'Review interval', 0, 10_000), dueAt: date(item.dueAt, 'Review date'), lastAttemptAt: date(item.lastAttemptAt, 'Attempt date'), lastCorrect: boolean(item.lastCorrect, 'Last answer result') };
    if (cards[id].correct > cards[id].attempts) throw new Error('Correct attempts cannot exceed all attempts.');
  }
  const progress: Progress = { cards, notebookId: identifier(value.notebookId, 'Progress notebook ID'), completedCardIds: array(value.completedCardIds, 'Completed challenges', 2000).map(id => identifier(id, 'Completed challenge ID')), attempts: array(value.attempts, 'Attempts', 10_000).map(raw => { const item = object(raw, 'Attempt'); const confidence = item.confidence; if (!['guessing', 'unsure', 'confident'].includes(String(confidence))) throw new Error('Invalid confidence level.'); return { id: identifier(item.id, 'Attempt ID'), cardId: identifier(item.cardId, 'Attempt challenge'), correct: boolean(item.correct, 'Attempt result'), at: date(item.at, 'Attempt time'), confidence: confidence as 'guessing' | 'unsure' | 'confident', xp: integer(item.xp, 'Attempt XP', 0, 1000) }; }), xp: integer(value.xp, 'XP', 0, 1_000_000_000), mastery: number(value.mastery, 'Recall progress', 0, 100), streak: integer(value.streak, 'Streak', 0, 1_000_000), bestStreak: integer(value.bestStreak, 'Best streak', 0, 1_000_000), sessions: integer(value.sessions, 'Session count', 0, 1_000_000), journal: array(value.journal, 'Journal entries', 2000).map(raw => { const item = object(raw, 'Journal entry'); return { id: identifier(item.id, 'Journal entry ID'), text: string(item.text, 'Journal entry', 10_000, true), at: date(item.at, 'Journal date'), ...(item.cardId ? { cardId: identifier(item.cardId, 'Journal challenge') } : {}) }; }), updatedAt: date(value.updatedAt, 'Progress date'), revision: integer(value.revision, 'Progress revision', 1, 1_000_000) };
  if (value.activeSession) {
    const session = object(value.activeSession, 'Current session');
    const cardIds = array(session.cardIds, 'Session challenges', 2000).map(id => identifier(id, 'Session challenge ID'));
    progress.activeSession = { scaffoldId: identifier(session.scaffoldId, 'Session scaffold'), cardIds, index: integer(session.index, 'Session position', 0, cardIds.length), seed: integer(session.seed, 'Session seed', 0, 4_294_967_295), startedAt: date(session.startedAt, 'Session start'), ...(session.state ? { state: cleanSessionState(session.state) as Record<string, unknown> } : {}) };
  }
  if (value.structured !== undefined) {
    const raw = object(value.structured, 'Structured activity progress');
    if (Object.keys(raw).length > 300) throw new Error('Too many structured activity progress records.');
    progress.structured = Object.fromEntries(Object.entries(raw).map(([id, entry]) => {
      identifier(id, 'Structured activity ID');
      const item = object(entry, 'Structured activity progress');
      const score = number(item.score, 'Activity score', 0, 1_000_000);
      const maxScore = number(item.maxScore, 'Activity maximum score', 0, 1_000_000);
      if (score > maxScore) throw new Error('An activity score exceeds its maximum.');
      let review;
      if (item.review !== undefined) {
        const r = object(item.review, 'Activity review schedule');
        if (r.objectiveId !== id) throw new Error('A review schedule must identify its activity.');
        review = { objectiveId: id, intervalDays: number(r.intervalDays, 'Activity review interval', 0, 60), level: integer(r.level, 'Activity review level', 0, 5), independentSuccesses: integer(r.independentSuccesses, 'Independent reviews', 0, 1_000_000), lapses: integer(r.lapses, 'Review lapses', 0, 1_000_000), dueAt: date(r.dueAt, 'Activity review date'), ...(r.lastReviewedAt ? { lastReviewedAt: date(r.lastReviewedAt, 'Activity last review date') } : {}) };
      }
      return [id, { response: validateStructuredResponse(item.response), completed: boolean(item.completed, 'Activity completion'), score, maxScore, attempts: integer(item.attempts, 'Activity attempts', 0, 1_000_000), updatedAt: date(item.updatedAt, 'Activity progress date'), ...(review ? { review } : {}), ...(item.reviewStartedAt ? { reviewStartedAt: date(item.reviewStartedAt, 'Activity fresh attempt date') } : {}) }];
    }));
  }
  return progress;
}

const MAX_PROGRESS_BYTES = 64 * 1024 * 1024;
export function serializeProgress(progress: Progress): string {
  const text = JSON.stringify({ format: 'asterloom-progress', version: 1, progress: validateProgress(progress) }, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_PROGRESS_BYTES) throw new Error('This progress backup exceeds the 64 MB portable limit.');
  return text;
}
export function parseProgress(text: string): Progress {
  const value = object(parseJson(text, MAX_PROGRESS_BYTES), 'Progress backup');
  if (value.format !== 'asterloom-progress' || value.version !== 1) throw new Error('This is not an Asterloom progress backup.');
  return validateProgress(value.progress);
}

/**
 * Scan HTML markup while treating script/style contents as raw text. A regular
 * expression over the whole document also matches tag strings inside the app
 * bundle, which can remove most of the runtime during a Node-side export.
 */
function embedNotebookInRuntime(html: string, injection: string): string {
  const edits: { start: number; end: number; replacement: string }[] = [];
  let position = 0, headEnd = -1;
  const rawText = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
  function tagEnd(start: number): number {
    let quote = '';
    for (let index = start; index < html.length; index++) {
      const character = html[index];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') return index + 1;
    }
    return html.length;
  }
  function isNotebookScript(attributes: string): boolean {
    // Read attributes individually so an id-looking string inside another
    // attribute's value cannot identify the script as our data envelope.
    const attribute = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const match of attributes.matchAll(attribute)) {
      if (match[1].toLowerCase() === 'id' && (match[2] ?? match[3] ?? match[4]) === 'asterloom-notebook') return true;
    }
    return false;
  }
  while (position < html.length) {
    const start = html.indexOf('<', position);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4); position = end < 0 ? html.length : end + 3; continue;
    }
    const opening = /^<([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/>])/.exec(html.slice(start, start + 100));
    if (!opening) { position = tagEnd(start + 1); continue; }
    const name = opening[1].toLowerCase(), end = tagEnd(start + opening[0].length);
    if (name === 'head' && headEnd < 0) headEnd = end;
    position = end;
    if (!rawText.has(name)) continue;
    const closing = new RegExp(`</${name}(?=[\\s/>])`, 'gi'); closing.lastIndex = end;
    const close = closing.exec(html);
    if (!close) throw new Error('The offline runtime contains an unfinished HTML element. Rebuild the application before exporting.');
    const closeEnd = tagEnd(close.index + close[0].length);
    if (name === 'script' && isNotebookScript(html.slice(start + opening[0].length, end - 1))) edits.push({ start, end: closeEnd, replacement: '' });
    position = closeEnd;
  }
  if (headEnd < 0) throw new Error('The complete offline runtime needs a document head before it can be exported.');
  edits.push({ start: headEnd, end: headEnd, replacement: injection });
  let result = html;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  return result;
}

export function exportOfflineHtml(notebook: Notebook, runtimeHtml: string): string {
  const validated = validateNotebook(notebook);
  if (validated.sources.some(source => source.asset)) throw new Error('Include the recording files before preparing a browser game. Use a native app or recording archive for large media.');
  if (!runtimeHtml.includes('<html') || !runtimeHtml.includes('<script')) throw new Error('The complete offline app runtime is unavailable. Export a .learnpack backup or start the local Asterloom server to create a playable HTML export.');
  let html = runtimeHtml;
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(runtimeHtml, 'text/html');
    document.getElementById('asterloom-notebook')?.remove();
    const root = document.getElementById('root'); if (root) root.replaceChildren();
    document.title = `${validated.title} · Asterloom`;
    html = '<!doctype html>\n' + document.documentElement.outerHTML;
  }
  const payload = JSON.stringify(validated).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const injection = `<script id="asterloom-notebook">window.__ASTERLOOM_NOTEBOOK__=${payload};window.__ASTERLOOM_EXPORT__=true;</script>`;
  return embedNotebookInRuntime(html, injection);
}
