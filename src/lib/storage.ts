import type { Confidence, LearningCard, Notebook, Progress } from '../types';
import { createId, stableHash } from './utils';

const DATABASE = 'asterloom-local-v1';
const STORE = 'records';
const PREFIX = 'asterloom:';
let connection: Promise<IDBDatabase | null> | undefined;

function database(): Promise<IDBDatabase | null> {
  if (connection) return connection;
  connection = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return connection;
}

function storageFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Your changes could not be saved on this device. Export a backup before closing this tab. ${message}`);
}

async function read<T>(key: string): Promise<T | undefined> {
  const db = await database();
  if (!db) {
    try { const value = localStorage.getItem(PREFIX + key); return value ? JSON.parse(value) as T : undefined; }
    catch (error) { throw storageFailure(error); }
  }
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(storageFailure(request.error));
  });
}

async function write(key: string, value: unknown): Promise<void> {
  const db = await database();
  if (!db) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return; }
    catch (error) { throw storageFailure(error); }
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(value, key);
    // Only a committed transaction constitutes a successful save.
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(storageFailure(transaction.error));
    transaction.onabort = () => reject(storageFailure(transaction.error ?? 'The storage transaction was interrupted.'));
  });
}

async function remove(keys: string[]): Promise<void> {
  const db = await database();
  if (!db) { try { keys.forEach(key => localStorage.removeItem(PREFIX + key)); return; } catch (error) { throw storageFailure(error); } }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    keys.forEach(key => transaction.objectStore(STORE).delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(storageFailure(transaction.error));
    transaction.onabort = () => reject(storageFailure(transaction.error));
  });
}

export async function loadNotebooks(): Promise<Notebook[]> {
  const db = await database();
  let values: Notebook[];
  if (!db) {
    try { values = Object.keys(localStorage).filter(key => key.startsWith(PREFIX + 'notebook:')).map(key => JSON.parse(localStorage.getItem(key) ?? 'null')).filter(Boolean); }
    catch (error) { throw storageFailure(error); }
  } else {
    values = await new Promise<Notebook[]>((resolve, reject) => {
      const notebooks: Notebook[] = [];
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      request.onsuccess = () => { const cursor = request.result; if (!cursor) { resolve(notebooks); return; } if (String(cursor.key).startsWith('notebook:')) notebooks.push(cursor.value); cursor.continue(); };
      request.onerror = () => reject(storageFailure(request.error));
    });
  }
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadNotebook(id: string): Promise<Notebook | undefined> { return read<Notebook>(`notebook:${id}`); }

export async function saveNotebook(notebook: Notebook): Promise<Notebook> {
  const previous = await loadNotebook(notebook.id);
  const saved = { ...notebook, revision: previous ? Math.max(previous.revision + 1, notebook.revision) : Math.max(1, notebook.revision), updatedAt: new Date().toISOString() };
  await write(`notebook:${notebook.id}`, saved);
  return saved;
}

export async function deleteNotebook(id: string): Promise<void> { await remove([`notebook:${id}`, `progress:${id}`]); }

export function emptyProgress(notebookId: string): Progress {
  return { notebookId, completedCardIds: [], attempts: [], cards: {}, xp: 0, mastery: 0, streak: 0, bestStreak: 0, sessions: 0, journal: [], updatedAt: new Date().toISOString(), revision: 1 };
}

export async function loadProgress(notebookId: string): Promise<Progress> { return await read<Progress>(`progress:${notebookId}`) ?? emptyProgress(notebookId); }
export async function saveProgress(progress: Progress): Promise<void> { await write(`progress:${progress.notebookId}`, { ...progress, updatedAt: new Date().toISOString() }); }

/** Deterministic review heuristic, not a validated measure of ability or examination readiness. */
export function recordAttempt(progress: Progress, card: LearningCard, correct: boolean, confidence: Confidence = 'unsure', now = new Date()): Progress {
  const at = now.toISOString();
  const previous = progress.cards[card.id];
  const due = !previous || new Date(previous.dueAt).getTime() <= now.getTime();
  const successfulReviews = correct ? (previous?.successfulReviews ?? 0) + (due ? 1 : 0) : 0;
  const intervals = [0, 1, 3, 7, 14, 30, 60];
  const intervalDays = correct ? (due ? intervals[Math.min(successfulReviews, intervals.length - 1)] : previous?.intervalDays ?? 1) : 0;
  const dueAt = correct && !due && previous ? previous.dueAt : new Date(now.getTime() + (correct ? intervalDays * 86_400_000 : 10 * 60_000)).toISOString();
  const xp = correct && due ? (confidence === 'guessing' ? 12 : 20) : 0;
  const completedCardIds = correct ? [...new Set([...progress.completedCardIds, card.id])] : progress.completedCardIds.filter(id => id !== card.id);
  const cards = { ...progress.cards, [card.id]: { cardId: card.id, attempts: (previous?.attempts ?? 0) + 1, correct: (previous?.correct ?? 0) + (correct ? 1 : 0), successfulReviews, intervalDays, dueAt, lastAttemptAt: at, lastCorrect: correct } };
  const streak = correct ? progress.streak + 1 : 0;
  return { ...progress, completedCardIds, cards, attempts: [...progress.attempts, { id: createId('attempt'), cardId: card.id, correct, confidence, at, xp }].slice(-10_000), xp: progress.xp + xp, mastery: Math.round(Object.values(cards).filter(item => item.lastCorrect).length / Object.keys(cards).length * 100), streak, bestStreak: Math.max(progress.bestStreak, streak), updatedAt: at, revision: progress.revision + 1 };
}

export function selectDueCards(cards: LearningCard[], progress: Progress, limit = 10, now = new Date()): LearningCard[] {
  return [...cards].sort((a, b) => {
    const left = progress.cards[a.id]; const right = progress.cards[b.id];
    // Missed due items first, then due reviews, then unseen material, then future reviews.
    const priority = (item: typeof left) => !item ? 2 : new Date(item.dueAt).getTime() <= now.getTime() ? (item.lastCorrect ? 1 : 0) : 3;
    const order = priority(left) - priority(right);
    if (order) return order;
    if (left && right) return left.dueAt.localeCompare(right.dueAt) || a.id.localeCompare(b.id);
    return cards.indexOf(a) - cards.indexOf(b);
  }).slice(0, Math.max(0, limit));
}

export function dueCardCount(cards: LearningCard[], progress: Progress, now = new Date()): number {
  return cards.filter(card => !progress.cards[card.id] || new Date(progress.cards[card.id].dueAt).getTime() <= now.getTime()).length;
}

export function sourceFingerprint(notebook: Pick<Notebook, 'sources'>): string { return stableHash(JSON.stringify(notebook.sources.map(source => [source.id, source.text, source.status]))).toString(36); }

export async function requestPersistentStorage(): Promise<boolean> { return typeof navigator !== 'undefined' && !!navigator.storage?.persist ? navigator.storage.persist() : false; }

export async function storageEstimate(): Promise<StorageEstimate | null> { return typeof navigator !== 'undefined' && navigator.storage?.estimate ? navigator.storage.estimate() : null; }
