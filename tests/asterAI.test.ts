import {afterEach,describe,expect,it,vi} from 'vitest';
import {askAsterAI,AsterAIError} from '../src/lib/asterAI';
import {askAster} from '../src/lib/asterKnowledge';
import {createNotebook,createSource} from '../src/lib/utils';
import {unavailableAIUsage} from '../src/lib/aiUsage';
import {isCurrentEvidence} from '../src/lib/evidence';
import {emptyProgress} from '../src/lib/storage';
import {parsePackage,serializePackage} from '../src/lib/package';

const config={provider:'compatible' as const,model:'selected-model',apiKey:'synthetic-private-key',baseUrl:'http://127.0.0.1:11434/v1'};
const usage={...unavailableAIUsage(),status:'reported' as const,inputTokens:612,outputTokens:73,cachedInputTokens:80,totalTokens:685};
const notebook=()=>createNotebook({sources:[createSource('Packet: a small unit of data. A packet carries a portion of the message.','Network notes'),createSource('Secret unrelated material about gardening.','Unrelated material')]});
const answer={insufficientEvidence:false,paragraphs:[{text:'A packet is a small unit carrying part of a message.',passageIds:['passage-1']}],actions:[{type:'open-source',passageId:'passage-1'},{type:'connect-ai'}]};
function respond(value:unknown=answer,options:{status?:number;telemetry?:unknown;extra?:Record<string,unknown>}={}){return new Response(JSON.stringify({text:JSON.stringify(value),usage:options.telemetry??usage,actualModels:['resolved-model'],...options.extra}),{status:options.status??200});}
function mock(value:unknown=answer){const fetch=vi.fn(async()=>respond(value));vi.stubGlobal('fetch',fetch);return fetch;}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('optional source-grounded Aster AI',()=>{
 it('keeps offline search fully local and makes no AI request merely from a connection or unmatched question',async()=>{
  const fetch=mock();const n=notebook();expect((await askAster(n,'packet')).status).toBe('found');expect(fetch).not.toHaveBeenCalled();
  const unsupported=await askAsterAI({notebook:n,question:'asteroid',config});expect(unsupported.status).toBe('not-supported');expect(unsupported.receipt).toBeUndefined();expect(unsupported.usage).toEqual(unavailableAIUsage());expect(fetch).not.toHaveBeenCalled();
  await expect(askAsterAI({notebook:n,question:'packet',config:{...config,model:''}})).rejects.toThrow('connection and model');expect(fetch).not.toHaveBeenCalled();
 });
 it('sends one bounded request, binds every answer/action to current evidence, and returns exact measured session usage',async()=>{
  const fetch=mock(),n=notebook(),before=JSON.stringify(n),result=await askAsterAI({notebook:n,question:'What is a packet?',config});expect(fetch).toHaveBeenCalledTimes(1);
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit],body=JSON.parse(init.body as string);expect(url).toBe('/api/generate');expect(body).toMatchObject({provider:'compatible',model:config.model,apiKey:config.apiKey,maxOutputTokens:1800,jsonMode:true});expect(body.requestId).toMatch(/^request-[a-f0-9-]{36}$/);expect(body.prompt.length).toBeLessThan(14000);expect(body.prompt).toContain('untrusted DATA');expect(body.prompt).toContain('not that your explanation is true');expect(body.prompt).not.toContain(config.apiKey);expect(body.prompt).not.toContain('Secret unrelated');
  expect(result).toMatchObject({status:'answered',answer:answer.paragraphs[0].text,usage,receipt:{stage:'aster-answer',status:'completed',provider:'compatible',model:config.model,actualModels:['resolved-model'],usage}});expect(result.citations).toHaveLength(1);expect(result.citations.every(ref=>isCurrentEvidence(ref,n.sources))).toBe(true);expect(result.actions).toEqual([{type:'open-source',label:'Open source',reference:result.citations[0]},{type:'connect-ai',label:'Choose AI connection'}]);expect(result.receipt!.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(n)).toBe(before);expect(JSON.stringify(result.receipt)).not.toMatch(/synthetic-private-key|What is a packet|small unit|baseUrl/);
  const exported=parsePackage(serializePackage(n));expect(JSON.stringify(exported)).not.toContain(config.apiKey);expect(exported.aiToolReceipts).toBeUndefined();
 });
 it.each(['chatgpt','claude-code','grok','openai','anthropic','xai','compatible'] as const)('reuses the selected %s connection without changing model or auto-installing',async provider=>{
  const fetch=mock();await askAsterAI({notebook:notebook(),question:'packet',config:{...config,provider}});expect(fetch).toHaveBeenCalledTimes(1);const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('/api/generate');expect(JSON.parse(init.body as string)).toMatchObject({provider,model:config.model,jsonMode:provider!=='anthropic'});
 });
 it('uses actual current mission controls and saved learning stage without sending answer keys or old creation logs',async()=>{
  const n=notebook(),s=n.sources[0];n.activities=[{version:1,id:'packet-order',kind:'sequence',title:'Order the source',instruction:'Put the stated steps in order.',explanation:'SECRET ANSWER KEY',hint:'SECRET HINT',reviewStatus:'reviewed',sourceRefs:[{sourceId:s.id,evidence:s.text}],items:[{id:'a',label:'Step A'},{id:'b',label:'Step B'}],constraints:[{before:'a',after:'b'}]}];
  const fetch=mock({...answer,actions:[{type:'open-current-help'}]});const result=await askAsterAI({notebook:n,question:'packet',activityId:'packet-order',progress:{...emptyProgress(n.id),xp:27},learningState:{title:'Packet lesson',phase:'lesson',lessonStage:'context',nextAction:'Read the next passage.'},config});const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body.prompt).toContain('Packet lesson');expect(body.prompt).toContain('Read the next passage');expect(body.prompt).not.toContain('Move earlier');expect(body.prompt).toContain('"journeyXp":27');expect(body.prompt).not.toMatch(/SECRET ANSWER KEY|SECRET HINT|"constraints"/);expect(result.actions).toEqual([{type:'open-current-help',label:'Help with this mission'}]);
 });
 it.each([
  {...answer,paragraphs:[{text:'Invented passage.',passageIds:['passage-999']}]},
  {...answer,paragraphs:[{text:'An uncited answer.',passageIds:[]}]},
  {...answer,paragraphs:[{text:'x'.repeat(701),passageIds:['passage-1']}]},
  {...answer,actions:[{type:'execute',command:'delete files'}]},
  {...answer,actions:[{type:'open-source',passageId:'passage-1',url:'https://hostile.example'}]},
  {...answer,actions:[{type:'open-current-help'}]},
  {...answer,score:9000},
  {...answer,paragraphs:[]},
 ].flatMap(value=>[false,true].map(insufficientEvidence=>({...value,insufficientEvidence}))))('rejects malformed citations and out-of-scope actions for full and partial answers while retaining measured usage',async value=>{
  const fetch=mock(value);try{await askAsterAI({notebook:notebook(),question:'packet',config});throw Error('Expected validation failure');}catch(error){expect(error).toBeInstanceOf(AsterAIError);expect((error as AsterAIError).receipt).toMatchObject({status:'failed',usage});}expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('accepts a cited explanation of missing information without inventing an answer or retrying',async()=>{
  const source=createSource('Condensation can form droplets on the outside of a cold container. This note does not specify what material the container is made of.','Water cycle note'),n=createNotebook({sources:[source]}),before=JSON.stringify(n);
  const partial={insufficientEvidence:true,paragraphs:[{kind:'source',text:'The note does not specify the container material. It describes droplets forming on the outside of a cold container.',passageIds:['passage-1'],contextIds:[]}],actions:[{type:'open-source',passageId:'passage-1'}]},fetch=mock(partial);
  const result=await askAsterAI({notebook:n,question:'What material is the container made of?',config});
  expect(result).toMatchObject({status:'answered',answer:partial.paragraphs[0].text,usage,receipt:{status:'completed',usage}});expect(result.citations).toHaveLength(1);expect(result.citations.every(ref=>isCurrentEvidence(ref,n.sources))).toBe(true);expect(result.citations[0].quote).toContain('does not specify');expect(result.actions).toEqual([{type:'open-source',label:'Open source',reference:result.citations[0]}]);expect(JSON.stringify(n)).toBe(before);expect(fetch).toHaveBeenCalledTimes(1);
  const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body.prompt).toContain('insufficientEvidence:true with that explanation and its citations');expect(body.prompt).toContain('all paragraph and action rules still apply');
 });
 it('returns a clear no-answer result when the model cannot support the question, without retrying',async()=>{
  const fetch=mock({insufficientEvidence:true,paragraphs:[],actions:[]});const result=await askAsterAI({notebook:notebook(),question:'packet',config});expect(result.status).toBe('not-supported');expect(result.citations).toEqual([]);expect(result.actions).toEqual([]);expect(result.receipt).toMatchObject({status:'completed',usage});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('rejects evidence that changes while a full or partial response is outstanding (insufficientEvidence=%s)',async insufficientEvidence=>{
  const n=notebook();vi.stubGlobal('fetch',vi.fn(async()=>{n.sources[0].text='Replaced source text.';return respond({...answer,insufficientEvidence});}));await expect(askAsterAI({notebook:n,question:'packet',config})).rejects.toThrow('source changed');
 });
 it('never exposes raw provider diagnostics, keeps failed measurements, and distinguishes unknown from zero',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>respond(answer,{status:502,extra:{error:'synthetic-private-key https://secret.example',code:'PROVIDER_UNAVAILABLE'}})));try{await askAsterAI({notebook:notebook(),question:'packet',config});throw Error('Expected error');}catch(error){expect((error as Error).message).not.toMatch(/private-key|secret.example/);expect((error as AsterAIError).receipt?.usage).toEqual(usage);}
  for(const telemetry of [{status:'reported',inputTokens:-1},{...unavailableAIUsage(),status:'reported',inputTokens:0,outputTokens:0,totalTokens:0}]){vi.stubGlobal('fetch',vi.fn(async()=>respond(answer,{telemetry})));const result=await askAsterAI({notebook:notebook(),question:'packet',config});expect(result.usage).toEqual(telemetry.inputTokens===0?telemetry:unavailableAIUsage());}
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('raw-private-key');}));await expect(askAsterAI({notebook:notebook(),question:'packet',config})).rejects.toThrow('connection ended');
 });
 it('cancels an uncooperative provider and does not accept its late answer',async()=>{
  const controller=new AbortController();let release!:(response:Response)=>void,started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);const fetch=vi.fn(()=>{started();return new Promise<Response>(resolve=>release=resolve);});vi.stubGlobal('fetch',fetch);const pending=askAsterAI({notebook:notebook(),question:'packet',config,signal:controller.signal});await ready;controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError',receipt:{status:'canceled',usage:unavailableAIUsage()}});release(respond());expect(fetch).toHaveBeenCalledTimes(1);
  const canceled=new AbortController();canceled.abort();await expect(askAsterAI({notebook:notebook(),question:'packet',config,signal:canceled.signal})).rejects.toMatchObject({name:'AbortError'});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('bounds an uncooperative request by a real deadline and retains a failed unknown-usage receipt',async()=>{
  vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(()=>{})));const pending=askAsterAI({notebook:notebook(),question:'packet',config,timeoutMs:1000});const assertion=expect(pending).rejects.toMatchObject({name:'AsterAIError',message:expect.stringContaining('too long'),receipt:{status:'failed',usage:unavailableAIUsage()}});await vi.advanceTimersByTimeAsync(1001);await assertion;
 });
});
