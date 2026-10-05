import type { Confidence, LearningCard, Notebook, Progress } from '../types';
import { createId, stableHash } from './utils';
import {cleanupNotebookWork,deletionDesktop,deletionWork,notebookAssetIds,type DeletionWork,type NotebookDeletionPlan,type NotebookDeletionResult} from './notebookDeletion';
export type {NotebookDeletionPlan,NotebookDeletionResult,TrackedNotebookExport} from './notebookDeletion';

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

async function mutateRecords(removals:string[],values:Record<string,unknown>,guardDeletedId?:string):Promise<void>{
 const db=await database();
 if(!db){const keys=[...new Set([...removals,...Object.keys(values)])],before=new Map(keys.map(key=>[key,localStorage.getItem(PREFIX+key)]));try{if(guardDeletedId&&localStorage.getItem(PREFIX+'deleted:'+guardDeletedId))throw new Error('This notebook was deleted; a late save was not written.');for(const [key,value]of Object.entries(values))localStorage.setItem(PREFIX+key,JSON.stringify(value));for(const key of removals)localStorage.removeItem(PREFIX+key);return;}catch(error){for(const [key,value]of before)try{if(value===null)localStorage.removeItem(PREFIX+key);else localStorage.setItem(PREFIX+key,value);}catch{}throw storageFailure(error);}}
 await new Promise<void>((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(STORE,'readwrite');}catch(error){reject(storageFailure(error));return;}
  const store=tx.objectStore(STORE);let cause:unknown;
  const abort=(error:unknown)=>{cause=error;try{tx.abort();}catch{/* An already finished transaction cannot be aborted again. */}reject(storageFailure(error));};
  const apply=()=>{try{for(const key of removals)store.delete(key);for(const [key,value]of Object.entries(values))store.put(value,key);}catch(error){abort(error);}};
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(storageFailure(cause??tx.error));tx.onabort=()=>reject(storageFailure(cause??tx.error??'The storage transaction was interrupted.'));
  try{if(guardDeletedId){const check=store.get('deleted:'+guardDeletedId);check.onsuccess=()=>{if(check.result)abort(new Error('This notebook was deleted; a late save was not written.'));else apply();};check.onerror=()=>abort(check.error);}else apply();}catch(error){abort(error);}
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

async function assetHistory(id:string):Promise<string[]>{const ids=await read<unknown>(`asset-history:${id}`);return Array.isArray(ids)?ids.filter((id):id is string=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id)):[];}
async function retainedAssets(rows:Notebook[]):Promise<string[]>{return [...new Set([...notebookAssetIds(rows),...(await Promise.all(rows.map(n=>assetHistory(n.id)))).flat()])];}

export async function saveNotebook(notebook: Notebook,options:{restoreDeleted?:boolean}={}): Promise<Notebook> {
  if(!options.restoreDeleted&&await isNotebookDeleted(notebook.id))throw new Error('This notebook was deleted. Import a saved copy to restore it.');
  const previous = await loadNotebook(notebook.id);
  const saved = { ...notebook, revision: previous ? Math.max(previous.revision + 1, notebook.revision) : Math.max(1, notebook.revision), updatedAt: new Date().toISOString() };
  const ownedAssets=[...new Set([...(options.restoreDeleted?[]:await assetHistory(notebook.id)),...notebookAssetIds(previous?[previous,notebook]:[notebook])])];
  await mutateRecords(options.restoreDeleted?[`deleted:${notebook.id}`,`cleanup:${notebook.id}`]:[],{[`notebook:${notebook.id}`]:saved,[`asset-history:${notebook.id}`]:ownedAssets},options.restoreDeleted?undefined:notebook.id);
  return saved;
}

export async function isNotebookDeleted(id:string):Promise<boolean>{return !!await read(`deleted:${id}`);}
export async function loadPendingNotebookCleanupIds():Promise<string[]>{
 const db=await database();if(!db)return Object.keys(localStorage).filter(key=>key.startsWith(PREFIX+'cleanup:')).map(key=>key.slice((PREFIX+'cleanup:').length));
 return new Promise((resolve,reject)=>{const ids:string[]=[],request=db.transaction(STORE,'readonly').objectStore(STORE).openKeyCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(ids);return;}const key=String(cursor.key);if(key.startsWith('cleanup:'))ids.push(key.slice(8));cursor.continue();};request.onerror=()=>reject(storageFailure(request.error));});
}
export async function prepareNotebookDeletion(id:string):Promise<NotebookDeletionPlan>{
 const rows=await loadNotebooks(),notebook=rows.find(n=>n.id===id);if(!notebook)throw new Error('This notebook is no longer in your library.');
 const retained=rows.filter(n=>n.id!==id),kept=new Set(await retainedAssets(retained)),work=deletionWork(notebook,retained,Object.keys(localStorage),[],{ownedAssetIds:await assetHistory(id),retainedAssetIds:[...kept]});
 const assets=[...new Map(notebook.sources.flatMap(s=>s.asset?[[s.asset.id,s.asset] as const]:[])).values()];
 const plan:NotebookDeletionPlan={notebookId:id,title:notebook.title,sourceCount:notebook.sources.length,cardCount:notebook.cards.length,activityCount:notebook.activities?.length||0,mediaCount:work.assetIds.length,exclusiveMediaBytes:assets.filter(a=>!kept.has(a.id)).reduce((sum,a)=>sum+a.size,0),sharedMediaCount:work.assetIds.filter(id=>kept.has(id)).length,draftCount:work.draftKeys.length,exports:[],warnings:[]};
 if(work.assetIds.length)try{const response=await fetch('/api/notebooks/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notebookId:id,assetIds:work.assetIds,retainedAssetIds:[...kept],dryRun:true}),signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error();const details=await response.json();if(Number.isSafeInteger(details.exclusiveMediaBytes))plan.exclusiveMediaBytes=details.exclusiveMediaBytes;if(details.bundledAssets)plan.warnings.push('Some recordings are built into this application copy. Removing the saved game clears its working data; the bundled originals remain until that app copy is moved to Trash.');if(details.warnings?.length)plan.warnings.push('Some recording files could not be checked. Cleanup will report any files it cannot remove.');}catch{plan.warnings.push('Recording sizes are estimates because the local file service could not be checked.');}
 try{const listed=await deletionDesktop()?.listNotebookExports?.(id);if(listed?.error)throw new Error();plan.exports=listed?.exports||[];}catch{plan.warnings.push('Saved export locations could not be read. Their copies will be kept.');}
 return plan;
}
export async function retryNotebookCleanup(id:string):Promise<NotebookDeletionResult>{
 const work=await read<DeletionWork>(`cleanup:${id}`);if(!work)return {deleted:true,pendingCleanup:false,warnings:[],removedAssets:0,removedBytes:0,trashedExports:0};
 const rows=await loadNotebooks();if(rows.some(n=>n.id===id))throw new Error('This notebook was restored. Its current files have been preserved.');
 const result=await cleanupNotebookWork(work,rows,await retainedAssets(rows));if(!result.pendingCleanup)await remove([`cleanup:${id}`]);return result;
}
export async function deleteNotebook(id:string,options:{trashExportIds?:string[]}={}):Promise<NotebookDeletionResult>{
 const rows=await loadNotebooks(),notebook=rows.find(n=>n.id===id);if(!notebook)return retryNotebookCleanup(id);
 if(options.trashExportIds&&(!Array.isArray(options.trashExportIds)||options.trashExportIds.some(id=>typeof id!=='string'||!/^export-[a-f0-9-]{36}$/.test(id))))throw new Error('Choose only exports listed for this notebook.');
 const retained=rows.filter(n=>n.id!==id);
 const work=deletionWork(notebook,retained,Object.keys(localStorage),options.trashExportIds,{ownedAssetIds:await assetHistory(id),retainedAssetIds:await retainedAssets(retained)});
 // Commit removal and a small, content-free recovery record together. No late
 // progress write or embedded-game bootstrap may resurrect a deleted notebook.
 await mutateRecords([`notebook:${id}`,`progress:${id}`,`asset-history:${id}`],{[`deleted:${id}`]:{deletedAt:new Date().toISOString()},[`cleanup:${id}`]:work});
 try{return await retryNotebookCleanup(id);}catch{return {deleted:true,pendingCleanup:true,warnings:['The game was removed. Its local-file cleanup could not finish; retry cleanup to resume safely.'],removedAssets:0,removedBytes:0,trashedExports:0};}
}

export function emptyProgress(notebookId: string): Progress {
  return { notebookId, completedCardIds: [], attempts: [], cards: {}, xp: 0, mastery: 0, streak: 0, bestStreak: 0, sessions: 0, journal: [], updatedAt: new Date().toISOString(), revision: 1 };
}

export async function loadProgress(notebookId: string): Promise<Progress> { return await read<Progress>(`progress:${notebookId}`) ?? emptyProgress(notebookId); }
export async function saveProgress(progress: Progress): Promise<void> { await mutateRecords([],{[`progress:${progress.notebookId}`]:{...progress,updatedAt:new Date().toISOString()}},progress.notebookId); }

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
