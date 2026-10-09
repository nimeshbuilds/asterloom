import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {askAster} from '../src/lib/asterKnowledge';
import {createNotebook,createSource} from '../src/lib/utils';
const local=vi.hoisted(()=>({ready:Promise.resolve(),query:undefined as Promise<void>|undefined,onReady:undefined as (()=>void)|undefined,batchGate:undefined as Promise<void>|undefined,batchCalls:0}));
vi.mock('../src/lib/localEmbeddings',()=>({RETRIEVAL_CACHE_VERSION:'aster-readiness-test',localEmbedder:{ready:async()=>{local.onReady?.();await local.ready;return 'wasm';},embed:async(texts:string[])=>{if(texts.length>1&&++local.batchCalls>1&&local.batchGate)await local.batchGate;if(texts[0]==='tiny digital parcel'&&local.query)await local.query;return texts.map(text=>Array.from({length:384},(_,i)=>i===(/packet|tiny digital parcel/i.test(text)?0:1)?1:0));}}}));
const setup=(id:string)=>createNotebook({id,sources:[createSource('Packet: a small unit of data transported across a network.','Local reference')]});
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('document',{});vi.stubGlobal('location',{protocol:'asterloom:'});local.ready=Promise.resolve();local.query=undefined;local.onReady=undefined;local.batchGate=undefined;local.batchCalls=0;});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

describe('bounded cold local semantic readiness',()=>{
 it('reports unfinished meaning search instead of a false negative, then succeeds from the same warmed index',async()=>{
  let release!:()=>void;local.ready=new Promise<void>(resolve=>release=resolve);const n=setup('cold-readiness');
  const started=new Promise<void>(resolve=>local.onReady=resolve);const request=askAster(n,'tiny digital parcel');await started;await vi.advanceTimersByTimeAsync(4500);const cold=await request;
  expect(cold.status).toBe('unavailable');expect(cold.method).toBe('none');expect(cold.passages).toEqual([]);expect(cold.message).toMatch(/still preparing/);expect(cold.coverage).toMatchObject({semanticStatus:'loading',semanticComplete:false,semanticIndexed:0});
  release();await vi.advanceTimersByTimeAsync(10);const next=askAster(n,'tiny digital parcel');await vi.advanceTimersByTimeAsync(10);const warm=await next;expect(warm.status).toBe('found');expect(warm.method).toBe('semantic');expect(warm.passages[0].reference.quote).toContain('Packet:');expect(warm.coverage).toMatchObject({semanticStatus:'ready',semanticComplete:true,semanticIndexed:1});
 });
 it('keeps complete exact-word evidence available while honestly labeling the cold meaning-search coverage',async()=>{
  let release!:()=>void;local.ready=new Promise<void>(resolve=>release=resolve);const pending=askAster(setup('cold-exact'),'packet');await vi.advanceTimersByTimeAsync(1500);const result=await pending;
  expect(result.status).toBe('found');expect(result.method).toBe('lexical');expect(result.passages[0].reference.quote).toContain('Packet:');expect(result.coverage?.semanticComplete).toBe(false);expect(result.message).toMatch(/has not checked every passage/);release();await vi.advanceTimersByTimeAsync(10);
 });
 it('does not declare a completed negative when the query embedding itself is still pending',async()=>{
  let release!:()=>void;local.query=new Promise<void>(resolve=>release=resolve);const pending=askAster(setup('cold-query'),'tiny digital parcel');await vi.advanceTimersByTimeAsync(6500);const result=await pending;
  expect(result.status).toBe('unavailable');expect(result.coverage).toMatchObject({semanticStatus:'ready',semanticComplete:false,semanticIndexed:1});release();await vi.advanceTimersByTimeAsync(10);
 });
 it('does not demote a direct factual match just because only other document positions have embeddings',async()=>{
  let release!:()=>void;local.batchGate=new Promise<void>(resolve=>release=resolve);
  const source=createSource(Array.from({length:16},(_,i)=>i===15?'Catalog metadata describes the schema for each table.':`Topic ${i} explains a separate supported idea in this reference.`).join('\n\n'),'Long local reference'),n=createNotebook({id:'partial-ranked',sources:[source]});
  const pending=askAster(n,'catalog metadata');await vi.advanceTimersByTimeAsync(1510);const result=await pending;
  expect(result.method).toBe('semantic');expect(result.coverage?.semanticComplete).toBe(false);expect(result.coverage?.semanticIndexed).toBe(8);expect(result.passages[0].reference.quote).toBe('Catalog metadata describes the schema for each table.');
  release();await vi.advanceTimersByTimeAsync(10);
 });
 it('cancels the wait promptly without poisoning source indexing for the next question',async()=>{
  let release!:()=>void;local.ready=new Promise<void>(resolve=>release=resolve);const controller=new AbortController(),n=setup('cold-cancel'),pending=askAster(n,'tiny digital parcel',{signal:controller.signal});await vi.advanceTimersByTimeAsync(10);controller.abort();const result=await pending;expect(result.status).toBe('unavailable');expect(result.message).toMatch(/stopped/);
  release();await vi.advanceTimersByTimeAsync(10);const next=askAster(n,'tiny digital parcel');await vi.advanceTimersByTimeAsync(10);expect((await next).status).toBe('found');
 });
});
