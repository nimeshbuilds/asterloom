import { describe, expect, it } from 'vitest';
import { advanceScenario, buildSceneScenario, evaluateScenario, getScenarioCapabilities, initialScenarioResponse, INVALID_SCENARIO_EXAMPLE, recordScenarioCommitment, replayScenario, SCENARIO_EXAMPLES, SCENARIO_EXAMPLE_SOURCES, scenarioAvailableActions, scenarioFingerprint, validateScenarioFields } from '../src/lib/scenarioEngine';
import type { ScenarioActivity, ScenarioResponse, SceneScenarioDraft } from '../src/lib/scenarioEngine';
import { SCENARIO_CAMPAIGN_EXAMPLE, SCENARIO_MODE_EXAMPLES, SCENARIO_MODE_SOURCES, SCENARIO_PREDICTION_EXAMPLE } from '../src/lib/scenarioModeExamples';
import type { ScenarioCommitmentInput } from '../src/lib/scenarioCommitments';

const network = SCENARIO_EXAMPLES[0], study = SCENARIO_EXAMPLES[1];
const fields = (activity: unknown) => validateScenarioFields(activity as Record<string, unknown>);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function play(activity: ScenarioActivity, actions: string[], saved?: ScenarioResponse) {
  let response = saved ?? initialScenarioResponse(activity);
  for (const action of actions) {
    const next = advanceScenario(activity, response, action);
    if (!next.success) throw new Error(next.error);
    response = next.response;
  }
  return response;
}
const solveNetwork = () => play(network, ['test-address', 'inspect-resolver', 'replace-resolver', 'verify-lookup']);
function commit(activity: ScenarioActivity, response: ScenarioResponse, entry: ScenarioCommitmentInput) {
  const result = recordScenarioCommitment(activity, response, entry);
  if (!result.success) throw new Error(result.error);
  return result.response;
}

describe('reviewed scenario contracts', () => {
  it('validates both complete models and associates every source quotation exactly', () => {
    for (const activity of SCENARIO_EXAMPLES) {
      expect(fields(activity)).toEqual([]);
      for (const ref of activity.sourceRefs) expect(SCENARIO_EXAMPLE_SOURCES.find(source => source.id === ref.sourceId)?.text).toContain(ref.evidence);
      expect(activity.actions.every(action => action.evidenceRefs.length && action.transitions.every(transition => transition.evidenceRefs.length))).toBe(true);
    }
  });
  it('rejects unsafe domains, unknown operations, duplicate fields and absent evidence', () => {
    expect(fields(INVALID_SCENARIO_EXAMPLE).join(' ')).toContain('outside the variable domain');
    const wrong = copy(network); (wrong.actions[0].transitions[0].effects as any).push({ field: '__proto__', op: 'execute', value: 'alert(1)' });
    wrong.observations[0].evidenceRefs = [999]; wrong.variables[0].evidenceRefs = [];
    expect(fields(wrong).join(' ')).toMatch(/unknown state variable/); expect(fields(wrong).join(' ')).toMatch(/sourceRefs/);
    const repeated = copy(network); repeated.actions[0].transitions[0].effects = [{ field: 'link', op: 'set', value: false }, { field: 'link', op: 'set', value: true }];
    expect(fields(repeated).join(' ')).toContain('each field only once');
  });
  it('finds unreachable goals and overlapping rules before a learner starts', () => {
    const impossible = copy(network); impossible.budget.limit = 1;
    expect(fields(impossible).join(' ')).toContain('No supported success');
    const overlap = copy(network), transition = overlap.actions.find(action => action.id === 'inspect-resolver')!.transitions[0];
    overlap.actions.find(action => action.id === 'inspect-resolver')!.transitions.unshift({ ...transition, id: 'duplicate-condition' });
    expect(fields(overlap).join(' ')).toContain('overlap in a reachable state');
  });
  it('rejects reachable numeric overflow and terminal starting states', () => {
    const overflow = copy(network); overflow.actions.find(action => action.id === 'reboot')!.transitions[0].effects = [{ field: 'disruption', op: 'add', value: 3 }];
    expect(fields(overflow).join(' ')).toContain('exceeds the domain');
    const solved = copy(network); (solved.variables.find(variable => variable.id === 'restored') as any).initial = true;
    expect(fields(solved).join(' ')).toContain('unfinished, playable');
  });
  it('allows drafts to be authored but refuses to play or grade unreviewed rules', () => {
    const draft = { ...network, reviewStatus: 'needs-review' as const };
    expect(fields(draft)).toEqual([]);
    expect(replayScenario(draft, initialScenarioResponse(draft))).toMatchObject({ phase: 'invalid', error: expect.stringContaining('author must review') });
    expect(evaluateScenario(draft, initialScenarioResponse(draft)).valid).toBe(false);
  });
});

