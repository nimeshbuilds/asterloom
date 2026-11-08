import {mkdir,writeFile,mkdtemp,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createService} from '../../server/index.mjs';
import {systemClaudeBenchmarkConnection} from './system-claude';
import {nativeFactoryFixtures,type NativeFactoryFixture} from '../../tests/fixtures/nativeFactoryBenchmark';
import {mediaAuthoringFixture,codeAuthoringFixture} from '../../tests/gameDraftAuthoring.fixture';
import {getGameDirectorOutputSchema,normalizeGameDirectorStructuredReply} from '../../src/lib/gameDirectorSchemas';
import {compactGameOutputSchema} from '../../src/lib/gameOutputSchema';
import {gameWritingPrompt} from '../../src/lib/gameDirector';
import {parseGameDirectorReply} from '../../src/lib/gameDirectorReply';
import {validatePreparedGameDraft,type GameDraftKind} from '../../src/lib/gameDraftAdapters';
import {validateAILearningMissionDraft} from '../../src/lib/aiLearningPlan';
import {alignCreatedMissionStory} from '../../src/lib/scaffoldStoryContext';
import {validateGameMissionProse,type GameDesignBatch} from '../../src/lib/gameDesign';
import {validateNewMissionClarity} from '../../src/lib/gameClarity';
import {validateGameAudioDirection} from '../../src/lib/gameArtDirection';
import {fitsSpecificContract} from '../../src/lib/scaffoldRuntime';
import {sourceRevision,textDigest} from '../../src/lib/evidence';
import {scaffoldById} from '../../src/data/scaffolds';
import {validateAITokenUsage,unavailableAIUsage,summarizeAIUsage,type AIUsageReceipt} from '../../src/lib/aiUsage';
import type {DirectorSourceUnit} from '../../src/lib/gameDirectorSources';
import {teachingContextWindow} from '../../src/lib/gameDirectorSources';
import type {Notebook} from '../../src/types';
import {validateActivity} from '../../src/lib/structuredEngine';
import {resolveGameDraftCitationReply} from '../../src/lib/gameDraftCitations';

