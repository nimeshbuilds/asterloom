import { activeDialogueTurn, dialogueEvidenceReachable, recordScenarioRoleView } from './scenarioInteractions';
import type { ScenarioDialogueState, ScenarioPromptState } from './scenarioInteractions';
import type { ActivityBase, Evaluation, Rule } from './structuredEngine';
import type { Source } from '../types';
import { applyScenarioCommitment, commitmentActionProblem, createScenarioModeState, recordPlannedAction, scenarioCommitmentDetails, validateScenarioCommitments, validateScenarioPresentation } from './scenarioCommitments';
import type { ScenarioCampaignState, ScenarioCommitment, ScenarioCommitmentInput, ScenarioModeDraft, ScenarioPredictionState, ScenarioPresentation } from './scenarioCommitments';

export type ScenarioValue = string | number | boolean;
type EvidenceBound = { evidenceRefs: number[] };
type VariableBase = EvidenceBound & { id: string; label: string; visibility: 'visible' | 'hidden' };
export type ScenarioVariable = VariableBase & (
  | { type: 'boolean'; initial: boolean }
  | { type: 'number'; initial: number; min: number; max: number }
  | { type: 'enum'; initial: string; values: string[] }
);
export type ScenarioEffect = { field: string; op: 'set'; value: ScenarioValue } | { field: string; op: 'add'; value: number };
export interface ScenarioObservation extends EvidenceBound { id: string; label: string; text: string }
export interface ScenarioTransition extends EvidenceBound {
  id: string;
  /** Conditional branches must be mutually exclusive; the last branch is the fallback. */
  when?: Rule;
  effects: ScenarioEffect[];
  reveal: string[];
  consequence: string;
}
export interface ScenarioAction extends EvidenceBound {
  id: string; label: string; description: string; cost: number; maxUses: number;
  guard?: Rule; transitions: ScenarioTransition[];
}
export interface ScenarioObjective extends EvidenceBound {
  id: string; label: string; when: Rule; requiredObservations: string[];
}
export interface ScenarioActivity extends ActivityBase {
  kind: 'scenario';
  variables: ScenarioVariable[];
  budget: EvidenceBound & { label: string; limit: number };
  maxSteps: number;
  observations: ScenarioObservation[];
  initialObservationIds: string[];
  actions: ScenarioAction[];
  objectives: ScenarioObjective[];
  successWhen: Rule;
  failureWhen?: Rule;
  scenarioPresentation?: ScenarioPresentation;
}
/** A save contains decisions, never authoritative state, resource balances, or scores. */
export interface ScenarioResponse {
  kind: 'scenario-response'; fingerprint: string;
  actions: string[]; selectedEvidenceIds: string[]; selectedActionId: string;
  notice?: string;
  commitments?: ScenarioCommitment[];
  modeDraft?: ScenarioModeDraft;
}
export interface ScenarioHistoryEntry {
  step: number; actionId: string; transitionId: string; cost: number;
  consequence: string; revealed: string[];
  changes: { field: string; before: ScenarioValue; after: ScenarioValue }[];
}
export interface ScenarioSnapshot {
  phase: 'active' | 'success' | 'failed' | 'exhausted' | 'invalid';
  state: Record<string, ScenarioValue>; spent: number; remaining: number;
  observationIds: string[]; history: ScenarioHistoryEntry[]; error?: string;
  dialogue?: ScenarioDialogueState;
  promptComparison?: ScenarioPromptState;
  prediction?: ScenarioPredictionState;
  campaign?: ScenarioCampaignState;
}
export interface ScenarioActionAvailability { action: ScenarioAction; available: boolean; reason: string }

