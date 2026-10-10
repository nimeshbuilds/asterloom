import { validateRecallFields, evaluateRecall } from './recallEngine';
import type { RecallActivity, RecallResponse } from './recallEngine';
import { validatePictureBuildFields, evaluatePictureBuild } from './pictureBuildEngine';
import type { PictureBuildActivity, PictureBuildResponse } from './pictureBuildEngine';
import { validateChildPlayFields, validateChildPlaySources, evaluateChildPlay } from './childPlayEngine';
import type { ChildPlayActivity, ChildPlayResponse } from './childPlayEngine';
import type { Source } from '../types';
import { validateCompletionFields, evaluateCompletion } from './completionEngine';
import type { CompletionActivity, CompletionResponse } from './completionEngine';
import { validateDataFields, evaluateData } from './dataEngine';
import type { DataActivity, DataResponse } from './dataEngine';
import { validateMediaFields, evaluateMedia } from './mediaEngine';
import type { MediaActivity, MediaResponse } from './mediaEngine';
import { validateScenarioFields, evaluateScenario } from './scenarioEngine';
import type { ScenarioActivity, ScenarioResponse } from './scenarioEngine';
import { validateCompositionFields, evaluateComposition } from './compositionEngine';
import type { ConstructionActivity, ExplanationActivity, CompositionResponse } from './compositionEngine';
import { validatePictureFields, validatePictureSources, evaluatePicture } from './pictureEngine';
import type { PictureActivity, PictureResponse } from './pictureEngine';
import { validateRuleSwitchFields, evaluateRuleSwitch } from './ruleSwitchEngine';
import type { RuleSwitchActivity, RuleSwitchResponse } from './ruleSwitchEngine';
import { extractTableActivities } from './tableExtraction';

export type Primitive = string | number | boolean | null;
export type Rule =
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; field: string; value: Primitive }
  | { op: 'in'; field: string; value: Primitive[] }
  | { op: 'and' | 'or'; rules: Rule[] }
  | { op: 'not'; rule: Rule };
export interface SourceReference { sourceId: string; evidence: string; locator?: string }
export interface ActivityItem { id: string; label: string }
export interface ActivityBase {
  version: 1; id: string; title: string; instruction: string;
  sourceRefs: SourceReference[]; reviewStatus: 'needs-review' | 'reviewed';
  explanation: string; hint: string;
  /** Explicit author binding; technical kind compatibility alone is insufficient. */
  scaffoldIds?: string[];
  extractedFrom?: string;
}
export interface SequenceActivity extends ActivityBase { kind: 'sequence'; items: ActivityItem[]; constraints: { before: string; after: string }[] }
export interface ClassificationActivity extends ActivityBase { kind: 'classification'; categories: ActivityItem[]; items: ActivityItem[]; membership: { itemId: string; categoryIds: string[] }[] }
export interface DecisionActivity extends ActivityBase {
  kind: 'decision'; context: Record<string, Primitive>; choices: ActivityItem[];
  rules: { id: string; when: Rule; choiceId: string; reason: string }[]; defaultChoiceId: string; defaultReason: string;
}
export interface DependencyActivity extends ActivityBase {
  kind: 'dependency'; nodes: ActivityItem[]; edges: { from: string; to: string; relation: string }[]; acyclic: boolean;
}
export interface BudgetActivity extends ActivityBase {
  kind: 'budget'; budget: number; currency: string;
  items: { id: string; label: string; cost: number; unit: string; maxQuantity: number }[];
  requirements: { id: string; label: string; minimum: number; contributions: Record<string, number> }[];
}
export interface RubricActivity extends ActivityBase {
  kind: 'rubric'; mode: 'sample-review' | 'self-assessment'; sample: string;
  criteria: { id: string; label: string; levels: string[]; expectedLevel?: number }[];
}
export interface DiagramActivity extends ActivityBase {
  kind: 'diagram'; targets: { id: string; label: string; x: number; y: number }[];
  labels: ActivityItem[]; mapping: { labelId: string; targetId: string }[];
}
export type StructuredActivity = RecallActivity | SequenceActivity | ClassificationActivity | DecisionActivity | DependencyActivity | BudgetActivity | RubricActivity | DiagramActivity | CompletionActivity | DataActivity | MediaActivity | ScenarioActivity | ConstructionActivity | ExplanationActivity | PictureActivity | RuleSwitchActivity | ChildPlayActivity | PictureBuildActivity;
export type ActivityValidation = { success: true; value: StructuredActivity } | { success: false; errors: string[] };
export type ActivityResponse =
  | { order: string[] }
  | { assignments: Record<string, string[]> }
  | { choiceId: string }
  | { edges: { from: string; to: string; relation: string }[] }
  | { quantities: Record<string, number> }
  | { ratings: Record<string, number> }
  | { placements: Record<string, string> }
  | RecallResponse | CompletionResponse | DataResponse | MediaResponse | ScenarioResponse | CompositionResponse | PictureResponse | RuleSwitchResponse | ChildPlayResponse | PictureBuildResponse;
