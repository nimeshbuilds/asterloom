import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFactoryFixtures} from '../../tests/fixtures/nativeFactoryBenchmark';
import {SUPPLEMENTAL_FACTORY_FIXTURES} from '../../tests/fixtures/native-factory-benchmark/supplemental';
import {buildOfflineReport} from './offline';
import {evaluateActivity,validateActivity} from '../../src/lib/structuredEngine';
import {SCAFFOLDS} from '../../src/data/scaffolds';
import {writerInput,runWriterBenchmark,validateWriterReply} from './writer';
import {getGameDirectorOutputSchema} from '../../src/lib/gameDirectorSchemas';
import {compactGameOutputSchema} from '../../src/lib/gameOutputSchema';
import {boundedOutputSchema} from '../../server/output-schema.mjs';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observedRequestTiming,summarizeLive,observedFailureCategory} from './summarize-live';
import {referenceResponses} from './responses';
import {generatedNativeManifest} from './generated-native';
import {resultLedger,ledgerMarkdown} from './publish-results';
import {systemClaudeBenchmarkConnection} from './system-claude';
import {directorFixtureResponse} from '../../tests/gameDirector.fixture';
import {runCheckerReplay} from './checker';
import {benchmarkGuard,liveFactoryBenchmark,sourceInvalidationProbe} from './live';
import {emptyGameDesign} from '../../src/lib/gameDesign';

test('source replacement resets creation and rejects stale content while retaining audit provenance',()=>{
 const fixture=nativeFactoryFixtures().find(row=>row.scaffoldId==='process-reconstruction')!,notebook=structuredClone(fixture.positiveInput);
 notebook.gameDesign=emptyGameDesign(notebook,{id:'local',model:'fixture-model',endpointFingerprint:null},[],[{id:'director-'+'a'.repeat(40),fingerprint:'b'.repeat(64)}]);
 const probe=sourceInvalidationProbe(notebook,[fixture.activity]);assert.equal(probe.status,'pass');assert.equal(probe.revisionChanged,true);assert.equal(probe.plannedContentReset,true);assert.equal(probe.staleActivitiesRejected,true);assert.equal(probe.provenanceRecordsRetained,1);
 assert.equal(sourceInvalidationProbe(notebook,[]).status,'fail');assert.equal(sourceInvalidationProbe({...notebook,gameDesign:undefined},[]).status,'unverified');
});

test('live benchmark guard enforces a whole-run deadline and stops on low or unverifiable disk space',async()=>{
 const disk=await benchmarkGuard({directory:tmpdir(),minFreeDiskBytes:200,inspectDisk:async()=>199});
 try{assert.equal(disk.signal.aborted,true);assert.equal(disk.snapshot().stoppedReason,'benchmark-disk-reserve');}finally{disk.close();}
 const unavailable=await benchmarkGuard({directory:tmpdir(),minFreeDiskBytes:200,inspectDisk:async()=>{throw Error('Unavailable');}});
 try{assert.equal(unavailable.signal.aborted,true);assert.equal(unavailable.snapshot().lastFreeDiskBytes,null);assert.equal(unavailable.snapshot().stoppedReason,'benchmark-disk-check-unavailable');}finally{unavailable.close();}
 const deadline=await benchmarkGuard({directory:tmpdir(),overallTimeoutMs:10});
 try{await new Promise(resolve=>deadline.signal.addEventListener('abort',resolve,{once:true}));assert.equal(deadline.snapshot().stoppedReason,'benchmark-overall-deadline');}finally{deadline.close();}
});

