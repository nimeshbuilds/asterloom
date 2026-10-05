// Normalized provider telemetry. Never infer tokens from string length or context capacity.
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export const unavailableAIUsage=()=>({status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null});
export function normalizeAIUsage(provider,raw){
 const result=unavailableAIUsage();if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
 if(provider==='grok')return result; // ACP usage_update.used/size measures context occupancy, not billed input/output.
 if(provider==='chatgpt'){
  // Every Asterloom request starts a fresh ephemeral thread: its total counts all model sampling in this turn.
  const total=raw.total;if(!total||typeof total!=='object')return result;
  result.inputTokens=count(total.inputTokens);result.outputTokens=count(total.outputTokens);
  result.cachedInputTokens=count(total.cachedInputTokens);result.reasoningTokens=count(total.reasoningOutputTokens);result.totalTokens=count(total.totalTokens);
 }else if(provider==='anthropic'||provider==='claude-code'){
  const base=count(raw.input_tokens),read=count(raw.cache_read_input_tokens),write=count(raw.cache_creation_input_tokens);
  // Missing cache fields make total input unknown: absent does not assert zero cache activity.
  result.inputTokens=base!==null&&read!==null&&write!==null?count(base+read+write):null;
  result.outputTokens=count(raw.output_tokens);result.cachedInputTokens=read;result.cacheWriteTokens=write;
 }else{
  result.inputTokens=count(raw.input_tokens??raw.prompt_tokens);result.outputTokens=count(raw.output_tokens??raw.completion_tokens);
  result.cachedInputTokens=count(raw.input_tokens_details?.cached_tokens??raw.prompt_tokens_details?.cached_tokens);
  result.cacheWriteTokens=count(raw.input_tokens_details?.cache_write_tokens);
  result.reasoningTokens=count(raw.output_tokens_details?.reasoning_tokens??raw.completion_tokens_details?.reasoning_tokens);
  result.totalTokens=count(raw.total_tokens);
 }
 if(result.inputTokens!==null){if(result.cachedInputTokens>result.inputTokens)result.cachedInputTokens=null;if(result.cacheWriteTokens>result.inputTokens)result.cacheWriteTokens=null;}
 if(result.outputTokens!==null&&result.reasoningTokens>result.outputTokens)result.reasoningTokens=null;
 if(result.inputTokens!==null&&result.outputTokens!==null)result.totalTokens=count(result.inputTokens+result.outputTokens);
 result.status=result.inputTokens!==null&&result.outputTokens!==null?'reported':Object.entries(result).some(([k,v])=>k!=='status'&&v!==null)?'partial':'unavailable';
 return result;
}
export function generationResult(provider,model,result){
 const actualModels=Array.isArray(result.actualModels)?result.actualModels.filter(v=>typeof v==='string'&&v.length<=200).slice(0,20):typeof result.model==='string'&&result.model&&result.model!==model?[result.model.slice(0,200)]:undefined;
 return {text:result.text,finishReason:result.finishReason||'completed',truncated:false,usage:normalizeAIUsage(provider,result.usage),provider,model,...(actualModels?.length?{actualModels}: {})};
}
