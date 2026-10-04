import { expect, it } from 'vitest';
import { parseActivityAuthorDraft, serializeActivityAuthorDraft } from '../src/components/ActivityAssistant';
const draft = { sourceId: 'source-one', excerpt: 'Step one. Step two.', kind: 'sequence' as const, reply: '{"activity":{"title":"An unfinished reply"}}' };
it('round-trips unfinished author text without including provider credentials', () => {
  const text = serializeActivityAuthorDraft({ ...draft, apiKey: 'private-provider-key', config: { apiKey: 'another-key' } } as typeof draft);
  expect(text).not.toContain('private-provider-key'); expect(text).not.toContain('another-key');
  expect(parseActivityAuthorDraft(text)).toEqual(draft);
});
it('keeps portable drafts bounded and rejects unrelated or malformed JSON', () => {
  expect(() => parseActivityAuthorDraft('{bad')).toThrow('JSON backup');
  expect(() => parseActivityAuthorDraft(JSON.stringify({ ...draft, format: 'other', version: 1 }))).toThrow('unsupported');
  expect(() => parseActivityAuthorDraft(serializeActivityAuthorDraft({ ...draft, excerpt: 'x'.repeat(6001) }))).toThrow('size limits');
  expect(() => parseActivityAuthorDraft(serializeActivityAuthorDraft({ ...draft, reply: 'x'.repeat(100001) }))).toThrow('size limits');
  expect(() => parseActivityAuthorDraft('x'.repeat(1024 * 1024 + 1))).toThrow('1 MB');
});
