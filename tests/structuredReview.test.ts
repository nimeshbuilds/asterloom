import { expect, it } from 'vitest';
import { independentStructuredCount, beginStructuredReview, reviewAfterEvaluation, structuredReviewsDue } from '../src/lib/structuredReview';
import { emptyProgress } from '../src/lib/storage';
import { parseProgress, serializeProgress } from '../src/lib/package';
import type { Evaluation } from '../src/lib/structuredEngine';
const correct: Evaluation = { valid: true, correct: true, outcome: 'correct', score: 1, maxScore: 1, feedback: 'Reviewed', details: [] };
it('spaces real fresh attempts and cannot promote a rechecked stored solution', () => {
  const first = '2026-10-04T00:00:00.000Z', due = '2026-10-05T00:00:00.000Z';
  const review = reviewAfterEvaluation('activity-one', undefined, correct, first)!;
  const state = { response: { choiceId: 'a' }, completed: true, attempts: 1, score: 1, maxScore: 1, updatedAt: first, review };
  let p = { ...emptyProgress('notebook-one'), structured: { 'activity-one': state } };
  expect(review.independentSuccesses).toBe(1); expect(structuredReviewsDue(p, due)).toEqual(['activity-one']);
  expect(reviewAfterEvaluation('activity-one', state, correct, due)).toEqual(review);
  p = beginStructuredReview(p, 'activity-one', due) as typeof p;
  expect(p.structured['activity-one'].response).toEqual({});
  const next = reviewAfterEvaluation('activity-one', p.structured['activity-one'], correct, due)!;
  expect(next.independentSuccesses).toBe(2); expect(next.intervalDays).toBe(3);
  expect(parseProgress(serializeProgress(p)).structured?.['activity-one'].review).toEqual(review);
});
it('does not give independent review credit for assistance or self assessment', () => {
  const assisted = reviewAfterEvaluation('activity-one', undefined, { ...correct, hintUsed: true })!;
  expect(assisted.independentSuccesses).toBe(0);
  expect(reviewAfterEvaluation('activity-one', undefined, { ...correct, correct: null, outcome: 'self-reviewed' })).toBeUndefined();
});
it('backs up a fully populated bounded construction draft without allowing unbounded state', () => {
  const p = { ...emptyProgress('notebook-one'), structured: { 'activity-one': { response: { instances: Array.from({ length: 32 }, (_, i) => ({ id: `piece-${i}`, componentId: 'transform', x: 30, y: 50 })), edges: Array.from({ length: 96 }, (_, i) => ({ from: `piece-${i % 32}`, fromPort: 'output', to: `piece-${(i + 1) % 32}`, toPort: 'input' })) }, completed: false, score: 0, maxScore: 1, attempts: 0, updatedAt: new Date().toISOString() } } };
  expect(parseProgress(serializeProgress(p)).structured?.['activity-one'].response).toEqual(p.structured['activity-one'].response);
  const oversized = structuredClone(p); (oversized.structured['activity-one'].response as unknown as { tooLarge: string[] }).tooLarge = Array.from({ length: 4097 }, () => 'x');
  expect(() => serializeProgress(oversized)).toThrow(/complexity/);
});

it('counts distinct independently solved activities without promoting assisted or legacy completion', () => {
  const saved = { response: {}, completed: true, score: 1, maxScore: 1, attempts: 1, updatedAt: new Date().toISOString() };
  const p = { ...emptyProgress('notebook-one'), structured: {
    independent: { ...saved, review: reviewAfterEvaluation('independent', undefined, correct) },
    assisted: { ...saved, review: reviewAfterEvaluation('assisted', undefined, { ...correct, hintUsed: true }) },
    legacy: saved,
  }};
  expect(independentStructuredCount(p)).toBe(1);
  expect(independentStructuredCount(undefined)).toBe(0);
});
