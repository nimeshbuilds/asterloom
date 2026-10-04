import type { EvidenceReference, LearningCard, Notebook, Source } from '../types';
import type { Scaffold } from '../data/scaffolds';
import type { StructuredActivity } from './structuredEngine';
import { evidenceBlocks, evidenceReference, sourceRevision, textDigest } from './evidence';
import { retrievalTerms } from './retrieval';
import { sourceConcepts } from './sourceUnits';
import { isPictureRaster } from './pictureEngine';
import { mediaPlaybackUrl, sourceMediaIdentity } from './mediaAssets';
import { buildLessonStory, buildLessonActionGuide, type LessonStory, type LessonActionGuide } from './lessonStory';

export interface LessonPassage { id:string; title:string; role:'focus'|'context'; reference:EvidenceReference }
export interface LessonStep { id:string; title:string; instruction:string; reference:EvidenceReference; reason?:EvidenceReference }
export interface LessonRehearsal {
  kind:'reference-kit'|'route-kit'; title:string; purpose:string; instruction:string;
  tiles:{id:string;label:string;reference:EvidenceReference}[];
  slots:{id:string;label:string;acceptedTileIds:string[];reference:EvidenceReference}[];
}
export interface LessonRehearsalState {answers:Record<string,string>;revealed:string[];selectedTileId:string;checked:boolean}
export interface LearningPlan {
  id:string; version:1; scaffoldId:string; title:string; theme:string; story:LessonStory;
  ageGroup:string; status:'grounded'|'limited'|'blocked'; warnings:string[];
  passages:LessonPassage[]; walkthrough:{kind:'source-procedure'|'source-example'|'source-reading'; title:string; limitation:string; steps:LessonStep[]};
  practice:{prompt:string; focusOptions:{id:string; passageId:string; reference:EvidenceReference}[]; orderIds:string[]; spokenAllowed:boolean};
  targets:string[]; reviewed:boolean;
  mission:{assignment:string;assignmentOrigin:'author'|'source-guide';sourceTitles:string[];evidence:EvidenceReference[];handoff:string;actionGuide:LessonActionGuide};
  rehearsal?:LessonRehearsal;
  coverage:{coveredTargetIds:string[];uncoveredTargetIds:string[]};
  media:{sourceId:string;title:string;kind:'image'|'audio'|'video';url:string;alt:string}[];
}
export interface LessonState {
  version:1; planKey:string; stage:'mission'|'context'|'walkthrough'|'practice'|'ready';
  missionAccepted:boolean; viewedPassageIds:string[]; walkthroughStep:number;
  practice:{focusId:string; explanation:string; connection:string; mode:'written'|'spoken'; spokenConfirmed:boolean; compared:boolean; order:string[]};
  mediaPositions:Record<string,number>; completedAt?:string; rehearsal?:LessonRehearsalState;
}
export const LESSON_SUPPORT_WINDOW_MS=24*60*60*1000;
const STAGES=['mission','context','walkthrough','practice','ready'] as const;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const bounded=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max;
const ids=(value:unknown,max:number):value is string[]=>Array.isArray(value)&&value.length<=max&&value.every(id=>bounded(id,100)&&/^[a-zA-Z0-9_-]+$/.test(id))&&new Set(value).size===value.length;
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(k=>keys.includes(k));
function canonical(value:unknown):string { if(value===undefined)return'null';if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;if(plain(value))return`{${Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')}}`;return JSON.stringify(value); }
function reference(source:Source,start:number,end:number):EvidenceReference {
  // Reuse the source parser's actual page/slide/time marker; only line extents change for a smaller exact quote.
  const block=evidenceBlocks(source,1200).find(b=>b.start<=start&&b.end>=start);
  const lineStart=source.text.slice(0,start).split('\n').length,lineEnd=lineStart+(source.text.slice(start,end).match(/\n/g)?.length??0);
  const prefix=block?.locator.kind!=='text'?block?.locator.label.split(' · lines ')[0]:undefined;
  return{sourceId:source.id,sourceRevision:sourceRevision(source),start,end,quote:source.text.slice(start,end),locator:{kind:block?.locator.kind??'text',label:prefix?`${prefix} · lines ${lineStart}–${lineEnd}`:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}};
}
function teachingBlocks(source:Source):ReturnType<typeof evidenceBlocks> {
  const output:ReturnType<typeof evidenceBlocks>=[];
  for(const block of evidenceBlocks(source,1000)){
    const previous=output.at(-1);
    if(previous&&(previous.quote.trim().length<40||block.quote.trim().length<40)&&block.end-previous.start<=1200&&!source.text.slice(previous.end,block.start).trim()){
      const merged=reference(source,previous.start,block.end);
      output[output.length-1]={...merged,id:`e-${textDigest(source.id).slice(0,16)}-${merged.sourceRevision.slice(0,20)}-${merged.start}-${merged.end}`,sourceTitle:source.title};
    }else output.push(block);
  }
  return output;
}
function fragments(passage:LessonPassage,sources:Source[]):EvidenceReference[] {
  const source=sources.find(s=>s.id===passage.reference.sourceId)!;
  const quote=passage.reference.quote;
  const chunks=[...quote.matchAll(/[^\n.!?]+(?:[.!?](?=\s|$)|$)|[^\n]+$/gm)];
  const out:EvidenceReference[]=[];
  for(const m of chunks){const text=m[0].trim();if(text.length<18||text.length>500)continue;const start=passage.reference.start+m.index!+m[0].indexOf(text);out.push(reference(source,start,start+text.length));if(out.length>=6)break;}
  return out.length?out:[passage.reference];
}

