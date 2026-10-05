import {randomUUID} from 'node:crypto';
const ID=/^request-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MESSAGES={accepted:'Request accepted by this device.',connecting:'Connecting to the selected AI engine.',generating:'The provider is generating this stage.',receiving:'The provider is returning output.',completed:'The provider request completed.',failed:'The provider request failed. Saved stages are kept.',canceled:'This request was canceled.'};
const invalid=(message,status=400)=>Object.assign(new Error(message),{status,code:status===404?'REQUEST_NOT_FOUND':status===409?'REQUEST_ID_EXISTS':'INVALID_REQUEST',publicMessage:true});
export function createGenerationStatus({now=Date.now,ttlMs=15*60*1000,maxJobs=100,maxEvents=64}={}){
 const jobs=new Map();
 function prune(){for(const [id,job]of jobs)if(now()-Date.parse(job.updatedAt)>=ttlMs)jobs.delete(id);}
 function start(value){prune();const id=value===undefined?'request-'+randomUUID():value;if(typeof id!=='string'||!ID.test(id))throw invalid('Use a valid AI request identifier.');if(jobs.has(id))throw invalid('This request identifier was already used. Continue with a new request identifier.',409);
  while(jobs.size>=maxJobs){const oldest=[...jobs].find(([,job])=>job.status!=='running');if(!oldest)throw invalid('Too many AI requests are running. Wait before starting another.',409);jobs.delete(oldest[0]);}
  const at=new Date(now()).toISOString(),job={requestId:id,status:'running',phase:'accepted',startedAt:at,updatedAt:at,reasoningSummaryAvailable:false,events:[{at,phase:'accepted',message:MESSAGES.accepted}]};jobs.set(id,job);return id;
 }
 function update(id,patch={}){const job=jobs.get(id);if(!job||job.status!=='running')return;const at=new Date(now()).toISOString(),phase=Object.hasOwn(MESSAGES,patch.phase)?patch.phase:job.phase;
  if(phase!==job.phase){job.events.push({at,phase,message:MESSAGES[phase]});job.events=job.events.slice(-maxEvents);}job.phase=phase;job.updatedAt=at;
  if(Number.isSafeInteger(patch.outputCharacters)&&patch.outputCharacters>=0)job.outputCharacters=Math.min(2*1024*1024,patch.outputCharacters);
  if(patch.usage&&typeof patch.usage==='object'){const usage={};for(const key of ['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','reasoningTokens','totalTokens'])usage[key]=Number.isSafeInteger(patch.usage[key])&&patch.usage[key]>=0?patch.usage[key]:null;usage.status=usage.inputTokens!==null&&usage.outputTokens!==null?'reported':Object.values(usage).some(v=>typeof v==='number')?'partial':'unavailable';job.usage=usage;}
  if(['completed','failed','canceled'].includes(phase))job.status=phase;
 }
 function get(id){prune();if(typeof id!=='string'||!ID.test(id))throw invalid('Use a valid AI request identifier.');const job=jobs.get(id);if(!job)throw invalid('This request status expired or is unavailable on this device.',404);return structuredClone(job);}
 return {start,update,get};
}
