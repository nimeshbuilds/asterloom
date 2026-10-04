import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createNotebook, createSource } from '../src/lib/utils';
import { segmentSource, sourceConcepts, sourceLearningUnits, sourceSentences } from '../src/lib/sourceUnits';
import { compileNotebook } from '../src/lib/compiler';
import { evidenceBlocks, validateLearningObjectives } from '../src/lib/evidence';
import { proposeObjectives } from '../src/lib/objectives';
import { migrateAutomaticLearning, prepareAutomaticLearning } from '../src/lib/automaticLearning';
import { parsePackage, serializePackage } from '../src/lib/package';

describe('source structure and complete study units', () => {
  it('keeps heading sections, explanations, decimal values and examples together with exact source offsets', () => {
    const source = createSource('# Heat\n\nThermal energy is the internal energy associated with particle motion. This account uses a 3.5 J example because the quantity is measured in joules.\n\nFor example, thermal energy can move between the two bodies described here.\n\n# Networks\n\nPacket: a bounded unit of information sent through the network.\nFrame: a bounded unit carried over one local link.', 'Two subjects');
    const units = sourceLearningUnits(source);
    expect(units.map(u => u.title)).toEqual(['Heat', 'Networks']);
    expect(units[0].quote).toContain('because'); expect(units[0].quote).toContain('For example');
    expect(units[0].quote).not.toContain('Packet');
    for (const unit of units) { expect(unit.quote).toBe(source.text.slice(unit.start, unit.end)); for (const p of unit.passages) expect(p.quote).toBe(source.text.slice(p.start, p.end)); }
    expect(sourceSentences('Dr. Lee measured 3.5 J. The amount was recorded.').map(s => s.quote)).toEqual(['Dr. Lee measured 3.5 J.', 'The amount was recorded.']);
  });
  it('never drops body text or splits surrogate pairs while respecting bounded sentence-aware passages', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('alpha 🌳', 'water', 'energy', 'café', '世界'), { minLength: 1, maxLength: 250 }), parts => {
      const text = parts.join(' ') + '.\n\nThis is the final observation.';
      const segments = segmentSource(text, 120);
      expect(segments.map(s => s.quote).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
      for (const segment of segments) { expect(segment.quote).toBe(text.slice(segment.start, segment.end)); expect(segment.quote.length).toBeLessThanOrEqual(120); expect(segment.quote).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/); }
    }), { numRuns: 100 });
  });
  it('keeps repeated identical units distinct by location and retains every late section beyond the recall budget', () => {
    const paragraph = 'An observation remains available for careful source study. '.repeat(35);
    const source = createSource(paragraph + '\n\n' + paragraph);
    const units = sourceLearningUnits(source);
    expect(units.length).toBeGreaterThan(1); expect(new Set(units.map(u => u.id)).size).toBe(units.length);
    const long = createSource(Array.from({ length: 140 }, (_, i) => `# Section ${i}\n\nThis source observation is numbered ${i} and remains available for reflection.`).join('\n\n'));
    expect(sourceLearningUnits(long)).toHaveLength(140); expect(sourceLearningUnits(long).at(-1)!.title).toBe('Section 139');
  });
  it('excludes subtitle controls and keeps cue and page evidence separate without changing words', () => {
    const source = createSource('WEBVTT\n\nNOTE Never treat this control record as knowledge.\n\ncue-1\n00:00:01.000 --> 00:00:02.000\nFirst spoken observation.\n\n00:00:03.000 --> 00:00:04.000\nSecond spoken observation.');
    expect(evidenceBlocks(source).map(b => b.quote)).toEqual(['First spoken observation.', 'Second spoken observation.']);
    const pages = createSource('[Page 1]\nFirst page.\n[Page 2]\nSecond page.');
    expect(sourceLearningUnits(pages)).toHaveLength(2); expect(evidenceBlocks(pages).map(b => b.locator.kind)).toEqual(['page', 'page']);
  });
});

