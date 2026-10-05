import type { EvidenceReference, Notebook, Source } from '../types';
import type { StructuredActivity } from './structuredEngine';
import { isCurrentEvidence, sourceRevision, textDigest, validateLearningObjectives } from './evidence';
import { isReadyLearningSource } from './scaffoldRuntime';
import {isLearningContentRange} from './sourceContent';

/** AI wording is a reviewed authoring artifact. Exact citations establish provenance,
 * not the truth of a paraphrase; the portable player never makes inference requests. */
export class NonInstructionalTeachingEvidenceError extends Error {constructor(){super('Teaching evidence must use the source’s instructional body, not cover, publication or navigation text.');this.name='NonInstructionalTeachingEvidenceError';}}
export interface AITeachingExplanation { text:string; citations:EvidenceReference[] }
export interface AITeachingChunk extends AITeachingExplanation { id:string; title:string }
export interface AIWorkedExample {
  title:string; sourceEvidence:EvidenceReference;
  steps:(AITeachingExplanation & {title:string})[];
}
export interface AILearningMission {
  activityId:string; activityFingerprint:string; ageGroup:string; sourceWindows:EvidenceReference[];
  title:string; objective:string; conceptExplanation:AITeachingExplanation; chunks:AITeachingChunk[];
  guidedApplication:{activityId:string; prompt:string; steps:string[]};
  workedExample?:AIWorkedExample;
  storyFrame?:{fictional:true; setting:string; role:string; mission:string; success:string};
  reviewStatus:'needs-review'|'reviewed';
}
export interface AILearningPlan {version:1; missions:AILearningMission[]}
export interface AILearningDraftContext {
  activity:StructuredActivity; ageGroup:string; sources:Source[];
  sourceWindow:{sourceId:string;start:number;end:number};
}
const AGE_LIMITS:Record<string,{words:number;characters:number;chunks:number}>={
  '3-5':{words:25,characters:180,chunks:3},'6-8':{words:40,characters:280,chunks:3},
  '9-11':{words:60,characters:420,chunks:4},'12-14':{words:75,characters:520,chunks:5},
  '15-17':{words:90,characters:620,chunks:5},adult:{words:100,characters:700,chunks:5},
};
export const AI_TEACHING_DRAFT_SCHEMA='teaching:{title:string,objective:string,conceptExplanation:{text:string,citations:[{sourceId,evidence:EXACT substring}]},chunks:[{id:identifier,title:string,text:string,citations:[{sourceId,evidence:EXACT substring}]}],guidedApplication:{prompt:string,steps:[string]},optional workedExample:{title:string,sourceEvidence:{sourceId,evidence:EXACT source-provided example or labeled procedure},steps:[{title:string,text:string,citations:[{sourceId,evidence:EXACT substring}]}]},optional storyFrame:{fictional:true,setting:string,role:string,mission:string,success:string}}. Provide 2–5 short, progressive teaching chunks (at most3 for ages3–8, at most4 for ages9–11). Explain the concept in plain words BEFORE asking questions, preserving the source conditions and uncertainty. Each text has at most25 words for ages3–5,40 for6–8,60 for9–11,75 for12–14,90 for15–17,100 for adults. Cite each explanation using only the selected supplied unit’s substantive content. Cover titles, taglines, bylines, publication dates, footers and navigation do not teach the subject and cannot be evidence for a lesson. Do not copy a wall of quotes. A worked example is optional and MUST be explicitly present in the source; never invent an example, steps, reasoning or causal simulation. guidedApplication must describe the controls/actions of the actual activity and cannot introduce new subject facts or another quiz. Fictional framing must be explicitly fictional and cannot alter subject facts or model rules. No code, URLs, tools, media or review approval.';
function record(value:unknown,label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`Invalid ${label}.`);
  return value as Record<string,unknown>;
}
function fields(value:Record<string,unknown>,allowed:string[],label:string){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error(`${label} contains an unsupported field.`);}
function text(value:unknown,label:string,max=300):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Keep ${label} within ${max} characters.`);return value.trim();}
function list(value:unknown,label:string,min:number,max:number):unknown[]{if(!Array.isArray(value)||value.length<min||value.length>max)throw new Error(`Use ${min}–${max} ${label}.`);return value;}
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;return JSON.stringify(value);}
/** Approval and recipe metadata may change without erasing preparation. Content edits must invalidate it. */
export function aiLearningActivityFingerprint(activity:StructuredActivity):string{
  const {reviewStatus:_review,scaffoldIds:_bindings,extractedFrom:_origin,...content}=activity;
  return textDigest(canonical(content));
}
function exactReference(source:Source,start:number,end:number):EvidenceReference{
  const before=source.text.slice(0,start),lineStart=before.split('\n').length,lineEnd=lineStart+(source.text.slice(start,end).match(/\n/g)?.length??0);
  const marker=[...before.matchAll(/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm)].at(-1);
  const time=[...before.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)].at(-1);
  const locator:EvidenceReference['locator']=marker?{kind:marker[1].toLowerCase() as 'page'|'slide'|'sheet',label:`${marker[1]} ${marker[2]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:time?{kind:'timestamp',label:`${time[1]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
  return{sourceId:source.id,sourceRevision:sourceRevision(source),start,end,quote:source.text.slice(start,end),locator};
}
function checkedReference(value:unknown,sources:Source[]):EvidenceReference{
  const ref=validateLearningObjectives([{id:'objective-ai-citation',title:'Check the supplied exact citation',operation:'explanation',reviewStatus:'needs-review',evidence:[value]}],sources)[0].evidence[0];
  if(!isLearningContentRange(sources.find(source=>source.id===ref.sourceId)!.text,ref.start,ref.end))throw new NonInstructionalTeachingEvidenceError();
  return ref;
}
function checkedWindow(value:unknown,sources:Source[]):EvidenceReference{
  const raw=record(value,'AI source window');fields(raw,['sourceId','sourceRevision','start','end','quote','locator'],'AI source window');
  const ref=raw as unknown as EvidenceReference;
  if(typeof ref.quote!=='string'||ref.quote.length>6000||!isCurrentEvidence(ref,sources))throw new Error('AI teaching source window changed.');
  const source=sources.find(item=>item.id===ref.sourceId)!,expected=exactReference(source,ref.start,ref.end);
  if(canonical(raw)!==canonical(expected))throw new Error('AI teaching source window position or locator changed.');
  return expected;
}
function within(ref:EvidenceReference,windows:EvidenceReference[]):boolean{return windows.some(window=>window.sourceId===ref.sourceId&&window.sourceRevision===ref.sourceRevision&&ref.start>=window.start&&ref.end<=window.end);}
function learningQuoteWithin(source:Source,window:EvidenceReference,quote:string):boolean {
 if(!quote.trim())return false;let relative=window.quote.indexOf(quote);
 while(relative>=0){if(isLearningContentRange(source.text,window.start+relative,window.start+relative+quote.length))return true;relative=window.quote.indexOf(quote,relative+1);}return false;
}
function explanation(value:unknown,ageGroup:string,reference:(value:unknown)=>EvidenceReference):AITeachingExplanation{
  const item=record(value,'teaching explanation');fields(item,['text','citations'],'Teaching explanation');
  const limits=AGE_LIMITS[ageGroup];if(!limits)throw new Error('Choose a supported teaching audience.');
  const wording=text(item.text,'each teaching explanation',limits.characters);
  if(wording.split(/\s+/u).length>limits.words)throw new Error('Split the teaching into shorter age-appropriate chunks.');
  const citations=list(item.citations,'citations per explanation',1,4).map(reference);
  // Exact source detail remains inspectable in citations. Teaching should explain it rather than
  // merely duplicate a long excerpt in another card. This is a length/copy check, not a quality score.
  const normalized=wording.replace(/\s+/g,' ').toLowerCase();
  if(wording.length>180&&citations.some(ref=>ref.quote.replace(/\s+/g,' ').toLowerCase().includes(normalized)))throw new Error('Explain the idea briefly in your own words; keep the long quotation in its citation.');
  return{text:wording,citations};
}
function teachingContent(value:unknown,ageGroup:string,reference:(value:unknown)=>EvidenceReference){
  const raw=record(value,'AI teaching');fields(raw,['title','objective','conceptExplanation','chunks','guidedApplication','workedExample','storyFrame'],'AI teaching');
  const limits=AGE_LIMITS[ageGroup];if(!limits)throw new Error('Choose a supported teaching audience.');
  const chunks=list(raw.chunks,'short teaching chunks',2,limits.chunks).map((entry,index)=>{
    const chunk=record(entry,'teaching chunk');fields(chunk,['id','title','text','citations'],'Teaching chunk');
    const id=text(chunk.id,'chunk ID',60);if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)||['constructor','prototype','__proto__'].includes(id))throw new Error('Invalid teaching chunk ID.');
    return{id,title:text(chunk.title,`chunk ${index+1} title`,100),...explanation({text:chunk.text,citations:chunk.citations},ageGroup,reference)};
  });
  if(new Set(chunks.map(chunk=>chunk.id)).size!==chunks.length)throw new Error('Each teaching chunk needs a unique ID.');
  if(new Set(chunks.map(chunk=>chunk.text)).size!==chunks.length)throw new Error('Each teaching chunk must develop the lesson rather than repeat it.');
  const guide=record(raw.guidedApplication,'guided application');fields(guide,['prompt','steps'],'Guided application');
  const guidedApplication={prompt:text(guide.prompt,'guided application prompt',limits.characters),steps:list(guide.steps,'guided application steps',1,4).map(step=>text(step,'guided application step',limits.characters))};
  let workedExample:AIWorkedExample|undefined;
  if(raw.workedExample!==undefined){
    const example=record(raw.workedExample,'worked example');fields(example,['title','sourceEvidence','steps'],'Worked example');
    const sourceEvidence=reference(example.sourceEvidence);
    if(!/(?:\bworked example\b|\bfor example\b|\bexample\s*:|^(?:(?:the|source|training|supplied)\s+){0,2}(?:procedure|steps|method|workflow|instructions)\b[^\n]*[:\n])/im.test(sourceEvidence.quote))throw new Error('A worked example needs a source-provided example or explicitly labeled procedure.');
    const steps=list(example.steps,'worked example steps',1,4).map(entry=>{const step=record(entry,'worked example step');fields(step,['title','text','citations'],'Worked example step');const explained=explanation({text:step.text,citations:step.citations},ageGroup,reference);if(explained.citations.some(ref=>ref.sourceId!==sourceEvidence.sourceId||ref.start<sourceEvidence.start||ref.end>sourceEvidence.end))throw new Error('Worked steps must cite the supplied example, not unrelated material.');return{title:text(step.title,'worked example step title',100),...explained};});
    workedExample={title:text(example.title,'worked example title',100),sourceEvidence,steps};
  }
  let storyFrame:AILearningMission['storyFrame'];
  if(raw.storyFrame!==undefined){const frame=record(raw.storyFrame,'fictional story');fields(frame,['fictional','setting','role','mission','success'],'Fictional story');if(frame.fictional!==true)throw new Error('The story setting must be explicitly fictional.');storyFrame={fictional:true,setting:text(frame.setting,'fictional setting',350),role:text(frame.role,'fictional role',100),mission:text(frame.mission,'fictional mission',350),success:text(frame.success,'fictional success',250)};}
  return{title:text(raw.title,'teaching title',150),objective:text(raw.objective,'learning objective',300),conceptExplanation:explanation(raw.conceptExplanation,ageGroup,reference),chunks,guidedApplication,...(workedExample?{workedExample}:{}),...(storyFrame?{storyFrame}:{})};
}
/** Called after engine validation. All IDs, revision bindings and approval come from the local authoring app. */
export function validateAILearningMissionDraft(value:unknown,context:AILearningDraftContext):AILearningMission{
  const {activity,ageGroup,sources,sourceWindow}=context,source=sources.find(item=>item.id===sourceWindow.sourceId);
  if(!source||!isReadyLearningSource(source,sources)||!Number.isSafeInteger(sourceWindow.start)||!Number.isSafeInteger(sourceWindow.end)||sourceWindow.start<0||sourceWindow.end<=sourceWindow.start||sourceWindow.end>source.text.length||sourceWindow.end-sourceWindow.start>6000)throw new Error('AI teaching requires the current disclosed source unit.');
  const window=exactReference(source,sourceWindow.start,sourceWindow.end);
  const reference=(input:unknown)=>{const raw=record(input,'draft citation');fields(raw,['sourceId','evidence'],'Draft citation');if(raw.sourceId!==source.id)throw new Error('Teaching cited a source that was not disclosed for this mission.');const quote=text(raw.evidence,'exact teaching citation',1200);let relative=window.quote.indexOf(quote);if(relative<0)throw new Error('Teaching evidence must be an exact substring of its disclosed source unit.');while(relative>=0&&!isLearningContentRange(source.text,window.start+relative,window.start+relative+quote.length))relative=window.quote.indexOf(quote,relative+1);if(relative<0)throw new NonInstructionalTeachingEvidenceError();return exactReference(source,window.start+relative,window.start+relative+quote.length);};
  if(!activity.sourceRefs.length||activity.sourceRefs.some(ref=>ref.sourceId!==source.id||!window.quote.includes(ref.evidence)))throw new Error('Teaching and gameplay must use the same disclosed source unit.');
  if(activity.sourceRefs.some(ref=>!learningQuoteWithin(source,window,ref.evidence)))throw new NonInstructionalTeachingEvidenceError();
  const content=teachingContent(value,ageGroup,reference);
  return{...content,activityId:activity.id,activityFingerprint:aiLearningActivityFingerprint(activity),ageGroup,sourceWindows:[window],guidedApplication:{...content.guidedApplication,activityId:activity.id},reviewStatus:'needs-review'};
}
function validateMission(value:unknown,notebook:Pick<Notebook,'activities'|'sources'|'ageGroup'>):AILearningMission{
  const raw=record(value,'saved AI mission');fields(raw,['activityId','activityFingerprint','ageGroup','sourceWindows','title','objective','conceptExplanation','chunks','guidedApplication','workedExample','storyFrame','reviewStatus'],'Saved AI mission');
  const activity=(notebook.activities??[]).find(item=>item.id===raw.activityId);
  if(!activity||raw.ageGroup!==notebook.ageGroup||raw.activityFingerprint!==aiLearningActivityFingerprint(activity)||!['needs-review','reviewed'].includes(String(raw.reviewStatus)))throw new Error('AI teaching no longer matches the current mission or audience.');
  const sourceWindows=list(raw.sourceWindows,'source windows',1,3).map(ref=>checkedWindow(ref,notebook.sources));
  if(sourceWindows.some(ref=>!isReadyLearningSource(notebook.sources.find(source=>source.id===ref.sourceId),notebook.sources)))throw new Error('AI teaching source media changed or needs review.');
  if(activity.sourceRefs.some(ref=>!sourceWindows.some(window=>window.sourceId===ref.sourceId&&window.quote.includes(ref.evidence))))throw new Error('AI teaching does not cover the current mission source.');
  if(activity.sourceRefs.some(ref=>!sourceWindows.some(window=>window.sourceId===ref.sourceId&&learningQuoteWithin(notebook.sources.find(source=>source.id===ref.sourceId)!,window,ref.evidence))))throw new NonInstructionalTeachingEvidenceError();
  const reference=(input:unknown)=>{const ref=checkedReference(input,notebook.sources);if(!within(ref,sourceWindows))throw new Error('AI teaching cited material outside its disclosed source.');return ref;};
  const guide=record(raw.guidedApplication,'saved guided application');if(guide.activityId!==activity.id)throw new Error('Guided application points to a different mission.');fields(guide,['activityId','prompt','steps'],'Saved guided application');
  const content=teachingContent({title:raw.title,objective:raw.objective,conceptExplanation:raw.conceptExplanation,chunks:raw.chunks,guidedApplication:{prompt:guide.prompt,steps:guide.steps},...(raw.workedExample===undefined?{}:{workedExample:raw.workedExample}),...(raw.storyFrame===undefined?{}:{storyFrame:raw.storyFrame})},notebook.ageGroup,reference);
  return{...content,activityId:activity.id,activityFingerprint:raw.activityFingerprint as string,ageGroup:notebook.ageGroup,sourceWindows,guidedApplication:{...content.guidedApplication,activityId:activity.id},reviewStatus:raw.reviewStatus as AILearningMission['reviewStatus']};
}
/** Strict portable import: source positions, revision, model binding and bounded plain data are checked again. */
export function validateAILearningPlan(value:unknown,notebook:Pick<Notebook,'activities'|'sources'|'ageGroup'>):AILearningPlan{
  const raw=record(value,'AI learning plan');fields(raw,['version','missions'],'AI learning plan');if(raw.version!==1)throw new Error('Unsupported AI learning plan version.');
  const missions=list(raw.missions,'AI learning missions',1,300).map(mission=>validateMission(mission,notebook));
  if(new Set(missions.map(mission=>mission.activityId)).size!==missions.length)throw new Error('Each mission needs one unique AI teaching plan.');
  return{version:1,missions};
}
/** Legacy packs keep their source material and valid peer lessons. Known document furniture
 * can be omitted safely; unrelated malformed data still fails strict portable validation. */
export function validateImportedAILearningPlan(value:unknown,notebook:Pick<Notebook,'activities'|'sources'|'ageGroup'>):AILearningPlan|undefined {
  const raw=record(value,'AI learning plan');fields(raw,['version','missions'],'AI learning plan');if(raw.version!==1)throw new Error('Unsupported AI learning plan version.');
  const items=list(raw.missions,'AI learning missions',1,300),seen=new Set<unknown>(),missions:AILearningMission[]=[];
  for(const item of items){const entry=record(item,'saved AI mission');if(seen.has(entry.activityId))throw new Error('Each mission needs one unique AI teaching plan.');seen.add(entry.activityId);
    try{missions.push(validateMission(entry,notebook));}catch(error){if(!(error instanceof NonInstructionalTeachingEvidenceError))throw error;}
  }
  return missions.length?{version:1,missions}:undefined;
}
/** Source/model edits remove obsolete generated teaching without discarding other authored missions. */
export function reconcileAILearningPlan(value:unknown,notebook:Pick<Notebook,'activities'|'sources'|'ageGroup'>):AILearningPlan|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return;const raw=value as Record<string,unknown>;if(raw.version!==1||!Array.isArray(raw.missions)||raw.missions.length>300||Object.keys(raw).some(key=>!['version','missions'].includes(key)))return;
  const missions:AILearningMission[]=[],seen=new Set<string>();for(const mission of raw.missions){try{const valid=validateMission(mission,notebook);if(!seen.has(valid.activityId)){missions.push(valid);seen.add(valid.activityId);}}catch{/* Invalid or obsolete generated material never overrides source teaching. */}}
  return missions.length?{version:1,missions}:undefined;
}
export function currentAILearningMission(notebook:Notebook,activity:StructuredActivity):AILearningMission|undefined{
  const saved=(notebook as Notebook & {aiLearningPlan?:AILearningPlan}).aiLearningPlan;
  const raw=saved?.missions.find(mission=>mission.activityId===activity.id);if(!raw)return;try{return validateMission(raw,{...notebook,activities:[activity]});}catch{return;}
}
export function aiLearningMissionKey(mission:AILearningMission):string{return textDigest(canonical(mission));}
/** A citation can remain exact while an AI explanation is wrong. Export/play must retain this disclosure. */
export const AI_TEACHING_VERIFICATION_NOTE='AI-prepared explanation. Exact citations let you check the wording against the material; they do not automatically prove the explanation or its reasoning is correct.';
