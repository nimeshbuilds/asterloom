import {evaluateActivity,evaluateRule,type StructuredActivity} from '../../src/lib/structuredEngine';
import {initialScenarioResponse,advanceScenario,recordScenarioCommitment,replayScenario,scenarioAvailableActions,scenarioConditionMet,type ScenarioActivity,type ScenarioResponse} from '../../src/lib/scenarioEngine';
import {initialChildPlayResponse,advanceChildPlay,replayChildPlay} from '../../src/lib/childPlayEngine';
import {initialCompositionResponse,type ExplanationResponse} from '../../src/lib/compositionEngine';
import {acknowledgePartnerTurn,advancePartnerTurn} from '../../src/lib/compositionModes';
import {explanationSolution} from '../../src/lib/compositionExamples';
import {initialPictureBuildResponse} from '../../src/lib/pictureBuildEngine';
import {initialPictureResponse} from '../../src/lib/pictureEngine';
import {initialRuleSwitchResponse} from '../../src/lib/ruleSwitchEngine';
import {computeDataAnswer,initialDataResponse} from '../../src/lib/dataEngine';
import {initialMediaResponse} from '../../src/lib/mediaEngine';
import {currentCampaignStage,currentCampaignPlan,type ScenarioCommitmentInput} from '../../src/lib/scenarioCommitments';

export interface ReferenceResponses {correctResponse:unknown;wrongResponse:unknown;adversarialResponse:unknown;expectedPositive:'correct'|'picture-constraints-only';notes:string[]}
const clone=<T>(x:T):T=>structuredClone(x);
function commit(a:ScenarioActivity,r:ScenarioResponse,input:ScenarioCommitmentInput){const n=recordScenarioCommitment(a,r,input);if(!n.success)throw Error(n.error);return n.response;}
function play(a:ScenarioActivity,r:ScenarioResponse,actions:string[]){for(const id of actions){const n=advanceScenario(a,r,id);if(!n.success)throw Error(n.error);r=n.response;}return r;}
function scenarioPositive(a:ScenarioActivity,generalCampaign=false):ScenarioResponse{
 let initial=initialScenarioResponse(a);const p=a.scenarioPresentation;
 if(p?.campaign&&!generalCampaign){
  initial=commit(a,initial,{type:'plan',stageId:'establish-control',actionIds:['inspect-notebook','balance-water']});
  initial=play(a,initial,['inspect-notebook','balance-water']);
  initial=commit(a,initial,{type:'debrief',stageId:'establish-control',choiceId:'alternative-explanation'});
  const actions=['prepare-transfer-case','balance-water','repeat-study','repeat-study','assess-study'];
  initial=commit(a,initial,{type:'plan',stageId:'transfer-control',actionIds:actions});initial=play(a,initial,actions);
  initial=commit(a,initial,{type:'debrief',stageId:'transfer-control',choiceId:'bounded-transfer'});
  initial.selectedEvidenceIds=[...new Set(a.objectives.flatMap(x=>x.requiredObservations))];return initial;
 }
 if(p?.prediction)initial=commit(a,initial,{type:'prediction',choiceId:p.prediction.hypotheses[0].id});
 if(p?.promptComparison){initial=commit(a,initial,{type:'prompt-variant',caseId:p.promptComparison.cases.find(c=>c.id!==p.promptComparison!.baselineCaseId)!.id});initial=commit(a,initial,{type:'prompt-prediction',choiceId:p.promptComparison.prediction.choices[0].id});}
 if(p?.dialogue?.mode==='perspective')for(const role of p.dialogue.roles)if(replayScenario(a,initial).dialogue?.currentRoleId!==role.id)initial=commit(a,initial,{type:'perspective-switch',roleId:role.id});
 const pending=[initial],seen=new Set<string>();
 for(let count=0;pending.length&&count<15000;count++){
  const r=pending.shift()!,s=replayScenario(a,r);if(s.phase==='invalid'||s.phase==='failed')continue;
  const key=JSON.stringify([s.state,s.spent,s.observationIds,[...r.actions].sort(),s.campaign?.stageIndex]);if(seen.has(key))continue;seen.add(key);
  if(p?.campaign){
   const stage=currentCampaignStage(a,s);
   if(stage){
    if(scenarioConditionMet(stage.completionWhen,s.state)){
     const next=recordScenarioCommitment(a,r,{type:'debrief',stageId:stage.id,choiceId:stage.debrief.acceptedChoiceIds[0]});if(next.success)pending.push(next.response);
    }else{
     const previous=currentCampaignPlan(s);
     for(const id of stage.actionIds){
      const planned=recordScenarioCommitment(a,r,{type:previous?'plan-revision':'plan',stageId:stage.id,actionIds:[id],...(previous?{reasonId:p.campaign.revisionReasons[0].id}:{})});
      if(planned.success){const next=advanceScenario(a,planned.response,id);if(next.success)pending.push(next.response);}
     }
    }
    continue;
   }
  }
  if(s.phase==='success'){
   let done=clone(r);
   if(p?.prediction){done=commit(a,done,{type:'hypothesis-revision',choiceId:p.prediction.acceptedFinalHypothesisIds[0]});done=commit(a,done,{type:'outcome-review',choiceId:p.prediction.acceptedReviewIds[0]});}
   if(p?.dialogue)done=commit(a,done,{type:'dialogue-review',choiceId:p.dialogue.debrief.acceptedChoiceIds[0]});
   if(p?.promptComparison){for(const q of p.promptComparison.criteria)done=commit(a,done,{type:'prompt-comparison',criterionId:q.id,caseId:q.acceptedCaseIds[0]});done=commit(a,done,{type:'prompt-review',choiceId:p.promptComparison.review.acceptedChoiceIds[0]});}
   done.selectedEvidenceIds=[...new Set(a.objectives.flatMap(x=>x.requiredObservations))];if(evaluateActivity(a,done).correct)return done;
  }
  for(const x of scenarioAvailableActions(a,r).filter(x=>x.available)){const n=advanceScenario(a,r,x.action.id);if(n.success)pending.push(n.response);}
 }
 throw Error(`No positive response witness found for ${a.id}.`);
}

