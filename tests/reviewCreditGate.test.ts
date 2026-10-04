import { describe, expect, it } from 'vitest';
import { ACTIVITY_EXAMPLES, evaluateActivity, evaluateActivityForAuthoring } from '../src/lib/structuredEngine';
import type { StructuredActivity } from '../src/lib/structuredEngine';
import { EXTENDED_EXAMPLES } from '../src/lib/extendedExamples';
import { SCENARIO_EXAMPLES } from '../src/lib/scenarioEngine';
import { COMPOSITION_EXAMPLES } from '../src/lib/compositionExamples';
import { PICTURE_BUILD_EXAMPLES, TREE_PICTURE_BUILD } from '../src/lib/pictureBuildExamples';
import { initialPictureBuildResponse } from '../src/lib/pictureBuildEngine';
import { childPlayFixtures } from '../src/data/childPlayFixtures';
import { pictureDiscoveryFixture } from '../src/data/pictureFixtures';
import { ruleSwitchFixture } from '../src/data/ruleSwitchFixtures';
import { validateActivityDraft } from '../src/lib/activityAssistant';
import { emptyProgress } from '../src/lib/storage';
import { createNotebook } from '../src/lib/utils';
import { reconcileNotebookProgress } from '../src/lib/progressRevision';
import { restoreNotebookProgress, serializeNotebookProgress } from '../src/lib/progressBackup';
import { reviewAfterEvaluation } from '../src/lib/structuredReview';
import type { Progress } from '../src/types';

const examples = [...ACTIVITY_EXAMPLES, ...EXTENDED_EXAMPLES, ...SCENARIO_EXAMPLES, ...COMPOSITION_EXAMPLES, ...PICTURE_BUILD_EXAMPLES, ...childPlayFixtures, pictureDiscoveryFixture, ruleSwitchFixture];
const kinds = [...new Map(examples.map(activity => [activity.kind, activity])).values()];
const at = '2026-10-04T00:00:00.000Z';
function fixture() {
  const activity = structuredClone(ACTIVITY_EXAMPLES.find(activity => activity.kind === 'sequence')!);
  if (activity.kind !== 'sequence') throw new Error('Missing sequence fixture');
  const response = { order: activity.items.map(item => item.id), _draft: { checked: true } };
  const notebook = createNotebook({ id: 'review-world', activities: [activity], sources: [{ id: activity.sourceRefs[0].sourceId, title: 'Activity source', kind: 'text', text: activity.sourceRefs.map(ref => ref.evidence).join('\n')+'\nThe observed outcome is A.', status: 'ready', addedAt: at }], cards: [{ id: 'manual-card', prompt: 'Author question', answer: 'A', options: ['A', 'B'], correctIndex: 0, explanation: 'Authored answer', sourceId: activity.sourceRefs[0].sourceId, evidence: 'The observed outcome is A.', concept: 'Author model', tags: [], questionType: 'manual', reviewStatus: 'reviewed' }] });
  const review = reviewAfterEvaluation(activity.id, undefined, { valid: true, correct: true, outcome: 'correct', score: 1, maxScore: 1, feedback: '', details: [] }, at)!;
  const progress: Progress = { ...emptyProgress(notebook.id), xp: 50, completedCardIds: ['manual-card'], cards: { 'manual-card': { cardId: 'manual-card', attempts: 1, correct: 1, successfulReviews: 1, intervalDays: 1, dueAt: at, lastAttemptAt: at, lastCorrect: true } }, activeSession: { scaffoldId: 'recall-escape-mission', cardIds: ['manual-card'], index: 0, seed: 5, startedAt: at }, journal: [{ id: 'my-note', text: 'A historical reflection.', at }], structured: { [activity.id]: { response, completed: true, score: 1, maxScore: 1, attempts: 1, updatedAt: at, review } } };
  return { activity, notebook, progress, response };
}