describe('concept selection without arbitrary quizzes', () => {
  it('does not blank the longest word or manufacture distractors from ordinary prose', () => {
    const source = createSource('Photosynthesis involves several interdependent processes, and this introductory paragraph asks readers to consider the complete explanation.');
    expect(compileNotebook([source]).cards).toEqual([]);
    const result = prepareAutomaticLearning(createNotebook({ sources: [source] })).notebook;
    expect(result.learningObjectives?.[0].operation).toBe('explanation');
    expect(proposeObjectives(evidenceBlocks(source))[0].supportedMechanics).toContain('Evidence field note');
    expect(sourceLearningUnits(source)[0].quote).toBe(source.text);
    expect(() => validateLearningObjectives(result.learningObjectives, result.sources)).not.toThrow();
  });
  it('uses whole explicitly defined concepts and preserves their explanatory context', () => {
    const source = createSource('# Networks\n\nPacket switching is a method that divides a message into separately routed units. It is useful in this model because each unit can take an available route.\n\nCircuit switching is a method that reserves a continuous route for the communication.\n\nPacket switching lets the example message use several available routes through the model.');
    const cards = compileNotebook([source]).cards;
    expect(sourceConcepts(source.text).map(c => c.term)).toEqual(['Packet switching', 'Circuit switching']);
    const definition = cards.find(c => c.answer === 'Packet switching' && c.questionType === 'definition')!;
    expect(definition).toBeDefined(); expect(definition.evidence).toContain('because each unit');
    const cloze = cards.find(c => c.questionType === 'cloze')!;
    expect(cloze.answer).toBe('Packet switching'); expect([...cloze.options].sort()).toEqual(['Circuit switching', 'Packet switching']);
    expect(cloze.prompt).not.toContain('Packet switching');
    expect(() => parsePackage(serializePackage(createNotebook({ sources: [source], cards })))).not.toThrow();
  });
  it('reads numbered glossary labels without including list markers in concepts or changing citation offsets', () => {
    const text = '# Plant glossary\r\n\r\n  1. Seed: the plant structure containing an embryo that can grow into a new plant.\r\n\t2) Root: the plant organ that absorbs water and dissolved minerals.\r\n3. **Leaf**: the plant organ that captures light in this source model.';
    const concepts = sourceConcepts(text);
    expect(concepts.map(concept => concept.term)).toEqual(['Seed', 'Root', 'Leaf']);
    expect(concepts.map(concept => concept.start)).toEqual(['Seed:', 'Root:', '**Leaf**:'].map(label => text.indexOf(label)));
    for (const concept of concepts) {
      expect(concept.quote).toBe(text.slice(concept.start, concept.end));
      expect(concept.quote).not.toMatch(/^\d+[.)]/);
      expect(concept.form).toBe('label');
    }
    const source = createSource(text, 'Numbered plant glossary');
    const prepared = prepareAutomaticLearning(createNotebook({ sources: [source] })).notebook;
    expect(new Set(prepared.cards.map(card => card.answer))).toEqual(new Set(['Seed', 'Root', 'Leaf']));
    expect(prepared.cards.every(card => ['definition', 'cloze'].includes(card.questionType) && source.text.includes(card.evidence))).toBe(true);
    expect(prepared.activities?.some(activity => activity.kind === 'sequence')).toBe(false);
    expect(parsePackage(serializePackage(prepared))).toEqual(prepared);
  });
  it('never borrows unrelated-section vocabulary or asks indistinguishable definitions', () => {
    const source = createSource('# Networks\nPacket: a bounded unit of information sent through a network.\nRouter: a device that forwards units between networks.\n\n# Plants\nRoot: the part that anchors a plant and absorbs water.\nLeaf: the part that captures light for the plant.');
    const result = compileNotebook([source], { maxCards: 2 });
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].options.every(v => ['Packet', 'Router'].includes(v))).toBe(true);
    expect(result.cards[1].options.every(v => ['Root', 'Leaf'].includes(v))).toBe(true);
    const ambiguous = createSource('Term A: an identical description supplied in the glossary.\nTerm B: an identical description supplied in the glossary.');
    expect(compileNotebook([ambiguous]).cards).toEqual([]);
    expect(compileNotebook([createSource('Only concept: one explicitly described concept without a related alternative.')]).cards).toEqual([]);
  });
  it('distinguishes numbered reference lists from source-signalled procedures', () => {
    const list = '1. An oak is one listed tree.\n2. A pine is another listed tree.\n3. A birch is a third listed tree.';
    expect(compileNotebook([createSource(list)]).cards).toEqual([]);
    expect(prepareAutomaticLearning(createNotebook({ sources: [createSource(list)] })).notebook.activities).toEqual([]);
    const procedure = createSource('Procedure:\n1. Inspect the current observation.\n2. Compare it with the supplied rule.\n3. Record the supported conclusion.');
    expect(compileNotebook([procedure]).cards.every(c => c.questionType === 'sequence')).toBe(true);
    expect(compileNotebook([procedure]).cards).toHaveLength(2);
    expect(prepareAutomaticLearning(createNotebook({ sources: [procedure] })).notebook.activities?.[0].kind).toBe('sequence');
  });
  it('does not turn incidental process words or descriptive subject phrases into answer keys', () => {
    const source = createSource('# Requirements\n\nMatching a recipe name does not establish its learning contract.\n\nBefore a recipe becomes playable, the model must satisfy its contract:\n1. A classification task needs a stated membership rule.\n2. A process task needs reviewed dependencies.\n3. A diagram task needs accurate connections.\n\n# Presentation\n\nThe five bands below are editable defaults. Session durations are practical starting points. Some general recipes are also available to younger groups.');
    const result = prepareAutomaticLearning(createNotebook({ sources: [source] })).notebook;
    expect(result.cards).toEqual([]); expect(result.activities).toEqual([]);
    const code=createSource('```text\nWarm > Red\nCool > Blue\n```');
    expect(prepareAutomaticLearning(createNotebook({sources:[code]})).notebook.activities).toEqual([]);
    expect(sourceLearningUnits(source).every(unit => unit.kind !== 'procedure')).toBe(true);
  });
  it('keeps unrelated explicit classification systems in separate source-unit models', () => {
    const source = createSource('# Colors\nWarm > Red\nCool > Blue\n\n# Networks\nRequest > GET\nResponse > 200');
    const result = prepareAutomaticLearning(createNotebook({ sources: [source] })).notebook;
    expect(result.activities).toHaveLength(2);
    const models = result.activities!.filter(activity => activity.kind === 'classification');
    expect(models.map(model => model.categories.map(c => c.label))).toEqual([['Warm', 'Cool'], ['Request', 'Response']]);
    expect(models.every(model => model.sourceRefs.every(ref => source.text.includes(ref.evidence)))).toBe(true);
    expect(parsePackage(serializePackage(result))).toEqual(result);
  });
  it('replaces untouched generated drafts after source changes but preserves actual author edits and reviewed work', () => {
    const source = createSource('Alpha: the first documented concept in this model.\nBeta: the second documented concept in this model.\nGamma: the third documented concept in this model.');
    const initial = prepareAutomaticLearning(createNotebook({ sources: [source] })).notebook;
    const edited = { ...initial.cards[0], prompt: 'A carefully authored alternative prompt.', reviewStatus: 'needs-review' as const };
    const old = { ...initial.cards[1], reviewStatus: 'needs-review' as const };
    const next = prepareAutomaticLearning({ ...initial, cards: [edited, old], sources: [{ ...source, text: source.text.replace('second documented', 'revised documented') }] }).notebook;
    expect(next.cards.some(c => c.id === edited.id && c.prompt === edited.prompt)).toBe(true);
    expect(next.cards.some(c => c.id === old.id)).toBe(false);
    expect(prepareAutomaticLearning(next).notebook).toEqual(next);
  });
  it('upgrades only provable legacy compiler work once, preserving edited, reviewed and manual content', () => {
    const source = createSource('The historical explanation used an extraordinarilylongword without identifying a source concept.\n\nAlpha: the first named idea in the supplied model.\nBeta: the second named idea in the supplied model.');
    const evidence = source.text.split('\n\n')[0];
    const legacy = { id: 'old-long-word', prompt: 'Recall the exact missing word from “Historical notes”.\n\n' + evidence.replace('extraordinarilylongword', '________'), answer: 'extraordinarilylongword', options: ['extraordinarilylongword', 'historical'], correctIndex: 0, explanation: `The source states: “${evidence}”`, sourceId: source.id, evidence, concept: 'extraordinarilylongword', tags: ['source-recall', 'cloze'], questionType: 'cloze' as const, reviewStatus: 'extractive' as const };
    const edited = { ...legacy, id: 'edited-legacy', prompt: 'A saved author question with purposeful wording.', reviewStatus: 'needs-review' as const };
    const reviewed = { ...legacy, id: 'reviewed-legacy', reviewStatus: 'reviewed' as const };
    const original = createNotebook({ sources: [source], cards: [legacy, edited, reviewed] });
    const migrated = migrateAutomaticLearning(original);
    expect(migrated.changed).toBe(true); expect(migrated.notebook.generationVersion).toBe(2);
    expect(migrated.notebook.cards.some(c => c.id === legacy.id)).toBe(false);
    expect(migrated.notebook.cards.find(c => c.id === edited.id)?.prompt).toBe(edited.prompt);
    expect(migrated.notebook.cards.find(c => c.id === reviewed.id)).toEqual(reviewed);
    expect(migrated.notebook.sources).toEqual(original.sources);
    expect(migrateAutomaticLearning(migrated.notebook)).toMatchObject({ changed: false, notebook: migrated.notebook });
    expect(parsePackage(serializePackage(migrated.notebook))).toEqual(migrated.notebook);
    const authoredOnly = { ...original, cards: [edited, reviewed] };
    expect(migrateAutomaticLearning(authoredOnly)).toEqual({ notebook: authoredOnly, changed: false, warnings: [] });
  });
});
