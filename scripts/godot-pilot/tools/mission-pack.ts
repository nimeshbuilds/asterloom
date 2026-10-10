import {createHash} from 'node:crypto';
import {parsePackage} from '../../../src/lib/package';
import {currentAILearningMission,aiLearningActivityFingerprint,type AILearningMission} from '../../../src/lib/aiLearningPlan';
import {sourceRevision,isCurrentEvidence} from '../../../src/lib/evidence';
import {hasCurrentActivityEvidence} from '../../../src/lib/scaffoldRuntime';
import type {SequenceActivity,DependencyActivity} from '../../../src/lib/structuredEngine';
import type {EvidenceReference,Notebook,Source} from '../../../src/types';
import {selectPilotTemplate,type PilotPresentation,type PilotTemplateId} from './template-catalog';

export const PILOT_MAX_BYTES=4*1024*1024;
export type PilotSelection={sequenceId?:string;dependencyId?:string;templateId?:string};
type PilotActivity=SequenceActivity|DependencyActivity;
type PilotSource={id:string;title:string;text:string;revision:string};
export interface PilotLesson {
 title:string;body:string;quote:string;citations:EvidenceReference[];activityId:string;
 role:'concept'|'chunk'|'worked-example';
}
export interface MissionPack {
 format:'asterloom-godot-pilot';version:1;id:string;title:string;audience:'adult';
 fictionalSetting:string;offsetEncoding:'utf-16';presentation:PilotPresentation;
 source:PilotSource;sources:PilotSource[];lessons:PilotLesson[];
 sequence?:SequenceActivity;dependency?:DependencyActivity;
 teaching:AILearningMission[];
 activityEvidence:{activityId:string;citations:EvidenceReference[]}[];
 assessment:{mode:'experimental-practice';mastery:false;hostProgressWrites:false};
 provenance:{packageSha256:string;notebookId:string;notebookRevision:number;templateId:PilotTemplateId;templateVersion:1;activityFingerprints:Record<string,string>};
}

function selectedActivity(notebook:Notebook,kind:'sequence'|'dependency',id:string):PilotActivity {
 const activity=notebook.activities?.find(item=>item.id===id);
 if(!activity||activity.kind!==kind)throw new Error(`The selected ${kind} activity is missing or has a different kind.`);
 if(!hasCurrentActivityEvidence(activity,notebook.sources))throw new Error(`The selected ${kind} activity has stale, unreadable, ambiguous or non-instructional source evidence.`);
 if(kind==='sequence'&&(activity as SequenceActivity).items.length>8)throw new Error('This pilot supports at most 8 sequence steps; no steps were removed.');
 if(activity.kind==='sequence'){
  if(activity.constraints.length>12)throw new Error('This pilot supports at most 12 sequence constraints; no ordering rules were removed.');
  const rules=activity.constraints.map(rule=>JSON.stringify([rule.before,rule.after]));
  if(new Set(rules).size!==rules.length)throw new Error('This pilot requires distinct sequence constraints; duplicate ordering rules were not removed.');
 }
 if(kind==='dependency'&&((activity as DependencyActivity).nodes.length>8||(activity as DependencyActivity).edges.length>12))throw new Error('This pilot supports at most 8 dependency nodes and 12 edges; no relationships were removed.');
 const labels=activity.kind==='sequence'?activity.items:activity.nodes;
 if(labels.some(item=>item.label.length>200))throw new Error('Pilot step and node labels must fit within 200 characters; the converter does not shorten source wording.');
 return activity;
}

/** Position activity evidence inside its already validated disclosed teaching window.
 * It may repeat elsewhere in the document; do not silently relocate it to that occurrence. */
