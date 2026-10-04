import { applyScenarioInteractionCommitment, createScenarioInteractionState, interactionCommitmentFields, scenarioInteractionActionProblem, scenarioInteractionDetails, validateScenarioInteractions } from './scenarioInteractions';
import type { ScenarioDialogueContract, ScenarioPromptContract, ScenarioInteractionCommitment } from './scenarioInteractions';
import type { Rule } from './structuredEngine';
import type { ScenarioActivity, ScenarioResponse, ScenarioSnapshot, ScenarioValue } from './scenarioEngine';

interface Cited { evidenceRefs: number[] }
export interface ScenarioReviewChoice extends Cited { id: string; label: string }
export interface ScenarioPredictionContract extends Cited {
  prompt: string; revisionPrompt: string;
  hypotheses: (ScenarioReviewChoice & { prediction: string })[];
  beforeActionIds: string[]; outcomeObservationIds: string[];
  acceptedFinalHypothesisIds: string[];
  reviewPrompt: string; reviewChoices: ScenarioReviewChoice[]; acceptedReviewIds: string[];
}
export interface ScenarioCampaignStage extends Cited {
  id: string; title: string; briefing: string; actionIds: string[];
  completionWhen: Rule; focusObservationIds: string[];
  transfer: boolean; changedContext: string; learningToTransfer: string;
  debrief: Cited & { prompt: string; choices: ScenarioReviewChoice[]; acceptedChoiceIds: string[] };
}
export interface ScenarioCampaignContract extends Cited {
  planningPrompt: string; revisionReasons: ScenarioReviewChoice[];
  stages: ScenarioCampaignStage[];
}
export interface ScenarioPresentation { prediction?: ScenarioPredictionContract; campaign?: ScenarioCampaignContract; dialogue?: ScenarioDialogueContract; promptComparison?: ScenarioPromptContract }
export type ScenarioCommitment = { atStep: number } & (
  | { type: 'prediction' | 'hypothesis-revision' | 'outcome-review'; choiceId: string }
  | { type: 'plan' | 'plan-revision'; stageId: string; actionIds: string[]; reasonId?: string }
  | { type: 'debrief'; stageId: string; choiceId: string }
  | ScenarioInteractionCommitment
);
export type ScenarioCommitmentInput = ScenarioCommitment extends infer C ? C extends ScenarioCommitment ? Omit<C, 'atStep'> : never : never;
export interface ScenarioModeDraft { hypothesisId?: string; reviewId?: string; stageId?: string; plannedActionIds?: string[]; planActionId?: string; revisionReasonId?: string; debriefChoiceId?: string }
export interface ScenarioPredictionState {
  initialChoiceId?: string; finalChoiceId?: string; reviewId?: string;
  history: { type: 'prediction' | 'hypothesis-revision' | 'outcome-review'; choiceId: string; atStep: number }[];
}
export interface ScenarioCampaignState {
  stageIndex: number; completedStageIds: string[];
  plans: { stageId: string; actionIds: string[]; reasonId?: string; atStep: number; executed: number }[];
  debriefs: { stageId: string; choiceId: string; accepted: boolean; atStep: number }[];
}
type Condition = (rule: Rule, state: Record<string, ScenarioValue>) => boolean;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['constructor', '__proto__', 'prototype'].includes(v);
function boundedText(v: unknown, path: string, errors: string[], max = 2000) { if (typeof v !== 'string' || !v.trim() || v.length > max) errors.push(`${path}: expected non-empty text up to ${max} characters.`); }
function fields(v: Record<string, unknown>, allowed: string[], path: string, errors: string[]) { for (const key of Object.keys(v)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field.`); }
function list(v: unknown, path: string, errors: string[], min = 1, max = 8): unknown[] { if (!Array.isArray(v) || v.length < min || v.length > max) { errors.push(`${path}: expected ${min}–${max} entries.`); return []; } return v; }
function refs(v: unknown, count: number, path: string, errors: string[]) { const values = list(v, path, errors, 1, 12); if (values.some(index => !Number.isInteger(index) || (index as number) < 0 || (index as number) >= count) || new Set(values).size !== values.length) errors.push(`${path}: invalid or duplicate source reference.`); }
function referenceIds(v: unknown, known: Set<unknown>, path: string, errors: string[], min = 1, max = 16) { const values = list(v, path, errors, min, max); if (values.some(id => !safeId(id) || !known.has(id)) || new Set(values).size !== values.length) errors.push(`${path}: unknown or duplicate identifier.`); }
function choices(v: unknown, path: string, errors: string[], count: number, prediction = false) {
  const values = list(v, path, errors, 2, 6), known = new Set<unknown>();
  values.forEach((item, index) => {
    if (!object(item)) { errors.push(`${path}[${index}]: expected a choice.`); return; }
    fields(item, ['id', 'label', 'evidenceRefs', ...(prediction ? ['prediction'] : [])], `${path}[${index}]`, errors);
    if (!safeId(item.id) || known.has(item.id)) errors.push(`${path}[${index}]: invalid or duplicate choice identifier.`);
    known.add(item.id); boundedText(item.label, `${path}[${index}].label`, errors, 500); refs(item.evidenceRefs, count, `${path}[${index}].evidenceRefs`, errors);
    if (prediction) boundedText(item.prediction, `${path}[${index}].prediction`, errors);
  }); return known;
}

export function validateScenarioPresentation(input: Record<string, unknown>, validateCondition: (rule: unknown, path: string, errors: string[]) => void): string[] {
  if (input.scenarioPresentation === undefined) return [];
  const errors: string[] = [], spec = input.scenarioPresentation;
  if (!object(spec)) return ['scenarioPresentation: expected an object.'];
  fields(spec, ['prediction', 'campaign', 'dialogue', 'promptComparison'], 'scenarioPresentation', errors);
  if (!spec.prediction && !spec.campaign && !spec.dialogue && !spec.promptComparison) errors.push('scenarioPresentation: add an implemented mode or omit the field.');
  const count = Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0;
  const actionIds = new Set(Array.isArray(input.actions) ? input.actions.filter(object).map(action => action.id) : []);
  const observationIds = new Set(Array.isArray(input.observations) ? input.observations.filter(object).map(observation => observation.id) : []);
  if (spec.prediction !== undefined) {
    const p = spec.prediction, path = 'scenarioPresentation.prediction';
    if (!object(p)) errors.push(`${path}: expected a prediction contract.`);
    else {
      fields(p, ['prompt', 'revisionPrompt', 'hypotheses', 'beforeActionIds', 'outcomeObservationIds', 'acceptedFinalHypothesisIds', 'reviewPrompt', 'reviewChoices', 'acceptedReviewIds', 'evidenceRefs'], path, errors);
      for (const key of ['prompt', 'revisionPrompt', 'reviewPrompt']) boundedText(p[key], `${path}.${key}`, errors);
      refs(p.evidenceRefs, count, `${path}.evidenceRefs`, errors);
      const hypotheses = choices(p.hypotheses, `${path}.hypotheses`, errors, count, true), reviews = choices(p.reviewChoices, `${path}.reviewChoices`, errors, count);
      referenceIds(p.beforeActionIds, actionIds, `${path}.beforeActionIds`, errors);
      referenceIds(p.outcomeObservationIds, observationIds, `${path}.outcomeObservationIds`, errors, 1, 8);
      referenceIds(p.acceptedFinalHypothesisIds, hypotheses, `${path}.acceptedFinalHypothesisIds`, errors, 1, 6);
      referenceIds(p.acceptedReviewIds, reviews, `${path}.acceptedReviewIds`, errors, 1, 6);
      // Every route to a review outcome must require the initial prediction;
      // otherwise a learner could inspect the answer and commit afterwards.
      if (Array.isArray(input.actions) && Array.isArray(p.beforeActionIds) && Array.isArray(p.outcomeObservationIds)) {
        const guarded = p.beforeActionIds, outcomes = p.outcomeObservationIds;
        for (const action of input.actions.filter(object)) if (Array.isArray(action.transitions) && action.transitions.filter(object).some(transition => Array.isArray(transition.reveal) && transition.reveal.some(id => outcomes.includes(id))) && !guarded.includes(action.id)) errors.push(`${path}.beforeActionIds: every action revealing an outcome must be guarded (${String(action.id)}).`);
      }
      const initialIds = input.initialObservationIds;
      if (Array.isArray(p.outcomeObservationIds) && Array.isArray(initialIds) && p.outcomeObservationIds.every(id => initialIds.includes(id))) errors.push(`${path}: at least one reviewed outcome must be discovered after committing a prediction.`);
    }
  }
  if (spec.campaign !== undefined) {
    const c = spec.campaign, path = 'scenarioPresentation.campaign';
    if (!object(c)) errors.push(`${path}: expected a campaign contract.`);
    else {
      fields(c, ['planningPrompt', 'revisionReasons', 'stages', 'evidenceRefs'], path, errors); boundedText(c.planningPrompt, `${path}.planningPrompt`, errors); refs(c.evidenceRefs, count, `${path}.evidenceRefs`, errors);
      choices(c.revisionReasons, `${path}.revisionReasons`, errors, count);
      const stages = list(c.stages, `${path}.stages`, errors, 2, 3), seen = new Set<unknown>();
      stages.forEach((stage, i) => {
        const field = `${path}.stages[${i}]`;
        if (!object(stage)) { errors.push(`${field}: expected a campaign stage.`); return; }
        fields(stage, ['id', 'title', 'briefing', 'actionIds', 'completionWhen', 'focusObservationIds', 'transfer', 'changedContext', 'learningToTransfer', 'debrief', 'evidenceRefs'], field, errors);
        if (!safeId(stage.id) || seen.has(stage.id)) errors.push(`${field}.id: invalid or duplicate stage identifier.`); seen.add(stage.id);
        for (const key of ['title', 'briefing', 'changedContext', 'learningToTransfer']) boundedText(stage[key], `${field}.${key}`, errors);
        if (typeof stage.transfer !== 'boolean') errors.push(`${field}.transfer: expected a boolean.`);
        if (i === stages.length - 1 && stage.transfer !== true) errors.push(`${field}: the final stage must explicitly apply learning in a changed context.`);
        refs(stage.evidenceRefs, count, `${field}.evidenceRefs`, errors); referenceIds(stage.actionIds, actionIds, `${field}.actionIds`, errors);
        referenceIds(stage.focusObservationIds, observationIds, `${field}.focusObservationIds`, errors, 1, 8);
        validateCondition(stage.completionWhen, `${field}.completionWhen`, errors);
        if (!object(stage.debrief)) errors.push(`${field}.debrief: expected a reviewed debrief.`);
        else {
          fields(stage.debrief, ['prompt', 'choices', 'acceptedChoiceIds', 'evidenceRefs'], `${field}.debrief`, errors); boundedText(stage.debrief.prompt, `${field}.debrief.prompt`, errors); refs(stage.debrief.evidenceRefs, count, `${field}.debrief.evidenceRefs`, errors);
          const known = choices(stage.debrief.choices, `${field}.debrief.choices`, errors, count);
          referenceIds(stage.debrief.acceptedChoiceIds, known, `${field}.debrief.acceptedChoiceIds`, errors, 1, 6);
        }
      });
    }
  }
  errors.push(...validateScenarioInteractions(input, validateCondition));
  return errors;
}

export function validateScenarioCommitments(activity: ScenarioActivity, response: Record<string, unknown>): string | undefined {
  const entries = response.commitments ?? [];
  if (!Array.isArray(entries) || entries.length > 48) return 'The case contains too many commitment records.';
  if (entries.length && !activity.scenarioPresentation) return 'This case does not define prediction or campaign commitments.';
  let lastStep = -1;
  for (const entry of entries) {
    if (!object(entry) || !Number.isInteger(entry.atStep) || (entry.atStep as number) < lastStep || (entry.atStep as number) < 0 || (entry.atStep as number) > (response.actions as unknown[]).length) return 'Commitments must follow the saved decision chronology.';
    lastStep = entry.atStep as number;
    const allowed = ['type', 'atStep'];
    if (['prediction', 'hypothesis-revision', 'outcome-review'].includes(String(entry.type))) {
      allowed.push('choiceId'); if (!safeId(entry.choiceId)) return 'A prediction commitment has an invalid choice.';
    } else if (entry.type === 'plan' || entry.type === 'plan-revision') {
      allowed.push('stageId', 'actionIds', 'reasonId');
      if (!safeId(entry.stageId) || !Array.isArray(entry.actionIds) || entry.actionIds.length < 1 || entry.actionIds.length > 6 || entry.actionIds.some(id => !safeId(id))) return 'A campaign plan must contain one to six known actions.';
      if (entry.type === 'plan-revision' && !safeId(entry.reasonId) || entry.reasonId !== undefined && !safeId(entry.reasonId)) return 'A plan revision needs a reviewed reason.';
    } else if (entry.type === 'debrief') { allowed.push('stageId', 'choiceId'); if (!safeId(entry.stageId) || !safeId(entry.choiceId)) return 'A campaign debrief has an invalid selection.'; }
    else { const interactionFields = interactionCommitmentFields(entry); if (!interactionFields?.length) return 'This commitment type is unsupported or its identifiers are invalid.'; allowed.push(...interactionFields); }
    if (Object.keys(entry).some(key => !allowed.includes(key))) return 'A commitment contains unknown fields.';
  }
  const draft = response.modeDraft;
  if (draft !== undefined) {
    if (!object(draft) || Object.keys(draft).some(key => !['hypothesisId', 'reviewId', 'stageId', 'plannedActionIds', 'planActionId', 'revisionReasonId', 'debriefChoiceId'].includes(key))) return 'The saved mode draft is invalid.';
    for (const [key, value] of Object.entries(draft)) {
      if (key === 'plannedActionIds') { if (!Array.isArray(value) || value.length > 6 || value.some(id => !activity.actions.some(action => action.id === id))) return 'The saved plan draft contains an unknown action.'; }
      else if (typeof value !== 'string' || value && !safeId(value)) return 'The saved mode selection is invalid.';
    }
  }
  try { if (JSON.stringify(response).length > 9500) return 'The saved case exceeds its portable progress size limit. Start a fresh run.'; }
  catch { return 'The saved case must contain plain serializable progress data.'; }
  return undefined;
}
export function createScenarioModeState(activity: ScenarioActivity): Pick<ScenarioSnapshot, 'prediction' | 'campaign' | 'dialogue' | 'promptComparison'> {
  return { ...createScenarioInteractionState(activity), ...(activity.scenarioPresentation?.prediction ? { prediction: { history: [] } } : {}), ...(activity.scenarioPresentation?.campaign ? { campaign: { stageIndex: 0, completedStageIds: [], plans: [], debriefs: [] } } : {}) };
}
export function predictionOutcomesReady(activity: ScenarioActivity, snapshot: ScenarioSnapshot): boolean { return !!activity.scenarioPresentation?.prediction?.outcomeObservationIds.every(id => snapshot.observationIds.includes(id)); }
export function currentCampaignStage(activity: ScenarioActivity, snapshot: ScenarioSnapshot): ScenarioCampaignStage | undefined { return activity.scenarioPresentation?.campaign?.stages[snapshot.campaign?.stageIndex ?? 0]; }
export function currentCampaignPlan(snapshot: ScenarioSnapshot) { const stageId = snapshot.campaign?.plans.at(-1)?.stageId; return stageId && !snapshot.campaign?.completedStageIds.includes(stageId) ? snapshot.campaign?.plans.at(-1) : undefined; }

export function commitmentActionProblem(activity: ScenarioActivity, snapshot: ScenarioSnapshot, actionId: string, condition: Condition): string | undefined {
  const interactionIssue = scenarioInteractionActionProblem(activity, snapshot, actionId, condition); if (interactionIssue) return interactionIssue;
  const prediction = activity.scenarioPresentation?.prediction;
  if (prediction?.beforeActionIds.includes(actionId) && !snapshot.prediction?.initialChoiceId) return 'Commit a prediction before revealing this test result.';
  if (activity.scenarioPresentation?.campaign) {
    const stage = currentCampaignStage(activity, snapshot), plan = currentCampaignPlan(snapshot);
    if (!stage) return 'The campaign stages are complete.';
    if (condition(stage.completionWhen, snapshot.state)) return 'Review this stage’s outcome before continuing.';
    if (!stage.actionIds.includes(actionId)) return 'This action belongs to a different campaign stage.';
    if (!plan) return 'Commit an action plan for this stage first.';
    if (plan.actionIds[plan.executed] !== actionId) return plan.executed >= plan.actionIds.length ? 'The current plan is finished. Revise it before taking another action.' : 'Follow the next planned action, or record why you are revising the plan.';
  }
  return undefined;
}
export function applyScenarioCommitment(activity: ScenarioActivity, snapshot: ScenarioSnapshot, entry: ScenarioCommitment, condition: Condition): string | undefined {
  const prediction = activity.scenarioPresentation?.prediction, campaign = activity.scenarioPresentation?.campaign;
  if (entry.type === 'prediction' || entry.type === 'hypothesis-revision' || entry.type === 'outcome-review') {
    const state = snapshot.prediction;
    if (!prediction || !state) return 'This case does not define a prediction commitment.';
    if (entry.type === 'prediction') {
      if (state.initialChoiceId || snapshot.history.some(action => prediction.beforeActionIds.includes(action.actionId))) return 'An initial prediction must be committed once, before the guarded tests.';
      if (!prediction.hypotheses.some(choice => choice.id === entry.choiceId)) return 'Choose a reviewed hypothesis.';
      state.initialChoiceId = entry.choiceId;
    } else if (entry.type === 'hypothesis-revision') {
      if (!state.initialChoiceId || !predictionOutcomesReady(activity, snapshot)) return 'Observe the required outcomes before confirming or revising your hypothesis.';
      if (!prediction.hypotheses.some(choice => choice.id === entry.choiceId)) return 'Choose a reviewed hypothesis.';
      state.finalChoiceId = entry.choiceId; state.reviewId = undefined;
    } else {
      if (!state.finalChoiceId || !predictionOutcomesReady(activity, snapshot)) return 'Confirm or revise your hypothesis after observing the result first.';
      if (!prediction.reviewChoices.some(choice => choice.id === entry.choiceId)) return 'Choose a reviewed outcome explanation.';
      state.reviewId = entry.choiceId;
    }
    state.history.push({ type: entry.type, choiceId: entry.choiceId, atStep: entry.atStep }); return;
  }
  if (!('stageId' in entry)) return applyScenarioInteractionCommitment(activity, snapshot, entry as ScenarioInteractionCommitment & { atStep: number });
  const state = snapshot.campaign, stage = currentCampaignStage(activity, snapshot);
  if (!campaign || !state || !stage || stage.id !== entry.stageId) return 'This commitment does not belong to the current campaign stage.';
  if (entry.type === 'plan' || entry.type === 'plan-revision') {
    if (condition(stage.completionWhen, snapshot.state)) return 'The stage outcome is ready for its debrief.';
    const previous = state.plans.filter(plan => plan.stageId === stage.id);
    if (entry.type === 'plan' && previous.length || entry.type === 'plan-revision' && !previous.length) return 'Use an initial plan first, then explicit plan revisions.';
    if (entry.type === 'plan-revision' && !campaign.revisionReasons.some(reason => reason.id === entry.reasonId)) return 'Choose a reviewed reason for changing your plan.';
    if (entry.actionIds.some(id => !stage.actionIds.includes(id))) return 'Every planned action must belong to this stage.';
    for (const id of new Set(entry.actionIds)) {
      const available = activity.actions.find(action => action.id === id)!.maxUses - snapshot.history.filter(action => action.actionId === id).length;
      if (entry.actionIds.filter(actionId => actionId === id).length > available) return 'The plan repeats an action more often than its remaining use limit.';
    }
    const cost = entry.actionIds.reduce((sum, id) => sum + activity.actions.find(action => action.id === id)!.cost, 0);
    if (cost > snapshot.remaining || entry.actionIds.length + snapshot.history.length > activity.maxSteps) return 'The proposed plan exceeds the remaining budget or action limit.';
    state.plans.push({ stageId: stage.id, actionIds: [...entry.actionIds], reasonId: entry.reasonId, atStep: entry.atStep, executed: 0 }); return;
  }
  if (entry.type !== 'debrief') return 'This campaign commitment type is unsupported.';
  if (!condition(stage.completionWhen, snapshot.state) || !stage.focusObservationIds.every(id => snapshot.observationIds.includes(id))) return 'Reach the stage outcome and collect its observations before the debrief.';
  if (!stage.debrief.choices.some(choice => choice.id === entry.choiceId)) return 'Choose one of this stage’s reviewed debrief responses.';
  const accepted = stage.debrief.acceptedChoiceIds.includes(entry.choiceId);
  state.debriefs.push({ stageId: stage.id, choiceId: entry.choiceId, accepted, atStep: entry.atStep });
  if (accepted) { state.completedStageIds.push(stage.id); state.stageIndex++; }
}
export function recordPlannedAction(snapshot: ScenarioSnapshot) { const plan = currentCampaignPlan(snapshot); if (plan) plan.executed++; }
export function scenarioCommitmentDetails(activity: ScenarioActivity, snapshot: ScenarioSnapshot) {
  const details: { id: string; correct: boolean; message: string }[] = [];
  const prediction = activity.scenarioPresentation?.prediction, p = snapshot.prediction;
  if (prediction) {
    const correct = !!p?.initialChoiceId && !!p.finalChoiceId && prediction.acceptedFinalHypothesisIds.includes(p.finalChoiceId) && !!p.reviewId && prediction.acceptedReviewIds.includes(p.reviewId);
    details.push({ id: 'prediction-review', correct, message: correct ? 'Your final hypothesis and outcome explanation are supported. The initial prediction is not scored.' : 'Commit before testing, then confirm or revise the hypothesis and review the observed outcome.' });
  }
  if (activity.scenarioPresentation?.campaign) for (const stage of activity.scenarioPresentation.campaign.stages) {
    const correct = !!snapshot.campaign?.completedStageIds.includes(stage.id);
    details.push({ id: `campaign-${stage.id}`, correct, message: `${stage.title}: ${correct ? 'plan, observed outcome and reviewed debrief completed.' : 'complete the stage and its debrief.'}` });
  }
  details.push(...scenarioInteractionDetails(activity, snapshot));
  return details;
}
