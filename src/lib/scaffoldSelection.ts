import { SCAFFOLDS } from '../data/scaffolds';
import type { Notebook } from '../types';
import { hasCurrentCardEvidence } from './utils';
import { fitsSpecificContract, getScaffoldRuntimeDefinition, hasCurrentActivityEvidence, isReadyLearningSource } from './scaffoldRuntime';

/** Source-supported draft candidates, not permission to score unreviewed work.
 * Age changes presentation compatibility; titles and topic keywords never
 * establish a model, an answer key, or the rules of a simulation.
 */
export function sourceSupportedScaffoldIds(notebook: Notebook): string[] {
  const sources = notebook.sources.filter(source => isReadyLearningSource(source, notebook.sources));
  const hasRecall = notebook.cards.some(card => hasCurrentCardEvidence(card, sources));
  const activities = (notebook.activities ?? []).filter(activity => hasCurrentActivityEvidence(activity, notebook.sources));
  return SCAFFOLDS.filter(scaffold => {
    if (!scaffold.ages.includes(notebook.ageGroup)) return false;
    const runtime = getScaffoldRuntimeDefinition(scaffold.id);
    if (!runtime.engineReady) return false;
    if (runtime.mode === 'source-practice') return hasRecall;
    return activities.some(activity => activity.scaffoldIds?.includes(scaffold.id)
      && runtime.activityKinds.includes(activity.kind) && fitsSpecificContract(scaffold.id, activity));
  }).map(scaffold => scaffold.id);
}