describe('prediction and hypothesis commitments', () => {
  const activity = SCENARIO_PREDICTION_EXAMPLE;
  it('advertises only implemented source-reviewed contracts and retains generic compatibility', () => {
    for (const example of SCENARIO_MODE_EXAMPLES) {
      expect(fields(example)).toEqual([]);
      for (const ref of example.sourceRefs) expect(SCENARIO_MODE_SOURCES.find(source => source.id === ref.sourceId)?.text).toContain(ref.evidence);
    }
    expect(getScenarioCapabilities(network)).toEqual([]);
    expect(getScenarioCapabilities(activity)).toEqual(['prediction', 'hypothesis']);
    expect(getScenarioCapabilities(SCENARIO_CAMPAIGN_EXAMPLE)).toEqual(['campaign', 'planning', 'transfer-debrief']);
  });
  it('requires an initial commitment before revealing a discriminating test', () => {
    const initial = initialScenarioResponse(activity);
    expect(advanceScenario(activity, initial, 'test-address')).toMatchObject({ success: false, error: expect.stringContaining('Commit a prediction') });
    const response = commit(activity, initial, { type: 'prediction', choiceId: 'link-fault' });
    expect(recordScenarioCommitment(activity, response, { type: 'prediction', choiceId: 'resolver-fault' }).success).toBe(false);
    expect(recordScenarioCommitment(activity, response, { type: 'hypothesis-revision', choiceId: 'resolver-fault' })).toMatchObject({ success: false, error: expect.stringContaining('Observe') });
  });
  it('accepts an evidence-supported revision of an initially wrong prediction', () => {
    let response = commit(activity, initialScenarioResponse(activity), { type: 'prediction', choiceId: 'link-fault' });
    response = play(activity, ['test-address', 'inspect-resolver'], response);
    response = commit(activity, response, { type: 'hypothesis-revision', choiceId: 'resolver-fault' });
    response = commit(activity, response, { type: 'outcome-review', choiceId: 'contrasting-evidence' });
    response = play(activity, ['replace-resolver', 'verify-lookup'], response);
    response.selectedEvidenceIds = ['address-ok', 'resolver-stale', 'lookup-ok'];
    expect(evaluateScenario(activity, response)).toMatchObject({ correct: true, score: 2, maxScore: 2 });
    expect(replayScenario(activity, response).prediction?.history.map(entry => entry.atStep)).toEqual([0, 2, 2]);
    expect(initialScenarioResponse(activity, JSON.parse(JSON.stringify(response)))).toEqual({ ...response });
  });
  it('rejects manufactured late commitments and unsupported outcome reviews', () => {
    const late = { ...initialScenarioResponse(activity), actions: ['test-address'], commitments: [{ type: 'prediction', choiceId: 'resolver-fault', atStep: 1 }] };
    expect(replayScenario(activity, late)).toMatchObject({ phase: 'invalid', error: expect.stringContaining('Commit a prediction') });
    let response = commit(activity, initialScenarioResponse(activity), { type: 'prediction', choiceId: 'resolver-fault' });
    response = play(activity, ['test-address', 'inspect-resolver', 'replace-resolver', 'verify-lookup'], response);
    response = commit(activity, response, { type: 'hypothesis-revision', choiceId: 'resolver-fault' });
    response = commit(activity, response, { type: 'outcome-review', choiceId: 'everything-proven' });
    response.selectedEvidenceIds = ['address-ok', 'resolver-stale', 'lookup-ok'];
    expect(evaluateScenario(activity, response)).toMatchObject({ correct: false, score: 1, maxScore: 2 });
  });
  it('does not accept an outcome that was already visible before prediction', () => {
    const invalid = copy(activity); invalid.scenarioPresentation!.prediction!.outcomeObservationIds = ['complaint'];
    expect(fields(invalid).join(' ')).toContain('discovered after committing');
  });
});

