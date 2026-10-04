import type { ActivityBase, Evaluation } from './structuredEngine';

export interface CompletionActivity extends ActivityBase {
  kind: 'completion';
  context: string;
  tokens: { id: string; label: string }[];
  slots: { id: string; before: string; after: string; acceptedTokenIds: string[]; reason: string; evidenceRefs: number[] }[];
  /** A declared repeating cycle, never an inferred rule for an arbitrary finite sequence. */
  pattern?: { cycle: string[]; shown: string[]; offset: number };
}
export interface CompletionResponse { slotTokens: Record<string, string> }
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, empty = false) => typeof v === 'string' && (empty || v.trim().length > 0) && v.length <= 4000;
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export function validateCompletionFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!keys(input, [...BASE, 'context', 'tokens', 'slots', 'pattern'])) errors.push('completion: unknown field');
  if (!text(input.context)) errors.push('completion.context: supply the worked context or declared pattern rule');
  const tokens = Array.isArray(input.tokens) && input.tokens.length >= 2 && input.tokens.length <= 60 ? input.tokens : [];
  if (!tokens.length) errors.push('completion.tokens: expected 2–60 tokens');
  const ids = new Set<string>();
  tokens.forEach(t => { if (!object(t) || !keys(t, ['id', 'label']) || !id(t.id) || !text(t.label) || ids.has(t.id)) errors.push('completion.tokens: every token needs a unique id and label'); else ids.add(t.id); });
  const slots = Array.isArray(input.slots) && input.slots.length >= 1 && input.slots.length <= 30 ? input.slots : [];
  if (!slots.length) errors.push('completion.slots: expected 1–30 slots');
  const slotIds = new Set<string>(), refs = Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0;
  slots.forEach(s => {
    if (!object(s) || !keys(s, ['id', 'before', 'after', 'acceptedTokenIds', 'reason', 'evidenceRefs'])) { errors.push('completion.slots: invalid slot'); return; }
    if (!id(s.id) || slotIds.has(s.id)) errors.push('completion.slots: unique safe slot ids are required'); else slotIds.add(s.id);
    if (!text(s.before, true) || !text(s.after, true) || !text(s.reason)) errors.push('completion.slots: supply context and explanatory feedback');
    if (!Array.isArray(s.acceptedTokenIds) || !s.acceptedTokenIds.length || s.acceptedTokenIds.length > ids.size || new Set(s.acceptedTokenIds).size !== s.acceptedTokenIds.length || s.acceptedTokenIds.some(v => typeof v !== 'string' || !ids.has(v))) errors.push('completion.slots: accepted tokens must be distinct known tokens');
    if (!Array.isArray(s.evidenceRefs) || !s.evidenceRefs.length || s.evidenceRefs.some(v => !Number.isInteger(v) || v < 0 || v >= refs)) errors.push('completion.slots: each answer needs an exact source evidence reference');
  });
  if (input.pattern !== undefined) {
    const p = input.pattern;
    if (!object(p) || !keys(p, ['cycle', 'shown', 'offset']) || !Array.isArray(p.cycle) || p.cycle.length < 2 || p.cycle.length > 12 || p.cycle.some(v => typeof v !== 'string' || !ids.has(v)) || !Array.isArray(p.shown) || p.shown.length < 2 || p.shown.length > 40 || !Number.isInteger(p.offset) || (p.offset as number) < 0 || (p.offset as number) >= p.cycle.length) errors.push('completion.pattern: expected a bounded cycle, demonstration and offset');
    else {
      const cycle = p.cycle as string[], offset = p.offset as number;
      if (p.shown.some((v, i) => v !== cycle[(offset + i) % cycle.length])) errors.push('completion.pattern: demonstration contradicts its declared cycle');
      slots.forEach((s, i) => { if (object(s) && Array.isArray(s.acceptedTokenIds) && (s.acceptedTokenIds.length !== 1 || s.acceptedTokenIds[0] !== cycle[(offset + (p.shown as unknown[]).length + i) % cycle.length])) errors.push('completion.pattern: slot answer contradicts the declared cycle'); });
    }
  }
  return errors;
}
export function initialCompletionResponse(activity: CompletionActivity, saved?: unknown): CompletionResponse {
  const data = object(saved) && object(saved.slotTokens) ? saved.slotTokens : {};
  return { slotTokens: Object.fromEntries(activity.slots.map(slot => [slot.id, typeof data[slot.id] === 'string' && activity.tokens.some(t => t.id === data[slot.id]) ? data[slot.id] as string : ''])) };
}
export function evaluateCompletion(activity: CompletionActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.slots.length, feedback, details: [] });
  if (validateCompletionFields(activity as unknown as Record<string, unknown>).length) return invalid('The completion model needs author review.');
  if (!object(response) || !object(response.slotTokens) || Object.keys(response.slotTokens).length !== activity.slots.length || activity.slots.some(s => !Object.hasOwn(response.slotTokens as object, s.id))) return invalid('Complete every slot.');
  const answers = response.slotTokens;
  if (Object.values(answers).some(v => !activity.tokens.some(t => t.id === v))) return invalid('Choose an available token for every slot.');
  const details = activity.slots.map(s => ({ id: s.id, correct: s.acceptedTokenIds.includes(answers[s.id] as string), message: s.reason }));
  const score = details.filter(d => d.correct).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, feedback: `${correct ? 'The completed model satisfies the source rules.' : 'Revise the incomplete relationships using the feedback.'} ${activity.explanation}`, details };
}
