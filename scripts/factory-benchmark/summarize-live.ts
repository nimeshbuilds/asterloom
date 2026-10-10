import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

function distribution(values:number[]){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const percentile=(fraction:number)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)]:null;
 return{measured:sorted.length,min:sorted[0]??null,median:percentile(.5),p95:percentile(.95),max:sorted.at(-1)??null};
}
export function observedRequestTiming(receipts:any[],recordedAt:string){
 const snapshot=Date.parse(recordedAt),events:{time:number;delta:number}[]=[];
 for(const r of receipts){const start=Date.parse(r.startedAt),end=r.finishedAt?Date.parse(r.finishedAt):snapshot;if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)events.push({time:start,delta:1},{time:end,delta:-1});}
 events.sort((a,b)=>a.time-b.time||a.delta-b.delta);let concurrent=0,peak=0;
 for(const e of events){concurrent+=e.delta;peak=Math.max(peak,concurrent);}
 const measured=receipts.filter(r=>Number.isFinite(r.durationMs)),active=receipts.filter(r=>!r.finishedAt&&r.status==='started');
 return{definition:'Observed API request wall time, including local service and CLI startup. Overlapping durations must not be added to infer elapsed benchmark wall time.',requestDurationMs:distribution(measured.map(r=>r.durationMs)),unmeasuredDurations:receipts.length-measured.length,peakConcurrentRequests:events.length?peak:null,observedWindowMs:events.length?events.at(-1)!.time-events[0].time:null,active:active.map(r=>({requestId:r.id,elapsedMs:Number.isFinite(snapshot)&&Number.isFinite(Date.parse(r.startedAt))?Math.max(0,snapshot-Date.parse(r.startedAt)):null,usageStatus:r.usage?.status??'unavailable'}))};
}

function diagnosticCategory(diagnostic:string){
 if(/evidence.*(?:exact|substring)|(?:exact|substring).*evidence|Teaching evidence/i.test(diagnostic))return'exact-source-citation';
 if(/worked example/i.test(diagnostic))return'unsupported-worked-example';
 if(/fallback.*last/i.test(diagnostic))return'scenario-transition-contract';
 if(/^PROVIDER_/.test(diagnostic))return'provider-error';
 return'other-local-contract';
}

/** Classifies observed evidence only. A CLI success subtype can still carry an
 * explicit account-limit error; that is availability, not generation quality. */
export function observedFailureCategory(raw:any,receipt:any,diagnostic?:string){
 if(raw?.is_error===true&&typeof raw.result==='string'&&/^You've hit your session limit\b/.test(raw.result))return'account-session-limit';
 if(raw?.is_error===true&&raw.subtype==='error_max_turns')return'structured-output-turn-limit';
 if(raw?.is_error===true&&raw.subtype==='error_max_structured_output_retries')return'structured-output-retries';
 if(diagnostic==='PROVIDER_TIMEOUT')return'provider-timeout';
 if(receipt.validation==='rejected')return'local-contract-rejection';
 return receipt.status==='failed'?'other-provider-failure':null;
}

/** Summarizes retained observations. Missing provider counters stay unknown;
 * a formatter turn count is not inferred from token totals or elapsed time. */
export async function summarizeLive(reportPath:string,reportSnapshot?:any){
 const report=reportSnapshot??JSON.parse(await readFile(reportPath,'utf8')),records=report.cases??report.trials??[],active=report.inProgress??[],requests:any[]=[];
 for(const row of [...records,...active])for(const [index,receipt] of (row.receipts??[]).entries()){
  let raw:any;try{raw=JSON.parse(await readFile(join(dirname(reportPath),'provider-results',receipt.id+'.provider.json'),'utf8'));}catch{/* Old or interrupted runs may not retain a provider result. */}
  requests.push({scaffoldId:row.scaffoldId,stage:receipt.stage,status:receipt.status,validation:receipt.validation??'unverified',requestId:receipt.id,actualModels:receipt.actualModels??Object.keys(raw?.modelUsage??{}),durationMs:receipt.durationMs??null,usage:receipt.usage,failureCategory:observedFailureCategory(raw,receipt,row.attempts?.find((a:any)=>a.attempt===index+1)?.diagnostic),providerSubtype:raw?.subtype??null,providerStopReason:raw?.stop_reason??null,providerTurns:raw?.numTurns??null,providerApiDurationMs:raw?.providerApiDurationMs??null,providerUsageIterationEntries:Array.isArray(raw?.usage?.iterations)?raw.usage.iterations.length:null,providerErrors:Array.isArray(raw?.errors)?raw.errors:[],structuredOutputRetained:!!raw?.structured_output});
 }
 const byStage=Object.fromEntries([...new Set(requests.map(r=>r.stage))].map(stage=>{const rows=requests.filter(r=>r.stage===stage),sum=(key:string)=>{const known=rows.filter(r=>r.usage?.[key]!==null&&Number.isFinite(r.usage?.[key]));return{value:known.length?known.reduce((n,r)=>n+r.usage[key],0):null,reported:known.length,missing:rows.length-known.length};};return[stage,{requests:rows.length,measuredRequestMs:rows.some(r=>r.durationMs!==null)?rows.reduce((n,r)=>n+(r.durationMs??0),0):null,inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cachedInputTokens:sum('cachedInputTokens'),cacheWriteTokens:sum('cacheWriteTokens'),reasoningTokens:sum('reasoningTokens'),totalTokens:sum('totalTokens')}];}));
 const diagnostics=records.flatMap((row:any)=>(row.attempts??[]).filter((a:any)=>a.diagnostic).map((a:any)=>({scaffoldId:row.scaffoldId,attempt:a.attempt??null,category:diagnosticCategory(a.diagnostic),diagnostic:a.diagnostic}))),count=(values:string[])=>Object.fromEntries([...new Set(values)].map(value=>[value,values.filter(v=>v===value).length]));
 return{version:1,sourceReport:reportPath,recordedAt:new Date().toISOString(),scope:report.scope??report.pipeline,provider:report.provider,counts:report.counts,accounting:'Input includes uncached input, cache reads, and cache writes exactly once. Reasoning is a subset of output. These are provider-reported counts, not invoice charges. Wall time includes local API and CLI work. Usage iteration array length is not a formatter retry count. Unknown counters remain null.',timing:observedRequestTiming([...records,...active].flatMap(row=>row.receipts??[]),report.recordedAt),byStage,providerSubtypes:count(requests.map(r=>r.providerSubtype??'unknown')),attemptDiagnosticCategories:count(diagnostics.map((d:any)=>d.category)),attemptDiagnostics:diagnostics,requests,results:records.map((row:any)=>({scaffoldId:row.scaffoldId,status:row.status,variant:row.variant,diagnostics:row.attempts?.filter((a:any)=>a.diagnostic).map((a:any)=>a.diagnostic)??[],message:row.message??null})),unverified:(report.coverage??[]).filter((c:any)=>c.status==='unverified').map((c:any)=>c.scaffoldId)};
}
async function main(){const args=process.argv.slice(2),arg=(flag:string)=>args[args.indexOf(flag)+1];if(!args.includes('--report')||!args.includes('--output'))throw Error('Provide --report and --output.');const summary=await summarizeLive(resolve(arg('--report')));await writeFile(resolve(arg('--output')),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({counts:summary.counts,requests:summary.requests.length,unverified:summary.unverified.length},null,2));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
