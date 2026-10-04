import type { Rule } from './structuredEngine';
import type { ScenarioActivity, ScenarioSnapshot, ScenarioValue } from './scenarioEngine';
import type { ScenarioReviewChoice } from './scenarioCommitments';

type Cited = { evidenceRefs: number[] };
export interface ScenarioDialogueContract extends Cited {
  mode: 'conversation' | 'perspective';
  roles: (Cited & { id: string; name: string; description: string; observationIds: string[] })[];
  initialRoleId: string; requiredRoleIds: string[];
  turns: (Cited & { id: string; speakerRoleId: string; when: Rule; line: string; choices: (Cited & { actionId: string; utterance: string })[] })[];
  debrief: Cited & { prompt: string; choices: ScenarioReviewChoice[]; acceptedChoiceIds: string[] };
}
export interface ScenarioPromptContract extends Cited {
  briefing: string; baselineCaseId: string;
  modelLabel: string; modelVersion: string; recordedAt: string; rubricVersion: string;
  cases: (Cited & { id: string; title: string; changeDescription: string; prompt: string; output: string; inspectActionId: string; observationId: string })[];
  prediction: Cited & { prompt: string; choices: ScenarioReviewChoice[] };
  criteria: (Cited & { id: string; label: string; description: string; acceptedCaseIds: string[] })[];
  review: Cited & { prompt: string; choices: ScenarioReviewChoice[]; acceptedChoiceIds: string[] };
}
export type ScenarioInteractionCommitment =
  | { type: 'perspective-switch'; roleId: string }
  | { type: 'dialogue-review' | 'prompt-prediction' | 'prompt-review'; choiceId: string }
  | { type: 'prompt-variant'; caseId: string }
  | { type: 'prompt-comparison'; criterionId: string; caseId: string };
