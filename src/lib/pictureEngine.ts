import type { Source } from '../types';
import type { ActivityBase, Evaluation } from './structuredEngine';

export interface PictureToken {
  id: string; label: string;
  /** Percentages of the original raster, not arbitrary screen coordinates. */
  x: number; y: number; width: number; height: number;
  evidenceRefs: number[];
}
export interface PictureRound {
  id: string; prompt: string; tokenIds: string[]; correctTokenIds: string[];
  reason: string; evidenceRefs: number[]; narrationSourceId?: string;
}
export interface PictureActivity extends ActivityBase {
  kind: 'picture'; mode: 'discovery' | 'word-picture';
  sceneSourceId: string; sceneAlt: string; caregiverNote: string;
  tokens: PictureToken[]; rounds: PictureRound[];
}
export interface PictureResponse {
  phase: 'explore' | 'play'; activeRoundId: string;
  answers: Record<string, string>; exploredTokenIds: string[];
  listenedRoundIds: string[]; caregiverSupport: boolean;
}
export type PictureSource = Pick<Source, 'id' | 'text'> & Partial<Pick<Source, 'kind' | 'mime' | 'dataUrl'>>;
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const unique = (v: unknown): v is string[] => Array.isArray(v) && new Set(v).size === v.length && v.every(id);

/** Field validation is separate from ActivityBase validation and actual source lookup. */
export function validatePictureFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], refs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const evidence = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= refs.length && new Set(v).size === v.length && v.every(i => Number.isInteger(i) && i >= 0 && i < refs.length);
  const cited = (indexes: number[]) => indexes.map(i => refs[i]).filter(plain);
  if (!fields(input, [...BASE, 'mode', 'sceneSourceId', 'sceneAlt', 'caregiverNote', 'tokens', 'rounds'])) errors.push('picture: unknown field');
  if (input.kind !== 'picture' || !['discovery', 'word-picture'].includes(String(input.mode))) errors.push('picture.mode: choose discovery or word-picture');
  if (!id(input.sceneSourceId) || !text(input.sceneAlt) || !text(input.caregiverNote)) errors.push('picture: a source image, useful scene description and caregiver guidance are required');
  const tokens = Array.isArray(input.tokens) && input.tokens.length >= 2 && input.tokens.length <= 8 ? input.tokens : [];
  if (!tokens.length) errors.push('picture.tokens: expected 2–8 regions in the source image');
  const ids = new Set<string>(), labels = new Map<string, string>(), regions = new Set<string>();
  tokens.forEach((token, index) => {
    if (!plain(token) || !fields(token, ['id', 'label', 'x', 'y', 'width', 'height', 'evidenceRefs']) || !id(token.id) || ids.has(token.id) || !text(token.label, 120)) { errors.push(`picture.tokens[${index}]: invalid or duplicate region`); return; }
    ids.add(token.id); labels.set(token.id, token.label);
    if ([token.x, token.y, token.width, token.height].some(n => typeof n !== 'number' || !Number.isFinite(n)) || (token.x as number) < 0 || (token.y as number) < 0 || (token.width as number) < 2 || (token.height as number) < 2 || (token.x as number) + (token.width as number) > 100 || (token.y as number) + (token.height as number) > 100) errors.push(`picture.tokens[${index}]: region must fit inside the original image`);
    const region = JSON.stringify([token.x, token.y, token.width, token.height]);
    if (regions.has(region)) errors.push('picture.tokens: two tokens cannot use the identical image region'); regions.add(region);
    if (!evidence(token.evidenceRefs)) errors.push(`picture.tokens[${index}]: cite the source annotation for this region`);
    else if (!cited(token.evidenceRefs).some(ref => ref.sourceId === input.sceneSourceId && typeof ref.evidence === 'string' && ref.evidence.includes(token.label as string))) errors.push(`picture.tokens[${index}]: the region label must occur in its cited scene annotation`);
  });
  const rounds = Array.isArray(input.rounds) && input.rounds.length >= 1 && input.rounds.length <= 12 ? input.rounds : [];
  if (!rounds.length) errors.push('picture.rounds: expected 1–12 short prepared prompts');
  const roundIds = new Set<string>();
  rounds.forEach((round, index) => {
    if (!plain(round) || !fields(round, ['id', 'prompt', 'tokenIds', 'correctTokenIds', 'reason', 'evidenceRefs', 'narrationSourceId']) || !id(round.id) || roundIds.has(round.id)) { errors.push(`picture.rounds[${index}]: invalid or duplicate prompt`); return; }
    roundIds.add(round.id);
    if (!text(round.prompt, 500) || !text(round.reason)) errors.push(`picture.rounds[${index}]: a short prompt and explanatory feedback are required`);
    const choices = unique(round.tokenIds) && round.tokenIds.length >= 2 && round.tokenIds.length <= 6 && round.tokenIds.every(v => ids.has(v)) ? round.tokenIds : [];
    if (!choices.length) errors.push(`picture.rounds[${index}]: choose 2–6 known picture tokens`);
    const correct = unique(round.correctTokenIds) && round.correctTokenIds.length >= 1 && round.correctTokenIds.length < choices.length && round.correctTokenIds.every(v => choices.includes(v)) ? round.correctTokenIds : [];
    if (!correct.length) errors.push(`picture.rounds[${index}]: prepared correct alternatives must be among the choices and leave a meaningful alternative`);
    if (!evidence(round.evidenceRefs)) errors.push(`picture.rounds[${index}]: cite the material that supports this prompt`);
    if (input.mode === 'word-picture' && (correct.length !== 1 || round.prompt !== labels.get(correct[0]))) errors.push(`picture.rounds[${index}]: a word-picture prompt must exactly match its single correct token label`);
    if (round.narrationSourceId !== undefined) {
      if (!id(round.narrationSourceId) || !evidence(round.evidenceRefs) || !cited(round.evidenceRefs).some(ref => ref.sourceId === round.narrationSourceId && typeof ref.evidence === 'string' && typeof round.prompt === 'string' && ref.evidence.includes(round.prompt))) errors.push(`picture.rounds[${index}]: narration must cite a transcript containing the exact prompt`);
    }
  });
  return errors;
}