function positionedEvidence(activity:PilotActivity,teaching:AILearningMission,sources:Source[]):EvidenceReference[] {
 return activity.sourceRefs.map(ref=>{
  const source=sources.find(item=>item.id===ref.sourceId)!;
  const window=teaching.sourceWindows.find(item=>item.sourceId===ref.sourceId&&item.quote.includes(ref.evidence));
  if(!window)throw new Error('The activity evidence is outside its retained teaching context.');
  const start=window.start+window.quote.indexOf(ref.evidence),end=start+ref.evidence.length;
  const before=source.text.slice(0,start),lineStart=before.split('\n').length,lineEnd=lineStart+(ref.evidence.match(/\n/g)?.length??0);
  const marker=[...before.matchAll(/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm)].at(-1);
  const timestamp=[...before.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)].at(-1);
  const locator:EvidenceReference['locator']=marker?{kind:marker[1].toLowerCase() as 'page'|'slide'|'sheet',label:`${marker[1]} ${marker[2]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:timestamp?{kind:'timestamp',label:`${timestamp[1]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
  const positioned={sourceId:source.id,sourceRevision:sourceRevision(source),start,end,quote:ref.evidence,locator};
  if(!isCurrentEvidence(positioned,sources))throw new Error('The activity evidence no longer matches the exact source text.');
  return positioned;
 });
}

/** No inference, source rewriting, model approval, scoring, code generation or host writes. */
export function convertLearnpack(text:string,selection:PilotSelection):MissionPack {
 if(Object.keys(selection).some(key=>!['sequenceId','dependencyId','templateId'].includes(key)))throw new Error('Unknown pilot selection option.');
 if(!selection.sequenceId&&!selection.dependencyId)throw new Error('Select an explicit sequence or dependency activity ID.');
 for(const id of Object.values(selection))if(typeof id!=='string'||!id.trim()||id.length>200)throw new Error('A selected activity ID is invalid.');
 const notebook=parsePackage(text);
 if(notebook.ageGroup!=='adult')throw new Error('This pilot presentation is for adults; choose an adult learning game.');
 if(notebook.creation?.status==='draft'||(notebook.gameDesign&&notebook.gameDesign.status!=='ready'))throw new Error('Finish the saved game before exporting a pilot mission.');
 const activities:PilotActivity[]=[];
 if(selection.sequenceId)activities.push(selectedActivity(notebook,'sequence',selection.sequenceId));
 if(selection.dependencyId)activities.push(selectedActivity(notebook,'dependency',selection.dependencyId));
 const template=selectPilotTemplate(notebook,activities,selection.templateId);
 const teaching=activities.map(activity=>{
  const mission=currentAILearningMission(notebook,activity);
  if(!mission)throw new Error(`The selected ${activity.kind} activity needs a current prepared lesson; the converter does not invent one.`);
  return mission;
 });
 const lessons:PilotLesson[]=teaching.flatMap(mission=>{
  const lesson=(title:string,body:string,citations:EvidenceReference[],role:PilotLesson['role']):PilotLesson=>({title,body,quote:citations[0].quote,citations:structuredClone(citations),activityId:mission.activityId,role});
  return[lesson(mission.title,mission.conceptExplanation.text,mission.conceptExplanation.citations,'concept'),...mission.chunks.map(chunk=>lesson(chunk.title,chunk.text,chunk.citations,'chunk')),...(mission.workedExample?.steps??[]).map(step=>lesson(step.title,step.text,step.citations,'worked-example'))];
 });
 const activityEvidence=activities.map((activity,index)=>({activityId:activity.id,citations:positionedEvidence(activity,teaching[index],notebook.sources)}));
 const sourceIds=new Set([...teaching.flatMap(mission=>mission.sourceWindows.map(ref=>ref.sourceId)),...activityEvidence.flatMap(item=>item.citations.map(ref=>ref.sourceId))]);
 const sources=notebook.sources.filter(source=>sourceIds.has(source.id)).map(source=>({id:source.id,title:source.title,text:source.text,revision:sourceRevision(source)}));
 const packageSha256=createHash('sha256').update(text,'utf8').digest('hex');
 const identity=createHash('sha256').update(JSON.stringify({packageSha256,activityIds:activities.map(activity=>activity.id),templateId:template.id,templateVersion:1})).digest('hex').slice(0,24);
 const pack:MissionPack={format:'asterloom-godot-pilot',version:1,id:`pilot-${identity}`,title:notebook.title,audience:'adult',fictionalSetting:template.name,offsetEncoding:'utf-16',presentation:{version:1,templateId:template.id},source:sources[0],sources,lessons,teaching:structuredClone(teaching),activityEvidence,assessment:{mode:'experimental-practice',mastery:false,hostProgressWrites:false},provenance:{packageSha256,notebookId:notebook.id,notebookRevision:notebook.revision,templateId:template.id,templateVersion:1,activityFingerprints:Object.fromEntries(activities.map(activity=>[activity.id,aiLearningActivityFingerprint(activity)]))}};
 for(const activity of activities){if(activity.kind==='sequence')pack.sequence=structuredClone(activity);else pack.dependency=structuredClone(activity);}
 if(Buffer.byteLength(JSON.stringify(pack,null,2)+'\n','utf8')>PILOT_MAX_BYTES)throw new Error('The complete pilot pack exceeds 4 MiB; nothing was truncated.');
 return pack;
}

export function listPilotActivities(text:string){
 const notebook=parsePackage(text);
 return (notebook.activities??[]).filter(activity=>activity.kind==='sequence'||activity.kind==='dependency').map(activity=>({id:activity.id,kind:activity.kind,title:activity.title,reviewStatus:activity.reviewStatus,hasCurrentTeaching:!!currentAILearningMission(notebook,activity)}));
}
