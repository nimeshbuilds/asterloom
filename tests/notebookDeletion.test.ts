import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createNotebook,createSource} from '../src/lib/utils';
import {notebookDraftKeys,vectorKeysFor} from '../src/lib/notebookDeletion';
class MemoryStorage implements Storage {get length(){return Object.keys(this).length;}clear(){Object.keys(this).forEach(k=>delete (this as any)[k]);}getItem(k:string){return Object.hasOwn(this,k)?String((this as any)[k]):null;}key(i:number){return Object.keys(this)[i]??null;}removeItem(k:string){delete (this as any)[k];}setItem(k:string,v:string){Object.defineProperty(this,k,{value:String(v),writable:true,enumerable:true,configurable:true});}}
const shared='a'.repeat(64),unique='b'.repeat(64);
const recording=(id:string)=>({...createSource('',id,'audio'),asset:{id,name:'voice.wav',mime:'audio/wav',size:100,sha256:id}});
beforeEach(()=>{vi.resetModules();vi.stubGlobal('localStorage',new MemoryStorage());vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({removedAssets:1,removedBytes:100,warnings:[]}))));});
afterEach(()=>vi.unstubAllGlobals());
describe('notebook deletion lifecycle',()=>{
 it('plans without changing anything, deletes owned originals/progress/drafts, and preserves a shared recording and settings',async()=>{
  const s=await import('../src/lib/storage'),a=createNotebook({id:'world-a',sources:[recording(unique),recording(shared)]}),b=createNotebook({id:'world-b',sources:[recording(shared)]});
  await s.saveNotebook(a);await s.saveNotebook(b);await s.saveProgress(s.emptyProgress(a.id));
  localStorage.setItem('asterloom:editor-draft:world-a','private notes');localStorage.setItem('asterloom:editor-draft:world-b','keep notes');localStorage.setItem('asterloom:transcription:'+shared,'shared job');localStorage.setItem('asterloom:transcription:'+unique,'private job');localStorage.setItem('asterloom:sound-preferences','keep');
  const before={...localStorage};expect(await s.prepareNotebookDeletion(a.id)).toMatchObject({mediaCount:2,sharedMediaCount:1,exclusiveMediaBytes:100,draftCount:2});expect({...localStorage}).toEqual(before);expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).dryRun).toBe(true);
  const result=await s.deleteNotebook(a.id);expect(result.pendingCleanup).toBe(false);expect(await s.loadNotebook(a.id)).toBeUndefined();expect(await s.loadNotebook(b.id)).toMatchObject({id:b.id});expect(await s.isNotebookDeleted(a.id)).toBe(true);
  expect(localStorage.getItem('asterloom:progress:world-a')).toBeNull();expect(localStorage.getItem('asterloom:editor-draft:world-a')).toBeNull();expect(localStorage.getItem('asterloom:transcription:'+unique)).toBeNull();expect(localStorage.getItem('asterloom:transcription:'+shared)).toBe('shared job');expect(localStorage.getItem('asterloom:editor-draft:world-b')).toBe('keep notes');expect(localStorage.getItem('asterloom:sound-preferences')).toBe('keep');
  expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string)).toMatchObject({assetIds:[unique,shared],retainedAssetIds:[shared]});
  await expect(s.saveNotebook(a)).rejects.toThrow('deleted');await expect(s.saveProgress(s.emptyProgress(a.id))).rejects.toThrow('deleted');
  await s.saveNotebook(a,{restoreDeleted:true});expect(await s.isNotebookDeleted(a.id)).toBe(false);
 });
 it('keeps a content-free cleanup journal after service failure and retries against the latest shared inventory',async()=>{
  const s=await import('../src/lib/storage'),a=createNotebook({id:'retry',sources:[recording(unique)]});await s.saveNotebook(a);vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  expect((await s.deleteNotebook(a.id)).pendingCleanup).toBe(true);expect(await s.loadPendingNotebookCleanupIds()).toEqual(['retry']);expect(await s.loadNotebook(a.id)).toBeUndefined();expect(localStorage.getItem('asterloom:cleanup:retry')).not.toContain('voice.wav');
  await s.saveNotebook(createNotebook({id:'other',sources:[recording(unique)]}));expect((await s.retryNotebookCleanup(a.id)).pendingCleanup).toBe(false);expect(localStorage.getItem('asterloom:cleanup:retry')).toBeNull();expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string).retainedAssetIds).toEqual([unique]);
 });
 it('removes recordings previously detached from a notebook, retaining another notebook’s asset history',async()=>{
  const s=await import('../src/lib/storage'),a=createNotebook({id:'historical',sources:[recording(unique),recording(shared)]}),b=createNotebook({id:'retained-history',sources:[recording(shared)]});await s.saveNotebook(a);await s.saveNotebook(b);await s.saveNotebook({...a,sources:[]});await s.saveNotebook({...b,sources:[]});
  localStorage.setItem('asterloom:transcription:'+unique,'old job');localStorage.setItem('asterloom:transcription:'+shared,'shared old job');
  expect(await s.prepareNotebookDeletion(a.id)).toMatchObject({mediaCount:2,sharedMediaCount:1});await s.deleteNotebook(a.id);
  const body=JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);expect(body.assetIds).toEqual([unique,shared]);expect(body.retainedAssetIds).toEqual([shared]);expect(localStorage.getItem('asterloom:transcription:'+unique)).toBeNull();expect(localStorage.getItem('asterloom:transcription:'+shared)).toBe('shared old job');expect(localStorage.getItem('asterloom:asset-history:'+a.id)).toBeNull();
 });
 it('reports committed deletion with pending cleanup if reading its cleanup journal temporarily fails',async()=>{
  const s=await import('../src/lib/storage'),n=createNotebook({id:'read-failure'});await s.saveNotebook(n);const get=localStorage.getItem.bind(localStorage),set=localStorage.setItem.bind(localStorage);let committed=false;
  vi.spyOn(localStorage,'setItem').mockImplementation((key,value)=>{set(key,value);if(key==='asterloom:cleanup:'+n.id)committed=true;});vi.spyOn(localStorage,'getItem').mockImplementation(key=>{if(committed&&key==='asterloom:cleanup:'+n.id)throw new Error('temporarily unavailable');return get(key);});
  expect(await s.deleteNotebook(n.id)).toMatchObject({deleted:true,pendingCleanup:true});expect(await s.loadNotebook(n.id)).toBeUndefined();expect(await s.isNotebookDeleted(n.id)).toBe(true);expect(get('asterloom:cleanup:'+n.id)).not.toBeNull();
 });
 it('a failed fallback transaction preserves the notebook and does not leave a deletion tombstone',async()=>{
  const s=await import('../src/lib/storage'),n=createNotebook({id:'keep-on-failure'});await s.saveNotebook(n);const set=localStorage.setItem.bind(localStorage);vi.spyOn(localStorage,'setItem').mockImplementation((key,value)=>{if(key==='asterloom:cleanup:'+n.id)throw new Error('quota');set(key,value);});await expect(s.deleteNotebook(n.id)).rejects.toThrow('quota');expect(await s.loadNotebook(n.id)).toBeDefined();expect(await s.isNotebookDeleted(n.id)).toBe(false);expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects arbitrary export paths before deletion and preserves prefix-colliding notebook drafts',async()=>{
  const s=await import('../src/lib/storage'),a=createNotebook({id:'world'}),b=createNotebook({id:'world:child'});await s.saveNotebook(a);await s.saveNotebook(b);
  await expect(s.deleteNotebook(a.id,{trashExportIds:['/Users/private/file']})).rejects.toThrow('listed');expect(await s.loadNotebook(a.id)).toBeDefined();
  localStorage.setItem('asterloom:recording-draft:v1:world:child:source:hash','keep');localStorage.setItem('asterloom:rooms:world:child','keep room');await s.deleteNotebook(a.id);expect(localStorage.getItem('asterloom:recording-draft:v1:world:child:source:hash')).toBe('keep');expect(localStorage.getItem('asterloom:rooms:world:child')).toBe('keep room');
 });
 it('recognizes every owned creator draft and uses content identity for shared retrieval passages',()=>{
  const prefixes=['editor-draft:','recording-selection:','evidence-selection:','activity-author:','activity-assistant:','lab-author:','scenario-author:','composition-author:','picture-author:'];const keys=prefixes.map(prefix=>'asterloom:'+prefix+'one');keys.push('asterloom.picture-author.v1.one','asterloom.rule-switch-author.v1.one','asterloom.child-play-author.v1.one','asterloom:rooms:one:outbox:result','asterloom:recording-draft:v1:one:source:hash');expect(notebookDraftKeys('one',keys,new Set())).toEqual(keys);
  const source=createSource('A source passage with enough explanation to be indexed and retained as shared evidence.');const a=createNotebook({sources:[source]}),b=createNotebook({sources:[{...source,id:'another-source'}]});expect(vectorKeysFor([a])).toEqual(vectorKeysFor([b]));
 });
});