/** Works on an explicit test-only reference model, never promotes saved content. */
export function referenceResponses(a:StructuredActivity,options:{generalCampaign?:boolean}={}):ReferenceResponses{
 let good:any,bad:any;const notes:string[]=[];let expectedPositive:ReferenceResponses['expectedPositive']='correct';
 switch(a.kind){
  case 'sequence':{const remaining=new Set(a.items.map(x=>x.id)),order:string[]=[];while(remaining.size){const next=[...remaining].find(id=>!a.constraints.some(c=>c.after===id&&remaining.has(c.before)));if(!next)throw Error('Cyclic sequence');order.push(next);remaining.delete(next);}good={order};bad={order:[...order].reverse()};break;}
  case 'classification':good={assignments:Object.fromEntries(a.membership.map(x=>[x.itemId,x.categoryIds]))};bad=clone(good);bad.assignments[a.items[0].id]=a.categories.filter(c=>!a.membership[0].categoryIds.includes(c.id)).slice(0,1).map(c=>c.id);break;
  case 'dependency':good={edges:clone(a.edges)};bad={edges:[]};break;
  case 'decision':{const answer=a.rules.find(r=>evaluateRule(r.when,a.context))?.choiceId??a.defaultChoiceId;good={choiceId:answer};bad={choiceId:a.choices.find(c=>c.id!==answer)!.id};break;}
  case 'budget':{let visited=0;const walk=(i:number,q:Record<string,number>,spent:number):Record<string,number>|undefined=>{if(++visited>100000)throw Error('Budget witness search reached its 100,000-state bound; feasibility remains unverified.');if(i===a.items.length)return evaluateActivity(a,{quantities:q}).correct?clone(q):undefined;const item=a.items[i],limit=Math.min(item.maxQuantity,item.cost>0?Math.floor((a.budget-spent+1e-8)/item.cost):item.maxQuantity);for(let n=0;n<=limit;n++){q[item.id]=n;const r=walk(i+1,q,spent+n*item.cost);if(r)return r;}};const q=walk(0,{},0);if(!q)throw Error('No feasible budget assessment witness');good={quantities:q};bad={quantities:Object.fromEntries(a.items.map(x=>[x.id,0]))};break;}
  case 'rubric':good={ratings:Object.fromEntries(a.criteria.map(c=>[c.id,c.expectedLevel??0]))};bad=clone(good);bad.ratings[a.criteria[0].id]=(good.ratings[a.criteria[0].id]+1)%a.criteria[0].levels.length;break;
  case 'diagram':good={placements:Object.fromEntries(a.mapping.map(m=>[m.labelId,m.targetId]))};bad={placements:Object.fromEntries(a.mapping.map((m,i)=>[m.labelId,a.mapping[(i+1)%a.mapping.length].targetId]))};break;
  case 'completion':good={slotTokens:Object.fromEntries(a.slots.map(s=>[s.id,s.acceptedTokenIds[0]]))};bad=clone(good);bad.slotTokens[a.slots[0].id]=a.tokens.find(t=>!a.slots[0].acceptedTokenIds.includes(t.id))!.id;break;
  case 'data':good=initialDataResponse(a);for(const q of a.questions){const answer=computeDataAnswer(a,q);good.answers[q.id]=String(answer.value);good.evidenceRows[q.id]=answer.rowIds;}bad=clone(good);bad.answers[a.questions[0].id]=String(Number(good.answers[a.questions[0].id])+1000);break;
  case 'media':good=initialMediaResponse(a);for(const c of a.checkpoints)good.answers[c.id]=c.correctChoiceIds[0]??'';good.position=a.duration;good.visitedCheckpointIds=a.checkpoints.map(c=>c.id);bad=clone(good);{const q=a.checkpoints.find(c=>c.correctChoiceIds.length)!;bad.answers[q.id]=q.choices.find(c=>!q.correctChoiceIds.includes(c.id))!.id;}break;
  case 'construction':good={...initialCompositionResponse(a),...clone(a.referenceBuilds[0])};bad={...clone(good),edges:[]};break;
  case 'explanation':{
   let r=initialCompositionResponse(a) as ExplanationResponse;r.arguments=explanationSolution(a).arguments;
   if(a.partner){r=advancePartnerTurn(a,acknowledgePartnerTurn(a,r));r=acknowledgePartnerTurn(a,r);r.partner={...r.partner!,decision:'ready',checkedEvidence:true};r=advancePartnerTurn(a,r);notes.push('Partner acknowledgements are synthetic protocol input, not evidence of human participation.');}
   if(a.codeReview)for(const f of a.codeReview.findings){const x=f.alternatives[0];r.codeReview!.annotations[f.id]={spanIds:[...x.spanIds],repairId:x.repairId,note:''};}
   good=r;bad=clone(r);bad.arguments[a.arguments[0].id].evidenceIds=[];break;
  }
  case 'scenario':good=scenarioPositive(a,options.generalCampaign);bad=initialScenarioResponse(a);if(a.actions.some(x=>x.id==='shortcut'))bad=play(a,bad,['shortcut']);else if(a.scenarioPresentation?.prediction){bad=clone(good);const p=a.scenarioPresentation.prediction,choice=p.reviewChoices.find(x=>!p.acceptedReviewIds.includes(x.id));if(choice)bad=commit(a,bad,{type:'outcome-review',choiceId:choice.id});}break;
  case 'picture':good=initialPictureResponse(a);good.phase='play';for(const r of a.rounds)good.answers[r.id]=r.correctTokenIds[0];good.exploredTokenIds=a.tokens.map(x=>x.id);bad=clone(good);bad.answers[a.rounds[0].id]=a.rounds[0].tokenIds.find(id=>!a.rounds[0].correctTokenIds.includes(id))!;break;
  case 'rule-switch':good=initialRuleSwitchResponse(a);good.phase='second';good.firstCommitted=true;good.switchAcknowledged=true;for(const round of a.rounds)good.assignments[round.id]=Object.fromEntries(a.items.map(item=>[item.id,item.attributes[round.feature]]));bad=clone(good);bad.assignments[a.rounds[1].id][a.items[0].id]=a.rounds[1].categories.find(c=>c.id!==a.items[0].attributes[a.rounds[1].feature])!.id;break;
  case 'child-play':{const pending=[initialChildPlayResponse(a)];while(pending.length){const r=pending.shift()!,s=replayChildPlay(a,r);if(s.phase==='goal')good=r;if(s.phase==='reflect')bad=r;if(s.phase==='active')for(const action of a.actions.filter(x=>x.fromSceneId===s.scene.id)){const n=advanceChildPlay(a,r,action.id);if(n.success)pending.push(n.response);}}if(!good||!bad)throw Error('Child-play needs goal and reflection paths');break;}
  case 'picture-build':good=initialPictureBuildResponse(a);good.parts=clone(a.referenceBuilds[0].parts);bad=clone(good);bad.parts=[];expectedPositive='picture-constraints-only';notes.push('No caregiver approval is fabricated. A geometrically correct build remains unfinished until genuine human telling review.');break;
  case 'recall':good={answers:Object.fromEntries(a.questions.map(q=>[q.id,q.answer])),revealedIds:[],selectedQuestionId:a.questions[0].id};bad=clone(good);bad.answers[a.questions[0].id]='Unsupported answer absent from the supplied source';break;
  default:throw Error(`No reference response adapter for ${(a as StructuredActivity).kind}`);
 }
 return{correctResponse:good,wrongResponse:bad,adversarialResponse:{__invalidBenchmarkResponse:true},expectedPositive,notes};
}
