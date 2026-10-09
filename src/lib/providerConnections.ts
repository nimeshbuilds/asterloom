export type SubscriptionEngineId = 'codex' | 'grok' | 'claude';
export interface ClaudeLoginContinuation {sessionId:string;expiresAt:string;state:'awaiting-code'|'submitting'}
export interface SubscriptionEngineStatus {
  id: SubscriptionEngineId; provider?: 'chatgpt' | 'grok' | 'claude-code'; enabled: boolean;
  installed: boolean; version?: string; installing: boolean; pending: boolean; connected: boolean;
  email?: string; planType?: string; error?: string; reason?: string; persistent?: boolean;
  progress?: number | {downloadedBytes:number;totalBytes?:number};
  connectionState?: 'disconnected'|'saved'|'signed-in'|'verified'|'expired'; authUrl?: string; verificationUrl?: string; userCode?: string;
  loginContinuation?:ClaudeLoginContinuation;
}
/** Only provider-owned HTTPS login pages can leave the local studio as an auth action. */
export function subscriptionLoginUrl(engine: SubscriptionEngineId, value: unknown): string {
  if (typeof value !== 'string') throw new Error('The provider did not return a sign-in page. Retry sign-in.');
  const url = new URL(value);
  const allowed = engine === 'codex' ? ['auth.openai.com', 'chatgpt.com'] : engine === 'grok' ? ['accounts.x.ai', 'grok.com', 'auth.x.ai'] : ['claude.com','claude.ai','platform.claude.com','console.anthropic.com'];
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !allowed.includes(url.hostname)) throw new Error('The provider returned an unexpected sign-in address.');
  return url.href;
}

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const text=(value:unknown,max=4096)=>typeof value==='string'?value.slice(0,max):undefined;
export function claudeLoginContinuation(value:unknown):ClaudeLoginContinuation|undefined {
 if(value===undefined)return;
 if(!record(value)||Object.keys(value).some(key=>!['sessionId','expiresAt','state'].includes(key))||typeof value.sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.sessionId)||typeof value.expiresAt!=='string'||value.expiresAt.length>40||!Number.isFinite(Date.parse(value.expiresAt))||!['awaiting-code','submitting'].includes(String(value.state)))throw new Error('Claude returned an unreadable sign-in session. Cancel and start sign-in again.');
 return{sessionId:value.sessionId,expiresAt:value.expiresAt,state:value.state as ClaudeLoginContinuation['state']};
}
/** Validate local-service responses before using them to advance an account action. */
export function subscriptionStatuses(value:unknown):SubscriptionEngineStatus[]{
 if(!record(value)||!Array.isArray(value.engines)||value.engines.length>8)throw new Error('The local service returned an unreadable connection status.');
 const seen=new Set<string>();
 return value.engines.map((row:unknown)=>{
  if(!record(row)||(row.id!=='codex'&&row.id!=='grok'&&row.id!=='claude')||seen.has(row.id)||['enabled','installed','installing','pending','connected'].some(key=>typeof row[key]!=='boolean'))throw new Error('The local service returned an unreadable connection status.');
  seen.add(row.id);
  const result:SubscriptionEngineStatus={id:row.id,enabled:row.enabled as boolean,installed:row.installed as boolean,installing:row.installing as boolean,pending:row.pending as boolean,connected:row.connected as boolean};
  if(row.provider==='chatgpt'||row.provider==='grok'||row.provider==='claude-code')result.provider=row.provider;
  if(row.id==='claude'&&row.pending&&row.loginContinuation!==undefined)result.loginContinuation=claudeLoginContinuation(row.loginContinuation);
  for(const key of ['version','email','planType','error','reason','authUrl','verificationUrl','userCode'] as const){const value=text(row[key],key==='userCode'?200:4096);if(value!==undefined)result[key]=value;}
  if(typeof row.persistent==='boolean')result.persistent=row.persistent;
  if(['disconnected','saved','signed-in','verified','expired'].includes(String(row.connectionState)))result.connectionState=row.connectionState as SubscriptionEngineStatus['connectionState'];
  if(typeof row.progress==='number'&&Number.isFinite(row.progress)&&row.progress>=0)result.progress=row.progress;
  else if(record(row.progress)&&typeof row.progress.downloadedBytes==='number'&&Number.isFinite(row.progress.downloadedBytes)&&row.progress.downloadedBytes>=0){result.progress={downloadedBytes:row.progress.downloadedBytes};if(typeof row.progress.totalBytes==='number'&&Number.isFinite(row.progress.totalBytes)&&row.progress.totalBytes>=0)result.progress.totalBytes=row.progress.totalBytes;}
  return result;
 });
}
export function providerModelCatalog(value:unknown):{models:{id:string;name:string}[];notice:string}{
 if(!record(value)||!Array.isArray(value.models)||value.models.length>2000)throw new Error('The provider returned an unreadable model catalog. Retry discovery or enter a supported model ID.');
 const ids=new Set<string>(),models:{id:string;name:string}[]=[];
 for(const item of value.models){if(!record(item)||typeof item.id!=='string'||!item.id.trim()||item.id.length>500||(item.name!==undefined&&typeof item.name!=='string'))throw new Error('The provider returned an unreadable model catalog. Retry discovery or enter a supported model ID.');if(!ids.has(item.id)){ids.add(item.id);models.push({id:item.id,name:text(item.name,1000)||item.id});}}
 return{models,notice:text(value.notice)||''};
}