function attachmentIdentity(source:Source|undefined):string|null {try{return sourceMediaIdentity(source);}catch{return null;}}
function sourceBindingCurrent(source:Source,sources:Source[]):boolean {
  if(source.transcript){const parent=sources.find(s=>s.id===source.transcript!.mediaSourceId);if(attachmentIdentity(parent)!==`bytes:${source.transcript.mediaRevision}`||source.transcript.sourceRevision!==sourceRevision(source))return false;}
  if(source.visualEvidence){const v=source.visualEvidence,parent=sources.find(s=>s.id===v.parentSourceId);if(attachmentIdentity(parent)!==`bytes:${v.parentMediaRevision}`||attachmentIdentity(source)!==`bytes:${v.frameSha256}`||v.reviewStatus!=='reviewed'||v.reviewedTextSha256!==sourceRevision(source))return false;}
  return true;
}
function modelFingerprint(cards:LearningCard[],activity?:StructuredActivity):unknown {
  if(activity){const{title:_title,scaffoldIds:_bindings,extractedFrom:_extract,...model}=activity;return model;}
  return cards.map(({id,prompt,answer,options,correctIndex,sourceId,evidence,questionType,reviewStatus})=>({id,prompt,answer,options,correctIndex,sourceId,evidence,questionType,reviewStatus}));
}
// Instructional sequence: IES/WWC Practice Guide 1 recommends worked examples with practice, explanatory questions and later retrieval.
// https://ies.ed.gov/ncee/wwc/PracticeGuide/1. A completed note is engagement, not a comprehension score.
/** All subject-matter statements in the lesson remain exact source spans. Fiction and study guidance are separate. */
export function buildLearningBriefing({notebook,scaffold,cardIds,activity}:{notebook:Notebook;scaffold:Scaffold;cardIds?:string[];activity?:StructuredActivity}):LearningPlan {
  const wanted=new Set(cardIds??notebook.cards.map(c=>c.id));
  const cards=activity?[]:notebook.cards.filter(c=>wanted.has(c.id));
  const raw=activity?activity.sourceRefs.map(r=>({...r,targetId:activity.id})):cards.map(c=>({sourceId:c.sourceId,evidence:c.evidence,targetId:c.id}));
  const warnings:string[]=[], passages:LessonPassage[]=[], seen=new Set<string>();
  const blockCache=new Map<string,ReturnType<typeof evidenceBlocks>>();
  const add=(source:Source,block:ReturnType<typeof evidenceBlocks>[number],role:LessonPassage['role'])=>{if(seen.has(block.id)||passages.length>=(role==='focus'?12:16)||role==='context'&&block.quote.trim().length<40)return;seen.add(block.id);passages.push({id:block.id,title:source.title,role,reference:evidenceReference(block)});};
  const anchors:{source:Source;index:number;blocks:ReturnType<typeof evidenceBlocks>}[]=[];
  for(const ref of raw){
    const source=notebook.sources.find(s=>s.id===ref.sourceId),start=source?.text.indexOf(ref.evidence??'')??-1;
    if(!source||source.status!=='ready'||!sourceBindingCurrent(source,notebook.sources)||!ref.evidence?.trim()||start<0){warnings.push('Some mission evidence is missing, changed or not ready. Return to the author workspace to repair it.');continue;}
    let blocks=blockCache.get(source.id);if(!blocks){blocks=teachingBlocks(source);blockCache.set(source.id,blocks);}
    const matching=blocks.map((b,i)=>({b,i})).filter(({b})=>b.end>start&&b.start<start+ref.evidence.length);
    // Document segmentation omits headings/cue metadata. A short authored evidence span may
    // intentionally include its heading (e.g. 'Procedure:'); retain that exact context for teaching.
    let cursor=start;const end=start+ref.evidence.length;
    const hasGap=matching.some(({b})=>{const gap=b.start>cursor&&source.text.slice(cursor,Math.min(b.start,end)).trim();cursor=Math.max(cursor,b.end);return !!gap;})||cursor<end&&!!source.text.slice(cursor,end).trim();
    if(hasGap&&ref.evidence.length<=1200){const exactRef=reference(source,start,end);add(source,{...exactRef,id:`e-${textDigest(source.id).slice(0,16)}-${exactRef.sourceRevision.slice(0,20)}-${start}-${end}`,sourceTitle:source.title},'focus');for(const{i}of matching)anchors.push({source,index:i,blocks});}
    else for(const{b,i}of matching){add(source,b,'focus');anchors.push({source,index:i,blocks});}
  }
  // Search the whole SAME source for relevant authored background and explained examples. Lexical ranking
  // chooses material to inspect; it does not establish a new factual relationship between the passages.
  const sourceCandidates=new Map<string,{source:Source;block:ReturnType<typeof evidenceBlocks>[number];score:number}[]>();
  for(const{source,blocks}of anchors){if(sourceCandidates.has(source.id))continue;
    const terms=new Set(retrievalTerms(raw.filter(r=>r.sourceId===source.id).map(r=>r.evidence).join(' ')).filter(t=>t.length>2));
    const candidates=blocks.filter(b=>!seen.has(b.id)).map(block=>{const overlap=new Set(retrievalTerms(block.quote).filter(t=>terms.has(t))).size;const teaching=/\b(?:example|because|therefore|background|introduction|overview|means|defined|procedure|steps|method)\b/i.test(block.quote);return{source,block,score:overlap+(overlap>0&&teaching?4:0)};}).filter(c=>c.score>=2).sort((a,b)=>b.score-a.score||a.block.start-b.block.start);
    sourceCandidates.set(source.id,candidates);
  }
  // Fair first pass gives each source a contextual passage before one large source can consume the budget.
  for(const candidates of sourceCandidates.values())if(candidates[0])add(candidates[0].source,candidates[0].block,'context');
  for(const{source,index,blocks}of anchors){if(index>0)add(source,blocks[index-1],'context');if(index+1<blocks.length)add(source,blocks[index+1],'context');}
  for(const candidate of [...sourceCandidates.values()].flat().sort((a,b)=>b.score-a.score||a.block.start-b.block.start))add(candidate.source,candidate.block,'context');
  const targets=activity?[activity.id]:cards.map(c=>c.id);
  const covered=(ref:typeof raw[number])=>{const source=notebook.sources.find(s=>s.id===ref.sourceId);if(!source||!ref.evidence.trim())return false;const start=source.text.indexOf(ref.evidence);if(start<0)return false;const end=start+ref.evidence.length;let cursor=start;const spans=passages.filter(p=>p.reference.sourceId===ref.sourceId).map(p=>p.reference).sort((a,b)=>a.start-b.start);for(const span of spans){if(span.end<=cursor||span.start>=end)continue;if(span.start>cursor&&source.text.slice(cursor,span.start).trim())return false;cursor=Math.max(cursor,span.end);if(cursor>=end)return true;}return cursor>=end||!source.text.slice(cursor,end).trim();};
  const coveredTargetIds=targets.filter(id=>raw.some(r=>r.targetId===id)&&raw.filter(r=>r.targetId===id).every(covered));
  const uncoveredTargetIds=targets.filter(id=>!coveredTargetIds.includes(id));
  if(uncoveredTargetIds.length)warnings.push('This chapter cannot include all of its source evidence within the lesson limit. Split the deck into smaller chapters or repair the missing evidence before starting a quest.');
  const sourceOrder=new Map(notebook.sources.map((s,i)=>[s.id,i]));
  passages.sort((a,b)=>(sourceOrder.get(a.reference.sourceId)??0)-(sourceOrder.get(b.reference.sourceId)??0)||a.reference.start-b.reference.start);
  if([...sourceCandidates.values()].some(c=>c.length))warnings.push('Related source passages were selected by shared words. Check their relevance; selection alone does not establish a causal connection.');
  if(!raw.length)warnings.push('No learning target was selected.');
  const total=passages.reduce((n,p)=>n+p.reference.quote.trim().length,0);
  const sparse=total<120;
  if(!passages.length)warnings.push('A grounded lesson needs readable source material. Add background, an example and its explanation; a source-free question cannot supply them.');
  else if(sparse)warnings.push('The supplied excerpt is too brief for a full background lesson. This is a limited source-reading orientation; ask the author for context or an explained example.');
  const currentEvidence=raw.length>0&&raw.every(ref=>{const source=notebook.sources.find(s=>s.id===ref.sourceId);return source?.status==='ready'&&sourceBindingCurrent(source,notebook.sources)&&!!ref.evidence?.trim()&&source.text.includes(ref.evidence);});
  const reviewed=currentEvidence&&(activity?activity.reviewStatus==='reviewed':cards.length>0&&cards.every(c=>c.reviewStatus!=='needs-review'));
  if(!reviewed)warnings.push('The author has not approved every mission model. Teaching and draft preview do not grant learning credit.');
  const story=buildLessonStory(scaffold,notebook.ageGroup);
  let kind:LearningPlan['walkthrough']['kind']='source-reading',title='A worked source-reading approach',limitation='The source does not supply a complete worked solution here. This walkthrough demonstrates how to read its evidence; it does not invent a solution or causal explanation.';
  let steps:LessonStep[]=[];
  // A numbered list is a procedure only when the source labels it as one. A list alone does not prove dependency.
  for(const passage of passages){
    if(!/\b(?:procedure|steps|method|workflow|instructions)\b/i.test(passage.reference.quote))continue;
    const matches=[...passage.reference.quote.matchAll(/^\s*(\d{1,2})[.)][ \t]+(.+)$/gm)];
    if(matches.length<2||matches.length>6||matches.some((m,i)=>Number(m[1])!==i+1))continue;
    const source=notebook.sources.find(s=>s.id===passage.reference.sourceId)!;
    steps=matches.map((m,i)=>{const start=passage.reference.start+m.index!+m[0].indexOf(m[2]);return{id:`step-${i}`,title:`Source step ${i+1}`,instruction:i===0?'Start with the first action explicitly listed by the source.':'Follow the next explicitly listed action. Order alone does not establish why this step is necessary.',reference:reference(source,start,start+m[2].length)};});
    kind='source-procedure';title='Walk through the source procedure';limitation='The order is quoted from the source. A cause or prerequisite is not inferred unless the source states it.';break;
  }
  if(!steps.length){
    const example=passages.find(p=>/\b(?:worked example|for example|example\s*:)/i.test(p.reference.quote));
    if(example){const units=fragments(example,notebook.sources);const reason=units.find(u=>/\b(?:because|therefore|so that|as a result|this means|consequently)\b/i.test(u.quote));
      if(reason){kind='source-example';title='Study a source-provided example';limitation='The example and explanation below are quoted. This does not establish that they generalize beyond the source conditions.';steps=units.slice(0,4).map((unit,i)=>({id:`step-${i}`,title:i===0?'Read the example in context':unit===reason?'Inspect the stated reasoning':'Track the next statement',instruction:unit===reason?'The source supplies a reasoning statement. Identify the conditions it depends on.':'Keep this statement connected to the surrounding example; do not supply unstated steps.',reference:unit,...(i===0?{reason}: {})}));}
    }
  }
  if(!steps.length&&passages.length){const first=passages.find(p=>p.role==='focus')??passages[0];const units=fragments(first,notebook.sources);const other=passages.find(p=>p.id!==first.id);
    steps=[{id:'step-0',title:'Locate the subject and its scope',instruction:'Read the statement as a whole. Notice what it is describing and any words that restrict when it applies.',reference:units[0]},
      {id:'step-1',title:'Inspect the relationship',instruction:'Look for the source’s own definition, comparison, order or reason. If it does not state a reason, keep that question open.',reference:units[1]??units[0]},
      {id:'step-2',title:'Connect the surrounding context',instruction:other?'Compare this neighboring passage with the focus statement. Decide what connection the text supports and what would need more evidence.':'This is the extent of the supplied context. Identify a question the author would need to answer before you could apply it more broadly.',reference:other?.reference??first.reference}];}
  steps=steps.filter((step,i,all)=>all.findIndex(other=>other.reference.sourceId===step.reference.sourceId&&other.reference.start===step.reference.start&&other.reference.end===step.reference.end)===i);
  const rehearsal=buildRehearsal(passages,notebook.sources,kind,steps);
  const subjectLabels=rehearsal?.kind==='reference-kit'?rehearsal.tiles.map(tile=>tile.label):Array.from(new Set(passages.filter(p=>p.role==='focus').map(p=>p.title)));
  const assignment=activity?.instruction??`${story.mission} Your material: ${subjectLabels.join(' · ')}.`;
  const focusOptions=passages.flatMap(p=>fragments(p,notebook.sources).slice(0,2).map((ref,i)=>({id:`focus-${textDigest(p.id).slice(0,12)}-${i}`,passageId:p.id,reference:ref}))).slice(0,12);
  const mediaIds=new Set(raw.map(ref=>ref.sourceId));
  if(activity?.kind==='media')mediaIds.add(activity.mediaSourceId);
  notebook.sources.filter(s=>mediaIds.has(s.id)).forEach(s=>{if(s.transcript)mediaIds.add(s.transcript.mediaSourceId);if(s.visualEvidence)mediaIds.add(s.visualEvidence.parentSourceId);});
  if(activity&&'sceneSourceId' in activity&&typeof activity.sceneSourceId==='string')mediaIds.add(activity.sceneSourceId);
  if(activity?.kind==='picture'&&Array.isArray(activity.rounds))activity.rounds.forEach(r=>{if(r.narrationSourceId)mediaIds.add(r.narrationSourceId);});
  const planData={version:1,scaffoldId:scaffold.id,age:notebook.ageGroup,notebookId:notebook.id,model:modelFingerprint(cards,activity),evidence:passages.map(p=>p.reference),media:notebook.sources.filter(s=>mediaIds.has(s.id)).map(s=>({id:s.id,identity:attachmentIdentity(s),transcript:s.transcript,visualEvidence:s.visualEvidence}))};
  const visualIds=new Set(mediaIds);if(activity&&'sceneSourceId' in activity&&typeof activity.sceneSourceId==='string')visualIds.add(activity.sceneSourceId);if(activity?.kind==='picture'&&Array.isArray(activity.rounds))activity.rounds.forEach(r=>{if(r.narrationSourceId)visualIds.add(r.narrationSourceId);});
  const media=notebook.sources.filter(s=>visualIds.has(s.id)&&(s.status==='ready'||(s.kind==='audio'||s.kind==='video')&&s.status==='needs-transcript')).flatMap<LearningPlan['media'][number]>(s=>{if(s.kind==='image'&&isPictureRaster(s.dataUrl))return[{sourceId:s.id,title:s.title,kind:'image' as const,url:s.dataUrl,alt:`Original uploaded image: ${s.title}. The source annotation is quoted below.`}];if(s.kind==='audio'||s.kind==='video'){const url=mediaPlaybackUrl(s);if(url)return[{sourceId:s.id,title:s.title,kind:s.kind,url,alt:s.title}];}return[];}).slice(0,6);
  return{id:`lesson-${textDigest(canonical(planData))}`,version:1,scaffoldId:scaffold.id,title:activity?.title??notebook.title,theme:notebook.theme,story,ageGroup:notebook.ageGroup,status:!passages.length||uncoveredTargetIds.length?'blocked':sparse||warnings.some(w=>w.startsWith('Some mission'))?'limited':'grounded',warnings:[...new Set(warnings)],passages,walkthrough:{kind,title,limitation,steps},practice:{prompt:story.reflection,focusOptions,orderIds:kind==='source-procedure'?steps.map(s=>s.id):[],spokenAllowed:notebook.ageGroup==='3-5'||notebook.ageGroup==='6-8'},targets,reviewed,mission:{assignment,assignmentOrigin:activity?'author':'source-guide',sourceTitles:Array.from(new Set(passages.map(p=>p.title))),evidence:raw.flatMap(ref=>{const source=notebook.sources.find(s=>s.id===ref.sourceId);const start=source?.text.indexOf(ref.evidence)??-1;return source&&source.status==='ready'&&sourceBindingCurrent(source,notebook.sources)&&start>=0&&ref.evidence.trim()?[reference(source,start,start+ref.evidence.length)]:[]}).slice(0,3),handoff:story.transfer,actionGuide:buildLessonActionGuide(activity)},...(rehearsal?{rehearsal}:{}),coverage:{coveredTargetIds,uncoveredTargetIds},media};
}