test('whole-run deadline preserves the dispatched production receipt and does not invent local-model usage',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-live-deadline-test-')),original=globalThis.fetch;let calls=0;
 const mockFetch=(async(_url,init)=>{calls++;return await new Promise((_resolve,reject)=>{if(init?.signal?.aborted)reject(init.signal.reason);else init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});});}) as typeof fetch;globalThis.fetch=mockFetch;
 try{const report=await liveFactoryBenchmark({output,serviceUrl:'http://127.0.0.1:1',config:{provider:'local',model:'gemma4:e4b-it-qat',apiKey:''},scaffoldIds:['process-reconstruction'],variants:['heldout-procedure'],repeat:1,maxRequests:8,timeoutMs:1000,overallTimeoutMs:150,resume:false});assert.equal(calls,1);assert.equal(report.trials[0].receipts.length,1);assert.equal(report.trials[0].usage.total.value,null);assert.equal(report.settings.guard.stoppedReason,'benchmark-overall-deadline');assert.equal(report.trials[0].status,'canceled');assert.equal((report.trials[0].receipts[0] as any).status,'canceled');assert.equal(globalThis.fetch,mockFetch);}finally{globalThis.fetch=original;await rm(output,{recursive:true,force:true});}
});

test('check replay uses the production check contract, preserves writer output, and keeps every repair receipt',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-check-replay-test-')),original=globalThis.fetch,fixture=nativeFactoryFixtures().find(f=>f.scaffoldId==='process-reconstruction')!,input=writerInput(fixture),data=JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]),reply=directorFixtureResponse('write',data),activity=structuredClone(fixture.activity);
 delete activity.scaffoldIds;delete activity.extractedFrom;activity.id='assistant-draft';activity.reviewStatus='needs-review';reply.missions[0].activity=activity;const accepted=validateWriterReply(fixture,input,JSON.stringify(reply)),saved=JSON.stringify({status:'valid-draft',result:accepted});let calls=0;
 await writeFile(join(output,fixture.scaffoldId+'.input.json'),JSON.stringify(input));await writeFile(join(output,fixture.scaffoldId+'.result.json'),saved);
 globalThis.fetch=(async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.match(body.prompt,/STAGE: check/);assert.ok(body.outputSchema);assert.equal(body.maxOutputTokens,2000);assert.ok(!body.prompt.includes('expectedVerdict'));const verdict={missionId:'mission-1',decision:'source-study',reason:'Test fixture source-grounding rejection.',...(calls===2?{quality:{understandable:true,lessonSupportsTask:false,controlsMatch:true,feedbackExplains:false}}:{})};return{ok:true,json:async()=>({text:JSON.stringify({checks:[verdict]}),usage:{status:'reported',inputTokens:100,outputTokens:60,cachedInputTokens:30,cacheWriteTokens:0,reasoningTokens:10,totalTokens:160},actualModels:['fixture-model']})} as Response;}) as typeof fetch;
 try{const report=await runCheckerReplay({serviceUrl:'http://127.0.0.1:1',model:'fixture-model',artifactDirectory:output,scaffoldId:fixture.scaffoldId,output:join(output,'check'),timeoutMs:1000});assert.equal(calls,2);assert.equal(report.trials[0].status,'source-study');assert.equal(report.trials[0].receipts.length,2);assert.equal(report.trials[0].usage.total.value,320);assert.equal(report.trials[0].metrics.originalWriterDraftUnchanged,true);assert.equal(await readFile(join(output,fixture.scaffoldId+'.result.json'),'utf8'),saved);}finally{globalThis.fetch=original;await rm(output,{recursive:true,force:true});}
});

test('writer component resolves production citation IDs before strict validation and rejects stale IDs',()=>{
 const fixture=nativeFactoryFixtures().find(f=>f.scaffoldId==='process-reconstruction')!,input=writerInput(fixture),data=JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]),reply=directorFixtureResponse('write',data),activity=structuredClone(fixture.activity);
 delete activity.scaffoldIds;delete activity.extractedFrom;activity.id='assistant-draft';activity.reviewStatus='needs-review';reply.missions[0].activity=activity;
 const literal=validateWriterReply(fixture,input,JSON.stringify(reply)),choice=data.missions[0].citationChoices.entries.find((entry:any)=>entry.evidence===input.source.text&&entry.activity&&entry.teaching);
 assert.ok(choice);
 const replace=(value:any):any=>Array.isArray(value)?value.map(replace):value&&typeof value==='object'?typeof value.sourceId==='string'&&typeof value.evidence==='string'?{sourceId:value.sourceId,evidenceId:choice.evidenceId}:Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,replace(entry)])):value;
 const encoded=replace(reply),resolved=validateWriterReply(fixture,input,JSON.stringify(encoded));assert.deepEqual(resolved,literal);assert.equal(resolved.status,'valid-draft');
 encoded.missions[0].activity.sourceRefs[0].evidenceId+='-stale';assert.throws(()=>validateWriterReply(fixture,input,JSON.stringify(encoded)),/unknown, stale or outside/);
});

