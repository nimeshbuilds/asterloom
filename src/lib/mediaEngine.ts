import type { ActivityBase, Evaluation } from './structuredEngine';
export interface MediaActivity extends ActivityBase {
  kind: 'media'; mediaSourceId: string; duration: number;
  cues: { id: string; start: number; end: number; text: string; evidenceRefs: number[] }[];
  checkpoints: { id: string; at: number; prompt: string; choices: { id: string; label: string }[]; correctChoiceIds: string[]; reason: string; evidenceRefs: number[] }[];
}
export interface MediaResponse { position: number; activeCheckpointId: string; answers: Record<string, string>; visitedCheckpointIds: string[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
export function validateMediaFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], refs = Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0;
  const sourceRefs: unknown[] = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const evidence = (v: unknown) => Array.isArray(v) && v.length > 0 && v.length <= refs && v.every(i => Number.isInteger(i) && i >= 0 && i < refs);
  if (!fields(input, [...BASE, 'mediaSourceId', 'duration', 'cues', 'checkpoints'])) errors.push('media: unknown field');
  if (!id(input.mediaSourceId) || typeof input.duration !== 'number' || !Number.isFinite(input.duration) || input.duration < 1 || input.duration > 43200) errors.push('media: specify a bundled media source and its duration (1 second–12 hours)');
  const duration = typeof input.duration === 'number' ? input.duration : 0;
  const cues = Array.isArray(input.cues) && input.cues.length >= 1 && input.cues.length <= 1000 ? input.cues : [];
  if (!cues.length) errors.push('media.cues: a timed transcript is required');
  const cueIds = new Set<string>(); let previousStart = -1;
  cues.forEach(c => {
    if (!object(c) || !fields(c, ['id', 'start', 'end', 'text', 'evidenceRefs']) || !id(c.id) || cueIds.has(c.id)) { errors.push('media.cues: invalid or duplicate cue'); return; }
    cueIds.add(c.id);
    if (typeof c.start !== 'number' || typeof c.end !== 'number' || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < previousStart || c.start < 0 || c.end <= c.start || c.end > duration) errors.push('media.cues: ordered cue times must be within the recording');
    if (typeof c.start === 'number') previousStart = c.start;
    if (!text(c.text) || !evidence(c.evidenceRefs)) errors.push('media.cues: transcript text and source evidence are required');
    if (typeof c.text === 'string' && Array.isArray(c.evidenceRefs) && !c.evidenceRefs.some(i => { const ref = sourceRefs[i]; return object(ref) && typeof ref.evidence === 'string' && ref.evidence.includes(c.text as string); })) errors.push('media.cues: transcript cue must occur in its cited source excerpt');
  });
  const checkpoints = Array.isArray(input.checkpoints) && input.checkpoints.length >= 1 && input.checkpoints.length <= 40 ? input.checkpoints : [];
  if (!checkpoints.length) errors.push('media.checkpoints: expected 1–40 prepared checkpoints');
  const checkIds = new Set<string>(); let previousAt = -1;
  checkpoints.forEach(c => {
    if (!object(c) || !fields(c, ['id', 'at', 'prompt', 'choices', 'correctChoiceIds', 'reason', 'evidenceRefs']) || !id(c.id) || checkIds.has(c.id)) { errors.push('media.checkpoints: invalid checkpoint'); return; }
    checkIds.add(c.id);
    if (typeof c.at !== 'number' || !Number.isFinite(c.at) || c.at <= previousAt || c.at < 0 || c.at > duration) errors.push('media.checkpoints: distinct increasing times within the recording are required');
    if (typeof c.at === 'number') previousAt = c.at;
    if (!text(c.prompt) || !text(c.reason) || !evidence(c.evidenceRefs)) errors.push('media.checkpoints: source-backed prompts and feedback are required');
    const choices = Array.isArray(c.choices) && c.choices.length >= 2 && c.choices.length <= 8 ? c.choices : [], ids = new Set<string>();
    if (!choices.length) errors.push('media.checkpoints: expected 2–8 choices');
    choices.forEach(v => { if (!object(v) || !fields(v, ['id', 'label']) || !id(v.id) || ids.has(v.id) || !text(v.label)) errors.push('media.checkpoints: invalid choice'); else ids.add(v.id); });
    if (!Array.isArray(c.correctChoiceIds) || !c.correctChoiceIds.length || new Set(c.correctChoiceIds).size !== c.correctChoiceIds.length || c.correctChoiceIds.some(v => typeof v !== 'string' || !ids.has(v))) errors.push('media.checkpoints: correct alternatives must refer to known choices');
  });
  return errors;
}
export function initialMediaResponse(activity: MediaActivity, saved?: unknown): MediaResponse {
  const value = object(saved) ? saved : {}, answers = object(value.answers) ? value.answers : {};
  return { position: typeof value.position === 'number' && Number.isFinite(value.position) ? Math.max(0, Math.min(activity.duration, value.position)) : 0, activeCheckpointId: activity.checkpoints.some(c => c.id === value.activeCheckpointId) ? value.activeCheckpointId as string : activity.checkpoints[0].id, answers: Object.fromEntries(activity.checkpoints.map(c => [c.id, c.choices.some(v => v.id === answers[c.id]) ? answers[c.id] as string : ''])), visitedCheckpointIds: Array.isArray(value.visitedCheckpointIds) ? [...new Set(value.visitedCheckpointIds.filter((id): id is string => typeof id === 'string' && activity.checkpoints.some(c => c.id === id)))] : [] };
}
export function evaluateMedia(activity: MediaActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.checkpoints.length, feedback, details: [] });
  if (validateMediaFields(activity as unknown as Record<string, unknown>).length) return invalid('This timed media model needs author review.');
  if (!object(response) || !object(response.answers) || Object.keys(response.answers).length !== activity.checkpoints.length) return invalid('Respond to every checkpoint.');
  const answers = response.answers;
  if (activity.checkpoints.some(c => !c.choices.some(v => v.id === answers[c.id]))) return invalid('Choose a response at every checkpoint; you may use the transcript and timeline.');
  const details = activity.checkpoints.map(c => ({ id: c.id, correct: c.correctChoiceIds.includes(answers[c.id] as string), message: c.reason })), score = details.filter(d => d.correct).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, feedback: `${correct ? 'Your responses match the reviewed recording.' : 'Revisit the relevant recording segments and revise.'} ${activity.explanation}`, details };
}
function timestamp(s: number) { const millis = Math.round(s * 1000); return `${String(Math.floor(millis / 3600000)).padStart(2, '0')}:${String(Math.floor(millis / 60000) % 60).padStart(2, '0')}:${String(Math.floor(millis / 1000) % 60).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`; }
export function mediaCaptionTrack(activity: MediaActivity): string { return `data:text/vtt;charset=utf-8,${encodeURIComponent('WEBVTT\n\n' + activity.cues.map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text.replaceAll('-->', '→').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\n`).join('\n'))}`; }
