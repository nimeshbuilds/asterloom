import { describe, expect, it } from 'vitest';
import { serializeProgress } from '../src/lib/package';
import { progressBackupNotebookId, restoreNotebookProgress, serializeNotebookProgress } from '../src/lib/progressBackup';
import { TREE_PICTURE_BUILD, PICTURE_BUILD_EXAMPLE_SOURCE } from '../src/lib/pictureBuildExamples';
import { initialPictureBuildResponse } from '../src/lib/pictureBuildEngine';
import { emptyProgress } from '../src/lib/storage';
import { createNotebook } from '../src/lib/utils';
import { advanceChildPlay, initialChildPlayResponse } from '../src/lib/childPlayEngine';
import { childPlaySources, pretendPlayFixture, puppetStoryFixture } from '../src/data/childPlayFixtures';
import { independentStructuredCount, reviewAfterEvaluation } from '../src/lib/structuredReview';
import {bytesDigest} from '../src/lib/evidence';
import {reconcileNotebookProgress} from '../src/lib/progressRevision';
import type { Notebook, Progress } from '../src/types';

const at = '2026-10-04T00:00:00.000Z';
function fixture(): { notebook: Notebook; progress: Progress } {
  const notebook = createNotebook({ id: 'progress-world', sources: structuredClone(childPlaySources), activities: [structuredClone(puppetStoryFixture)], cards: [{ id: 'term-cup', prompt: 'Which object begins on the Tray?', answer: 'cup', options: ['cup', 'apple'], correctIndex: 0, explanation: 'The script places the cup on the Tray.', sourceId: 'puppet-script', evidence: 'The cup begins on the Tray; the Table is the sharing station.', concept: 'cup', tags: [], questionType: 'cloze' }] });
  let response = initialChildPlayResponse(puppetStoryFixture);
  for (const actionId of ['ada-asks', 'bo-shares']) { const next = advanceChildPlay(puppetStoryFixture, response, actionId); if (!next.success) throw new Error(next.error); response = next.response; }
  const review = reviewAfterEvaluation(puppetStoryFixture.id, undefined, { valid: true, correct: true, score: 3, maxScore: 3, outcome: 'correct', feedback: 'Shared', details: [] }, at);
  const progress: Progress = { ...emptyProgress(notebook.id), xp: 70, sessions: 1, completedCardIds: ['term-cup'], mastery: 100, cards: { 'term-cup': { cardId: 'term-cup', attempts: 1, correct: 1, successfulReviews: 1, intervalDays: 1, dueAt: at, lastAttemptAt: at, lastCorrect: true } }, attempts: [{ id: 'attempt-one', cardId: 'term-cup', correct: true, at, confidence: 'confident', xp: 20 }], journal: [{ id: 'journal-one', text: 'I can share the cup.', at }], activeSession: { scaffoldId: 'recall-escape-mission', cardIds: ['term-cup'], index: 0, seed: 42, startedAt: at, state: { submitted: true, correct: true } }, structured: { [puppetStoryFixture.id]: { response, completed: true, score: 3, maxScore: 3, attempts: 1, updatedAt: at, review } } };
  return { notebook, progress };
}

