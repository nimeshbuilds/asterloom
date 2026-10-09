import {afterEach,describe,expect,it,vi} from 'vitest';
import {askAsterAI,AsterAIError} from '../src/lib/asterAI';
import {askAster} from '../src/lib/asterKnowledge';
import * as knowledge from '../src/lib/asterKnowledge';
import {asterTopicQuestion} from '../src/lib/asterRetrieval';
import {createNotebook,createSource} from '../src/lib/utils';
import {unavailableAIUsage} from '../src/lib/aiUsage';
import type {AsterAwarenessContext} from '../src/lib/asterAwareness';
const config={provider:'chatgpt' as const,model:'selected-model',apiKey:'secret-test-value',baseUrl:'https://private-endpoint.invalid'};
const usage={...unavailableAIUsage(),status:'reported' as const,inputTokens:430,outputTokens:41,totalTokens:471};
const paragraph=(text:string)=>({kind:'conversation',text,passageIds:[],contextIds:[]});
const response=(paragraphs:unknown[],actions:unknown[]=[])=>new Response(JSON.stringify({text:JSON.stringify({insufficientEvidence:false,paragraphs,actions}),usage}));
const readPrompt=(fetch:ReturnType<typeof vi.fn>,index=0)=>JSON.parse(JSON.parse(fetch.mock.calls[index][1].body).prompt.split('REFERENCE DATA (JSON):\n')[1]);
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('connected Aster conversation',()=>{
 it('answers the actual library identity question through the selected provider without an invented notebook or source',async()=>{
  const fetch=vi.fn(async()=>response([paragraph('My name is Aster. I’m your learning companion in Asterloom.')]));vi.stubGlobal('fetch',fetch);
  const result=await askAsterAI({question:'What is your name',config,awarenessContext:{mode:'library'}});
  expect(fetch).toHaveBeenCalledTimes(1);expect(result).toMatchObject({status:'answered',citations:[],usage,receipt:{status:'completed'}});expect(result.contextFingerprint).toBeUndefined();
  const data=readPrompt(fetch);expect(data.context.screen).toBe('library');expect(data.passages).toEqual([]);expect(data.context.aiSelection).toEqual({provider:'chatgpt',selectedModel:'selected-model',resolvedModelNotConfirmed:true});expect(JSON.parse(fetch.mock.calls[0][1].body).prompt).not.toMatch(/secret-test-value|private-endpoint/);
 });
 it.each(['Hi Aster','Thanks!','Can we talk?','I do not understand what you mean.'])('does not require source keywords for ordinary conversation: %s',async question=>{
  const fetch=vi.fn(async()=>response([paragraph('We can take it one step at a time. Which part would you like to explore?')]));vi.stubGlobal('fetch',fetch);
  const n=createNotebook({sources:[createSource('The catalog describes the tables and their fields.','Data notes')]});
  const result=await askAsterAI({notebook:n,question,config,awarenessContext:{notebook:n,mode:'world'}});expect(result.status).toBe('answered');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['Hi Aster','What is your name?','What is my score?','What is happening?'])('skips the semantic index for pure conversation/app guidance but still calls AI: %s',async question=>{
  const retrieval=vi.spyOn(knowledge,'askAster').mockRejectedValue(new Error('Source search should not run for this pure app question.'));
  const fetch=vi.fn(async()=>response([paragraph('I’m Aster. I can help with this app.')]));vi.stubGlobal('fetch',fetch);
  const n=createNotebook({sources:[createSource('A catalog stores metadata describing tables.','Data notes')]});
  await askAsterAI({notebook:n,question,config,awarenessContext:{notebook:n,mode:'world'}});expect(retrieval).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);expect(readPrompt(fetch).passages).toEqual([]);
 });
 it.each(['What is my score and what does a catalog store?','Explain the catalog creation state.'])('retains RAG for a mixed or ambiguous source question: %s',async question=>{
  const retrieval=vi.spyOn(knowledge,'askAster');const fetch=vi.fn(async()=>response([{kind:'source',text:'A catalog stores metadata describing tables.',passageIds:['passage-1']}]));vi.stubGlobal('fetch',fetch);
  const n=createNotebook({sources:[createSource('A catalog stores metadata describing tables.','Data notes')]});
  await askAsterAI({notebook:n,question,config,awarenessContext:{notebook:n,mode:'world'}});expect(retrieval).toHaveBeenCalledTimes(1);expect(readPrompt(fetch).passages).toHaveLength(1);
 });
 it('keeps four bounded conversational turns and marks earlier app state as historical',async()=>{
  const fetch=vi.fn(async()=>response([paragraph('You can call me Aster.')]));vi.stubGlobal('fetch',fetch);
  await askAsterAI({question:'What should I call you?',config,conversation:Array.from({length:6},(_,i)=>({question:'Question '+i,answer:'Reply '+i,citations:[],...(i===5?{contextFingerprint:'old-state'}:{})})),awarenessContext:{mode:'library'}});
  const data=readPrompt(fetch);expect(data.conversation).toHaveLength(4);expect(data.conversation.map((turn:any)=>turn.question)).toEqual(['Question 2','Question 3','Question 4','Question 5']);expect(data.conversation.at(-1).scope).toBe('historical-app-state');expect(data.context.screen).toBe('library');expect(data.passages).toEqual([]);
 });
 it('re-establishes an anchored follow-up from current sources, not the earlier generated explanation',async()=>{
  const n=createNotebook({sources:[createSource('A catalog stores metadata about tables. It does not store their underlying records.','Data notes')]}),refs=(await askAster(n,'catalog',{semantic:false})).passages.map(p=>p.reference);
  const fetch=vi.fn(async()=>response([{kind:'source',text:'The catalog describes tables; it does not hold their actual records.',passageIds:['passage-1']}]));vi.stubGlobal('fetch',fetch);
  const result=await askAsterAI({notebook:n,question:'What do you mean by that?',conversation:[{question:'What does a catalog store?',answer:'An earlier generated explanation.',citations:refs}],config});
  expect(result.status).toBe('answered');expect(result.citations.length).toBeGreaterThan(0);const data=readPrompt(fetch);expect(data.previousQuestion).toBe('What does a catalog store?');expect(data.passages[0].text).toContain('stores metadata');expect(data.passages[0].text).not.toContain('earlier generated');
 });
 it.each([
  [{kind:'source',text:'Uncited subject claim.',passageIds:[]}],
  [{kind:'source',text:'Invented source claim.',passageIds:['passage-1']}],
  [{kind:'current-state',text:'Invented current score.',passageIds:[],contextIds:[]}],
  [{kind:'conversation',text:'Mixed scope.',passageIds:[],contextIds:['current-state']}],
 ])('does not relax source/current-state grounding when no notebook is open',async paragraphs=>{
  const fetch=vi.fn(async()=>response(paragraphs));vi.stubGlobal('fetch',fetch);
  await expect(askAsterAI({question:'What is your name?',config,awarenessContext:{mode:'library'}})).rejects.toBeInstanceOf(AsterAIError);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('retains identity while live context changes, but does not make up current app actions',async()=>{
  let context:AsterAwarenessContext={mode:'library'};const fetch=vi.fn(async()=>{context={mode:'creation'};return response([paragraph('My name is Aster.')]);});vi.stubGlobal('fetch',fetch);
  const result=await askAsterAI({question:'What is your name?',config,readContext:()=>context});expect(result.contextFingerprint).toBeUndefined();expect(result.actions).toEqual([]);
  fetch.mockImplementation(async()=>response([paragraph('I can help you get started.')],[{type:'open-current-help'}]));await expect(askAsterAI({question:'Help me',config,readContext:()=>context})).rejects.toThrow('unsupported action');
 });
 it('does not dispatch empty or oversized questions',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);for(const question of ['','   ','x'.repeat(501)])await expect(askAsterAI({question,config})).rejects.toThrow('500 characters');expect(fetch).not.toHaveBeenCalled();
 });
});
describe('unambiguous conversational retrieval follow-ups',()=>{
 it.each(['Explain that','What do you mean by that?','Simplify.','More please','Can you teach that step by step?'])('keeps the preceding source topic for %s',question=>{
  expect(asterTopicQuestion(question,'How do queues and workers cooperate?').topicQuestion).toContain('queues and workers');
 });
 it.each(['Explain encryption','What do you mean by latency?','Can you teach databases step by step?','More about gardening please','What is your name?'])('does not steal a new subject for %s',question=>{
  expect(asterTopicQuestion(question,'How do queues and workers cooperate?')).toEqual({topicQuestion:question});
 });
});
