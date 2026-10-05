import { describe, expect, it, vi } from 'vitest';
import { ACTIVITY_EXAMPLES, EXAMPLE_ACTIVITY_SOURCE } from '../src/lib/structuredEngine';
import { createActivityDraftPrompt, validateActivityDraft, requestActivityDraft } from '../src/lib/activityAssistant';
const raw = (index = 0) => { const { scaffoldIds: _, ...model } = structuredClone(ACTIVITY_EXAMPLES[index]); return model; };
const request = (index = 0) => ({ source: EXAMPLE_ACTIVITY_SOURCE, excerpt: ACTIVITY_EXAMPLES[index].sourceRefs[0].evidence, kind: 'auto' as const, ageGroup: 'adult', goal: 'Use the supplied material' });
describe('optional bounded activity drafting', () => {
  it('discloses only the selected excerpt, rejects unsupported source selection, and always requires review', () => {
    const r = request(), prompt = createActivityDraftPrompt(r);
    expect(prompt).toContain(JSON.stringify(r.excerpt)); expect(prompt).not.toContain(ACTIVITY_EXAMPLES[4].sourceRefs[0].evidence);
    expect(() => createActivityDraftPrompt({ ...r, excerpt: 'Invented instructions' })).toThrow('exact source');
    expect(() => createActivityDraftPrompt({ ...r, excerpt: 'x'.repeat(6001) })).toThrow();
    const a = validateActivityDraft(r, JSON.stringify({ activity: raw() }), 'new-draft');
    expect(a.id).toBe('new-draft'); expect(a.reviewStatus).toBe('needs-review'); expect(a.scaffoldIds).toBeUndefined();
  });
  it('rejects forged citations, undisclosed-source quotes, unsupported runtime fields and automatic recipe claims', () => {
    const r = request(), a = raw(); a.sourceRefs[0].evidence = ACTIVITY_EXAMPLES[4].sourceRefs[0].evidence;
    expect(() => validateActivityDraft(r, JSON.stringify({ activity: a }), 'draft')).toThrow('exactly');
    expect(() => validateActivityDraft(r, JSON.stringify({ activity: { ...raw(), executable: 'alert(1)' } }), 'draft')).toThrow('unknown');
    expect(() => validateActivityDraft(r, JSON.stringify({ activity: { ...raw(), scaffoldIds: ['capstone-campaign'] } }), 'draft')).toThrow('bind');
    expect(() => validateActivityDraft({ ...r, kind: 'dependency' }, JSON.stringify({ activity: raw() }), 'draft')).toThrow('family');
  });
  it('requires a verified feasible allocation for an assistant-produced resource model', () => {
    expect(() => validateActivityDraft(request(4), JSON.stringify({ activity: raw(4) }), 'draft')).toThrow('allocation');
    const draft = { activity: raw(4), solution: { quantities: { small: 2, large: 1 } } };
    expect(validateActivityDraft(request(4), JSON.stringify(draft), 'draft').kind).toBe('budget');
    draft.solution.quantities.large = 4; expect(() => validateActivityDraft(request(4), JSON.stringify(draft), 'draft')).toThrow('allocation');
  });
  it('makes one bounded provider request and never retries malformed output or sends the rest of the notebook', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: JSON.stringify({ activity: raw() }) }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await requestActivityDraft(request(), { provider: 'compatible', model: 'local-test', apiKey: 'ephemeral-only', baseUrl: 'http://127.0.0.1:11434/v1' }, undefined, async()=>true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body); expect(body.maxOutputTokens).toBe(3000); expect(body.prompt).not.toContain('ephemeral-only'); expect(body.prompt).not.toContain(ACTIVITY_EXAMPLES[4].sourceRefs[0].evidence);
      expect(() => validateActivityDraft(request(), '{"cannotBuild":"No supported explicit structure"}', 'draft')).toThrow('could not prepare');
    } finally { vi.unstubAllGlobals(); }
  });
});
