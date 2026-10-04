import type { Source } from '../types';
import type { RuleSwitchActivity, RuleSwitchRound } from './ruleSwitchEngine';
import { validateRuleSwitchFields } from './ruleSwitchEngine';
export interface SwitchRuleDraft { featureLabel: string; categories: string; instruction: string; sourceId: string; evidence: string }
export interface SwitchItemDraft { id: string; label: string; firstCategory: string; secondCategory: string; sourceId: string; evidence: string }
export interface RuleSwitchAuthorDraft { version: 1; title: string; rules: [SwitchRuleDraft, SwitchRuleDraft]; items: SwitchItemDraft[]; transitionInstruction: string; explanation: string }
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const text = (v: unknown, fallback = '', max = 2000) => typeof v === 'string' && v.length <= max ? v : fallback;
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
export function switchCategoryLabels(input: string): string[] { return input.split('\n').map(v => v.trim()).filter(Boolean); }
export function initialRuleSwitchAuthorDraft(sourceId = ''): RuleSwitchAuthorDraft {
  const rule = (): SwitchRuleDraft => ({ featureLabel: '', categories: '', instruction: '', sourceId, evidence: '' });
  return { version: 1, title: 'Two ways to sort', rules: [rule(), rule()], items: [], transitionInstruction: '', explanation: '' };
}
export function restoreRuleSwitchAuthorDraft(input: unknown, sourceId = ''): RuleSwitchAuthorDraft {
  const initial = initialRuleSwitchAuthorDraft(sourceId);
  if (!plain(input) || input.version !== 1) return initial;
  const rules = [0, 1].map(index => {
    const value: Record<string, unknown> = Array.isArray(input.rules) && plain(input.rules[index]) ? input.rules[index] : {};
    return { featureLabel: text(value.featureLabel, '', 150), categories: text(value.categories, '', 600), instruction: text(value.instruction), sourceId: id(value.sourceId) ? value.sourceId : sourceId, evidence: text(value.evidence, '', 20000) };
  }) as [SwitchRuleDraft, SwitchRuleDraft];
  const ids = new Set<string>(), items: SwitchItemDraft[] = [];
  for (const value of Array.isArray(input.items) ? input.items.slice(0, 12) : []) if (plain(value) && id(value.id) && !ids.has(value.id)) {
    ids.add(value.id); items.push({ id: value.id, label: text(value.label, '', 300), firstCategory: text(value.firstCategory, '', 100), secondCategory: text(value.secondCategory, '', 100), sourceId: id(value.sourceId) ? value.sourceId : sourceId, evidence: text(value.evidence, '', 20000) });
  }
  return { version: 1, title: text(input.title, initial.title, 200), rules, items, transitionInstruction: text(input.transitionInstruction), explanation: text(input.explanation) };
}
export function compileRuleSwitchDraft(draft: RuleSwitchAuthorDraft, sources: Pick<Source, 'id' | 'text'>[], activityId: string): { success: true; activity: RuleSwitchActivity } | { success: false; errors: string[] } {
  const errors: string[] = [], refs: RuleSwitchActivity['sourceRefs'] = [];
  const addRef = (sourceId: string, evidence: string, context: string) => {
    const source = sources.find(s => s.id === sourceId);
    if (!source || !evidence.trim() || evidence.length > 20000 || !source.text.includes(evidence)) errors.push(`${context}: paste an exact excerpt from the selected source.`);
    let index = refs.findIndex(ref => ref.sourceId === sourceId && ref.evidence === evidence);
    if (index < 0) { index = refs.length; refs.push({ sourceId, evidence }); }
    return index;
  };
  if (!draft.title.trim()) errors.push('Give the activity a title.');
  if (!draft.explanation.trim()) errors.push('Explain what the two rules teach after the learner checks their work.');
  const labels = draft.rules.map(r => switchCategoryLabels(r.categories));
  const rounds = draft.rules.map((rule, i): RuleSwitchRound => {
    if (labels[i].some(label => label.length > 100) || new Set(labels[i].map(label => label.toLowerCase())).size !== labels[i].length) errors.push(`Rule ${i + 1}: use distinct category names, each up to 100 characters.`);
    return { id: `rule-${i + 1}`, feature: `feature-${i + 1}`, featureLabel: rule.featureLabel.trim(), label: `${i === 0 ? 'Sort by' : 'Now sort by'} ${rule.featureLabel.trim()}`, instruction: rule.instruction.trim(), categories: labels[i].map((label, n) => ({ id: `rule-${i + 1}-group-${n + 1}`, label })), evidenceRefs: [addRef(rule.sourceId, rule.evidence, `Rule ${i + 1}`)] };
  }) as [RuleSwitchRound, RuleSwitchRound];
  const activity: RuleSwitchActivity = {
    version: 1, id: activityId, kind: 'rule-switch', scaffoldIds: ['changing-rule-sorter'], title: draft.title.trim(), instruction: 'Sort the same objects twice, noticing when the rule changes.', explanation: draft.explanation.trim(), hint: 'Name the current rule before choosing an object’s group.', reviewStatus: 'needs-review', sourceRefs: refs, rounds,
    transitionInstruction: draft.transitionInstruction.trim() || `You sorted by ${rounds[0].featureLabel}. Now sort the same objects by ${rounds[1].featureLabel}.`,
    items: draft.items.map((item, index) => {
      const first = labels[0].indexOf(item.firstCategory), second = labels[1].indexOf(item.secondCategory);
      if (first < 0 || second < 0) errors.push(`Object ${index + 1}: choose its category for both rules.`);
      return { id: item.id, label: item.label.trim(), attributes: { 'feature-1': first >= 0 ? rounds[0].categories[first].id : '', 'feature-2': second >= 0 ? rounds[1].categories[second].id : '' }, evidenceRefs: [addRef(item.sourceId, item.evidence, `Object ${index + 1}`)] };
    }),
  };
  if (!id(activityId)) errors.push('The activity identifier is invalid.');
  errors.push(...validateRuleSwitchFields(activity as unknown as Record<string, unknown>));
  return errors.length ? { success: false, errors: [...new Set(errors)] } : { success: true, activity };
}
