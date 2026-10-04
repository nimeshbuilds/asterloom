import { describe, expect, it } from 'vitest';
import { evaluatePicture, initialPictureResponse, isPictureNarration, isPictureRaster, validatePictureFields, validatePictureSources } from '../src/lib/pictureEngine';
import type { PictureActivity } from '../src/lib/pictureEngine';
import { pictureDiscoveryFixture, pictureSources, pictureWordFixture } from '../src/data/pictureFixtures';
import { initialPictureAuthorDraft, restorePictureAuthorDraft } from '../src/lib/pictureAuthorDraft';

const copy = () => structuredClone(pictureDiscoveryFixture);
const check = (activity: PictureActivity) => validatePictureFields(activity as unknown as Record<string, unknown>);
const complete = (activity = pictureDiscoveryFixture) => ({ ...initialPictureResponse(activity), phase: 'play' as const, answers: Object.fromEntries(activity.rounds.map(r => [r.id, r.correctTokenIds[0]])) });

describe('source-attached child picture activity', () => {
  it('validates both genuine interaction modes against the bundled raster and exact annotations', () => {
    for (const activity of [pictureDiscoveryFixture, pictureWordFixture]) {
      expect(check(activity)).toEqual([]);
      expect(validatePictureSources(activity, pictureSources)).toEqual([]);
      expect(isPictureRaster(pictureSources[0].dataUrl)).toBe(true);
    }
  });
  it('rejects off-image, non-finite, tiny, or identical regions', () => {
    for (const changes of [{ x: 95 }, { y: -1 }, { width: NaN }, { height: 1 }, { x: 38, y: 23, width: 24, height: 49 }]) {
      const activity = copy(); Object.assign(activity.tokens[0], changes); expect(check(activity).length).toBeGreaterThan(0);
    }
  });
  it('requires each region label to occur in its own cited image annotation', () => {
    const activity = copy(); activity.tokens[0].label = 'banana'; expect(check(activity).join(' ')).toMatch(/region label/);
    const wrongSource = copy(); wrongSource.sourceRefs[0].sourceId = 'unrelated-image'; expect(check(wrongSource).join(' ')).toMatch(/scene annotation/);
  });
  it('blocks changed source text and missing image attachments', () => {
    expect(validatePictureSources(copy(), [{ ...pictureSources[0], text: 'The illustration was replaced.' }]).join(' ')).toMatch(/evidence must occur exactly/);
    expect(validatePictureSources(copy(), [{ ...pictureSources[0], dataUrl: undefined }]).join(' ')).toMatch(/attach a PNG/);
  });
  it('rejects external URLs, active SVG, malformed base64 and MIME impersonation', () => {
    for (const input of ['https://example.com/photo.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,####', 'data:image/png;base64,SGVsbG8=']) expect(isPictureRaster(input)).toBe(false);
    expect(isPictureNarration(pictureSources[0].dataUrl)).toBe(false);
  });
  it('rejects unknown fields, prototype identifiers and duplicate reference indexes', () => {
    const activity = copy(); activity.tokens[0].id = '__proto__'; expect(check(activity).length).toBeGreaterThan(0);
    const duplicate = copy(); duplicate.rounds[0].evidenceRefs = [2, 2]; expect(check(duplicate).length).toBeGreaterThan(0);
    expect(validatePictureFields({ ...copy(), script: 'alert(1)' }).join(' ')).toMatch(/unknown field/);
  });
  it('requires answer references and meaningful alternatives', () => {
    for (const correctTokenIds of [['unknown'], ['pear', 'cup', 'apple'], []]) { const activity = copy(); activity.rounds[0].correctTokenIds = correctTokenIds; expect(check(activity).length).toBeGreaterThan(0); }
    const activity = copy(); activity.rounds[0].tokenIds = ['cup']; expect(check(activity).length).toBeGreaterThan(0);
  });
  it('does not mislabel arbitrary clue prompts as word-picture matching', () => {
    const activity = copy(); activity.mode = 'word-picture'; expect(check(activity).join(' ')).toMatch(/exactly match/);
    expect(check(structuredClone(pictureWordFixture))).toEqual([]);
  });
  it('restores only valid bounded progress and preserves guidance across reopening', () => {
    const restored = initialPictureResponse(copy(), { phase: 'play', activeRoundId: 'narrow', answers: { drink: 'cup', narrow: 'invented', unrelated: 'apple' }, exploredTokenIds: ['pear', 'pear', 'unknown'], listenedRoundIds: ['drink', 'unknown'], caregiverSupport: true });
    expect(restored.activeRoundId).toBe('narrow'); expect(restored.answers).toEqual({ drink: 'cup', narrow: '', round: '' });
    expect(restored.exploredTokenIds).toEqual(['pear']); expect(restored.listenedRoundIds).toEqual([]); expect(restored.caregiverSupport).toBe(true);
    expect(initialPictureResponse(copy(), { activeRoundId: '__proto__' }).activeRoundId).toBe('drink');
  });
  it('does not award progress for merely exploring or for partial answers', () => {
    expect(evaluatePicture(copy(), initialPictureResponse(copy())).valid).toBe(false);
    expect(evaluatePicture(copy(), { ...complete(), answers: { drink: 'cup' } }).valid).toBe(false);
    expect(evaluatePicture(copy(), { ...complete(), answers: { ...complete().answers, extra: 'cup' } }).valid).toBe(false);
  });
  it('evaluates choices deterministically and permits revision without a time penalty', () => {
    const saved = complete(); saved.answers.narrow = 'apple';
    const first = evaluatePicture(copy(), saved); expect(first).toMatchObject({ valid: true, correct: false, outcome: 'retry', score: 2, maxScore: 3 });
    const revised = { ...saved, answers: { ...saved.answers, narrow: 'pear' } };
    expect(evaluatePicture(copy(), revised)).toMatchObject({ valid: true, correct: true, outcome: 'correct', score: 3 });
    expect(evaluatePicture(copy(), saved)).toEqual(first);
  });
  it('marks caregiver-guided answers as supported without reducing their score', () => {
    expect(evaluatePicture(copy(), { ...complete(), caregiverSupport: true })).toMatchObject({ correct: true, score: 3, hintUsed: true });
    expect(evaluatePicture(copy(), complete())).toMatchObject({ correct: true, score: 3, hintUsed: false });
  });
  it('requires recorded clues to carry a matching transcript, exact reference and offline audio', () => {
    const activity = copy(); const prompt = activity.rounds[0].prompt;
    // Minimal format fixture tests validation only; not shipped as spoken narration.
    const wave = 'data:audio/wav;base64,' + btoa('RIFF' + '\0'.repeat(4) + 'WAVE' + '\0'.repeat(32));
    activity.rounds[0].narrationSourceId = 'recorded-clue';
    expect(check(activity).join(' ')).toMatch(/narration must cite/);
    activity.sourceRefs.push({ sourceId: 'recorded-clue', evidence: prompt }); activity.rounds[0].evidenceRefs.push(3);
    expect(check(activity)).toEqual([]);
    const narration = { id: 'recorded-clue', text: prompt, dataUrl: wave };
    expect(validatePictureSources(activity, [...pictureSources, narration])).toEqual([]);
    expect(validatePictureSources(activity, [...pictureSources, { ...narration, dataUrl: 'https://example.com/voice.mp3' }]).join(' ')).toMatch(/attach recorded narration/);
    expect(validatePictureSources(activity, [...pictureSources, { ...narration, text: 'A different clue.' }]).join(' ')).toMatch(/exact prompt transcript/);
  });
  it('restores unfinished authoring controls without copying raw image attachments', () => {
    const draft = { ...initialPictureAuthorDraft('picnic-picture'), title: 'A draft in progress', mode: 'word-picture' as const, label: 'cup', excerpt: 'The cup is blue.', point: { x: 31, y: 40 }, regions: [{ ...pictureDiscoveryFixture.tokens[0], evidence: pictureDiscoveryFixture.sourceRefs[0].evidence }], rounds: [{ id: 'unfinished', prompt: '', correctId: 'apple', reason: '', evidence: 'The apple is a round red fruit with a short brown stem and one green leaf.', narrationSourceId: '' }] };
    const restored = restorePictureAuthorDraft(JSON.parse(JSON.stringify(draft)));
    expect(restored).toMatchObject({ title: 'A draft in progress', mode: 'word-picture', label: 'cup', point: { x: 31, y: 40 }, rounds: [{ id: 'unfinished', correctId: 'apple' }] });
    expect(JSON.stringify(restored)).not.toMatch(/data:image|evidenceRefs/);
  });
  it('bounds forged author drafts and discards invalid region/prototype state', () => {
    const restored = restorePictureAuthorDraft({ version: 1, title: 'x'.repeat(10000), sourceId: '__proto__', selection: { x: 95, y: 0, width: 20, height: 10 }, point: { x: NaN, y: 0 }, regions: [{ id: '__proto__', x: 0, y: 0, width: 10, height: 10 }, { id: 'off-canvas', x: 90, y: 90, width: 50, height: 20 }], rounds: Array.from({ length: 100 }, (_, i) => ({ id: `round-${i}`, correctId: 'invented' })) }, 'picnic-picture');
    expect(restored.title).toBe('My picture discovery'); expect(restored.sourceId).toBe('picnic-picture'); expect(restored.regions).toEqual([]); expect(restored.rounds).toHaveLength(12); expect(restored.point).toBeNull(); expect(restored.selection).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});
