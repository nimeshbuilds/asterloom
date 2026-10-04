import type { LearningCard, Notebook, Progress } from '../types';
import type { StructuredActivity } from './structuredEngine';
import { canScoreRecallCard } from './utils';
import {sourceMediaIdentity} from './mediaAssets';

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
  return activity.sourceRefs.every(reference => Boolean(reference.evidence.trim()) && notebook.sources.some(source => source.id === reference.sourceId && source.status === 'ready' && source.text.includes(reference.evidence)));
}

function mediaEvidence(ids: string[], notebook: Notebook): string {
  const sourceIds=new Set(ids);
  for(const id of ids){const source=notebook.sources.find(item=>item.id===id);if(source?.transcript)sourceIds.add(source.transcript.mediaSourceId);if(source?.visualEvidence)sourceIds.add(source.visualEvidence.parentSourceId);}
  return stable([...sourceIds].sort().map(id=>[id,sourceMediaIdentity(notebook.sources.find(source=>source.id===id))]));
}
function activityMediaEvidence(activity:StructuredActivity,notebook:Notebook):string {
  const ids=new Set(activity.sourceRefs.map(reference=>reference.sourceId));
  const visit=(value:unknown,key='',depth=0)=>{if(depth>20)return;if(/sourceId$/i.test(key)&&typeof value==='string')ids.add(value);if(/sourceIds$/i.test(key)&&Array.isArray(value))for(const id of value)if(typeof id==='string')ids.add(id);if(Array.isArray(value))value.forEach(child=>visit(child,'',depth+1));else if(value&&typeof value==='object')for(const [childKey,child] of Object.entries(value))visit(child,childKey,depth+1);};
  visit(activity);return mediaEvidence([...ids],notebook);
}

type SavedActivity = NonNullable<Progress['structured']>[string];
function withoutDraftCredit(entry: SavedActivity, clearChecked = false): SavedActivity {
  const { review: _review, reviewStartedAt: _started, ...rest } = entry;
  let response = entry.response;
  if (clearChecked && response && typeof response === 'object' && !Array.isArray(response)) {
    const value = response as Record<string, unknown>, draft = value._draft;
    if (draft && typeof draft === 'object' && !Array.isArray(draft)) response = { ...value, _draft: { ...draft, checked: false } };
  }
  if (!entry.completed && !entry.score && !entry.maxScore && !entry.review && !entry.reviewStartedAt && response === entry.response) return entry;
  return { ...rest, response, completed: false, score: 0, maxScore: 0 };
}

/** Migrate old advisory-review saves without erasing an unfinished draft or historical effort. */
export function reconcileReviewEligibility(notebook: Notebook, progress: Progress): Progress {
  if (notebook.id !== progress.notebookId) return progress;
  const eligible = new Set(notebook.cards.filter(card => canScoreRecallCard(card, notebook.sources)).map(card => card.id));
  const cards = Object.fromEntries(Object.entries(progress.cards).filter(([id]) => eligible.has(id)));
  const completedCardIds = progress.completedCardIds.filter(id => eligible.has(id));
  const drafts = new Set((notebook.activities ?? []).filter(activity => activity.reviewStatus === 'needs-review' || !currentActivityEvidence(activity, notebook)).map(activity => activity.id));
  let structuredChanged = false;
  const structured = progress.structured === undefined ? undefined : Object.fromEntries(Object.entries(progress.structured).map(([id, entry]) => {
    const next = drafts.has(id) ? withoutDraftCredit(entry) : entry;
    if (next !== entry) structuredChanged = true;
    return [id, next];
  }));
  const clearSession = !!progress.activeSession && progress.activeSession.cardIds.some(id => !eligible.has(id));
  if (!structuredChanged && Object.keys(cards).length === Object.keys(progress.cards).length && completedCardIds.length === progress.completedCardIds.length && !clearSession) return progress;
  const next: Progress = { ...progress, cards, completedCardIds, ...(structured === undefined ? {} : { structured }), mastery: Object.keys(cards).length ? Math.round(Object.values(cards).filter(card => card.lastCorrect).length / Object.keys(cards).length * 100) : 0, updatedAt: new Date().toISOString(), revision: Math.min(1_000_000, progress.revision + 1) };
  if (clearSession) delete next.activeSession;
  return next;
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
    return !!before && !!after && canScoreRecallCard(after, next.sources) && cardModel(before) === cardModel(after) && mediaEvidence([before.sourceId],previous) === mediaEvidence([after.sourceId],next);
  };
  const activityUnchanged = (id: string) => {
    const before = priorActivities.get(id), after = currentActivities.get(id);
    return !!before && !!after && !(before.reviewStatus === 'reviewed' && after.reviewStatus === 'needs-review') && currentActivityEvidence(after, next) && activityModel(before) === activityModel(after) && activityMediaEvidence(before,previous) === activityMediaEvidence(after,next);
  };
  const cards = Object.fromEntries(Object.entries(progress.cards).filter(([id]) => cardUnchanged(id)));
  const completedCardIds = progress.completedCardIds.filter(cardUnchanged);
  let upgraded = false;
  const structured = progress.structured === undefined ? undefined : Object.fromEntries(Object.entries(progress.structured).filter(([id]) => activityUnchanged(id)).map(([id, entry]) => {
    const isUpgrade = priorActivities.get(id)?.reviewStatus === 'needs-review' && currentActivities.get(id)?.reviewStatus === 'reviewed';
    const nextEntry = isUpgrade ? withoutDraftCredit(entry, true) : entry;
    if (nextEntry !== entry) upgraded = true;
    return [id, nextEntry];
  }));
  const clearSession = !!progress.activeSession && progress.activeSession.cardIds.some(id => !cardUnchanged(id));
  const changed = upgraded || Object.keys(cards).length !== Object.keys(progress.cards).length || completedCardIds.length !== progress.completedCardIds.length || Object.keys(structured ?? {}).length !== Object.keys(progress.structured ?? {}).length || clearSession;
  if (!changed) return reconcileReviewEligibility(next, progress);
  const revised: Progress = { ...progress, cards, completedCardIds, ...(structured === undefined ? {} : { structured }), mastery: Object.keys(cards).length ? Math.round(Object.values(cards).filter(card => card.lastCorrect).length / Object.keys(cards).length * 100) : 0, updatedAt: new Date().toISOString(), revision: progress.revision + 1 };
  if (clearSession) delete revised.activeSession;
  // attempts, XP, journal, sessions and historical streaks are deliberately preserved.
  return reconcileReviewEligibility(next, revised);
}
