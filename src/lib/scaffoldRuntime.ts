import { SCAFFOLDS, scaffoldById } from '../data/scaffolds';
import type { StructuredActivity } from './structuredEngine';
import type { Notebook } from '../types';

export interface ScaffoldRuntimeDefinition {
  scaffoldId: string;
  activityKinds: StructuredActivity['kind'][];
  engineReady: boolean;
  runtimeHint: string;
  mode: 'structured' | 'source-practice' | 'needs-model';
}
export interface ScaffoldRuntimeEligibility extends ScaffoldRuntimeDefinition {
  available: boolean;
  activityIds: string[];
  reason: string;
  requiresAuthorBinding: boolean;
}
const registry = new Map<string, ScaffoldRuntimeDefinition>();
function supported(ids: string[], kinds: StructuredActivity['kind'][], runtimeHint: string) {
  ids.forEach(scaffoldId => registry.set(scaffoldId, { scaffoldId, activityKinds: kinds, engineReady: true, mode: 'structured', runtimeHint }));
}
function pending(ids: string[], kinds: StructuredActivity['kind'][], runtimeHint: string) {
  ids.forEach(scaffoldId => registry.set(scaffoldId, { scaffoldId, activityKinds: kinds, engineReady: false, mode: 'needs-model', runtimeHint }));
}
// A primitive match only establishes technical compatibility. The author must explicitly
// bind and review a suitable activity. Titles, keywords or an AI guess never establish it.
supported(['concept-map-repair', 'analogy-construction', 'evidence-investigation', 'clue-map', 'evidence-detective', 'claim-and-evidence-arena', 'research-dossier', 'threat-model-canvas', 'distributed-systems-trace', 'api-contract-workshop'], ['dependency'], 'Play an author-reviewed relationship model with explicit nodes, labeled links and source evidence. The author must check that the model fulfills this recipe’s learning objective.');
supported(['classification-workshop', 'comparison-puzzle', 'claim-verification', 'retrieval-quality-lab', 'test-design-studio'], ['classification'], 'Play a reviewed classification model with explicit categories and memberships. Source-recall pairs do not establish a classification rule.');
supported(['process-reconstruction', 'constrained-action-planning', 'timeline-investigation', 'step-train', 'packet-path-inspector', 'infrastructure-change-planner', 'version-control-recovery'], ['sequence'], 'Play a reviewed dependency-constrained sequence. Every valid ordering is accepted; additional domain constraints must be represented explicitly.');
supported(['resource-allocation', 'plan-and-budget-expedition', 'cloud-cost-control'], ['budget'], 'Allocate real quantities within a prepared cost/capacity model. Prices and assumptions must be part of the reviewed source material.');
supported(['diagram-reconstruction'], ['diagram'], 'Place labels on reviewed targets. A source image can sit behind the targets, and the text equivalent remains available.');
supported(['review-studio'], ['rubric'], 'Review a prepared sample using an explicit rubric, or reflect without an automatic correctness grade.');
supported(['zero-trust-access-lab', 'ai-safety-response-lab', 'product-tradeoff-council', 'clinical-reasoning-casebook'], ['decision'], 'Apply an explicit bounded policy to a supplied case. This runs a prepared decision rule; it does not simulate a live system or establish professional competence.');
registry.set('recall-escape-mission', { scaffoldId: 'recall-escape-mission', activityKinds: [], engineReady: true, mode: 'source-practice', runtimeHint: 'Source-recall practice uses reviewed or extractive question cards and clearly identifies source recall. It does not substitute for a simulation or application case.' });

