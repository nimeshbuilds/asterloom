import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createServer,type Server} from 'node:http';
import path from 'node:path';

let server:Server,origin:string;
test.beforeAll(async()=>{
 const storage=path.resolve('src/lib/storage.ts'),utils=path.resolve('src/lib/utils.ts'),deletion=path.resolve('src/lib/notebookDeletion.ts');
 const bundle=await build({stdin:{contents:`import * as storage from ${JSON.stringify(storage)};import * as utils from ${JSON.stringify(utils)};import * as deletion from ${JSON.stringify(deletion)};export {storage,utils,deletion};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'harness',platform:'browser'});
 server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);}else if(request.url==='/api/notebooks/cleanup'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({removedAssets:1,removedBytes:12,warnings:[]}));}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Isolated deletion test</title><script src="/fixture.js"></script>');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
test('real IndexedDB deletion clears owned data, retains shared content and survives restart without resurrecting',async({page,browser})=>{
 await page.goto(origin);
 const other=await browser.newContext(),otherPage=await other.newPage();await otherPage.goto(origin);
 await otherPage.evaluate(async()=>{const {storage,utils}=(window as any).harness;await storage.saveNotebook(utils.createNotebook({id:'deleted-world',title:'Other profile must stay'}));});
 try{
 const result=await page.evaluate(async()=>{
  const {storage:s,utils:u,deletion:d}=(window as any).harness;
  const shared=u.createSource('Shared source explanation retained by the other notebook, including its local meaning-search vector.'),unique=u.createSource('Unique source explanation and private attached bytes belong only to the deleted notebook.');
  unique.originalFile={name:'own.txt',mime:'text/plain',dataUrl:'data:text/plain;base64,cHJpdmF0ZQ==',size:7,sha256:'b'.repeat(64)};
  const a=u.createNotebook({id:'deleted-world',sources:[shared,unique]}),b=u.createNotebook({id:'retained-world',sources:[shared]});await s.saveNotebook(a);await s.saveNotebook(b);await s.saveProgress(s.emptyProgress(a.id));
  localStorage.setItem('asterloom:editor-draft:'+a.id,'private unsaved note');localStorage.setItem('asterloom:editor-draft:'+b.id,'keep');
  const write=async(name:string,store:string,entries:[string,unknown][])=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');entries.forEach(([key,value])=>tx.objectStore(store).put(value,key));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();};
  const sharedKey=[...d.vectorKeysFor([b])][0] as string,uniqueKey=[...d.vectorKeysFor([u.createNotebook({sources:[unique]})])][0] as string;
  await write('asterloom-visual-capture-drafts','drafts',[[a.id+':image',{private:'capture'}],[b.id+':image',{keep:'capture'}]]);
  await write('asterloom-retrieval-v1','vectors',[[sharedKey,[1]],[uniqueKey,[2]],['old-source-revision',[3]]]);
  const plan=await s.prepareNotebookDeletion(a.id);if(!await s.loadNotebook(a.id))throw Error('Preparing deletion mutated data');const result=await s.deleteNotebook(a.id);
  let lateNotebook=false,lateProgress=false;try{await s.saveNotebook(a);}catch{lateNotebook=true;}try{await s.saveProgress(s.emptyProgress(a.id));}catch{lateProgress=true;}
  return {plan,result,lateNotebook,lateProgress,sharedKey,uniqueKey};
 });
 expect(result.result.pendingCleanup).toBe(false);expect(result.lateNotebook&&result.lateProgress).toBe(true);
 await page.reload();
 const disk=await page.evaluate(async()=>{
  const read=async(name:string,store:string)=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);});const keys=await new Promise<IDBValidKey[]>(resolve=>{const r=db.transaction(store,'readonly').objectStore(store).getAllKeys();r.onsuccess=()=>resolve(r.result);});db.close();return keys;};
  const s=(window as any).harness.storage;return {rows:(await s.loadNotebooks()).map((n:any)=>n.id),deleted:await s.isNotebookDeleted('deleted-world'),records:await read('asterloom-local-v1','records'),drafts:await read('asterloom-visual-capture-drafts','drafts'),vectors:await read('asterloom-retrieval-v1','vectors'),local:{...localStorage}};
 });
 expect(disk.rows).toEqual(['retained-world']);expect(disk.deleted).toBe(true);expect(disk.records).not.toContain('progress:deleted-world');expect(disk.records).not.toContain('cleanup:deleted-world');expect(disk.drafts).toEqual(['retained-world:image']);expect(disk.vectors).toEqual([result.sharedKey]);expect(disk.local['asterloom:editor-draft:deleted-world']).toBeUndefined();expect(disk.local['asterloom:editor-draft:retained-world']).toBe('keep');
 expect(await otherPage.evaluate(async()=>(await (window as any).harness.storage.loadNotebook('deleted-world')).title)).toBe('Other profile must stay');
 }finally{await other.close();}
});

test('guarded IndexedDB saves retain the original synchronous failure without an uncaught event error',async({page})=>{
 const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));await page.goto(origin);
 const result=await page.evaluate(async()=>{
  const s=(window as any).harness.storage,n=(window as any).harness.utils.createNotebook({id:'save-failure'});await s.saveNotebook(n);await s.saveProgress(s.emptyProgress(n.id));
  const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){if(key==='progress:'+n.id)throw new DOMException('Injected disk quota failure','QuotaExceededError');return original.call(this,value,key);};
  let error='';try{await s.saveProgress({...s.emptyProgress(n.id),xp:99});}catch(e){error=(e as Error).message;}finally{IDBObjectStore.prototype.put=original;}
  return {error,progress:await s.loadProgress(n.id),notebook:await s.loadNotebook(n.id)};
 });
 expect(result.error).toContain('Injected disk quota failure');expect(result.progress.xp).toBe(0);expect(result.notebook.id).toBe('save-failure');expect(pageErrors).toEqual([]);
});