export interface Evaluation {
  /** Added by the player; a supported attempt is distinct from independent performance. */
  hintUsed?: boolean;
  valid: boolean; correct: boolean | null; outcome: 'correct' | 'retry' | 'self-reviewed' | 'invalid' | 'draft-preview';
  score: number; maxScore: number; feedback: string;
  details: { id: string; correct: boolean | null; message: string }[];
}
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function plain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function primitive(value: unknown): value is Primitive { return value === null || typeof value === 'string' && value.length <= 2000 || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value); }
function string(value: unknown, path: string, errors: string[], max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) errors.push(`${path}: expected non-empty text up to ${max} characters`);
}
function ident(value: unknown, path: string, errors: string[]) {
  if (typeof value !== 'string' || !SAFE_ID.test(value) || FORBIDDEN.has(value)) errors.push(`${path}: invalid identifier`);
}
function fields(object: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field`);
}
function array(value: unknown, path: string, errors: string[], min = 1, max = 40): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) { errors.push(`${path}: expected ${min}–${max} entries`); return []; }
  return value;
}
function numeric(value: unknown, path: string, errors: string[], min = 0, max = 1e9, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) errors.push(`${path}: invalid ${integer ? 'integer' : 'number'} (${min}–${max})`);
}
function uniqueIds(items: unknown[], path: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!plain(item)) { errors.push(`${path}[${index}]: expected object`); return; }
    ident(item.id, `${path}[${index}].id`, errors);
    if (typeof item.id === 'string') {
      if (seen.has(item.id)) errors.push(`${path}: duplicate id ${item.id}`);
      seen.add(item.id);
    }
  });
  return seen;
}
function items(value: unknown, path: string, errors: string[], min = 2): Set<string> {
  const values = array(value, path, errors, min);
  const ids = uniqueIds(values, path, errors);
  values.forEach((item, index) => { if (plain(item)) { fields(item, ['id', 'label'], `${path}[${index}]`, errors); string(item.label, `${path}[${index}].label`, errors, 1000); } });
  return ids;
}
function reference(value: unknown, ids: Set<string>, path: string, errors: string[]) { if (typeof value !== 'string' || !ids.has(value)) errors.push(`${path}: unknown referenced id`); }
function isAcyclic(ids: Set<string>, edges: { from: string; to: string }[]): boolean {
  const pending = new Set(ids); const links = edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
  while (pending.size) {
    const roots = [...pending].filter(id => !links.some(edge => edge.to === id && pending.has(edge.from)));
    if (!roots.length) return false;
    roots.forEach(id => pending.delete(id));
  }
  return true;
}
function ruleErrors(rule: unknown, path: string, errors: string[], depth = 0, counter = { nodes: 0 }) {
  if (++counter.nodes > 100 || depth > 8) { errors.push(`${path}: rule complexity limit exceeded`); return; }
  if (!plain(rule)) { errors.push(`${path}: expected rule object`); return; }
  if (rule.op === 'and' || rule.op === 'or') {
    fields(rule, ['op', 'rules'], path, errors);
    array(rule.rules, `${path}.rules`, errors, 1, 12).forEach((child, index) => ruleErrors(child, `${path}.rules[${index}]`, errors, depth + 1, counter));
  } else if (rule.op === 'not') {
    fields(rule, ['op', 'rule'], path, errors); ruleErrors(rule.rule, `${path}.rule`, errors, depth + 1, counter);
  } else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'].includes(String(rule.op))) {
    fields(rule, ['op', 'field', 'value'], path, errors); ident(rule.field, `${path}.field`, errors);
    if (rule.op === 'in') { if (!Array.isArray(rule.value) || rule.value.length < 1 || rule.value.length > 40 || !rule.value.every(primitive)) errors.push(`${path}.value: expected bounded primitive values`); }
    else if (!primitive(rule.value)) errors.push(`${path}.value: expected a primitive value`);
    if (['gt', 'gte', 'lt', 'lte'].includes(String(rule.op)) && typeof rule.value !== 'number') errors.push(`${path}.value: numeric comparison requires a number`);
  } else errors.push(`${path}.op: unsupported rule operator`);
}
export function validateRule(input: unknown): { success: boolean; errors: string[] } {
  const errors: string[] = []; ruleErrors(input, 'rule', errors); return { success: !errors.length, errors };
}
function ruleFields(rule: Rule): string[] {
  if ('field' in rule) return [rule.field];
  if ('rules' in rule) return rule.rules.flatMap(ruleFields);
  return ruleFields(rule.rule);
}
function runRule(rule: Rule, context: Record<string, Primitive>): boolean {
  if (rule.op === 'and') return rule.rules.every(child => runRule(child, context));
  if (rule.op === 'or') return rule.rules.some(child => runRule(child, context));
  if (rule.op === 'not') return ruleFields(rule.rule).every(field => Object.hasOwn(context, field)) && !runRule(rule.rule, context);
  if (!('field' in rule) || !Object.hasOwn(context, rule.field)) return false;
  const actual = context[rule.field];
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
export function evaluateRule(rule: Rule, context: Record<string, Primitive>): boolean {
  const checked = validateRule(rule);
  if (!checked.success) throw new Error(checked.errors.join('; '));
  if (!plain(context) || Object.entries(context).some(([key, value]) => !SAFE_ID.test(key) || FORBIDDEN.has(key) || !primitive(value))) throw new Error('Invalid rule context.');
  return runRule(rule, context);
}

/** Optional sources enforce exact evidence provenance. Correctness still needs author review. */
export function validateActivity(input: unknown, sources?: (Pick<Source, 'id' | 'text'> & Partial<Pick<Source, 'status'>>)[]): ActivityValidation {
  const errors: string[] = [];
  if (!plain(input)) return { success: false, errors: ['activity: expected a plain object'] };
  if (input.version !== 1) errors.push('version: unsupported activity version');
  if (input.extractedFrom !== undefined) ident(input.extractedFrom, 'extractedFrom', errors);
  if (input.scaffoldIds !== undefined) { const ids = array(input.scaffoldIds, 'scaffoldIds', errors, 1, 20); ids.forEach(id => ident(id, 'scaffoldIds', errors)); if (new Set(ids).size !== ids.length) errors.push('scaffoldIds: duplicate recipe binding'); }
  ident(input.id, 'id', errors);
  for (const key of ['title', 'instruction', 'explanation', 'hint']) string(input[key], key, errors);
  if (!['needs-review', 'reviewed'].includes(String(input.reviewStatus))) errors.push('reviewStatus: expected needs-review or reviewed');
  array(input.sourceRefs, 'sourceRefs', errors, 1, 120).forEach((ref, index) => {
    if (!plain(ref)) { errors.push(`sourceRefs[${index}]: expected object`); return; }
    fields(ref, ['sourceId', 'evidence', 'locator'], `sourceRefs[${index}]`, errors);
    ident(ref.sourceId, `sourceRefs[${index}].sourceId`, errors);
    string(ref.evidence, `sourceRefs[${index}].evidence`, errors, 20000);
    if (ref.locator !== undefined) string(ref.locator, `sourceRefs[${index}].locator`, errors, 200);
    if (sources) {
      const source = sources.find(item => item.id === ref.sourceId);
      if (!source || typeof ref.evidence !== 'string' || !source.text.includes(ref.evidence)) errors.push(`sourceRefs[${index}]: evidence must occur exactly in the named source`);
      if (source && source.status !== undefined && source.status !== 'ready' && input.reviewStatus === 'reviewed') errors.push(`sourceRefs[${index}]: review the readable source before approving its learning activity`);
    }
  });
  switch (input.kind) {
    case 'sequence': {
      fields(input, [...BASE, 'items', 'constraints'], 'activity', errors);
      const ids = items(input.items, 'items', errors);
      const edges: { from: string; to: string }[] = [];
      array(input.constraints, 'constraints', errors, 1, 120).forEach((edge, i) => {
        if (!plain(edge)) { errors.push(`constraints[${i}]: expected object`); return; }
        fields(edge, ['before', 'after'], `constraints[${i}]`, errors);
        reference(edge.before, ids, `constraints[${i}].before`, errors); reference(edge.after, ids, `constraints[${i}].after`, errors);
        if (typeof edge.before === 'string' && typeof edge.after === 'string') edges.push({ from: edge.before, to: edge.after });
      });
      if (!isAcyclic(ids, edges)) errors.push('constraints: sequence dependencies must be acyclic');
      break;
    }
    case 'classification': {
      fields(input, [...BASE, 'categories', 'items', 'membership'], 'activity', errors);
      const categories = items(input.categories, 'categories', errors), ids = items(input.items, 'items', errors);
      const seen = new Set<string>();
      array(input.membership, 'membership', errors).forEach((entry, i) => {
        if (!plain(entry)) { errors.push(`membership[${i}]: expected object`); return; }
        fields(entry, ['itemId', 'categoryIds'], `membership[${i}]`, errors); reference(entry.itemId, ids, `membership[${i}].itemId`, errors);
        if (typeof entry.itemId === 'string') { if (seen.has(entry.itemId)) errors.push('membership: duplicate item'); seen.add(entry.itemId); }
        const assigned = array(entry.categoryIds, `membership[${i}].categoryIds`, errors);
        assigned.forEach(id => reference(id, categories, `membership[${i}].categoryIds`, errors));
        if (new Set(assigned).size !== assigned.length) errors.push('membership: duplicate category');
      });
      if ([...ids].some(id => !seen.has(id))) errors.push('membership: every item requires an explicit membership');
      break;
    }
    case 'decision': {
      fields(input, [...BASE, 'context', 'choices', 'rules', 'defaultChoiceId', 'defaultReason'], 'activity', errors);
      const ids = items(input.choices, 'choices', errors);
      if (!plain(input.context) || Object.keys(input.context).length > 40) errors.push('context: expected at most 40 primitive fields');
      else for (const [key, value] of Object.entries(input.context)) { ident(key, `context.${key}`, errors); if (!primitive(value)) errors.push(`context.${key}: expected a primitive value`); }
      const rules = array(input.rules, 'rules', errors, 1, 30); uniqueIds(rules, 'rules', errors);
      rules.forEach((rule, i) => {
        if (!plain(rule)) return;
        fields(rule, ['id', 'when', 'choiceId', 'reason'], `rules[${i}]`, errors); ruleErrors(rule.when, `rules[${i}].when`, errors);
        reference(rule.choiceId, ids, `rules[${i}].choiceId`, errors); string(rule.reason, `rules[${i}].reason`, errors);
      });
      reference(input.defaultChoiceId, ids, 'defaultChoiceId', errors); string(input.defaultReason, 'defaultReason', errors);
      break;
    }
    case 'dependency': {
      fields(input, [...BASE, 'nodes', 'edges', 'acyclic'], 'activity', errors);
      const ids = items(input.nodes, 'nodes', errors); const edges: { from: string; to: string }[] = []; const seen = new Set<string>();
      array(input.edges, 'edges', errors, 1, 120).forEach((edge, i) => {
        if (!plain(edge)) { errors.push(`edges[${i}]: expected object`); return; }
        fields(edge, ['from', 'to', 'relation'], `edges[${i}]`, errors);
        reference(edge.from, ids, `edges[${i}].from`, errors); reference(edge.to, ids, `edges[${i}].to`, errors); string(edge.relation, `edges[${i}].relation`, errors, 200);
        const key = JSON.stringify([edge.from, edge.to, edge.relation]); if (seen.has(key)) errors.push('edges: duplicate relation'); seen.add(key);
        if (typeof edge.from === 'string' && typeof edge.to === 'string') edges.push({ from: edge.from, to: edge.to });
      });
      if (typeof input.acyclic !== 'boolean') errors.push('acyclic: expected boolean');
      if (input.acyclic === true && !isAcyclic(ids, edges)) errors.push('edges: dependency graph must be acyclic');
      break;
    }
    case 'budget': {
      fields(input, [...BASE, 'budget', 'currency', 'items', 'requirements'], 'activity', errors);
      numeric(input.budget, 'budget', errors); string(input.currency, 'currency', errors, 30);
      const values = array(input.items, 'items', errors, 1); const ids = uniqueIds(values, 'items', errors);
      values.forEach((item, i) => { if (plain(item)) { fields(item, ['id', 'label', 'cost', 'unit', 'maxQuantity'], `items[${i}]`, errors); string(item.label, `items[${i}].label`, errors); string(item.unit, `items[${i}].unit`, errors, 100); numeric(item.cost, `items[${i}].cost`, errors); numeric(item.maxQuantity, `items[${i}].maxQuantity`, errors, 0, 10000, true); } });
      const requirements = array(input.requirements, 'requirements', errors, 1, 20); uniqueIds(requirements, 'requirements', errors);
      requirements.forEach((requirement, i) => {
        if (!plain(requirement)) return;
        fields(requirement, ['id', 'label', 'minimum', 'contributions'], `requirements[${i}]`, errors);
        string(requirement.label, `requirements[${i}].label`, errors); numeric(requirement.minimum, `requirements[${i}].minimum`, errors);
        if (!plain(requirement.contributions) || !Object.keys(requirement.contributions).length) errors.push(`requirements[${i}].contributions: expected item contribution map`);
        else for (const [id, value] of Object.entries(requirement.contributions)) { reference(id, ids, `requirements[${i}].contributions`, errors); numeric(value, `requirements[${i}].contributions.${id}`, errors); }
      });
      break;
    }
    case 'rubric': {
      fields(input, [...BASE, 'mode', 'sample', 'criteria'], 'activity', errors);
      if (!['sample-review', 'self-assessment'].includes(String(input.mode))) errors.push('mode: expected sample-review or self-assessment');
      string(input.sample, 'sample', errors, 20000);
      const criteria = array(input.criteria, 'criteria', errors, 1, 20); uniqueIds(criteria, 'criteria', errors);
      criteria.forEach((criterion, i) => {
        if (!plain(criterion)) return;
        fields(criterion, ['id', 'label', 'levels', 'expectedLevel'], `criteria[${i}]`, errors); string(criterion.label, `criteria[${i}].label`, errors);
        const levels = array(criterion.levels, `criteria[${i}].levels`, errors, 2, 6); levels.forEach((level, j) => string(level, `criteria[${i}].levels[${j}]`, errors, 1000));
        if (input.mode === 'sample-review') numeric(criterion.expectedLevel, `criteria[${i}].expectedLevel`, errors, 0, levels.length - 1, true);
        else if (criterion.expectedLevel !== undefined) errors.push('criteria: self-assessment must not contain an expected grade');
      });
      break;
    }
    case 'diagram': {
      fields(input, [...BASE, 'targets', 'labels', 'mapping'], 'activity', errors);
      const targets = array(input.targets, 'targets', errors, 2); const targetIds = uniqueIds(targets, 'targets', errors); const labelIds = items(input.labels, 'labels', errors);
      targets.forEach((target, i) => { if (plain(target)) { fields(target, ['id', 'label', 'x', 'y'], `targets[${i}]`, errors); string(target.label, `targets[${i}].label`, errors); numeric(target.x, `targets[${i}].x`, errors, 0, 100); numeric(target.y, `targets[${i}].y`, errors, 0, 100); } });
      const seen = new Set<string>(), usedTargets = new Set<string>();
      array(input.mapping, 'mapping', errors).forEach((entry, i) => {
        if (!plain(entry)) { errors.push(`mapping[${i}]: expected object`); return; }
        fields(entry, ['labelId', 'targetId'], `mapping[${i}]`, errors); reference(entry.labelId, labelIds, `mapping[${i}].labelId`, errors); reference(entry.targetId, targetIds, `mapping[${i}].targetId`, errors);
        if (typeof entry.labelId === 'string') { if (seen.has(entry.labelId)) errors.push('mapping: duplicate label'); seen.add(entry.labelId); }
        if (typeof entry.targetId === 'string') { if (usedTargets.has(entry.targetId)) errors.push('mapping: each target accepts one label'); usedTargets.add(entry.targetId); }
      });
      if ([...labelIds].some(id => !seen.has(id))) errors.push('mapping: every label needs a target');
      break;
    }
    case 'recall': errors.push(...validateRecallFields(input)); break;
    case 'completion': errors.push(...validateCompletionFields(input)); break;
    case 'data': errors.push(...validateDataFields(input)); break;
    case 'media':
      errors.push(...validateMediaFields(input));
      if (sources) { const recording = sources.find(s => s.id === input.mediaSourceId) as Partial<Source> | undefined; if (!recording || !(typeof recording.dataUrl === 'string' && /^data:(?:audio|video)\/[a-z0-9.+-]+;base64,/i.test(recording.dataUrl) || recording.asset && /^[a-f0-9]{64}$/.test(recording.asset.id) && recording.asset.id === recording.asset.sha256 && /^(?:audio|video)\//.test(recording.asset.mime))) errors.push('mediaSourceId: attach the audio/video recording for offline playback'); }
      break;
    case 'scenario': errors.push(...validateScenarioFields(input)); break;
    case 'rule-switch': errors.push(...validateRuleSwitchFields(input)); break;
    case 'construction': case 'explanation': errors.push(...validateCompositionFields(input)); break;
    case 'picture-build': errors.push(...validatePictureBuildFields(input, sources as Source[] | undefined)); break;
    case 'child-play': {
      const problems = validateChildPlayFields(input); errors.push(...problems);
      if (!problems.length && sources) errors.push(...validateChildPlaySources(input as unknown as ChildPlayActivity, sources));
      break;
    }
    case 'picture': {
      const problems = validatePictureFields(input); errors.push(...problems);
      if (!problems.length && sources) errors.push(...validatePictureSources(input as unknown as PictureActivity, sources));
      break;
    }
    default: errors.push('kind: unsupported activity primitive');
  }
  return errors.length ? { success: false, errors } : { success: true, value: JSON.parse(JSON.stringify(input)) as StructuredActivity };
}
const invalid = (feedback: string): Evaluation => ({ valid: false, correct: null, outcome: 'invalid', score: 0, maxScore: 0, feedback, details: [] });
const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every(value => b.includes(value));
/** Preview-only structural checks. Never use this authoring helper to award learning credit. */
export function evaluateActivityForAuthoring(activity: StructuredActivity, response: unknown): Evaluation {
  const valid = validateActivity(activity); if (!valid.success) return invalid(valid.errors.join('; '));
  if (!plain(response)) return invalid('Submit a response object.');
  if (activity.kind === 'recall') return evaluateRecall(activity, response);
  if (activity.kind === 'completion') return evaluateCompletion(activity, response);
  if (activity.kind === 'data') return evaluateData(activity, response);
  if (activity.kind === 'media') return evaluateMedia(activity, response);
  if (activity.kind === 'scenario') return evaluateScenario(activity, response, {practice:true});
  if (activity.kind === 'construction' || activity.kind === 'explanation') return evaluateComposition(activity, response);
  if (activity.kind === 'picture-build') return evaluatePictureBuild(activity, response);
  if (activity.kind === 'child-play') return evaluateChildPlay(activity, response);
  if (activity.kind === 'picture') return evaluatePicture(activity, response);
  if (activity.kind === 'rule-switch') return evaluateRuleSwitch(activity, response);
  const details: Evaluation['details'] = [];
  let selfAssessed = false;
  switch (activity.kind) {
    case 'sequence': {
      if (!Array.isArray(response.order) || !response.order.every(item => typeof item === 'string') || !sameSet(response.order, activity.items.map(item => item.id))) return invalid('Use every step exactly once.');
      const order = response.order as string[];
      // Quote the complete step rather than joining two sentences into a new one.
      // Normalize layout whitespace only: punctuation and conditions retain meaning.
      const stepLabel = (id: string) => `“${activity.items.find(item => item.id === id)!.label.replace(/\s+/g, ' ').trim()}”`;
      activity.constraints.forEach((rule, i) => { const correct = order.indexOf(rule.before) < order.indexOf(rule.after); details.push({ id: `dependency-${i}`, correct, message: `Place ${stepLabel(rule.before)} before ${stepLabel(rule.after)}` }); });
      break;
    }
    case 'classification': {
      const assignments = response.assignments;
      if (!plain(assignments) || !sameSet(Object.keys(assignments), activity.items.map(item => item.id))) return invalid('Assign every item to its categories.');
      for (const rule of activity.membership) {
        const selected = assignments[rule.itemId];
        if (!Array.isArray(selected) || !selected.every(id => typeof id === 'string' && activity.categories.some(category => category.id === id)) || new Set(selected).size !== selected.length) return invalid('Use distinct valid categories for each item.');
        const label = activity.items.find(item => item.id === rule.itemId)!.label;
        const names = (ids: string[]) => ids.map(id => activity.categories.find(category => category.id === id)!.label).join(', ') || 'none';
        details.push({ id: rule.itemId, correct: sameSet(selected, rule.categoryIds), message: `“${label}” — ${activity.reviewStatus === 'reviewed' ? 'Reviewed' : 'Draft'} groups: ${names(rule.categoryIds)}. Your groups: ${names(selected as string[])}.` });
      }
      break;
    }
    case 'decision': {
      if (typeof response.choiceId !== 'string' || !activity.choices.some(choice => choice.id === response.choiceId)) return invalid('Choose an available action.');
      const matched = activity.rules.find(rule => runRule(rule.when, activity.context));
      details.push({ id: matched?.id ?? 'default', correct: response.choiceId === (matched?.choiceId ?? activity.defaultChoiceId), message: matched?.reason ?? activity.defaultReason });
      break;
    }
    case 'dependency': {
      if (!Array.isArray(response.edges) || response.edges.length > 120) return invalid('Submit up to 120 relationships.');
      const chosen: string[] = [];
      for (const edge of response.edges) {
        if (!plain(edge) || !activity.nodes.some(node => node.id === edge.from) || !activity.nodes.some(node => node.id === edge.to) || typeof edge.relation !== 'string') return invalid('Use known nodes and a relation label.');
        chosen.push(JSON.stringify([edge.from, edge.to, edge.relation]));
      }
      if (new Set(chosen).size !== chosen.length) return invalid('Do not repeat a relationship.');
      const expected = activity.edges.map(edge => JSON.stringify([edge.from, edge.to, edge.relation]));
      const label = (id: string) => activity.nodes.find(node => node.id === id)!.label;
      const describe = (edge: {from: string; to: string; relation: string}) => `“${label(edge.from)}” — ${edge.relation} → “${label(edge.to)}”`;
      expected.forEach((edge, i) => details.push({ id: `edge-${i}`, correct: chosen.includes(edge), message: `${chosen.includes(edge) ? 'Connected' : 'Connect'}: ${describe(activity.edges[i])}.` }));
      chosen.filter(edge => !expected.includes(edge)).forEach((edge, i) => {
        const [from, to, relation] = JSON.parse(edge) as [string, string, string];
        details.push({ id: `extra-${i}`, correct: false, message: `Revise ${describe({from, to, relation})}: this relationship is not in the ${activity.reviewStatus === 'reviewed' ? 'reviewed' : 'draft'} model.` });
      });
      break;
    }
    case 'budget': {
      const quantities = response.quantities;
      if (!plain(quantities) || !sameSet(Object.keys(quantities), activity.items.map(item => item.id))) return invalid('Set a quantity for every resource.');
      if (activity.items.some(item => typeof quantities[item.id] !== 'number' || !Number.isInteger(quantities[item.id]) || (quantities[item.id] as number) < 0 || (quantities[item.id] as number) > item.maxQuantity)) return invalid('Resource quantities must be whole numbers within the allowed range.');
      const amount = quantities as Record<string, number>;
      const total = activity.items.reduce((sum, item) => sum + amount[item.id] * item.cost, 0);
      details.push({ id: 'budget', correct: total <= activity.budget + 1e-8, message: `Total: ${total.toFixed(2)} ${activity.currency}; budget: ${activity.budget.toFixed(2)}.` });
      activity.requirements.forEach(requirement => {
        const actual = Object.entries(requirement.contributions).reduce((sum, [id, contribution]) => sum + amount[id] * contribution, 0);
        details.push({ id: requirement.id, correct: actual + 1e-8 >= requirement.minimum, message: `${requirement.label}: ${actual}; required at least ${requirement.minimum}.` });
      });
      break;
    }
    case 'rubric': {
      const ratings = response.ratings;
      if (!plain(ratings) || !sameSet(Object.keys(ratings), activity.criteria.map(criterion => criterion.id))) return invalid('Review every rubric criterion.');
      selfAssessed = activity.mode === 'self-assessment';
      for (const criterion of activity.criteria) {
        const rating = ratings[criterion.id];
        if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 0 || rating >= criterion.levels.length) return invalid('Choose a listed rubric level for every criterion.');
        details.push({ id: criterion.id, correct: selfAssessed ? null : rating === criterion.expectedLevel, message: selfAssessed ? `Your reflection: ${criterion.levels[rating]}` : `${activity.reviewStatus === 'reviewed' ? 'Reviewed' : 'Draft'} criterion: ${criterion.levels[criterion.expectedLevel!]}` });
      }
      break;
    }
    case 'diagram': {
      const placements = response.placements;
      if (!plain(placements) || !sameSet(Object.keys(placements), activity.labels.map(label => label.id))) return invalid('Place every label.');
      if (Object.values(placements).some(id => !activity.targets.some(target => target.id === id)) || new Set(Object.values(placements)).size !== Object.values(placements).length) return invalid('Use a distinct valid target for every label.');
      activity.mapping.forEach(pair => details.push({ id: pair.labelId, correct: placements[pair.labelId] === pair.targetId, message: `${activity.labels.find(label => label.id === pair.labelId)?.label} belongs at ${activity.targets.find(target => target.id === pair.targetId)?.label}.` }));
      break;
    }
  }
  const score = details.filter(detail => detail.correct === true).length;
  const maxScore = details.filter(detail => detail.correct !== null).length;
  const correct = selfAssessed ? null : score === maxScore && maxScore > 0;
  return { valid: true, correct, outcome: selfAssessed ? 'self-reviewed' : correct ? 'correct' : 'retry', score, maxScore, feedback: selfAssessed ? 'Reflection saved. This is self-assessment, not an automatic correctness grade.' : `${correct ? `The response satisfies the ${activity.reviewStatus === 'reviewed' ? 'reviewed' : 'draft'} model.` : 'Review the feedback and try again.'} ${activity.explanation}`, details };
}

/** Unreviewed authored models can be explored, but their checks never count as learning credit. */
export function evaluateActivity(activity: StructuredActivity, response: unknown): Evaluation {
  const preview = evaluateActivityForAuthoring(activity, response);
  if (activity.reviewStatus !== 'needs-review') return preview;
  return {
    valid: false, correct: null, outcome: 'draft-preview', score: 0, maxScore: 0, hintUsed: true,
    feedback: 'Draft preview only. These checks compare your work with an unreviewed authored model; they do not verify its meaning against the source. The author must review the rules and answers before completion, points, review credit or mission scores can be earned.' + (preview.valid ? '' : ` Preview guidance: ${preview.feedback}`),
    details: preview.details.map(detail => ({ ...detail, message: `Draft model check: ${detail.message}` })),
  };
}

function hash(text: string): string { let result = 2166136261; for (let i = 0; i < text.length; i++) { result ^= text.charCodeAt(i); result = Math.imul(result, 16777619); } return (result >>> 0).toString(36); }
/** A bare chain is not a labeled edge: “parse → chunk → embed” has three
 * steps, not a relation named “chunk”. Ambiguous notation stays in the source
 * for the AI/author to interpret with context instead of acquiring an answer key. */
export function explicitSourceRelationship(line:string):{from:string;relation:string;to:string}|undefined {
  if(/[\r\n]/.test(line))return;
  const parts=line.trim().split(/\s*(?:->|→)\s*/);
  if(parts.length!==3||parts.some(part=>!part.trim()||/[\r\n]/.test(part)))return;
  const [from,raw,to]=parts.map(part=>part.trim());
  if(from.length>120||to.length>120||raw.length>100)return;
  const labeled=/^\[([^\[\]]+)\]$/.exec(raw);
  if(labeled&&!labeled[1].trim())return;
  const relational=/^(?:precedes|follows|requires|depends on|is required by|is part of|contains|includes|produces|consumes|enables|blocks|supports|supplies|causes|inhibits|activates|connects to|sends to|receives from|routes to|is a type of|is an example of|is associated with|is composed of|is contained in)$/i.test(raw);
  if(!labeled&&!relational)return;
  // Sentence continuations and independent mappings on one PDF line do not
  // provide a complete three-part relation, even if a middle word looks valid.
  if(/[.!?]\s+\S/.test(from)||/[.!?]\s+\S/.test(to)||/[;→]|->/.test(from+to))return;
  return{from,relation:labeled?labeled[1].trim():raw,to};
}
/** Recognize only unchanged legacy extractor models. Keep their bytes for
 * author inspection and preserve reviewed/edited models, but do not invite a
 * learner to solve a relationship invented by the old arrow parser. */
export function hasAmbiguousExtractedRelationships(activity:StructuredActivity):boolean {
  if(activity.kind!=='dependency'||!activity.extractedFrom||activity.reviewStatus==='reviewed')return false;
  const nodes=new Map<string,string>(),edges:DependencyActivity['edges']=[];let ambiguous=false;
  for(const ref of activity.sourceRefs){
    if(ref.sourceId!==activity.extractedFrom)return false;
    const relation=ref.evidence.match(/^\s*([^>\n]{1,120}?)\s*(?:->|→)\s*([^>\n]{1,100}?)\s*(?:->|→)\s*([^>\n]{1,120})\s*$/);
    if(!relation)return false;
    const from=relation[1].trim(),label=relation[2].trim(),to=relation[3].trim();
    if(!nodes.has(from))nodes.set(from,`node-${nodes.size+1}`);
    if(!nodes.has(to))nodes.set(to,`node-${nodes.size+1}`);
    const edge={from:nodes.get(from)!,to:nodes.get(to)!,relation:label};
    if(!edges.some(item=>JSON.stringify(item)===JSON.stringify(edge)))edges.push(edge);
    if(!explicitSourceRelationship(ref.evidence))ambiguous=true;
  }
  return ambiguous&&JSON.stringify(activity.nodes)===JSON.stringify([...nodes].map(([label,id])=>({id,label})))&&JSON.stringify(activity.edges)===JSON.stringify(edges);
}
/** Only explicit structures are extracted. This is source-faithful parsing, not truth verification. */
export function extractStructuredActivities(sources: Pick<Source, 'id' | 'title' | 'text' | 'status'>[]): { activities: StructuredActivity[]; warnings: string[] } {
  const activities: StructuredActivity[] = [], warnings: string[] = [];
  for (const source of sources) {
    if (source.status !== 'ready') continue;
    const text = source.text; const lines = text.split(/\r?\n/);
    const base = (kind: string, evidence: string): ActivityBase => ({ version: 1, extractedFrom: source.id, id: `activity-${hash(source.id + kind + evidence)}`, title: `${source.title}: ${kind}`, instruction: 'Reconstruct the structure explicitly stated in the source.', sourceRefs: [{ sourceId: source.id, evidence }], reviewStatus: 'needs-review', explanation: 'This answer follows the supplied source structure. Review factual accuracy before publishing.', hint: 'Use the exact relationships, categories or order stated in the source.' });
    const add = (activity: StructuredActivity) => { if (activities.length < 150) { const check = validateActivity(activity, [source]); if (check.success) activities.push(check.value); else warnings.push(`${source.title}: ${check.errors[0]}`); } };
    extractTableActivities(source).forEach(add);
    let run: { ordinal: number; label: string; line: string }[] = [];
    const flush = () => {
      if (run.length >= 2 && run.length <= 40 && new Set(run.map(item => item.label)).size === run.length) {
        const evidence = run.map(item => item.line).join('\n');
        // Preserve CRLF exactly when it is the source's line separator.
        const actualEvidence = source.text.includes(evidence) ? evidence : run.map(item => item.line).join('\r\n');
        const items = run.map((item, i) => ({ id: `step-${i + 1}`, label: item.label }));
        add({ ...base('sequence', actualEvidence), kind: 'sequence', items, constraints: items.slice(1).map((item, i) => ({ before: items[i].id, after: item.id })) });
      }
      run = [];
    };
    const categories = new Map<string, string>(), members = new Map<string, { id: string; categoryIds: string[] }>(), nodes = new Map<string, string>();
    const categoryLines: string[] = [], relationLines: string[] = [], edges: DependencyActivity['edges'] = [];
    for (const line of lines) {
      const step = line.match(/^\s*(\d{1,3})[.)]\s+(.{1,500})$/);
      if (step) { const ordinal = Number(step[1]); if (run.length && ordinal !== run[run.length - 1].ordinal + 1) flush(); run.push({ ordinal, label: step[2].trim(), line }); }
      else flush();
      const relation = explicitSourceRelationship(line);
      if (relation && edges.length < 120) {
        const {from,relation:rel,to} = relation;
        if (nodes.size < 40 || nodes.has(from) && nodes.has(to)) {
          if (!nodes.has(from)) nodes.set(from, `node-${nodes.size + 1}`);
          if (!nodes.has(to)) nodes.set(to, `node-${nodes.size + 1}`);
          const edge = { from: nodes.get(from)!, to: nodes.get(to)!, relation: rel };
          if (!edges.some(item => JSON.stringify(item) === JSON.stringify(edge))) { edges.push(edge); relationLines.push(line); }
        }
      } else {
        const category = line.match(/^\s*([^>\n]{1,100})\s*>\s*([^>\n]{1,250})\s*$/);
        if (category && !line.includes('->') && !line.includes('→') && members.size < 40 && categories.size < 40 && categoryLines.length < 120) {
          const name = category[1].trim(), label = category[2].trim();
          if (!categories.has(name)) categories.set(name, `category-${categories.size + 1}`);
          if (!members.has(label)) members.set(label, { id: `item-${members.size + 1}`, categoryIds: [] });
          const member = members.get(label)!; if (!member.categoryIds.includes(categories.get(name)!)) member.categoryIds.push(categories.get(name)!);
          categoryLines.push(line);
        }
      }
      const conditional = line.match(/^\s*If\s+(.{1,300}?)\s+then\s+(.{1,300}?)\s*[.]?\s*$/i);
      if (conditional && activities.length < 150) {
        const condition = conditional[1].trim(), action = conditional[2].trim();
        add({ ...base('decision', line), kind: 'decision', instruction: `The source states a conditional rule. Given “${condition}”, choose its stated action.`, context: { condition }, choices: [{ id: 'stated', label: action }, { id: 'not-established', label: 'The source does not establish an action for this case.' }], rules: [{ id: 'source-rule', when: { op: 'eq', field: 'condition', value: condition }, choiceId: 'stated', reason: line.trim() }], defaultChoiceId: 'not-established', defaultReason: 'No stated condition matched.' });
      }
    }
    flush();
    // Separate references avoid implying that disjoint source lines were contiguous.
    if (categories.size >= 2 && members.size >= 2) {
      const activity: ClassificationActivity = { ...base('classification', categoryLines[0]), kind: 'classification', categories: [...categories].map(([label, id]) => ({ id, label })), items: [...members].map(([label, entry]) => ({ id: entry.id, label })), membership: [...members.values()].map(entry => ({ itemId: entry.id, categoryIds: entry.categoryIds })) };
      activity.id = `activity-${hash(source.id + 'classification' + JSON.stringify(categoryLines))}`;
      activity.sourceRefs = categoryLines.map(evidence => ({ sourceId: source.id, evidence })); add(activity);
    }
    if (nodes.size >= 2 && edges.length) {
      const activity: DependencyActivity = { ...base('relationships', relationLines[0]), kind: 'dependency', nodes: [...nodes].map(([label, id]) => ({ id, label })), edges, acyclic: false };
      activity.id = `activity-${hash(source.id + 'relationships' + JSON.stringify(relationLines))}`;
      activity.sourceRefs = relationLines.map(evidence => ({ sourceId: source.id, evidence })); add(activity);
    }
  }
  if (activities.length) warnings.push('Explicit source structures were parsed without AI. Review them before publication; ordinary prose was not converted into invented rules or simulations.');
  if (!activities.length) warnings.push('No explicit structures found. Use numbered steps, a numeric CSV/TSV/Markdown table, Category > item, A -> relation -> B, If ... then ..., or prepare a source-backed model in the activity studio.');
  if (activities.length >= 150) warnings.push('The extraction limit is 150 activities per pass. Split materials into smaller sets for full coverage.');
  return { activities, warnings };
}

export function parseActivities(json: string, sources?: Pick<Source, 'id' | 'text'>[]): { success: true; value: StructuredActivity[] } | { success: false; errors: string[] } {
  if (typeof json !== 'string' || json.length > 2_000_000) return { success: false, errors: ['Expected activity JSON under 2 MB.'] };
  let input: unknown; try { input = JSON.parse(json); } catch { return { success: false, errors: ['Invalid JSON.'] }; }
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.length > 150) return { success: false, errors: ['Expected 1–150 activities.'] };
  const errors: string[] = [], result: StructuredActivity[] = [], seen = new Set<string>();
  values.forEach((value, i) => { const checked = validateActivity(value, sources); if (!checked.success) errors.push(...checked.errors.map(error => `[${i}] ${error}`)); else if (seen.has(checked.value.id)) errors.push(`[${i}] Duplicate activity id.`); else { result.push(checked.value); seen.add(checked.value.id); } });
  return errors.length ? { success: false, errors } : { success: true, value: result };
}
export function exportActivities(activities: StructuredActivity[]): string {
  const json = JSON.stringify(activities, null, 2); const check = parseActivities(json);
  if (!check.success) throw new Error(check.errors.join('; '));
  return json;
}

function exampleBase(id: string, title: string, instruction: string, evidence: string): ActivityBase {
  return { version: 1, id, title, instruction, sourceRefs: [{ sourceId: 'example-material', evidence }], reviewStatus: 'reviewed', explanation: evidence, hint: 'Check the exact rule in the source material.' };
}
/** Original, bounded teaching fixtures. These demonstrate engine primitives, not domain certification. */
export const ACTIVITY_EXAMPLES: StructuredActivity[] = [
  { ...exampleBase('example-sequence', 'A reproducible investigation', 'Put the investigation steps in a valid order.', 'Define the question before collecting observations. Collect observations before analyzing them. Analyze observations before reporting the conclusion.'), scaffoldIds: ['process-reconstruction'], kind: 'sequence', items: [{ id: 'question', label: 'Define the question' }, { id: 'collect', label: 'Collect observations' }, { id: 'analyze', label: 'Analyze observations' }, { id: 'report', label: 'Report the conclusion' }], constraints: [{ before: 'question', after: 'collect' }, { before: 'collect', after: 'analyze' }, { before: 'analyze', after: 'report' }] },
  { ...exampleBase('example-classification', 'Observation or interpretation?', 'Classify each statement using the supplied distinction.', 'An observation records what was measured or directly noticed. An interpretation proposes what an observation means. “The display reads 12” is an observation. “The battery may be weak” is an interpretation.'), scaffoldIds: ['classification-workshop'], kind: 'classification', categories: [{ id: 'observation', label: 'Observation' }, { id: 'interpretation', label: 'Interpretation' }], items: [{ id: 'display', label: 'The display reads 12.' }, { id: 'battery', label: 'The battery may be weak.' }], membership: [{ itemId: 'display', categoryIds: ['observation'] }, { itemId: 'battery', categoryIds: ['interpretation'] }] },
  { ...exampleBase('example-cloud-iam', 'An explicit access policy', 'Apply this fictional policy to the displayed request.', 'This training policy permits an analyst to read a report only with MFA. Every other request is denied. The current request has role analyst, resource report and MFA enabled.'), scaffoldIds: ['zero-trust-access-lab'], kind: 'decision', context: { role: 'analyst', resource: 'report', mfa: true }, choices: [{ id: 'allow', label: 'Allow the request' }, { id: 'deny', label: 'Deny the request' }], rules: [{ id: 'allow-analyst', when: { op: 'and', rules: [{ op: 'eq', field: 'role', value: 'analyst' }, { op: 'eq', field: 'resource', value: 'report' }, { op: 'eq', field: 'mfa', value: true }] }, choiceId: 'allow', reason: 'All three explicitly required conditions are met.' }], defaultChoiceId: 'deny', defaultReason: 'The request does not satisfy every required condition.' },
  { ...exampleBase('example-dependencies', 'Follow a message', 'Connect the events using the documented dependency relation.', 'In this recorded trace, Build request precedes Send request, and Send request precedes Receive response. No other edge is recorded.'), scaffoldIds: ['concept-map-repair'], kind: 'dependency', nodes: [{ id: 'build', label: 'Build request' }, { id: 'send', label: 'Send request' }, { id: 'receive', label: 'Receive response' }], edges: [{ from: 'build', to: 'send', relation: 'precedes' }, { from: 'send', to: 'receive', relation: 'precedes' }], acyclic: true },
  { ...exampleBase('example-budget', 'Plan a small lab', 'Meet both capacity needs without exceeding 12 training credits.', 'A small workstation costs 3 credits and provides 1 seat and 2 storage units. A large workstation costs 5 credits and provides 2 seats and 2 storage units. The lab needs at least 4 seats and 6 storage units. Its budget is 12 credits.'), scaffoldIds: ['resource-allocation'], kind: 'budget', budget: 12, currency: 'credits', items: [{ id: 'small', label: 'Small workstation', cost: 3, unit: 'workstation', maxQuantity: 4 }, { id: 'large', label: 'Large workstation', cost: 5, unit: 'workstation', maxQuantity: 3 }], requirements: [{ id: 'seats', label: 'Seats', minimum: 4, contributions: { small: 1, large: 2 } }, { id: 'storage', label: 'Storage units', minimum: 6, contributions: { small: 2, large: 2 } }] },
  { ...exampleBase('example-rubric', 'Review an explanation', 'Apply the supplied rubric to this prepared example.', 'The rubric awards level 1 when a claim names its specific evidence, and level 0 when no specific evidence is supplied. The sample names the observation “display reads 12”, so its reviewed evidence rating is 1.'), scaffoldIds: ['review-studio'], kind: 'rubric', mode: 'sample-review', sample: 'The value is above 10 because the display reads 12.', criteria: [{ id: 'evidence', label: 'Specific evidence', levels: ['No specific evidence supplied', 'A specific observation supports the claim'], expectedLevel: 1 }] },
  { ...exampleBase('example-diagram', 'Label a transformation', 'Place each label at the named position in this simple model.', 'In this model, input is on the left, transformation is in the center, and output is on the right.'), scaffoldIds: ['diagram-reconstruction'], kind: 'diagram', targets: [{ id: 'left', label: 'Left position', x: 15, y: 50 }, { id: 'center', label: 'Center position', x: 50, y: 50 }, { id: 'right', label: 'Right position', x: 85, y: 50 }], labels: [{ id: 'input', label: 'Input' }, { id: 'transform', label: 'Transformation' }, { id: 'output', label: 'Output' }], mapping: [{ labelId: 'input', targetId: 'left' }, { labelId: 'transform', targetId: 'center' }, { labelId: 'output', targetId: 'right' }] },
  { ...exampleBase('example-agent-policy', 'An agent permission boundary', 'Choose the action allowed by the supplied tool policy.', 'In this training workflow, sending email requires explicit user approval. If approval is absent, ask for approval. If approval is present and the tool is listed, the action may proceed. Otherwise deny. The current email request has no approval.'), kind: 'decision', context: { approved: false, toolListed: true }, choices: [{ id: 'ask', label: 'Ask for explicit approval' }, { id: 'proceed', label: 'Proceed with the approved action' }, { id: 'deny', label: 'Deny the unlisted action' }], rules: [{ id: 'approval', when: { op: 'eq', field: 'approved', value: false }, choiceId: 'ask', reason: 'The policy requires approval before this action.' }, { id: 'permitted', when: { op: 'and', rules: [{ op: 'eq', field: 'approved', value: true }, { op: 'eq', field: 'toolListed', value: true }] }, choiceId: 'proceed', reason: 'Approval and tool availability are both established.' }], defaultChoiceId: 'deny', defaultReason: 'The stated permission conditions are not met.' },
];
export const EXAMPLE_ACTIVITY_SOURCE: Pick<Source, 'id' | 'title' | 'text' | 'status'> = { id: 'example-material', title: 'Structured activity examples', text: ACTIVITY_EXAMPLES.flatMap(activity => activity.sourceRefs.map(ref => ref.evidence)).join('\n\n'), status: 'ready' };
