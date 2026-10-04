import { describe, expect, it } from 'vitest';
import { prepareAutomaticLearning } from '../src/lib/automaticLearning';
import { compileNotebook, createManualCard } from '../src/lib/compiler';
import { extractStructuredActivities, validateActivity, ACTIVITY_EXAMPLES, EXAMPLE_ACTIVITY_SOURCE } from '../src/lib/structuredEngine';
import { createNotebook, createSource } from '../src/lib/utils';
import { applyRefinementResponse } from '../src/lib/provider';
import { parsePackage, serializePackage } from '../src/lib/package';

function definitions(prefix: string, count = 20) {
  return createSource(Array.from({ length: count }, (_, i) => `${prefix}${i}: A supplied description for unique reference entry ${prefix}${i}.`).join('\n'), `${prefix} source`);
}

describe('automatic preparation from the readable collection', () => {
  it('preserves optional assistant drafts through automatic imports without approving or duplicating them',()=>{
    const initial=prepareAutomaticLearning(createNotebook({sources:[definitions('Refined',3)]})).notebook;
    const response={cards:initial.cards.map(card=>({...card,prompt:'Explain this source term: '+card.prompt,explanation:'Clearer draft wording: '+card.explanation}))};
    const refined={...initial,cards:applyRefinementResponse(initial,JSON.stringify(response)).cards};
    expect(refined.cards.every(card=>card.tags.includes('ai-refined'))).toBe(true);
    const next=prepareAutomaticLearning({...refined,sources:[...refined.sources,definitions('Unrelated',3)]}).notebook;
    for(const card of refined.cards){expect(next.cards.filter(c=>c.id===card.id)).toEqual([card]);expect(card.reviewStatus).toBe('needs-review');}
    expect(parsePackage(serializePackage(next))).toEqual(next);
  });
  it('recognizes untagged legacy wording edits while still replacing untouched stale extraction',()=>{
    const source=definitions('Legacy',3),initial=prepareAutomaticLearning(createNotebook({sources:[source]})).notebook;
    const changed={...initial.cards[0],reviewStatus:'needs-review' as const,prompt:'A saved, creator-refined question.',explanation:'A saved explanation awaiting human review.'};
    const untouched={...initial.cards[1],reviewStatus:'needs-review' as const};
    const next=prepareAutomaticLearning({...initial,cards:[changed,untouched],sources:[source,definitions('Added',2)]}).notebook;
    expect(next.cards.find(c=>c.id===changed.id)).toMatchObject({...changed,tags:[...changed.tags,'author-edited']});expect(next.cards.find(c=>c.id===untouched.id)?.reviewStatus).toBe('extractive');
    const editedSource={...source,text:source.text.replace(untouched.evidence,'The source no longer contains that statement.')};
    const later=prepareAutomaticLearning({...next,sources:[editedSource,...next.sources.slice(1)]}).notebook;
    expect(later.cards.some(c=>c.id===changed.id)).toBe(true);expect(later.cards.some(c=>c.id===untouched.id)).toBe(false);
  });
  it('retains edits to extracted structured models under their original IDs and removes replaceable provenance',()=>{
    const source=createSource('Warm > Red\nCool > Blue\nWarm > Orange','Categories');const first=prepareAutomaticLearning(createNotebook({sources:[source]})).notebook;
    const generated=first.activities![0],modified={...generated,hint:'My carefully edited source hint.',instruction:'An edited instruction for this audience.'};
    const next=prepareAutomaticLearning({...first,activities:[modified],sources:[source,definitions('More',2)]}).notebook;
    const {extractedFrom:_origin,...expected}=modified;expect(next.activities!.filter(a=>a.id===modified.id)).toEqual([expected]);
    const later=prepareAutomaticLearning({...next,sources:[{...source,text:source.text+'\nCool > Green'},...next.sources.slice(1)]}).notebook;
    expect(later.activities!.find(a=>a.id===modified.id)).toEqual(expected);expect(later.activities!.some(a=>a.id!==modified.id&&a.extractedFrom===source.id)).toBe(true);
  });

  it('samples early and late material within each source after allocating the actual card budget', () => {
    const sources = [definitions('Alpha'), definitions('Beta')];
    const result = compileNotebook(sources, { maxCards: 4 });
    expect(result.cards.map(c => c.answer)).toEqual(['Alpha0', 'Beta0', 'Alpha19', 'Beta19']);
    for (const card of result.cards) expect(sources.find(s => s.id === card.sourceId)?.text).toContain(card.evidence);
    expect(compileNotebook(sources, { maxCards: 4 })).toEqual(result);
  });
  it('includes the end of a long source and spreads a smaller budget across a larger source collection', () => {
    const long = definitions('Chapter', 500);
    const result = compileNotebook([long], { maxCards: 3 });
    expect(result.cards.map(c => c.answer)).toEqual(['Chapter0', 'Chapter249', 'Chapter499']);
    const sources = Array.from({ length: 9 }, (_, i) => definitions(`Document${i}Term`, 2));
    expect(compileNotebook(sources, { maxCards: 3 }).cards.map(c => c.sourceId)).toEqual([sources[0].id, sources[4].id, sources[8].id]);
  });
  it('extracts explicit models beyond the former fifty-source cutoff and warns at the model limit', () => {
    const sources = Array.from({ length: 55 }, (_, i) => createSource(`1. Inspect the provided observation ${i}.\n2. Compare it with the supplied rule ${i}.\n3. Record the supported conclusion ${i}.`, `Procedure ${i}`));
    const result = extractStructuredActivities(sources);
    expect(new Set(result.activities.map(a => a.extractedFrom))).toEqual(new Set(sources.map(s => s.id)));
    expect(result.activities).toHaveLength(55);
    for (const activity of result.activities) expect(validateActivity(activity, sources).success).toBe(true);
    const bounded = extractStructuredActivities(Array.from({ length: 155 }, (_, i) => ({ ...sources[i % sources.length], id: `procedure-${i}` })));
    expect(bounded.activities).toHaveLength(150);
    expect(bounded.warnings.join(' ')).toMatch(/150/);
  });
  it('rebuilds stale extracted drafts while preserving authored or reviewed work and all original materials', () => {
    const old = createSource('Warm > Red\nCool > Blue\nWarm > Orange', 'Categories');
    const previous = extractStructuredActivities([old]).activities[0];
    const reviewed = { ...previous, id: 'reviewed-model', reviewStatus: 'reviewed' as const };
    const source = { ...old, text: old.text + '\nCool > Green' };
    const reference = { ...createSource(EXAMPLE_ACTIVITY_SOURCE.text, EXAMPLE_ACTIVITY_SOURCE.title), id: EXAMPLE_ACTIVITY_SOURCE.id };
    const authored = ACTIVITY_EXAMPLES[0];
    const definitionSource = definitions('Retained');
    const compiled = compileNotebook([definitionSource]).cards;
    const manual = createManualCard({ prompt: 'Explain the supplied model.', answer: 'The supplied rule', options: ['An unrelated guess'], explanation: 'Review the provided model.' });
    const reviewedCard = { ...compiled[0], reviewStatus: 'reviewed' as const, explanation: 'Author-reviewed feedback.' };
    const staleCard = { ...compiled[1], id: 'old-extractive-card', evidence: 'A previously extracted statement.' };
    const notebook = createNotebook({ sources: [source, definitionSource, reference], cards: [manual, reviewedCard, staleCard], activities: [previous, reviewed, authored] });
    const snapshot = structuredClone(notebook);
    const result = prepareAutomaticLearning(notebook);
    expect(notebook).toEqual(snapshot);
    expect(result.notebook.sources).toEqual(notebook.sources);
    expect(result.notebook.cards.find(c => c.id === manual.id)).toEqual(manual);
    expect(result.notebook.cards.find(c => c.id === reviewedCard.id)).toEqual(reviewedCard);
    expect(result.notebook.cards.some(c => c.id === staleCard.id)).toBe(false);
    expect(result.notebook.activities?.find(a => a.id === reviewed.id)).toEqual(reviewed);
    expect(result.notebook.activities?.find(a => a.id === authored.id)).toEqual(authored);
    expect(result.notebook.activities?.some(a => a.id === previous.id)).toBe(false);
    expect(result.notebook.activities?.some(a => a.extractedFrom === source.id && a.reviewStatus === 'needs-review')).toBe(true);
    expect(prepareAutomaticLearning(result.notebook).notebook).toEqual(result.notebook);
    expect(parsePackage(serializePackage(result.notebook))).toEqual(result.notebook);
  });
  it('keeps unavailable content and unapproved media from silently becoming scored activities', () => {
    const audio = definitions('Audio'); audio.kind = 'audio';
    const pending = { ...definitions('Pending'), status: 'needs-transcript' as const };
    const source = createSource('If the indicator is red then stop the simulation.', 'Conditional');
    const notebook = createNotebook({ sources: [audio, pending, source] });
    const result = prepareAutomaticLearning(notebook).notebook;
    expect(result.sources).toEqual(notebook.sources);
    expect(result.cards.some(c => c.sourceId === pending.id)).toBe(false);
    expect(result.cards.filter(c => c.sourceId === audio.id).length).toBeGreaterThan(0);
    expect(result.cards.filter(c => c.sourceId === audio.id).every(c => c.reviewStatus === 'needs-review')).toBe(true);
    expect(result.activities?.every(a => a.reviewStatus === 'needs-review')).toBe(true);
    expect(result.activities?.filter(a => a.kind === 'decision').length).toBeGreaterThan(0);
    expect(result.activities?.filter(a => a.kind === 'decision').every(a => !a.scaffoldIds?.includes('branching-decisions'))).toBe(true);
    expect(result.scaffoldIds).toContain('recall-escape-mission');
  });
});
