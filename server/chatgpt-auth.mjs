import http from 'node:http';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';

const ISSUER='https://auth.openai.com';
const RESOURCE='https://api.openai.com/v1';
const jwks=createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const random=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const safeError=message=>Object.assign(new Error(message),{status:400});
export async function verifyIdentity(token,clientId,nonce,verify=jwtVerify){
 const {payload}=await verify(token,jwks,{issuer:ISSUER,audience:clientId,requiredClaims:['exp','iat','sub','nonce'],maxTokenAge:'1h'});
 if(!same(payload.nonce,nonce)||typeof payload.sub!=='string')throw safeError('The sign-in identity could not be verified. Start again.');
 return {subject:payload.sub,email:typeof payload.email==='string'?payload.email:undefined};
}
export function parseCompletedResponse(stream){
 let text='',usage=null,complete=false;
 for(const block of stream.replace(/\r\n/g,'\n').split('\n\n')){
  const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')continue;
  let event;try{event=JSON.parse(data);}catch{throw safeError('The provider returned an unreadable stream.');}
  if(['response.failed','response.incomplete','error'].includes(event.type))throw safeError('The provider could not complete this request. Check your access and usage limits.');
  if(event.type==='response.output_text.delta'&&typeof event.delta==='string')text+=event.delta;
  if(event.type==='response.completed'){if(event.response?.status&&event.response.status!=='completed')throw safeError('The provider did not complete the request.');complete=true;usage=event.response?.usage||null;}
 }
 if(!complete||!text)throw safeError('The provider stream ended before a complete response. Your notebook is unchanged.');
 return {text,usage};
}
export async function createChatGPTConnection({dataDir,credentialStore,enabled=false,fetcher=fetch,verify=verifyIdentity}={}){
 let record=null,pending=null,lastError='',refreshPromise,epoch=0;let writes=Promise.resolve();
 let hostId;try{hostId=await readFile(path.join(dataDir,'ai-host-id'),'utf8');}catch{}
 if(!/^urn:uuid:[a-f0-9-]{36}$/.test(hostId||'')){hostId=`urn:uuid:${randomUUID()}`;await writeFile(path.join(dataDir,'ai-host-id'),hostId,{mode:0o600});}
 if(credentialStore)try{const saved=await credentialStore.load();if(saved?.provider==='chatgpt'&&saved.clientId&&saved.subject&&saved.accessToken&&Array.isArray(saved.scopes))record=saved;}catch{lastError='Saved sign-in could not be unlocked. Sign in again.';}
 const status=()=>({enabled,connected:!!record,email:record?.email||null,pending:!!pending,error:lastError||null,persistent:!!credentialStore,reason:enabled?null:'ChatGPT plan sign-in requires provider eligibility for this distribution. API keys and assistant transfer are available.'});
 function store(next,expected=epoch){
  const operation=writes.catch(()=>{}).then(async()=>{if(expected!==epoch)return false;if(credentialStore)await credentialStore.save(next);if(expected!==epoch){if(credentialStore)await credentialStore.save(record);return false;}record=next;return true;});writes=operation;return operation;
 }
 async function tokenRequest(form){const r=await fetcher(`${ISSUER}/api/accounts/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw safeError('Sign-in could not be completed. Start again or check account eligibility.');const result=await r.json();if(typeof result.access_token!=='string'||result.token_type?.toLowerCase()!=='bearer')throw safeError('The provider did not return a usable sign-in token.');return result;}
 function cancel(){epoch++;if(pending){clearTimeout(pending.timer);pending.server.close();pending=null;}}
 async function start(){
  if(!enabled)throw safeError(status().reason);cancel();const attempt=epoch;lastError='';
  const state=random(),nonce=random(),verifier=random();
  const previous=record;const listener=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'");
   const expected=pending;
   if(!expected||req.method!=='GET'||req.headers.host!==`127.0.0.1:${listener.address()?.port}`){res.writeHead(400);res.end('Invalid callback.');return;}
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname!=='/auth/callback'||!same(url.searchParams.get('state'),state)){res.writeHead(400);res.end('Invalid sign-in state. Return to Asterloom.');return;}
   pending=null;clearTimeout(expected.timer);listener.close();
   try{
    if(url.searchParams.has('error'))throw safeError('Sign-in was canceled or not authorized.');
    const clientId=url.searchParams.get('client_id')||previous?.clientId;
    if(!clientId||clientId==='dynamic_agent_client'||(previous&&clientId!==previous.clientId))throw safeError('The sign-in registration did not match. Start again.');
    const code=url.searchParams.get('code');if(!code)throw safeError('The sign-in response did not include an authorization code.');
    const tokens=await tokenRequest({grant_type:'authorization_code',client_id:clientId,code,code_verifier:verifier,redirect_uri:expected.redirect,resource:RESOURCE});
    const identity=await verify(tokens.id_token,clientId,nonce);
    if(attempt!==epoch)throw safeError('The sign-in attempt was canceled.');
    if(previous&&identity.subject!==previous.subject)throw safeError('A different account was selected. Disconnect before switching accounts.');
    const scopes=(tokens.scope||'').split(' ');if(!scopes.includes('chatgpt.tokens.use.direct'))throw safeError('ChatGPT plan usage was not granted. API keys are available instead.');
    const stored=await store({provider:'chatgpt',clientId,...identity,accessToken:tokens.access_token,refreshToken:tokens.refresh_token,idToken:tokens.id_token,scopes,expiresAt:Date.now()+Math.max(1,Number(tokens.expires_in)||3600)*1000},attempt);
    if(!stored)throw safeError('The sign-in attempt was canceled.');
    res.end('Connected to Asterloom. You can close this page and return to your learning studio.');
   }catch{const message='Sign-in was not completed or verified. Check account eligibility and start again.';if(attempt===epoch)lastError=message;res.writeHead(400);res.end(message);}
  });
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const redirect=`http://127.0.0.1:${listener.address().port}/auth/callback`;
  const timer=setTimeout(()=>{lastError='Sign-in timed out. Start again.';cancel();},300000);timer.unref();
  pending={server:listener,timer,redirect};
  const url=new URL(`${ISSUER}/api/accounts/authorize`);
  const params={client_id:previous?.clientId||'dynamic_agent_client',ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),...(previous?.idToken?{id_token_hint:previous.idToken}:{agent_name_hint:'Asterloom'})};
  for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
  return {authUrl:url.href};
 }
 async function accessToken(){
  if(!enabled||!record)throw safeError('Sign in with ChatGPT before using this connection.');
  if(record.expiresAt>Date.now()+60000)return record.accessToken;
  if(!record.refreshToken)throw safeError('Your sign-in expired. Connect again.');
  if(!refreshPromise){const current=record,attempt=epoch;refreshPromise=(async()=>{const tokens=await tokenRequest({grant_type:'refresh_token',client_id:current.clientId,refresh_token:current.refreshToken,resource:RESOURCE});if(record!==current||attempt!==epoch)throw safeError('The account changed during renewal.');const scopes=tokens.scope?tokens.scope.split(' '):current.scopes;if(!scopes.includes('chatgpt.tokens.use.direct'))throw safeError('ChatGPT plan access was revoked.');const stored=await store({...current,accessToken:tokens.access_token,refreshToken:tokens.refresh_token||current.refreshToken,scopes,expiresAt:Date.now()+(Number(tokens.expires_in)||3600)*1000},attempt);if(!stored)throw safeError('The account was disconnected during renewal.');return record.accessToken;})().finally(()=>{refreshPromise=null;});}
  return refreshPromise;
 }
 return {status,start,cancel,accessToken,disconnect:async()=>{cancel();await store(null);lastError='';},close:async()=>{cancel();await writes;}};
}
