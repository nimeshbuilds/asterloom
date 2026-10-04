import path from 'node:path';
import {createAssetStore,MediaError,ASSET_ID} from './media-assets.mjs';
import {createMediaRuntime} from './media-runtime.mjs';
import {createTranscriptionJobs} from './media-jobs.mjs';
export function publicAsset(asset){const {id,name,mime,size,sha256,duration}=asset;return {id,name,mime,size,sha256,...duration===undefined?{}:{duration}};}
async function jsonBody(request){let text='';for await(const chunk of request){text+=chunk;if(text.length>8192)throw new MediaError(413,'REQUEST_SIZE','This request is too large.');}try{return JSON.parse(text||'{}');}catch{throw new MediaError(400,'INVALID_JSON','The request is not valid JSON.');}}
export async function createMediaService({directory,bundledDirectory,modelDirectory=path.join(directory,'models'),runtime,maxAssetBytes,reserveBytes,run,maxDuration}={}){
 const store=await createAssetStore({directory:path.join(directory,'assets'),bundledDirectory,maxAssetBytes,reserveBytes});const speech=await createMediaRuntime({modelDirectory,runtime});const jobs=await createTranscriptionJobs({directory:path.join(directory,'jobs'),store,runtime:speech,run,maxDuration});
 async function status(){return {...await speech.status(),maxAssetBytes:store.maxAssetBytes,maxDurationSeconds:maxDuration||7200,jobs:jobs.list(),storage:'local-content-addressed',modelSetup:'verified-first-use-download'};}
 async function handle(request,response,url){if(!url.pathname.startsWith('/api/media/'))return false;const send=(code,data)=>{response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(data));};
  try{
   if(request.method==='GET'&&url.pathname==='/api/media/status'){send(200,await status());return true;}
   if(request.method==='POST'&&url.pathname==='/api/media/assets'){let name;try{name=decodeURIComponent(request.headers['x-media-name']||'');}catch{throw new MediaError(400,'MEDIA_NAME','The media filename is invalid.');}const length=request.headers['content-length'];const asset=await store.ingest(request,{name,expectedBytes:length===undefined?undefined:Number(length)});send(201,{asset:publicAsset(asset)});return true;}
   const assetMatch=/^\/api\/media\/assets\/([a-f0-9]{64})(?:\/(metadata))?$/.exec(url.pathname);
   if(assetMatch){const id=assetMatch[1];if(['GET','HEAD'].includes(request.method)&&!assetMatch[2]){await store.serve(request,response,id);return true;}if(request.method==='GET'&&assetMatch[2]){send(200,{asset:publicAsset((await store.lookup(id)).asset)});return true;}if(request.method==='DELETE'&&!assetMatch[2]){await store.remove(id);send(200,{deleted:true});return true;}}
   if(request.method==='POST'&&url.pathname==='/api/media/transcriptions'){send(202,{job:await jobs.create(await jsonBody(request))});return true;}
   const jobMatch=/^\/api\/media\/transcriptions\/([a-f0-9-]{36})$/.exec(url.pathname);if(jobMatch){if(request.method==='GET'){send(200,{job:jobs.get(jobMatch[1])});return true;}if(request.method==='DELETE'){send(200,{job:await jobs.cancel(jobMatch[1])});return true;}}
   send(404,{error:'This media endpoint was not found.',code:'NOT_FOUND'});
  }catch(error){if(!response.headersSent&&!response.destroyed)send(error.status||500,{error:error instanceof MediaError?error.message:'The local media operation could not finish. Retry after checking available storage.',code:error.code||'MEDIA_ERROR'});else if(!response.destroyed)response.end();}
  return true;
 }
 return {handle,status,store,jobs,close:()=>jobs.close(),resolveAsset:async asset=>{if(!asset||!ASSET_ID.test(asset.id)||asset.sha256!==asset.id)throw new MediaError(400,'INVALID_ASSET','A valid media asset manifest is required.');const item=await store.lookup(asset.id);if(item.asset.size!==asset.size||item.asset.mime!==asset.mime)throw new MediaError(409,'ASSET_MISMATCH','The media metadata differs from the notebook manifest.');return item;}};
}