const BASE_KEYS = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'scaffoldIds', 'extractedFrom', 'kind'];
const EXTRA_KEYS = ['variables', 'budget', 'maxSteps', 'observations', 'initialObservationIds', 'actions', 'objectives', 'successWhen', 'failureWhen', 'scenarioPresentation'];
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value) && !BAD_KEYS.has(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
function list(value: unknown, path: string, errors: string[], min = 0, max = 32): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) { errors.push(`${path}: expected ${min}–${max} entries.`); return []; }
  return value;
}
function text(value: unknown, path: string, errors: string[], max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) errors.push(`${path}: expected non-empty text up to ${max} characters.`);
}
function keys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  Object.keys(value).forEach(key => { if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field.`); });
}
function rows(value: unknown, path: string, errors: string[], min: number, max: number): Record<string, unknown>[] {
  const found = new Set<string>();
  return list(value, path, errors, min, max).flatMap((entry, index) => {
    if (!isObject(entry)) { errors.push(`${path}[${index}]: expected an object.`); return []; }
    if (!isId(entry.id)) errors.push(`${path}[${index}].id: invalid identifier.`);
    else { if (found.has(entry.id)) errors.push(`${path}: duplicate identifier ${entry.id}.`); found.add(entry.id); }
    return [entry];
  });
}
function refs(value: unknown, count: number, path: string, errors: string[]) {
  const values = list(value, path, errors, 1, 12);
  if (values.some(index => !integer(index, 0, count - 1))) errors.push(`${path}: each evidence reference must index sourceRefs.`);
  if (new Set(values).size !== values.length) errors.push(`${path}: duplicate evidence reference.`);
}
function ids(value: unknown, known: Set<unknown>, path: string, errors: string[], max = 32) {
  const values = list(value, path, errors, 0, max);
  if (values.some(id => !isId(id) || !known.has(id))) errors.push(`${path}: unknown identifier.`);
  if (new Set(values).size !== values.length) errors.push(`${path}: duplicate identifier.`);
}
function within(variable: Record<string, unknown> | ScenarioVariable, value: unknown): boolean {
  if (variable.type === 'boolean') return typeof value === 'boolean';
  if (variable.type === 'number') return integer(value, variable.min as number, variable.max as number);
  return variable.type === 'enum' && typeof value === 'string' && Array.isArray(variable.values) && variable.values.includes(value);
}
function conditionErrors(value: unknown, variables: Record<string, unknown>[], path: string, errors: string[], depth = 0, nodes = { count: 0 }): void {
  if (++nodes.count > 40 || depth > 5) { errors.push(`${path}: condition complexity exceeds the limit.`); return; }
  if (!isObject(value)) { errors.push(`${path}: expected a condition.`); return; }
  if (value.op === 'and' || value.op === 'or') {
    keys(value, ['op', 'rules'], path, errors);
    list(value.rules, `${path}.rules`, errors, 1, 8).forEach((rule, index) => conditionErrors(rule, variables, `${path}.rules[${index}]`, errors, depth + 1, nodes));
    return;
  }
  if (value.op === 'not') { keys(value, ['op', 'rule'], path, errors); conditionErrors(value.rule, variables, `${path}.rule`, errors, depth + 1, nodes); return; }
  keys(value, ['op', 'field', 'value'], path, errors);
  const variable = variables.find(item => item.id === value.field);
  if (!variable) { errors.push(`${path}.field: unknown state variable.`); return; }
  if (['gt', 'gte', 'lt', 'lte'].includes(String(value.op))) {
    if (variable.type !== 'number' || !integer(value.value, -1_000_000, 1_000_000)) errors.push(`${path}: ordered comparisons require a bounded integer variable and value.`);
  } else if (value.op === 'eq' || value.op === 'neq') {
    if (!within(variable, value.value)) errors.push(`${path}.value: value is outside the variable domain.`);
  } else if (value.op === 'in') {
    const values = list(value.value, `${path}.value`, errors, 1, 16);
    if (values.some(item => !within(variable, item))) errors.push(`${path}.value: values are outside the variable domain.`);
  } else errors.push(`${path}.op: unsupported condition operator.`);
}

/** Parent validateActivity validates ActivityBase and exact source quotations. */
export function validateScenarioFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  keys(input, [...BASE_KEYS, ...EXTRA_KEYS], 'scenario', errors);
  if (input.kind !== 'scenario') errors.push('kind: expected scenario.');
  const refCount = Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0;
  if (!refCount) errors.push('sourceRefs: a scenario needs source evidence.');
  const variables = rows(input.variables, 'variables', errors, 1, 16);
  variables.forEach((variable, i) => {
    const field = `variables[${i}]`;
    keys(variable, ['id', 'label', 'visibility', 'type', 'initial', 'evidenceRefs', ...(variable.type === 'number' ? ['min', 'max'] : variable.type === 'enum' ? ['values'] : [])], field, errors);
    text(variable.label, `${field}.label`, errors, 160); refs(variable.evidenceRefs, refCount, `${field}.evidenceRefs`, errors);
    if (!['visible', 'hidden'].includes(String(variable.visibility))) errors.push(`${field}.visibility: choose visible or hidden.`);
    if (variable.type === 'number') {
      if (!integer(variable.min, -1_000_000, 1_000_000) || !integer(variable.max, -1_000_000, 1_000_000) || (variable.min as number) > (variable.max as number)) errors.push(`${field}: invalid numeric bounds.`);
    } else if (variable.type === 'enum') {
      const values = list(variable.values, `${field}.values`, errors, 2, 12); values.forEach(value => text(value, `${field}.values`, errors, 120));
      if (new Set(values).size !== values.length) errors.push(`${field}.values: duplicate value.`);
    } else if (variable.type !== 'boolean') errors.push(`${field}.type: unsupported variable type.`);
    if (!within(variable, variable.initial)) errors.push(`${field}.initial: initial value is outside the variable domain.`);
  });
  if (!integer(input.maxSteps, 1, 24)) errors.push('maxSteps: expected 1–24.');
  if (!isObject(input.budget)) errors.push('budget: expected a budget contract.');
  else {
    keys(input.budget, ['label', 'limit', 'evidenceRefs'], 'budget', errors); text(input.budget.label, 'budget.label', errors, 100);
    if (!integer(input.budget.limit, 1, 10000)) errors.push('budget.limit: expected 1–10000.');
    refs(input.budget.evidenceRefs, refCount, 'budget.evidenceRefs', errors);
  }
  const observations = rows(input.observations, 'observations', errors, 1, 24);
  const observationIds = new Set(observations.map(item => item.id));
  observations.forEach((observation, i) => {
    const field = `observations[${i}]`; keys(observation, ['id', 'label', 'text', 'evidenceRefs'], field, errors);
    text(observation.label, `${field}.label`, errors, 160); text(observation.text, `${field}.text`, errors); refs(observation.evidenceRefs, refCount, `${field}.evidenceRefs`, errors);
  });
  ids(input.initialObservationIds, observationIds, 'initialObservationIds', errors);
  const actions = rows(input.actions, 'actions', errors, 2, 16);
  actions.forEach((action, i) => {
    const field = `actions[${i}]`; keys(action, ['id', 'label', 'description', 'cost', 'maxUses', 'guard', 'transitions', 'evidenceRefs'], field, errors);
    text(action.label, `${field}.label`, errors, 160); text(action.description, `${field}.description`, errors); refs(action.evidenceRefs, refCount, `${field}.evidenceRefs`, errors);
    if (!integer(action.cost, 0, 10000)) errors.push(`${field}.cost: expected 0–10000.`);
    if (!integer(action.maxUses, 1, 8)) errors.push(`${field}.maxUses: expected 1–8.`);
    if (action.guard !== undefined) conditionErrors(action.guard, variables, `${field}.guard`, errors);
    const transitions = rows(action.transitions, `${field}.transitions`, errors, 1, 8);
    if (transitions.filter(item => item.when === undefined).length !== 1 || transitions.at(-1)?.when !== undefined) errors.push(`${field}.transitions: exactly one fallback must be last.`);
    transitions.forEach((transition, j) => {
      const branch = `${field}.transitions[${j}]`; keys(transition, ['id', 'when', 'effects', 'reveal', 'consequence', 'evidenceRefs'], branch, errors);
      if (transition.when !== undefined) conditionErrors(transition.when, variables, `${branch}.when`, errors);
      text(transition.consequence, `${branch}.consequence`, errors); refs(transition.evidenceRefs, refCount, `${branch}.evidenceRefs`, errors);
      ids(transition.reveal, observationIds, `${branch}.reveal`, errors);
      const effects = list(transition.effects, `${branch}.effects`, errors, 0, 8), changed = new Set<unknown>();
      effects.forEach((effect, k) => {
        const target = `${branch}.effects[${k}]`;
        if (!isObject(effect)) { errors.push(`${target}: expected an effect.`); return; }
        keys(effect, ['field', 'op', 'value'], target, errors);
        const variable = variables.find(item => item.id === effect.field);
        if (!variable) errors.push(`${target}.field: unknown state variable.`);
        else if (effect.op === 'set') { if (!within(variable, effect.value)) errors.push(`${target}.value: value is outside the variable domain.`); }
        else if (effect.op === 'add') { if (variable.type !== 'number' || !integer(effect.value, -1_000_000, 1_000_000) || effect.value === 0) errors.push(`${target}: add requires a numeric variable and a nonzero bounded integer.`); }
        else errors.push(`${target}.op: unsupported effect.`);
        if (changed.has(effect.field)) errors.push(`${branch}: a transition may change each field only once.`); changed.add(effect.field);
      });
    });
  });
  const objectives = rows(input.objectives, 'objectives', errors, 1, 8);
  objectives.forEach((objective, i) => {
    const field = `objectives[${i}]`; keys(objective, ['id', 'label', 'when', 'requiredObservations', 'evidenceRefs'], field, errors);
    text(objective.label, `${field}.label`, errors); refs(objective.evidenceRefs, refCount, `${field}.evidenceRefs`, errors);
    conditionErrors(objective.when, variables, `${field}.when`, errors); ids(objective.requiredObservations, observationIds, `${field}.requiredObservations`, errors);
  });
  conditionErrors(input.successWhen, variables, 'successWhen', errors);
  if (input.failureWhen !== undefined) conditionErrors(input.failureWhen, variables, 'failureWhen', errors);
  errors.push(...validateScenarioPresentation(input, (rule, path, issues) => conditionErrors(rule, variables, path, issues)));
  if (!errors.length) errors.push(...reachableModelErrors(input as unknown as ScenarioActivity));
  return errors;
}

function testCondition(rule: Rule, state: Record<string, ScenarioValue>): boolean {
  if (rule.op === 'and') return rule.rules.every(child => testCondition(child, state));
  if (rule.op === 'or') return rule.rules.some(child => testCondition(child, state));
  if (rule.op === 'not') return !testCondition(rule.rule, state);
  if (!('field' in rule)) return false;
  const actual = state[rule.field];
  switch (rule.op) {
    case 'eq': return actual === rule.value;
    case 'neq': return actual !== rule.value;
    case 'in': return rule.value.includes(actual);
    case 'gt': return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value;
    case 'gte': return typeof actual === 'number' && typeof rule.value === 'number' && actual >= rule.value;
    case 'lt': return typeof actual === 'number' && typeof rule.value === 'number' && actual < rule.value;
    case 'lte': return typeof actual === 'number' && typeof rule.value === 'number' && actual <= rule.value;
  }
  return false;
}

/** Explore the finite decision space at authoring time, never execute source code. */
function reachableModelErrors(activity: ScenarioActivity): string[] {
  type Node = { state: Record<string, ScenarioValue>; remaining: number; steps: number; uses: number[]; observations: string[]; stage: number; promptVariant?: string };
  const initial: Node = { state: Object.fromEntries(activity.variables.map(variable => [variable.id, variable.initial])), remaining: activity.budget.limit, steps: 0, uses: activity.actions.map(() => 0), observations: [...activity.initialObservationIds], stage: 0 };
  if (testCondition(activity.successWhen, initial.state) || activity.failureWhen && testCondition(activity.failureWhen, initial.state)) return ['The initial state must begin an unfinished, playable investigation.'];
  const prompt = activity.scenarioPresentation?.promptComparison;
  const variants = prompt?.cases.filter(item => item.id !== prompt.baselineCaseId).map(item => item.id) ?? [];
  const pending = variants.length ? variants.map(promptVariant => ({ ...initial, state: { ...initial.state }, promptVariant })) : [initial], seen = new Set<string>(), solvedVariants = new Set<string>(); let solvable = false;
  const stages = activity.scenarioPresentation?.campaign?.stages;
  if (stages && testCondition(stages[0].completionWhen, initial.state)) return ['The first campaign stage must begin unfinished.'];
  const signature = (node: Node) => JSON.stringify([node.state, node.remaining, node.steps, node.uses, [...node.observations].sort(), node.stage, node.promptVariant]);
  pending.forEach(node => seen.add(signature(node)));
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const node = pending[cursor];
    if (activity.failureWhen && testCondition(activity.failureWhen, node.state)) continue;
    if (stages?.[node.stage] && testCondition(stages[node.stage].completionWhen, node.state)) {
      if (!stages[node.stage].focusObservationIds.every(id => node.observations.includes(id))) continue;
      node.stage++;
      if (stages[node.stage] && testCondition(stages[node.stage].completionWhen, node.state)) return ['Each new campaign stage must require a new outcome rather than starting already complete.'];
    }
    if (testCondition(activity.successWhen, node.state)) {
      if (dialogueEvidenceReachable(activity, node.observations) && (!stages || node.stage === stages.length) && (!activity.scenarioPresentation?.prediction || activity.scenarioPresentation.prediction.outcomeObservationIds.every(id => node.observations.includes(id))) && (!prompt || prompt.cases.filter(item => [prompt.baselineCaseId, node.promptVariant].includes(item.id)).every(item => node.observations.includes(item.observationId))) && activity.objectives.every(objective => testCondition(objective.when, node.state) && objective.requiredObservations.every(id => node.observations.includes(id)))) { solvable = true; if (node.promptVariant) solvedVariants.add(node.promptVariant); }
      continue;
    }
    if (node.steps >= activity.maxSteps) continue;
    const dialogueTurns = activeDialogueTurn(activity, node.state, testCondition);
    if (dialogueTurns && dialogueTurns.length !== 1) return ['Every reachable active dialogue scene must have exactly one turn; repair overlapping or missing turn conditions.'];
    for (const [index, action] of activity.actions.entries()) {
      if (stages && !stages[node.stage]?.actionIds.includes(action.id)) continue;
      if (dialogueTurns && !dialogueTurns[0].choices.some(choice => choice.actionId === action.id)) continue;
      if (prompt && !prompt.cases.some(item => [prompt.baselineCaseId, node.promptVariant].includes(item.id) && item.inspectActionId === action.id)) continue;
      if (action.cost > node.remaining || node.uses[index] >= action.maxUses || action.guard && !testCondition(action.guard, node.state)) continue;
      const transition = transitionFor(action, node.state);
      if (!transition) return [`actions.${action.id}: transition conditions overlap in a reachable state.`];
      const state = { ...node.state };
      for (const effect of transition.effects) {
        const after = effect.op === 'set' ? effect.value : (state[effect.field] as number) + effect.value;
        if (!within(activity.variables.find(variable => variable.id === effect.field)!, after)) return [`actions.${action.id}: a reachable effect exceeds the domain of ${effect.field}; add a guard or revise the effect.`];
        state[effect.field] = after;
      }
      const uses = [...node.uses]; uses[index]++;
      const next = { state, remaining: node.remaining - action.cost, steps: node.steps + 1, uses, observations: [...new Set([...node.observations, ...transition.reveal])], stage: node.stage, promptVariant: node.promptVariant };
      const key = signature(next);
      if (!seen.has(key)) {
        if (seen.size >= 4096) return ['This case exceeds the 4096-state review limit. Reduce independent actions, repeats, or state combinations.'];
        seen.add(key); pending.push(next);
      }
    }
  }
  return solvable && variants.every(id => solvedVariants.has(id)) ? [] : ['No supported success is reachable within the reviewed budget and action limits.'];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function scenarioFingerprint(activity: ScenarioActivity): string {
  const model = Object.fromEntries(['id', 'sourceRefs', ...EXTRA_KEYS].map(key => [key, (activity as unknown as Record<string, unknown>)[key]]));
  const value = canonical(model); let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `scenario-v1-${(hash >>> 0).toString(36)}`;
}
function responseError(activity: ScenarioActivity, response: unknown): string | undefined {
  if (!isObject(response) || response.kind !== 'scenario-response') return 'This saved case has an invalid response format.';
  if (response.fingerprint !== scenarioFingerprint(activity)) return 'The case rules changed. Start a fresh investigation.';
  if (!Array.isArray(response.actions) || response.actions.length > activity.maxSteps || response.actions.some(id => typeof id !== 'string' || !activity.actions.some(action => action.id === id))) return 'This saved case contains invalid decisions.';
  if (!Array.isArray(response.selectedEvidenceIds) || response.selectedEvidenceIds.length > activity.observations.length || new Set(response.selectedEvidenceIds).size !== response.selectedEvidenceIds.length || response.selectedEvidenceIds.some(id => !activity.observations.some(item => item.id === id))) return 'This saved case contains invalid evidence selections.';
  if (typeof response.selectedActionId !== 'string' || response.selectedActionId && !activity.actions.some(action => action.id === response.selectedActionId)) return 'This saved case contains an invalid action selection.';
  return validateScenarioCommitments(activity, response);
}
export function initialScenarioResponse(activity: ScenarioActivity, saved?: unknown, options: {practice?: boolean} = {}): ScenarioResponse {
  const initial: ScenarioResponse = { kind: 'scenario-response', fingerprint: scenarioFingerprint(activity), actions: [], selectedEvidenceIds: [], selectedActionId: '' };
  if (saved === undefined || saved === null) return initial;
  const error = responseError(activity, saved);
  if (error) return { ...initial, notice: error };
  const value = saved as unknown as ScenarioResponse;
  const replay = replayScenario(activity, value, options);
  if (replay.phase === 'invalid') return { ...initial, notice: replay.error };
  return { ...initial, actions: [...value.actions], selectedEvidenceIds: [...value.selectedEvidenceIds], selectedActionId: value.selectedActionId, ...(value.commitments ? { commitments: JSON.parse(JSON.stringify(value.commitments)) } : {}), ...(value.modeDraft ? { modeDraft: JSON.parse(JSON.stringify(value.modeDraft)) } : {}) };
}
function actionProblem(activity: ScenarioActivity, snapshot: ScenarioSnapshot, action: ScenarioAction, ignoreCommitments = false): string | undefined {
  if (snapshot.phase !== 'active') return 'This run has ended.';
  if (action.guard && !testCondition(action.guard, snapshot.state)) return 'The prerequisites for this action are not met.';
  if (snapshot.history.filter(entry => entry.actionId === action.id).length >= action.maxUses) return 'This action has reached its use limit.';
  if (action.cost > snapshot.remaining) return `Requires ${action.cost} ${activity.budget.label}; ${snapshot.remaining} remain.`;
  return ignoreCommitments ? undefined : commitmentActionProblem(activity, snapshot, action.id, testCondition);
}
function transitionFor(action: ScenarioAction, state: Record<string, ScenarioValue>): ScenarioTransition | undefined {
  const matches = action.transitions.filter(transition => transition.when && testCondition(transition.when, state));
  return matches.length > 1 ? undefined : matches[0] ?? action.transitions.at(-1);
}
function conclude(activity: ScenarioActivity, snapshot: ScenarioSnapshot) {
  if (activity.failureWhen && testCondition(activity.failureWhen, snapshot.state)) snapshot.phase = 'failed';
  else if (testCondition(activity.successWhen, snapshot.state)) snapshot.phase = 'success';
  else if (snapshot.history.length >= activity.maxSteps || !activity.actions.some(action => !actionProblem(activity, snapshot, action, true))) snapshot.phase = 'exhausted';
}
/** Replay is the authority for state, costs, acquired observations and grading. */
export function replayScenario(activity: ScenarioActivity, response: unknown, options: {practice?: boolean} = {}): ScenarioSnapshot {
  const snapshot: ScenarioSnapshot = { phase: 'active', state: {}, spent: 0, remaining: activity.budget?.limit ?? 0, observationIds: [], history: [], ...createScenarioModeState(activity) };
  const modelErrors = validateScenarioFields(activity as unknown as Record<string, unknown>);
  const error = modelErrors[0] ?? (activity.reviewStatus !== 'reviewed' && options.practice !== true ? 'The author must review this scenario before it can be played.' : responseError(activity, response));
  const fail = (message: string) => ({ ...snapshot, phase: 'invalid' as const, error: message });
  if (error) return fail(error);
  const saved = response as ScenarioResponse;
  snapshot.state = Object.fromEntries(activity.variables.map(variable => [variable.id, variable.initial]));
  snapshot.observationIds = [...activity.initialObservationIds];
  recordScenarioRoleView(activity, snapshot);
  conclude(activity, snapshot);
  for (let index = 0; index <= saved.actions.length; index++) {
    for (const entry of saved.commitments?.filter(commitment => commitment.atStep === index) ?? []) {
      const issue = applyScenarioCommitment(activity, snapshot, entry, testCondition);
      if (issue) return fail(issue);
    }
    if (index === saved.actions.length) break;
    const actionId = saved.actions[index];
    const action = activity.actions.find(item => item.id === actionId)!;
    const problem = actionProblem(activity, snapshot, action); if (problem) return fail(problem);
    const transition = transitionFor(action, snapshot.state);
    if (!transition) return fail('The reviewed model has overlapping transition conditions. Ask the author to repair this action.');
    const state = { ...snapshot.state }, changes: ScenarioHistoryEntry['changes'] = [];
    for (const effect of transition.effects) {
      const before = state[effect.field], after = effect.op === 'set' ? effect.value : (before as number) + effect.value;
      if (!within(activity.variables.find(variable => variable.id === effect.field)!, after)) return fail('This action would exceed a state bound. Ask the author to repair its guard or effect.');
      state[effect.field] = after;
      if (before !== after) changes.push({ field: effect.field, before, after });
    }
    const revealed = transition.reveal.filter(id => !snapshot.observationIds.includes(id));
    snapshot.state = state; snapshot.spent += action.cost; snapshot.remaining -= action.cost;
    snapshot.observationIds.push(...revealed);
    recordScenarioRoleView(activity, snapshot);
    snapshot.history.push({ step: snapshot.history.length + 1, actionId, transitionId: transition.id, cost: action.cost, consequence: transition.consequence, revealed, changes });
    recordPlannedAction(snapshot);
    conclude(activity, snapshot);
  }
  if (snapshot.dialogue && saved.selectedEvidenceIds.some(id => !snapshot.dialogue!.seenObservationIds.includes(id))) return fail('Inspect the authored perspective containing this evidence before selecting it.');
  if (saved.selectedEvidenceIds.some(id => !snapshot.observationIds.includes(id))) return fail('Only evidence discovered during this run can support your conclusion.');
  return snapshot;
}
export function scenarioAvailableActions(activity: ScenarioActivity, response: unknown, options: {practice?: boolean} = {}): ScenarioActionAvailability[] {
  const snapshot = replayScenario(activity, response, options);
  return activity.actions.map(action => { const reason = actionProblem(activity, snapshot, action) ?? ''; return { action, available: !reason, reason }; });
}
export function advanceScenario(activity: ScenarioActivity, response: ScenarioResponse, actionId: string, options: {practice?: boolean} = {}): { success: true; response: ScenarioResponse; snapshot: ScenarioSnapshot } | { success: false; error: string } {
  const snapshot = replayScenario(activity, response, options);
  if (snapshot.phase === 'invalid') return { success: false, error: snapshot.error! };
  const action = activity.actions.find(item => item.id === actionId);
  if (!action) return { success: false, error: 'Choose an action in this case.' };
  const problem = actionProblem(activity, snapshot, action); if (problem) return { success: false, error: problem };
  const next: ScenarioResponse = { kind: 'scenario-response', fingerprint: response.fingerprint, actions: [...response.actions, actionId], selectedEvidenceIds: [...response.selectedEvidenceIds], selectedActionId: '', ...(response.commitments ? { commitments: response.commitments } : {}), ...(response.modeDraft ? { modeDraft: response.modeDraft } : {}) };
  const updated = replayScenario(activity, next, options);
  return updated.phase === 'invalid' ? { success: false, error: updated.error! } : { success: true, response: next, snapshot: updated };
}
export function recordScenarioCommitment(activity: ScenarioActivity, response: ScenarioResponse, input: ScenarioCommitmentInput, options: {practice?: boolean} = {}): { success: true; response: ScenarioResponse; snapshot: ScenarioSnapshot } | { success: false; error: string } {
  const current = replayScenario(activity, response, options);
  if (current.phase === 'invalid') return { success: false, error: current.error! };
  const next: ScenarioResponse = { ...response, commitments: [...(response.commitments ?? []), { ...input, atStep: response.actions.length } as ScenarioCommitment], selectedActionId: '', modeDraft: {} };
  const snapshot = replayScenario(activity, next, options);
  return snapshot.phase === 'invalid' ? { success: false, error: snapshot.error! } : { success: true, response: next, snapshot };
}
export function scenarioConditionMet(rule: Rule, state: Record<string, ScenarioValue>): boolean { return testCondition(rule, state); }
export function getScenarioCapabilities(activity: ScenarioActivity): ('prediction' | 'hypothesis' | 'campaign' | 'planning' | 'transfer-debrief' | 'dialogue' | 'perspective' | 'prompt-comparison')[] {
  if (validateScenarioFields(activity as unknown as Record<string, unknown>).length) return [];
  return [...(activity.scenarioPresentation?.prediction ? ['prediction', 'hypothesis'] as const : []), ...(activity.scenarioPresentation?.campaign ? ['campaign', 'planning', 'transfer-debrief'] as const : []), ...(activity.scenarioPresentation?.dialogue ? ['dialogue'] as const : []), ...(activity.scenarioPresentation?.dialogue?.mode === 'perspective' ? ['perspective'] as const : []), ...(activity.scenarioPresentation?.promptComparison ? ['prompt-comparison'] as const : [])];
}
export function evaluateScenario(activity: ScenarioActivity, response: unknown, options: {practice?: boolean} = {}): Evaluation {
  const snapshot = replayScenario(activity, response, options);
  if (snapshot.phase === 'invalid') return { valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.objectives?.length || 1, feedback: snapshot.error!, details: [] };
  const selected = (response as ScenarioResponse).selectedEvidenceIds;
  const details = activity.objectives.map(objective => {
    const met = testCondition(objective.when, snapshot.state);
    const collected = objective.requiredObservations.every(id => snapshot.observationIds.includes(id));
    const supported = objective.requiredObservations.every(id => snapshot.observationIds.includes(id) && selected.includes(id));
    return { id: objective.id, correct: met && supported, message: `${objective.label}: ${!met ? 'the required outcome has not been reached.' : !collected ? 'required observations were not collected in this run; gather evidence before concluding in a new run.' : !supported ? 'select the observations that support this outcome.' : 'outcome reached and supported by discovered evidence.'}` };
  });
  details.push(...scenarioCommitmentDetails(activity, snapshot));
  const expected = new Set(activity.objectives.flatMap(objective => objective.requiredObservations));
  const extra = selected.some(id => !expected.has(id));
  const correct = snapshot.phase === 'success' && details.every(item => item.correct) && !extra;
  const score = snapshot.phase === 'success' && !extra ? details.filter(item => item.correct).length : 0;
  const feedback = snapshot.phase === 'failed' ? 'A stopping condition was reached. Review the consequences and start a new investigation.' : snapshot.phase === 'exhausted' ? 'This run ended before the goal was reached. Review how you used your actions and budget.' : snapshot.phase === 'active' ? 'The investigation is still open. Take further actions before submitting your conclusion.' : extra ? 'Some selected observations do not support the stated objectives. Narrow your evidence.' : correct ? `Your decisions and selected evidence satisfy the ${activity.reviewStatus === 'reviewed' ? 'reviewed' : 'draft'} scenario. ${activity.explanation}` : 'The outcome is ready. Select the discovered evidence that supports your conclusion.';
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, feedback, details };
}

// These are authored training models, not claims about every real network or
// experiment. The complete rules are supplied as source material for review.
const networkPassages = [
  'Training case: a workstation has a working physical link and can reach a service by numeric address, but its saved resolver address is stale. No settings have been inspected, no connectivity test has run, name lookup has not been restored, and disruption starts at zero. The lab allows six effort units and six actions.',
  'Inspecting the cable costs one effort unit and reports that the physical link is connected. Testing the numeric address costs one unit and records a successful address test.',
  'Inspecting the resolver costs one unit. A stale resolver inspection reports the stale resolver address; an already corrected resolver inspection reports a correct address. The inspection is recorded.',
  'Replacing the resolver costs two effort units and requires both a successful numeric-address test and a recorded resolver inspection. It sets the resolver address to correct. Changing the configuration alone does not prove that lookup works.',
  'Verifying name lookup costs one effort unit. With the correct resolver, the lookup succeeds and service is restored. With a stale resolver, lookup fails and service remains unrestored.',
  'An unneeded reboot costs three effort units, adds one disruption point, and leaves the resolver unchanged. A factory reset costs five units, sets disruption to two, and ends this training run unsuccessfully. Each action can be used once, except lookup verification can be used twice.',
  'The goal is restored name lookup with zero disruption. Support the diagnosis with the successful numeric-address test, the observed stale resolver, and the successful lookup verification. Cable inspection and a configuration change are not sufficient evidence for this conclusion.',
];
const experimentPassages = [
  'Training case: two fictional seed trays received different light exposure, but their water amounts were unequal. The water mismatch is initially hidden. No notebook inspection, controlled repetition, or conclusion has been completed. Integrity starts at two. The investigation has seven effort units and seven actions.',
  'Inspecting the notebook costs one effort unit and reveals that the water amounts differed. Comparing the old chart costs one unit and shows a height difference, which alone does not isolate the effect of light.',
  'Balancing water costs one effort unit and requires a notebook inspection. It makes water equal for subsequent trials, while the light difference is maintained.',
  'A controlled repetition costs two effort units and can run at most twice. With equal water, the first trial records a three-unit height difference and the second records a two-unit difference in this fictional model. With unequal water a trial remains confounded and reduces integrity by one.',
  'Assessing the study costs one effort unit and requires at least one repetition. After two repetitions with equal water it records a supported, bounded conclusion about these trials. With fewer controlled repetitions it records that the evidence is incomplete.',
  'Discarding inconvenient data costs one effort unit, sets integrity to zero, and ends the training run unsuccessfully. A run also stops if integrity reaches zero after confounded trials. Other actions can be used once; the assessment can be used twice.',
  'Success means reaching the bounded conclusion while preserving integrity at two. Support it with the original water-mismatch observation and both controlled repetition records. Do not generalize the fictional results to all plants, and do not use the old chart alone as causal evidence.',
];
const sourceFrom = (id: string, title: string, passages: string[]): Source => ({ id, title, text: passages.join('\n\n'), kind: 'text', status: 'ready', addedAt: '2026-10-03T00:00:00.000Z' });
export const SCENARIO_EXAMPLE_SOURCES: Source[] = [sourceFrom('scenario-network-rules', 'Reviewed fictional network lab rules', networkPassages), sourceFrom('scenario-investigation-rules', 'Reviewed fictional controlled-study rules', experimentPassages)];
const equal = (field: string, value: ScenarioValue): Rule => ({ op: 'eq', field, value });
const all = (...rules: Rule[]): Rule => ({ op: 'and', rules });
const set = (field: string, value: ScenarioValue): ScenarioEffect => ({ field, op: 'set', value });
const add = (field: string, value: number): ScenarioEffect => ({ field, op: 'add', value });
const boolean = (id: string, label: string, initial = false): ScenarioVariable => ({ id, label, type: 'boolean', visibility: 'visible', initial, evidenceRefs: [0] });
const observation = (id: string, label: string, text: string, reference: number): ScenarioObservation => ({ id, label, text, evidenceRefs: [reference] });
const branch = (id: string, consequence: string, effects: ScenarioEffect[], reveal: string[], reference: number, when?: Rule): ScenarioTransition => ({ id, consequence, effects, reveal, evidenceRefs: [reference], ...(when ? { when } : {}) });
const action = (id: string, label: string, description: string, cost: number, reference: number, transitions: ScenarioTransition[], guard?: Rule, maxUses = 1): ScenarioAction => ({ id, label, description, cost, maxUses, transitions, evidenceRefs: [reference], ...(guard ? { guard } : {}) });
const base = (id: string, title: string, instruction: string, source: Source, passages: string[]): ActivityBase => ({ version: 1, id, title, instruction, reviewStatus: 'reviewed', sourceRefs: passages.map(evidence => ({ sourceId: source.id, evidence })), explanation: 'Each consequence follows the explicitly authored training model. Real situations require their own evidence and review.', hint: 'Collect diagnostic evidence before committing resources to a change. Verify the result and support your conclusion with the relevant observations.' });

export const SCENARIO_EXAMPLES: ScenarioActivity[] = [
  {
    ...base('scenario-resolver-case', 'The address works. The name does not.', 'Restore the workstation within the lab budget, then choose the observations that justify your diagnosis. This is a bounded training simulation.', SCENARIO_EXAMPLE_SOURCES[0], networkPassages), kind: 'scenario', scaffoldIds: ['fault-diagnosis', 'repair-challenge'],
    variables: [boolean('link', 'Physical link connected', true), { id: 'resolver', label: 'Resolver configuration', type: 'enum', values: ['stale', 'correct'], initial: 'stale', visibility: 'hidden', evidenceRefs: [0] }, boolean('inspected', 'Resolver inspected'), boolean('addressTest', 'Address test passed'), boolean('restored', 'Name lookup restored'), { id: 'disruption', label: 'Disruption', type: 'number', min: 0, max: 2, initial: 0, visibility: 'visible', evidenceRefs: [0, 5] }],
    budget: { label: 'effort units', limit: 6, evidenceRefs: [0] }, maxSteps: 6,
    observations: [observation('complaint', 'Initial report', 'A workstation cannot reach the service by name.', 0), observation('cable-ok', 'Cable observation', 'The physical link is connected.', 1), observation('address-ok', 'Numeric-address test', 'The service responds when contacted by its numeric address.', 1), observation('resolver-stale', 'Resolver inspection', 'The saved resolver address is stale.', 2), observation('resolver-correct', 'Resolver inspection after correction', 'The saved resolver address is correct.', 2), observation('configuration-changed', 'Configuration record', 'The resolver setting was changed. Verification is still needed.', 3), observation('lookup-ok', 'Verification result', 'The service now responds when contacted by name.', 4), observation('lookup-failed', 'Verification result', 'Name lookup still fails.', 4), observation('reboot-record', 'Reboot record', 'The reboot caused disruption and did not change the stale configuration.', 5), observation('reset-record', 'Reset record', 'The reset exceeded the disruption limit.', 5)],
    initialObservationIds: ['complaint'],
    actions: [
      action('inspect-cable', 'Inspect the cable', 'Check the physical connection without changing settings.', 1, 1, [branch('cable', 'The link is connected. The fault remains unresolved.', [], ['cable-ok'], 1)]),
      action('test-address', 'Test the numeric address', 'Check whether the service can be reached without a name lookup.', 1, 1, [branch('address', 'The numeric-address test succeeds.', [set('addressTest', true)], ['address-ok'], 1)]),
      action('inspect-resolver', 'Inspect resolver settings', 'Read the saved resolver configuration.', 1, 2, [branch('stale', 'You record a stale resolver address.', [set('inspected', true)], ['resolver-stale'], 2, equal('resolver', 'stale')), branch('correct', 'The resolver address is already correct.', [set('inspected', true)], ['resolver-correct'], 2)]),
      action('replace-resolver', 'Correct the resolver', 'Use the lab configuration after the connection and settings have been checked.', 2, 3, [branch('replace', 'The resolver is corrected. Verify the outcome before concluding.', [set('resolver', 'correct')], ['configuration-changed'], 3)], all(equal('addressTest', true), equal('inspected', true))),
      action('verify-lookup', 'Verify name lookup', 'Test the original symptom after investigating or changing the configuration.', 1, 4, [branch('restored', 'Name lookup succeeds. Choose the evidence supporting your conclusion.', [set('restored', true)], ['lookup-ok'], 4, equal('resolver', 'correct')), branch('failed', 'Name lookup still fails. Your remaining budget is smaller.', [], ['lookup-failed'], 4)], undefined, 2),
      action('reboot', 'Reboot immediately', 'Spend time restarting before establishing the cause.', 3, 5, [branch('reboot', 'The reboot adds disruption but leaves the resolver unchanged.', [add('disruption', 1)], ['reboot-record'], 5)]),
      action('factory-reset', 'Reset the workstation', 'Replace all configuration, causing substantial disruption in this lab.', 5, 5, [branch('reset', 'The reset exceeds the allowed disruption and ends this run.', [set('disruption', 2)], ['reset-record'], 5)]),
    ],
    objectives: [{ id: 'restore', label: 'Restore name lookup without disruption', when: all(equal('restored', true), equal('disruption', 0)), requiredObservations: ['address-ok', 'resolver-stale', 'lookup-ok'], evidenceRefs: [6] }],
    successWhen: all(equal('restored', true), equal('disruption', 0)), failureWhen: { op: 'gte', field: 'disruption', value: 2 },
  },
  {
    ...base('scenario-controlled-study', 'What does the evidence actually support?', 'Investigate a confounded comparison. Plan within seven effort units, preserve the study’s integrity, and support a bounded conclusion.', SCENARIO_EXAMPLE_SOURCES[1], experimentPassages), kind: 'scenario', scaffoldIds: ['branching-decisions'],
    variables: [{ id: 'water', label: 'Water condition', type: 'enum', values: ['unequal', 'equal'], initial: 'unequal', visibility: 'hidden', evidenceRefs: [0] }, boolean('inspected', 'Notebook inspected'), boolean('balanced', 'Water controlled'), { id: 'trials', label: 'Repetitions completed', type: 'number', initial: 0, min: 0, max: 2, visibility: 'visible', evidenceRefs: [0, 3] }, boolean('supported', 'Bounded conclusion reached'), { id: 'integrity', label: 'Study integrity', type: 'number', initial: 2, min: 0, max: 2, visibility: 'visible', evidenceRefs: [0, 5] }],
    budget: { label: 'effort units', limit: 7, evidenceRefs: [0] }, maxSteps: 7,
    observations: [observation('initial-study', 'Initial study', 'Two trays received different light exposure. The earlier report claims a light effect.', 0), observation('water-mismatch', 'Notebook finding', 'Water amounts differed between trays, creating an alternative explanation.', 1), observation('old-chart', 'Old comparison', 'The height difference does not isolate the effect of light.', 1), observation('water-balanced', 'Control established', 'Water is now equal while the light difference remains.', 2), observation('trial-one', 'First controlled repetition', 'With equal water, the fictional trays differ in height by three units.', 3), observation('trial-two', 'Second controlled repetition', 'With equal water, the fictional trays differ in height by two units.', 3), observation('confounded-trial', 'Confounded repetition', 'Unequal water remains an alternative explanation; integrity decreases.', 3), observation('bounded-conclusion', 'Bounded conclusion', 'The repeated controlled observations support a difference in these trials, with wider generalization unresolved.', 4), observation('incomplete', 'Assessment result', 'There are not yet two controlled repetition records.', 4), observation('discarded', 'Integrity breach', 'Discarding inconvenient results makes this run unacceptable.', 5)],
    initialObservationIds: ['initial-study'],
    actions: [
      action('inspect-notebook', 'Inspect the study notebook', 'Look for differences between how the trays were treated.', 1, 1, [branch('inspect', 'The notebook reveals unequal water amounts.', [set('inspected', true)], ['water-mismatch'], 1)]),
      action('read-old-chart', 'Compare the old chart', 'Review the previously reported difference.', 1, 1, [branch('chart', 'The old chart shows a difference but cannot isolate the cause.', [], ['old-chart'], 1)]),
      action('balance-water', 'Control the water amount', 'Address the treatment difference found in the notebook.', 1, 2, [branch('balance', 'Subsequent repetitions will use equal water.', [set('water', 'equal'), set('balanced', true)], ['water-balanced'], 2)], equal('inspected', true)),
      action('repeat-study', 'Run a repetition', 'Collect another observation under the current conditions.', 2, 3, [branch('first', 'The first controlled repetition records a three-unit difference.', [add('trials', 1)], ['trial-one'], 3, all(equal('water', 'equal'), equal('trials', 0))), branch('second', 'The second controlled repetition records a two-unit difference.', [add('trials', 1)], ['trial-two'], 3, all(equal('water', 'equal'), equal('trials', 1))), branch('confounded', 'Unequal water still confounds the result and reduces integrity.', [add('trials', 1), add('integrity', -1)], ['confounded-trial'], 3)], { op: 'lt', field: 'trials', value: 2 }, 2),
      action('assess-study', 'Assess the evidence', 'Decide whether the completed repetitions support a bounded conclusion.', 1, 4, [branch('supported', 'Two controlled repetition records support a bounded conclusion about this model.', [set('supported', true)], ['bounded-conclusion'], 4, all(equal('trials', 2), equal('water', 'equal'), equal('integrity', 2))), branch('incomplete', 'The evidence is incomplete or remains confounded.', [], ['incomplete'], 4)], { op: 'gte', field: 'trials', value: 1 }, 2),
      action('discard-data', 'Discard an inconvenient result', 'Remove an observation because it does not suit the preferred explanation.', 1, 5, [branch('discard', 'The integrity breach ends this investigation.', [set('integrity', 0)], ['discarded'], 5)]),
    ],
    objectives: [{ id: 'supported-conclusion', label: 'Reach a bounded conclusion with intact evidence', when: all(equal('supported', true), equal('integrity', 2)), requiredObservations: ['water-mismatch', 'trial-one', 'trial-two'], evidenceRefs: [6] }],
    successWhen: all(equal('supported', true), equal('integrity', 2)), failureWhen: equal('integrity', 0),
  },
];
/** Deliberately invalid: the transition writes outside a variable's reviewed domain. */
export const INVALID_SCENARIO_EXAMPLE: unknown = { ...SCENARIO_EXAMPLES[0], id: 'scenario-invalid-domain', actions: SCENARIO_EXAMPLES[0].actions.map(item => item.id === 'factory-reset' ? { ...item, transitions: [{ ...item.transitions[0], effects: [set('disruption', 99)] }] } : item) };

export interface SceneScenarioDraft {
  id: string; title: string; instruction: string; objective: string;
  sourceId: string; evidence: string; budget: number; maxSteps: number;
  scenes: { id: string; label: string; observation: string; ending: 'continue' | 'success' | 'failure' }[];
  actions: { id: string; label: string; from: string; to: string; cost: number; consequence: string }[];
  requiredSceneIds: string[];
}
/** Guided authoring compiles explicit scenes, not inferred domain consequences. */
export function buildSceneScenario(draft: SceneScenarioDraft, source: Pick<Source, 'id' | 'text' | 'status'>): ScenarioActivity {
  if (!isId(draft.id) || !draft.title.trim() || !draft.instruction.trim() || !draft.objective.trim()) throw new Error('Add a title, learner instructions and a clear objective.');
  if (source.id !== draft.sourceId || source.status !== 'ready' || !draft.evidence.trim() || draft.evidence.length > 20000 || !source.text.includes(draft.evidence.trim())) throw new Error('Choose a readable source and an exact passage supporting your case rules.');
  if (draft.scenes.length < 2 || draft.scenes.length > 8 || draft.scenes.some(scene => !isId(scene.id) || scene.id.length > 60 || !scene.label.trim() || !scene.observation.trim() || !['continue', 'success', 'failure'].includes(scene.ending))) throw new Error('Add two to eight named scenes with observations and valid endings.');
  if (new Set(draft.scenes.map(scene => scene.id)).size !== draft.scenes.length || new Set(draft.scenes.map(scene => scene.label.trim())).size !== draft.scenes.length) throw new Error('Each scene needs a distinct identifier and name.');
  if (draft.scenes[0].ending !== 'continue') throw new Error('The first scene must be an unfinished initial situation.');
  const success = draft.scenes.filter(scene => scene.ending === 'success'), failure = draft.scenes.filter(scene => scene.ending === 'failure');
  if (!success.length) throw new Error('Mark at least one scene as a successful ending.');
  if (!draft.requiredSceneIds.length || draft.requiredSceneIds.some(id => !draft.scenes.some(scene => scene.id === id)) || new Set(draft.requiredSceneIds).size !== draft.requiredSceneIds.length) throw new Error('Choose at least one distinct scene observation as supporting evidence.');
  const stateRule = (scenes: typeof draft.scenes): Rule => ({ op: 'in', field: 'scene', value: scenes.map(scene => scene.label.trim()) });
  const activity: ScenarioActivity = {
    version: 1, kind: 'scenario', id: draft.id, title: draft.title.trim(), instruction: draft.instruction.trim(), reviewStatus: 'needs-review',
    sourceRefs: [{ sourceId: source.id, evidence: draft.evidence.trim() }],
    explanation: 'The result follows the author’s reviewed scene transitions and selected source evidence.',
    hint: 'Inspect the available information, plan your use of the budget, and collect observations before reaching a conclusion.',
    variables: [{ id: 'scene', label: 'Current situation', type: 'enum', values: draft.scenes.map(scene => scene.label.trim()), initial: draft.scenes[0].label.trim(), visibility: 'visible', evidenceRefs: [0] }],
    budget: { label: 'effort units', limit: draft.budget, evidenceRefs: [0] }, maxSteps: draft.maxSteps,
    observations: draft.scenes.map(scene => ({ id: `ob-${scene.id}`, label: scene.label.trim(), text: scene.observation.trim(), evidenceRefs: [0] })),
    initialObservationIds: [`ob-${draft.scenes[0].id}`],
    actions: draft.actions.map(item => {
      const from = draft.scenes.find(scene => scene.id === item.from), to = draft.scenes.find(scene => scene.id === item.to);
      if (!from || !to) throw new Error('Every action must connect two existing scenes.');
      if (from.ending !== 'continue') throw new Error('Actions cannot leave a finished scene.');
      return { id: item.id, label: item.label.trim(), description: `Take this action in “${from.label.trim()}”.`, cost: item.cost, maxUses: 1, evidenceRefs: [0], guard: equal('scene', from.label.trim()), transitions: [{ id: 'move', effects: [set('scene', to.label.trim())], reveal: [`ob-${to.id}`], consequence: item.consequence.trim(), evidenceRefs: [0] }] };
    }),
    objectives: [{ id: 'case-objective', label: draft.objective.trim(), when: stateRule(success), requiredObservations: draft.requiredSceneIds.map(id => `ob-${id}`), evidenceRefs: [0] }],
    successWhen: stateRule(success), ...(failure.length ? { failureWhen: stateRule(failure) } : {}),
  };
  const errors = validateScenarioFields(activity as unknown as Record<string, unknown>);
  if (errors.length) throw new Error(errors.slice(0, 3).join(' '));
  return activity;
}
