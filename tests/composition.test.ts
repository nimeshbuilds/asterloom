import { describe, expect, it } from 'vitest';
import { evaluateComposition, initialCompositionResponse, validateCompositionFields } from '../src/lib/compositionEngine';
import type { ConstructionActivity, ConstructionBuild, ConstructionResponse, ExplanationActivity, ExplanationResponse } from '../src/lib/compositionEngine';
import { CLEAN_DATA_CONSTRUCTION, GARDEN_CONSTRUCTION, PLANT_EXPLANATION, SECURITY_EXPLANATION, COMPOSITION_EXAMPLES, COMPOSITION_EXAMPLE_SOURCE, INVALID_COMPOSITION_FIXTURES, explanationSolution } from '../src/lib/compositionExamples';
const clone = <T>(value: T): T => structuredClone(value);
const fields = (activity: unknown) => validateCompositionFields(activity as Record<string, unknown>);

describe('bounded source-backed composition models', () => {
  it('ships two solvable construction and two explanation fixtures with exact provenance', () => {
    expect(COMPOSITION_EXAMPLES.filter(activity => activity.kind === 'construction')).toHaveLength(2);
    expect(COMPOSITION_EXAMPLES.filter(activity => activity.kind === 'explanation')).toHaveLength(2);
    for (const activity of COMPOSITION_EXAMPLES) {
      expect(fields(activity), activity.id).toEqual([]);
      for (const reference of activity.sourceRefs) expect(COMPOSITION_EXAMPLE_SOURCE.text.includes(reference.evidence)).toBe(true);
    }
  });
  for (const fixture of INVALID_COMPOSITION_FIXTURES) it(`rejects ${fixture.name}`, () => expect(fields(fixture.activity).length).toBeGreaterThan(0));
  it('rejects executable or unknown fields at each model level', () => {
    expect(fields({...CLEAN_DATA_CONSTRUCTION, script: 'run()'})).not.toEqual([]);
    const activity = clone(CLEAN_DATA_CONSTRUCTION) as ConstructionActivity & {components: (ConstructionActivity['components'][number] & {onDrop?: string})[]};
    activity.components[0].onDrop = 'execute';
    expect(fields(activity).join(' ')).toContain('unknown field');
  });
  it('rejects duplicate, forbidden, non-finite and oversized definitions', () => {
    expect(fields({...CLEAN_DATA_CONSTRUCTION, components: [...CLEAN_DATA_CONSTRUCTION.components, CLEAN_DATA_CONSTRUCTION.components[0]]}).join(' ')).toContain('duplicate');
    expect(fields({...CLEAN_DATA_CONSTRUCTION, resources: [{...CLEAN_DATA_CONSTRUCTION.resources[0], id: '__proto__'}]})).not.toEqual([]);
    expect(fields({...CLEAN_DATA_CONSTRUCTION, resources: [{...CLEAN_DATA_CONSTRUCTION.resources[0], limit: Infinity}]})).not.toEqual([]);
    expect(fields({...PLANT_EXPLANATION, pieces: Array(65).fill(PLANT_EXPLANATION.pieces[0])})).not.toEqual([]);
  });
  it('requires an author-tested witness and rejects unknown reference-build ports', () => {
    expect(fields({...CLEAN_DATA_CONSTRUCTION, referenceBuilds: []})).not.toEqual([]);
    const activity = clone(CLEAN_DATA_CONSTRUCTION); activity.referenceBuilds[0].edges[0].fromPort = 'imaginary';
    expect(fields(activity).join(' ')).toContain('existing component');
  });
  it('requires evidence links on each factual component and rule', () => {
    const activity = clone(GARDEN_CONSTRUCTION); activity.components[0].evidenceRefs = [];
    expect(fields(activity).join(' ')).toContain('evidenceRefs');
    const explanation = clone(PLANT_EXPLANATION); explanation.arguments[0].alternatives[0].evidenceRefs = [50];
    expect(fields(explanation).join(' ')).toContain('evidenceRefs');
  });
  it('rejects a rebuttal without a counterpoint and duplicate alternatives', () => {
    const activity = clone(SECURITY_EXPLANATION); delete activity.arguments[0].alternatives[0].counterpointId;
    expect(fields(activity).join(' ')).toContain('rebuttal requires');
    const duplicate = clone(PLANT_EXPLANATION); duplicate.arguments[0].alternatives.push({...duplicate.arguments[0].alternatives[0], id: 'same-solution'});
    expect(fields(duplicate).join(' ')).toContain('Duplicate explanation');
  });
});

