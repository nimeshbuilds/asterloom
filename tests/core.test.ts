import { describe, expect, it, vi, afterEach } from 'vitest';
import { compileNotebook, createManualCard, searchSources, transcriptToText } from '../src/lib/compiler';
import { exportOfflineHtml, parsePackage, parseProgress, serializePackage, serializeProgress, validateNotebook } from '../src/lib/package';
import { emptyProgress, recordAttempt, selectDueCards, sourceFingerprint } from '../src/lib/storage';
import { createNotebook, createSource } from '../src/lib/utils';
import { refineCards, createRefinementPrompt, applyRefinementResponse } from '../src/lib/provider';
import type { Notebook, NotebookArtwork } from '../src/types';
import { ACTIVITY_EXAMPLES, EXAMPLE_ACTIVITY_SOURCE } from '../src/lib/structuredEngine';

function fixture() {
  const source = createSource('Retrieval: bringing an idea back from memory without looking at the answer.\nSpacing: revisiting material across separate sessions instead of one long block.\nFeedback: information that helps a learner identify and correct a misunderstanding.\n1. Read the source carefully.\n2. Close your notes and retrieve the idea.\n3. Compare your answer with the source.\n4. Plan a later review.\n\nMeaningful practice helps people connect new information with their existing knowledge.', 'Learning principles');
  const compiled = compileNotebook([source]);
  return createNotebook({ id: 'notebook-test', title: 'Learning principles', sources: [source], cards: compiled.cards });
}

describe('deterministic source compiler', () => {
  it('creates definition, cloze and procedure challenges with verbatim evidence and stable IDs', () => {
    const notebook = fixture();
    expect(notebook.cards.length).toBeGreaterThan(4);
    expect(new Set(notebook.cards.map(card => card.questionType))).toEqual(new Set(['definition', 'sequence', 'cloze']));
    for (const card of notebook.cards) {
      expect(notebook.sources[0].text).toContain(card.evidence);
      expect(card.evidence.toLowerCase()).toContain(card.answer.toLowerCase());
      expect(card.options[card.correctIndex]).toBe(card.answer);
      expect(new Set(card.options).size).toBe(card.options.length);
    }
    expect(compileNotebook(notebook.sources).cards).toEqual(notebook.cards);
    const definitionCards = notebook.cards.filter(card => card.questionType === 'definition');
    const sourceTerms = new Set(definitionCards.map(card => card.answer));
    expect(definitionCards.every(card => card.options.every(option => sourceTerms.has(option)))).toBe(true);
    expect(() => validateNotebook(notebook)).not.toThrow();
  });
  it('does not fabricate questions from unavailable media or tiny fragments', () => {
    const source = createSource('', 'Audio lecture', 'audio');
    expect(compileNotebook([source]).cards).toEqual([]);
    expect(compileNotebook([source]).warnings.join(' ')).toContain('transcript');
    expect(compileNotebook([createSource('Maybe someday')]).cards).toEqual([]);
  });
  it('balances a limited pass across several source files', () => {
    const first = createSource('Alpha: the first entry in this author-provided reference.\nBeta: the second entry in this author-provided reference.');
    const second = createSource('Gamma: a different entry from the second author-provided source.');
    const result = compileNotebook([first, second], { maxCards: 2 });
    expect(result.cards.map(card => card.sourceId)).toEqual([first.id, second.id]);
  });
  it('retrieves source passages locally and strips subtitle timestamps', () => {
    const notebook = fixture();
    expect(searchSources(notebook.sources, 'spacing sessions')[0].snippet).toContain('Spacing');
    expect(searchSources(notebook.sources, 'the and of')).toEqual([]);
    expect(transcriptToText('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nHello world\nHello world\n\n2\n00:00:03.000 --> 00:00:05.000\nNext idea')).toBe('Hello world\nNext idea');
  });
  it('supports manually authored questions without inventing source attribution', () => {
    const card = createManualCard({ prompt: 'What did the instructor demonstrate?', answer: 'A feedback loop', options: ['A one-way signal'], explanation: 'Discuss with your instructor.' });
    expect(card.sourceId).toBe(''); expect(card.reviewStatus).toBe('needs-review');
    expect(() => validateNotebook(createNotebook({ cards: [card] }))).not.toThrow();
  });
});

