import { describe, expect, it } from 'vitest';
import { SCAFFOLDS } from '../src/data/scaffolds';
import { buildLearningBriefing, completeLesson, initialLessonState, lessonReady, type LearningPlan, type LessonState } from '../src/lib/learningBriefing';
import { parseProgress, serializeProgress } from '../src/lib/package';
import { emptyProgress } from '../src/lib/storage';
import { beginStructuredReview } from '../src/lib/structuredReview';
import { createNotebook, createSource } from '../src/lib/utils';
import { compileNotebook } from '../src/lib/compiler';
import type { Progress } from '../src/types';

function fixture() {
  const source = createSource('Packet: a small unit of data that travels between the two modeled devices.\nFrame: the enclosing structure described only by this training model.\n\nExample: The receiver reads the packet after arrival because the packet is now available. This example is limited to the supplied model.', 'Training model');
  const notebook = createNotebook({ id: 'lesson-notebook', sources: [source], cards: compileNotebook([source], { maxCards: 2 }).cards });
  const plan = buildLearningBriefing({ notebook, scaffold: SCAFFOLDS.find(s => s.id === 'recall-escape-mission')! });
  return { notebook, plan };
}
function prepared(plan: LearningPlan): LessonState {
  const state = initialLessonState(plan);
  return { ...state, stage: 'practice', missionAccepted: true, viewedPassageIds: plan.passages.map(p => p.id), walkthroughStep: plan.walkthrough.steps.length, practice: { ...state.practice, focusId: plan.practice.focusOptions[0].id, explanation: 'The source describes how the packet arrives in this limited model.', connection: 'Other systems need separate evidence before this explanation is applied.', compared: true, order: [...plan.practice.orderIds] } };
}
const at = '2026-10-04T00:00:00.000Z';
describe('portable lesson checkpoints', () => {
  it('roundtrips a genuine completed lesson map and partial work without granting XP', () => {
    const { notebook, plan } = fixture();
    const completed = completeLesson(plan, prepared(plan), Date.parse(at));
    expect(lessonReady(plan, completed)).toBe(true);
    const progress = { ...emptyProgress(notebook.id), lessons: { [plan.id]: completed } };
    const restored = parseProgress(serializeProgress(progress));
    expect(restored.lessons).toEqual(progress.lessons);
    expect(lessonReady(plan, restored.lessons?.[plan.id])).toBe(true);
    expect(restored.xp).toBe(0); expect(restored.attempts).toEqual([]);
    const partial = { ...prepared(plan), practice: { ...prepared(plan).practice, compared: false } };
    progress.lessons[plan.id] = partial;
    const resumed = parseProgress(serializeProgress(progress)).lessons?.[plan.id];
    expect(resumed).toEqual(partial); expect(lessonReady(plan, resumed)).toBe(false);
  });
  it('rejects tampered checkpoint shapes and bindings, and refuses a forged ready checkpoint on resume', () => {
    const { notebook, plan } = fixture(), state = completeLesson(plan, prepared(plan), Date.parse(at));
    const backup = JSON.parse(serializeProgress({ ...emptyProgress(notebook.id), lessons: { [plan.id]: state } }));
    for (const change of [
      { version: 2 }, { planKey: 'lesson-' + '0'.repeat(64) }, { apiKey: 'private' },
      { mediaPositions: { [notebook.sources[0].id]: -1 } },
      { practice: { ...state.practice, explanation: 'x'.repeat(1201) } },
      { mediaPositions: JSON.parse('{"__proto__":1}') },
    ]) {
      const tampered = structuredClone(backup); tampered.progress.lessons[plan.id] = { ...state, ...change };
      expect(() => parseProgress(JSON.stringify(tampered))).toThrow(/lesson checkpoint/i);
    }
    const forged = structuredClone(backup);
    forged.progress.lessons[plan.id].missionAccepted = false;
    const resumed = parseProgress(JSON.stringify(forged)).lessons?.[plan.id];
    expect(lessonReady(plan, resumed)).toBe(false);
    expect(initialLessonState(plan, resumed).stage).not.toBe('ready');
  });
  it('starts a fresh structured review while retaining the lesson and clearing prior answers only', () => {
    const { notebook, plan } = fixture(), lesson = completeLesson(plan, prepared(plan), Date.parse(at));
    const progress: Progress = { ...emptyProgress(notebook.id), lessons: { [plan.id]: lesson }, structured: {
      'activity-one': { response: { order: ['answer-a', 'answer-b'], _draft: { lesson, hintUsed: true, checked: true } }, completed: true, score: 1, maxScore: 1, attempts: 2, updatedAt: at },
      'activity-other': { response: { selection: 'saved' }, completed: false, score: 0, maxScore: 1, attempts: 0, updatedAt: at },
    } };
    const original = structuredClone(progress), due = '2026-10-05T00:00:00.000Z';
    const next = beginStructuredReview(progress, 'activity-one', due);
    expect(progress).toEqual(original);
    expect(next.lessons).toEqual(progress.lessons);
    expect(next.structured?.['activity-one'].response).toEqual({ _draft: { lesson } });
    expect(next.structured?.['activity-one'].attempts).toBe(2);
    expect(next.structured?.['activity-one'].reviewStartedAt).toBe(due);
    expect(next.structured?.['activity-other']).toEqual(progress.structured?.['activity-other']);
    const restored = parseProgress(serializeProgress(next));
    expect(restored.lessons).toEqual(next.lessons);
    expect(restored.structured).toEqual(next.structured);
    expect(lessonReady(plan, restored.lessons?.[plan.id])).toBe(true);
  });
});
