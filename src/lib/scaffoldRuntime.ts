import { getPictureBuildCapabilities } from './pictureBuildEngine';
import { SCAFFOLDS, scaffoldById } from '../data/scaffolds';
import type { StructuredActivity } from './structuredEngine';
import { getScenarioCapabilities } from './scenarioEngine';
import { getCompositionCapabilities } from './compositionEngine';
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
supported(['process-reconstruction', 'timeline-investigation', 'step-train', 'packet-path-inspector', 'infrastructure-change-planner'], ['sequence'], 'Play a reviewed dependency-constrained sequence. Every valid ordering is accepted; additional domain constraints must be represented explicitly.');
supported(['resource-allocation', 'plan-and-budget-expedition', 'cloud-cost-control'], ['budget'], 'Allocate real quantities within a prepared cost/capacity model. Prices and assumptions must be part of the reviewed source material.');
supported(['diagram-reconstruction'], ['diagram'], 'Place labels on reviewed targets. A source image can sit behind the targets, and the text equivalent remains available.');
supported(['review-studio'], ['rubric'], 'Review a prepared sample using an explicit rubric, or reflect without an automatic correctness grade.');
supported(['zero-trust-access-lab', 'ai-safety-response-lab', 'clinical-reasoning-casebook'], ['decision'], 'Apply an explicit bounded policy to a supplied case. This runs a prepared decision rule; it does not simulate a live system or establish professional competence.');
registry.set('recall-escape-mission', { scaffoldId: 'recall-escape-mission', activityKinds: [], engineReady: true, mode: 'source-practice', runtimeHint: 'Source-recall practice uses reviewed or extractive question cards and clearly identifies source recall. It does not substitute for a simulation or application case.' });