test('benchmark Claude transport forwards schema and bounded tools, captures real counters, and rejects formatter failures',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-system-claude-transport-test-')),binary=join(output,'fake-claude');
 await writeFile(binary,`#!/usr/bin/env node
process.stdin.resume();process.stdin.on('end',()=>{
 const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
 if(value('--tools')!==''||value('--allowedTools')!=='StructuredOutput'||value('--disallowedTools')!=='mcp__*'||value('--max-turns')!=='3'||process.env.MAX_THINKING_TOKENS!=='0'||!JSON.parse(value('--json-schema')).required.includes('ok'))process.exit(8);
 const fail=value('--model')==='format-failure';
 process.stderr.write('PRIVATE_DIAGNOSTIC_SENTINEL');
 console.log(JSON.stringify({type:'result',subtype:fail?'error_max_structured_output_retries':'success',is_error:fail,stop_reason:'tool_use',...(fail?{}:{structured_output:{ok:true}}),usage:{input_tokens:10,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:15,output_tokens_details:{thinking_tokens:0}},modelUsage:{'claude-fake':{}},num_turns:2,duration_ms:12,duration_api_ms:8}));process.exitCode=fail?1:0;
});`,{mode:0o700});
 const adapter=systemClaudeBenchmarkConnection(binary,{captureDirectory:join(output,'captures'),thinkingBudget:0}),schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
 try{
  const reply=await adapter.generate({requestId:'success',model:'test',prompt:'Test fixture only.',outputSchema:schema});assert.deepEqual(JSON.parse(reply.text),{ok:true});assert.deepEqual(reply.actualModels,['claude-fake']);
  const capture=await readFile(join(output,'captures','success.provider.json'),'utf8'),parsed=JSON.parse(capture);assert.equal(parsed.numTurns,2);assert.equal(parsed.providerApiDurationMs,8);assert.equal(parsed.benchmarkThinkingBudget,0);assert.ok(!capture.includes('PRIVATE_DIAGNOSTIC_SENTINEL'));
  await assert.rejects(adapter.generate({requestId:'failure',model:'format-failure',prompt:'Test fixture only.',outputSchema:schema}),(error:any)=>error.code==='PROVIDER_INVALID_RESPONSE'&&error.aiUsage.totalTokens===25&&error.actualModels[0]==='claude-fake');
 }finally{await adapter.close();await rm(output,{recursive:true,force:true});}
});

test('tracked result ledger preserves every outcome and hashes inputs without copying model or source text',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-result-ledger-test-'));
 try{
  const path=join(output,'writer-report.json'),id='concept-map-repair';await writeFile(join(output,id+'.input.json'),JSON.stringify({prompt:'PRIVATE_PROMPT_SENTINEL',notebook:{sources:[{text:'PRIVATE_SOURCE_SENTINEL'}]},outputSchema:{type:'object'}}));
  await writeFile(path,JSON.stringify({recordedAt:'2026-01-01T00:00:00Z',scope:'writer only',provider:{model:'fixture'},counts:{selected:75,finished:1},coverage:SCAFFOLDS.map(s=>({scaffoldId:s.id,status:s.id===id?'failed':'unverified'})),cases:[{scaffoldId:id,status:'failed',receipts:[{id:'unknown-receipt',stage:'write',status:'failed'}],result:{responseText:'PRIVATE_OUTPUT_SENTINEL'},attempts:[{attempt:1,diagnostic:'Exact evidence failed',responseText:'PRIVATE_OUTPUT_SENTINEL'}]}]}));
  const ledger=await resultLedger([{id:'test-cohort',path}]),encoded=JSON.stringify(ledger);assert.equal(ledger.cohorts[0].cases.length,75);assert.equal(ledger.cohorts[0].complete,false);assert.match(ledger.cohorts[0].cases[0].inputHash!,/^[a-f0-9]{64}$/);assert.ok(!encoded.includes('PRIVATE_'));assert.ok(!encoded.includes(output));assert.match(ledgerMarkdown(ledger),/valid-draft.*local writing checks/);
 }finally{await rm(output,{recursive:true,force:true});}
});

