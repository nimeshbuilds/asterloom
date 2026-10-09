import type { EvidenceBlock } from '../types';
import { textDigest } from './evidence';
import { cosine } from './retrieval';
import { RETRIEVAL_CACHE_VERSION, type Embedder } from './localEmbeddings';
export interface VectorCache {get(key:string):Promise<number[]|undefined>;set(key:string,vector:number[]):Promise<void>}
export interface SemanticStatus {phase:'loading'|'indexing'|'ready'|'unavailable';completed:number;total:number;device?:'webgpu'|'wasm';message:string;cacheWarning?:string}
const validVector=(v:unknown):v is number[]=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const keyFor=(text:string)=>`${RETRIEVAL_CACHE_VERSION}:${textDigest(text)}`;
const checkAbort=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Retrieval indexing cancelled.','AbortError');};
export class SemanticEvidenceIndex {
 private entries:{block:EvidenceBlock;vector:number[]}[]=[];private queryCache=new Map<string,number[]>();
 private updateGeneration=0;
 constructor(private embedder:Embedder,private cache:VectorCache,private options:{maxBlocks?:number;spreadAcrossDocument?:boolean}={}){}
 get indexedCount(){return this.entries.length;}
 async update(blocks:EvidenceBlock[],onStatus:(status:SemanticStatus)=>void,signal?:AbortSignal):Promise<void>{
  const generation=++this.updateGeneration,check=()=>{checkAbort(signal);if(generation!==this.updateGeneration)throw new DOMException('Retrieval source changed.','AbortError');};
  this.entries=[];const maximum=Math.max(1,Math.min(20000,this.options.maxBlocks??512)),bounded=blocks.slice(0,maximum);let warning:string|undefined;
  if(this.options.spreadAcrossDocument&&bounded.length>8){
   // Breadth-first sampling warms all parts of a document before filling gaps.
   // Every block is still indexed once; there is no permanent first-pages cap.
   const original=[...bounded],order:number[]=[],queue:[number,number][]=[[0,original.length]];
   for(let cursor=0;cursor<queue.length;cursor++){const [start,end]=queue[cursor];if(start>=end)continue;const middle=(start+end)>>>1;order.push(middle);queue.push([start,middle],[middle+1,end]);}
   bounded.splice(0,bounded.length,...order.map(index=>original[index]));
  }
  onStatus({phase:'loading',completed:0,total:blocks.length,message:'Starting the bundled local model. Your material stays on this device.'});
  try{
   const device=await this.embedder.ready();check();const entries:{block:EvidenceBlock;vector:number[]}[]=[];
   for(let start=0;start<bounded.length;start+=8){check();const batch=bounded.slice(start,start+8),vectors:(number[]|undefined)[]=[],missing:number[]=[];
    for(let i=0;i<batch.length;i++){try{const stored=await this.cache.get(keyFor(batch[i].quote));vectors[i]=validVector(stored)?stored:undefined;}catch{warning='Embedding cache unavailable; matching works for this session.';}if(!vectors[i])missing.push(i);}
    if(missing.length){const inferred=await this.embedder.embed(missing.map(i=>batch[i].quote));check();if(inferred.length!==missing.length||inferred.some(v=>!validVector(v)))throw new Error('Invalid local embedding output.');for(let j=0;j<missing.length;j++){const i=missing[j];vectors[i]=inferred[j];try{await this.cache.set(keyFor(batch[i].quote),inferred[j]);}catch{warning='Embedding cache could not be saved; matching works for this session.';}}}
    check();entries.push(...batch.map((block,i)=>({block,vector:vectors[i]!})));this.entries=[...entries];onStatus({phase:'indexing',completed:entries.length,total:blocks.length,device,cacheWarning:warning,message:`Matching ${entries.length} of ${bounded.length} passages locally…`});
    // Yield between batches so keyboard input and cancel/source edits can be processed.
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   check();this.entries=entries;onStatus({phase:'ready',completed:entries.length,total:blocks.length,device,cacheWarning:warning,message:blocks.length>maximum?`Semantic matching covers ${maximum} passages; all ${blocks.length} passages remain searchable by exact words.`:'Local meaning + exact word search ready.'});
  }catch(error){if(generation!==this.updateGeneration)return;this.entries=[];if(signal?.aborted)return;onStatus({phase:'unavailable',completed:0,total:blocks.length,message:error instanceof Error?error.message:'Local semantic search is unavailable. Exact word search is active.'});}
 }
 async search(query:string,limit=30):Promise<{block:EvidenceBlock;score:number}[]>{
  if(!this.entries.length||!query.trim())return[];const text=query.trim().slice(0,500);let vector=this.queryCache.get(text);
  if(!vector){[vector]=await this.embedder.embed([text]);if(!validVector(vector))throw new Error('Invalid query embedding.');if(this.queryCache.size>=40)this.queryCache.delete(this.queryCache.keys().next().value!);this.queryCache.set(text,vector);}
  return this.entries.map(entry=>({block:entry.block,score:cosine(vector!,entry.vector)})).sort((a,b)=>b.score-a.score||a.block.start-b.block.start).slice(0,limit);
 }
}
/** Small content-addressed cache is disposable. It never stores secrets or changes the notebook. */
export function browserVectorCache():VectorCache {
 const memory=new Map<string,number[]>();let connection:Promise<IDBDatabase>|undefined;
 function db():Promise<IDBDatabase>{return connection??=new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}const request=indexedDB.open('asterloom-retrieval-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('vectors');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Cache upgrade blocked'));request.onsuccess=()=>resolve(request.result);});}
 return{
  async get(key){if(memory.has(key))return memory.get(key);const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction('vectors','readonly').objectStore('vectors').get(key);req.onsuccess=()=>resolve(validVector(req.result)?req.result:undefined);req.onerror=()=>reject(req.error);});},
  async set(key,vector){memory.set(key,vector);if(memory.size>1024)memory.delete(memory.keys().next().value!);const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction('vectors','readwrite'),store=tx.objectStore('vectors');store.put(vector,key);const count=store.count();count.onsuccess=()=>{let excess=count.result-4096;if(excess>0){const cursor=store.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item&&excess-->0){item.delete();item.continue();}};}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 };
}
