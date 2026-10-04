import type { Source } from '../types';
import type { Rule } from './structuredEngine';
import type { ScenarioActivity } from './scenarioEngine';
import { SCENARIO_EXAMPLES, SCENARIO_EXAMPLE_SOURCES } from './scenarioEngine';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const eq = (field: string, value: string | boolean | number): Rule => ({ op: 'eq', field, value });
const and = (...rules: Rule[]): Rule => ({ op: 'and', rules });
const predictionPassages = [...SCENARIO_EXAMPLE_SOURCES[0].text.split('\n\n'), 'Prediction rules for this authored case: a resolver fault predicts that the numeric-address test will pass while name lookup fails; a physical-link fault predicts that both will fail. Commit to a hypothesis before the numeric-address test or resolver inspection. After seeing the address test and resolver inspection, confirm or revise the hypothesis and review the outcome. Initial guesses are not scored. The successful address test and observed stale setting support the resolver hypothesis. Contrasting test results plus the setting distinguish the explanations; one passing test does not prove every network component is healthy.'];
const campaignPassages = SCENARIO_EXAMPLE_SOURCES[1].text.split('\n\n').map((text, index) => index === 0 ? text.replace('seven effort units and seven actions', 'eight effort units and eight actions') : text);
campaignPassages.push('This authored campaign has two cases. In the first, identify the original water mismatch and establish a water control. In the second, apply that control principle to a new pair of trays assessed through repeated observations. Preparing the new case costs zero effort, changes the case from original to new-pair, sets water unequal and the water-control flag false, and reveals the new-case briefing. The notebook evidence already establishes which variable must be controlled. Balance water again before the two repetitions. Balancing water can be used twice in the campaign. Repetitions and final assessment are available only in the new case. The campaign succeeds only when the new case reaches the supported conclusion with integrity intact.');
campaignPassages.push('Campaign planning and debrief rules: commit an ordered plan before acting in each case; revisions record either new evidence or remaining resource limits as their reason. The first debrief should identify unequal water as an alternative explanation, rather than treating the old height difference as causal proof. The final transfer debrief should explain that water was controlled in a changed case and conclusions remain limited to the reviewed observations. Repeating any comparison does not prove a universal claim. A stage debrief also requires that its focus observations have been collected.');
export const SCENARIO_MODE_SOURCES: Source[] = [
  { ...SCENARIO_EXAMPLE_SOURCES[0], id: 'scenario-prediction-rules', title: 'Reviewed network prediction case', text: predictionPassages.join('\n\n') },
  { ...SCENARIO_EXAMPLE_SOURCES[1], id: 'scenario-campaign-rules', title: 'Reviewed two-case control campaign', text: campaignPassages.join('\n\n') },
];
const prediction = copy(SCENARIO_EXAMPLES[0]);
prediction.scaffoldIds = ['competing-explanations', 'prediction-and-experiment', 'hypothesis-casebook'];
prediction.id = 'scenario-predict-observe-revise'; prediction.title = 'Predict, observe, then revise';
prediction.instruction = 'Commit to an explanation before investigating. Use what you observe to confirm or revise it, review the outcome, and restore the workstation.';
prediction.sourceRefs = predictionPassages.map(evidence => ({ sourceId: SCENARIO_MODE_SOURCES[0].id, evidence }));
prediction.scenarioPresentation = { prediction: {
  prompt: 'Which explanation do you currently expect the tests to support?', revisionPrompt: 'What does the discovered evidence support now? You can keep or change your original choice.', evidenceRefs: [7],
  hypotheses: [
    { id: 'resolver-fault', label: 'A resolver configuration fault', prediction: 'The service responds by numeric address while name lookup fails.', evidenceRefs: [7] },
    { id: 'link-fault', label: 'A physical connection fault', prediction: 'Neither numeric-address access nor name lookup will work.', evidenceRefs: [7] },
  ], beforeActionIds: ['test-address', 'inspect-resolver'], outcomeObservationIds: ['address-ok', 'resolver-stale'], acceptedFinalHypothesisIds: ['resolver-fault'],
  reviewPrompt: 'Why did these observations change or strengthen your explanation?',
  reviewChoices: [{ id: 'contrasting-evidence', label: 'The contrasting test results and stale setting distinguish the resolver explanation.', evidenceRefs: [7] }, { id: 'everything-proven', label: 'One passing test proves that every network component is healthy.', evidenceRefs: [7] }], acceptedReviewIds: ['contrasting-evidence'],
} };