test('local full-flow ledger preserves alternate recipe success, exact request hashes and effective backend settings',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-local-ledger-test-')),id='process-reconstruction',variant='cited-source-only',requestId='request-fixture';
 try{
  await writeFile(join(output,'cohort-context.json'),JSON.stringify({inferenceSettings:{think:false},modelManifestSha256:'a'.repeat(64)}));
  await writeFile(join(output,`${id}-${variant}-1.result.json`),JSON.stringify({notebook:{ageGroup:'adult',sources:[{id:'source',text:'PRIVATE_SOURCE_SENTINEL'}],gameDesign:{inputRevision:'b'.repeat(64),events:[]}}}));
  await writeFile(join(output,`${id}-${variant}-1.request-${requestId}.json`),JSON.stringify({prompt:'PRIVATE_PROMPT_SENTINEL',outputSchema:{type:'object'}}));
  const path=join(output,'live-report.json');await writeFile(path,JSON.stringify({recordedAt:'2026-01-01T00:00:00Z',provider:{provider:'local',model:'fixture-model',thinkingBudget:'provider-default'},counts:{selected:1,trials:1},coverage:[{scaffoldId:id,status:'blocked-or-unfinished'}],trials:[{scaffoldId:id,variant,repeat:1,resultStatus:'ready',status:'different-recipe',requestedRecipeGenerated:false,actualScaffoldIds:['claim-verification'],actualModels:['fixture-model'],metrics:{sourceChangeInvalidates:{status:'fail'}},receipts:[{id:requestId,stage:'plan',status:'completed',actualModels:['fixture-model'],usage:{totalTokens:10}}]}]}));
  const ledger=await resultLedger([{id:'local',path}]),trial=ledger.cohorts[0].trials[0];assert.equal(trial.flowCompleted,true);assert.equal(trial.requestedRecipeGenerated,false);assert.deepEqual(trial.actualScaffoldIds,['claim-verification']);assert.match(trial.requestContractRevision!,/^[a-f0-9]{64}$/);assert.equal(trial.metrics.sourceChangeInvalidates.status,'fail');assert.deepEqual(ledger.cohorts[0].effectiveInferenceSettings,{think:false});assert.deepEqual(ledger.modelCapabilityEvidence[0].producedScaffoldIds,['claim-verification']);assert.equal(ledger.modelCapabilityEvidence[0].productionQualification,'unverified');assert.ok(!JSON.stringify(ledger).includes('PRIVATE_'));assert.match(ledgerMarkdown(ledger),/backend used think:false/);
 }finally{await rm(output,{recursive:true,force:true});}
});

