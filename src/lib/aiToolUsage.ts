import {unavailableAIUsage,validateAITokenUsage,validateAIUsageReceipts,type AIUsageReceipt} from './aiUsage';
import type {ProviderConfig} from './provider';

export type AIToolUsageObserver=(receipt:AIUsageReceipt)=>Promise<boolean>;
export interface TrackedAIToolOptions<T> {
 stage:'wording-refinement'|'activity-draft'|'image-generation';
 config:Pick<ProviderConfig,'provider'|'model'>;
 body:Record<string,unknown>;
 endpoint?:'/api/generate'|'/api/generate-image';
 signal?:AbortSignal;
 onAIUsage?:AIToolUsageObserver;
 readResult:(payload:Record<string,unknown>)=>T;
}
const stopped=()=>new DOMException('AI request canceled.','AbortError');
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Persist intent before spending provider usage. All later outcomes retain one receipt,
 * including rejected content, cancellation, unknown telemetry and failed requests. */
export async function requestTrackedAITool<T>(options:TrackedAIToolOptions<T>):Promise<T> {
 if(options.signal?.aborted)throw stopped();
 if(!options.onAIUsage)throw new Error('Save this game’s AI usage history before requesting a draft.');
 const [started]=validateAIUsageReceipts([{id:`tool-${crypto.randomUUID()}`,stage:options.stage,provider:options.config.provider,model:options.config.model,startedAt:new Date().toISOString(),status:'started',usage:unavailableAIUsage()}]);
 if(await options.onAIUsage(started)!==true)throw new Error('The AI request was not sent because its usage history could not be saved.');
 let usage=unavailableAIUsage(),actualModels:string[]|undefined,result:T|undefined,error:unknown,status:AIUsageReceipt['status']='completed';
 let abort:()=>void=()=>{};
 try {
  if(options.signal?.aborted)throw stopped();
  const response=await Promise.race([
   fetch(options.endpoint??'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:options.signal,body:JSON.stringify(options.body)}),
   new Promise<never>((_,reject)=>{abort=()=>reject(stopped());options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();})
  ]);
  const payload=object(await Promise.race([response.json(),new Promise<never>((_,reject)=>{options.signal?.removeEventListener('abort',abort);abort=()=>reject(stopped());options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();})]));
  try{usage=validateAITokenUsage(payload.tokenUsage??payload.usage);}catch{/* Missing/malformed provider counters stay unknown. */}
  actualModels=Array.isArray(payload.actualModels)?payload.actualModels.filter((value):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=200).slice(0,20):undefined;
  if(options.signal?.aborted)throw stopped();
  if(!response.ok){const raw=object(payload.error);throw new Error(typeof payload.error==='string'?payload.error:typeof raw.message==='string'?raw.message:'The selected provider could not complete this AI request.');}
  result=options.readResult(payload);
 }catch(caught){error=caught instanceof Error?caught:new Error('The AI request could not be completed.');status=options.signal?.aborted||caught instanceof Error&&caught.name==='AbortError'?'canceled':'failed';}
 finally{options.signal?.removeEventListener('abort',abort);}
 const finished:AIUsageReceipt={...started,status,usage,...(actualModels?.length?{actualModels}: {})};
 if(await options.onAIUsage(finished)!==true)throw new Error('The AI request finished, but its usage report could not be saved. Its saved request remains unconfirmed; retry saving your game before continuing.');
 if(error!==undefined)throw error;
 return result as T;
}
