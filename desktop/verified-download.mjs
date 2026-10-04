const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Bounded release-input download. Integrity/signature verification stays with the caller. */
export async function downloadReleaseBytes(url,{fetchImpl=fetch,maxBytes=80*1024**2,attempts=3,timeoutMs=45000,wait=pause,onRetry=()=>{}}={}){
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>4)throw new Error('Invalid release-download retry limit.');
 for(let attempt=1;attempt<=attempts;attempt++){
  let response;
  try{
   response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs)});
   if(!response.ok){const error=new Error(`Release download returned HTTP ${response.status}: ${new URL(url).hostname}`);error.retryable=response.status===408||response.status===429||response.status>=500;throw error;}
   const declared=response.headers.get('content-length');if(declared&&Number(declared)>maxBytes){const error=new Error('Release download exceeds its expected size limit.');error.retryable=false;throw error;}
   if(!response.body){const error=new Error('Release download returned no content.');error.retryable=false;throw error;}
   const chunks=[];let bytes=0;
   for await(const chunk of response.body){bytes+=chunk.length;if(bytes>maxBytes){const error=new Error('Release download exceeds its expected size limit.');error.retryable=false;throw error;}chunks.push(chunk);}
   return new Uint8Array(Buffer.concat(chunks,bytes));
  }catch(error){
   try{await response?.body?.cancel();}catch{}
   if(error.retryable===false||attempt===attempts)throw new Error(`Could not download verified release input from ${new URL(url).hostname} after ${attempt} attempt${attempt===1?'':'s'}: ${error.message}`,{cause:error});
   const delay=Math.min(4000,1000*2**(attempt-1));onRetry({attempt,delay,hostname:new URL(url).hostname});await wait(delay);
  }
 }
}