test('final failure buckets separate account availability, formatting, timeout and local validation without changing statuses',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-failure-buckets-test-'));
 try{
  await mkdir(join(output,'provider-results'));
  const fixtures=[{id:'quota',status:'provider-failed',raw:{is_error:true,subtype:'success',result:"You've hit your session limit · resets later"},diagnostic:'PROVIDER_UNAVAILABLE',tokens:0},{id:'format',status:'provider-failed',raw:{is_error:true,subtype:'error_max_turns'},diagnostic:'PROVIDER_UNAVAILABLE',tokens:40},{id:'timeout',status:'provider-failed',diagnostic:'PROVIDER_TIMEOUT',tokens:null},{id:'local',status:'failed',diagnostic:'Exact evidence failed',tokens:80}];
  for(const row of fixtures)if(row.raw)await writeFile(join(output,'provider-results',row.id+'.provider.json'),JSON.stringify(row.raw));
  const path=join(output,'writer-report.json');await writeFile(path,JSON.stringify({recordedAt:'2026-01-01T00:00:00Z',counts:{selected:4,finished:4},coverage:fixtures.map(row=>({scaffoldId:row.id,status:row.status})),cases:fixtures.map(row=>({scaffoldId:row.id,status:row.status,receipts:[{id:row.id,stage:'write',status:row.id==='local'?'completed':'failed',validation:row.id==='local'?'rejected':undefined,usage:{totalTokens:row.tokens}}],attempts:[{attempt:1,diagnostic:row.diagnostic}]}))}));
  const ledger=await resultLedger([{id:'outcomes',path}]),outcomes=ledger.cohorts[0].writerOutcomes!;
  assert.deepEqual(outcomes.failureBuckets,{'account-session-limit':1,'structured-output-turn-limit':1,'provider-timeout':1,'local-contract-rejection':1});assert.equal(outcomes.accountLimitZeroTokenCases,1);assert.equal(outcomes.requestsWithUnknownTotal,1);assert.equal(outcomes.localContractFailures,1);assert.equal(outcomes.providerFailures,3);assert.equal(ledger.cohorts[0].cases[0].status,'provider-failed');assert.equal(ledger.modelCapabilityEvidence[0].failureBucket,'account-session-limit');
  assert.equal(observedFailureCategory({is_error:false,subtype:'success',result:"You've hit your session limit"},{status:'completed'}),null);assert.equal(observedFailureCategory({is_error:true,subtype:'success',result:'Another failure'},{status:'failed'}),'other-provider-failure');
 }finally{await rm(output,{recursive:true,force:true});}
});

test('generated campaign assessment follows actual identifiers and budget witness search supports quantities above 100',()=>{
 const campaign=nativeFactoryFixtures().find(f=>f.activity.kind==='scenario'&&f.activity.scenarioPresentation?.campaign)!.activity;
 assert.equal(campaign.kind,'scenario');
 const renamed=JSON.parse(JSON.stringify(campaign).replaceAll('"inspect-notebook"','"inspect-new-case"').replaceAll('"establish-control"','"first-new-stage"'));renamed.reviewStatus='reviewed';
 const responses=referenceResponses(renamed,{generalCampaign:true});assert.equal(evaluateActivity(renamed,responses.correctResponse).correct,true);assert.equal(evaluateActivity(renamed,responses.wrongResponse).correct,false);
 const budget={...structuredClone(nativeFactoryFixtures().find(f=>f.activity.kind==='budget')!.activity),reviewStatus:'reviewed' as const,kind:'budget' as const,budget:200,currency:'credits',items:[{id:'one',label:'One',cost:1,unit:'item',maxQuantity:200}],requirements:[{id:'minimum',label:'Minimum',minimum:101,contributions:{one:1}}]};
 const allocation=referenceResponses(budget);assert.equal(evaluateActivity(budget,allocation.correctResponse).correct,true);assert.deepEqual(allocation.correctResponse,{quantities:{one:101}});
});
test('generated native snapshots keep undispatched recipe identities explicitly unverified',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-generated-native-pending-test-'));
 try{const path=join(output,'writer-report.json');await writeFile(path,JSON.stringify({cases:[],coverage:SCAFFOLDS.map(s=>({scaffoldId:s.id,status:'unverified'}))}));const result=await generatedNativeManifest(path);assert.equal(result.counts.generatedDrafts,0);assert.equal(result.counts.unverified,75);assert.ok(result.unverified.every(row=>row.status==='unverified'));}finally{await rm(output,{recursive:true,force:true});}
});

