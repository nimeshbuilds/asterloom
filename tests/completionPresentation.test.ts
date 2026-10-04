import {describe,it,expect} from 'vitest';
import {COMPLETION_EXAMPLES} from '../src/lib/extendedExamples';
import {initialCompletionResponse,evaluateCompletion} from '../src/lib/completionEngine';
import {emptyProgress} from '../src/lib/storage';
import {parseProgress,serializeProgress} from '../src/lib/package';
describe('completion construction state',()=>{
 it('restores the selected source piece and partial model from a portable progress record',()=>{
  const activity=COMPLETION_EXAMPLES[0],response={...initialCompletionResponse(activity),selectedTokenId:'interpretation'};response.slotTokens.measurement='observation';
  const progress={...emptyProgress('completion-notebook'),structured:{[activity.id]:{response,completed:false,score:0,maxScore:2,attempts:0,updatedAt:'2026-10-04T00:00:00.000Z'}}};
  const restored=parseProgress(serializeProgress(progress));expect(initialCompletionResponse(activity,restored.structured?.[activity.id].response)).toEqual(response);expect(restored.xp).toBe(0);expect(evaluateCompletion(activity,response).valid).toBe(false);
 });
 it('does not turn a selected piece or a fully filled wrong model into correctness',()=>{
  const activity=COMPLETION_EXAMPLES[0];const response={selectedTokenId:'observation',slotTokens:{measurement:'interpretation',proposal:'observation'}};
  expect(initialCompletionResponse(activity,{...response,selectedTokenId:'unknown'}).selectedTokenId).toBeUndefined();expect(evaluateCompletion(activity,response)).toMatchObject({valid:true,correct:false,score:0});
  expect(evaluateCompletion(activity,{...response,slotTokens:{measurement:'observation',proposal:'interpretation'}})).toMatchObject({valid:true,correct:true,score:2});
 });
 it('keeps a reusable selected piece while retaining the declared pattern and alternative grading',()=>{
  const activity=COMPLETION_EXAMPLES[1],response={selectedTokenId:'circle',slotTokens:{'position-1':'circle','position-2':'circle','position-3':'triangle'}};
  expect(evaluateCompletion(activity,response).correct).toBe(true);expect(initialCompletionResponse(activity,JSON.parse(JSON.stringify(response)))).toEqual(response);
  const alternative=structuredClone(COMPLETION_EXAMPLES[0]);alternative.tokens.push({id:'measurement-note',label:'a measured observation'});alternative.slots[0].acceptedTokenIds.push('measurement-note');
  expect(evaluateCompletion(alternative,{selectedTokenId:'measurement-note',slotTokens:{measurement:'measurement-note',proposal:'interpretation'}}).correct).toBe(true);
 });
});