describe('portable learning packages', () => {
  it('roundtrips a structured-only notebook with checked source provenance', () => {
    const source = { ...createSource(EXAMPLE_ACTIVITY_SOURCE.text, EXAMPLE_ACTIVITY_SOURCE.title), id: EXAMPLE_ACTIVITY_SOURCE.id };
    const notebook = createNotebook({ cards: [], sources: [source], activities: ACTIVITY_EXAMPLES });
    const result = parsePackage(serializePackage(notebook));
    expect(result.cards).toEqual([]); expect(result.activities).toEqual(ACTIVITY_EXAMPLES);
    const invalid = { ...notebook, sources: [{ ...source, text: 'This text does not support those activities.' }] };
    expect(() => serializePackage(invalid)).toThrow('evidence must occur exactly');
    expect(() => validateNotebook({ ...notebook, activities: [{ ...ACTIVITY_EXAMPLES[0], apiKey: 'secret' }] })).toThrow('unknown field');
    expect(() => validateNotebook({ ...notebook, activities: [ACTIVITY_EXAMPLES[0], ACTIVITY_EXAMPLES[0]] })).toThrow('duplicate');
  });
  it('roundtrips learning content while excluding credential and runtime fields', () => {
    const notebook = fixture();
    const polluted = { ...notebook, apiKey: 'sk-never-export', settings: { authorization: 'secret' }, sources: notebook.sources.map(source => ({ ...source, apiKey: 'also-secret' })) };
    const serialized = serializePackage(polluted);
    expect(serialized).not.toContain('sk-never-export'); expect(serialized).not.toContain('also-secret'); expect(serialized).not.toContain('authorization');
    expect(parsePackage(serialized)).toEqual(notebook);
  });
  it('rejects unknown schemas, duplicate IDs, invalid references, unsafe links, and changed evidence', () => {
    const notebook = fixture();
    expect(() => parsePackage('{"format":"learnpack","version":99}')).toThrow('supported');
    expect(() => validateNotebook({ ...notebook, cards: [...notebook.cards, notebook.cards[0]] })).toThrow('duplicate');
    expect(() => validateNotebook({ ...notebook, cards: [{ ...notebook.cards[0], sourceId: 'missing' }] })).toThrow('missing source');
    expect(() => validateNotebook({ ...notebook, sources: [{ ...notebook.sources[0], url: 'javascript:alert(1)' }] })).toThrow('HTTP(S)');
    expect(() => validateNotebook({ ...notebook, cards: [{ ...notebook.cards[0], evidence: 'Fabricated evidence.' }] })).toThrow('absent');
    expect(() => validateNotebook({ ...notebook, sources: [{ ...notebook.sources[0], dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }] })).toThrow('executable');
  });
  it('rejects answer-index disagreement instead of exporting invalid grading', () => {
    const notebook = fixture();
    expect(() => validateNotebook({ ...notebook, cards: [{ ...notebook.cards[0], correctIndex: (notebook.cards[0].correctIndex + 1) % notebook.cards[0].options.length }] })).toThrow('disagree');
  });
  it('embeds escaped notebook data before the app in a full runtime', () => {
    const notebook = fixture(); notebook.description = '</script><script>evil()</script>\u2028';
    const output = exportOfflineHtml(notebook, '<!doctype html><html><head><script id="asterloom-notebook">OLD</script><script type="module">app()</script></head><body><div id="root"></div></body></html>');
    expect(output).not.toContain('>OLD<'); expect(output).not.toContain('</script><script>evil');
    expect(output).toContain('\\u003c/script>'); expect(output).toContain('\\u2028');
    expect(output.indexOf('__ASTERLOOM_NOTEBOOK__')).toBeLessThan(output.indexOf('app()'));
  });
  it('preserves JavaScript replacement markers inside user material literally', () => {
    const notebook = fixture(); notebook.description = ['$&', '$$', "$'", '$' + String.fromCharCode(96)].join(' ');
    const output = exportOfflineHtml(notebook, '<!doctype html><html><head><script type="module">app()</script></head><body><div id="root"></div></body></html>');
    const embedded = output.match(/window\.__ASTERLOOM_NOTEBOOK__=([\s\S]*?);window\.__ASTERLOOM_EXPORT__/);
    expect(JSON.parse(embedded![1]).description).toBe(notebook.description);
    expect(output.match(/<head>/g)).toHaveLength(1);
  });
});

