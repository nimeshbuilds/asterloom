import {afterEach,describe,expect,it,vi} from 'vitest';
import {askAsterAI,AsterAIError} from '../src/lib/asterAI';
import {createNotebook,createSource} from '../src/lib/utils';
import {askAster} from '../src/lib/asterKnowledge';
import {emptyProgress} from '../src/lib/storage';
import type {AsterAwarenessContext} from '../src/lib/asterAwareness';
import {unavailableAIUsage} from '../src/lib/aiUsage';
const config={provider:'compatible' as const,model:'fixture',apiKey:''};
const source='A data catalog stores metadata describing tables. A query service uses that catalog to find the data. The catalog does not store the query results.';
const setup=()=>createNotebook({title:'Data workshop',sources:[createSource(source,'Workshop source')]});
const response=(paragraphs:unknown[])=>new Response(JSON.stringify({text:JSON.stringify({insufficientEvidence:false,paragraphs,actions:[]}),usage:{...unavailableAIUsage(),status:'reported',inputTokens:400,outputTokens:90,totalTokens:490}}));
const readPrompt=(fetch:ReturnType<typeof vi.fn>)=>JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).prompt.split('REFERENCE DATA (JSON):\n')[1]);
afterEach(()=>vi.unstubAllGlobals());
describe('Aster conversation and live context',()=>{
 it('passes the real creation state instead of pretending the learner is in a world',async()=>{
  const n=setup(),fetch=vi.fn(async()=>response([{text:'Creation is paused. You can change the AI connection, then resume.',passageIds:[],contextIds:['current-state']}]));vi.stubGlobal('fetch',fetch);
  const context:AsterAwarenessContext={notebook:n,mode:'creation',creationRunning:false,creationStage:'OLD RUNNING STAGE',creationState:{status:'paused',nextAction:'Choose Resume creation when you are ready.'}};
  const result=await askAsterAI({notebook:n,question:'Explain the data catalog and what I can do next.',config,awarenessContext:context});
  const data=readPrompt(fetch);expect(data.context.screen).toBe('creation');expect(data.context.summary).toMatch(/paused/i);expect(data.context.summary).not.toContain('OLD RUNNING STAGE');expect(result.contextFingerprint).toBeTruthy();expect(result.citations).toEqual([]);expect(result.receipt?.usage.inputTokens).toBe(400);
 });
 it('can explain live controls even when a natural app question matches no source passage',async()=>{
  const n={...setup(),sources:[]},fetch=vi.fn(async()=>response([{text:'Creation is paused. Choose Resume creation when you are ready.',passageIds:[],contextIds:['current-state']}]));vi.stubGlobal('fetch',fetch);
  const context:AsterAwarenessContext={notebook:n,mode:'creation',creationState:{status:'paused',nextAction:'Choose Resume creation when you are ready.'}};
  const result=await askAsterAI({notebook:n,question:'Where can I continue from the point I stopped?',config,awarenessContext:context});
  expect(readPrompt(fetch).passages).toEqual([]);expect(result.status).toBe('answered');expect(result.contextFingerprint).toBeTruthy();expect(result.citations).toEqual([]);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('rejects an invented source citation when only live context is available',async()=>{
  const n=setup();vi.stubGlobal('fetch',vi.fn(async()=>response([{text:'An invented explanation.',passageIds:['passage-1']}])));
  await expect(askAsterAI({notebook:n,question:'Where can I continue from the point I stopped?',config,awarenessContext:{notebook:n,mode:'creation'}})).rejects.toMatchObject({message:expect.stringContaining('not supplied'),receipt:{status:'failed'}});
 });
 it('takes its snapshot after retrieval and rejects a state-dependent answer when that state changes during the request',async()=>{
  const n=setup();let context:AsterAwarenessContext={notebook:n,mode:'play',progress:{...emptyProgress(n.id),xp:12},learningState:{title:'Catalog lesson',phase:'answering',nextAction:'Check my work'}};
  let complete!:(value:Response)=>void,started!:()=>void;const ready=new Promise<void>(r=>started=r);vi.stubGlobal('fetch',vi.fn(()=>{started();return new Promise<Response>(r=>complete=r);}));
  const pending=askAsterAI({notebook:n,question:'How does the catalog help in this task?',config,readContext:()=>context});await ready;
  context={...context,progress:{...emptyProgress(n.id),xp:32},learningState:{title:'Catalog lesson',phase:'feedback',nextAction:'Continue'}};
  complete(response([{text:'You have 12 XP and can check your work.',passageIds:[],contextIds:['current-state']}]));
  await expect(pending).rejects.toMatchObject({name:'AsterAIError',message:expect.stringContaining('activity changed'),receipt:{status:'failed',usage:{inputTokens:400}}});
 });
 it('retains a valid source-only explanation when unrelated progress changes',async()=>{
  const n=setup();let context:AsterAwarenessContext={notebook:n,mode:'play',progress:{...emptyProgress(n.id),xp:12}};
  vi.stubGlobal('fetch',vi.fn(async()=>{context={...context,progress:{...emptyProgress(n.id),xp:32}};return response([{text:'The catalog describes the tables; the query service uses it to locate data.',passageIds:['passage-1']}]);}));
  const result=await askAsterAI({notebook:n,question:'What does the catalog do?',config,readContext:()=>context});expect(result.status).toBe('answered');expect(result.contextFingerprint).toBeUndefined();expect(result.citations).toHaveLength(1);
 });
 it('retains bounded conversation only with current source citations and never treats previous replies as evidence',async()=>{
  const n=setup(),refs=(await askAster(n,'catalog',{semantic:false})).passages.map(p=>p.reference);
  const fetch=vi.fn(async()=>response([{text:'The catalog describes where the data is and what its tables contain.',passageIds:['passage-1']}]));vi.stubGlobal('fetch',fetch);
  await askAsterAI({notebook:n,question:'Explain that more simply.',previousQuestion:'What does a data catalog do?',config,conversation:[{question:'An earlier valid turn',answer:'OLD',citations:refs},{question:'What does a data catalog do?',answer:'Prior reply for conversational context',citations:refs},{question:'Invalid old source',answer:'OBSOLETE',citations:refs.map(ref=>({...ref,quote:'Changed source'}))}]});
  const data=readPrompt(fetch);expect(data.conversation).toEqual([{question:'An earlier valid turn',reply:'OLD',scope:'prior-source-explanation'},{question:'What does a data catalog do?',reply:'Prior reply for conversational context',scope:'prior-source-explanation'}]);expect(data.passages.every((p:any)=>p.text!==data.conversation[0].reply)).toBe(true);expect(JSON.parse(fetch.mock.calls[0][1].body).prompt).toContain('NOT evidence');
 });
 it.each([['invented-state'],['current-state','current-state'],['passage-1']])('rejects forged runtime evidence IDs %j',async contextIds=>{
  const n=setup();vi.stubGlobal('fetch',vi.fn(async()=>response([{text:'Invalid state claim',passageIds:[],contextIds}])));
  await expect(askAsterAI({notebook:n,question:'catalog',config})).rejects.toBeInstanceOf(AsterAIError);
 });
 it('keeps the original learner wording while retrieving a host-supplied current-topic query',async()=>{
  const n=setup(),fetch=vi.fn(async()=>response([{text:'A catalog holds descriptions of tables.',passageIds:['passage-1']}]));vi.stubGlobal('fetch',fetch);
  const result=await askAsterAI({notebook:n,question:'Explain this lesson.',retrievalQuestion:'Explain the data catalog.',config});expect(readPrompt(fetch).question).toBe('Explain this lesson.');expect(result.retrieval.question).toBe('Explain this lesson.');expect(result.retrieval.passages.length).toBeGreaterThan(0);
 });
});
