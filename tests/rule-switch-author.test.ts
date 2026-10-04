import { describe, expect, it } from 'vitest';
import { compileRuleSwitchDraft, initialRuleSwitchAuthorDraft, restoreRuleSwitchAuthorDraft } from '../src/lib/ruleSwitchAuthorDraft';
import type { RuleSwitchAuthorDraft } from '../src/lib/ruleSwitchAuthorDraft';
import { ruleSwitchFixture, ruleSwitchSources } from '../src/data/ruleSwitchFixtures';
import { evaluateRuleSwitch, initialRuleSwitchResponse } from '../src/lib/ruleSwitchEngine';
function draft(): RuleSwitchAuthorDraft {
  return { ...initialRuleSwitchAuthorDraft(ruleSwitchSources[0].id), title: 'Our changing-rule game', explanation: 'Notice which feature decides the group.',
    rules: ruleSwitchFixture.rounds.map(r => ({ featureLabel: r.feature, categories: r.categories.map(c => c.id).join('\n'), instruction: r.instruction, sourceId: ruleSwitchSources[0].id, evidence: ruleSwitchFixture.sourceRefs[r.evidenceRefs[0]].evidence })) as RuleSwitchAuthorDraft['rules'],
    items: ruleSwitchFixture.items.map(item => ({ id: item.id, label: item.label, firstCategory: item.attributes.color, secondCategory: item.attributes.shape, sourceId: ruleSwitchSources[0].id, evidence: ruleSwitchFixture.sourceRefs[item.evidenceRefs[0]].evidence })),
  };
}
describe('changing-rule creator', () => {
  it('compiles a human-readable form into a deterministic source-backed review draft', () => {
    const result = compileRuleSwitchDraft(draft(), ruleSwitchSources, 'authored-switch');
    expect(result.success).toBe(true); if (!result.success) return;
    expect(result.activity.reviewStatus).toBe('needs-review'); expect(result.activity.scaffoldIds).toEqual(['changing-rule-sorter']);
    expect(result.activity.rounds[0]).toMatchObject({ feature: 'feature-1', featureLabel: 'color' });
    expect(result.activity.sourceRefs).toHaveLength(6);
    const response = initialRuleSwitchResponse(result.activity); response.phase = 'second'; response.firstCommitted = true; response.switchAcknowledged = true;
    response.assignments = Object.fromEntries(result.activity.rounds.map(round => [round.id, Object.fromEntries(result.activity.items.map(item => [item.id, item.attributes[round.feature]]))]));
    expect(evaluateRuleSwitch(result.activity, response)).toMatchObject({ correct: true, score: 8, maxScore: 8 });
  });
  it('rejects an edited or stale excerpt before emitting any activity', () => {
    const value = draft(); value.items[0].evidence = 'The first object is a yellow star.';
    expect(compileRuleSwitchDraft(value, ruleSwitchSources, 'authored-switch')).toMatchObject({ success: false });
    expect(compileRuleSwitchDraft(draft(), [{ ...ruleSwitchSources[0], text: 'The source was replaced.' }], 'authored-switch')).toMatchObject({ success: false });
  });
  it('does not accept renamed duplicate features or categories that only differ in case', () => {
    const value = draft(); value.rules[1].featureLabel = 'Color'; value.rules[1].evidence += ' Color';
    expect(compileRuleSwitchDraft(value, ruleSwitchSources, 'authored-switch').success).toBe(false);
    const duplicate = draft(); duplicate.rules[0].categories = 'red\nRed'; expect(compileRuleSwitchDraft(duplicate, ruleSwitchSources, 'authored-switch').success).toBe(false);
  });
  it('requires every item to be assigned in both rules and a true regrouping', () => {
    const missing = draft(); missing.items[0].secondCategory = ''; expect(compileRuleSwitchDraft(missing, ruleSwitchSources, 'authored-switch').success).toBe(false);
    const oneRule = draft(); oneRule.rules[1] = { ...oneRule.rules[0] }; expect(compileRuleSwitchDraft(oneRule, ruleSwitchSources, 'authored-switch').success).toBe(false);
  });
  it('restores incomplete draft fields and bounds corrupted browser storage', () => {
    const saved = draft(); saved.items[0].secondCategory = ''; saved.rules[1].instruction = '';
    expect(restoreRuleSwitchAuthorDraft(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    const bad = restoreRuleSwitchAuthorDraft({ version: 1, title: 'x'.repeat(10000), rules: [{ featureLabel: 'x'.repeat(1000), sourceId: '__proto__' }], items: Array.from({ length: 100 }, (_, n) => ({ id: `item-${n}`, label: 'x'.repeat(2000) })) }, 'fallback-source');
    expect(bad.title).toBe('Two ways to sort'); expect(bad.rules).toHaveLength(2); expect(bad.rules[0].sourceId).toBe('fallback-source'); expect(bad.rules[0].featureLabel).toBe(''); expect(bad.items).toHaveLength(12); expect(bad.items[0].label).toBe('');
  });
  it('supports source wording with spaces without asking the creator for identifiers', () => {
    const value = draft(), source = structuredClone(ruleSwitchSources[0]);
    source.text = source.text.replaceAll('color', 'surface color'); value.rules[0].featureLabel = 'surface color'; value.rules[0].evidence = value.rules[0].evidence.replaceAll('color', 'surface color'); value.items.forEach(item => { item.evidence = item.evidence.replaceAll('color', 'surface color'); });
    expect(compileRuleSwitchDraft(value, [source], 'authored-switch').success).toBe(true);
  });
});
