import { describe, expect, it } from 'vitest';
import { evaluateActivity, parseActivities, validateActivity } from '../src/lib/structuredEngine';
import { COMPLETION_EXAMPLES, DATA_EXAMPLES, EXTENDED_EXAMPLES, EXTENDED_EXAMPLE_SOURCES, MEDIA_EXAMPLE, trainingToneSource } from '../src/lib/extendedExamples';
import { initialCompletionResponse } from '../src/lib/completionEngine';
import { computeDataAnswer, initialDataResponse } from '../src/lib/dataEngine';
import { initialMediaResponse, mediaCaptionTrack } from '../src/lib/mediaEngine';
describe('extended source-grounded labs', () => {
  it.each(EXTENDED_EXAMPLES.map(a => [a.id, a] as const))('validates %s and rejects stale source grounding', (_, activity) => {
    expect(validateActivity(activity, EXTENDED_EXAMPLE_SOURCES).success).toBe(true);
    expect(validateActivity(activity, EXTENDED_EXAMPLE_SOURCES.map(s => ({ ...s, text: '' }))).success).toBe(false);
    expect(parseActivities(JSON.stringify(activity), EXTENDED_EXAMPLE_SOURCES).success).toBe(true);
  });
  it('accepts declared alternatives and rejects a contradictory repeating pattern', () => {
    const a = structuredClone(COMPLETION_EXAMPLES[0]); a.tokens.push({ id: 'measurement', label: 'a measured observation' }); a.slots[0].acceptedTokenIds.push('measurement');
    expect(evaluateActivity(a, { slotTokens: { measurement: 'measurement', proposal: 'interpretation' } }).correct).toBe(true);
    expect(evaluateActivity(a, { slotTokens: { measurement: 'interpretation', proposal: 'observation' } }).correct).toBe(false);
    const p = structuredClone(COMPLETION_EXAMPLES[1]); p.pattern!.shown[0] = 'triangle';
    expect(validateActivity(p).success).toBe(false);
    p.pattern!.shown[0] = 'circle'; p.slots[0].acceptedTokenIds = ['triangle']; expect(validateActivity(p).success).toBe(false);
  });
  it('restores incomplete completion without accepting unknown token ids', () => {
    const a = COMPLETION_EXAMPLES[0], restored = initialCompletionResponse(a, { slotTokens: { measurement: 'observation', proposal: 'malicious' } });
    expect(restored.slotTokens).toEqual({ measurement: 'observation', proposal: '' });
    expect(evaluateActivity(a, restored).valid).toBe(false);
  });
  it('computes aggregates from typed rows, excludes missing measurements and counts records', () => {
    const a = DATA_EXAMPLES[0]; expect(computeDataAnswer(a, a.questions[0])).toEqual({ value: 20, rowIds: ['a', 'b'] }); expect(computeDataAnswer(a, a.questions[1]).value).toBe(3);
    const r = initialDataResponse(a); r.answers = { 'north-mean': '20', 'north-count': '3' }; r.evidenceRows['north-mean'] = ['a', 'b'];
    expect(evaluateActivity(a, r).correct).toBe(true);
    r.evidenceRows['north-mean'].push('d'); expect(evaluateActivity(a, r).correct).toBe(false);
    r.answers['north-mean'] = 'Infinity'; expect(evaluateActivity(a, r).valid).toBe(false);
  });
  it('rejects impossible aggregates, untyped records and unknown evidence references', () => {
    const a = structuredClone(DATA_EXAMPLES[0]); a.questions[0].filters[0].value = 'missing-zone'; expect(validateActivity(a).success).toBe(false);
    a.questions[0].filters[0].value = 'north'; a.rows[0].values.temperature = '18'; expect(validateActivity(a).success).toBe(false);
    const b = structuredClone(DATA_EXAMPLES[1]); b.rows[0].evidenceRefs = [7]; expect(validateActivity(b).success).toBe(false);
  });
  it('saves timed checkpoints independently of watch-time, and requires source-backed transcripts', () => {
    const r = initialMediaResponse(MEDIA_EXAMPLE, { position: 2.5, activeCheckpointId: 'second', answers: { first: 'low', second: 'twice' }, visitedCheckpointIds: ['first'] });
    expect(r.position).toBe(2.5); expect(evaluateActivity(MEDIA_EXAMPLE, r).correct).toBe(true);
    const bad = structuredClone(MEDIA_EXAMPLE); bad.cues[0].text = 'An invented transcript'; expect(validateActivity(bad).success).toBe(false);
    bad.cues[0].text = MEDIA_EXAMPLE.cues[0].text; bad.checkpoints[1].at = bad.checkpoints[0].at; expect(validateActivity(bad).success).toBe(false);
    expect(decodeURIComponent(mediaCaptionTrack(MEDIA_EXAMPLE))).toContain('00:00:02.000 --> 00:00:03.000');
    const source = trainingToneSource(); expect(source.dataUrl?.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
  });
});
