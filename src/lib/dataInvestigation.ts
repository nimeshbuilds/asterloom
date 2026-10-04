import {initialDataResponse,type DataActivity,type DataResponse,type DataCell} from './dataEngine';

export type InvestigationAction =
 | {type:'inspect';rowId:string}
 | {type:'question';questionId:string}
 | {type:'compare';rowId:string}
 | {type:'evidence';rowId:string;questionId:string};

/** Manipulates the learner's case, never answer rules or aggregate results. */
export function investigateData(activity:DataActivity,response:DataResponse,action:InvestigationAction):DataResponse {
 const state=initialDataResponse(activity,response);
 if(action.type==='question')return activity.questions.some(q=>q.id===action.questionId)?{...state,view:{...state.view,activeQuestionId:action.questionId}}:response;
 if(!activity.rows.some(row=>row.id===action.rowId))return response;
 if(action.type==='inspect')return {...state,view:{...state.view,inspectedRowId:action.rowId}};
 if(action.type==='compare'){
  const prior=state.view.compareRowIds??[];
  return {...state,view:{...state.view,compareRowIds:prior.includes(action.rowId)?prior.filter(id=>id!==action.rowId):[...prior.slice(-1),action.rowId]}};
 }
 if(!activity.questions.some(q=>q.id===action.questionId&&q.requireEvidenceRows))return response;
 const prior=state.evidenceRows[action.questionId];
 return {...state,evidenceRows:{...state.evidenceRows,[action.questionId]:prior.includes(action.rowId)?prior.filter(id=>id!==action.rowId):[...prior,action.rowId]}};
}

/** Zero and an absent observation must never share the same visual mark. */
export function dataCellText(value:DataCell,unit=''):string {
 return value===null?'Not recorded':`${value}${typeof value==='number'&&unit?' '+unit:''}`;
}

/** The domain belongs to the entire dataset so filtering cannot exaggerate a bar. */
export function investigationScale(activity:DataActivity,columnId:string):number {
 return Math.max(1,...activity.rows.map(row=>typeof row.values[columnId]==='number'?Math.abs(row.values[columnId] as number):0));
}
