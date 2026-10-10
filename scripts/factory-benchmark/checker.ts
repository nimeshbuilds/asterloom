import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createService} from '../../server/index.mjs';
import {systemClaudeBenchmarkConnection} from './system-claude';
import {gameCheckingPrompt} from '../../src/lib/gameDirector';
import {getGameDirectorOutputSchema,normalizeGameDirectorStructuredReply} from '../../src/lib/gameDirectorSchemas';
import {compactGameOutputSchema} from '../../src/lib/gameOutputSchema';
import {parseGameDirectorReply} from '../../src/lib/gameDirectorReply';
import {validateGameBatchChecks,type GameDesignBatch} from '../../src/lib/gameDesign';
import {validateActivity} from '../../src/lib/structuredEngine';
import {unavailableAIUsage,validateAITokenUsage,summarizeAIUsage,type AIUsageReceipt} from '../../src/lib/aiUsage';
import {SCAFFOLDS} from '../../src/data/scaffolds';

export async function checkReplayInput(artifactDirectory:string,scaffoldId:string){
 const input=JSON.parse(await readFile(join(artifactDirectory,scaffoldId+'.input.json'),'utf8')),result=JSON.parse(await readFile(join(artifactDirectory,scaffoldId+'.result.json'),'utf8'));
 if(result.status!=='valid-draft'||!validateActivity(result.result?.activity,input.notebook.sources).success)throw Error('Replay requires a saved locally valid writer draft and its original source input.');
 const batch:GameDesignBatch={...input.batch,status:'written',drafts:[{missionId:input.batch.missions[0].id,activity:result.result.activity,teaching:result.result.teaching,audioDirection:result.result.audioDirection}]};
 return{batch,prompt:gameCheckingPrompt(batch)};
}

