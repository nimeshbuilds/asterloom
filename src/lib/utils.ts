import type { LearningCard, Notebook, Source, SourceKind } from '../types';

export function createId(prefix = 'id'): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

/** Stable hash is for deterministic ordering and IDs, never for authentication. */
export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

export function createNotebook(values: Partial<Notebook> = {}): Notebook {
  const now = new Date().toISOString();
  return { id: createId('notebook'), title: 'Untitled notebook', description: '', createdAt: now, updatedAt: now, ageGroup: 'adult', goal: 'Understand and remember', theme: 'aurora', scaffoldIds: [], sources: [], cards: [], revision: 1, ...values };
}

export function createSource(text: string, title = 'Pasted notes', kind: SourceKind = 'text'): Source {
  return { id: createId('source'), title, text: text.trim(), kind, status: text.trim() ? 'ready' : 'needs-transcript', addedAt: new Date().toISOString() };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadFile(content: string | Blob, filename: string, mime = 'application/json'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function safeFilename(title: string): string { return title.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'learning-notebook'; }

export function normalizeText(value: string): string { return value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

/** A source-derived answer is playable only while its original quotation still exists. */
export function hasCurrentCardEvidence(card: LearningCard, sources: readonly Source[]): boolean {
  if (!card.sourceId) return card.questionType === 'manual';
  const source = sources.find(item => item.id === card.sourceId);
  if (!source || source.status !== 'ready' || !card.evidence?.trim() || !source.text.includes(card.evidence)) return false;
  return card.questionType === 'manual' || card.evidence.toLocaleLowerCase().includes(card.answer.toLocaleLowerCase());
}

/** Explicit author/assistant drafts cannot enter scored recall. Legacy status-less cards retain evidence validation. */
export function canScoreRecallCard(card: LearningCard, sources: readonly Source[]): boolean {
  return card.reviewStatus !== 'needs-review' && hasCurrentCardEvidence(card, sources);
}