describe('construction evaluates the built system, not a memorized layout', () => {
  it('accepts alternative components and entirely different valid network topologies', () => {
    for (const activity of [CLEAN_DATA_CONSTRUCTION, GARDEN_CONSTRUCTION]) for (const witness of activity.referenceBuilds) {
      expect(evaluateComposition(activity, witness).correct).toBe(true);
      const moved = clone(witness); moved.instances.forEach((item, index) => {item.x = index * 10; item.y = 90;});
      expect(evaluateComposition(activity, moved).correct).toBe(true);
    }
  });
  it('does not let a type-invalid shortcut satisfy the route requirement', () => {
    const response = clone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]);
    response.edges = [{from: 'start', fromPort: 'out', to: 'finish', toPort: 'in'}];
    const result = evaluateComposition(CLEAN_DATA_CONSTRUCTION, response);
    expect(result.outcome).toBe('retry');
    expect(result.details.find(detail => detail.id === 'wiring')?.correct).toBe(false);
    expect(result.details.find(detail => detail.id === 'requirement-clean-route')?.correct).toBe(false);
  });
  it('checks direction and port capacity independently of reachability', () => {
    const response = clone(GARDEN_CONSTRUCTION.referenceBuilds[0]); response.instances.find(item => item.id === 'pump')!.componentId = 'small-pump';
    const result = evaluateComposition(GARDEN_CONSTRUCTION, response);
    expect(result.details.find(detail => detail.id === 'requirement-pump-route')?.correct).toBe(true);
    expect(result.details.find(detail => detail.id === 'wiring')?.correct).toBe(false);
    expect(result.correct).toBe(false);
    const reverse = clone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]); reverse.edges[0] = {from: 'process', fromPort: 'in', to: 'start', toPort: 'out'};
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, reverse).details.find(detail => detail.id === 'wiring')?.correct).toBe(false);
  });
  it('requires every destination and an actual intermediate pump', () => {
    const response = clone(GARDEN_CONSTRUCTION.referenceBuilds[0]); response.edges.pop();
    expect(evaluateComposition(GARDEN_CONSTRUCTION, response).details.find(detail => detail.id === 'requirement-pump-route')?.correct).toBe(false);
    response.edges.push({from: 'tank', fromPort: 'out', to: 'bed-b', toPort: 'in'});
    expect(evaluateComposition(GARDEN_CONSTRUCTION, response).details.find(detail => detail.id === 'requirement-pump-route')?.correct).toBe(false);
  });
  it('checks total resources and inventory limits, including disconnected extra parts', () => {
    const response = clone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]); response.instances.push({id: 'extra', componentId: 'validator', x: 30, y: 90});
    const result = evaluateComposition(CLEAN_DATA_CONSTRUCTION, response);
    expect(result.details.find(detail => detail.id === 'resource-credits')?.correct).toBe(false);
    expect(result.details.find(detail => detail.id === 'connected')?.correct).toBe(false);
    response.instances.push({id: 'extra2', componentId: 'validator', x: 40, y: 90});
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, response).details.find(detail => detail.id === 'limit-validator')?.correct).toBe(false);
  });
  it('detects forbidden cycles and bounds cycle-permitted traversal', () => {
    const activity = clone(GARDEN_CONSTRUCTION); activity.components.find(item => item.id === 'small-pump')!.ports.forEach(port => port.maxConnections = 3);
    const response = clone(activity.referenceBuilds[1]); response.edges.push({from: 'pump-a', fromPort: 'out', to: 'pump-b', toPort: 'in'}, {from: 'pump-b', fromPort: 'out', to: 'pump-a', toPort: 'in'});
    expect(evaluateComposition(activity, response).details.find(detail => detail.id === 'cycles')?.correct).toBe(false);
    activity.allowCycles = true;
    expect(evaluateComposition(activity, response).correct).toBe(true);
  });
  it('rejects missing instances, duplicate edges, invented fields and excessive responses safely', () => {
    const response = clone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]); response.edges.push({...response.edges[0]});
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, response).outcome).toBe('invalid');
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, {instances: [], edges: [{from: 'fake', fromPort: 'out', to: 'fake2', toPort: 'in'}]}).outcome).toBe('invalid');
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, {...CLEAN_DATA_CONSTRUCTION.referenceBuilds[0], score: 100}).outcome).toBe('invalid');
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, {instances: Array(33).fill(null), edges: []}).outcome).toBe('invalid');
  });
  it('keeps the scoring denominator stable as learners add nodes and edges', () => {
    const activity = GARDEN_CONSTRUCTION;
    expect(evaluateComposition(activity, activity.referenceBuilds[0]).maxScore).toBe(evaluateComposition(activity, activity.referenceBuilds[1]).maxScore);
    expect(evaluateComposition(activity, initialCompositionResponse(activity)).maxScore).toBe(evaluateComposition(activity, activity.referenceBuilds[0]).maxScore);
  });
});