describe('source-bound presentation artwork', () => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT5sAAAAASUVORK5CYII=';
  function artwork(notebook: Notebook): NotebookArtwork {
    return { id: 'art-one', title: 'A memory garden', dataUrl: pixel, sourceId: notebook.sources[0].id, evidence: notebook.sources[0].text.split('\n')[0], purpose: 'decorative', reviewStatus: 'draft', createdAt: '2026-10-03T00:00:00.000Z' };
  }
  it('preserves art and review state through portable export and remix without turning art into evidence', () => {
    const notebook = fixture(); notebook.artwork = [artwork(notebook)];
    const imported = parsePackage(serializePackage({ ...notebook, artwork: [{ ...notebook.artwork[0], apiKey: 'never-export' } as NotebookArtwork] }));
    expect(imported.artwork).toEqual(notebook.artwork); expect(serializePackage(imported)).not.toContain('never-export');
    const remix = createNotebook({ ...imported, id: 'new-owner-remix', title: 'My remix' });
    expect(parsePackage(serializePackage(remix)).artwork).toEqual(notebook.artwork);
    expect(compileNotebook(imported.sources).cards).toEqual(notebook.cards);
    const html = exportOfflineHtml(remix, '<html><head><script>app()</script></head><body><div id="root"></div></body></html>');
    const embedded = JSON.parse(html.match(/window\.__ASTERLOOM_NOTEBOOK__=([\s\S]*?);window\.__ASTERLOOM_EXPORT__/)![1]);
    expect(embedded.artwork).toEqual(notebook.artwork);
  });
  it('rejects broken provenance, duplicate art, executable formats, malformed data and invalid review states', () => {
    const notebook = fixture(); const asset = artwork(notebook);
    const check = (change: Record<string, unknown>) => () => validateNotebook({ ...notebook, artwork: [{ ...asset, ...change }] });
    expect(check({ sourceId: 'missing-source' })).toThrow('missing source');
    expect(check({ evidence: 'Unsupported generated claim.' })).toThrow('absent');
    expect(check({ evidence: '' })).toThrow('missing');
    expect(check({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toThrow('executable');
    expect(check({ dataUrl: 'https://example.com/tracking.png' })).toThrow('embedded');
    expect(check({ dataUrl: 'data:image/png;base64,AAAAA' })).toThrow('base64');
    expect(check({ reviewStatus: 'automatically-approved' })).toThrow('review status');
    expect(() => validateNotebook({ ...notebook, artwork: [asset, asset] })).toThrow('duplicate');
    expect(() => validateNotebook({ ...notebook, artwork: Array.from({ length: 21 }, (_, index) => ({ ...asset, id: `art-${index}` })) })).toThrow('at most 20');
  });
  it('enforces one combined embedded-media budget for sources and generated artwork', () => {
    const notebook = fixture(); const asset = artwork(notebook);
    const encoded = 'A'.repeat(Math.ceil(16 * 1024 * 1024 / 3) * 4);
    const large = { ...asset, dataUrl: `data:image/png;base64,${encoded}` };
    // Each image is under 20 MB, but these three assets jointly exceed 48 MB.
    const source = { ...notebook.sources[0], dataUrl: `data:audio/mpeg;base64,${encoded}`, mime: 'audio/mpeg' };
    expect(() => validateNotebook({ ...notebook, sources: [source], artwork: [large, { ...large, id: 'art-two' }] })).toThrow('48 MB');
    expect(() => validateNotebook({ ...notebook, artwork: [{ ...asset, dataUrl: `data:image/png;base64,${'A'.repeat(28 * 1024 * 1024)}` }] })).toThrow('size limit');
  });
});

describe('durable practice state and review scheduling', () => {
  it('schedules spaced reviews and prevents immediate-repeat XP farming', () => {
    const notebook = fixture(); const card = notebook.cards[0];
    const first = recordAttempt(emptyProgress(notebook.id), card, true, 'confident', new Date('2026-10-01T12:00:00Z'));
    expect(first.xp).toBe(20); expect(first.cards[card.id].dueAt).toBe('2026-10-02T12:00:00.000Z');
    const repeat = recordAttempt(first, card, true, 'confident', new Date('2026-10-01T12:01:00Z'));
    expect(repeat.xp).toBe(first.xp); expect(repeat.cards[card.id].successfulReviews).toBe(1);
    const later = recordAttempt(repeat, card, true, 'confident', new Date('2026-10-02T12:00:00Z'));
    expect(later.xp).toBe(40); expect(later.cards[card.id].intervalDays).toBe(3);
    const miss = recordAttempt(later, card, false, 'unsure', new Date('2026-10-05T12:00:00Z'));
    expect(miss.cards[card.id].dueAt).toBe('2026-10-05T12:10:00.000Z'); expect(miss.streak).toBe(0);
    expect(selectDueCards(notebook.cards, miss, 1, new Date('2026-10-05T12:11:00Z'))[0].id).toBe(card.id);
  });
  it('roundtrips journal and unfinished puzzle state without credentials', () => {
    const notebook = fixture(); const progress = emptyProgress(notebook.id);
    progress.activeSession = { scaffoldId: 'process-reconstruction', cardIds: notebook.cards.map(card => card.id), index: 1, seed: 45, startedAt: '2026-10-01T12:00:00Z', state: { order: ['3','1','2'], apiKey: 'secret' } };
    const backup = serializeProgress(progress); const parsed = parseProgress(backup);
    expect(parsed.activeSession?.state?.order).toEqual(['3','1','2']); expect(backup).not.toContain('secret');
    expect(parsed.activeSession?.index).toBe(1);
  });
  it('detects source edits deterministically', () => {
    const notebook = fixture(); const fingerprint = sourceFingerprint(notebook);
    expect(sourceFingerprint({ sources: notebook.sources.map(source => ({ ...source, text: source.text + '\nA new statement.' })) })).not.toBe(fingerprint);
  });
  it('preserves bounded structured activity responses and rejects unsafe progress data', () => {
    const progress = emptyProgress('notebook-structured');
    const result = { response: { quantities: { small: 2, large: 1 } }, completed: true, score: 2, maxScore: 2, attempts: 1, updatedAt: '2026-10-03T12:00:00.000Z' };
    progress.structured = { 'example-budget': result };
    expect(parseProgress(serializeProgress(progress)).structured).toEqual(progress.structured);
    const withResponse = (response: unknown) => ({ ...progress, structured: { 'example-budget': { ...result, response } } });
    expect(() => serializeProgress(withResponse(JSON.parse('{"__proto__":{"polluted":true}}')))).toThrow('unsafe object key');
    expect(() => serializeProgress(withResponse({ values: Array(501).fill(1) }))).toThrow('complexity');
    expect(() => serializeProgress(withResponse({ text: 'a'.repeat(10_241) }))).toThrow('size limit');
    expect(() => serializeProgress(withResponse({ text: 'é'.repeat(6000) }))).toThrow('10 KB');
    expect(() => serializeProgress(withResponse({ value: Infinity }))).toThrow('JSON data');
    expect(() => serializeProgress({ ...progress, structured: { 'example-budget': { ...result, score: 3 } } })).toThrow('maximum');
  });
});

describe('optional AI refinement validates model output', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('supports offline assistant drafts while protecting answer keys, choices, evidence and tags', () => {
    const notebook = fixture(); const selected = notebook.cards.slice(0, 12);
    const prompt = createRefinementPrompt({ ...notebook, apiKey: 'never-send-this' } as Notebook);
    expect(prompt).toContain('REFERENCE DATA'); expect(prompt).not.toContain('never-send-this');
    const accepted = applyRefinementResponse(notebook, JSON.stringify({ cards: selected.map(card => ({ ...card, prompt: 'Which term fits the quoted definition?' })) }));
    expect(accepted.cards[0].reviewStatus).toBe('needs-review'); expect(accepted.usage).toBeNull();
    const forged = selected.map((card, index) => index ? card : { ...card, answer: card.options.find(option => option !== card.answer), correctIndex: card.options.findIndex(option => option !== card.answer), questionType: 'manual' });
    expect(() => applyRefinementResponse(notebook, JSON.stringify({ cards: forged }))).toThrow('protected content');
    expect(() => applyRefinementResponse(notebook, JSON.stringify({ cards: selected.map((card, index) => index ? card : { ...card, tags: ['injected'] }) }))).toThrow('tags');
    expect(() => applyRefinementResponse(notebook, 'a'.repeat(500_001))).toThrow('too large');
    expect(() => applyRefinementResponse(notebook, 'not JSON')).toThrow('valid challenge JSON');
  });
  it('accepts wording refinement but rejects rewritten answer keys', async () => {
    const notebook = fixture();
    const selected = notebook.cards.slice(0, 12);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: JSON.stringify({ cards: selected.map(card => ({ ...card, explanation: 'Review the quoted evidence.' })) }) }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const output = await refineCards(notebook, { provider: 'compatible', apiKey: '', model: 'local' });
    expect(output.cards[0].reviewStatus).toBe('needs-review');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: JSON.stringify({ cards: selected.map((card, at) => at ? card : { ...card, evidence: 'An invented quotation.' }) }) }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(refineCards(notebook, { provider: 'compatible', apiKey: '', model: 'local' })).rejects.toThrow('absent');
  });
});
