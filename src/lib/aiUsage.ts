/** Provider measurements only. Null is unknown, never a zero-token claim. */
export interface AITokenUsage {
 status:'reported'|'partial'|'unavailable';
 inputTokens:number|null;
 outputTokens:number|null;
 cachedInputTokens:number|null;
 cacheWriteTokens:number|null;
 reasoningTokens:number|null;
 totalTokens:number|null;
}
export interface AIUsageReceipt {
 id:string;stage:string;batchId?:string;provider:string;model:string;actualModels?:string[];
 startedAt:string;status:'started'|'completed'|'failed'|'canceled';usage:AITokenUsage;
}
const metrics=['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','reasoningTokens','totalTokens'] as const;
export const unavailableAIUsage=():AITokenUsage=>({status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null});
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function validateAITokenUsage(value:unknown):AITokenUsage {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid AI token receipt.');
 const v=value as Record<string,unknown>;
 const usage=unavailableAIUsage();
 for(const key of metrics){if(v[key]!==null&&!count(v[key]))throw new Error('Invalid AI token count.');usage[key]=v[key] as number|null;}
 const status=usage.inputTokens!==null&&usage.outputTokens!==null?'reported':metrics.some(k=>usage[k]!==null)?'partial':'unavailable';
 if(v.status!==status)throw new Error('AI token reporting status does not match its measurements.');
 if(usage.inputTokens!==null&&((usage.cachedInputTokens??0)>usage.inputTokens||(usage.cacheWriteTokens??0)>usage.inputTokens))throw new Error('AI cache counts exceed reported input.');
 if(usage.outputTokens!==null&&(usage.reasoningTokens??0)>usage.outputTokens)throw new Error('AI reasoning count exceeds reported output.');
 return {...usage,status};
}
export function validateAIUsageReceipts(value:unknown):AIUsageReceipt[] {
 if(!Array.isArray(value)||value.length>10000)throw new Error('Invalid AI creation history.');
 const ids=new Set<string>();
 const field=(v:unknown,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Invalid AI receipt label.');return v;};
 return value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid AI creation receipt.');
  const r=raw as Record<string,unknown>,id=field(r.id);
  if(ids.has(id))throw new Error('Repeated AI receipt identifier.');ids.add(id);
  if(!['started','completed','failed','canceled'].includes(String(r.status)))throw new Error('Invalid AI request state.');
  const startedAt=field(r.startedAt,40);if(!Number.isFinite(Date.parse(startedAt)))throw new Error('Invalid AI request time.');
  if(r.actualModels!==undefined&&(!Array.isArray(r.actualModels)||r.actualModels.length>20))throw new Error('Invalid model report.');
  return {id,stage:field(r.stage,100),...(r.batchId!==undefined?{batchId:field(r.batchId)}:{}),provider:field(r.provider,40),model:field(r.model),...(Array.isArray(r.actualModels)?{actualModels:r.actualModels.map(v=>field(v))}:{}),startedAt,status:r.status as AIUsageReceipt['status'],usage:validateAITokenUsage(r.usage)};
 });
}
/** Replace one immutable request's latest receipt without counting it twice. */
export function upsertAIUsageReceipt(receipts:AIUsageReceipt[]|undefined,receipt:AIUsageReceipt):AIUsageReceipt[] {
 const [checked]=validateAIUsageReceipts([receipt]),existing=receipts??[],prior=existing.find(item=>item.id===checked.id);
 if(prior&&(['stage','provider','model','startedAt','batchId'] as const).some(key=>prior[key]!==checked[key]))throw new Error('The AI request identity changed.');
 if(prior&&prior.status!=='started'&&checked.status==='started')throw new Error('A finished AI request cannot restart.');
 return validateAIUsageReceipts(prior?existing.map(item=>item.id===checked.id?checked:item):[...existing,checked]);
}
/** Sum only reported values. Missing requests stay visible alongside known subtotals. */
export function summarizeAIUsage(receipts:AIUsageReceipt[]){
 const unique=[...new Map(receipts.map(r=>[r.id,r])).values()];
 const sum=(key:typeof metrics[number])=>{const known=unique.filter(r=>r.usage[key]!==null);return {value:known.length?known.reduce((n,r)=>n+r.usage[key]!,0):null,reported:known.length,missing:unique.length-known.length};};
 return {requests:unique.length,input:sum('inputTokens'),output:sum('outputTokens'),cached:sum('cachedInputTokens'),cacheWrite:sum('cacheWriteTokens'),reasoning:sum('reasoningTokens'),total:sum('totalTokens'),uncertain:unique.filter(r=>r.status!=='completed').length};
}