describe('unreviewed model credit boundary', () => {
  it('covers every structured engine through the shared gate', () => {
    expect(kinds).toHaveLength(17);
    for (const activity of kinds) {
      const result = evaluateActivity({ ...activity, reviewStatus: 'needs-review' }, {});
      expect(result, activity.kind).toMatchObject({ valid: false, correct: null, outcome: 'draft-preview', score: 0, maxScore: 0 });
      expect(result.feedback).toContain('Draft preview only');
      expect(reviewAfterEvaluation(activity.id, undefined, result)).toBeUndefined();
      expect(result.correct === true || result.outcome === 'self-reviewed').toBe(false);
    }
  });
  it('cannot award credit for a source-cited but semantically reversed AI draft', () => {
    const excerpt = 'First open the gate, then walk through.';
    const activity = validateActivityDraft({ source: { id: 'gate-source', title: 'Gate procedure', text: excerpt }, excerpt, kind: 'sequence', ageGroup: 'adult', goal: 'Follow the source' }, JSON.stringify({ activity: { version: 1, id: 'assistant-draft', kind: 'sequence', title: 'Gate procedure', instruction: 'Arrange the actions.', explanation: 'The authored sequence is complete.', hint: 'Read the procedure.', reviewStatus: 'reviewed', sourceRefs: [{ sourceId: 'gate-source', evidence: excerpt }], items: [{ id: 'open', label: 'Open the gate' }, { id: 'walk', label: 'Walk through' }], constraints: [{ before: 'walk', after: 'open' }] } }), 'reversed-draft');
    const response = { order: ['walk', 'open'] };
    expect(evaluateActivityForAuthoring(activity, response).correct).toBe(true);
    const result = evaluateActivity(activity, response);
    expect(result).toMatchObject({ valid: false, correct: null, score: 0, outcome: 'draft-preview' });
    expect(result.details[0].correct).toBe(true);
    expect(result.feedback).not.toContain('satisfies the reviewed model');
  });
  it('keeps reviewed caregiver completion semantics but never completes an unreviewed picture', () => {
    const activity = structuredClone(TREE_PICTURE_BUILD), response = initialPictureBuildResponse(activity);
    response.parts = structuredClone(activity.referenceBuilds[0].parts);
    response.tell.checks = Object.fromEntries(activity.tell.caregiverChecks.map(check => [check.id, true]));
    response.tell.reviewed = true;
    response.tell.reviewedState = { parts: structuredClone(response.parts), method: 'spoken', words: '', narrationSourceId: '' };
    expect(evaluateActivity(activity, response)).toMatchObject({ valid: true, correct: null, outcome: 'self-reviewed', score: 0, maxScore: 0 });
    expect(evaluateActivity({ ...activity, reviewStatus: 'needs-review' }, response)).toMatchObject({ valid: false, correct: null, outcome: 'draft-preview', score: 0 });
  });
  it('leaves every reviewed engine evaluation unchanged', () => {
    for (const activity of kinds) expect(evaluateActivity(activity, {}), activity.kind).toEqual(evaluateActivityForAuthoring(activity, {}));
  });
});

describe('review status and saved learning credit', () => {
  it('clears completion and review schedules when an author withdraws review', () => {
    const { notebook, progress, activity } = fixture(), next = structuredClone(notebook);
    next.activities![0].reviewStatus = 'needs-review'; next.cards[0].reviewStatus = 'needs-review';
    const result = reconcileNotebookProgress(notebook, next, progress);
    expect(result.structured?.[activity.id]).toBeUndefined();
    expect(result.completedCardIds).toEqual([]); expect(result.cards).toEqual({}); expect(result.activeSession).toBeUndefined();
    expect(result.xp).toBe(50); expect(result.journal).toEqual(progress.journal);
  });
  it('migrates previously credited local drafts at boot while retaining their saved work', () => {
    const { notebook, progress, activity, response } = fixture();
    notebook.activities![0].reviewStatus = 'needs-review';
    const result = reconcileNotebookProgress(notebook, notebook, progress);
    expect(result.structured?.[activity.id]).toMatchObject({ response, completed: false, score: 0, maxScore: 0, attempts: 1 });
    expect(result.structured?.[activity.id].review).toBeUndefined();
    expect(result.xp).toBe(50);
  });
  it('preserves a draft solution after approval but requires a new explicit check', () => {
    const { notebook, progress, activity, response } = fixture();
    notebook.activities![0].reviewStatus = 'needs-review';
    const next = structuredClone(notebook); next.activities![0].reviewStatus = 'reviewed';
    const result = reconcileNotebookProgress(notebook, next, progress);
    const saved = result.structured![activity.id];
    expect(saved.response).toEqual({ ...response, _draft: { checked: false } });
    expect(saved.completed).toBe(false); expect(saved.review).toBeUndefined();
    expect((saved.response as typeof response).order).toEqual(response.order);
  });
  it('never restores reviewed backup credits into current unreviewed objectives', async () => {
    const { notebook, progress, activity } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.activities![0].reviewStatus = 'needs-review'; notebook.cards[0].reviewStatus = 'needs-review';
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.progress.completedCardIds).toEqual([]); expect(result.progress.activeSession).toBeUndefined();
    expect(result.progress.structured?.[activity.id]).toMatchObject({ completed: false, score: 0, maxScore: 0 });
    expect(result.progress.structured?.[activity.id].review).toBeUndefined();
    expect(result.resetObjectiveCount).toBe(2);
  });
  it('round trips harmless draft positions and responses without silently adding credit', async () => {
    const { notebook, progress, activity } = fixture();
    notebook.activities![0].reviewStatus = 'needs-review';
    const uncredited = reconcileNotebookProgress(notebook, notebook, progress);
    const result = await restoreNotebookProgress(notebook, await serializeNotebookProgress(notebook, uncredited));
    expect(result.progress.structured?.[activity.id]).toEqual(uncredited.structured?.[activity.id]);
    expect(result.resetObjectiveCount).toBe(0);
  });
});
