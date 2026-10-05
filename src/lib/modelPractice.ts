import {evaluateActivityForAuthoring,type StructuredActivity} from './structuredEngine';

export interface ModelPracticeFeedback {score:number;maxScore:number;correct:boolean;feedback:string}
/** Display-only feedback against generated rules. Never used for XP, mastery or room results. */
export function modelPracticeFeedback(activity:StructuredActivity,response:unknown):ModelPracticeFeedback|undefined {
 if(activity.reviewStatus!=='needs-review')return;
 const evaluation=evaluateActivityForAuthoring(activity,response);
 if(!evaluation.valid||evaluation.correct===null||evaluation.maxScore<=0)return;
 return {score:evaluation.score,maxScore:evaluation.maxScore,correct:evaluation.correct,feedback:evaluation.correct?'Your solution satisfies the game’s current rules.':'Some game rules are not satisfied yet. Use the feedback to revise your solution.'};
}
/** Recompute from the saved response, rather than trusting a score embedded in a package. */
export function savedModelPracticeFeedback(activity:StructuredActivity,response:unknown):ModelPracticeFeedback|undefined {
 if(!response||typeof response!=='object'||Array.isArray(response))return;
 const draft=(response as Record<string,unknown>)._draft;
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||(draft as Record<string,unknown>).checked!==true)return;
 return modelPracticeFeedback(activity,response);
}
