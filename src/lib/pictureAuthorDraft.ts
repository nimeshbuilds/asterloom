import type { PictureActivity, PictureToken } from './pictureEngine';
export type PictureRegionDraft = Omit<PictureToken, 'evidenceRefs'> & { evidence: string };
export interface PictureRoundDraft { id: string; prompt: string; correctId: string; reason: string; evidence: string; narrationSourceId: string }
export interface PictureAuthorDraft {
  version: 1; sourceId: string; title: string; mode: PictureActivity['mode']; sceneAlt: string; caregiverNote: string;
  regions: PictureRegionDraft[]; rounds: PictureRoundDraft[];
  point: { x: number; y: number } | null;
  selection: { x: number; y: number; width: number; height: number };
  label: string; excerpt: string;
}
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, fallback = '', max = 2000) => typeof v === 'string' && v.length <= max ? v : fallback;
const percent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
function region(v: unknown): v is PictureAuthorDraft['selection'] & Record<string, unknown> { return plain(v) && percent(v.x) && percent(v.y) && percent(v.width) && percent(v.height) && v.x + v.width <= 100 && v.y + v.height <= 100; }
export function initialPictureAuthorDraft(sourceId = ''): PictureAuthorDraft {
  return { version: 1, sourceId, title: 'My picture discovery', mode: 'discovery', sceneAlt: '', caregiverNote: 'Invite the child to explore first. Read a clue aloud if helpful. Let the child choose and explain their answer.', regions: [], rounds: [], point: null, selection: { x: 10, y: 10, width: 20, height: 20 }, label: '', excerpt: '' };
}
/** Browser storage is untrusted. Bound its shape before it enters a form or an activity. */
export function restorePictureAuthorDraft(input: unknown, fallbackSourceId = ''): PictureAuthorDraft {
  const initial = initialPictureAuthorDraft(fallbackSourceId);
  if (!plain(input) || input.version !== 1) return initial;
  const ids = new Set<string>(), regions: PictureRegionDraft[] = [];
  for (const value of Array.isArray(input.regions) ? input.regions.slice(0, 6) : []) if (region(value) && id(value.id) && !ids.has(value.id)) {
    ids.add(value.id); regions.push({ id: value.id, label: text(value.label, '', 120), evidence: text(value.evidence, '', 20000), x: value.x, y: value.y, width: value.width, height: value.height });
  }
  const roundIds = new Set<string>(), rounds: PictureRoundDraft[] = [];
  for (const value of Array.isArray(input.rounds) ? input.rounds.slice(0, 12) : []) if (plain(value) && id(value.id) && !roundIds.has(value.id)) {
    roundIds.add(value.id); rounds.push({ id: value.id, prompt: text(value.prompt, '', 500), correctId: typeof value.correctId === 'string' && ids.has(value.correctId) ? value.correctId : regions[0]?.id ?? '', reason: text(value.reason), evidence: text(value.evidence, '', 20000), narrationSourceId: id(value.narrationSourceId) ? value.narrationSourceId : '' });
  }
  return { version: 1, sourceId: id(input.sourceId) ? input.sourceId : fallbackSourceId, title: text(input.title, initial.title, 200), mode: input.mode === 'word-picture' ? 'word-picture' : 'discovery', sceneAlt: text(input.sceneAlt), caregiverNote: text(input.caregiverNote, initial.caregiverNote), regions, rounds, point: plain(input.point) && percent(input.point.x) && percent(input.point.y) ? { x: input.point.x, y: input.point.y } : null, selection: region(input.selection) ? { x: input.selection.x, y: input.selection.y, width: input.selection.width, height: input.selection.height } : initial.selection, label: text(input.label, '', 120), excerpt: text(input.excerpt, '', 20000) };
}