export interface ScenarioDialogueState { currentRoleId: string; visitedRoleIds: string[]; seenObservationIds: string[]; switches: { roleId: string; atStep: number }[]; reviewId?: string }
export interface ScenarioPromptState { variantId?: string; predictionId?: string; selections: Record<string, string>; reviewId?: string }
type Condition = (rule: Rule, state: Record<string, ScenarioValue>) => boolean;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['constructor', '__proto__', 'prototype'].includes(v);
const arr = (v: unknown) => Array.isArray(v) ? v : [];
function rows(v: unknown, min: number, max: number, path: string, errors: string[]) { if (!Array.isArray(v) || v.length < min || v.length > max || v.some(x => !object(x))) { errors.push(`${path}: expected ${min}–${max} records.`); return []; } return v as Record<string, unknown>[]; }
function fields(v: Record<string, unknown>, allowed: string[], path: string, errors: string[]) { for (const key of Object.keys(v)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field.`); }
function text(v: unknown, path: string, errors: string[], max = 2000) { if (typeof v !== 'string' || !v.trim() || v.length > max) errors.push(`${path}: expected non-empty text up to ${max} characters.`); }
function identifiers(v: unknown, known: Set<unknown>, path: string, errors: string[], min = 1, max = 16) { if (!Array.isArray(v) || v.length < min || v.length > max || v.some(x => !id(x) || !known.has(x)) || new Set(v).size !== v.length) errors.push(`${path}: invalid, unknown or duplicate identifiers.`); }
function unique(records: Record<string, unknown>[], path: string, errors: string[]) { const ids = records.map(x => x.id); if (ids.some(x => !id(x)) || new Set(ids).size !== ids.length) errors.push(`${path}: invalid or duplicate identifiers.`); return new Set(ids); }
function cited(v: Record<string, unknown>, count: number, path: string, errors: string[]) { if (!Array.isArray(v.evidenceRefs) || v.evidenceRefs.length < 1 || v.evidenceRefs.length > 12 || v.evidenceRefs.some(x => !Number.isInteger(x) || x < 0 || x >= count) || new Set(v.evidenceRefs).size !== v.evidenceRefs.length) errors.push(`${path}: invalid source references.`); }
function options(v: unknown, count: number, path: string, errors: string[]) { const values = rows(v, 2, 6, path, errors); unique(values, path, errors); for (const choice of values) { fields(choice, ['id', 'label', 'evidenceRefs'], path, errors); text(choice.label, path, errors, 800); cited(choice, count, path, errors); } return new Set(values.map(x => x.id)); }
function review(v: unknown, count: number, path: string, errors: string[]) { if (!object(v)) { errors.push(`${path}: expected a reviewed conclusion.`); return; } fields(v, ['prompt', 'choices', 'acceptedChoiceIds', 'evidenceRefs'], path, errors); text(v.prompt, path, errors); cited(v, count, path, errors); identifiers(v.acceptedChoiceIds, options(v.choices, count, path, errors), path, errors, 1, 6); }
export function validateScenarioInteractions(input: Record<string, unknown>, validateCondition: (rule: unknown, path: string, errors: string[]) => void): string[] {
  const spec = input.scenarioPresentation; if (!object(spec)) return [];
  const errors: string[] = [], count = arr(input.sourceRefs).length, actions = arr(input.actions).filter(object), knownActions = new Set(actions.map(x => x.id)), observations = new Set(arr(input.observations).filter(object).map(x => x.id));
  if ((spec.dialogue || spec.promptComparison) && [spec.prediction, spec.campaign, spec.dialogue, spec.promptComparison].filter(Boolean).length > 1) errors.push('Dialogue and prompt comparison are standalone presentations; combining them with other scenario modes is unsupported.');
  if (spec.dialogue !== undefined) {
    const d = spec.dialogue, path = 'scenarioPresentation.dialogue';
    if (!object(d)) errors.push(`${path}: expected a dialogue contract.`);
    else {
      fields(d, ['mode','roles','initialRoleId','requiredRoleIds','turns','debrief','evidenceRefs'], path, errors); cited(d, count, path, errors);
      if (!['conversation','perspective'].includes(String(d.mode))) errors.push(`${path}.mode: unsupported dialogue mode.`);
      const roles = rows(d.roles, 2, 4, `${path}.roles`, errors), roleIds = unique(roles, `${path}.roles`, errors);
      for (const role of roles) { fields(role, ['id','name','description','observationIds','evidenceRefs'], path, errors); text(role.name,path,errors,100);text(role.description,path,errors);identifiers(role.observationIds,observations,path,errors,1,24);cited(role,count,path,errors); }
      if (!roleIds.has(d.initialRoleId)) errors.push(`${path}.initialRoleId: choose an authored role.`);
      identifiers(d.requiredRoleIds,roleIds,`${path}.requiredRoleIds`,errors,d.mode==='perspective'?2:0,4);
      if (d.mode === 'perspective' && new Set(roles.map(role => [...arr(role.observationIds)].sort().join('|'))).size < 2) errors.push(`${path}: perspective roles must offer different authored observation views.`);
      if (d.mode === 'perspective') for (const role of roles.filter(role => arr(d.requiredRoleIds).includes(role.id))) { const other = roles.filter(other => other.id !== role.id && arr(d.requiredRoleIds).includes(other.id)); if (!arr(role.observationIds).some(value => other.every(other => !arr(other.observationIds).includes(value)))) errors.push(`${path}: each required perspective must contribute a distinct observation.`); }
      const allRoleObservations = new Set(roles.flatMap(role=>arr(role.observationIds)));
      for (const objective of arr(input.objectives).filter(object)) if (arr(objective.requiredObservations).some(value => !allRoleObservations.has(value))) errors.push(`${path}: objective evidence must be available in an authored role view.`);
      if (d.mode === 'conversation') { const initial = roles.find(role=>role.id===d.initialRoleId); for (const objective of arr(input.objectives).filter(object)) if (arr(objective.requiredObservations).some(value=>!arr(initial?.observationIds).includes(value))) errors.push(`${path}: conversation objective evidence must be available to the learner role.`); }
      const turns = rows(d.turns,2,8,`${path}.turns`,errors);unique(turns,`${path}.turns`,errors);const used:string[]=[];
      for(const turn of turns){ fields(turn,['id','speakerRoleId','when','line','choices','evidenceRefs'],path,errors);if(!roleIds.has(turn.speakerRoleId))errors.push(`${path}: turn speaker must be an authored role.`);text(turn.line,path,errors);cited(turn,count,path,errors);validateCondition(turn.when,`${path}.turns.${String(turn.id)}.when`,errors);for(const choice of rows(turn.choices,2,5,`${path}.choices`,errors)){fields(choice,['actionId','utterance','evidenceRefs'],path,errors);if(!knownActions.has(choice.actionId)||used.includes(String(choice.actionId)))errors.push(`${path}: each utterance must bind a distinct known action.`);used.push(String(choice.actionId));text(choice.utterance,path,errors,1200);cited(choice,count,path,errors);}}
      if(actions.some(action=>!used.includes(String(action.id))))errors.push(`${path}: every dialogue action must be presented as an authored utterance.`);
      review(d.debrief,count,`${path}.debrief`,errors);
    }
  }
  if(spec.promptComparison!==undefined){
    const p=spec.promptComparison,path='scenarioPresentation.promptComparison';
    if(!object(p))errors.push(`${path}: expected a supplied-output comparison contract.`);
    else{fields(p,['briefing','baselineCaseId','modelLabel','modelVersion','recordedAt','rubricVersion','cases','prediction','criteria','review','evidenceRefs'],path,errors);for(const key of ['briefing','modelLabel','modelVersion','recordedAt','rubricVersion'])text(p[key],`${path}.${key}`,errors);cited(p,count,path,errors);
      const cases=rows(p.cases,2,4,`${path}.cases`,errors),caseIds=unique(cases,`${path}.cases`,errors),usedActions=new Set<unknown>(),usedObservations=new Set<unknown>();
      if(!caseIds.has(p.baselineCaseId))errors.push(`${path}: baseline must name a supplied case.`);
      for(const item of cases){fields(item,['id','title','changeDescription','prompt','output','inspectActionId','observationId','evidenceRefs'],path,errors);for(const key of ['title','changeDescription','prompt','output'])text(item[key],`${path}.${key}`,errors,key==='output'?5000:2000);cited(item,count,path,errors);const action=actions.find(action=>action.id===item.inspectActionId);if(!action||usedActions.has(item.inspectActionId)||action.maxUses!==1)errors.push(`${path}: each supplied output needs a distinct one-use inspection action.`);usedActions.add(item.inspectActionId);if(!observations.has(item.observationId)||usedObservations.has(item.observationId)||arr(input.initialObservationIds).includes(item.observationId)||!action||arr(action.transitions).filter(object).some(transition=>!arr(transition.reveal).includes(item.observationId)))errors.push(`${path}: each output observation must be discovered by its inspection action.`);usedObservations.add(item.observationId); const observation = arr(input.observations).filter(object).find(observation => observation.id === item.observationId); if (observation && observation.text !== item.output) errors.push(`${path}: the displayed output must exactly match its evidence observation.`);}
      if(actions.some(action=>!usedActions.has(action.id)))errors.push(`${path}: prompt comparison actions must only inspect supplied outputs.`);
      for(const action of actions)for(const transition of arr(action.transitions).filter(object))for(const item of cases)if(arr(transition.reveal).includes(item.observationId)&&action.id!==item.inspectActionId)errors.push(`${path}: a case output cannot be revealed through a different inspection.`);
      if(!object(p.prediction))errors.push(`${path}: a pre-inspection prediction is required.`);else{fields(p.prediction,['prompt','choices','evidenceRefs'],path,errors);text(p.prediction.prompt,path,errors);cited(p.prediction,count,path,errors);options(p.prediction.choices,count,path,errors);}
      const criteria=rows(p.criteria,1,4,`${path}.criteria`,errors);unique(criteria,`${path}.criteria`,errors);for(const criterion of criteria){fields(criterion,['id','label','description','acceptedCaseIds','evidenceRefs'],path,errors);text(criterion.label,path,errors,300);text(criterion.description,path,errors);cited(criterion,count,path,errors);identifiers(criterion.acceptedCaseIds,caseIds,path,errors,1,4);for(const item of cases.filter(item=>item.id!==p.baselineCaseId))if(!arr(criterion.acceptedCaseIds).some(id=>id===item.id||id===p.baselineCaseId))errors.push(`${path}: every baseline/variant pair needs a supported response for each criterion.`);}
      review(p.review,count,`${path}.review`,errors);
    }
  }
  return errors;
}
export function createScenarioInteractionState(activity: ScenarioActivity): Pick<ScenarioSnapshot,'dialogue'|'promptComparison'> {
  const p=activity.scenarioPresentation;return{...(p?.dialogue?{dialogue:{currentRoleId:p.dialogue.initialRoleId,visitedRoleIds:[],seenObservationIds:[],switches:[]}}:{}),...(p?.promptComparison?{promptComparison:{selections:{}}}:{})};
}
export function recordScenarioRoleView(activity: ScenarioActivity,snapshot:ScenarioSnapshot){const d=activity.scenarioPresentation?.dialogue,state=snapshot.dialogue;if(!d||!state)return;const role=d.roles.find(role=>role.id===state.currentRoleId)!;const found=role.observationIds.filter(id=>snapshot.observationIds.includes(id));const meaningful=d.mode!=='perspective'||found.some(id=>d.roles.filter(other=>other.id!==role.id&&d.requiredRoleIds.includes(other.id)).every(other=>!other.observationIds.includes(id)));if(found.length&&meaningful&&!state.visitedRoleIds.includes(role.id))state.visitedRoleIds.push(role.id);state.seenObservationIds=[...new Set([...state.seenObservationIds,...found])];}
export function activeDialogueTurn(activity:ScenarioActivity,state:Record<string,ScenarioValue>,condition:Condition){return activity.scenarioPresentation?.dialogue?.turns.filter(turn=>condition(turn.when,state));}
export function promptPairReady(activity:ScenarioActivity,snapshot:ScenarioSnapshot){const p=activity.scenarioPresentation?.promptComparison,s=snapshot.promptComparison;return!!p&&!!s?.variantId&&p.cases.filter(item=>[p.baselineCaseId,s.variantId].includes(item.id)).every(item=>snapshot.observationIds.includes(item.observationId));}
export function scenarioInteractionActionProblem(activity:ScenarioActivity,snapshot:ScenarioSnapshot,actionId:string,condition:Condition):string|undefined{
 const d=activity.scenarioPresentation?.dialogue;if(d){const turns=activeDialogueTurn(activity,snapshot.state,condition)??[];if(turns.length!==1)return'The current scene must have exactly one reviewed dialogue turn.';if(!turns[0].choices.some(choice=>choice.actionId===actionId))return'That utterance belongs to another dialogue turn.';}
 const p=activity.scenarioPresentation?.promptComparison,s=snapshot.promptComparison;if(p){if(!s?.variantId)return'Choose the controlled prompt change first.';if(!s.predictionId)return'Record your prediction before inspecting a supplied output.';const item=p.cases.find(item=>item.inspectActionId===actionId);if(!item||![p.baselineCaseId,s.variantId].includes(item.id))return'Inspect the selected baseline and variant pair.';}
}
export function interactionCommitmentFields(entry:Record<string,unknown>):string[]|undefined{
 if(entry.type==='perspective-switch')return id(entry.roleId)?['roleId']:[];
 if(['dialogue-review','prompt-prediction','prompt-review'].includes(String(entry.type)))return id(entry.choiceId)?['choiceId']:[];
 if(entry.type==='prompt-variant')return id(entry.caseId)?['caseId']:[];
 if(entry.type==='prompt-comparison')return id(entry.caseId)&&id(entry.criterionId)?['caseId','criterionId']:[];
}
export function applyScenarioInteractionCommitment(activity:ScenarioActivity,snapshot:ScenarioSnapshot,entry:ScenarioInteractionCommitment&{atStep:number}):string|undefined{
 const d=activity.scenarioPresentation?.dialogue,ds=snapshot.dialogue,p=activity.scenarioPresentation?.promptComparison,ps=snapshot.promptComparison;
 if(entry.type==='perspective-switch'){if(!d||!ds||d.mode!=='perspective'||!d.roles.some(role=>role.id===entry.roleId)||ds.currentRoleId===entry.roleId)return'Choose another authored perspective.';ds.currentRoleId=entry.roleId;ds.switches.push({roleId:entry.roleId,atStep:entry.atStep});recordScenarioRoleView(activity,snapshot);return;}
 if(entry.type==='dialogue-review'){if(!d||!ds||snapshot.phase!=='success'||!d.debrief.choices.some(choice=>choice.id===entry.choiceId))return'Complete the conversation before recording a reviewed debrief.';if(!d.requiredRoleIds.every(id=>ds.visitedRoleIds.includes(id)))return'Inspect the required authored perspectives before the debrief.';ds.reviewId=entry.choiceId;return;}
 if(!p||!ps)return'This case does not define a supplied-output comparison.';
 if(entry.type==='prompt-variant'){if(ps.variantId||snapshot.history.length||entry.caseId===p.baselineCaseId||!p.cases.some(item=>item.id===entry.caseId))return'Choose one reviewed prompt variant before inspection; start a new run to change it.';ps.variantId=entry.caseId;return;}
 if(entry.type==='prompt-prediction'){if(!ps.variantId||ps.predictionId||snapshot.history.length||!p.prediction.choices.some(choice=>choice.id===entry.choiceId))return'Commit one prediction before inspecting the supplied outputs.';ps.predictionId=entry.choiceId;return;}
 if(!promptPairReady(activity,snapshot))return'Inspect both outputs in the chosen comparison before reviewing them.';
 if(entry.type==='prompt-comparison'){if(!p.criteria.some(criterion=>criterion.id===entry.criterionId)||![p.baselineCaseId,ps.variantId].includes(entry.caseId))return'Compare an authored criterion using the selected pair.';ps.selections[entry.criterionId]=entry.caseId;ps.reviewId=undefined;return;}
 if(entry.type==='prompt-review'){if(!p.criteria.every(criterion=>!!ps.selections[criterion.id])||!p.review.choices.some(choice=>choice.id===entry.choiceId))return'Compare every rubric criterion before reviewing the conclusion.';ps.reviewId=entry.choiceId;return;}
 return'Unsupported interaction commitment.';
}
export function scenarioInteractionDetails(activity:ScenarioActivity,snapshot:ScenarioSnapshot){
 const details:{id:string;correct:boolean;message:string}[]=[],d=activity.scenarioPresentation?.dialogue,ds=snapshot.dialogue,p=activity.scenarioPresentation?.promptComparison,ps=snapshot.promptComparison;
 if(d){const correct=!!ds?.reviewId&&d.debrief.acceptedChoiceIds.includes(ds.reviewId)&&d.requiredRoleIds.every(id=>ds.visitedRoleIds.includes(id));details.push({id:'dialogue-debrief',correct,message:correct?'The authored perspectives and reviewed conversation debrief are complete.':'Complete the conversation, inspect the required perspectives and review what the dialogue supports.'});}
 if(p){for(const criterion of p.criteria){const correct=!!ps?.selections[criterion.id]&&criterion.acceptedCaseIds.includes(ps.selections[criterion.id]);details.push({id:`prompt-${criterion.id}`,correct,message:`${criterion.label}: ${correct?'supported by the supplied output.':'compare both supplied outputs against this rubric.'}`});}const correct=!!ps?.predictionId&&!!ps.reviewId&&p.review.acceptedChoiceIds.includes(ps.reviewId);details.push({id:'prompt-review',correct,message:correct?'Prediction and bounded interpretation recorded; the initial prediction is ungraded.':'Record a prediction before inspection and explain what this supplied comparison can establish.'});}return details;
}

export function dialogueEvidenceReachable(activity:ScenarioActivity,observations:string[]):boolean { const d=activity.scenarioPresentation?.dialogue;return !d||d.mode!=='perspective'||d.requiredRoleIds.every(id=>{const role=d.roles.find(role=>role.id===id)!;return role.observationIds.some(observation=>observations.includes(observation)&&d.roles.filter(other=>other.id!==id&&d.requiredRoleIds.includes(other.id)).every(other=>!other.observationIds.includes(observation)));}); }
