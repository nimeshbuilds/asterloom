import type { LearningCard, Notebook, Progress, Source } from '../types';
import type { StructuredActivity } from './structuredEngine';
import { parseProgress, validateProgress } from './package';
import { canScoreRecallCard } from './utils';
import { reconcileReviewEligibility } from './progressRevision';
import {sourceMediaIdentity} from './mediaAssets';

const MAX_BYTES = 64 * 1024 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
type ModelIndex = { algorithm: 'sha256-v1'; cards: Record<string, string>; activities: Record<string, string> };
export interface ProgressRestoreResult { progress: Progress; notice: string; resetObjectiveCount: number; legacy: boolean }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
async function digest(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Content-bound progress backups need the desktop application’s secure storage environment. Reopen the notebook in Asterloom.');
  const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
function cardModel(card: LearningCard) {
  const { prompt, answer, options, correctIndex, sourceId, evidence, questionType } = card;
  return { prompt, answer, options, correctIndex, sourceId, evidence, questionType };
}
function activityModel(activity: StructuredActivity) {
  const { title: _title, reviewStatus: _review, explanation: _explanation, hint: _hint, scaffoldIds: _recipes, extractedFrom: _origin, ...model } = activity;
  if (model.kind === 'diagram') return { ...model, targets: model.targets.map(({ id, label }) => ({ id, label })) };
  return model;
}
function referencedSourceIds(activity: StructuredActivity): string[] {
  const ids = new Set(activity.sourceRefs.map(ref => ref.sourceId));
  const visit = (value: unknown, key = '', depth = 0) => {
    if (depth > 20) throw new Error('This activity exceeds the portable model nesting limit.');
    if (/sourceId$/i.test(key) && typeof value === 'string') ids.add(value);
    if (/sourceIds$/i.test(key) && Array.isArray(value)) for (const id of value) if (typeof id === 'string') ids.add(id);
    if (Array.isArray(value)) value.forEach(child => visit(child, '', depth + 1));
    else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) visit(child, childKey, depth + 1);
  };
  visit(activity);
  return [...ids].sort();
}
async function modelIndex(notebook: Notebook): Promise<ModelIndex> {
  if (notebook.cards.length > 2000 || (notebook.activities?.length ?? 0) > 300) throw new Error('This notebook exceeds the portable progress objective limit.');
  const sources = new Map(notebook.sources.map(source => [source.id, source]));
  const mediaHashes = new Map<string, Promise<string>>();
  const media = (source: Source | undefined) => {
    if (!source) return Promise.resolve(null);
    const identity=sourceMediaIdentity(source),linked=source.transcript?sourceMediaIdentity(sources.get(source.transcript.mediaSourceId)):source.visualEvidence?sourceMediaIdentity(sources.get(source.visualEvidence.parentSourceId)):null;
    if(!identity&&!linked)return Promise.resolve(null);
    if (!mediaHashes.has(source.id)) mediaHashes.set(source.id, digest({identity,linked}));
    return mediaHashes.get(source.id)!;
  };
  const cards: [string, string][] = [];
  for (const card of notebook.cards) {
    if (!canScoreRecallCard(card, notebook.sources)) continue;
    cards.push([card.id, await digest({ model: cardModel(card), media: await media(sources.get(card.sourceId)) })]);
  }
  const activities: [string, string][] = [];
  for (const activity of notebook.activities ?? []) {
    if (!activity.sourceRefs.every(ref => ref.evidence.trim() && sources.get(ref.sourceId)?.status === 'ready' && sources.get(ref.sourceId)?.text.includes(ref.evidence))) continue;
    const citedMedia = await Promise.all(referencedSourceIds(activity).map(async id => [id, await media(sources.get(id))]));
    activities.push([activity.id, await digest({ model: activityModel(activity), media: citedMedia })]);
  }
  return { algorithm: 'sha256-v1', cards: Object.fromEntries(cards), activities: Object.fromEntries(activities) };
}
function readEnvelope(text: string): Record<string, unknown> {
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('This progress backup exceeds the 64 MB portable limit.');
  const value: unknown = JSON.parse(text, (key, child) => { if (UNSAFE_KEYS.has(key)) throw new Error('This progress backup contains an unsafe property.'); return child; });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This is not an Asterloom progress backup.');
  const envelope = value as Record<string, unknown>;
  if (envelope.format !== 'asterloom-progress' || ![1, 2].includes(Number(envelope.version)) || typeof envelope.version !== 'number') throw new Error('This is not a supported Asterloom progress backup.');
  return envelope;
}
function readModels(value: unknown): ModelIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This progress backup is missing its content fingerprints.');
  const input = value as Record<string, unknown>;
  if (input.algorithm !== 'sha256-v1' || Object.keys(input).some(key => !['algorithm', 'cards', 'activities'].includes(key))) throw new Error('This progress backup uses unsupported content fingerprints.');
  const records = (raw: unknown, limit: number): Record<string, string> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > limit) throw new Error('This progress backup has too many or invalid content fingerprints.');
    const entries = Object.entries(raw);
    for (const [id, fingerprint] of entries) if (id.length > 200 || !/^[\w.:~-]+$/.test(id) || UNSAFE_KEYS.has(id) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('This progress backup has an invalid objective fingerprint.');
    return Object.fromEntries(entries) as Record<string, string>;
  };
  return { algorithm: 'sha256-v1', cards: records(input.cards, 2000), activities: records(input.activities, 300) };
}
function reconcile(progress: Progress, saved: ModelIndex | undefined, current: ModelIndex): { progress: Progress; resetObjectiveCount: number } {
  const cardMatches = (id: string) => !!saved && Object.hasOwn(saved.cards, id) && Object.hasOwn(current.cards, id) && saved.cards[id] === current.cards[id];
  const activityMatches = (id: string) => !!saved && Object.hasOwn(saved.activities, id) && Object.hasOwn(current.activities, id) && saved.activities[id] === current.activities[id];
  const reset = new Set<string>();
  const keepCard = (id: string) => { const keep = cardMatches(id); if (!keep) reset.add(`card:${id}`); return keep; };
  const cards = Object.fromEntries(Object.entries(progress.cards).filter(([id]) => keepCard(id)));
  const completedCardIds = progress.completedCardIds.filter(keepCard);
  const structured = progress.structured === undefined ? undefined : Object.fromEntries(Object.entries(progress.structured).filter(([id]) => { const keep = activityMatches(id); if (!keep) reset.add(`activity:${id}`); return keep; }));
  const sessionMatches = progress.activeSession?.cardIds.map(keepCard).every(Boolean) ?? true;
  const clearSession = !!progress.activeSession && (!saved || !sessionMatches);
  const next = { ...progress, cards, completedCardIds, ...(structured === undefined ? {} : { structured }) };
  if (clearSession) delete next.activeSession;
  if (!saved || reset.size || clearSession) {
    next.mastery = Object.keys(cards).length ? Math.round(Object.values(cards).filter(card => card.lastCorrect).length / Object.keys(cards).length * 100) : 0;
    next.updatedAt = new Date().toISOString();
    next.revision = Math.min(1_000_000, next.revision + 1);
  }
  return { progress: next, resetObjectiveCount: reset.size };
}

