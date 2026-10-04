import { describe, expect, it } from 'vitest';
import { evaluateRuleSwitch, initialRuleSwitchResponse, validateRuleSwitchFields } from '../src/lib/ruleSwitchEngine';
import type { RuleSwitchActivity, RuleSwitchResponse } from '../src/lib/ruleSwitchEngine';
import { ruleSwitchFixture, ruleSwitchSources } from '../src/data/ruleSwitchFixtures';
const copy = () => structuredClone(ruleSwitchFixture);
const check = (activity: RuleSwitchActivity) => validateRuleSwitchFields(activity as unknown as Record<string, unknown>);
const completed = (): RuleSwitchResponse => ({ phase: 'second', firstCommitted: true, switchAcknowledged: true, selectedItemId: 'red-circle', assignments: Object.fromEntries(ruleSwitchFixture.rounds.map(round => [round.id, Object.fromEntries(ruleSwitchFixture.items.map(item => [item.id, item.attributes[round.feature]]))])) });
describe('two rounds with a genuinely changing classification rule', () => {
  it('validates source-cited features and actually distinct grouping rules', () => {
    expect(check(copy())).toEqual([]);
    for (const ref of ruleSwitchFixture.sourceRefs) expect(ruleSwitchSources.find(s => s.id === ref.sourceId)?.text).toContain(ref.evidence);
  });
  it('requires exactly two different feature rules, rather than renamed copies', () => {
    const repeated = copy(); repeated.rounds[1].feature = 'color'; expect(check(repeated).join(' ')).toMatch(/distinct/);
    const renamed = copy(); renamed.items.forEach(item => { item.attributes.shape = item.attributes.color === 'red' ? 'circle' : 'triangle'; const index = item.evidenceRefs[0]; renamed.sourceRefs[index].evidence = `${item.label}: color=${item.attributes.color}; shape=${item.attributes.shape}.`; });
    expect(check(renamed).join(' ')).toMatch(/actually regroup/);
  });
  it('rejects facts that are missing from an item’s cited annotation', () => {
    const activity = copy(); activity.items[0].attributes.shape = 'triangle'; expect(check(activity).join(' ')).toMatch(/exact annotation/);
    const unknown = copy(); unknown.items[0].attributes.color = 'purple'; expect(check(unknown).join(' ')).toMatch(/unknown category/);
  });
  it('rejects unknown fields, duplicate IDs and prototype keys', () => {
    const activity = copy(); activity.items[1].id = activity.items[0].id; expect(check(activity).join(' ')).toMatch(/duplicate object/);
    const prototype = copy(); prototype.rounds[0].feature = '__proto__'; expect(check(prototype).length).toBeGreaterThan(0);
    expect(validateRuleSwitchFields({ ...copy(), scoreScript: 'return100' }).join(' ')).toMatch(/unknown field/);
  });
  it('starts with a complete blank first-round map and no inherited second sort', () => {
    const state = initialRuleSwitchResponse(copy()); expect(state.phase).toBe('first'); expect(state.firstCommitted).toBe(false); expect(Object.values(state.assignments['color-round'])).toEqual(['', '', '', '']);
    const fake = initialRuleSwitchResponse(copy(), { ...completed(), firstCommitted: false }); expect(fake.phase).toBe('first'); expect(Object.values(fake.assignments['shape-round'])).toEqual(['', '', '', '']);
  });
  it('restores the explicit rule-change checkpoint and keeps first-round answers', () => {
    const state = initialRuleSwitchResponse(copy(), { ...completed(), switchAcknowledged: false }); expect(state.phase).toBe('transition'); expect(state.firstCommitted).toBe(true); expect(state.assignments['color-round']).toEqual(completed().assignments['color-round']); expect(Object.values(state.assignments['shape-round'])).toEqual(['', '', '', '']);
    expect(initialRuleSwitchResponse(copy(), completed())).toEqual(completed());
  });
  it('does not accept only the final sort or a missing rule-change acknowledgment', () => {
    expect(evaluateRuleSwitch(copy(), { ...completed(), assignments: { 'shape-round': completed().assignments['shape-round'] } }).valid).toBe(false);
    expect(evaluateRuleSwitch(copy(), { ...completed(), switchAcknowledged: false }).valid).toBe(false);
    const partial = completed(); partial.assignments['color-round']['red-circle'] = ''; expect(evaluateRuleSwitch(copy(), partial).valid).toBe(false);
  });
  it('scores both rounds independently, so the new rule cannot erase prior mistakes', () => {
    const response = completed(); response.assignments['color-round']['red-circle'] = 'blue';
    expect(evaluateRuleSwitch(copy(), response)).toMatchObject({ valid: true, correct: false, score: 7, maxScore: 8, outcome: 'retry' });
    expect(evaluateRuleSwitch(copy(), completed())).toMatchObject({ valid: true, correct: true, score: 8, maxScore: 8 });
  });
  it('bounds restored response keys and drops stale references', () => {
    const response = completed(); response.assignments['shape-round'].intruder = 'triangle'; response.selectedItemId = '__proto__';
    const restored = initialRuleSwitchResponse(copy(), response); expect(restored.selectedItemId).toBe('red-circle'); expect(restored.assignments['shape-round']).not.toHaveProperty('intruder');
    expect(evaluateRuleSwitch(copy(), response).valid).toBe(false);
  });
});
