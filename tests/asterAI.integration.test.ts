import {afterEach,describe,expect,it,vi} from 'vitest';
import http from 'node:http';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createService} from '../server/index.mjs';
import {askAsterAI} from '../src/lib/asterAI';
import {createNotebook,createSource} from '../src/lib/utils';
import {parsePackage,serializePackage} from '../src/lib/package';

const answer=JSON.stringify({insufficientEvidence:false,paragraphs:[{kind:'source',text:'A packet is a small unit of data.',passageIds:['passage-1'],contextIds:[]}],actions:[{type:'open-source',passageId:'passage-1'}]});
const allText=async(root:string):Promise<string>=>{let text='';for(const entry of await readdir(root,{withFileTypes:true})){const full=path.join(root,entry.name);text+=entry.isDirectory()?await allText(full):await readFile(full,'utf8');}return text;};
afterEach(()=>vi.unstubAllGlobals());
describe('Aster answers through the bundled local service',()=>{
 it('uses the same subscription and API route with a portable notebook, preserves provider counters, and rejects remote/Tor callers',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'asterloom-aster-answer-')),calls:any[]=[];
  const engines=Object.fromEntries(['codex','claude','grok'].map(id=>[id,{status:async()=>({id,enabled:true,installed:true,connected:true,pending:false}),generate:async(input:any)=>{calls.push({id,input});return{text:answer,model:input.model,usage:id==='codex'?{total:{inputTokens:120,outputTokens:30,totalTokens:150}}:id==='claude'?{input_tokens:110,output_tokens:30,cache_read_input_tokens:10,cache_creation_input_tokens:0}:{used:150,size:20000}};},close:async()=>{}}]));
  let received:any;const model=http.createServer(async(request,response)=>{const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));received={url:request.url,authorization:request.headers.authorization,body:JSON.parse(Buffer.concat(chunks).toString())};response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:answer},finish_reason:'stop'}],usage:{prompt_tokens:120,completion_tokens:30,total_tokens:150}}));});
  await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));const address=model.address() as {port:number},origin=`http://127.0.0.1:${address.port}`,prior=process.env.LEARN_AI_ORIGINS;process.env.LEARN_AI_ORIGINS=origin;
  let service:any;
  try{
   const local={generate:async(input:any)=>{calls.push({id:'local',input});return{text:answer,actualModels:[input.model],usage:{prompt_tokens:120,completion_tokens:30}};},close:async()=>{}};
   service=await createService({port:0,dataDir:directory,engineConnections:engines,localConnection:local});const base=`http://127.0.0.1:${service.port}`,nativeFetch=globalThis.fetch;
   vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>nativeFetch(url==='/api/generate'?base+url:url,options));
   const notebook=parsePackage(serializePackage(createNotebook({sources:[createSource('Packet: a small unit of data.','Portable source')]}))),before=JSON.stringify(notebook);
   for(const [provider,id] of [['chatgpt','codex'],['claude-code','claude'],['grok','grok']] as const){
    const result=await askAsterAI({notebook,question:'What is a packet?',config:{provider,model:id+'-chosen',apiKey:''}});expect(result.status).toBe('answered');expect(result.receipt).toMatchObject({status:'completed',provider,model:id+'-chosen'});expect(calls.at(-1)).toMatchObject({id,input:{model:id+'-chosen',maxOutputTokens:1800}});expect(calls.at(-1).input.prompt).toContain('Packet: a small unit of data.');
    expect(result.usage).toMatchObject(id==='grok'?{status:'unavailable',inputTokens:null,outputTokens:null}:{status:'reported',inputTokens:120,outputTokens:30});
   }
   const localAnswer=await askAsterAI({notebook,question:'What is a packet?',config:{provider:'local',model:'local-test-model',apiKey:''}});
   expect(localAnswer.status).toBe('answered');expect(localAnswer.receipt).toMatchObject({provider:'local',status:'completed',actualModels:['local-test-model']});expect(localAnswer.usage).toMatchObject({inputTokens:120,outputTokens:30,totalTokens:150});
   expect(calls.at(-1)).toMatchObject({id:'local',input:{model:'local-test-model',outputSchema:{type:'object',required:['insufficientEvidence','paragraphs','actions']}}});expect(calls.at(-1).input.prompt).toContain('Packet: a small unit of data.');expect(localAnswer.citations[0].quote).toContain('Packet');
   const api=await askAsterAI({notebook,question:'What is a packet?',config:{provider:'compatible',model:'api-chosen',apiKey:'synthetic-session-only-secret',baseUrl:origin+'/v1'}});expect(api.status).toBe('answered');expect(api.usage).toMatchObject({inputTokens:120,outputTokens:30,totalTokens:150});expect(received).toMatchObject({url:'/v1/chat/completions',authorization:'Bearer synthetic-session-only-secret',body:{model:'api-chosen',max_tokens:1800,response_format:{type:'json_object'}}});expect(JSON.stringify(notebook)).toBe(before);
   const body={provider:'chatgpt',model:'codex-chosen',prompt:'must not be sent'},count=calls.length;
   const foreign=await nativeFetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example'},body:JSON.stringify(body)});expect(foreign.status).toBe(403);
   const onion=await nativeFetch(`http://127.0.0.1:${service.onionGatewayPort}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});expect(onion.status).toBe(403);expect(calls).toHaveLength(count);
   expect(await allText(directory)).not.toMatch(/synthetic-session-only-secret|What is a packet|Packet: a small unit/);
  }finally{vi.unstubAllGlobals();await service?.close();if(prior===undefined)delete process.env.LEARN_AI_ORIGINS;else process.env.LEARN_AI_ORIGINS=prior;model.closeAllConnections();await new Promise<void>(resolve=>model.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
 },20000);
});
