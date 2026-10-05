import {normalizeAIUsage} from './ai-usage.mjs';

const ERRORS={
 PROVIDER_TIMEOUT:[504,'The AI did not finish within this request’s time limit. Asterloom canceled the local request. Continue from your saved stage.',true],
 PROVIDER_CANCELED:[499,'The AI request was canceled. Saved stages are kept.',false],
 PROVIDER_TRUNCATED:[502,'The AI reached its output limit before completing this stage. Use a smaller mission request; saved stages are kept.',true],
 PROVIDER_BUSY:[409,'A request is still stopping or running in this AI connection. Wait for it to finish, then continue.',true],
 PROVIDER_AUTH_REQUIRED:[401,'Reconnect this AI account or check its API key before continuing.',false],
 PROVIDER_MODEL_UNAVAILABLE:[422,'The selected model is unavailable to this connection. Refresh the model list and choose an available model.',false],
 PROVIDER_RATE_LIMIT:[429,'The provider’s usage limit was reached. Check available usage and retry after the provider allows it.',true],
 PROVIDER_QUOTA:[429,'The provider reported insufficient quota. Check your plan or billing before continuing.',false],
 PROVIDER_UNAVAILABLE:[502,'The AI service could not complete the request. Check the connection and try continuing from the saved stage.',true],
 PROVIDER_INVALID_RESPONSE:[502,'The AI returned an unreadable or incomplete response. Saved stages are kept.',true],
 PROVIDER_REFUSAL:[422,'The provider declined this request. Review the supplied material or choose another supported model.',false],
};
export function generationError(code,{usage,finishReason}={}){const [status,message,retryable]=ERRORS[code]||ERRORS.PROVIDER_INVALID_RESPONSE;return Object.assign(new Error(message),{status,code:ERRORS[code]?code:'PROVIDER_INVALID_RESPONSE',publicMessage:true,retryable,truncated:code==='PROVIDER_TRUNCATED',...(finishReason?{finishReason}:{}),...(usage?{aiUsage:usage}:{})});}
export function generationFailure(error,provider=''){
 if(ERRORS[error?.code])return error;
 let code=error?.status===409?'PROVIDER_BUSY':error?.status===504?'PROVIDER_TIMEOUT':error?.name==='AbortError'?'PROVIDER_CANCELED':error?.status===401?'PROVIDER_AUTH_REQUIRED':'PROVIDER_UNAVAILABLE';
 // Only inspect app-authored messages. Raw provider diagnostics never become public.
 if(error?.publicMessage===true){if(/sign in|sign-in|connect your|connect.*account|not authenticated/i.test(error.message))code='PROVIDER_AUTH_REQUIRED';else if(/model.*not available|choose.*model|select.*model/i.test(error.message))code='PROVIDER_MODEL_UNAVAILABLE';else if(/timed out/i.test(error.message))code='PROVIDER_TIMEOUT';else if(/canceled/i.test(error.message))code='PROVIDER_CANCELED';else if(/output limit|response limit|exceeded.*output/i.test(error.message))code='PROVIDER_TRUNCATED';}
 return generationError(code,{usage:error?.aiUsage||normalizeAIUsage(provider,null)});
}
export function providerHttpFailure(provider,status,result){
 const specific=typeof result?.error?.code==='string'?result.error.code:'';
 const code=['insufficient_quota','credit_balance_too_low'].includes(specific)?'PROVIDER_QUOTA':status===401?'PROVIDER_AUTH_REQUIRED':status===403||status===404||['model_not_found','invalid_model'].includes(specific)?'PROVIDER_MODEL_UNAVAILABLE':status===429?'PROVIDER_RATE_LIMIT':status===408||status===504?'PROVIDER_TIMEOUT':status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_INVALID_RESPONSE';
 return generationError(code,{usage:normalizeAIUsage(provider,result?.usage)});
}
export function completionMetadata(provider,result){
 const reason=provider==='openai'?(result.status==='incomplete'?result.incomplete_details?.reason:result.status):provider==='anthropic'?result.stop_reason:result.choices?.[0]?.finish_reason;
 if(['length','max_tokens','max_output_tokens','model_context_window_exceeded'].includes(reason))throw generationError('PROVIDER_TRUNCATED',{usage:normalizeAIUsage(provider,result.usage),finishReason:reason});
 if(['content_filter','refusal'].includes(reason))throw generationError('PROVIDER_REFUSAL',{usage:normalizeAIUsage(provider,result.usage),finishReason:reason});
 if(provider==='openai'&&result.status!=='completed'||provider==='anthropic'&&reason&&!['end_turn','stop_sequence'].includes(reason)||!['openai','anthropic'].includes(provider)&&reason&&reason!=='stop')throw generationError('PROVIDER_INVALID_RESPONSE',{usage:normalizeAIUsage(provider,result.usage),finishReason:'incomplete'});
 return {finishReason:typeof reason==='string'?reason:'unknown',truncated:false};
}
export function generationTimeout(input){const value=input?.timeoutMs;if(value!==undefined&&(!Number.isSafeInteger(value)||value<1000||value>600000))throw Object.assign(new Error('Choose an AI request timeout between 1 and 600 seconds.'),{status:400,code:'INVALID_REQUEST',publicMessage:true});return value??300000;}
export async function withGenerationControl(input,request,response,work){
 const timeoutMs=generationTimeout(input),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(generationError('PROVIDER_TIMEOUT')),timeoutMs);timer.unref?.();
 const disconnected=()=>{if(!response.writableEnded)controller.abort(generationError('PROVIDER_CANCELED'));};
 request.once('aborted',disconnected);response.once('close',disconnected);
 try{if(request.aborted||response.destroyed)disconnected();controller.signal.throwIfAborted();const result=await work({signal:controller.signal,timeoutMs});if(controller.signal.aborted){controller.signal.reason.aiUsage=result.usage;throw controller.signal.reason;}return result;}
 catch(error){if(controller.signal.aborted){const aborted=controller.signal.reason;aborted.aiUsage=error.aiUsage||normalizeAIUsage(input.provider,null);throw aborted;}if(error.status===400)throw error;throw generationFailure(error,input.provider);}
 finally{clearTimeout(timer);request.off('aborted',disconnected);response.off('close',disconnected);}
}
