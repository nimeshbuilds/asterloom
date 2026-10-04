import { MAX_MEDIA_ASSET_BYTES, validateMediaAsset, type MediaAsset } from './mediaAssets';

export interface MediaUploadOptions { signal?: AbortSignal; onProgress?: (fraction:number)=>void }
let serviceCheck: Promise<boolean> | undefined;
export async function mediaServiceAvailable(): Promise<boolean> {
  if (typeof location === 'undefined' || location.protocol === 'file:') return false;
  serviceCheck ??= fetch('/api/health', {signal:AbortSignal.timeout(5000)})
    .then(response=>response.ok?response.json():null).then(value=>value?.capabilities?.mediaAssets===true).catch(()=>false);
  const available=await serviceCheck;
  if (!available) serviceCheck=undefined;
  return available;
}

/** XHR streams File bodies and reports byte progress, without a base64 copy in React state. */
export function uploadMediaAsset(file: File, mime: string, options:MediaUploadOptions={}): Promise<MediaAsset> {
  if (file.size<1 || file.size>MAX_MEDIA_ASSET_BYTES) return Promise.reject(new Error('Choose a recording up to 2 GB.'));
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    let settled=false;
    const finish=(error?:Error,value?:MediaAsset)=>{if(settled)return;settled=true;options.signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value!);};
    const cancel=()=>request.abort();
    request.open('POST','/api/media/assets');
    request.setRequestHeader('Content-Type',mime);
    request.setRequestHeader('X-Media-Name',encodeURIComponent(file.name));
    request.upload.onprogress=event=>{if(event.lengthComputable)options.onProgress?.(event.loaded/event.total);};
    request.onerror=()=>finish(new Error('The local recording service could not be reached. Your original file is unchanged.'));
    request.onabort=()=>finish(new DOMException('Recording import canceled.','AbortError'));
    request.onload=()=>{try{const result=JSON.parse(request.responseText);if(request.status<200||request.status>=300)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'Could not import this recording.');const asset=validateMediaAsset(result.asset);options.onProgress?.(1);finish(undefined,asset);}catch(error){finish(error instanceof Error?error:new Error(String(error)));}};
    if(options.signal?.aborted){finish(new DOMException('Recording import canceled.','AbortError'));return;}
    options.signal?.addEventListener('abort',cancel,{once:true});
    request.send(file);
  });
}