/** Build only relationships explicitly represented in the material. No invented distractor facts. */
function buildRehearsal(passages:LessonPassage[],sources:Source[],kind:LearningPlan['walkthrough']['kind'],steps:LessonStep[]):LessonRehearsal|undefined {
  if(kind==='source-procedure'&&steps.length>=2){
    return{kind:'route-kit',title:'Build your route kit',purpose:'Use the source’s order to prepare the next move. The route records order, not an unstated cause.',instruction:'Choose a source step, then place it in the route. Inspect the source when you need a clue.',tiles:steps.map(step=>({id:step.id,label:step.reference.quote,reference:step.reference})),slots:steps.map((step,i)=>({id:`place-${i}`,label:`Step ${i+1}`,acceptedTileIds:[step.id],reference:step.reference}))};
  }
  const pairs:{term:string;meaning:string;reference:EvidenceReference}[]=[];
  for(const source of sources){
    const focus=passages.filter(p=>p.role==='focus'&&p.reference.sourceId===source.id);
    if(!focus.length)continue;
    for(const concept of sourceConcepts(source.text)){
      if(!focus.some(p=>concept.start>=p.reference.start&&concept.end<=p.reference.end)||concept.description.length>350)continue;
      pairs.push({term:concept.term,meaning:concept.description,reference:reference(source,concept.start,concept.end)});
    }
  }
  // Ambiguous labels or repeated descriptions cannot be graded as a unique match.
  const unique=pairs.filter(p=>!pairs.some(other=>other!==p&&(other.term.toLowerCase()===p.term.toLowerCase()&&other.meaning!==p.meaning||other.meaning===p.meaning&&other.term.toLowerCase()!==p.term.toLowerCase()))).filter((p,i,all)=>all.findIndex(other=>other.term.toLowerCase()===p.term.toLowerCase()&&other.meaning===p.meaning)===i);
  // A small tutorial must not silently truncate a larger collection into a claimed complete guide.
  if(unique.length<2||unique.length>6)return;
  const selected=unique;
  return{kind:'reference-kit',title:'Assemble your field guide',purpose:'Give each source idea a useful place in your guide. Carry these distinctions into the quest.',instruction:'Choose a term tile, then place it beside its source meaning. You can move a tile and try a different arrangement.',tiles:selected.map((p,i)=>({id:`term-${i}`,label:p.term,reference:p.reference})),slots:selected.map((p,i)=>({id:`meaning-${i}`,label:p.meaning,acceptedTileIds:[`term-${i}`],reference:p.reference}))};
}
export function beginLessonRehearsal(plan:LearningPlan,saved?:unknown):LessonState {
  const state=initialLessonState(plan,saved);if(!plan.rehearsal||plan.status==='blocked')return state;
  const first=plan.rehearsal.slots[0];
  return{...state,missionAccepted:true,stage:'practice',rehearsal:state.rehearsal??{answers:{[first.id]:first.acceptedTileIds[0]},revealed:[first.id],selectedTileId:'',checked:false}};
}
export function lessonRehearsalChecks(plan:LearningPlan,saved?:LessonRehearsalState){
  return(plan.rehearsal?.slots??[]).map(slot=>({id:slot.id,correct:slot.acceptedTileIds.includes(saved?.answers[slot.id]??''),reference:slot.reference}));
}
export function lessonRehearsalReady(plan:LearningPlan,saved?:LessonRehearsalState):boolean {
  const checks=lessonRehearsalChecks(plan,saved);return !!saved?.checked&&checks.length>=2&&checks.every(c=>c.correct);
}
/** A source-bound artifact for the quest. Inspection during a later retrieval is support, not independent recall. */
export function lessonToolkit(plan:LearningPlan,saved?:unknown):{id:string;label:string;meaning:string;reference:EvidenceReference}[]{
  const state=initialLessonState(plan,saved);if(!lessonRehearsalReady(plan,state.rehearsal)||!plan.rehearsal)return[];
  return plan.rehearsal.slots.map(slot=>({id:slot.id,label:plan.rehearsal!.tiles.find(t=>t.id===state.rehearsal!.answers[slot.id])!.label,meaning:slot.label,reference:slot.reference}));
}
/** Strict standalone portable-state validation. No lesson facts, credentials, or unbounded response objects are stored. */
export function validateLessonState(value:unknown):LessonState|undefined {
  if(!plain(value)||!exact(value,['version','planKey','stage','missionAccepted','viewedPassageIds','walkthroughStep','practice','mediaPositions','completedAt','rehearsal'])||value.version!==1||typeof value.planKey!=='string'||!/^lesson-[a-f0-9]{64}$/.test(value.planKey)||!STAGES.includes(value.stage as LessonState['stage'])||typeof value.missionAccepted!=='boolean'||!ids(value.viewedPassageIds,16)||!Number.isInteger(value.walkthroughStep)||(value.walkthroughStep as number)<0||(value.walkthroughStep as number)>6||!plain(value.practice))return;
  const p=value.practice;
  if(!exact(p,['focusId','explanation','connection','mode','spokenConfirmed','compared','order'])||!bounded(p.focusId,100)||!bounded(p.explanation,1200)||!bounded(p.connection,700)||!['written','spoken'].includes(String(p.mode))||typeof p.spokenConfirmed!=='boolean'||typeof p.compared!=='boolean'||!ids(p.order,6))return;
  if(value.completedAt!==undefined&&(typeof value.completedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.completedAt)||!Number.isFinite(Date.parse(value.completedAt))))return;
  const positions=value.mediaPositions===undefined?{}:value.mediaPositions;if(!plain(positions)||Object.keys(positions).length>6||Object.entries(positions).some(([id,time])=>!id||id.length>100||['__proto__','constructor','prototype'].includes(id)||typeof time!=='number'||!Number.isFinite(time)||time<0||time>43200))return;
  const r=value.rehearsal;let rehearsal:LessonRehearsalState|undefined;
  if(r!==undefined){
    if(!plain(r)||!exact(r,['answers','revealed','selectedTileId','checked'])||!plain(r.answers)||Object.keys(r.answers).length>6||Object.entries(r.answers).some(([key,answer])=>!/^[-a-zA-Z0-9_]{1,80}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||typeof answer!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(answer))||!ids(r.revealed,6)||!bounded(r.selectedTileId,80)||typeof r.checked!=='boolean')return;
    rehearsal={answers:{...r.answers} as Record<string,string>,revealed:[...r.revealed],selectedTileId:r.selectedTileId,checked:r.checked};
  }
  return{version:1,...(rehearsal?{rehearsal}:{}),mediaPositions:{...positions} as Record<string,number>,planKey:value.planKey,stage:value.stage as LessonState['stage'],missionAccepted:value.missionAccepted,viewedPassageIds:[...value.viewedPassageIds],walkthroughStep:value.walkthroughStep as number,practice:{focusId:p.focusId,explanation:p.explanation,connection:p.connection,mode:p.mode as 'written'|'spoken',spokenConfirmed:p.spokenConfirmed,compared:p.compared,order:[...p.order]},...(typeof value.completedAt==='string'?{completedAt:value.completedAt}:{})};
}
function fresh(plan:LearningPlan):LessonState{return{version:1,mediaPositions:{},planKey:plan.id,stage:'mission',missionAccepted:false,viewedPassageIds:[],walkthroughStep:0,practice:{focusId:'',explanation:'',connection:'',mode:plan.ageGroup==='3-5'?'spoken':'written',spokenConfirmed:false,compared:false,order:[...plan.practice.orderIds].reverse()}};}
export function lessonPracticeReady(plan:LearningPlan,state:LessonState):boolean {
  if(state.rehearsal)return lessonRehearsalReady(plan,state.rehearsal);
  const p=state.practice;
  return plan.practice.focusOptions.some(f=>f.id===p.focusId)&&p.compared&&(p.mode==='spoken'?plan.practice.spokenAllowed&&p.spokenConfirmed:p.explanation.trim().length>=12&&p.connection.trim().length>=8)&&(!plan.practice.orderIds.length||canonical(p.order)===canonical(plan.practice.orderIds));
}
/** Revalidate each prerequisite; a stale or hand-written completed flag cannot unlock a new source/model. */
export function initialLessonState(plan:LearningPlan,saved?:unknown):LessonState {
  const parsed=validateLessonState(saved);if(!parsed||parsed.planKey!==plan.id)return fresh(plan);
  const state:LessonState={...parsed,mediaPositions:Object.fromEntries(Object.entries(parsed.mediaPositions).filter(([id])=>plan.media.some(m=>m.sourceId===id))),viewedPassageIds:parsed.viewedPassageIds.filter(id=>plan.passages.some(p=>p.id===id)),walkthroughStep:Math.min(parsed.walkthroughStep,plan.walkthrough.steps.length),practice:{...parsed.practice,focusId:plan.practice.focusOptions.some(f=>f.id===parsed.practice.focusId)?parsed.practice.focusId:'',order:parsed.practice.order.length===plan.practice.orderIds.length&&parsed.practice.order.every(id=>plan.practice.orderIds.includes(id))?parsed.practice.order:[...plan.practice.orderIds].reverse()}};
  if(state.rehearsal){if(!plan.rehearsal){delete state.rehearsal;}else{const validTiles=new Set(plan.rehearsal.tiles.map(t=>t.id)),validSlots=new Set(plan.rehearsal.slots.map(s=>s.id));state.rehearsal={...state.rehearsal,answers:Object.fromEntries(Object.entries(state.rehearsal.answers).filter(([key,value])=>validSlots.has(key)&&validTiles.has(value))),revealed:state.rehearsal.revealed.filter(id=>validSlots.has(id)),selectedTileId:validTiles.has(state.rehearsal.selectedTileId)?state.rehearsal.selectedTileId:''};}}
  const context=!!state.rehearsal||plan.passages.length>0&&plan.passages.every(p=>state.viewedPassageIds.includes(p.id));
  const walked=!!state.rehearsal||state.walkthroughStep===plan.walkthrough.steps.length&&plan.walkthrough.steps.length>0;
  const allowed=!state.missionAccepted?0:!context?1:!walked?2:!lessonPracticeReady(plan,state)||!state.completedAt?3:4;
  if(STAGES.indexOf(state.stage)>allowed)state.stage=STAGES[allowed];
  if(allowed<4||plan.status==='blocked'){delete state.completedAt;if(state.stage==='ready')state.stage='practice';}
  return state;
}
export function lessonReady(plan:LearningPlan,saved?:unknown):boolean {const state=initialLessonState(plan,saved);return plan.status!=='blocked'&&state.stage==='ready'&&!!state.completedAt&&lessonPracticeReady(plan,state);}
export function completeLesson(plan:LearningPlan,saved:unknown,now=Date.now()):LessonState {
  const state=initialLessonState(plan,saved);if(plan.status==='blocked'||!state.missionAccepted||(!state.rehearsal&&(!plan.passages.every(p=>state.viewedPassageIds.includes(p.id))||state.walkthroughStep!==plan.walkthrough.steps.length))||!lessonPracticeReady(plan,state)||!Number.isFinite(now))return state;
  return{...state,stage:'ready',completedAt:new Date(now).toISOString()};
}
export function lessonQuestSupport(plan:LearningPlan,saved:unknown,now=Date.now()):{assisted:boolean;reason:string} {
  const state=initialLessonState(plan,saved);
  if(!lessonReady(plan,state))return{assisted:true,reason:'Complete the source briefing before beginning this quest.'};
  if(!plan.reviewed)return{assisted:true,reason:'This mission is an unapproved draft; preview cannot grant independent learning credit.'};
  const elapsed=now-Date.parse(state.completedAt!);
  if(!Number.isFinite(elapsed)||elapsed<LESSON_SUPPORT_WINDOW_MS)return{assisted:true,reason:'This first-day quest is supported practice after teaching. Return later for independent retrieval; 24 hours is a product default, not a guarantee of retention.'};
  return{assisted:false,reason:'The saved briefing is at least 24 hours old. Attempt the quest without reopening teaching or hints for independent retrieval.'};
}
