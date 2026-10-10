import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {nativeFactoryFixtures} from '../../tests/fixtures/nativeFactoryBenchmark';
import {SCAFFOLDS} from '../../src/data/scaffolds';
import {validateActivity,evaluateActivity} from '../../src/lib/structuredEngine';
import {fitsSpecificContract,resolveScaffoldRuntime} from '../../src/lib/scaffoldRuntime';
import {textDigest} from '../../src/lib/evidence';
import {pictureBuildChecks} from '../../src/lib/pictureBuildEngine';
import {referenceResponses} from './responses';

export type MetricStatus='pass'|'fail'|'blocked'|'unverified';
export interface Metric {status:MetricStatus;detail:string;value?:unknown}
const metric=(status:MetricStatus,detail:string,value?:unknown):Metric=>({status,detail,...(value===undefined?{}:{value})});
const measured=(okay:boolean,detail:string,value?:unknown)=>metric(okay?'pass':'fail',detail,value);
export interface NativeEvidence {version:number;cases:{scaffoldId:string;activityId?:string;kind?:string;rendered?:boolean;controlCount?:number;controlTypes?:Record<string,number>;evaluationCorrect?:{ok?:boolean;evaluation?:unknown};evaluationWrong?:{ok?:boolean;evaluation?:unknown};resumeEqual?:boolean;sourceInvalidationRejected?:boolean;error?:string}[];elapsedMs?:number}
/** The offline gate measures reference contracts. It never certifies learner
 * outcomes, human readability, live provider quality, or real native interaction. */
