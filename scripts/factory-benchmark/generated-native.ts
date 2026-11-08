import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {evaluateActivity,validateActivity,type StructuredActivity} from '../../src/lib/structuredEngine';
import {referenceResponses} from './responses';
import type {Source} from '../../src/types';

/** Native QA artifacts only. Saved AI drafts remain needs-review. A detached
 * test-only clone allows deterministic assessment witnesses without recording
 * real learner, teacher, or caregiver approval. */
export async function generatedNativeManifest(sourcePath:string){
 const input=JSON.parse(await readFile(sourcePath,'utf8')),models:{scaffoldId:string;activity:StructuredActivity;sources:Source[]}[]=[],unverified:any[]=[];
 if(input.notebook&&Array.isArray(input.activityIds)){
  for(const activity of input.notebook.activities??[])if(input.activityIds.includes(activity.id))models.push({scaffoldId:activity.scaffoldIds?.[0]??'unbound',activity,sources:input.notebook.sources});
 }else if(Array.isArray(input.cases)){
  for(const row of input.cases){
   if(row.status!=='valid-draft'){unverified.push({scaffoldId:row.scaffoldId,status:row.status,reason:'No locally validated generated draft to exercise.'});continue;}
   const authored=JSON.parse(await readFile(join(dirname(sourcePath),row.scaffoldId+'.input.json'),'utf8'));
   models.push({scaffoldId:row.scaffoldId,activity:row.result.activity,sources:authored.notebook.sources});
  }
  const finished=new Set(input.cases.map((row:any)=>row.scaffoldId));
  for(const row of input.coverage??[])if(!finished.has(row.scaffoldId))unverified.push({scaffoldId:row.scaffoldId,status:'unverified',reason:'Generation was pending or undispatched in this report snapshot.'});
 }else throw Error('Provide an actual benchmark director result or writer report.');
 const cases:any[]=[],blocked:any[]=[];
 for(const model of models){
  try{
   if(!validateActivity(model.activity,model.sources).success)throw Error('Generated activity no longer validates against its supplied sources.');
   if(!model.activity.scaffoldIds?.includes(model.scaffoldId))throw Error('The generated draft lacks the recorded recipe binding.');
   const activity={...structuredClone(model.activity),reviewStatus:'reviewed' as const},responses=referenceResponses(activity,{generalCampaign:true}),expectedCorrect=evaluateActivity(activity,responses.correctResponse),expectedWrong=evaluateActivity(activity,responses.wrongResponse);
   if(responses.expectedPositive==='correct'&&!expectedCorrect.correct)throw Error('The generated model has no confirmed correct assessment witness.');
   if(expectedWrong.correct)throw Error('The generated model does not distinguish the contrasting wrong response.');
   cases.push({...model,activity,testOnlyReferenceModel:true,originalReviewStatus:model.activity.reviewStatus,correctResponse:responses.correctResponse,wrongResponse:responses.wrongResponse,expectedCorrect,expectedWrong,notes:responses.notes});
  }catch(error){blocked.push({scaffoldId:model.scaffoldId,activityId:model.activity.id,status:'blocked-witness',reason:(error as Error).message});}
 }
 return{version:1,sourceArtifact:sourcePath,scope:'Automated native exercise of actual AI-generated drafts using detached test-only assessment clones. Source truth, pedagogical quality, and human/caregiver review are unverified.',counts:{generatedDrafts:models.length,testable:cases.length,blocked:blocked.length,unverified:unverified.length},cases,blocked,unverified};
}
export function verifyGeneratedNative(manifest:Awaited<ReturnType<typeof generatedNativeManifest>>,native:any){
 return manifest.cases.map(expected=>{const observed=native.cases?.find((row:any)=>row.activityId===expected.activity.id&&row.scaffoldId===expected.scaffoldId);return{scaffoldId:expected.scaffoldId,activityId:expected.activity.id,status:!observed?'unverified':observed.rendered===true&&observed.controlCount>0&&observed.resumeEqual===true&&observed.sourceInvalidationRejected===true&&observed.evaluationCorrect?.ok===true&&observed.evaluationWrong?.ok===true&&isDeepStrictEqual(observed.evaluationCorrect.evaluation,expected.expectedCorrect)&&isDeepStrictEqual(observed.evaluationWrong.evaluation,expected.expectedWrong)?'pass':'fail',controlCount:observed?.controlCount??null,humanOrCaregiverReview:'unverified',manualInteractionCompleteness:'unverified'};});
}
async function main(){const args=process.argv.slice(2),option=(flag:string)=>args[args.indexOf(flag)+1];if(!args.includes('--source')||!args.includes('--output'))throw Error('Provide --source and --output.');const output=resolve(option('--output')),manifest=await generatedNativeManifest(resolve(option('--source'))),verification=args.includes('--native-results')?verifyGeneratedNative(manifest,JSON.parse(await readFile(resolve(option('--native-results')),'utf8'))):undefined;await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({...manifest,...(verification?{nativeVerification:verification}:{})},null,2)+'\n');console.log(JSON.stringify({output,counts:manifest.counts,blocked:manifest.blocked,nativeVerification:verification},null,2));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
