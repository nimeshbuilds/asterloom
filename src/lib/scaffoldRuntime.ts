import { getPictureBuildCapabilities } from './pictureBuildEngine';
import { SCAFFOLDS, scaffoldById } from '../data/scaffolds';
import {validateActivity,type StructuredActivity} from './structuredEngine';
import {canScoreRecallCard} from './utils';
import {hasLearningContentQuote} from './sourceContent';
import {validateMediaTranscript} from './mediaTranscript';
import {sourceMediaIdentity} from './mediaAssets';
import {validateVisualEvidenceSource} from './visualEvidence';
import { getScenarioCapabilities } from './scenarioEngine';
import { getCompositionCapabilities } from './compositionEngine';
import type { Notebook,Source } from '../types';

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
/** Additional model data required by a recipe, shared by authoring and playback.
 * Engine kind alone does not implement a specialized presentation or protocol. */
export type ScaffoldCapability = 'scenario:prediction'|'scenario:transfer-debrief'|'scenario:perspective'|'scenario:dialogue'|'scenario:prompt-comparison'|'explanation:partner'|'explanation:code-review'|'picture-build:build-and-tell'|'child-play:puppet-story'|'child-play:pretend-play'|'completion:pattern'|'picture:discovery'|'picture:word-picture';
const requiredCapabilities:Readonly<Record<string,readonly ScaffoldCapability[]>>={
 'competing-explanations':['scenario:prediction'],'prediction-and-experiment':['scenario:prediction'],'experiment-predictor':['scenario:prediction'],'hypothesis-casebook':['scenario:prediction'],
 'strategy-campaign':['scenario:transfer-debrief'],'capstone-campaign':['scenario:transfer-debrief'],
 'perspective-switching-drama':['scenario:perspective'],'language-dialogue-trail':['scenario:dialogue'],'prompt-experiment-bench':['scenario:prompt-comparison'],
 'partner-helper':['explanation:partner'],'secure-code-review':['explanation:code-review'],
 'build-and-tell':['picture-build:build-and-tell'],'puppet-stories':['child-play:puppet-story'],'pretend-play-stations':['child-play:pretend-play'],
 'pattern-parade':['completion:pattern'],'discovery-scenes':['picture:discovery'],'word-and-picture-workshop':['picture:word-picture'],
};
export function scaffoldRequiredCapabilities(scaffoldId:string):readonly ScaffoldCapability[]{return requiredCapabilities[scaffoldId]??[];}
function suppliesCapability(activity:StructuredActivity,capability:ScaffoldCapability):boolean{
 switch(capability){
  case 'scenario:prediction':return activity.kind==='scenario'&&getScenarioCapabilities(activity).includes('prediction');
  case 'scenario:transfer-debrief':return activity.kind==='scenario'&&getScenarioCapabilities(activity).includes('transfer-debrief');
  case 'scenario:perspective':return activity.kind==='scenario'&&getScenarioCapabilities(activity).includes('perspective');
  case 'scenario:dialogue':return activity.kind==='scenario'&&getScenarioCapabilities(activity).includes('dialogue');
  case 'scenario:prompt-comparison':return activity.kind==='scenario'&&getScenarioCapabilities(activity).includes('prompt-comparison');
  case 'explanation:partner':return activity.kind==='explanation'&&getCompositionCapabilities(activity).partnerHelper;
  case 'explanation:code-review':return activity.kind==='explanation'&&getCompositionCapabilities(activity).secureCodeReview;
  case 'picture-build:build-and-tell':return activity.kind==='picture-build'&&getPictureBuildCapabilities(activity).buildAndTell;
  case 'child-play:puppet-story':return activity.kind==='child-play'&&activity.mode==='puppet-story';
  case 'child-play:pretend-play':return activity.kind==='child-play'&&activity.mode==='pretend-play';
  case 'completion:pattern':return activity.kind==='completion'&&Boolean(activity.pattern);
  case 'picture:discovery':return activity.kind==='picture'&&activity.mode==='discovery';
  case 'picture:word-picture':return activity.kind==='picture'&&activity.mode==='word-picture';
 }
}
export function fitsSpecificContract(scaffoldId: string, activity: StructuredActivity): boolean {
 return scaffoldRequiredCapabilities(scaffoldId).every(capability=>suppliesCapability(activity,capability));
}
/** Readiness and byte/text provenance, never a test of semantic entailment. */
export function isReadyLearningSource(source:Source|undefined,sources:Source[]):boolean {
  if(!source||source.status!=='ready'||!source.text.trim())return false;
  try {
    if(source.transcript){
      validateMediaTranscript(source.transcript,source.text,sources);
      const recording=sources.find(item=>item.id===source.transcript!.mediaSourceId);
      if(sourceMediaIdentity(recording)!==`bytes:${source.transcript.mediaRevision}`)return false;
    }
    if(source.visualEvidence&&(source.visualEvidence.reviewStatus!=='reviewed'||validateVisualEvidenceSource(source,sources).length))return false;
    return true;
  }catch{return false;}
}
/** A draft may have current evidence without having an author-approved answer model. */
export function hasCurrentActivityEvidence(activity:StructuredActivity,sources:Source[]):boolean {
  if(!Array.isArray(sources)||!validateActivity(activity,sources).success)return false;
  const ready=new Map<string,boolean>();
  return activity.sourceRefs.every(reference=>{
    const source=sources.find(item=>item.id===reference.sourceId);
    if(!source||!reference.evidence.trim()||!hasLearningContentQuote(source.text,reference.evidence))return false;
    if(!ready.has(source.id))ready.set(source.id,isReadyLearningSource(source,sources));
    return ready.get(source.id)===true;
  });
}
export function resolveScaffoldRuntime(scaffoldId: string, notebook: Pick<Notebook, 'activities' | 'cards' | 'ageGroup' | 'sources'>): ScaffoldRuntimeEligibility {
  const definition = getScaffoldRuntimeDefinition(scaffoldId), scaffold = scaffoldById(scaffoldId);
  const base = { ...definition, available: false, activityIds: [], requiresAuthorBinding: definition.mode === 'structured' };
  if (!scaffold) return { ...base, reason: definition.runtimeHint };
  if (!scaffold.ages.includes(notebook.ageGroup)) return { ...base, reason: `This recipe is not configured for the notebook’s age setting. Choose a compatible recipe or adjust the audience in the studio. ${definition.runtimeHint}` };
  if (!definition.engineReady) return { ...base, reason: definition.runtimeHint };
  const sources=Array.isArray(notebook.sources)?notebook.sources:[];
  if (definition.mode === 'source-practice') {
    const ready = notebook.cards.filter(card => canScoreRecallCard(card,sources)&&isReadyLearningSource(sources.find(source=>source.id===card.sourceId),sources)).length;
    return { ...base, available: ready > 0, requiresAuthorBinding: false, reason: ready ? `${ready} source-recall ${ready === 1 ? 'card is' : 'cards are'} ready. Draft questions stay out of scored sessions.` : notebook.cards.length ? 'These recall questions need ready source material, current exact evidence and author review of pending drafts before scored play.' : 'Add source-recall cards before starting this practice mode.' };
  }
  const bound = (notebook.activities ?? []).filter(activity => activity.scaffoldIds?.includes(scaffoldId) && definition.activityKinds.includes(activity.kind) && fitsSpecificContract(scaffoldId, activity));
  const grounded=bound.filter(activity=>hasCurrentActivityEvidence(activity,sources));
  const reviewed = grounded.filter(activity => activity.reviewStatus === 'reviewed');
  if (!reviewed.length) return { ...base, reason: grounded.length ? 'A suitable activity is linked, but its answers and evidence still need author review.' : bound.length ? 'This activity’s source evidence is missing, changed or not ready. Repair its materials and model before selecting it for learning.' : `Build or import a suitable ${definition.activityKinds.join(' / ')} activity, link it to this recipe and review its content. A recipe name alone does not prepare its learning model.` };
  return { ...base, available: true, activityIds: reviewed.map(activity => activity.id), reason: `${reviewed.length} author-reviewed ${reviewed.length === 1 ? 'activity is' : 'activities are'} linked to current source evidence. Exact citations do not replace content review.` };
}
export const getScaffoldRuntime = resolveScaffoldRuntime;