describe('campaign planning and transfer debrief', () => {
  const activity = SCENARIO_CAMPAIGN_EXAMPLE;
  function firstStage() {
    let response = commit(activity, initialScenarioResponse(activity), { type: 'plan', stageId: 'establish-control', actionIds: ['inspect-notebook'] });
    response = play(activity, ['inspect-notebook'], response);
    response = commit(activity, response, { type: 'plan-revision', stageId: 'establish-control', actionIds: ['balance-water'], reasonId: 'new-evidence' });
    return play(activity, ['balance-water'], response);
  }
  it('requires a committed ordered plan and an explicit reason to change it', () => {
    const initial = initialScenarioResponse(activity);
    expect(advanceScenario(activity, initial, 'inspect-notebook')).toMatchObject({ success: false, error: expect.stringContaining('Commit an action plan') });
    const response = commit(activity, initial, { type: 'plan', stageId: 'establish-control', actionIds: ['inspect-notebook', 'balance-water'] });
    expect(advanceScenario(activity, response, 'read-old-chart')).toMatchObject({ success: false, error: expect.stringContaining('Follow the next planned') });
    expect(recordScenarioCommitment(activity, response, { type: 'plan-revision', stageId: 'establish-control', actionIds: ['read-old-chart'], reasonId: 'invented' }).success).toBe(false);
  });
  it('retains plan revisions and blocks stage changes until the reviewed debrief', () => {
    let response = firstStage();
    expect(replayScenario(activity, response).campaign?.plans).toHaveLength(2);
    expect(advanceScenario(activity, response, 'prepare-transfer-case').success).toBe(false);
    response = commit(activity, response, { type: 'debrief', stageId: 'establish-control', choiceId: 'causal-proof' });
    expect(replayScenario(activity, response).campaign?.stageIndex).toBe(0);
    response = commit(activity, response, { type: 'debrief', stageId: 'establish-control', choiceId: 'alternative-explanation' });
    expect(replayScenario(activity, response).campaign?.stageIndex).toBe(1);
    expect(initialScenarioResponse(activity, JSON.parse(JSON.stringify(response)))).toEqual(response);
  });
  it('applies the principle in changed state and requires a final transfer debrief', () => {
    let response = commit(activity, firstStage(), { type: 'debrief', stageId: 'establish-control', choiceId: 'alternative-explanation' });
    const planned = ['prepare-transfer-case', 'balance-water', 'repeat-study', 'repeat-study', 'assess-study'];
    response = commit(activity, response, { type: 'plan', stageId: 'transfer-control', actionIds: planned });
    response = play(activity, planned, response);
    response.selectedEvidenceIds = ['water-mismatch', 'trial-one', 'trial-two', 'new-trays'];
    expect(replayScenario(activity, response)).toMatchObject({ phase: 'success', remaining: 0, state: { case: 'new-pair', supported: true }, campaign: { stageIndex: 1 } });
    expect(evaluateScenario(activity, response).correct).toBe(false);
    response = commit(activity, response, { type: 'debrief', stageId: 'transfer-control', choiceId: 'bounded-transfer' });
    expect(evaluateScenario(activity, response)).toMatchObject({ correct: true, score: 3, maxScore: 3 });
    expect(JSON.stringify(response).length).toBeLessThan(9500);
  });
  it('checks plan costs, action use limits and campaign solvability', () => {
    const initial = initialScenarioResponse(activity);
    expect(recordScenarioCommitment(activity, initial, { type: 'plan', stageId: 'establish-control', actionIds: ['inspect-notebook', 'inspect-notebook'] }).success).toBe(false);
    const invalid = copy(activity); invalid.scenarioPresentation!.campaign!.stages[0].actionIds = ['read-old-chart'];
    expect(fields(invalid).join(' ')).toContain('No supported success');
    const malformed = copy(activity); malformed.scenarioPresentation!.campaign!.stages[1].transfer = false;
    expect(fields(malformed).join(' ')).toContain('changed context');
  });
  it('saves unfinished planning drafts and rejects unsupported draft actions', () => {
    const draft = { ...initialScenarioResponse(activity), modeDraft: { stageId: 'establish-control', plannedActionIds: ['inspect-notebook', 'balance-water'], revisionReasonId: 'new-evidence' } };
    expect(initialScenarioResponse(activity, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(replayScenario(activity, { ...draft, modeDraft: { plannedActionIds: ['execute-code'] } }).phase).toBe('invalid');
  });
});

describe('guided scene authoring', () => {
  const source = { id: 'box-lab', status: 'ready' as const, text: 'In this authored box lab, the box begins sealed. Inspecting its label costs one unit and reveals a matching compartment code. Selecting the matching compartment costs one unit and opens it. The budget is two units and two actions. Success requires the label observation and the opened compartment observation.' };
  const draft: SceneScenarioDraft = {
    id: 'box-case', title: 'A labelled box', instruction: 'Inspect the box, then open the matching compartment.', objective: 'Open the matching compartment and support the choice with observations.', sourceId: source.id, evidence: source.text, budget: 2, maxSteps: 2,
    scenes: [{ id: 'start', label: 'Sealed box', observation: 'The box is sealed.', ending: 'continue' }, { id: 'inspected', label: 'Label observed', observation: 'The label names compartment A.', ending: 'continue' }, { id: 'opened', label: 'Matching compartment opened', observation: 'Compartment A is open.', ending: 'success' }],
    actions: [{ id: 'inspect', label: 'Inspect the label', from: 'start', to: 'inspected', cost: 1, consequence: 'The compartment code is now visible.' }, { id: 'open', label: 'Open the matching compartment', from: 'inspected', to: 'opened', cost: 1, consequence: 'The matching compartment opens.' }], requiredSceneIds: ['inspected', 'opened'],
  };
  it('compiles explicit scenes and observations while requiring author review', () => {
    const activity = buildSceneScenario(draft, source);
    expect(activity.reviewStatus).toBe('needs-review'); expect(fields(activity)).toEqual([]);
    expect(activity.sourceRefs).toEqual([{ sourceId: source.id, evidence: source.text }]);
    const reviewed = { ...activity, reviewStatus: 'reviewed' as const };
    const response = play(reviewed, ['inspect', 'open']);
    expect(evaluateScenario(reviewed, { ...response, selectedEvidenceIds: ['ob-inspected', 'ob-opened'] }).correct).toBe(true);
  });
  it('rejects missing source evidence, invalid routes and impossible budgets', () => {
    expect(() => buildSceneScenario({ ...draft, evidence: 'A claim absent from the source.' }, source)).toThrow('exact passage');
    expect(() => buildSceneScenario({ ...draft, actions: [{ ...draft.actions[0], to: 'missing' }, draft.actions[1]] }, source)).toThrow('existing scenes');
    expect(() => buildSceneScenario({ ...draft, budget: 1 }, source)).toThrow('No supported success');
  });
  it('rejects duplicate scene labels and requires evidence for a conclusion', () => {
    expect(() => buildSceneScenario({ ...draft, scenes: draft.scenes.map(scene => ({ ...scene, label: 'Same name' })) }, source)).toThrow('distinct identifier and name');
    expect(() => buildSceneScenario({ ...draft, requiredSceneIds: [] }, source)).toThrow('supporting evidence');
  });
});

describe('deterministic state, evidence and consequences', () => {
  it('requires a genuine investigation, outcome verification and selected supporting evidence', () => {
    const response = solveNetwork(), snapshot = replayScenario(network, response);
    expect(snapshot).toMatchObject({ phase: 'success', spent: 5, remaining: 1, state: { resolver: 'correct', restored: true, disruption: 0 } });
    expect(snapshot.history.map(entry => entry.transitionId)).toEqual(['address', 'stale', 'replace', 'restored']);
    expect(evaluateScenario(network, response)).toMatchObject({ correct: false, score: 0 });
    const supported = { ...response, selectedEvidenceIds: ['address-ok', 'resolver-stale', 'lookup-ok'] };
    expect(evaluateScenario(network, supported)).toMatchObject({ valid: true, correct: true, outcome: 'correct', score: 1, maxScore: 1 });
    expect(evaluateScenario(network, { ...supported, selectedEvidenceIds: [...supported.selectedEvidenceIds, 'complaint'] })).toMatchObject({ correct: false, score: 0 });
  });
  it('preserves action selection, partial history and collected evidence across save/resume', () => {
    const partial = { ...play(network, ['test-address', 'inspect-resolver']), selectedEvidenceIds: ['address-ok'], selectedActionId: 'replace-resolver' };
    const restored = initialScenarioResponse(network, JSON.parse(JSON.stringify(partial)));
    expect(restored).toEqual(partial); expect(replayScenario(network, restored)).toEqual(replayScenario(network, partial));
    const complete = play(network, ['replace-resolver', 'verify-lookup'], restored);
    expect(replayScenario(network, complete).history).toHaveLength(4);
  });
  it('enforces prerequisites without charging the budget or changing the input response', () => {
    const response = initialScenarioResponse(network), before = JSON.stringify(response);
    expect(advanceScenario(network, response, 'replace-resolver')).toMatchObject({ success: false, error: expect.stringContaining('prerequisites') });
    expect(JSON.stringify(response)).toBe(before); expect(replayScenario(network, response).spent).toBe(0);
    expect(scenarioAvailableActions(network, response).find(item => item.action.id === 'replace-resolver')?.available).toBe(false);
  });
  it('rejects repeat farming, unknown actions and extra decisions after an ending', () => {
    const first = play(network, ['test-address']);
    expect(advanceScenario(network, first, 'test-address')).toMatchObject({ success: false, error: expect.stringContaining('use limit') });
    expect(advanceScenario(network, first, 'invented-action').success).toBe(false);
    const complete = solveNetwork();
    expect(replayScenario(network, { ...complete, actions: [...complete.actions, 'inspect-cable'] })).toMatchObject({ phase: 'invalid', error: expect.stringContaining('ended') });
  });
  it('records unsuccessful consequences and respects finite budgets', () => {
    const response = play(network, ['verify-lookup', 'reboot', 'test-address', 'inspect-resolver']);
    const result = replayScenario(network, response);
    expect(result.phase).toBe('exhausted'); expect(result.remaining).toBe(0); expect(result.state.restored).toBe(false);
    expect(result.observationIds).toContain('lookup-failed'); expect(evaluateScenario(network, response).score).toBe(0);
    const reset = play(network, ['factory-reset']); expect(replayScenario(network, reset).phase).toBe('failed');
    expect(evaluateScenario(network, reset).feedback).toContain('stopping condition');
  });
  it('replays the controlled-study case with repeated observations and a bounded conclusion', () => {
    const response = play(study, ['inspect-notebook', 'balance-water', 'repeat-study', 'repeat-study', 'assess-study']);
    expect(replayScenario(study, response)).toMatchObject({ phase: 'success', spent: 7, remaining: 0, state: { trials: 2, integrity: 2 } });
    expect(evaluateScenario(study, { ...response, selectedEvidenceIds: ['water-mismatch', 'trial-one', 'trial-two'] }).correct).toBe(true);
    const confounded = play(study, ['repeat-study', 'repeat-study']);
    expect(replayScenario(study, confounded)).toMatchObject({ phase: 'failed', state: { integrity: 0 } });
  });
  it('does not trust supplied state, history, discovered evidence or scores', () => {
    const initial = initialScenarioResponse(network);
    const forged = { ...initial, state: { restored: true }, score: 99999, spent: -500, observationIds: ['lookup-ok'], history: [{ transitionId: 'restored' }] };
    expect(evaluateScenario(network, forged)).toMatchObject({ correct: false, score: 0 });
    expect(replayScenario(network, { ...initial, selectedEvidenceIds: ['lookup-ok'] })).toMatchObject({ phase: 'invalid', error: expect.stringContaining('discovered') });
    expect(replayScenario(network, { ...initial, actions: Array(25).fill('test-address') }).phase).toBe('invalid');
  });
  it('resets stale saves on model changes but preserves them through presentation changes', () => {
    const response = play(network, ['test-address']);
    const renamed = { ...network, title: 'Another display title', explanation: 'A different explanation.' };
    expect(scenarioFingerprint(renamed)).toBe(scenarioFingerprint(network)); expect(initialScenarioResponse(renamed, response).actions).toHaveLength(1);
    const changed = copy(network); changed.budget.limit = 7;
    const reset = initialScenarioResponse(changed, response);
    expect(reset.actions).toEqual([]); expect(reset.notice).toContain('rules changed');
  });
  it('caps branching complexity and never evaluates executable user content', () => {
    const unsupported = copy(network); (unsupported.actions[0] as any).script = 'globalThis.evil = true';
    expect(fields(unsupported).join(' ')).toContain('unknown field');
    const deep = copy(network); let condition: any = { op: 'eq', field: 'link', value: true }; for (let i = 0; i < 7; i++) condition = { op: 'not', rule: condition };
    deep.actions[0].guard = condition; expect(fields(deep).join(' ')).toContain('complexity');
  });
});


it('rejects a prediction contract that leaves an outcome-revealing action unguarded', () => {
  const activity = structuredClone(SCENARIO_PREDICTION_EXAMPLE);
  activity.scenarioPresentation!.prediction!.beforeActionIds = ['test-address'];
  expect(validateScenarioFields(activity as unknown as Record<string, unknown>).join(' ')).toContain('every action revealing an outcome');
});