export function buildOfflineReport(native?:NativeEvidence){
 const fixtures=nativeFactoryFixtures(),cases:any[]=[],nativeCases:any[]=[];
 for(const f of fixtures){
  const start=performance.now();
  // This detached object exists solely inside the benchmark. Stored fixture and
  // production notebook status remain unchanged and are reported alongside it.
  const a={...structuredClone(f.activity),reviewStatus:'reviewed' as const};
  const validation=validateActivity(a,f.sources),citations=a.sourceRefs.map(r=>({sourceId:r.sourceId,exact:f.sources.some(s=>s.id===r.sourceId&&s.text.includes(r.evidence))}));
  const stale=f.sources.map(s=>({...s,text:'Source replaced by a different benchmark revision.'}));
  const specific=f.requiredKinds.includes(a.kind)&&fitsSpecificContract(f.scaffoldId,a)&&a.scaffoldIds?.includes(f.scaffoldId);
  const staleRejected=!validateActivity(a,stale).success&&!resolveScaffoldRuntime(f.scaffoldId,{ageGroup:f.ageGroup,cards:[],activities:[a],sources:stale}).available;
  let responses:ReturnType<typeof referenceResponses>|undefined,positive:unknown,negative:unknown,responseError:string|undefined,positiveOkay=false,negativeOkay=false,adversarialOkay=false;
  if(validation.success)try{responses=referenceResponses(a);positive=evaluateActivity(a,responses.correctResponse);negative=evaluateActivity(a,responses.wrongResponse);positiveOkay=responses.expectedPositive==='picture-constraints-only'&&a.kind==='picture-build'?pictureBuildChecks(a,responses.correctResponse as any).every(x=>x.correct===true)&&(positive as any).correct===false:(positive as any).correct===true;negativeOkay=(negative as any).correct===false||(negative as any).correct===null&&!(negative as any).valid;adversarialOkay=evaluateActivity(a,responses.adversarialResponse).correct!==true;}catch(error){responseError=(error as Error).message;}
  const nativeRow=native?.cases.find(c=>c.scaffoldId===f.scaffoldId&&c.activityId===a.id&&c.kind===a.kind),nativeMissing=metric('unverified','No matching native Godot smoke evidence supplied.');
  const words=f.lesson.text.match(/\S+/g)??[],sentences=f.lesson.text.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
  const metrics={
   sourceCitationFidelity:measured(citations.every(c=>c.exact),'Exact source spans only; semantic entailment still needs review.',{references:citations.length,exact:citations.filter(c=>c.exact).length}),
   contractValidity:measured(validation.success,'Full application validator, including source checks.',validation.success?[]:validation.errors),
   prerequisiteFulfilment:measured(Boolean(specific)&&f.prerequisiteEvidence.every(t=>f.sources.some(s=>s.text.includes(t))),'Explicit fixture binding, required kind/capabilities, and quoted prerequisite evidence; not independent domain approval.',{prerequisites:f.prerequisites,evidence:f.prerequisiteEvidence,semanticReview:'unverified'}),
   lessonReadability:metric('unverified','Fixture explanation has basic length statistics; human age/readability and full generated lesson quality were not tested.',{wordCount:words.length,sentenceCount:sentences.length,averageWordsPerSentence:sentences.length?Math.round(words.length/sentences.length*10)/10:null}),
   correctOutput:validation.success?measured(positiveOkay,responseError??(responses?.expectedPositive==='picture-constraints-only'?'Picture geometry succeeds; the actual human-review gate remains unfinished.':'Reference positive response checked against the deterministic evaluator.'),positive):metric('blocked','Invalid fixture contract.'),
   wrongOutput:validation.success?measured(negativeOkay,responseError??'The contrasting wrong response cannot earn a correct outcome.',negative):metric('blocked','Invalid fixture contract.'),
   malformedResponse:validation.success?measured(adversarialOkay,'Malformed response cannot earn a correct outcome.'):metric('blocked','Invalid fixture contract.'),
   sourceChangeInvalidates:measured(staleRejected,'Replacing cited source content invalidates both validation and scored eligibility.'),
   playableControlCoverage:nativeRow?measured(nativeRow.rendered===true&&(nativeRow.controlCount??0)>0,'Observed native rendering/control inventory; does not establish manual interaction parity.',{count:nativeRow.controlCount,types:nativeRow.controlTypes,error:nativeRow.error}):nativeMissing,
   nativeCorrectOutput:nativeRow?measured(nativeRow.evaluationCorrect?.ok===true&&isDeepStrictEqual(nativeRow.evaluationCorrect.evaluation,positive),'Native bridge result compared with application reference evaluation.',nativeRow.evaluationCorrect):nativeMissing,
   nativeWrongOutput:nativeRow?measured(nativeRow.evaluationWrong?.ok===true&&isDeepStrictEqual(nativeRow.evaluationWrong.evaluation,negative),'Native bridge wrong-result comparison.',nativeRow.evaluationWrong):nativeMissing,
   pauseResume:nativeRow?measured(nativeRow.resumeEqual===true,'Native saved response reload equality; does not establish a manual interruption test.'):nativeMissing,
   nativeSourceChangeInvalidates:nativeRow?measured(nativeRow.sourceInvalidationRejected===true,'Native bridge rejects changed cited source content.'):nativeMissing,
   liveProviderQuality:metric('unverified','No live provider result is implied by this deterministic fixture run.'),
  };
  const contractKeys=['sourceCitationFidelity','contractValidity','prerequisiteFulfilment','correctOutput','wrongOutput','malformedResponse','sourceChangeInvalidates'] as const;
  const contractPass=contractKeys.every(k=>metrics[k].status==='pass');
  cases.push({...f,positiveInput:undefined,adversarialInputs:f.adversarialInputs.map(({notebook,...x})=>({...x,sourceHash:textDigest(notebook.sources[0].text)})),activity:undefined,sources:undefined,metrics,contractStatus:contractPass?'pass':'fail',originalReviewStatus:f.activity.reviewStatus,testOnlyReferenceModel:true,referenceActivityHash:textDigest(JSON.stringify(a)),referenceLatencyMs:Math.round((performance.now()-start)*1000)/1000,providerReportedTokens:null,providerLatencyMs:null,notes:responses?.notes??[],...(responseError?{responseError}:{})});
  if(responses)nativeCases.push({scaffoldId:f.scaffoldId,ageGroup:f.ageGroup,activity:a,sources:f.sources,...responses,originalReviewStatus:f.activity.reviewStatus,testOnlyReferenceModel:true,referenceActivityHash:textDigest(JSON.stringify(a)),sourceHashes:f.sourceHashes,expectedCorrectEvaluation:positive,expectedWrongEvaluation:negative});
 }
 const expected=SCAFFOLDS.map(s=>s.id),coverage=cases.length===75&&new Set(cases.map(c=>c.scaffoldId)).size===75&&expected.every(id=>cases.some(c=>c.scaffoldId===id));
 const pass=coverage&&cases.every(c=>c.contractStatus==='pass');
 const nativePass=coverage&&cases.every(c=>['playableControlCoverage','nativeCorrectOutput','nativeWrongOutput','pauseResume','nativeSourceChangeInvalidates'].every(k=>c.metrics[k].status==='pass'));
 return{report:{version:1,recordedAt:new Date().toISOString(),scope:'All 75 source/model reference contracts. No generated-content approval or live-provider quality claim.',gates:{all75Records:coverage,referenceContracts:pass,nativeAutomatedSmoke:nativePass,humanReadability:false,liveProviderQuality:false},counts:{expected:75,records:cases.length,referencePass:cases.filter(c=>c.contractStatus==='pass').length,referenceFail:cases.filter(c=>c.contractStatus==='fail').length,nativeRendered:cases.filter(c=>c.metrics.playableControlCoverage.status==='pass').length,liveProviderVerified:0},cases},nativeManifest:{version:1,scope:'Test-only detached reference models; never load as user-approved educational content.',cases:nativeCases}};
}
async function main(){
 const args=process.argv.slice(2),arg=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 const dir=resolve(arg('--output')??'.qa/native-factory-benchmark'),nativePath=arg('--native-results');
 const native=nativePath?JSON.parse(await readFile(resolve(nativePath),'utf8')) as NativeEvidence:undefined;
 const {report,nativeManifest}=buildOfflineReport(native);await mkdir(dir,{recursive:true});
 await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(resolve(dir,'native-manifest.json'),JSON.stringify(nativeManifest,null,2)+'\n');
 await writeFile(resolve(dir,'authoring-inputs.json'),JSON.stringify({version:1,cases:nativeFactoryFixtures().map(f=>({scaffoldId:f.scaffoldId,positive:f.positiveInput,adversarial:f.adversarialInputs}))},null,2)+'\n');
 console.log(JSON.stringify({output:dir,counts:report.counts,gates:report.gates},null,2));
 if(!report.gates.referenceContracts||args.includes('--require-native')&&!report.gates.nativeAutomatedSmoke)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
