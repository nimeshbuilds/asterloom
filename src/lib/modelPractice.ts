import {evaluateActivityForAuthoring,type Evaluation,type StructuredActivity} from './structuredEngine';

export interface ModelPracticeFeedback {score:number;maxScore:number;correct:boolean;feedback:string;details:Evaluation['details']}
/** Saved lesson metadata is not part of the learner's answer. Preserve every
 * other field and the evaluator's rejection of non-plain response objects. */
export function modelPracticeResponse(response:unknown):unknown {
 if(!response||typeof response!=='object'||Array.isArray(response))return response;
 const prototype=Object.getPrototypeOf(response);
 if((prototype!==Object.prototype&&prototype!==null)||!Object.hasOwn(response,'_draft'))return response;
 const {_draft:_metadata,...answer}=response as Record<string,unknown>;
 return answer;
}
/** Feedback against generated rules may inform game participation XP, never independent mastery, review or competition. */
export function modelPracticeFeedback(activity:StructuredActivity,response:unknown):ModelPracticeFeedback|undefined {
 if(activity.reviewStatus!=='needs-review')return;
 const evaluation=evaluateActivityForAuthoring(activity,modelPracticeResponse(response));
 if(!evaluation.valid||evaluation.correct===null||evaluation.maxScore<=0)return;
 return {details:evaluation.details,score:evaluation.score,maxScore:evaluation.maxScore,correct:evaluation.correct,feedback:evaluation.correct?'Your solution satisfies the game’s current rules.':'Some game rules are not satisfied yet. Use the feedback to revise your solution.'};
}
/** Recompute from the saved response, rather than trusting a score embedded in a package. */
export function savedModelPracticeFeedback(activity:StructuredActivity,response:unknown):ModelPracticeFeedback|undefined {
 if(!response||typeof response!=='object'||Array.isArray(response))return;
 const draft=(response as Record<string,unknown>)._draft;
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||(draft as Record<string,unknown>).checked!==true)return;
 return modelPracticeFeedback(activity,response);
}

/** A source-guided reflection can be complete without an automatic correctness judgment. */
export function modelPracticeReflection(activity:StructuredActivity,response:unknown):boolean {
 if(activity.reviewStatus!=='needs-review')return false;
 const evaluation=evaluateActivityForAuthoring(activity,modelPracticeResponse(response));
 return evaluation.valid&&evaluation.outcome==='self-reviewed';
}