test('observed live timing separates concurrent request durations from elapsed time and preserves unknown usage',async()=>{
 const base=Date.parse('2026-01-01T00:00:00Z'),at=(ms:number)=>new Date(base+ms).toISOString(),unknown={status:'unavailable',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null};
 const receipts=[{id:'first',stage:'write',startedAt:at(0),finishedAt:at(1000),durationMs:1000,status:'completed',usage:{status:'reported',inputTokens:100,outputTokens:50,cachedInputTokens:70,cacheWriteTokens:20,reasoningTokens:30,totalTokens:150}},{id:'second',stage:'write',startedAt:at(500),finishedAt:at(2000),durationMs:1500,status:'failed',usage:unknown},{id:'third',stage:'write',startedAt:at(1000),status:'started',usage:unknown}];
 const timing=observedRequestTiming(receipts,at(2500));assert.equal(timing.peakConcurrentRequests,2);assert.equal(timing.observedWindowMs,2500);assert.equal(timing.requestDurationMs.median,1000);assert.equal(timing.requestDurationMs.p95,1500);assert.equal(timing.unmeasuredDurations,1);assert.equal(timing.active[0].elapsedMs,1500);
 const output=await mkdtemp(join(tmpdir(),'asterloom-live-summary-test-'));
 try{
  await mkdir(join(output,'provider-results'));await writeFile(join(output,'provider-results','second.provider.json'),JSON.stringify({subtype:'error_max_turns',usage:{iterations:[{},{}]}}));
  const path=join(output,'writer-report.json');await writeFile(path,JSON.stringify({recordedAt:at(2500),cases:[{scaffoldId:'first',receipts:receipts.slice(0,2),attempts:[{attempt:1,diagnostic:'Teaching evidence must be an exact substring of its disclosed source unit.'},{attempt:2,diagnostic:'PROVIDER_UNAVAILABLE'}]}],inProgress:[{scaffoldId:'active',receipts:receipts.slice(2)}],coverage:[{scaffoldId:'unsent',status:'unverified'}]}));
  const summary=await summarizeLive(path);assert.deepEqual(summary.byStage.write.totalTokens,{value:150,reported:1,missing:2});assert.equal(summary.byStage.write.inputTokens.value,100);assert.equal(summary.byStage.write.outputTokens.value,50);assert.equal(summary.byStage.write.reasoningTokens.value,30);assert.equal(summary.providerSubtypes.error_max_turns,1);assert.equal(summary.attemptDiagnosticCategories['exact-source-citation'],1);assert.equal(summary.requests[1].providerTurns,null);assert.equal(summary.requests[1].providerUsageIterationEntries,2);assert.deepEqual(summary.unverified,['unsent']);
 }finally{await rm(output,{recursive:true,force:true});}
});

test('all 75 real writer inputs have a supported bounded Claude schema without exposing reference answers',()=>{
 for(const f of nativeFactoryFixtures()){
  const input=writerInput(f),data=JSON.parse(input.prompt.split('REFERENCE DATA (JSON):\n')[1]);
  const schema=getGameDirectorOutputSchema('write',data,{provider:'claude-code'});assert.ok(schema,f.scaffoldId);
  assert.doesNotThrow(()=>boundedOutputSchema(compactGameOutputSchema(schema!)),f.scaffoldId);
  assert.ok(!input.prompt.includes('correctResponse'));assert.ok(!input.prompt.includes('wrongResponse'));
 }
});
test('interrupted live writer work retains a canceled receipt with unknown usage and leaves unsent recipes unverified',async()=>{
 const output=await mkdtemp(join(tmpdir(),'asterloom-writer-cancel-test-')),original=globalThis.fetch,controller=new AbortController();let calls=0;
 globalThis.fetch=(async(_url,init)=>{calls++;const request=JSON.parse(String(init?.body));assert.ok(request.outputSchema);assert.match(request.requestId,/^request-/);controller.abort(new Error('Stopped by test'));throw controller.signal.reason;}) as typeof fetch;
 try{
  const result=await runWriterBenchmark({serviceUrl:'http://127.0.0.1:1',provider:'claude-code',model:'test-model',output,scaffoldIds:['concept-map-repair','classification-workshop'],concurrency:1,repairs:1,timeoutMs:1000,signal:controller.signal});
  assert.equal(calls,1);assert.equal(result.cases[0].status,'canceled');assert.equal(result.cases[0].receipts[0].status,'canceled');assert.equal(result.usage.total.value,null);assert.equal(result.inProgress.length,0);
  assert.equal(result.coverage.find(c=>c.scaffoldId==='classification-workshop')?.status,'unverified');
  const saved=JSON.parse(await readFile(join(output,'writer-report.json'),'utf8'));assert.equal(saved.cases[0].receipts[0].usage.status,'unavailable');
 }finally{globalThis.fetch=original;await rm(output,{recursive:true,force:true});}
});

