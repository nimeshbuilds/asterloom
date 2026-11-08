import {useEffect,useId,useRef,useState} from 'react';
import {ExternalLink,RefreshCw,ShieldCheck,KeyRound,Download,Check,LoaderCircle} from 'lucide-react';
import type {ProviderConfig} from '../lib/provider';
import {subscriptionLoginUrl,subscriptionStatuses,providerModelCatalog,claudeLoginContinuation,type ClaudeLoginContinuation,type SubscriptionEngineId,type SubscriptionEngineStatus} from '../lib/providerConnections';
import {api} from '../lib/imports';
import LocalModelConnection from './LocalModelConnection';
import './provider-connection.css';
type Model={id:string;name:string};
const engineNames={codex:'Codex · ChatGPT plan',grok:'Grok · SuperGrok plan',claude:'Claude Code · your account'};
const engineLabels={codex:'Codex',grok:'Grok',claude:'Claude Code'},loginLabels={codex:'ChatGPT',grok:'Grok',claude:'Claude'};
const providerFor=(id:SubscriptionEngineId)=>id==='codex'?'chatgpt':id==='grok'?'grok':'claude-code';
const isPlan=(provider:ProviderConfig['provider'])=>provider==='chatgpt'||provider==='grok'||provider==='claude-code';
export default function ProviderConnection({config,onChange,disabled=false,images=false}:{config:ProviderConfig;onChange:(v:ProviderConfig)=>void;disabled?:boolean;images?:boolean}){
 const [engines,setEngines]=useState<SubscriptionEngineStatus[]>([]),[connectionError,setConnectionError]=useState('');
 const [models,setModels]=useState<Model[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 type Login={id:SubscriptionEngineId;url?:string;code?:string;continuation?:ClaudeLoginContinuation};
 type ClaudeMethod='claudeai'|'console'|'sso';
 const [claudeMethod,setClaudeMethod]=useState<ClaudeMethod>('claudeai');
 type Flow={method?:ClaudeMethod;id:SubscriptionEngineId;token:number;selection:string;stage:'installing'|'starting'|'pending';opened?:boolean};
 const [action,setAction]=useState<SubscriptionEngineId|null>(null),[login,setLogin]=useState<Login|null>(null),[ending,setEnding]=useState(false);
 const [claudeCode,setClaudeCode]=useState(''),[sendingCode,setSendingCode]=useState(false),[codeError,setCodeError]=useState('');
 const claudeCodeInputId=useId(),claudeCodeInput=useRef<HTMLInputElement>(null);
 const epoch=useRef(0),latest=useRef(config),change=useRef(onChange),mounted=useRef(false),lifecycle=useRef(0);
 const authEpoch=useRef(0),statusEpoch=useRef(0),flow=useRef<Flow|null>(null),loginRef=useRef<Login|null>(null);
 const connectionFlight=useRef<{generation:number;life:number;promise:Promise<void>}|null>(null),pollFailures=useRef(0),nextPoll=useRef(0);
 latest.current=config;change.current=onChange;
 const signature=(value:ProviderConfig)=>JSON.stringify([value.provider,value.apiKey,value.baseUrl??'',value.model]);
 const identity=JSON.stringify([config.provider,config.apiKey,config.baseUrl]);
 const alive=(life:number)=>mounted.current&&lifecycle.current===life;
 const current=(token:number,life:number)=>alive(life)&&authEpoch.current===token;
 function choose(selected:ProviderConfig){latest.current=selected;change.current(selected);}
 function showLogin(value:Login|null){if(value?.id!==loginRef.current?.id||value?.continuation?.sessionId!==loginRef.current?.continuation?.sessionId){setClaudeCode('');setSendingCode(false);setCodeError('');}loginRef.current=value;setLogin(value);}
 useEffect(()=>{mounted.current=true;lifecycle.current++;return()=>{mounted.current=false;lifecycle.current++;authEpoch.current++;statusEpoch.current++;epoch.current++;flow.current=null;};},[]);
 useEffect(()=>{epoch.current++;setModels([]);setBusy(false);setNotice('');setClaudeCode('');},[identity]);
 async function refresh(selected=latest.current){
  const request=++epoch.current,life=lifecycle.current,selectedIdentity=JSON.stringify([selected.provider,selected.apiKey,selected.baseUrl]);
  setBusy(true);setNotice('Reading your provider’s current model catalog…');
  const isCurrent=()=>alive(life)&&request===epoch.current&&selectedIdentity===JSON.stringify([latest.current.provider,latest.current.apiKey,latest.current.baseUrl]);
  try{const result=await api('/api/models',selected);if(!isCurrent())return;const catalog=providerModelCatalog(result);setModels(catalog.models);setNotice(catalog.models.length?`${catalog.models.length} models returned. Choose one for ${images?'image creation':'your next draft'}. Access depends on your provider and plan. ${catalog.notice}`:'No models returned. Check your provider access or enter a supported model ID.');}
  catch(e){if(isCurrent())setNotice((e as Error).message);}
  finally{if(isCurrent())setBusy(false);}
 }
 function useConnection(id:SubscriptionEngineId){
  const provider=providerFor(id),selected:ProviderConfig={provider,apiKey:'',model:latest.current.provider===provider?latest.current.model:'',baseUrl:''};
  choose(selected);setNotice('Connected. Choose a model from the returned catalog for your next request.');
 }
 function finishFlow(active:Flow){
  flow.current=null;showLogin(null);setAction(null);
  if(signature(latest.current)===active.selection)useConnection(active.id);
  else setNotice('Sign-in completed. Your current provider selection was kept; use the connected account whenever you are ready.');
 }
 function presentLogin(active:Flow,value:{authUrl?:unknown;verificationUrl?:unknown;userCode?:unknown;loginContinuation?:unknown}){
  const address=value.authUrl??value.verificationUrl,continuation=active.id==='claude'?claudeLoginContinuation(value.loginContinuation):undefined;
  const url=address?subscriptionLoginUrl(active.id,address):undefined;
  // Browser approval can finish with a pasted code even when the CLI has not
  // printed a link (or has opened the browser itself). The session owns input.
  if(!url&&!continuation)return;
  showLogin({id:active.id,url,code:typeof value.userCode==='string'?value.userCode.slice(0,200):undefined,continuation});setAction(null);
  if(url&&!active.opened&&signature(latest.current)===active.selection){active.opened=true;window.open(url,'_blank','noopener,noreferrer');}
 }
 function acceptConnections(rows:SubscriptionEngineStatus[]){
  setEngines(rows);setConnectionError('');
  const active=flow.current;
  if(active){const row=rows.find(item=>item.id===active.id);if(!row){flow.current=null;showLogin(null);setAction(null);setConnectionError('This provider is no longer available from the local service. Retry the connection check.');return;}
   if(active.stage==='installing'){
    if(row.error){flow.current=null;setAction(null);setConnectionError(row.error);}
    else if(row.installed&&!row.installing){active.stage='starting';void beginLogin(active);}
   }else if(active.stage==='pending'){
    if(row.connected)finishFlow(active);
    else if(row.pending){try{presentLogin(active,row);}catch(e){flow.current=null;showLogin(null);setAction(null);setConnectionError((e as Error).message);}}
    else if(!row.pending&&!row.installing){flow.current=null;showLogin(null);setAction(null);setConnectionError(row.error||'Sign-in ended before the account connected. You can retry when ready.');}
   }
   return;
  }
  // A provider-owned login can outlive this panel. Restore its code field/link,
  // never its automatic selection or a previously typed code.
  const pending=rows.find(row=>row.pending&&!row.connected&&(row.authUrl||row.verificationUrl||row.id==='claude'&&row.loginContinuation));
  if(pending){try{const address=pending.authUrl??pending.verificationUrl;showLogin({id:pending.id,url:address?subscriptionLoginUrl(pending.id,address):undefined,code:pending.userCode,continuation:pending.loginContinuation});}catch(e){showLogin(null);setConnectionError((e as Error).message);}}
  else if(loginRef.current)showLogin(null);
 }
 function readConnections():Promise<void>{
  const generation=statusEpoch.current,life=lifecycle.current;
  const running=connectionFlight.current;if(running?.generation===generation&&running.life===life)return running.promise;
  const promise=(async()=>{
   try{const result=await api('/api/ai/engines');if(!alive(life)||generation!==statusEpoch.current)return;const rows=subscriptionStatuses(result);pollFailures.current=0;nextPoll.current=0;acceptConnections(rows);}
   catch(e){if(alive(life)&&generation===statusEpoch.current){pollFailures.current++;nextPoll.current=Date.now()+Math.min(1500*2**pollFailures.current,15000);setConnectionError(`Connection check failed: ${(e as Error).message} Your notebook is safe; retry the connection check.`);}}
  })();
  const flight={generation,life,promise};connectionFlight.current=flight;void promise.finally(()=>{if(connectionFlight.current===flight)connectionFlight.current=null;});return promise;
 }
 useEffect(()=>{if(images||location.protocol==='file:')return;void readConnections();},[images]);
 // Focus once after the user's own sign-in action; later polling/link changes
 // must not steal focus or erase a code they are entering.
 useEffect(()=>{const active=flow.current;if(login?.id==='claude'&&login.continuation?.state==='awaiting-code'&&active?.id==='claude'&&signature(latest.current)===active.selection)claudeCodeInput.current?.focus();},[login?.continuation?.sessionId]);
 const polling=!images&&(engines.some(row=>row.installing||row.pending)||action!==null||login!==null);
 useEffect(()=>{if(!polling)return;const timer=setInterval(()=>{if(Date.now()>=nextPoll.current)void readConnections();},1500);return()=>clearInterval(timer);},[polling]);
 useEffect(()=>{if(!images&&isPlan(config.provider)&&engines.some(row=>row.connected&&providerFor(row.id)===config.provider))void refresh(config);},[config.provider,engines.map(row=>`${row.id}:${row.connected}`).join('|')]);
 async function beginLogin(active:Flow){
  const life=lifecycle.current;if(!current(active.token,life))return;
  active.stage='starting';statusEpoch.current++;setAction(active.id);setConnectionError('');
  try{
   const result=await api(`/api/ai/engines/${active.id}/login`,active.id==='claude'?{method:active.method??'claudeai'}:{});if(!current(active.token,life))return;
   if(result.connected===true){finishFlow(active);await readConnections();return;}
   active.stage='pending';
   if(result.pending!==true&&!result.authUrl&&!result.verificationUrl)throw new Error('The provider did not start sign-in. Retry when ready.');
   presentLogin(active,result);
   statusEpoch.current++;await readConnections();
  }catch(e){if(current(active.token,life)){flow.current=null;showLogin(null);setAction(null);setConnectionError((e as Error).message);}}
 }
 async function connect(engine:SubscriptionEngineStatus){
  const active:Flow={method:engine.id==='claude'?claudeMethod:undefined,id:engine.id,token:++authEpoch.current,selection:signature(latest.current),stage:engine.installed?'starting':'installing'},life=lifecycle.current;
  flow.current=active;statusEpoch.current++;showLogin(null);setAction(engine.id);setConnectionError('');
  if(engine.installed){await beginLogin(active);return;}
  try{await api(`/api/ai/engines/${engine.id}/install`,{});if(!current(active.token,life))return;statusEpoch.current++;await readConnections();}
  catch(e){if(current(active.token,life)){flow.current=null;setAction(null);setConnectionError((e as Error).message);}}
 }
 async function endConnection(id:SubscriptionEngineId,cancel=false){
  setClaudeCode('');setSendingCode(false);setCodeError('');
  const token=++authEpoch.current,life=lifecycle.current;flow.current=null;statusEpoch.current++;setAction(id);setEnding(true);setConnectionError('');
  try{await api(`/api/ai/engines/${id}/${cancel?'cancel':'logout'}`,{});if(!current(token,life))return;showLogin(null);if(!cancel&&latest.current.provider===providerFor(id))choose({provider:'openai',apiKey:'',model:''});statusEpoch.current++;await readConnections();}
  catch(e){if(current(token,life))setConnectionError((e as Error).message);}
  finally{if(current(token,life)){setAction(null);setEnding(false);}}
 }
 async function submitClaudeCode(){
  const selected=loginRef.current,continuation=selected?.continuation,code=claudeCode.trim();
  if(disabled||ending||sendingCode||selected?.id!=='claude'||!continuation||continuation.state!=='awaiting-code'||!code)return;
  const token=authEpoch.current,life=lifecycle.current,sessionId=continuation.sessionId;
  setClaudeCode('');setSendingCode(true);setCodeError('');statusEpoch.current++;
  const sameSession=()=>current(token,life)&&loginRef.current?.continuation?.sessionId===sessionId;
  try{
   const result=await api('/api/ai/engines/claude/login-code',{sessionId,code});if(!sameSession())return;
   if(result.connected===true&&flow.current?.id==='claude'){finishFlow(flow.current);}
   else if(result.pending===true)showLogin({...selected,continuation:claudeLoginContinuation(result.loginContinuation)});
   statusEpoch.current++;await readConnections();
  }catch(e){if(sameSession())setCodeError((e as Error).message);}
  finally{if(current(token,life))setSendingCode(false);}
 }
 return <div className="provider-connection">
 {!images&&<div className="provider-location-choice" role="group" aria-label="Where AI runs"><button type="button" aria-pressed={config.provider==='local'} disabled={disabled} onClick={()=>{if(config.provider!=='local')choose({provider:'local',apiKey:'',model:''});}}>On this computer</button><button type="button" aria-pressed={config.provider!=='local'} disabled={disabled} onClick={()=>{if(config.provider==='local')choose({provider:'openai',apiKey:'',model:''});}}>Online provider</button></div>}
 {!images&&config.provider==='local'?<LocalModelConnection config={config} onChange={choose} disabled={disabled}/>:<>
 {!images&&<details className="subscription-connections" open><summary>Connect a subscription</summary>
  <p>Install the official local engine and sign in in your browser. The engine manages its account; Asterloom never asks for your password.</p>
  <div className="subscription-grid">
   {(['codex','grok','claude'] as const).map(id=>{const engine=engines.find(row=>row.id===id);const pending=engine?.pending||engine?.installing||action===id;return <article key={id} className={engine?.connected?'provider-connected':id==='claude'&&login?.continuation?'provider-signing-in':''}>
    <div className="provider-card-heading"><strong>{engineNames[id]}</strong><span className={`provider-badge ${engine?.connected?'connected':''}`}>{engine?.connected?<><Check size={12}/>{engine.connectionState==='saved'?'Saved sign-in':'Connected'}</>:engine?.installing?'Installing':id==='claude'&&login?.continuation?login.continuation.state==='submitting'?'Confirming sign-in':'Enter browser code':engine?.pending?'Sign-in pending':engine?.installed?'Installed':'Setup needed'}</span></div>
    <small>{engine?.connected?`${engine.email??'Your account'}${engine.planType?` · ${engine.planType}`:''}. Choose a model below.`:engine?.reason??(id==='codex'?'For this free, personal desktop edition. Commercial editions need a separately approved connection.':id==='grok'?'Uses the official Grok Build engine and your account’s available plan usage.':'Runs the unmodified official Claude Code tool on your computer. Sign in with a subscription, Console, or SSO; the tool owns the connection.')}</small>
    {id==='claude'&&!engine?.connected&&<label className="provider-login-method">Claude sign-in method<select value={claudeMethod} disabled={disabled||!!action||!!login||engine?.pending} onChange={e=>setClaudeMethod(e.target.value as ClaudeMethod)}><option value="claudeai">Claude account / subscription</option><option value="console">Anthropic Console</option><option value="sso">Organization SSO</option></select></label>}
    {engine?.connected?<div className="provider-actions"><button type="button" className="button secondary" disabled={disabled||!!action} onClick={()=>useConnection(id)}>Use {engineLabels[id]}</button><button type="button" className="text-button" disabled={disabled||!!action} onClick={()=>void endConnection(id)}>Sign out</button></div>:id==='claude'&&login?.continuation?null:<button type="button" className="button secondary" disabled={disabled||!engine?.enabled||!!pending||!!action||!!login} onClick={()=>engine&&void connect(engine)}>{pending?<LoaderCircle size={15} className="spin"/>:!engine?.installed?<Download size={15}/>:<ExternalLink size={15}/>} {engine?.installing?'Installing official engine…':engine?.pending?'Waiting for your sign-in…':engine?.installed?`Continue with ${loginLabels[id]}`:`Install ${engineLabels[id]} & sign in`}</button>}
    {id==='claude'&&login?.id==='claude'&&login.continuation&&<form className="provider-login claude-code-return" aria-label="Complete Claude browser sign-in" onSubmit={event=>{event.preventDefault();void submitClaudeCode();}}>
    <strong>Paste Claude’s browser code to finish</strong><p>Approve Claude Code in your browser, then copy its complete sign-in code into the field below.</p>
    {login.url?<a href={login.url} target="_blank" rel="noreferrer">Reopen the provider’s sign-in page <ExternalLink size={13}/></a>:<small role="status">Waiting for Claude’s browser link. If a browser window is already open, you can approve there and paste its code now.</small>}
    <label htmlFor={claudeCodeInputId}>Claude browser sign-in code<input ref={claudeCodeInput} id={claudeCodeInputId} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8192} value={claudeCode} disabled={disabled||ending||sendingCode||login.continuation.state==='submitting'||Date.now()>=Date.parse(login.continuation.expiresAt)} onChange={event=>setClaudeCode(event.target.value)}/></label>
    <small>Use the code from the browser approval page, not your password, API key, or setup-token. The code is cleared here after you submit or cancel. If the browser reconnects automatically, no code is needed.</small>
    <button type="submit" className="button primary" disabled={disabled||ending||sendingCode||login.continuation.state==='submitting'||!claudeCode.trim()||Date.now()>=Date.parse(login.continuation.expiresAt)}>{sendingCode||login.continuation.state==='submitting'?<><LoaderCircle size={15} className="spin"/>Waiting for Claude to confirm…</>:'Complete Claude sign-in'}</button>
    <small role="status">{Date.now()>=Date.parse(login.continuation.expiresAt)?'This sign-in has expired. Cancel and start again for a fresh code.':`This sign-in expires at ${new Date(login.continuation.expiresAt).toLocaleTimeString()}.`}</small>
    {codeError&&<p className="provider-error" role="alert">{codeError}</p>}
   </form>}
    {(engine?.pending||login?.id===id||action===id&&!engine?.connected)&&<button type="button" className="text-button" disabled={disabled||ending} onClick={()=>void endConnection(id,true)}>Cancel sign-in</button>}
    {engine?.connected&&engine.reason&&<small>{engine.reason}</small>}
    {engine?.connected&&<a href={id==='codex'?'https://chatgpt.com/#settings/Usage':id==='grok'?'https://grok.com/':'https://claude.ai/'} target="_blank" rel="noreferrer">{id==='codex'?'Manage ChatGPT usage':id==='grok'?'Open Grok account':'Open Claude account'} <ExternalLink size={12}/></a>}
    {engine?.version&&<small className="provider-version">Official engine {engine.version}</small>}
    {engine?.error&&<p className="provider-error" role="status">{engine.error}</p>}
   </article>;})}

  </div>
  {login&&!(login.id==='claude'&&login.continuation)&&<div className="provider-login"><strong>Finish sign-in with {loginLabels[login.id]}</strong>{login.code&&<p>Enter this one-time code: <code>{login.code}</code></p>}{login.url&&<a href={login.url} target="_blank" rel="noreferrer">Reopen the provider’s sign-in page <ExternalLink size={13}/></a>}<small>Return here after signing in. If you keep this selection, its model catalog will load automatically.</small></div>}
  {connectionError&&<p className="provider-error" role="status">{connectionError}</p>}
  <div className="provider-actions"><button type="button" className="text-button" disabled={disabled} onClick={()=>choose({provider:'anthropic',apiKey:'',model:''})}>Use an API key</button><a href="https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use" target="_blank" rel="noreferrer">Claude Code connection terms <ExternalLink size={12}/></a></div>
  <button type="button" className="text-button" disabled={disabled} onClick={()=>void readConnections()}><RefreshCw size={13}/>Check connections</button>
 </details>}
 <label>{images?'Image provider':'AI provider'}<select disabled={disabled} value={config.provider} onChange={e=>choose({provider:e.target.value as ProviderConfig['provider'],apiKey:'',model:'',baseUrl:''})}><option value="openai">OpenAI API</option>{!images&&<><option value="anthropic">Claude / Anthropic API</option><option value="xai">Grok / xAI API</option>{(engines.some(e=>e.id==='codex'&&e.connected)||config.provider==='chatgpt')&&<option value="chatgpt">Codex · connected ChatGPT plan</option>}{(engines.some(e=>e.id==='grok'&&e.connected)||config.provider==='grok')&&<option value="grok">Grok · connected subscription</option>}{(engines.some(e=>e.id==='claude'&&e.connected)||config.provider==='claude-code')&&<option value="claude-code">Claude Code · connected local tool</option>}</>}<option value="compatible">Compatible API / local endpoint</option></select></label>
 {!isPlan(config.provider)&&<label><span><KeyRound size={13}/> API key · this session only</span><input type="password" autoComplete="off" value={config.apiKey} disabled={disabled} onChange={e=>choose({...config,apiKey:e.target.value})}/></label>}
 {config.provider==='compatible'&&<label>Endpoint base URL<input disabled={disabled} value={config.baseUrl||''} onChange={e=>choose({...config,baseUrl:e.target.value})} placeholder="http://127.0.0.1:11434/v1"/></label>}
 <div className="model-discovery"><button type="button" className="button secondary" disabled={disabled||busy||(!isPlan(config.provider)&&config.provider!=='compatible'&&!config.apiKey.trim())} onClick={()=>void refresh()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Reading models…':'Refresh available models'}</button><small>No generation is performed by discovery.</small></div>
 {models.length>0&&<label>Available models<select disabled={disabled} value={models.some(m=>m.id===config.model)?config.model:''} onChange={e=>choose({...config,model:e.target.value})}><option value="">Choose a model</option>{models.map(m=><option key={m.id} value={m.id}>{m.name===m.id?m.id:`${m.name} · ${m.id}`}</option>)}</select></label>}
 <label>{images?'Image model ID':'Model ID'}<input value={config.model} disabled={disabled} onChange={e=>choose({...config,model:e.target.value})} placeholder="Choose above or enter a provider model ID"/></label>
 {notice&&<p className="provider-status" role="status">{notice}</p>}
 <p className="small muted"><ShieldCheck size={13}/> API keys stay in memory. Official engines store their own sign-in in Asterloom’s private local connection folder. Keys and accounts never travel with exported games. Providers apply their own usage limits and charges.</p>
 </>}
 </div>;
}