export async function runCheckerReplay(options:{serviceUrl:string;model:string;artifactDirectory:string;scaffoldId:string;output:string;timeoutMs:number}){
 const origin=new URL(options.serviceUrl);if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Checker replay requires a loopback HTTP service.');
 const input=await checkReplayInput(options.artifactDirectory,options.scaffoldId),data=JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]),schema=compactGameOutputSchema(getGameDirectorOutputSchema('check',data,{provider:'claude-code'})!);
 const prompt=input.prompt.replace('REFERENCE DATA (JSON):',`STRUCTURED OUTPUT: Follow the attached output schema. STRUCTURED REQUIRED ROOT KEYS: ${JSON.stringify(schema.required??[])}. Include every required key, using [] for empty required arrays and null only where the schema allows it.\nREFERENCE DATA (JSON):`),receipts:AIUsageReceipt[]=[],attempts:any[]=[];
 await mkdir(options.output,{recursive:true});await writeFile(join(options.output,'check.input.json'),JSON.stringify({scaffoldId:options.scaffoldId,batch:input.batch,prompt,outputSchema:schema,scope:'Replays the original saved writer draft through the production check prompt. No expected verdict is disclosed.'},null,2));
 const started=performance.now();let checks:ReturnType<typeof validateGameBatchChecks>|undefined,diagnostic='';
 for(let attempt=0;attempt<2;attempt++){
  const receipt:AIUsageReceipt={id:`request-${crypto.randomUUID()}`,stage:'check',provider:'claude-code',model:options.model,startedAt:new Date().toISOString(),status:'started',usage:unavailableAIUsage()};receipts.push(receipt);let payload:any;const dispatched=performance.now();
  await writeFile(join(options.output,'check.receipts.json'),JSON.stringify(receipts,null,2));
  try{
   const response=await fetch(new URL('/api/generate',origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'claude-code',model:options.model,requestId:receipt.id,prompt:diagnostic?prompt.replace('REFERENCE DATA (JSON):',`LOCAL VALIDATION REPAIR: ${diagnostic}. Return the entire requested JSON again.\nREFERENCE DATA (JSON):`):prompt,outputSchema:schema,maxOutputTokens:2000,timeoutMs:options.timeoutMs}),signal:AbortSignal.timeout(options.timeoutMs+5000)});payload=await response.json();try{receipt.usage=validateAITokenUsage(payload.usage);}catch{}receipt.status=response.ok?'completed':'failed';if(Array.isArray(payload.actualModels))receipt.actualModels=payload.actualModels;
   if(!response.ok||typeof payload.text!=='string')throw Error(payload.code??'PROVIDER_FAILED');
   checks=validateGameBatchChecks(normalizeGameDirectorStructuredReply('check',parseGameDirectorReply(payload.text)),input.batch,true);receipt.validation='accepted';attempts.push({attempt:attempt+1,status:'accepted',responseText:payload.text});break;
  }catch(error){if(receipt.status==='started')receipt.status='failed';if(receipt.status==='completed')receipt.validation='rejected';diagnostic=(error as Error).message.replace(/https?:\/\/\S+/g,'[address omitted]').replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9_\-.]+/gi,'[credential omitted]').slice(0,500);attempts.push({attempt:attempt+1,status:'rejected',diagnostic,...(typeof payload?.text==='string'?{responseText:payload.text}:{})});if(receipt.status==='failed'&&!['PROVIDER_INVALID_RESPONSE','PROVIDER_TRUNCATED'].includes(payload?.code))break;
  }finally{receipt.durationMs=Math.round(performance.now()-dispatched);receipt.finishedAt=new Date().toISOString();await writeFile(join(options.output,'check.receipts.json'),JSON.stringify(receipts,null,2));await writeFile(join(options.output,'check.attempts.json'),JSON.stringify(attempts,null,2));}
 }
 const status=checks?.[0]?.decision??'failed',report={version:1,recordedAt:new Date().toISOString(),scope:'Live production check-stage replay of an unchanged accepted writer-component draft; no planning, rewriting, native play or human review is claimed.',provider:{provider:'claude-code',model:options.model},counts:{selected:1,trials:1,completed:checks?1:0},coverage:SCAFFOLDS.map(s=>({scaffoldId:s.id,status:s.id===options.scaffoldId?status:'unverified'})),trials:[{scaffoldId:options.scaffoldId,variant:'unchanged-writer-draft-check-replay',status,requestedRecipeGenerated:false,durationMs:Math.round(performance.now()-started),actualModels:[...new Set(receipts.flatMap(r=>r.actualModels??[]))],usage:summarizeAIUsage(receipts),receipts,checks:checks??null,message:checks?.[0]?.reason??diagnostic,metrics:{sourceGrounding:'provider-judgment-only',humanReview:'unverified',originalWriterDraftUnchanged:true}}]};
 await writeFile(join(options.output,'check-report.json'),JSON.stringify(report,null,2));return report;
}

async function main(){const args=process.argv.slice(2),option=(flag:string,fallback?:string)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;if(!args.includes('--execute-live')){console.log('Unverified: add --execute-live to run the explicitly selected saved draft through the actual provider.');return;}if(!option('--system-claude')||!option('--source-directory')||!option('--scaffold')||!option('--output'))throw Error('Provide --system-claude, --source-directory, --scaffold and --output.');const output=resolve(option('--output')!),service=await createService({port:0,dataDir:await mkdtemp(join(tmpdir(),'asterloom-check-replay-')),engineConnections:{claude:systemClaudeBenchmarkConnection(resolve(option('--system-claude')!),{captureDirectory:join(output,'provider-results')})}});try{const report=await runCheckerReplay({serviceUrl:`http://127.0.0.1:${service.port}`,model:option('--model','claude-haiku-4-5-20251001')!,artifactDirectory:resolve(option('--source-directory')!),scaffoldId:option('--scaffold')!,output,timeoutMs:180000});console.log(JSON.stringify(report.trials.map(({receipts,...trial})=>trial),null,2));}finally{await service.close();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
