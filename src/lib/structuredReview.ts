import { createReviewState, isReviewDue, scheduleReview } from '../data/learningScience';
import type { Progress } from '../types';
import type { Evaluation } from './structuredEngine';
type SavedActivity = NonNullable<Progress['structured']>[string];
/** A visible, deterministic spacing rule. It is not a measure of certification readiness. */
export function reviewAfterEvaluation(id: string, previous: SavedActivity | undefined, result: Evaluation, now = new Date().toISOString()) {
  if (!result.valid || result.correct === null) return previous?.review;
  const review = previous?.review;
  // Re-checking yesterday's stored solution is not a new retrieval attempt.
  if (review && isReviewDue(review, now) && (!previous?.reviewStartedAt || Date.parse(previous.reviewStartedAt) <= Date.parse(review.lastReviewedAt ?? '1970-01-01'))) return review;
  return scheduleReview(review ?? createReviewState(id, now), { correct: result.correct, hintUsed: result.hintUsed === true }, now);
}
export function beginStructuredReview(progress: Progress, id: string, now = new Date().toISOString()): Progress {
  const prior = progress.structured?.[id];
  if (!prior || !Number.isFinite(Date.parse(now))) return progress;
  return { ...progress, structured: { ...progress.structured, [id]: { ...prior, response: {}, reviewStartedAt: now, updatedAt: now } } };
}
export function structuredReviewsDue(progress: Progress, now = new Date().toISOString()): string[] {
  return Object.entries(progress.structured ?? {}).filter(([, value]) => value.review && Number.isFinite(Date.parse(value.review.dueAt)) && isReviewDue(value.review, now)).map(([id]) => id);
}

/** Count distinct activities with observed independent success, not assisted completion. */
export function independentStructuredCount(progress: Progress | undefined): number {
  return Object.values(progress?.structured ?? {}).filter(value => (value.review?.independentSuccesses ?? 0) > 0).length;
}