async function atomic(path:string,value:unknown){await writeFile(path+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(path+'.pending',path);}
export function writerInput(f:NativeFactoryFixture){
 const notebook:Notebook=structuredClone(f.positiveInput);let source=notebook.sources.find(s=>s.id===f.activity.sourceRefs[0].sourceId)!;
 // Select exact quoted source passages, without sending the reference model or
 // its response witness to the provider. This component test supplies the plan.
 if(source.kind==='text'){source.text=[...new Set(f.activity.sourceRefs.filter(r=>r.sourceId===source.id).map(r=>r.evidence))].join('\n\n');}
 if(f.scaffoldId==='media-checkpoints'||f.scaffoldId==='secure-code-review'){
  const specialized=f.scaffoldId==='media-checkpoints'?mediaAuthoringFixture():codeAuthoringFixture();source=structuredClone(specialized.source);notebook.sources=[source,...structuredClone(specialized.assets??[])];
 }
 if(!source.text.trim()||source.text.length>6000)throw Error(`Source exceeds complete 6,000-character writer window for ${f.scaffoldId}.`);
 const unit:DirectorSourceUnit={id:`benchmark-unit-${f.scaffoldId}`,sourceId:source.id,sourceRevision:sourceRevision(source),sourceTitle:source.title,title:f.name,start:0,end:source.text.length,excerpt:source.text,headingPath:[],kind:'explanation',missionEligible:true};
 const scaffold=scaffoldById(f.scaffoldId)!;
 const batch:GameDesignBatch={id:`benchmark-batch-${f.scaffoldId}`,unitIds:[unit.id],status:'planned',study:[],missions:[{id:'mission-1',unitId:unit.id,kind:f.activity.kind as GameDraftKind,scaffoldId:f.scaffoldId,title:f.activity.title,objective:f.activity.instruction,visualDirection:{scene:scaffold.visual.scene,sourceAssetIds:source.kind==='image'?[source.id]:[]}}]};
 return{notebook,source,unit,batch,prompt:gameWritingPrompt(notebook,batch,[unit],'mission-1')};
}
export function validateWriterReply(f:NativeFactoryFixture,input:ReturnType<typeof writerInput>,text:string,structured=false){
 const parsed=parseGameDirectorReply(text),normalized=structured?normalizeGameDirectorStructuredReply('write',parsed):parsed,reply=resolveGameDraftCitationReply(normalized,{source:input.source,primaryWindow:input.unit,teachingWindow:teachingContextWindow(input.unit,[input.unit],input.notebook)});
 if(Object.keys(reply).length===1&&typeof reply.cannotBuild==='string'&&reply.cannotBuild.trim()&&reply.cannotBuild.length<=500)return{status:'declined' as const,reason:reply.cannotBuild};
 if(Object.keys(reply).some(k=>k!=='missions')||!Array.isArray(reply.missions)||reply.missions.length!==1)throw Error('Return exactly one requested mission under missions.');
 const item=reply.missions[0] as Record<string,unknown>;if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['missionId','activity','teaching','audioDirection','solution'].includes(k)))throw Error('The mission contains unsupported fields.');
 if(item.missionId!=='mission-1')throw Error('Keep the requested missionId exactly.');
 const model=validatePreparedGameDraft(input.source,input.unit.excerpt,{activity:item.activity,...(item.solution===undefined?{}:{solution:item.solution})},`writer-benchmark-${f.scaffoldId}`,[f.activity.kind as GameDraftKind],input.notebook.sources);
 const activity={...model,scaffoldIds:[f.scaffoldId]};if(!fitsSpecificContract(f.scaffoldId,activity))throw Error('The model lacks the requested recipe capability.');
 const teaching=alignCreatedMissionStory(validateAILearningMissionDraft(item.teaching,{activity,ageGroup:input.notebook.ageGroup,sources:input.notebook.sources,sourceWindow:teachingContextWindow(input.unit,[input.unit],input.notebook)}),f.scaffoldId,activity);
 validateGameMissionProse(input.unit,input.notebook,activity,teaching,[input.unit]);validateNewMissionClarity(activity,teaching);
 const errors=validateGameAudioDirection(item.audioDirection,{ageGroup:input.notebook.ageGroup,scaffoldId:f.scaffoldId,activityKind:activity.kind,theme:input.batch.missions![0].visualDirection.scene});if(errors.length)throw Error(errors[0]);
 return{status:'valid-draft' as const,activity,teaching,audioDirection:item.audioDirection};
}
export async function runWriterBenchmark(options:{serviceUrl:string;provider:string;model:string;apiKey?:string;baseUrl?:string;output:string;scaffoldIds:string[];concurrency:number;repairs:number;timeoutMs:number;signal?:AbortSignal;thinkingBudget?:number}){
 const all=nativeFactoryFixtures(),selected=all.filter(f=>options.scaffoldIds.includes(f.scaffoldId));if(selected.length!==new Set(options.scaffoldIds).size)throw Error('Unknown scaffold ID.');
 await mkdir(options.output,{recursive:true});const cases:any[]=[],pending=[...selected],active=new Map<string,{scaffoldId:string;status:string;receipts:AIUsageReceipt[]}>();let persist=Promise.resolve();
 const report=()=>({version:1,recordedAt:new Date().toISOString(),scope:'Live writer component benchmark: actual gameWritingPrompt and strict application validators, with an explicitly supplied plan and source window. Planning, direction, provider self-check, full creation completion, and native play are not measured by this component run.',provider:{provider:options.provider,requestedModel:options.model,thinkingBudget:options.thinkingBudget??'provider-default'},counts:{catalog:75,selected:selected.length,finished:cases.length,validDraft:cases.filter(c=>c.status==='valid-draft').length,declined:cases.filter(c=>c.status==='declined').length,failed:cases.filter(c=>['failed','provider-failed','blocked'].includes(c.status)).length},coverage:all.map(f=>({scaffoldId:f.scaffoldId,status:cases.find(c=>c.scaffoldId===f.scaffoldId)?.status??'unverified'})),usage:summarizeAIUsage([...cases,...active.values()].flatMap(c=>c.receipts)),inProgress:[...active.values()],cases});
 const save=()=>{persist=persist.then(()=>atomic(join(options.output,'writer-report.json'),report()));return persist;};
 await Promise.all(Array.from({length:options.concurrency},async()=>{for(;;){if(options.signal?.aborted)return;const f=pending.shift();if(!f)return;const started=performance.now(),receipts:AIUsageReceipt[]=[],attempts:any[]=[];let input:ReturnType<typeof writerInput>|undefined,status='failed',accepted:ReturnType<typeof validateWriterReply>|undefined;
  active.set(f.scaffoldId,{scaffoldId:f.scaffoldId,status:'running',receipts});await save();
  try{input=writerInput(f);const fullSchema=['chatgpt','claude-code'].includes(options.provider)?getGameDirectorOutputSchema('write',JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]),{provider:options.provider}):undefined,outputSchema=fullSchema?compactGameOutputSchema(fullSchema):undefined;
   if(outputSchema)input.prompt=input.prompt.replace('REFERENCE DATA (JSON):',`STRUCTURED OUTPUT: Follow the attached output schema. STRUCTURED REQUIRED ROOT KEYS: ${JSON.stringify(outputSchema.required??[])}. Include every required key, using [] for empty required arrays and null only where the schema allows it. Where earlier instructions say to omit an optional field but the schema requires its key, use null for absence. A refusal and successful content are mutually exclusive: use null for the unused alternative. Required teaching and source evidence must remain complete.\nREFERENCE DATA (JSON):`);
   await atomic(join(options.output,f.scaffoldId+'.input.json'),{notebook:input.notebook,unit:input.unit,batch:input.batch,prompt:input.prompt,referenceModelDisclosed:false,outputSchema:outputSchema??null});
   let diagnostic='';for(let attempt=0;attempt<=options.repairs;attempt++){
    const prompt=diagnostic?input.prompt.replace('REFERENCE DATA (JSON):',`LOCAL VALIDATION REPAIR: ${diagnostic.slice(0,500)}. Return the entire requested JSON again with that error corrected; keep source facts and exact citations.\nREFERENCE DATA (JSON):`):input.prompt;
    const receipt:AIUsageReceipt={id:`request-${crypto.randomUUID()}`,stage:'write',provider:options.provider,model:options.model,startedAt:new Date().toISOString(),status:'started',usage:unavailableAIUsage()};receipts.push(receipt);await save();const dispatched=performance.now();console.log(`Writer ${f.scaffoldId} attempt ${attempt+1}`);
    let payload:any;try{const response=await fetch(new URL('/api/generate',options.serviceUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:options.provider,model:options.model,apiKey:options.apiKey??'',...(options.baseUrl?{baseUrl:options.baseUrl}:{}),requestId:receipt.id,prompt,...(outputSchema?{outputSchema}:{}),maxOutputTokens:8000,jsonMode:options.provider!=='anthropic',timeoutMs:options.timeoutMs}),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs+5000)]):AbortSignal.timeout(options.timeoutMs+5000)});payload=await response.json();try{receipt.usage=validateAITokenUsage(payload.usage);}catch{}receipt.status=response.ok?'completed':'failed';receipt.durationMs=Math.round(performance.now()-dispatched);receipt.finishedAt=new Date().toISOString();if(Array.isArray(payload.actualModels))receipt.actualModels=payload.actualModels.filter((m:unknown)=>typeof m==='string');if(!response.ok||typeof payload.text!=='string')throw Error(typeof payload.code==='string'?payload.code:'PROVIDER_FAILED');
     accepted=validateWriterReply(f,input,payload.text,!!outputSchema);receipt.validation='accepted';attempts.push({attempt:attempt+1,status:accepted.status,responseText:payload.text});status=accepted.status;break;
    }catch(error){diagnostic=(error as Error).message.replace(/https?:\/\/\S+/g,'[address omitted]').replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9_\-.]+/gi,'[credential omitted]').slice(0,700);if(receipt.status==='started'){receipt.status='failed';receipt.durationMs=Math.round(performance.now()-dispatched);receipt.finishedAt=new Date().toISOString();}if(receipt.status==='completed')receipt.validation='rejected';attempts.push({attempt:attempt+1,status:'rejected',diagnostic,...(typeof payload?.text==='string'?{responseText:payload.text}:{})});if(options.signal?.aborted){receipt.status='canceled';status='canceled';break;}if(receipt.status==='failed'){status='provider-failed';if(attempt<options.repairs&&['PROVIDER_INVALID_RESPONSE','PROVIDER_TRUNCATED'].includes(payload?.code))continue;break;}}
    finally{await atomic(join(options.output,f.scaffoldId+'.attempts.json'),{scaffoldId:f.scaffoldId,receipts,attempts});}
   }
  }catch(error){status='blocked';attempts.push({status:'blocked',diagnostic:(error as Error).message});}
  const valid=accepted?.status==='valid-draft',activity=valid?accepted.activity:undefined;
  const result={scaffoldId:f.scaffoldId,status,ageGroup:f.ageGroup,kind:f.activity.kind,requiredCapabilities:f.requiredCapabilities,sourceHash:input?textDigest(input.source.text):null,durationMs:Math.round(performance.now()-started),receipts,attempts:attempts.map(({responseText,...rest})=>rest),actualModels:[...new Set(receipts.flatMap(r=>r.actualModels??[]))],metrics:{contractValidity:valid?'pass':'unverified',sourceCitationFidelity:activity&&input?activity.sourceRefs.every(r=>input!.notebook.sources.some(s=>s.id===r.sourceId&&s.text.includes(r.evidence)))?'pass':'fail':'unverified',requiredCapabilities:activity?fitsSpecificContract(f.scaffoldId,activity)?'pass':'fail':'unverified',sourceChangeInvalidates:activity&&input?!validateActivity(activity,input.notebook.sources.map(s=>({...s,text:'Changed benchmark source revision.'}))).success?'pass':'fail':'unverified',draftStatusPreserved:activity?activity.reviewStatus==='needs-review'?'pass':'fail':'unverified',lessonReadability:'unverified',nativeControlsAndAssessment:'unverified',pauseResume:'unverified',prerequisiteSemanticFit:'unverified'},...(accepted?{result:accepted}:{})};
  active.delete(f.scaffoldId);cases.push(result);await atomic(join(options.output,f.scaffoldId+'.result.json'),result);await save();console.log(`Writer ${f.scaffoldId}: ${status}; ${receipts.length} requests; ${Math.round((performance.now()-started)/1000)}s`);
 }}));await persist;return report();
}
async function main(){const args=process.argv.slice(2),arg=(name:string,fallback?:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};const selected=arg('--scaffolds','all')!,scaffoldIds=selected==='all'?nativeFactoryFixtures().map(f=>f.scaffoldId):selected.split(',');
 if(!args.includes('--execute-live')){console.log(JSON.stringify({status:'unverified',component:'writer-only',scaffoldIds,reason:'Explicit --execute-live and connection required.'},null,2));return;}
 const concurrency=Number(arg('--concurrency','2')),repairs=Number(arg('--repairs','1'));if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3||!Number.isInteger(repairs)||repairs<0||repairs>1)throw Error('Use 1–3 concurrent requests and 0–1 repairs.');
 const binary=arg('--system-claude');let service:any,url=arg('--service-url');if(binary){service=await createService({port:0,dataDir:await mkdtemp(join(tmpdir(),'asterloom-writer-service-')),engineConnections:{claude:systemClaudeBenchmarkConnection(resolve(binary),{...(arg('--thinking-budget')!==undefined?{thinkingBudget:Number(arg('--thinking-budget'))}:{}),captureDirectory:join(resolve(arg('--output','.qa/native-factory-writer')!),'provider-results')})}});url=`http://127.0.0.1:${service.port}`;}
 if(!url)throw Error('Explicit loopback service URL required.');const origin=new URL(url);if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Service URL must be loopback HTTP.');
 const keyEnv=arg('--api-key-env'),controller=new AbortController(),cancel=()=>controller.abort(new Error('Benchmark interrupted; unfinished provider usage remains unknown.'));process.once('SIGINT',cancel);process.once('SIGTERM',cancel);try{await runWriterBenchmark({serviceUrl:url,provider:arg('--provider',binary?'claude-code':undefined)!,model:arg('--model',binary?'haiku':undefined)!,apiKey:keyEnv?process.env[keyEnv]:undefined,baseUrl:arg('--base-url'),output:resolve(arg('--output','.qa/native-factory-writer')!),scaffoldIds,concurrency,repairs,timeoutMs:Number(arg('--timeout-ms','180000')),signal:controller.signal,...(arg('--thinking-budget')!==undefined?{thinkingBudget:Number(arg('--thinking-budget'))}:{})});}finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);await service?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
