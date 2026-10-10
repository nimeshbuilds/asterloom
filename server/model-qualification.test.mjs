import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyModel as evaluateModel,MODEL_QUALIFICATION_VERSION} from './model-qualification.mjs';
const expectedTemplateIds=Array.from({length:75},(_,i)=>`template-${i}`);
const qualifyModel=options=>evaluateModel({expectedTemplateIds,...options});
const identity={modelDigest:'sha256:model',workflowVersion:'factory-1',runtimeVersion:'0.40.2',settingsDigest:'sha256:settings',hardwareId:'test-fixture-only'};
function evidence(useCase='game-creation') {
  const totalCases=useCase==='game-creation'?150:100;
  return {identity:{...identity},policyVersion:MODEL_QUALIFICATION_VERSION,useCase,reportId:'synthetic-unit-fixture',inputSetDigest:'sha256:fixtures',completedAt:'2026-10-10T12:00:00Z',scope:'full-pipeline',finished:true,includesAllAttempts:true,totalCases,distinctSources:10,successfulCases:totalCases,firstAttemptSuccessfulCases:totalCases,maximumRepairs:1,criticalSourceErrors:0,independentReview:true,humanReviewedCases:30,humanApprovedCases:30,latencySampleCount:totalCases,p95Ms:10_000,
    ...(useCase==='game-creation'?{templateCaseCounts:Object.fromEntries(Array.from({length:75},(_,i)=>[`template-${i}`,2])),nativePlayableCases:150,sourceFormatCategories:5,ageGroups:2}:{categoryCaseCounts:{answerable:20,unanswerable:20,'follow-up':20,'cross-source':20,'live-context':10,'source-injection':10},answerableCases:80,unanswerableCases:20,groundedAnswers:80,correctAbstentions:20})};
}
test('installation or a readiness probe never imply quality qualification',()=>{
  for(const useCase of ['aster-chat','game-creation']) assert.equal(qualifyModel({identity,useCase}).status,'untested');
});
test('complete use-case evidence qualifies separately, without conferring the other use',()=>{
  for(const useCase of ['aster-chat','game-creation']) {
    const report=evidence(useCase);assert.equal(qualifyModel({identity,useCase,evidence:report}).status,'qualified');
    assert.equal(qualifyModel({identity,useCase:useCase==='aster-chat'?'game-creation':'aster-chat',evidence:report}).status,'outdated');
  }
});
test('quantization, workflow, runtime, settings and hardware cannot inherit a stale pass',()=>{
  for(const key of Object.keys(identity)) assert.equal(qualifyModel({identity:{...identity,[key]:'changed'},useCase:'game-creation',evidence:evidence()}).status,'outdated');
  assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:{...evidence(),policyVersion:'old'}}).status,'outdated');
});
test('component-only, incomplete or cherry-picked evidence cannot qualify',()=>{
  for(const change of [{scope:'writer-component'},{finished:false},{includesAllAttempts:false},{reportId:''},{inputSetDigest:''},{completedAt:'bad'},{maximumRepairs:2},{successfulCases:140},{firstAttemptSuccessfulCases:130}]) {
    assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:{...evidence(),...change}}).status,'needs-work');
  }
});
test('valid structure cannot hide source errors, missing review or incomplete native coverage',()=>{
  for(const change of [{criticalSourceErrors:1},{criticalSourceErrors:undefined},{independentReview:false},{humanApprovedCases:28},{nativePlayableCases:149},{templateCaseCounts:{one:150}},{sourceFormatCategories:1},{ageGroups:1}]) {
    assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:{...evidence(),...change}}).status,'needs-work');
  }
});
test('speed claims count every attempt and reject missing or invalid measurements',()=>{
  for(const change of [{latencySampleCount:149},{p95Ms:600_001},{p95Ms:NaN},{p95Ms:0}]) assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:{...evidence(),...change}}).status,'needs-work');
});
test('chat must handle lack of support and follow-up/context questions as well as direct answers',()=>{
  for(const change of [{correctAbstentions:18},{groundedAnswers:70},{categoryCaseCounts:{answerable:100}},{answerableCases:81}]) assert.equal(qualifyModel({identity,useCase:'aster-chat',evidence:{...evidence('aster-chat'),...change}}).status,'needs-work');
});
test('creation coverage requires exact independent catalog identities, not 75 arbitrary aliases',()=>{
 const report=evidence();
 assert.equal(evaluateModel({identity,useCase:'game-creation',evidence:report}).status,'needs-work');
 assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:{...report,templateCaseCounts:Object.fromEntries(expectedTemplateIds.map(id=>[id+'-alias',2]))}}).status,'needs-work');
 assert.equal(qualifyModel({identity,useCase:'game-creation',evidence:report,expectedTemplateIds:Array(75).fill('template-0')}).status,'needs-work');
});