supported(['definition-building', 'missing-step-completion', 'database-query-lab'], ['completion'], 'Complete reviewed worked context or a prepared query using validated slots and accepted alternatives. Query completion uses authored fixtures; it does not execute arbitrary SQL.');
supported(['constrained-action-planning', 'version-control-recovery', 'product-tradeoff-council', 'fault-diagnosis', 'repair-challenge', 'branching-decisions', 'role-missions', 'scenario-internship', 'incident-response-command', 'kubernetes-recovery-room', 'debugger-detective'], ['scenario'], 'Investigate a reviewed finite scenario with guarded actions, resource costs, revealed observations and linked consequences. Outcomes are authored source-backed fixtures; no live cloud, code execution or AI system is simulated beyond those explicit rules.');
supported(['competing-explanations', 'prediction-and-experiment', 'experiment-predictor', 'hypothesis-casebook'], ['scenario'], 'Commit a prediction before revealing the reviewed test outcome, then revise the hypothesis and explain the evidence. Initial guesses are ungraded; commitments and revisions are saved in order.');
supported(['strategy-campaign', 'capstone-campaign'], ['scenario'], 'Plan a sequence of actions, revise it with an explicit reason, and debrief reviewed outcomes across two or three changed cases. The final stage applies learning to the new context.');
supported(['perspective-switching-drama', 'language-dialogue-trail', 'prompt-experiment-bench'], ['scenario'], 'Use prepared role perspectives and dialogue, or predict and compare supplied prompt/output variants against a rubric. These interfaces replay reviewed source material; they do not generate live conversations or infer new model outputs.');
supported(['puppet-stories', 'pretend-play-stations'], ['child-play'], 'Play a bounded, source-scripted paper stage with puppet turns, movable props, prepared consequences and optional supplied narration. Caregiver support stays visible in saved results.');
supported(['argument-construction', 'structured-teach-back', 'teach-a-character'], ['explanation'], 'Assemble prepared claim–evidence–reasoning chains, including reviewed valid alternatives. The model checks supplied components; unrestricted explanations remain self/human assessed.');
supported(['partner-helper'], ['explanation'], 'Construct and review a source-backed explanation through prepared partner turns, explicit device handoffs and saved revisions. Results describe collaborative performance.');
supported(['secure-code-review'], ['explanation'], 'Annotate exact supplied code spans, assemble the finding and select a prepared repair that fits the same reviewed alternative. Code remains inert source text.');
supported(['build-to-specification', 'systems-repair-workshop', 'constraint-design-workshop', 'prototype-studio', 'agent-workflow-studio', 'cloud-architecture-builder', 'data-pipeline-repair'], ['construction'], 'Construct a model from prepared components and typed ports, test resources and path constraints, and revise. Every valid solution is accepted; an author-checked witness confirms the stated constraints are solvable. Domain behavior must be represented explicitly.');
supported(['build-and-tell'], ['picture-build'], 'Move source-linked picture parts to satisfy explicit count, zone and spatial constraints, then tell a caregiver about the creation. The picture checks are deterministic; telling is a separate human-reviewed activity without independent-mastery scoring.');
supported(['chart-and-data-investigation', 'statistics-evidence-lab', 'model-evaluation-arena'], ['data'], 'Explore a verified dataset through a chart and equivalent table, filter observations and support quantitative findings with the correct records. Interpretation is limited to the reviewed data and stated assumptions.');
supported(['media-checkpoints'], ['media'], 'Play bundled audio/video with a timed source transcript, reviewed pause points and saved position/responses. The recording and transcript must be supplied by the author.');
supported(['discovery-scenes', 'word-and-picture-workshop'], ['picture'], 'Explore actual annotated source pictures with large controls, optional bundled narration and caregiver support. Regions and answer labels refer to source annotations; image meaning is not guessed by the engine.');
supported(['pattern-parade'], ['completion'], 'Extend a declared repeating cycle using prepared visual/text tokens. The engine checks that demonstrations and expected extensions agree with the explicit rule; it never infers a unique pattern from arbitrary examples.');
supported(['changing-rule-sorter'], ['rule-switch'], 'Sort the same source objects by two explicitly different attributes, commit the first round, then acknowledge the changed rule and regroup. Both attempts remain separate and saved.');

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
function fitsSpecificContract(scaffoldId: string, activity: StructuredActivity): boolean {
  if (['competing-explanations', 'prediction-and-experiment', 'experiment-predictor', 'hypothesis-casebook'].includes(scaffoldId)) return activity.kind === 'scenario' && getScenarioCapabilities(activity).includes('prediction');
  if (['strategy-campaign', 'capstone-campaign'].includes(scaffoldId)) return activity.kind === 'scenario' && getScenarioCapabilities(activity).includes('transfer-debrief');
  if (scaffoldId === 'perspective-switching-drama') return activity.kind === 'scenario' && getScenarioCapabilities(activity).includes('perspective');
  if (scaffoldId === 'language-dialogue-trail') return activity.kind === 'scenario' && getScenarioCapabilities(activity).includes('dialogue');
  if (scaffoldId === 'prompt-experiment-bench') return activity.kind === 'scenario' && getScenarioCapabilities(activity).includes('prompt-comparison');
  if (scaffoldId === 'partner-helper') return activity.kind === 'explanation' && getCompositionCapabilities(activity).partnerHelper;
  if (scaffoldId === 'secure-code-review') return activity.kind === 'explanation' && getCompositionCapabilities(activity).secureCodeReview;
  if (scaffoldId === 'build-and-tell') return activity.kind === 'picture-build' && getPictureBuildCapabilities(activity).buildAndTell;
  if (scaffoldId === 'puppet-stories') return activity.kind === 'child-play' && activity.mode === 'puppet-story';
  if (scaffoldId === 'pretend-play-stations') return activity.kind === 'child-play' && activity.mode === 'pretend-play';
  if (scaffoldId === 'pattern-parade') return activity.kind === 'completion' && Boolean(activity.pattern);
  if (scaffoldId === 'discovery-scenes') return activity.kind === 'picture' && activity.mode === 'discovery';
  if (scaffoldId === 'word-and-picture-workshop') return activity.kind === 'picture' && activity.mode === 'word-picture';
  return true;
}
export function resolveScaffoldRuntime(scaffoldId: string, notebook: Pick<Notebook, 'activities' | 'cards' | 'ageGroup'>): ScaffoldRuntimeEligibility {
  const definition = getScaffoldRuntimeDefinition(scaffoldId), scaffold = scaffoldById(scaffoldId);
  const base = { ...definition, available: false, activityIds: [], requiresAuthorBinding: definition.mode === 'structured' };
  if (!scaffold) return { ...base, reason: definition.runtimeHint };
  if (!scaffold.ages.includes(notebook.ageGroup)) return { ...base, reason: `This recipe is not configured for the notebook’s age setting. Choose a compatible recipe or adjust the audience in the studio. ${definition.runtimeHint}` };
  if (!definition.engineReady) return { ...base, reason: definition.runtimeHint };
  if (definition.mode === 'source-practice') return { ...base, available: notebook.cards.length > 0, requiresAuthorBinding: false, reason: notebook.cards.length ? 'Source-recall cards are ready.' : 'Add source-recall cards before starting this practice mode.' };
  const bound = (notebook.activities ?? []).filter(activity => activity.scaffoldIds?.includes(scaffoldId) && definition.activityKinds.includes(activity.kind) && fitsSpecificContract(scaffoldId, activity));
  const reviewed = bound.filter(activity => activity.reviewStatus === 'reviewed');
  if (!reviewed.length) return { ...base, reason: bound.length ? 'A suitable activity is linked, but its answers and evidence still need author review.' : `Build or import a suitable ${definition.activityKinds.join(' / ')} activity, link it to this recipe and review its content. A recipe name alone does not prepare its learning model.` };
  return { ...base, available: true, activityIds: reviewed.map(activity => activity.id), reason: `${reviewed.length} author-reviewed ${reviewed.length === 1 ? 'activity is' : 'activities are'} ready for this recipe.` };
}
export const getScaffoldRuntime = resolveScaffoldRuntime;