/** Read the validated identity before selecting the matching local notebook. */
export function progressBackupNotebookId(text: string): string { return validateProgress(readEnvelope(text).progress).notebookId; }

/** Model digests bind current answers to their authored rules without copying sources or credentials. */
export async function serializeNotebookProgress(notebook: Notebook, input: Progress): Promise<string> {
  const progress = validateProgress(input);
  if (progress.notebookId !== notebook.id) throw new Error('The progress belongs to a different notebook.');
  const models = await modelIndex(notebook);
  const cleaned = reconcileReviewEligibility(notebook, reconcile(progress, models, models).progress);
  const text = JSON.stringify({ format: 'asterloom-progress', version: 2, progress: cleaned, models }, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('This progress backup exceeds the 64 MB portable limit.');
  return text;
}

/** Legacy history remains usable, but its unbound answers cannot prove completion of current rules. */
export async function restoreNotebookProgress(notebook: Notebook, text: string): Promise<ProgressRestoreResult> {
  const envelope = readEnvelope(text);
  const legacy = envelope.version === 1;
  const progress = legacy ? parseProgress(text) : validateProgress(envelope.progress);
  if (progress.notebookId !== notebook.id) throw new Error('Import the matching notebook before restoring its progress.');
  const saved = legacy ? undefined : readModels(envelope.models);
  const result = reconcile(progress, saved, await modelIndex(notebook));
  const eligible = reconcileReviewEligibility(notebook, result.progress);
  result.resetObjectiveCount += Object.entries(result.progress.structured ?? {}).filter(([id, entry]) => eligible.structured?.[id] !== entry).length;
  result.progress = eligible;
  const notice = legacy
    ? 'Learning history restored. This older backup cannot verify current challenge rules, so answers, completion and review schedules need fresh attempts. Your discovery points, attempts and journal are preserved.'
    : result.resetObjectiveCount
      ? `Learning history restored. ${result.resetObjectiveCount} changed, unreviewed or removed challenge${result.resetObjectiveCount === 1 ? '' : 's'} need fresh attempts; matching challenges keep their progress.`
      : 'Your learning progress is restored.';
  return { ...result, notice, legacy };
}