test('all 75 manifest entries retain real bindings, source evidence, audience, and distinct adversarial sources',()=>{
 const fixtures=nativeFactoryFixtures();assert.equal(fixtures.length,75);assert.deepEqual(fixtures.map(f=>f.scaffoldId),SCAFFOLDS.map(s=>s.id));assert.equal(SUPPLEMENTAL_FACTORY_FIXTURES.length,37);
 for(const f of fixtures){assert.ok(f.activity.scaffoldIds?.includes(f.scaffoldId));assert.ok(f.supportedAges.includes(f.ageGroup));assert.equal(validateActivity(f.activity,f.sources).success,true,f.scaffoldId);assert.equal(f.adversarialInputs.length,2);for(const negative of f.adversarialInputs){assert.equal(negative.notebook.activities?.length,0);assert.equal(negative.notebook.cards.length,0);assert.notDeepEqual(negative.notebook.sources,f.sources);}assert.equal(f.lesson.humanReadability,'unverified');}
});
test('75 answer witnesses, contrasting wrong outputs and stale evidence are actually evaluated without approving stored drafts',()=>{
 const before=JSON.stringify(SUPPLEMENTAL_FACTORY_FIXTURES),{report,nativeManifest}=buildOfflineReport();assert.equal(report.gates.referenceContracts,true);assert.equal(report.counts.referencePass,75);assert.equal(nativeManifest.cases.length,75);assert.equal(JSON.stringify(SUPPLEMENTAL_FACTORY_FIXTURES),before);
 for(const fixture of SUPPLEMENTAL_FACTORY_FIXTURES){assert.equal(fixture.activity.reviewStatus,'needs-review');assert.equal(evaluateActivity(fixture.activity,{}).outcome,'draft-preview');}
 for(const row of report.cases){for(const key of ['sourceCitationFidelity','contractValidity','prerequisiteFulfilment','correctOutput','wrongOutput','sourceChangeInvalidates'])assert.equal(row.metrics[key].status,'pass',`${row.scaffoldId}: ${key}`);assert.equal(row.providerReportedTokens,null);assert.equal(row.providerLatencyMs,null);}
});
test('missing native, live, and human measurements remain unverified even with perfect reference coverage',()=>{
 const {report}=buildOfflineReport();assert.equal(report.gates.nativeAutomatedSmoke,false);assert.equal(report.gates.liveProviderQuality,false);assert.equal(report.gates.humanReadability,false);
 for(const row of report.cases)for(const key of ['playableControlCoverage','pauseResume','liveProviderQuality','lessonReadability'])assert.equal(row.metrics[key].status,'unverified');
});
test('external native success labels cannot replace matching evaluator outputs',()=>{
 const {report}=buildOfflineReport({version:1,cases:[{scaffoldId:'concept-map-repair',activityId:'example-dependencies',kind:'dependency',rendered:true,controlCount:10,controlTypes:{Button:10},resumeEqual:true,sourceInvalidationRejected:true,evaluationCorrect:{ok:true,evaluation:{correct:true}},evaluationWrong:{ok:true,evaluation:{correct:false}}}]});
 const row=report.cases.find(c=>c.scaffoldId==='concept-map-repair')!;assert.equal(row.metrics.playableControlCoverage.status,'pass');assert.equal(row.metrics.nativeCorrectOutput.status,'fail');assert.equal(row.metrics.nativeWrongOutput.status,'fail');assert.equal(report.gates.nativeAutomatedSmoke,false);
});
test('build and tell checks geometry while preserving the real caregiver approval boundary',()=>{
 const {report,nativeManifest}=buildOfflineReport(),row=report.cases.find(c=>c.scaffoldId==='build-and-tell')!,native=nativeManifest.cases.find(c=>c.scaffoldId==='build-and-tell')!;
 assert.equal(row.metrics.correctOutput.status,'pass');assert.equal(row.metrics.correctOutput.value.correct,false);assert.equal(row.metrics.correctOutput.value.maxScore,0);assert.equal(native.correctResponse.tell.reviewed,false);assert.equal(native.correctResponse.tell.reviewedState,null);
});
