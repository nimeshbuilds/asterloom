import type {Notebook} from '../types';
import {evidenceBlocks,textDigest} from './evidence';
import {RETRIEVAL_CACHE_VERSION} from './localEmbeddings';

export interface TrackedNotebookExport {id:string;name:string;path:string;kind:'game'|'archive';platform?:string;available:boolean}
export interface NotebookDeletionPlan {notebookId:string;title:string;sourceCount:number;cardCount:number;activityCount:number;mediaCount:number;exclusiveMediaBytes:number;sharedMediaCount:number;draftCount:number;exports:TrackedNotebookExport[];warnings:string[]}
export interface NotebookDeletionResult {deleted:true;pendingCleanup:boolean;warnings:string[];removedAssets:number;removedBytes:number;trashedExports:number}
export interface DeletionWork {notebookId:string;assetIds:string[];draftKeys:string[];trashExportIds:string[]}
interface DeletionDesktop {clearNativeNotebook?:(id:string)=>Promise<{cleared?:boolean;warnings?:string[];error?:string}>;listNotebookExports?:(id:string)=>Promise<{exports?:TrackedNotebookExport[];error?:string}>;trashNotebookExports?:(id:string,ids:string[])=>Promise<{trashedIds?:string[];warnings?:string[];error?:string}>;clearNotebookCache?:()=>Promise<{cleared?:boolean;error?:string}>}
export function deletionDesktop():DeletionDesktop|undefined {return typeof window==='undefined'?undefined:(window as unknown as {asterloomDesktop?:DeletionDesktop}).asterloomDesktop;}
const ASSET=/^[a-f0-9]{64}$/;
export function notebookAssetIds(notebooks:Notebook[]):Set<string>{return new Set(notebooks.flatMap(n=>n.sources.flatMap(s=>s.asset&&ASSET.test(s.asset.id)?[s.asset.id]:[])));}
const EXACT_PREFIXES=['editor-draft:','recording-selection:','evidence-selection:','activity-author:','activity-assistant:','lab-author:','scenario-author:','composition-author:','picture-author:'];
export function notebookDraftKeys(id:string,keys:string[],exclusiveAssets:Set<string>):string[]{
 const exact=new Set(EXACT_PREFIXES.map(prefix=>`asterloom:${prefix}${id}`));
 for(const prefix of ['asterloom.picture-author.v1.','asterloom.rule-switch-author.v1.','asterloom.child-play-author.v1.'])exact.add(prefix+id);
 for(const hash of exclusiveAssets)exact.add(`asterloom:transcription:${hash}`);
 const room=`asterloom:rooms:${id}`;
 return keys.filter(key=>exact.has(key)||key===room||key.startsWith(room+':')||key.startsWith(`asterloom:recording-draft:v1:${id}:`));
}
export function deletionWork(notebook:Notebook,retained:Notebook[],keys:string[],trashExportIds:string[]=[],history:{ownedAssetIds?:string[];retainedAssetIds?:string[]}={}):DeletionWork {
 const kept=new Set([...notebookAssetIds(retained),...(history.retainedAssetIds||[])]),assets=new Set([...notebookAssetIds([notebook]),...(history.ownedAssetIds||[])]);
 return {notebookId:notebook.id,assetIds:[...assets],draftKeys:notebookDraftKeys(notebook.id,keys,new Set([...assets].filter(id=>!kept.has(id)))),trashExportIds:[...new Set(trashExportIds)]};
}
export function vectorKeysFor(notebooks:Notebook[]):Set<string>{return new Set(notebooks.flatMap(n=>n.sources.filter(s=>s.status==='ready').flatMap(s=>evidenceBlocks(s).map(block=>`${RETRIEVAL_CACHE_VERSION}:${textDigest(block.quote)}`))));}
async function cleanDatabase(name:string,storeName:string,remove:(key:string)=>boolean):Promise<void>{
 if(typeof indexedDB==='undefined')return;
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore(storeName);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close other Asterloom windows before clearing saved drafts.'));});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),cursor=tx.objectStore(storeName).openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(remove(String(item.key)))item.delete();item.continue();};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
/** Clears only this browser profile. Model/runtime downloads and account settings stay shared. */
export async function cleanupNotebookWork(work:DeletionWork,retained:Notebook[],retainedHistoryAssetIds:string[]=[]):Promise<NotebookDeletionResult>{
 const result:NotebookDeletionResult={deleted:true,pendingCleanup:false,warnings:[],removedAssets:0,removedBytes:0,trashedExports:0};
 // Native previews hold their own exact source copy. Clear them before removing
 // original recordings, or retain the cleanup journal until the preview closes.
 const clearNative=deletionDesktop()?.clearNativeNotebook;
 if(clearNative)try{
  const native=await clearNative(work.notebookId);
  if(!native.cleared||native.error){result.pendingCleanup=true;result.warnings.push(...(native.warnings?.length?native.warnings:[native.error||'Native preview data could not be removed. Close the preview and retry cleanup.']));return result;}
 }catch{result.pendingCleanup=true;result.warnings.push('Native preview data could not be removed. Close the preview and retry cleanup.');return result;}
 const retainedAssets=new Set([...notebookAssetIds(retained),...retainedHistoryAssetIds]);
 const attempt=async(label:string,fn:()=>Promise<void>)=>{try{await fn();}catch{result.pendingCleanup=true;result.warnings.push(label+' Retry cleanup to finish removing its local data.');}};
 await attempt('Some creator drafts could not be removed.',async()=>{const protectedKeys=new Set(retained.flatMap(n=>notebookDraftKeys(n.id,work.draftKeys,notebookAssetIds([n]))));for(const hash of retainedAssets)protectedKeys.add(`asterloom:transcription:${hash}`);for(const key of work.draftKeys)if(!protectedKeys.has(key))localStorage.removeItem(key);});
 await attempt('Some image capture drafts could not be removed.',()=>cleanDatabase('asterloom-visual-capture-drafts','drafts',key=>key.startsWith(work.notebookId+':')&&!retained.some(n=>key.startsWith(n.id+':'))));
 // Old source revisions had content-addressed vectors without notebook ownership.
 // Retain every current shared passage and discard other disposable cache entries.
 await attempt('Some local search cache could not be removed.',async()=>{const kept=vectorKeysFor(retained);await cleanDatabase('asterloom-retrieval-v1','vectors',key=>!kept.has(key));});
 await attempt('The recording playback cache could not be cleared.',async()=>{const desktop=deletionDesktop();if(desktop?.clearNotebookCache){const reply=await desktop.clearNotebookCache();if(reply.error||!reply.cleared)throw new Error('Cache cleanup failed');}});
 await attempt('Local media or hosted room cleanup is incomplete.',async()=>{
  if(typeof location!=='undefined'&&location.protocol==='file:'){if(work.assetIds.length)throw new Error('Local service needed');return;}
  const response=await fetch('/api/notebooks/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notebookId:work.notebookId,assetIds:work.assetIds,retainedAssetIds:[...retainedAssets]}),signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error('Service cleanup failed');const body=await response.json();
  result.removedAssets=body.removedAssets||0;result.removedBytes=body.removedBytes||0;
  if(Array.isArray(body.warnings)&&body.warnings.length){result.pendingCleanup=true;result.warnings.push(...body.warnings.filter((v:unknown)=>typeof v==='string'));}
 });
 if(work.trashExportIds.length)await attempt('Some selected exports could not be moved to Trash.',async()=>{
  const desktop=deletionDesktop();if(!desktop?.trashNotebookExports)throw new Error('Desktop required');
  const reply=await desktop.trashNotebookExports(work.notebookId,work.trashExportIds);if(reply.error)throw new Error(reply.error);result.trashedExports=reply.trashedIds?.length||0;
  if(reply.warnings?.length){result.pendingCleanup=true;result.warnings.push(...reply.warnings);}
 });
 return result;
}