pending(['definition-building', 'missing-step-completion', 'database-query-lab'], [], 'Needs a prepared completion model with validated slots, accepted alternatives and meaningful context. Ordinary recall cards do not implement this recipe.');
pending(['fault-diagnosis', 'repair-challenge', 'competing-explanations', 'branching-decisions', 'role-missions', 'prediction-and-experiment', 'puppet-stories', 'experiment-predictor', 'hypothesis-casebook', 'perspective-switching-drama', 'strategy-campaign', 'scenario-internship', 'capstone-campaign', 'incident-response-command', 'prompt-experiment-bench', 'kubernetes-recovery-room', 'debugger-detective', 'language-dialogue-trail'], ['decision'], 'Needs authored state transitions, revealable evidence or linked consequences beyond a single policy decision. The current decision board must not be presented as this complete recipe.');
pending(['argument-construction', 'structured-teach-back', 'partner-helper', 'teach-a-character', 'secure-code-review'], ['rubric'], 'Needs prepared explanation/argument components or turn-based teaching actions. Reviewing a rubric alone does not implement this recipe.');
pending(['build-to-specification', 'build-and-tell', 'systems-repair-workshop', 'constraint-design-workshop', 'prototype-studio', 'agent-workflow-studio', 'cloud-architecture-builder', 'data-pipeline-repair'], ['dependency', 'diagram'], 'Needs a construction model with explicit requirement tests and state changes. Label placement or matching a fixed graph alone is not equivalent to building and testing a solution.');
pending(['chart-and-data-investigation', 'statistics-evidence-lab', 'model-evaluation-arena'], [], 'Needs a verified dataset, a usable chart/table and validated quantitative/inference checks. A source-recall question does not establish this investigation.');
pending(['media-checkpoints'], [], 'Needs timestamped playable media, transcript controls and reviewed checkpoint timing. An elapsed-session timer does not implement media checkpoints.');
pending(['discovery-scenes', 'pretend-play-stations', 'word-and-picture-workshop'], ['classification', 'diagram'], 'Needs source-appropriate images, child-accessible interaction and narration/caregiver support. Text classification alone does not implement this picture-based recipe.');
pending(['pattern-parade'], ['sequence'], 'Needs an explicit visual or auditory pattern rule plus rebuild/extension checks. A generic ordered list does not establish the pattern rule.');
pending(['changing-rule-sorter'], ['classification'], 'Needs two reviewed category rules and an explicit rule-change round. A single classification board is insufficient.');

/** Exhaustive registry: unknown/new recipes stay unavailable until their contract is defined. */
export const SCAFFOLD_RUNTIME: ScaffoldRuntimeDefinition[] = SCAFFOLDS.map(scaffold => registry.get(scaffold.id) ?? {
  scaffoldId: scaffold.id, activityKinds: [], engineReady: false, mode: 'needs-model', runtimeHint: 'This recipe needs a prepared content model and a verified runtime contract before it can be played.',
});
export function getScaffoldRuntimeDefinition(scaffoldId: string): ScaffoldRuntimeDefinition {
  return SCAFFOLD_RUNTIME.find(item => item.scaffoldId === scaffoldId) ?? { scaffoldId, activityKinds: [], engineReady: false, mode: 'needs-model', runtimeHint: 'Unknown recipe. Import a supported definition and review its runtime contract first.' };
}
export function compatibleScaffoldsForActivity(activity: Pick<StructuredActivity, 'kind'>) {
  return SCAFFOLDS.filter(scaffold => { const runtime = getScaffoldRuntimeDefinition(scaffold.id); return runtime.engineReady && runtime.mode === 'structured' && runtime.activityKinds.includes(activity.kind); });
}
export function resolveScaffoldRuntime(scaffoldId: string, notebook: Pick<Notebook, 'activities' | 'cards' | 'ageGroup'>): ScaffoldRuntimeEligibility {
  const definition = getScaffoldRuntimeDefinition(scaffoldId), scaffold = scaffoldById(scaffoldId);
  const base = { ...definition, available: false, activityIds: [], requiresAuthorBinding: definition.mode === 'structured' };
  if (!scaffold) return { ...base, reason: definition.runtimeHint };
  if (!scaffold.ages.includes(notebook.ageGroup)) return { ...base, reason: `This recipe is not configured for the notebook’s age setting. Choose a compatible recipe or adjust the audience in the studio. ${definition.runtimeHint}` };
  if (!definition.engineReady) return { ...base, reason: definition.runtimeHint };
  if (definition.mode === 'source-practice') return { ...base, available: notebook.cards.length > 0, requiresAuthorBinding: false, reason: notebook.cards.length ? 'Source-recall cards are ready.' : 'Add source-recall cards before starting this practice mode.' };
  const bound = (notebook.activities ?? []).filter(activity => activity.scaffoldIds?.includes(scaffoldId) && definition.activityKinds.includes(activity.kind));
  const reviewed = bound.filter(activity => activity.reviewStatus === 'reviewed');
  if (!reviewed.length) return { ...base, reason: bound.length ? 'A suitable activity is linked, but its answers and evidence still need author review.' : `Build or import a suitable ${definition.activityKinds.join(' / ')} activity, link it to this recipe and review its content. A recipe name alone does not prepare its learning model.` };
  return { ...base, available: true, activityIds: reviewed.map(activity => activity.id), reason: `${reviewed.length} author-reviewed ${reviewed.length === 1 ? 'activity is' : 'activities are'} ready for this recipe.` };
}
export const getScaffoldRuntime = resolveScaffoldRuntime;
