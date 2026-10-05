/** Import this module lazily for optional local meaning search in the studio or Ask Aster.
 * Learning activities and scoring do not depend on a model; source search works offline. */
export const RETRIEVAL_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const RETRIEVAL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const RETRIEVAL_CACHE_VERSION = `${RETRIEVAL_MODEL}@${RETRIEVAL_REVISION}:q8:mean:normalized:v1`;
export interface Embedder { ready():Promise<'webgpu'|'wasm'>; embed(texts:string[]):Promise<number[][]> }
let extractor:Promise<{run:(texts:string[])=>Promise<number[][]>;device:'webgpu'|'wasm'}>|undefined;
let inferenceQueue:Promise<unknown>=Promise.resolve();
export const localEmbedder:Embedder={
  async ready(){return(await load()).device;},
  async embed(texts){const operation=inferenceQueue.then(async()=>{const model=await load();return model.run(texts);});inferenceQueue=operation.catch(()=>{});return operation;}
};
async function load(){
  if(extractor)return extractor;
  extractor=(async()=>{
    if(typeof document==='undefined'||location.protocol==='file:')throw new Error('Open the Asterloom desktop application to use its bundled local retrieval model.');
    const base=new URL('./retrieval/',document.baseURI).href;
    const response=await fetch(`${base}manifest.json`,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('The local retrieval bundle is unavailable. Exact word search is active.');
    const manifest=await response.json();if(manifest.model!==RETRIEVAL_MODEL||manifest.revision!==RETRIEVAL_REVISION||manifest.transformersVersion!=='4.3.0')throw new Error('The local retrieval bundle does not match this studio version.');
    const {AutoTokenizer,AutoModel,FeatureExtractionPipeline,env}=await import(/* @vite-ignore */ `${base}transformers.min.js`) as typeof import('@huggingface/transformers');
    env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL(`${base}models/${RETRIEVAL_REVISION}/`).pathname;
    // Bundled assets already exist offline. Transformers' WASM cache rewrites the factory
    // into a blob module, which the native app deliberately excludes from script-src.
    // Keep the pinned same-origin factory URL and let ORT load it directly instead.
    env.useWasmCache=false;
    // Cache API only accepts HTTP(S) request keys, not the native asterloom: protocol.
    env.useBrowserCache=location.protocol==='http:'||location.protocol==='https:';env.useFSCache=false;
    if(env.backends.onnx.wasm){env.backends.onnx.wasm.wasmPaths={mjs:`${base}wasm/ort-wasm-simd-threaded.asyncify.mjs`,wasm:`${base}wasm/ort-wasm-simd-threaded.asyncify.wasm`};env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;}
    // Explicit local components avoid the convenience pipeline's remote repository-file discovery.
    const tokenizer=await AutoTokenizer.from_pretrained(RETRIEVAL_MODEL,{local_files_only:true});
    const make=async(device:'webgpu'|'wasm')=>new FeatureExtractionPipeline({task:'feature-extraction',tokenizer,model:await AutoModel.from_pretrained(RETRIEVAL_MODEL,{device,dtype:'q8',local_files_only:true})});
    let device:'webgpu'|'wasm'='wasm';let model;
    try{const gpu=(navigator as Navigator & {gpu?:{requestAdapter():Promise<unknown>}}).gpu;if(gpu&&await gpu.requestAdapter()){model=await make('webgpu');device='webgpu';}}catch{/* Unsupported WebGPU operator/adapter: use the matched single-threaded WASM runtime. */}
    if(!model)model=await make('wasm');
    const run=async(texts:string[])=>{
      const output=await model(texts,{pooling:'mean',normalize:true});const vectors=output.tolist() as number[][];
      if(vectors.length!==texts.length||vectors.some(v=>v.length!==384||v.some(n=>!Number.isFinite(n))))throw new Error('The local model returned invalid embeddings.');
      return vectors;
    };
    return{run,device};
  })();
  try{return await extractor;}catch(error){extractor=undefined;throw error;}
}
