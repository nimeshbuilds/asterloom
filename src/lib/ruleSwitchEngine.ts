import type { ActivityBase, Evaluation } from './structuredEngine';
export interface RuleSwitchItem { id: string; label: string; attributes: Record<string, string>; evidenceRefs: number[] }
export interface RuleSwitchRound { id: string; feature: string; featureLabel?: string; label: string; instruction: string; categories: { id: string; label: string }[]; evidenceRefs: number[] }
export interface RuleSwitchActivity extends ActivityBase { kind: 'rule-switch'; items: RuleSwitchItem[]; rounds: [RuleSwitchRound, RuleSwitchRound]; transitionInstruction: string }
export interface RuleSwitchResponse {
  phase: 'first' | 'transition' | 'second'; assignments: Record<string, Record<string, string>>;
  selectedItemId: string; firstCommitted: boolean; switchAcknowledged: boolean;
}
const BASE = ['version', 'id', 'title', 'instruction', 'sourceRefs', 'reviewStatus', 'explanation', 'hint', 'kind', 'scaffoldIds', 'extractedFrom'];
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export function validateRuleSwitchFields(input: Record<string, unknown>): string[] {
  const errors: string[] = [], refs: unknown[] = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  const evidence = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= refs.length && new Set(v).size === v.length && v.every(i => Number.isInteger(i) && i >= 0 && i < refs.length);
  const excerpt = (v: number[]) => v.map(i => refs[i]).filter(plain).map(ref => typeof ref.evidence === 'string' ? ref.evidence : '').join('\n');
  if (input.kind !== 'rule-switch' || !fields(input, [...BASE, 'items', 'rounds', 'transitionInstruction'])) errors.push('rule-switch: unsupported or unknown field');
  if (!text(input.transitionInstruction)) errors.push('rule-switch: explain how the second rule changes the task');
  const rounds = Array.isArray(input.rounds) && input.rounds.length === 2 ? input.rounds : [];
  if (!rounds.length) errors.push('rule-switch.rounds: exactly two prepared rules are required');
  const roundIds = new Set<string>(), features: string[] = [], featureLabels = new Set<string>(), categoryIds: Set<string>[] = [], categoryLabels: Map<string, string>[] = [];
  rounds.forEach((round, index) => {
    if (!plain(round) || !fields(round, ['id', 'feature', 'featureLabel', 'label', 'instruction', 'categories', 'evidenceRefs']) || !id(round.id) || roundIds.has(round.id) || !id(round.feature) || features.includes(round.feature) || round.featureLabel !== undefined && !text(round.featureLabel, 150) || !text(round.label, 150) || !text(round.instruction)) { errors.push(`rule-switch.rounds[${index}]: use distinct rule identifiers and distinct source features`); return; }
    roundIds.add(round.id); features.push(round.feature);
    const featureLabel = typeof round.featureLabel === 'string' ? round.featureLabel : round.feature;
    if (featureLabels.has(featureLabel.trim().toLowerCase())) errors.push('rule-switch.rounds: the two rules must name different source features');
    featureLabels.add(featureLabel.trim().toLowerCase());
    if (!evidence(round.evidenceRefs) || !excerpt(round.evidenceRefs).includes(typeof round.featureLabel === 'string' ? round.featureLabel : round.feature)) errors.push(`rule-switch.rounds[${index}]: cite source text naming this feature`);
    const categories = Array.isArray(round.categories) && round.categories.length >= 2 && round.categories.length <= 5 ? round.categories : [], ids = new Set<string>(), labels = new Map<string, string>();
    if (!categories.length) errors.push(`rule-switch.rounds[${index}]: expected 2–5 categories`);
    categories.forEach(category => { if (!plain(category) || !fields(category, ['id', 'label']) || !id(category.id) || ids.has(category.id) || !text(category.label, 100) || [...labels.values()].some(label => typeof category.label === 'string' && label.trim().toLowerCase() === category.label.trim().toLowerCase())) errors.push(`rule-switch.rounds[${index}]: invalid or duplicate category`); else { ids.add(category.id); labels.set(category.id, category.label); } });
    categoryIds.push(ids); categoryLabels.push(labels);
  });
  const items = Array.isArray(input.items) && input.items.length >= 3 && input.items.length <= 12 ? input.items : [];
  if (!items.length) errors.push('rule-switch.items: expected 3–12 objects to regroup');
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (!plain(item) || !fields(item, ['id', 'label', 'attributes', 'evidenceRefs']) || !id(item.id) || ids.has(item.id) || !text(item.label, 300)) { errors.push(`rule-switch.items[${index}]: invalid or duplicate object`); return; }
    ids.add(item.id);
    if (!plain(item.attributes) || Object.keys(item.attributes).length !== 2 || features.length !== 2 || Object.keys(item.attributes).some(key => !features.includes(key))) { errors.push(`rule-switch.items[${index}]: provide the two named source features`); return; }
    const attributes = item.attributes;
    features.forEach((feature, n) => { if (typeof attributes[feature] !== 'string' || !categoryIds[n]?.has(attributes[feature] as string)) errors.push(`rule-switch.items[${index}]: unknown category value for ${feature}`); });
    if (!evidence(item.evidenceRefs) || !excerpt(item.evidenceRefs).includes(item.label) || features.some((feature, n) => typeof attributes[feature] !== 'string' || ![attributes[feature] as string, categoryLabels[n]?.get(attributes[feature] as string)].some(value => value && excerpt(item.evidenceRefs as number[]).includes(value)))) errors.push(`rule-switch.items[${index}]: cite an exact annotation containing the object label and both feature values`);
  });
  if (!errors.length && features.length === 2) {
    const values = items as unknown as RuleSwitchItem[];
    const changed = values.some((a, i) => values.slice(i + 1).some(b => (a.attributes[features[0]] === b.attributes[features[0]]) !== (a.attributes[features[1]] === b.attributes[features[1]])));
    if (!changed) errors.push('rule-switch: the second rule must actually regroup at least one pair of objects; renaming identical groups is insufficient');
  }
  return errors;
}
export function initialRuleSwitchResponse(activity: RuleSwitchActivity, saved?: unknown): RuleSwitchResponse {
  const value = plain(saved) ? saved : {}, stored = plain(value.assignments) ? value.assignments : {};
  const assignments = Object.fromEntries(activity.rounds.map(round => {
    const group: Record<string, unknown> = plain(stored[round.id]) ? stored[round.id] as Record<string, unknown> : {};
    return [round.id, Object.fromEntries(activity.items.map(item => [item.id, round.categories.some(c => c.id === group[item.id]) ? group[item.id] as string : '']))];
  }));
  const firstCommitted = value.firstCommitted === true && activity.items.every(item => !!assignments[activity.rounds[0].id][item.id]);
  const switchAcknowledged = firstCommitted && value.switchAcknowledged === true;
  if (!switchAcknowledged) assignments[activity.rounds[1].id] = Object.fromEntries(activity.items.map(item => [item.id, '']));
  return { phase: firstCommitted ? switchAcknowledged ? 'second' : 'transition' : 'first', assignments, selectedItemId: activity.items.some(item => item.id === value.selectedItemId) ? value.selectedItemId as string : activity.items[0].id, firstCommitted, switchAcknowledged };
}
export function evaluateRuleSwitch(activity: RuleSwitchActivity, response: unknown): Evaluation {
  const invalid = (feedback: string): Evaluation => ({ valid: false, correct: false, outcome: 'invalid', score: 0, maxScore: activity.items.length * 2, feedback, details: [] });
  if (validateRuleSwitchFields(activity as unknown as Record<string, unknown>).length) return invalid('The two-rule model needs author review.');
  if (!plain(response) || !fields(response, ['phase', 'assignments', 'selectedItemId', 'firstCommitted', 'switchAcknowledged']) || response.phase !== 'second' || response.firstCommitted !== true || response.switchAcknowledged !== true || !plain(response.assignments) || Object.keys(response.assignments).length !== 2 || !activity.items.some(i => i.id === response.selectedItemId)) return invalid('Complete the first sort, read the changed rule, then complete the second sort.');
  const assignments = response.assignments;
  for (const round of activity.rounds) {
    const group = assignments[round.id];
    if (!plain(group) || Object.keys(group).length !== activity.items.length || activity.items.some(item => !round.categories.some(c => c.id === group[item.id]))) return invalid('Place every object in both rounds before checking your work.');
  }
  const details = activity.rounds.flatMap(round => activity.items.map(item => ({ id: `${round.id}-${item.id}`, correct: (assignments[round.id] as Record<string, string>)[item.id] === item.attributes[round.feature], message: `${round.label}: ${item.label} belongs in ${round.categories.find(c => c.id === item.attributes[round.feature])!.label}.` })));
  const score = details.filter(d => d.correct).length, correct = score === details.length;
  return { valid: true, correct, outcome: correct ? 'correct' : 'retry', score, maxScore: details.length, feedback: `${correct ? 'You regrouped the same objects using two different rules.' : 'Look at the active rule for each round. You can restart both rounds to try the change again.'} ${activity.explanation}`, details };
}
