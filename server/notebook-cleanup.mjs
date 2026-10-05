import {ASSET_ID,MediaError} from './media-assets.mjs';

export function validateNotebookCleanup(input){
 if(!input||typeof input!=='object'||typeof input.notebookId!=='string'||!input.notebookId||input.notebookId.length>200||/[\x00-\x1f]/.test(input.notebookId))throw new MediaError(400,'INVALID_NOTEBOOK','Choose a valid notebook to remove.');
 for(const key of ['assetIds','retainedAssetIds'])if(!Array.isArray(input[key])||input[key].length>10000||input[key].some(id=>typeof id!=='string'||!ASSET_ID.test(id)))throw new MediaError(400,'INVALID_ASSET','The recording cleanup list is invalid.');
 if(input.dryRun!==undefined&&typeof input.dryRun!=='boolean')throw new MediaError(400,'INVALID_REQUEST','Choose a valid cleanup operation.');
 return {notebookId:input.notebookId,assetIds:[...new Set(input.assetIds)],retainedAssetIds:new Set(input.retainedAssetIds),dryRun:input.dryRun===true};
}
/** Only the service's own mutable asset store is eligible. Bundled files and
 * matching hashes in another notebook are preserved. No filesystem paths enter. */
export async function cleanupNotebookMedia(input,{store,jobs}){
 const request=validateNotebookCleanup(input),candidates=request.assetIds.filter(id=>!request.retainedAssetIds.has(id));
 const result={removedAssets:0,removedBytes:0,removedJobs:0,exclusiveMediaBytes:0,exclusiveMediaCount:0,sharedAssets:request.assetIds.length-candidates.length,bundledAssets:0,warnings:[]};
 for(const id of candidates){
  try{
   if(!request.dryRun)result.removedJobs+=await jobs.removeAssets([id],{hold:true});
   let item;try{item=await store.lookup(id);}catch(error){if(error.code==='ASSET_NOT_FOUND')continue;throw error;}
   if(item.bundled){result.bundledAssets++;continue;}
   result.exclusiveMediaBytes+=item.asset.size;result.exclusiveMediaCount++;
   if(request.dryRun)continue;
   await store.remove(id);result.removedAssets++;result.removedBytes+=item.asset.size;
  }catch{result.warnings.push('A recording or transcription could not be removed. Retry cleanup after its current operation finishes.');}finally{if(!request.dryRun)jobs.releaseAssets?.([id]);}
 }
 return result;
}