describe('explanation checks coherent author-validated alternatives', () => {
  it('accepts all prepared alternatives and unordered evidence sets', () => {
    for (const activity of [PLANT_EXPLANATION, SECURITY_EXPLANATION]) for (let index = 0; index < activity.arguments[0].alternatives.length; index++) {
      const response = explanationSolution(activity, index); response.arguments[activity.arguments[0].id].evidenceIds.reverse();
      expect(evaluateComposition(activity, response).correct).toBe(true);
    }
  });
  it('rejects a chimera assembled from independently valid but incompatible pieces', () => {
    const response = explanationSolution(PLANT_EXPLANATION); response.arguments.investigation.warrantId = 'warrant-controls';
    const result = evaluateComposition(PLANT_EXPLANATION, response);
    expect(result.correct).toBe(false); expect(result.score).toBe(0); expect(result.maxScore).toBe(1);
  });
  it('does not accept unsupported universal conclusions or extra irrelevant evidence', () => {
    const response = explanationSolution(PLANT_EXPLANATION); response.arguments.investigation.claimId = 'claim-universal';
    expect(evaluateComposition(PLANT_EXPLANATION, response).correct).toBe(false);
    const extra = explanationSolution(PLANT_EXPLANATION); extra.arguments.investigation.evidenceIds.push('evidence-controls');
    expect(evaluateComposition(PLANT_EXPLANATION, extra).correct).toBe(false);
  });
  it('requires the prepared counterpoint and its relevant response', () => {
    const response = explanationSolution(SECURITY_EXPLANATION); response.arguments.review.rebuttalId = '';
    expect(evaluateComposition(SECURITY_EXPLANATION, response).correct).toBe(false);
    response.arguments.review.rebuttalId = 'response-context';
    expect(evaluateComposition(SECURITY_EXPLANATION, response).correct).toBe(true);
  });
  it('treats unfinished valid chains as retry and malformed role assignments as invalid', () => {
    expect(evaluateComposition(PLANT_EXPLANATION, initialCompositionResponse(PLANT_EXPLANATION)).outcome).toBe('retry');
    const response = explanationSolution(PLANT_EXPLANATION); response.arguments.investigation.warrantId = 'evidence-height';
    expect(evaluateComposition(PLANT_EXPLANATION, response).outcome).toBe('invalid');
    const duplicate = explanationSolution(PLANT_EXPLANATION); duplicate.arguments.investigation.evidenceIds.push('evidence-height');
    expect(evaluateComposition(PLANT_EXPLANATION, duplicate).outcome).toBe('invalid');
  });
});

describe('portable deterministic saved composition state', () => {
  it('round trips node positions, connections and unfinished connection controls', () => {
    const response = initialCompositionResponse(GARDEN_CONSTRUCTION, GARDEN_CONSTRUCTION.referenceBuilds[0]) as ConstructionResponse;
    response.draft = {selectedInstanceId: 'pump', from: 'pump', fromPort: 'out', to: 'bed-b', toPort: 'in', message: 'Continue the connection.'};
    expect(initialCompositionResponse(GARDEN_CONSTRUCTION, JSON.parse(JSON.stringify(response)))).toEqual(response);
  });
  it('round trips an unfinished argument, selected piece and active role', () => {
    const response = initialCompositionResponse(SECURITY_EXPLANATION) as ExplanationResponse;
    response.arguments.review.claimId = 'claim-b'; response.draft.selectedPieceId = 'evidence-b'; response.draft.role = 'evidence';
    expect(initialCompositionResponse(SECURITY_EXPLANATION, JSON.parse(JSON.stringify(response)))).toEqual(response);
  });
  it('does not mutate models or responses, and ignores submitted grade claims only by rejecting them', () => {
    const model = JSON.stringify(CLEAN_DATA_CONSTRUCTION), response: ConstructionBuild = clone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]), original = JSON.stringify(response);
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, response)).toEqual(evaluateComposition(CLEAN_DATA_CONSTRUCTION, response));
    expect(JSON.stringify(CLEAN_DATA_CONSTRUCTION)).toBe(model); expect(JSON.stringify(response)).toBe(original);
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, {...response, correct: true}).valid).toBe(false);
  });
  it('restores a malformed saved draft safely without claiming correctness', () => {
    const restored = initialCompositionResponse(CLEAN_DATA_CONSTRUCTION, {instances: [{id: 'x'}], edges: []});
    expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION, restored).correct).toBe(false);
    expect(() => initialCompositionResponse(PLANT_EXPLANATION, {arguments: null, draft: {role: 'invalid'}})).not.toThrow();
  });
});

