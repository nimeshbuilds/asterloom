import type { LearningCard, Notebook, Progress } from '../types';
import type { StructuredActivity } from './structuredEngine';
import { hasCurrentCardEvidence } from './utils';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function cardModel(card: LearningCard): string {
  const { prompt, answer, options, correctIndex, sourceId, evidence, questionType } = card;
  return stable({ prompt, answer, options, correctIndex, sourceId, evidence, questionType });
}
function activityModel(activity: StructuredActivity): string {
  const { title: _title, reviewStatus: _review, explanation: _explanation, hint: _hint, scaffoldIds: _recipes, extractedFrom: _origin, ...model } = activity;
  // Moving a label target changes the artwork layout, not its answer mapping.
  if (model.kind === 'diagram') return stable({ ...model, targets: model.targets.map(({ id, label }) => ({ id, label })) });
  return stable(model);
}
function currentActivityEvidence(activity: StructuredActivity, notebook: Notebook): boolean {
  return activity.sourceRefs.every(reference => Boolean(reference.evidence.trim()) && notebook.sources.some(source => source.id === reference.sourceId && source.text.includes(reference.evidence)));
}

/**
 * Historical effort stays intact when authors revise a notebook. Current completion,
 * scheduling and unfinished answers apply only to the objective that earned them.
 */
export function reconcileNotebookProgress(previous: Notebook, next: Notebook, progress: Progress): Progress {
  if (previous.id !== next.id || progress.notebookId !== next.id) return progress;
  const priorCards = new Map(previous.cards.map(card => [card.id, card]));
  const currentCards = new Map(next.cards.map(card => [card.id, card]));
  const priorActivities = new Map((previous.activities ?? []).map(activity => [activity.id, activity]));
  const currentActivities = new Map((next.activities ?? []).map(activity => [activity.id, activity]));
  const cardUnchanged = (id: string) => {
    const before = priorCards.get(id), after = currentCards.get(id);
    return !!before && !!after && hasCurrentCardEvidence(after, next.sources) && cardModel(before) === cardModel(after);
  };
  const activityUnchanged = (id: string) => {
    const before = priorActivities.get(id), after = currentActivities.get(id);
    return !!before && !!after && currentActivityEvidence(after, next) && activityModel(before) === activityModel(after);
  };
  const cards = Object.fromEntries(Object.entries(progress.cards).filter(([id]) => cardUnchanged(id)));
  const completedCardIds = progress.completedCardIds.filter(cardUnchanged);
  const structured = progress.structured === undefined ? undefined : Object.fromEntries(Object.entries(progress.structured).filter(([id]) => activityUnchanged(id)));
  const clearSession = !!progress.activeSession && progress.activeSession.cardIds.some(id => !cardUnchanged(id));
  const changed = Object.keys(cards).length !== Object.keys(progress.cards).length || completedCardIds.length !== progress.completedCardIds.length || Object.keys(structured ?? {}).length !== Object.keys(progress.structured ?? {}).length || clearSession;
  if (!changed) return progress;
  const revised: Progress = { ...progress, cards, completedCardIds, ...(structured === undefined ? {} : { structured }), mastery: Object.keys(cards).length ? Math.round(Object.values(cards).filter(card => card.lastCorrect).length / Object.keys(cards).length * 100) : 0, updatedAt: new Date().toISOString(), revision: progress.revision + 1 };
  if (clearSession) delete revised.activeSession;
  // attempts, XP, journal, sessions and historical streaks are deliberately preserved.
  return revised;
}