/** Only bounded, embedded raster/audio files can power this offline board. */
function safeData(data: unknown, type: 'image' | 'audio'): boolean {
  if (typeof data !== 'string' || data.length > (type === 'image' ? 14 : 18) * 1024 * 1024) return false;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2].length % 4 !== 0) return false;
  const mime = match[1].toLowerCase();
  if (type === 'image' ? !['image/png', 'image/jpeg', 'image/webp'].includes(mime) : !['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg'].includes(mime)) return false;
  let header: string;
  try { header = atob(match[2].slice(0, Math.min(match[2].length, 64))); } catch { return false; }
  if (mime === 'image/png') return header.startsWith('\x89PNG\r\n\x1a\n');
  if (mime === 'image/jpeg') return header.startsWith('\xff\xd8\xff');
  if (mime === 'image/webp') return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  if (mime === 'audio/ogg') return header.startsWith('OggS');
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE';
  return header.startsWith('ID3') || header.charCodeAt(0) === 255 && (header.charCodeAt(1) & 0xe0) === 0xe0;
}
export function isPictureRaster(data: unknown): data is string { return safeData(data, 'image'); }
export function isPictureNarration(data: unknown): data is string { return safeData(data, 'audio'); }
export function validatePictureSources(activity: PictureActivity, sources: PictureSource[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(activity.sourceRefs) || !Array.isArray(activity.rounds)) return ['picture: source references and prepared prompts are required'];
  const scene = sources.find(s => s.id === activity.sceneSourceId);
  if (!scene || !isPictureRaster(scene.dataUrl)) errors.push('picture.sceneSourceId: attach a PNG, JPEG or WebP source image for offline play');
  for (const [index, ref] of activity.sourceRefs.entries()) {
    if (!plain(ref) || typeof ref.sourceId !== 'string' || typeof ref.evidence !== 'string') { errors.push(`picture.sourceRefs[${index}]: invalid source reference`); continue; }
    const source = sources.find(s => s.id === ref.sourceId);
    if (!source || !source.text.includes(ref.evidence)) errors.push(`picture.sourceRefs[${index}]: evidence must occur exactly in its named source`);
  }
  for (const round of activity.rounds) if (plain(round) && round.narrationSourceId) {
    const narration = sources.find(s => s.id === round.narrationSourceId);
    if (!narration || !isPictureNarration(narration.dataUrl) || !narration.text.includes(round.prompt)) errors.push(`picture.rounds.${round.id}: attach recorded narration and the exact prompt transcript`);
  }
  return errors;
}
export function initialPictureResponse(activity: PictureActivity, saved?: unknown): PictureResponse {
  const value = plain(saved) ? saved : {}, answers = plain(value.answers) ? value.answers : {};
  return {
    phase: value.phase === 'play' ? 'play' : 'explore',
    activeRoundId: activity.rounds.some(r => r.id === value.activeRoundId) ? value.activeRoundId as string : activity.rounds[0].id,
    answers: Object.fromEntries(activity.rounds.map(r => [r.id, r.tokenIds.includes(answers[r.id] as string) ? answers[r.id] as string : ''])),
    exploredTokenIds: Array.isArray(value.exploredTokenIds) ? [...new Set(value.exploredTokenIds.filter((v): v is string => typeof v === 'string' && activity.tokens.some(t => t.id === v)))] : [],
    listenedRoundIds: Array.isArray(value.listenedRoundIds) ? [...new Set(value.listenedRoundIds.filter((v): v is string => typeof v === 'string' && activity.rounds.some(r => r.id === v && !!r.narrationSourceId)))] : [],
    caregiverSupport: value.caregiverSupport === true,
  };
}
export function evaluatePicture(activity: PictureActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.rounds.length, feedback, details: [] });
  if (validatePictureFields(activity as unknown as Record<string, unknown>).length) return invalid('This picture activity needs author review.');
  if (!plain(response) || !fields(response, ['phase', 'activeRoundId', 'answers', 'exploredTokenIds', 'listenedRoundIds', 'caregiverSupport']) || response.phase !== 'play' || !plain(response.answers) || typeof response.caregiverSupport !== 'boolean' || !activity.rounds.some(r => r.id === response.activeRoundId)) return invalid('Open picture play and choose an answer for each prompt.');
  const answers = response.answers;
  if (Object.keys(answers).length !== activity.rounds.length || activity.rounds.some(r => !r.tokenIds.includes(answers[r.id] as string))) return invalid('Choose one picture for each prompt. You can take as long as you need.');
  if (!unique(response.exploredTokenIds) || response.exploredTokenIds.some(v => !activity.tokens.some(t => t.id === v)) || !unique(response.listenedRoundIds) || response.listenedRoundIds.some(v => !activity.rounds.some(r => r.id === v && !!r.narrationSourceId))) return invalid('The saved picture progress needs to be restored before checking.');
  const details = activity.rounds.map(r => ({ id: r.id, correct: r.correctTokenIds.includes(answers[r.id] as string), message: r.reason }));
  const score = details.filter(d => d.correct).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, hintUsed: response.caregiverSupport, feedback: `${correct ? 'You connected the pictures and their meanings.' : 'Let’s look at the pictures again. You can change your choices.'} ${activity.explanation}`, details };
}