describe('content-bound portable progress', () => {
  it('restores matching answers, independent reviews and the exact unfinished session', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    expect(progressBackupNotebookId(text)).toBe(notebook.id);
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.progress).toEqual(progress);
    expect(result).toMatchObject({ resetObjectiveCount: 0, legacy: false });
    expect(independentStructuredCount(result.progress)).toBe(1);
    expect(JSON.parse(text).models.cards['term-cup']).toMatch(/^[a-f0-9]{64}$/);
  });
  it('cannot restore old completion when a same-ID child story has different reviewed rules', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.activities = [{ ...structuredClone(pretendPlayFixture), id: puppetStoryFixture.id }];
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.progress.structured).toEqual({});
    expect(independentStructuredCount(result.progress)).toBe(0);
    expect(result.progress.completedCardIds).toEqual(['term-cup']);
    expect(result.progress.xp).toBe(70);
    expect(result.progress.journal).toEqual(progress.journal);
    expect(result.resetObjectiveCount).toBe(1);
    expect(result.notice).toContain('fresh attempts');
  });
  it('clears stale submitted answers and schedules after a card answer changes', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.cards[0] = { ...notebook.cards[0], answer: 'Tray', prompt: 'Where does the cup begin?', options: ['Tray', 'Table'] };
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.progress.completedCardIds).toEqual([]);
    expect(result.progress.cards).toEqual({});
    expect(result.progress.activeSession).toBeUndefined();
    expect(result.progress.mastery).toBe(0);
    expect(result.progress.attempts).toEqual(progress.attempts);
    expect(result.progress.structured).toEqual(progress.structured);
  });
  it('keeps progress through cosmetic metadata and unrelated source additions', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.title = 'A new world title'; notebook.theme = 'forest'; notebook.revision++;
    notebook.activities![0] = { ...notebook.activities![0], title: 'A new mission title', hint: 'A different reminder.', scaffoldIds: [] };
    notebook.sources[0].text += '\nAn unrelated footnote.';
    expect((await restoreNotebookProgress(notebook, text)).progress).toEqual(progress);
  });
  it('resets removed objectives and quotations that no longer exist', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.cards = []; notebook.sources[0].text = 'A different script.';
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.resetObjectiveCount).toBe(2);
    expect(result.progress.structured).toEqual({});
    expect(result.progress.activeSession).toBeUndefined();
  });
  it('binds referenced media bytes so replaced audio or images do not keep old scores', async () => {
    const { notebook, progress } = fixture();
    notebook.sources[0].kind = 'audio'; notebook.sources[0].mime = 'audio/mpeg'; notebook.sources[0].dataUrl = 'data:audio/mpeg;base64,AAAA';
    const text = await serializeNotebookProgress(notebook, progress);
    notebook.sources[0].dataUrl = 'data:audio/mpeg;base64,AAAB';
    const result = await restoreNotebookProgress(notebook, text);
    expect(result.resetObjectiveCount).toBe(2);
    expect(result.progress.structured).toEqual({});
  });
  it('binds supplied picture and narration assets even when they are separate from source quotations', async () => {
    for (const kind of ['image', 'audio'] as const) {
      const { notebook, progress } = fixture();
      const activity = structuredClone(TREE_PICTURE_BUILD);
      if (kind === 'image') activity.parts[0].imageSourceId = 'supplied-media';
      else activity.tell.narrationSourceIds = ['supplied-media'];
      const response = initialPictureBuildResponse(activity);
      response.parts = structuredClone(activity.referenceBuilds[0].parts);
      response.tell.checks = Object.fromEntries(activity.tell.caregiverChecks.map(check => [check.id, true]));
      response.tell.reviewed = true;
      response.tell.reviewedState = { parts: structuredClone(response.parts), method: response.tell.method, words: '', narrationSourceId: '' };
      notebook.activities = [activity];
      notebook.sources.push(structuredClone(PICTURE_BUILD_EXAMPLE_SOURCE), { id: 'supplied-media', title: 'Supplied media', kind, text: '', dataUrl: kind === 'image' ? 'data:image/png;base64,AAAA' : 'data:audio/mpeg;base64,AAAA', status: 'ready', addedAt: at });
      progress.structured = { [activity.id]: { response, completed: true, score: 0, maxScore: 0, attempts: 1, updatedAt: at } };
      const text = await serializeNotebookProgress(notebook, progress);
      expect((await restoreNotebookProgress(notebook, text)).progress.structured).toEqual(progress.structured);
      notebook.sources[notebook.sources.length - 1].dataUrl += 'AA==';
      expect((await restoreNotebookProgress(notebook, text)).progress.structured).toEqual({});
    }
  });
  it('preserves credit between native assets and inline exports but resets replaced recording bytes', async () => {
    const {notebook,progress}=fixture();
    const bytes=new Uint8Array([0,1,2,3]),hash=bytesDigest(bytes);
    notebook.sources[0]={...notebook.sources[0],kind:'audio',mime:'audio/mpeg',asset:{id:hash,sha256:hash,name:'lesson.mp3',mime:'audio/mpeg',size:bytes.length}};
    const saved=await serializeNotebookProgress(notebook,progress);
    const inline=structuredClone(notebook);inline.sources[0]={...inline.sources[0],asset:undefined,dataUrl:'data:audio/mpeg;base64,AAECAw=='};
    expect((await restoreNotebookProgress(inline,saved)).progress).toEqual(progress);
    expect(reconcileNotebookProgress(notebook,inline,progress)).toEqual(progress);
    const changed=structuredClone(notebook),newHash=bytesDigest(new Uint8Array([0,1,2,4]));changed.sources[0].asset={...changed.sources[0].asset!,id:newHash,sha256:newHash};
    expect((await restoreNotebookProgress(changed,saved)).resetObjectiveCount).toBe(2);
    const revised=reconcileNotebookProgress(notebook,changed,progress);
    expect(revised.structured).toEqual({});expect(revised.completedCardIds).toEqual([]);expect(revised.xp).toBe(progress.xp);
  });
  it('restores legacy history with an explicit conservative reset of unverifiable answers', async () => {
    const { notebook, progress } = fixture();
    const result = await restoreNotebookProgress(notebook, serializeProgress(progress));
    expect(result.legacy).toBe(true);
    expect(result.notice).toMatch(/older backup cannot verify/);
    expect(result.progress).toMatchObject({ xp: 70, sessions: 1, cards: {}, structured: {}, completedCardIds: [], mastery: 0 });
    expect(result.progress.activeSession).toBeUndefined();
    expect(result.progress.journal).toEqual(progress.journal);
    expect(independentStructuredCount(result.progress)).toBe(0);
  });
  it('rejects mismatched identities, malformed or excessive fingerprints, and unsafe data', async () => {
    const { notebook, progress } = fixture();
    const text = await serializeNotebookProgress(notebook, progress);
    await expect(restoreNotebookProgress({ ...notebook, id: 'another-world' }, text)).rejects.toThrow(/matching notebook/);
    await expect(serializeNotebookProgress(notebook, { ...progress, notebookId: 'another-world' })).rejects.toThrow(/different notebook/);
    const data = JSON.parse(text); data.models.cards['term-cup'] = 'fake';
    await expect(restoreNotebookProgress(notebook, JSON.stringify(data))).rejects.toThrow(/fingerprint/);
    data.models.cards = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`card-${i}`, 'a'.repeat(64)]));
    await expect(restoreNotebookProgress(notebook, JSON.stringify(data))).rejects.toThrow(/too many/);
    await expect(restoreNotebookProgress(notebook, text.replace('"version": 2', '"__proto__": {}, "version": 2'))).rejects.toThrow(/unsafe/);
  });
  it('cannot treat inherited object names as matching missing objective fingerprints', async () => {
    const { notebook, progress } = fixture();
    const backup = JSON.parse(await serializeNotebookProgress(notebook, progress));
    backup.progress.completedCardIds.push('toString');
    const result = await restoreNotebookProgress(notebook, JSON.stringify(backup));
    expect(result.progress.completedCardIds).toEqual(['term-cup']);
    expect(result.resetObjectiveCount).toBe(1);
  });
  it('stores model digests, never notebook materials or extra provider credentials', async () => {
    const { notebook, progress } = fixture();
    Object.assign(progress, { apiKey: 'private-provider-key' });
    const text = await serializeNotebookProgress(notebook, progress);
    expect(text).not.toContain('private-provider-key');
    expect(text).not.toContain('would you like to use the cup');
    expect(Object.keys(JSON.parse(text))).toEqual(['format', 'version', 'progress', 'models']);
  });
});
