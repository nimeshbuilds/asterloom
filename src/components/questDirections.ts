import type {StructuredActivity} from '../lib/structuredEngine';
import {buildLessonActionGuide} from '../lib/lessonStory';
import {learnerControlWording} from '../lib/learnerWording';

/** Presentation only: the source goal and scoring model are never rewritten.
 * Saved AI directions can name obsolete controls. These three simple engines
 * have complete runtime instructions; authored constraints remain visible. */
export function questDirections(activity:StructuredActivity,objective?:string){
 const instruction=learnerControlWording(activity.instruction,activity.reviewStatus==='reviewed').replace(/^Read the teaching first\.\s*(?:Then\s+)?/i,'').trim();
 const simple=activity.kind==='sequence'||activity.kind==='classification'||activity.kind==='dependency';
 const goal=objective?.trim()||instruction;
 const detail=objective&&instruction!==goal?instruction:undefined;
 const detailCollapsed=!!detail&&simple&&activity.reviewStatus==='needs-review';
 const guide=buildLessonActionGuide(activity);
 const action=activity.kind==='dependency'?'Choose a starting concept on the map, choose a relationship, then choose the target concept. Use Connect concepts to add the link.':guide.act;
 const finish=activity.kind==='sequence'?'Aim for an order supported by the source.':activity.kind==='classification'?'Check every item against the source’s group rules. An item may belong to more than one group.':activity.kind==='dependency'?'Build the connections described by the source; the arrow goes from your starting concept to the target.':undefined;
 return{goal,detail,detailCollapsed,action,finish};
}