describe('route constraint edge cases', () => {
  it('supports a directed route between different instances of the same component type', () => {
    const activity: ConstructionActivity = {...clone(CLEAN_DATA_CONSTRUCTION), resources: [], components: [
      {id: 'relay', label: 'Relay', description: 'A typed forwarding component.', maxInstances: 2, costs: {}, evidenceRefs: [0], ports: [{id: 'in', label: 'Input', direction: 'in', type: 'signal', maxConnections: 1}, {id: 'out', label: 'Output', direction: 'out', type: 'signal', maxConnections: 1}]},
      {id: 'spare', label: 'Spare', description: 'An optional spare endpoint.', maxInstances: 1, costs: {}, evidenceRefs: [0], ports: [{id: 'in', label: 'Input', direction: 'in', type: 'signal', maxConnections: 1}]},
    ], requirements: [{id: 'relay-route', kind: 'path', label: 'A directed connection between relays', from: ['relay'], to: ['relay'], through: [], avoid: [], scope: 'some', evidenceRefs: [0]}], referenceBuilds: [{instances: [{id: 'first', componentId: 'relay', x: 20, y: 50}, {id: 'second', componentId: 'relay', x: 80, y: 50}], edges: [{from: 'first', fromPort: 'out', to: 'second', toPort: 'in'}]}]};
    expect(fields(activity)).toEqual([]);
    expect(evaluateComposition(activity, activity.referenceBuilds[0]).correct).toBe(true);
    expect(evaluateComposition(activity, {...activity.referenceBuilds[0], edges: []}).correct).toBe(false);
  });
  it('requires intermediate stages in their stated order and respects forbidden component types', () => {
    const activity = clone(GARDEN_CONSTRUCTION);
    activity.requirements = activity.requirements.filter(rule => rule.kind === 'path');
    const route = activity.requirements[0]; if (route.kind !== 'path') throw new Error('Missing path fixture');
    route.through = [['small-pump'], ['branching-pump']];
    activity.resources[0].limit = 3;
    activity.referenceBuilds = [{instances: [{id: 'tank', componentId: 'reservoir', x: 12, y: 50}, {id: 'first', componentId: 'small-pump', x: 37, y: 50}, {id: 'second', componentId: 'branching-pump', x: 62, y: 50}, {id: 'bed', componentId: 'bed', x: 87, y: 50}], edges: [{from: 'tank', fromPort: 'out', to: 'first', toPort: 'in'}, {from: 'first', fromPort: 'out', to: 'second', toPort: 'in'}, {from: 'second', fromPort: 'out', to: 'bed', toPort: 'in'}]}];
    expect(fields(activity)).toEqual([]);
    const reverse = clone(activity.referenceBuilds[0]); reverse.instances.find(item => item.id === 'first')!.componentId = 'branching-pump'; reverse.instances.find(item => item.id === 'second')!.componentId = 'small-pump';
    expect(evaluateComposition(activity, reverse).details.find(detail => detail.id === 'requirement-pump-route')?.correct).toBe(false);
    const forbidden = clone(CLEAN_DATA_CONSTRUCTION); const cleanRoute = forbidden.requirements.find(rule => rule.kind === 'path')!;
    if (cleanRoute.kind !== 'path') throw new Error('Missing route'); cleanRoute.avoid = ['validator']; forbidden.referenceBuilds = [forbidden.referenceBuilds[0]];
    expect(fields(forbidden)).toEqual([]);
    expect(evaluateComposition(forbidden, CLEAN_DATA_CONSTRUCTION.referenceBuilds[1]).details.find(detail => detail.id === 'requirement-clean-route')?.correct).toBe(false);
  });
});
