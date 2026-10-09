import {describe,it,expect} from 'vitest';
import {unavailableAIUsage,validateAITokenUsage,validateAIUsageReceipts,summarizeAIUsage,type AIUsageReceipt} from '../src/lib/aiUsage';
const receipt=(id:string,overrides:Partial<AIUsageReceipt>={}):AIUsageReceipt=>({id,stage:'plan',provider:'chatgpt',model:'selected-model',startedAt:'2026-10-04T10:00:00Z',status:'completed',usage:{...unavailableAIUsage(),status:'reported',inputTokens:100,outputTokens:20,cachedInputTokens:80,totalTokens:120},...overrides});
describe('honest AI usage ledger',()=>{
 it('deduplicates cache reuse and keeps missing requests visible',()=>{const r=receipt('a');const totals=summarizeAIUsage([r,r,receipt('b',{status:'canceled',usage:unavailableAIUsage()})]);expect(totals.requests).toBe(2);expect(totals.input).toEqual({value:100,reported:1,missing:1});expect(totals.output.value).toBe(20);expect(totals.total.value).toBe(120);expect(totals.uncertain).toBe(1);});
 it('does not add cached tokens to total input a second time',()=>{expect(summarizeAIUsage([receipt('a'),receipt('b')]).input.value).toBe(200);});
 it('preserves known zero and unknown as different values',()=>{const r=receipt('a',{usage:{...unavailableAIUsage(),status:'reported',inputTokens:0,outputTokens:0,totalTokens:0}});expect(summarizeAIUsage([r]).input.value).toBe(0);expect(summarizeAIUsage([r]).cached.value).toBeNull();expect(summarizeAIUsage([]).input.value).toBeNull();});
 it('rejects forged status, unsafe counts, invalid subsets, and duplicate request IDs on import',()=>{for(const inputTokens of [-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>validateAITokenUsage({...unavailableAIUsage(),inputTokens})).toThrow();expect(()=>validateAITokenUsage({...unavailableAIUsage(),status:'reported'})).toThrow();expect(()=>validateAITokenUsage({...receipt('a').usage,cachedInputTokens:101})).toThrow();expect(()=>validateAIUsageReceipts([receipt('a'),receipt('a')])).toThrow();});
 it('whitelists portable fields without keeping credentials or provider diagnostics',()=>{const result=validateAIUsageReceipts([{...receipt('a'),apiKey:'private',usage:{...receipt('a').usage,private:'source text'}}]);expect(JSON.stringify(result)).not.toMatch(/private|apiKey/);});
 it('preserves new measured request timing while leaving historical timing unknown',()=>{
  const old=receipt('legacy'),timed=receipt('timed',{finishedAt:'2026-10-04T10:00:02Z',durationMs:1234});
  expect(validateAIUsageReceipts([old,timed])).toEqual([old,timed]);
  expect(validateAIUsageReceipts([old])[0]).not.toHaveProperty('finishedAt');
  expect(validateAIUsageReceipts([old])[0]).not.toHaveProperty('durationMs');
 });
 it('rejects invented or unfinished request durations',()=>{
  for(const patch of [{durationMs:2},{finishedAt:'invalid',durationMs:2},{status:'started',finishedAt:'2026-10-04T10:00:02Z'},...[-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1].map(durationMs=>({finishedAt:'2026-10-04T10:00:02Z',durationMs}))])expect(()=>validateAIUsageReceipts([{...receipt('a'),...patch}])).toThrow();
 });
});
