import type { ActivityBase, Evaluation } from './structuredEngine';
import { evaluateExplanationMode, restoreExplanationMode, validateExplanationModes } from './compositionModes';
import type { CodeReviewContract, CodeReviewState, PartnerContract, PartnerState } from './compositionModes';

/** Declarative, bounded composition models. No expressions or executable source are accepted. */
export interface EvidenceAssociation { evidenceRefs: number[] }
export interface ConstructionPort { id: string; label: string; direction: 'in' | 'out'; type: string; maxConnections: number }
export interface ConstructionComponent extends EvidenceAssociation {
  id: string; label: string; description: string; maxInstances: number;
  ports: ConstructionPort[]; costs: Record<string, number>;
}
export interface ConstructionResource extends EvidenceAssociation { id: string; label: string; unit: string; limit: number }
interface ConstructionRequirementBase extends EvidenceAssociation { id: string; label: string }
export type ConstructionRequirement =
  | ConstructionRequirementBase & { kind: 'instances'; componentIds: string[]; minimum: number; maximum: number }
  | ConstructionRequirementBase & { kind: 'path'; from: string[]; to: string[]; through: string[][]; avoid: string[]; scope: 'some' | 'every-target' };
export interface ConstructionInstance { id: string; componentId: string; x: number; y: number }
export interface ConstructionEdge { from: string; fromPort: string; to: string; toPort: string }
export interface ConstructionBuild { instances: ConstructionInstance[]; edges: ConstructionEdge[] }
export interface ConstructionActivity extends ActivityBase {
  kind: 'construction'; components: ConstructionComponent[]; resources: ConstructionResource[];
  requirements: ConstructionRequirement[]; allowCycles: boolean; requireAllConnected: boolean;
  /** Author witnesses establish that the model can be solved; grading accepts any build satisfying the rules. */
  referenceBuilds: ConstructionBuild[];
}
export type ExplanationRole = 'claim' | 'evidence' | 'warrant' | 'counterpoint' | 'rebuttal';
export interface ExplanationPiece extends EvidenceAssociation { id: string; role: ExplanationRole; text: string }
export interface ExplanationAlternative extends EvidenceAssociation {
  id: string; claimId: string; evidenceIds: string[]; warrantId: string;
  counterpointId?: string; rebuttalId?: string; explanation: string;
}
export interface ExplanationArgument extends EvidenceAssociation {
  id: string; label: string; prompt: string; alternatives: ExplanationAlternative[];
}
export interface ExplanationActivity extends ActivityBase { kind: 'explanation'; pieces: ExplanationPiece[]; arguments: ExplanationArgument[]; partner?: PartnerContract; codeReview?: CodeReviewContract }
export type CompositionActivity = ConstructionActivity | ExplanationActivity;
export interface ConstructionResponse extends ConstructionBuild {
  draft: { selectedInstanceId: string; from: string; fromPort: string; to: string; toPort: string; message: string };
}
export interface ExplanationChain { claimId: string; evidenceIds: string[]; warrantId: string; counterpointId: string; rebuttalId: string }
export interface ExplanationResponse {
  arguments: Record<string, ExplanationChain>;
  partner?: PartnerState; codeReview?: CodeReviewState;
  draft: { selectedPieceId: string; activeArgumentId: string; role: ExplanationRole; message: string };
}
export type CompositionResponse = ConstructionResponse | ExplanationResponse;
const ROLES: ExplanationRole[] = ['claim', 'evidence', 'warrant', 'counterpoint', 'rebuttal'];
const BASE_FIELDS = ['version', 'id', 'kind', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'scaffoldIds', 'extractedFrom'];
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_INSTANCES = 32, MAX_EDGES = 96;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function id(value: unknown): value is string { return typeof value === 'string' && ID.test(value) && !BAD.has(value); }
function text(value: unknown, max = 4000): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function number(value: unknown, min = 0, max = 1e6, integer = false): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)); }
function list(value: unknown, min = 0, max = 40): value is unknown[] { return Array.isArray(value) && value.length >= min && value.length <= max; }
function fields(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) { for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field`); }
function records(value: unknown, path: string, errors: string[], min = 1, max = 40): Record<string, unknown>[] {
  if (!list(value, min, max)) { errors.push(`${path}: expected ${min}–${max} entries`); return []; }
  const result: Record<string, unknown>[] = [], seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!object(entry)) { errors.push(`${path}[${index}]: expected a plain object`); return; }
    result.push(entry);
    if (!id(entry.id)) errors.push(`${path}[${index}].id: invalid identifier`);
    else if (seen.has(entry.id)) errors.push(`${path}: duplicate identifier ${entry.id}`);
    else seen.add(entry.id);
  }); return result;
}
function references(value: unknown, ids: Set<unknown>, path: string, errors: string[], min = 1, max = 40) {
  if (!list(value, min, max) || value.some(item => !id(item) || !ids.has(item)) || new Set(value).size !== value.length) errors.push(`${path}: expected ${min}–${max} distinct known identifiers`);
}
function evidence(value: unknown, count: number, path: string, errors: string[]) {
  if (!list(value, 1, 20) || value.some(index => !number(index, 0, count - 1, true)) || new Set(value).size !== value.length) errors.push(`${path}.evidenceRefs: reference at least one existing source excerpt by its zero-based index`);
}
function cite(activity: CompositionActivity, refs: number[]): string { return ` Source ${refs.map(index => index + 1).join(', ')}.`; }
function invalid(message: string): Evaluation { return { valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: 0, feedback: message, details: [] }; }
function finalEvaluation(activity: CompositionActivity, details: Evaluation['details']): Evaluation {
  const score = details.filter(detail => detail.correct === true).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length,
    feedback: correct ? activity.explanation : 'Your work is saved. Inspect the checks below, revise the model, and test it again. The checks use the author’s source-backed rules.', details };
}
function edgeKey(edge: ConstructionEdge): string { return `${edge.from}:${edge.fromPort}>${edge.to}:${edge.toPort}`; }
function connectedTo(start: string, edges: ConstructionEdge[], directed = false): Set<string> {
  const found = new Set([start]), queue = [start];
  for (let index = 0; index < queue.length; index++) for (const edge of edges) {
    const next = edge.from === queue[index] ? edge.to : !directed && edge.to === queue[index] ? edge.from : '';
    if (next && !found.has(next)) { found.add(next); queue.push(next); }
  } return found;
}
function hasCycle(instances: ConstructionInstance[], edges: ConstructionEdge[]) {
  const remaining = new Set(instances.map(item => item.id));
  while (remaining.size) { const roots = [...remaining].filter(item => !edges.some(edge => edge.to === item && remaining.has(edge.from))); if (!roots.length) return true; roots.forEach(item => remaining.delete(item)); } return false;
}
function pathExists(activity: ConstructionActivity, build: ConstructionBuild, rule: Extract<ConstructionRequirement, {kind: 'path'}>, targetId: string, edges: ConstructionEdge[]) {
  const components = new Map(build.instances.map(item => [item.id, item.componentId]));
  const blocked = new Set(rule.avoid), states = new Set<string>(), queue: {node: string; stage: number; hops: number}[] = [];
  const advance = (component: string, stage: number) => stage < rule.through.length && rule.through[stage].includes(component) ? stage + 1 : stage;
  for (const item of build.instances) if (rule.from.includes(item.componentId) && !blocked.has(item.componentId)) {
    const stage = advance(item.componentId, 0); queue.push({node: item.id, stage, hops: 0}); states.add(`${item.id}:${stage}`);
  }
  // A finite node × stage state space bounds traversal even when the authored model permits cycles.
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.node === targetId && current.stage === rule.through.length && current.hops > 0) return true;
    for (const edge of edges) if (edge.from === current.node) {
      const component = components.get(edge.to)!; if (blocked.has(component)) continue;
      const stage = advance(component, current.stage), key = `${edge.to}:${stage}`;
      if (edge.to === targetId && stage === rule.through.length) return true;
      if (!states.has(key)) { states.add(key); queue.push({node: edge.to, stage, hops: current.hops + 1}); }
    }
  } return false;
}
/** Strict response parser; malformed or extra submitted facts never silently become an empty correct solution. */
function parseBuild(value: unknown, activity: ConstructionActivity, allowDraft = true): {value?: ConstructionBuild; errors: string[]} {
  const errors: string[] = [];
  if (!object(value)) return {errors: ['Build: expected a plain object.']};
  fields(value, ['instances', 'edges', ...(allowDraft ? ['draft', '_draft'] : [])], 'build', errors);
  if (!list(value.instances, 0, MAX_INSTANCES) || !list(value.edges, 0, MAX_EDGES)) return {errors: [`A build supports at most ${MAX_INSTANCES} components and ${MAX_EDGES} connections.`]};
  const seen = new Set<string>(), componentMap = new Map(activity.components.map(item => [item.id, item]));
  for (const item of value.instances) {
    if (!object(item)) { errors.push('Build component: expected an object.'); continue; }
    fields(item, ['id', 'componentId', 'x', 'y'], 'instance', errors);
    if (!id(item.id) || seen.has(item.id) || typeof item.componentId !== 'string' || !componentMap.has(item.componentId) || !number(item.x, 0, 100) || !number(item.y, 0, 100)) errors.push('Build components need unique IDs, known component types, and coordinates from 0 to 100.');
    if (typeof item.id === 'string') seen.add(item.id);
  }
  const instances = value.instances as ConstructionInstance[], instanceMap = new Map(instances.filter(object).map(item => [item.id, item]));
  const seenEdges = new Set<string>();
  for (const edge of value.edges) {
    if (!object(edge)) { errors.push('Connection: expected an object.'); continue; }
    fields(edge, ['from', 'fromPort', 'to', 'toPort'], 'edge', errors);
    const from = instanceMap.get(String(edge.from)), to = instanceMap.get(String(edge.to));
    const fromComponent = from && componentMap.get(from.componentId), toComponent = to && componentMap.get(to.componentId);
    if (!fromComponent?.ports.some(port => port.id === edge.fromPort) || !toComponent?.ports.some(port => port.id === edge.toPort)) errors.push('Every connection must name existing component instances and ports.');
    const key = edgeKey(edge as unknown as ConstructionEdge); if (seenEdges.has(key)) errors.push('Duplicate connections are not allowed.'); seenEdges.add(key);
  }
  return errors.length ? {errors} : {value: {instances, edges: value.edges as ConstructionEdge[]}, errors};
}
function evaluateBuild(activity: ConstructionActivity, build: ConstructionBuild): Evaluation {
  const details: Evaluation['details'] = [], instances = new Map(build.instances.map(item => [item.id, item]));
  const components = new Map(activity.components.map(item => [item.id, item]));
  const add = (id: string, correct: boolean, message: string) => details.push({id, correct, message});
  add('build-present', build.instances.length > 0, build.instances.length ? `${build.instances.length} components are in your model.` : 'Place components from the workshop into the model.');
  const allowedEdges: ConstructionEdge[] = [];
  build.edges.forEach((edge, index) => {
    const from = components.get(instances.get(edge.from)!.componentId)!, to = components.get(instances.get(edge.to)!.componentId)!;
    const out = from.ports.find(port => port.id === edge.fromPort)!, input = to.ports.find(port => port.id === edge.toPort)!;
    const correct = edge.from !== edge.to && out.direction === 'out' && input.direction === 'in' && out.type === input.type;
    if (correct) allowedEdges.push(edge);
    add(`edge-${index}`, correct, correct ? `${from.label} → ${to.label}: ${out.type} reaches a compatible input.` : `${from.label} → ${to.label}: connect an output to an input of the same type on another component. These ports are ${out.direction}/${out.type} and ${input.direction}/${input.type}.`);
  });
  activity.components.forEach(component => {
    const count = build.instances.filter(item => item.componentId === component.id).length;
    add(`limit-${component.id}`, count <= component.maxInstances, `${component.label}: ${count} placed; at most ${component.maxInstances} available.${cite(activity, component.evidenceRefs)}`);
  });
  build.instances.forEach(instance => components.get(instance.componentId)!.ports.forEach(port => {
    const used = build.edges.filter(edge => edge.from === instance.id && edge.fromPort === port.id || edge.to === instance.id && edge.toPort === port.id).length;
    add(`port-${instance.id}-${port.id}`, used <= port.maxConnections, `${components.get(instance.componentId)!.label} · ${port.label}: ${used}/${port.maxConnections} connections.${cite(activity, components.get(instance.componentId)!.evidenceRefs)}`);
  }));
  activity.resources.forEach(resource => {
    const used = build.instances.reduce((sum, item) => sum + (components.get(item.componentId)!.costs[resource.id] ?? 0), 0);
    add(`resource-${resource.id}`, used <= resource.limit + 1e-9, `${resource.label}: ${Number(used.toFixed(6))} of ${resource.limit} ${resource.unit} used.${cite(activity, resource.evidenceRefs)}`);
  });
  if (!activity.allowCycles) add('cycles', !hasCycle(build.instances, allowedEdges), 'The model must have no directed cycles.');
  if (activity.requireAllConnected) add('connected', build.instances.length > 0 && connectedTo(build.instances[0].id, allowedEdges).size === build.instances.length, 'Every placed component must belong to one connected model.');
  for (const requirement of activity.requirements) {
    if (requirement.kind === 'instances') {
      const count = build.instances.filter(item => requirement.componentIds.includes(item.componentId)).length;
      add(`requirement-${requirement.id}`, count >= requirement.minimum && count <= requirement.maximum, `${requirement.label}: ${count} placed; need ${requirement.minimum === requirement.maximum ? requirement.minimum : `${requirement.minimum}–${requirement.maximum}`}.${cite(activity, requirement.evidenceRefs)}`);
    } else {
      const targets = build.instances.filter(item => requirement.to.includes(item.componentId));
      const reached = targets.filter(target => pathExists(activity, build, requirement, target.id, allowedEdges));
      const correct = targets.length > 0 && (requirement.scope === 'every-target' ? reached.length === targets.length : reached.length > 0);
      add(`requirement-${requirement.id}`, correct, `${requirement.label}: ${reached.length}/${targets.length} destination components have the required directed route.${cite(activity, requirement.evidenceRefs)}`);
    }
  }
  // Structural details explain errors, but stable scoring prevents adding harmless ports or edges to inflate a result.
  const stable = details.filter(detail => !detail.id.startsWith('edge-') && !detail.id.startsWith('port-'));
  const wiring = details.filter(detail => detail.id.startsWith('edge-') || detail.id.startsWith('port-'));
  const summary = {id: 'wiring', correct: wiring.every(detail => detail.correct), message: wiring.every(detail => detail.correct) ? 'All connections respect port directions, types, and connection capacities.' : 'Some connections violate a port direction, type, or connection capacity.'};
  const result = finalEvaluation(activity, [...stable, summary]);
  return {...result, details: [...stable, summary, ...wiring.filter(detail => !detail.correct)]};
}

/** Base fields and source existence/exact provenance are validated by structuredEngine. */
export function validateCompositionFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], sourceRefs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const evidenceAt = (value: unknown, path: string) => evidence(value, sourceRefs.length, path, errors);
  if (input.kind === 'construction') {
    fields(input, [...BASE_FIELDS, 'components', 'resources', 'requirements', 'allowCycles', 'requireAllConnected', 'referenceBuilds'], 'activity', errors);
    if (typeof input.allowCycles !== 'boolean' || typeof input.requireAllConnected !== 'boolean') errors.push('allowCycles and requireAllConnected must be explicit booleans.');
    const resources = records(input.resources, 'resources', errors, 0, 8), resourceIds = new Set(resources.map(item => item.id));
    for (const resource of resources) {
      fields(resource, ['id', 'label', 'unit', 'limit', 'evidenceRefs'], 'resource', errors);
      if (!text(resource.label, 300) || !text(resource.unit, 80) || !number(resource.limit)) errors.push('resource: label, unit and a finite capacity from 0 to 1,000,000 are required.');
      evidenceAt(resource.evidenceRefs, `resource ${resource.id}`);
    }
    const components = records(input.components, 'components', errors, 2, 24), componentIds = new Set(components.map(item => item.id));
    for (const component of components) {
      fields(component, ['id', 'label', 'description', 'maxInstances', 'ports', 'costs', 'evidenceRefs'], 'component', errors);
      if (!text(component.label, 300) || !text(component.description, 2000) || !number(component.maxInstances, 1, 16, true)) errors.push('component: label, description and maxInstances (1–16) are required.');
      evidenceAt(component.evidenceRefs, `component ${component.id}`);
      for (const port of records(component.ports, `component ${component.id}.ports`, errors, 1, 8)) {
        fields(port, ['id', 'label', 'direction', 'type', 'maxConnections'], 'port', errors);
        if (!text(port.label, 120) || !['in', 'out'].includes(String(port.direction)) || !id(port.type) || !number(port.maxConnections, 1, 16, true)) errors.push('port: label, in/out direction, type identifier and maxConnections (1–16) are required.');
      }
      if (!object(component.costs) || Object.entries(component.costs).some(([key, value]) => !resourceIds.has(key) || !number(value))) errors.push(`component ${component.id}.costs: use known resource IDs and finite nonnegative costs.`);
    }
    for (const rule of records(input.requirements, 'requirements', errors, 1, 24)) {
      if (!text(rule.label, 500)) errors.push(`requirement ${rule.id}: label is required.`);
      evidenceAt(rule.evidenceRefs, `requirement ${rule.id}`);
      if (rule.kind === 'instances') {
        fields(rule, ['id', 'kind', 'label', 'componentIds', 'minimum', 'maximum', 'evidenceRefs'], 'requirement', errors);
        references(rule.componentIds, componentIds, 'requirement.componentIds', errors);
        if (!number(rule.minimum, 0, MAX_INSTANCES, true) || !number(rule.maximum, 0, MAX_INSTANCES, true) || Number(rule.maximum) < Number(rule.minimum)) errors.push('Instance requirements need 0 ≤ minimum ≤ maximum ≤ 32.');
        if (Array.isArray(rule.componentIds) && Number(rule.minimum) > components.filter(item => (rule.componentIds as unknown[]).includes(item.id)).reduce((sum, item) => sum + Number(item.maxInstances), 0)) errors.push('Instance requirement exceeds available components.');
      } else if (rule.kind === 'path') {
        fields(rule, ['id', 'kind', 'label', 'from', 'to', 'through', 'avoid', 'scope', 'evidenceRefs'], 'requirement', errors);
        references(rule.from, componentIds, 'path.from', errors); references(rule.to, componentIds, 'path.to', errors); references(rule.avoid, componentIds, 'path.avoid', errors, 0);
        if (!list(rule.through, 0, 8)) errors.push('path.through: expected up to eight ordered groups of acceptable component types.');
        else rule.through.forEach(group => references(group, componentIds, 'path.through group', errors));
        if (!['some', 'every-target'].includes(String(rule.scope))) errors.push('path.scope: use some or every-target.');
        if (Array.isArray(rule.avoid) && [...(Array.isArray(rule.from) ? rule.from : []), ...(Array.isArray(rule.to) ? rule.to : [])].some(item => (rule.avoid as unknown[]).includes(item))) errors.push('A path endpoint cannot also be forbidden.');
      } else errors.push('requirement.kind: only instances and path are supported.');
    }
    if (!list(input.referenceBuilds, 1, 6)) errors.push('referenceBuilds: provide 1–6 author-tested witness builds.');
    if (!errors.length) for (let index = 0; index < (input.referenceBuilds as unknown[]).length; index++) {
      const activity = input as unknown as ConstructionActivity, parsed = parseBuild((input.referenceBuilds as unknown[])[index], activity, false);
      if (!parsed.value) errors.push(`referenceBuilds[${index}]: ${parsed.errors.join(' ')}`);
      else { const result = evaluateBuild(activity, parsed.value); if (!result.correct) errors.push(`referenceBuilds[${index}] does not satisfy the model: ${result.details.filter(detail => !detail.correct).map(detail => detail.message).join(' ')}`); }
    }
  } else if (input.kind === 'explanation') {
    fields(input, [...BASE_FIELDS, 'pieces', 'arguments', 'partner', 'codeReview'], 'activity', errors);
    const pieces = records(input.pieces, 'pieces', errors, 3, 64), pieceMap = new Map(pieces.map(piece => [piece.id, piece]));
    for (const piece of pieces) {
      fields(piece, ['id', 'role', 'text', 'evidenceRefs'], 'piece', errors);
      if (!ROLES.includes(piece.role as ExplanationRole) || !text(piece.text, 3000)) errors.push('piece: use a supported argument role and non-empty text up to 3,000 characters.');
      evidenceAt(piece.evidenceRefs, `piece ${piece.id}`);
      if (piece.role === 'evidence' && Array.isArray(piece.evidenceRefs) && !piece.evidenceRefs.some(index => number(index, 0, sourceRefs.length - 1, true) && object(sourceRefs[index]) && typeof sourceRefs[index].evidence === 'string' && typeof piece.text === 'string' && sourceRefs[index].evidence.includes(piece.text))) errors.push(`piece ${piece.id}: evidence text must quote an associated source excerpt exactly.`);
    }
    for (const argument of records(input.arguments, 'arguments', errors, 1, 8)) {
      fields(argument, ['id', 'label', 'prompt', 'alternatives', 'evidenceRefs'], 'argument', errors);
      if (!text(argument.label, 300) || !text(argument.prompt, 2000)) errors.push('argument: label and prompt are required.');
      evidenceAt(argument.evidenceRefs, `argument ${argument.id}`);
      const signatures = new Set<string>();
      for (const alternative of records(argument.alternatives, 'argument.alternatives', errors, 1, 12)) {
        fields(alternative, ['id', 'claimId', 'evidenceIds', 'warrantId', 'counterpointId', 'rebuttalId', 'explanation', 'evidenceRefs'], 'alternative', errors);
        const roleReference = (value: unknown, role: ExplanationRole) => { if (!id(value) || pieceMap.get(value)?.role !== role) errors.push(`alternative ${alternative.id}: ${role} must name a piece of that role.`); };
        roleReference(alternative.claimId, 'claim'); roleReference(alternative.warrantId, 'warrant');
        if (!list(alternative.evidenceIds, 1, 8) || new Set(alternative.evidenceIds).size !== alternative.evidenceIds.length) errors.push('alternative.evidenceIds: expected 1–8 distinct evidence pieces.');
        else alternative.evidenceIds.forEach(piece => roleReference(piece, 'evidence'));
        if (alternative.counterpointId !== undefined) roleReference(alternative.counterpointId, 'counterpoint');
        if (alternative.rebuttalId !== undefined) { roleReference(alternative.rebuttalId, 'rebuttal'); if (alternative.counterpointId === undefined) errors.push('A rebuttal requires a counterpoint in the same alternative.'); }
        if (!text(alternative.explanation, 3000)) errors.push('alternative.explanation: source-grounded feedback is required.');
        evidenceAt(alternative.evidenceRefs, `alternative ${alternative.id}`);
        if (Array.isArray(alternative.evidenceIds)) { const signature = JSON.stringify([alternative.claimId, [...alternative.evidenceIds].sort(), alternative.warrantId, alternative.counterpointId ?? '', alternative.rebuttalId ?? '']); if (signatures.has(signature)) errors.push('Duplicate explanation alternatives are not allowed.'); signatures.add(signature); }
      }
    }
    if (!errors.length) errors.push(...validateExplanationModes(input));
  } else errors.push('Unsupported composition kind.');
  return errors;
}
function parseExplanation(value: unknown, activity: ExplanationActivity): {value?: Record<string, ExplanationChain>; errors: string[]} {
  const errors: string[] = [];
  if (!object(value) || !object(value.arguments)) return {errors: ['Choose pieces for the argument before checking your work.']};
  fields(value, ['arguments', 'draft', '_draft', ...(activity.partner ? ['partner'] : []), ...(activity.codeReview ? ['codeReview'] : [])], 'response', errors);
  const allowed = new Set(activity.arguments.map(argument => argument.id)), pieces = new Map(activity.pieces.map(piece => [piece.id, piece]));
  for (const key of Object.keys(value.arguments)) if (!allowed.has(key)) errors.push(`Unknown argument ${key}.`);
  const parsed: Record<string, ExplanationChain> = {};
  for (const argument of activity.arguments) {
    const chain = value.arguments[argument.id];
    if (!object(chain)) { errors.push(`Missing argument ${argument.label}.`); continue; }
    fields(chain, ['claimId', 'evidenceIds', 'warrantId', 'counterpointId', 'rebuttalId'], 'chain', errors);
    for (const role of ['claim', 'warrant', 'counterpoint', 'rebuttal'] as const) { const chosen = chain[`${role}Id`]; if (chosen !== '' && (typeof chosen !== 'string' || pieces.get(chosen)?.role !== role)) errors.push(`Choose a known ${role} piece for ${argument.label}.`); }
    if (!list(chain.evidenceIds, 0, 8) || chain.evidenceIds.some(item => typeof item !== 'string' || pieces.get(item)?.role !== 'evidence') || new Set(chain.evidenceIds).size !== chain.evidenceIds.length) errors.push(`Choose up to eight distinct evidence pieces for ${argument.label}.`);
    parsed[argument.id] = chain as unknown as ExplanationChain;
  }
  return errors.length ? {errors} : {value: parsed, errors};
}
function sameSet(a: string[], b: string[]) { return a.length === b.length && a.every(item => b.includes(item)); }
function evaluateExplanation(activity: ExplanationActivity, chains: Record<string, ExplanationChain>): Evaluation {
  const details: Evaluation['details'] = [];
  for (const argument of activity.arguments) {
    const chain = chains[argument.id];
    const matches = argument.alternatives.map(alternative => {
      const checks = [chain.claimId === alternative.claimId, sameSet(chain.evidenceIds, alternative.evidenceIds), chain.warrantId === alternative.warrantId, chain.counterpointId === (alternative.counterpointId ?? ''), chain.rebuttalId === (alternative.rebuttalId ?? '')];
      return {alternative, checks, count: checks.filter(Boolean).length};
    }).sort((a, b) => b.count - a.count || a.alternative.id.localeCompare(b.alternative.id));
    const best = matches[0], correct = best.checks.every(Boolean);
    details.push({id: `argument-${argument.id}`, correct, message: `${argument.label}: ${correct ? best.alternative.explanation : 'The selected claim, evidence and reasoning do not yet form one of the author-validated explanations. Revise the relationships, including any challenge and response.'}${cite(activity, correct ? best.alternative.evidenceRefs : argument.evidenceRefs)}`});
    if (!correct) {
      const roles = ['claim', 'evidence', 'warrant', 'counterpoint', 'rebuttal'];
      best.checks.forEach((passed, index) => { if (!passed) details.push({id: `argument-${argument.id}-${roles[index]}`, correct: false, message: `${argument.label} · ${roles[index]}: ${index === 2 ? 'the warrant needs to explain why these observations support this claim.' : index === 1 ? 'select the relevant observations; adding unrelated evidence does not strengthen this explanation.' : index > 2 ? 'the challenge and response must belong to the same supported explanation.' : 'choose a conclusion that is supported by the assembled evidence and reasoning.'}`}); });
    }
  }
  const checks = details.filter(detail => activity.arguments.some(argument => detail.id === `argument-${argument.id}`));
  const result = finalEvaluation(activity, checks);
  return {...result, details};
}
export function evaluateComposition(activity: CompositionActivity, response: unknown): Evaluation {
  const errors = validateCompositionFields(activity as unknown as Record<string, unknown>);
  if (errors.length) return invalid(`This activity needs author review: ${errors.slice(0, 3).join(' ')}`);
  if (activity.kind === 'construction') { const parsed = parseBuild(response, activity); return parsed.value ? evaluateBuild(activity, parsed.value) : invalid(parsed.errors.join(' ')); }
  const parsed = parseExplanation(response, activity); return parsed.value ? evaluateExplanationMode(activity, response, evaluateExplanation(activity, parsed.value)) : invalid(parsed.errors.join(' '));
}
/** Hydration preserves valid unfinished work, but never repairs malformed submitted work into a passing grade. */
export function initialCompositionResponse(activity: CompositionActivity, saved?: unknown): CompositionResponse {
  const value = object(saved) ? saved : {}, draft = object(value.draft) ? value.draft : {};
  const boundedText = (key: string, max = 80) => typeof draft[key] === 'string' && (draft[key] as string).length <= max ? draft[key] as string : '';
  if (activity.kind === 'construction') {
    const parsed = parseBuild(value, activity), build = parsed.value ?? {instances: [], edges: []};
    const existing = (key: string) => build.instances.some(item => item.id === draft[key]) ? boundedText(key) : '';
    return {...structuredClone(build), draft: {selectedInstanceId: existing('selectedInstanceId'), from: existing('from'), fromPort: boundedText('fromPort'), to: existing('to'), toPort: boundedText('toPort'), message: boundedText('message', 500)}};
  }
  const parsed = parseExplanation(value, activity), empty: ExplanationChain = {claimId: '', evidenceIds: [], warrantId: '', counterpointId: '', rebuttalId: ''};
  return restoreExplanationMode(activity, saved, {arguments: structuredClone(parsed.value ?? Object.fromEntries(activity.arguments.map(argument => [argument.id, {...empty, evidenceIds: []}]))), draft: {selectedPieceId: activity.pieces.some(piece => piece.id === draft.selectedPieceId) ? boundedText('selectedPieceId') : '', activeArgumentId: activity.arguments.some(argument => argument.id === draft.activeArgumentId) ? boundedText('activeArgumentId') : activity.arguments[0]?.id ?? '', role: ROLES.includes(draft.role as ExplanationRole) ? draft.role as ExplanationRole : 'claim', message: boundedText('message', 500)}});
}

/** Recipe routing must check complete presenter contracts, not infer them from the explanation kind. */
export function getCompositionCapabilities(activity: CompositionActivity) {
  const errors = validateCompositionFields(activity as unknown as Record<string, unknown>), valid = errors.length === 0;
  return {valid, construction: valid && activity.kind === 'construction', explanation: valid && activity.kind === 'explanation', partnerHelper: valid && activity.kind === 'explanation' && !!activity.partner, secureCodeReview: valid && activity.kind === 'explanation' && !!activity.codeReview, errors};
}
