import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChatGPTConnection,parseCompletedResponse,verifyIdentity} from './chatgpt-auth.mjs';
import {listProviderModels} from './index.mjs';
const event=x=>`data: ${JSON.stringify(x)}\n\n`;
test('incomplete and failed paid streams never become usable drafts',()=>{
 const delta=event({type:'response.output_text.delta',delta:'{"activity":{}}'});
 assert.throws(()=>parseCompletedResponse(delta),/before a complete/);
 assert.throws(()=>parseCompletedResponse(delta+event({type:'response.failed'})),/could not complete/);
 assert.equal(parseCompletedResponse(delta+event({type:'response.completed',response:{status:'completed'}})).text,'{"activity":{}}');
});
test('verified identity binds nonce and JWT verifier claims',async()=>{
 await assert.rejects(verifyIdentity('token','client','expected',async()=>({payload:{nonce:'wrong',sub:'person'}})),/verified/);
 const id=await verifyIdentity('token','client','nonce',async(token,keys,options)=>{assert.equal(options.issuer,'https://auth.openai.com');assert.equal(options.audience,'client');assert.ok(options.requiredClaims.includes('exp'));return {payload:{nonce:'nonce',sub:'person',email:'learner@example.test'}};});assert.equal(id.subject,'person');
});
test('OAuth gating, PKCE, state, issued client, encrypted-store contract and logout',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'asterloom-oauth-test-'));let saved,exchange,identity;
 const disabled=await createChatGPTConnection({dataDir:dir});await assert.rejects(disabled.start(),/eligibility/);disabled.close();
 const connection=await createChatGPTConnection({dataDir:dir,enabled:true,credentialStore:{load:async()=>null,save:async value=>{saved=value;}},fetcher:async(url,options)=>{exchange=new URLSearchParams(options.body);assert.equal(url,'https://auth.openai.com/api/accounts/oauth/token');return {ok:true,json:async()=>({access_token:'secret-access',refresh_token:'secret-refresh',id_token:'signed',token_type:'Bearer',scope:'chatgpt.tokens.use.direct',expires_in:3600})};},verify:async(token,client,nonce)=>{identity={token,client,nonce};return {subject:'person'};}});
 try{const {authUrl}=await connection.start(),auth=new URL(authUrl),redirect=auth.searchParams.get('redirect_uri');assert.equal(auth.hostname,'auth.openai.com');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('client_id'),'dynamic_agent_client');assert.match(auth.searchParams.get('ext_agent_host_id'),/^urn:uuid:/);
 assert.equal((await fetch(redirect+'?state=wrong&code=example')).status,400);assert.equal(connection.status().pending,true);
 const callback=new URL(redirect);callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('code','one-time');callback.searchParams.set('client_id','oaiapp_test');assert.equal((await fetch(callback)).status,200);
 assert.equal(exchange.get('redirect_uri'),redirect);assert.equal(exchange.get('client_id'),'oaiapp_test');assert.ok(exchange.get('code_verifier'));assert.equal(identity.nonce,auth.searchParams.get('nonce'));assert.equal(saved.accessToken,'secret-access');assert.equal(connection.status().connected,true);assert.ok(!JSON.stringify(connection.status()).includes('secret'));await connection.disconnect();assert.equal(saved,null);assert.equal(connection.status().connected,false);
 }finally{connection.close();await rm(dir,{recursive:true,force:true});}
});
test('live model catalog supports provider schemas, pagination and hides tokens',async()=>{
 let count=0;const request=async(url,options)=>{assert.equal(options.headers['x-api-key'],'private-key');count++;return {status:200,body:Buffer.from(JSON.stringify(count===1?{data:[{id:'one',display_name:'One'}],has_more:true,last_id:'one'}:{data:[{id:'two'}],has_more:false}))};};const result=await listProviderModels({provider:'anthropic',apiKey:'private-key'},{request});assert.equal(count,2);assert.deepEqual(result.models.map(x=>x.id),['one','two']);assert.ok(!JSON.stringify(result).includes('private-key'));
 const chat=await listProviderModels({provider:'chatgpt'},{connection:{models:async()=>({models:[{id:'shown',name:'Shown'}]})}});assert.deepEqual(chat.models,[{id:'shown',name:'Shown'}]);
});
test('model discovery rejects unsafe custom endpoints and redacts provider diagnostics',async()=>{
 await assert.rejects(listProviderModels({provider:'compatible',baseUrl:'http://169.254.169.254'}),/HTTPS/);
 await assert.rejects(listProviderModels({provider:'compatible',baseUrl:'https://user:password@example.com'}),/credentials/);
 await assert.rejects(listProviderModels({provider:'openai',apiKey:'sensitive'},{request:async()=>({status:401,body:Buffer.from('secret diagnostic')})}),e=>!e.message.includes('secret')&&e.message.includes('401'));
});

test('disconnect invalidates an in-flight code exchange and cannot reconnect later',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'asterloom-auth-race-'));let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);let saved=null;
 const connection=await createChatGPTConnection({dataDir:dir,enabled:true,credentialStore:{load:async()=>null,save:async v=>{saved=v;}},verify:async()=>({subject:'user'}),fetcher:async()=>{started();await gate;return {ok:true,json:async()=>({access_token:'secret',id_token:'signed',token_type:'Bearer',scope:'chatgpt.tokens.use.direct'})};}});
 try{const auth=new URL((await connection.start()).authUrl),callback=new URL(auth.searchParams.get('redirect_uri'));callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('client_id','issued-client');callback.searchParams.set('code','code');const response=fetch(callback);await ready;await connection.disconnect();release();assert.equal((await response).status,400);assert.equal(saved,null);assert.equal(connection.status().connected,false);}finally{await connection.close();await rm(dir,{recursive:true,force:true});}
});
test('disconnect is final even while encrypted credential storage is writing',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'asterloom-store-race-'));let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);let saved=null;
 const connection=await createChatGPTConnection({dataDir:dir,enabled:true,credentialStore:{load:async()=>null,save:async v=>{if(v){started();await gate;}saved=v;}},verify:async()=>({subject:'user'}),fetcher:async()=>({ok:true,json:async()=>({access_token:'secret',id_token:'signed',token_type:'Bearer',scope:'chatgpt.tokens.use.direct'})})});
 try{const auth=new URL((await connection.start()).authUrl),callback=new URL(auth.searchParams.get('redirect_uri'));callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('client_id','issued-client');callback.searchParams.set('code','code');const response=fetch(callback);await ready;const out=connection.disconnect();release();await out;assert.equal((await response).status,400);assert.equal(saved,null);assert.equal(connection.status().connected,false);}finally{await connection.close();await rm(dir,{recursive:true,force:true});}
});