const campaign = copy(SCENARIO_EXAMPLES[1]);
campaign.scaffoldIds = ['strategy-campaign', 'capstone-campaign'];
campaign.id = 'scenario-control-transfer-campaign'; campaign.title = 'A plan that survives a new case';
campaign.instruction = 'Plan an investigation, review its outcome, then apply the useful principle to a changed case. Revise plans explicitly when evidence or resource limits demand it.';
campaign.sourceRefs = campaignPassages.map(evidence => ({ sourceId: SCENARIO_MODE_SOURCES[1].id, evidence }));
campaign.budget.limit = 8; campaign.maxSteps = 8;
campaign.variables.push({ id: 'case', label: 'Current case', type: 'enum', initial: 'original', values: ['original', 'new-pair'], visibility: 'visible', evidenceRefs: [7] });
campaign.observations.push({ id: 'new-trays', label: 'A changed case', text: 'A new pair of trays requires repeated observations. Apply the water-control principle again before collecting data.', evidenceRefs: [7] });
const balance = campaign.actions.find(action => action.id === 'balance-water')!; balance.maxUses = 2; balance.guard = and(eq('inspected', true), eq('balanced', false)); balance.evidenceRefs.push(7);
for (const action of campaign.actions.filter(item => ['repeat-study', 'assess-study'].includes(item.id))) { action.guard = and(eq('case', 'new-pair'), action.guard!); action.evidenceRefs.push(7); }
campaign.actions.unshift({ id: 'prepare-transfer-case', label: 'Open the changed case', description: 'Move to a new pair of trays and apply the control principle under the new task.', cost: 0, maxUses: 1, guard: and(eq('case', 'original'), eq('balanced', true)), evidenceRefs: [7], transitions: [{ id: 'new-case', effects: [{ field: 'case', op: 'set', value: 'new-pair' }, { field: 'water', op: 'set', value: 'unequal' }, { field: 'balanced', op: 'set', value: false }], reveal: ['new-trays'], consequence: 'The changed case starts with unequal water. Transfer the control principle before collecting its repeated observations.', evidenceRefs: [7] }] });
campaign.successWhen = and(campaign.successWhen, eq('case', 'new-pair'));
campaign.objectives[0].when = campaign.successWhen; campaign.objectives[0].requiredObservations.push('new-trays'); campaign.objectives[0].evidenceRefs.push(7);
campaign.scenarioPresentation = { campaign: {
  planningPrompt: 'Choose an ordered plan that fits the remaining effort. You may revise it later, but record why.', evidenceRefs: [8],
  revisionReasons: [{ id: 'new-evidence', label: 'A new observation changes what I need to do next.', evidenceRefs: [8] }, { id: 'resource-limit', label: 'The remaining budget or action limit requires a different plan.', evidenceRefs: [8] }],
  stages: [
    { id: 'establish-control', title: 'Case 1 · Find the missing control', briefing: 'Investigate the original comparison and establish which treatment needs to be controlled.', actionIds: ['inspect-notebook', 'read-old-chart', 'balance-water'], completionWhen: and(eq('case', 'original'), eq('balanced', true)), focusObservationIds: ['water-mismatch', 'water-balanced'], transfer: false, changedContext: 'The initial comparison has a possible alternative explanation.', learningToTransfer: 'A difference in outcomes is not sufficient when another treatment differs.', evidenceRefs: [0, 1, 2, 8], debrief: { prompt: 'What did this case establish?', choices: [{ id: 'alternative-explanation', label: 'Unequal water creates an alternative explanation that must be controlled.', evidenceRefs: [8] }, { id: 'causal-proof', label: 'The original height difference already proves the effect of light.', evidenceRefs: [8] }], acceptedChoiceIds: ['alternative-explanation'], evidenceRefs: [8] } },
    { id: 'transfer-control', title: 'Case 2 · Transfer and test', briefing: 'Open the changed case, apply the useful control, collect two repetition records and assess the bounded conclusion.', actionIds: ['prepare-transfer-case', 'balance-water', 'repeat-study', 'assess-study', 'discard-data'], completionWhen: and(eq('case', 'new-pair'), eq('supported', true)), focusObservationIds: ['new-trays', 'trial-one', 'trial-two', 'bounded-conclusion'], transfer: true, changedContext: 'A new pair of trays now requires repeated observations rather than repair of the old comparison.', learningToTransfer: 'Hold the alternative treatment equal and limit the claim to the available observations.', evidenceRefs: [3, 4, 7, 8], debrief: { prompt: 'What transferred, and what is still limited?', choices: [{ id: 'bounded-transfer', label: 'I controlled water in a changed case; the conclusion remains limited to these reviewed observations.', evidenceRefs: [8] }, { id: 'universal-proof', label: 'Repeating any comparison proves a universal claim about all plants.', evidenceRefs: [8] }], acceptedChoiceIds: ['bounded-transfer'], evidenceRefs: [8] } },
  ],
} };

export const SCENARIO_PREDICTION_EXAMPLE = prediction;
export const SCENARIO_CAMPAIGN_EXAMPLE = campaign;
export const SCENARIO_MODE_EXAMPLES = [prediction, campaign];
