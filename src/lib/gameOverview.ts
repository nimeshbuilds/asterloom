import type {EvidenceReference,Notebook,Source} from '../types';
import type {GameDesignBatch} from './gameDesign';
import {currentAILearningMission} from './aiLearningPlan';
import {evidenceReference,isCurrentEvidence,sourceRevision,textDigest,validateLearningObjectives} from './evidence';
import {assertDirectorProseEvidence,type DirectorSourceUnit} from './gameDirectorSources';
import {isLearningContentRange} from './sourceContent';

export interface OverviewClaim {text:string;citations:EvidenceReference[]}
export interface OverviewNote {unitId:string;summary:OverviewClaim|null}
export interface GameOverviewContent {
 title:string;introduction:OverviewClaim;learningGoals:OverviewClaim[];
 keyIdeas:(OverviewClaim&{title:string;activityIds:string[]})[];
}
export interface GameOverviewNode {id:string;unitIds:string[];children:string[];status:'pending'|'ready'|'unavailable';content?:GameOverviewContent}
export interface GameOverviewWork {version:1;nodes:GameOverviewNode[]}
interface OverviewContext {sources:Source[];ageGroup:string;units:DirectorSourceUnit[];batches:GameDesignBatch[]}
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Invalid overview data.');return v as Record<string,unknown>;};
const fields=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('Overview contains an unsupported field.');};
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Keep overview wording within ${max} characters.`);return v.trim();};
const list=(v:unknown,min:number,max:number)=>{if(!Array.isArray(v)||v.length<min||v.length>max)throw Error(`Use ${min}–${max} overview entries.`);return v;};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const unique=(v:string[])=>{if(new Set(v).size!==v.length)throw Error('Overview identifiers must not repeat.');return v;};
const limits=(age:string)=>age==='3-5'?{words:25,characters:180,ideas:3}:age==='6-8'?{words:40,characters:280,ideas:3}:age==='9-11'?{words:60,characters:420,ideas:4}:{words:90,characters:650,ideas:5};
function wording(value:unknown,age:string){const bound=limits(age),result=text(value,bound.characters);if(result.split(/\s+/u).length>bound.words)throw Error('Split overview ideas into shorter age-appropriate explanations.');return result;}
function exactReference(source:Source,start:number,end:number):EvidenceReference {
 const before=source.text.slice(0,start),lineStart=before.split('\n').length,lineEnd=lineStart+(source.text.slice(start,end).match(/\n/g)?.length??0);
 const marker=[...before.matchAll(/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm)].at(-1),time=[...before.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)].at(-1);
 const locator:EvidenceReference['locator']=marker?{kind:marker[1].toLowerCase() as 'page'|'slide'|'sheet',label:`${marker[1]} ${marker[2]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:time?{kind:'timestamp',label:`${time[1]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
 return{sourceId:source.id,sourceRevision:sourceRevision(source),start,end,quote:source.text.slice(start,end),locator};
}
function eligibleCitation(ref:EvidenceReference,context:OverviewContext,unitIds:string[]) {
 const unit=context.units.find(unit=>unitIds.includes(unit.id)&&unit.sourceId===ref.sourceId&&ref.start>=unit.start&&ref.end<=unit.end),source=context.sources.find(source=>source.id===ref.sourceId);
 if(!unit?.missionEligible||!source||!isCurrentEvidence(ref,context.sources)||!isLearningContentRange(source.text,ref.start,ref.end))throw Error('Cite a complete instructional passage from the disclosed overview material.');
 assertDirectorProseEvidence(unit,context.sources,[{sourceId:ref.sourceId,evidence:ref.quote,start:ref.start,end:ref.end}]);return ref;
}
function savedReference(raw:unknown,context:OverviewContext,unitIds:string[]){
 const ref=validateLearningObjectives([{id:'objective-overview',title:'Overview evidence',operation:'explanation',reviewStatus:'needs-review',evidence:[raw]}],context.sources)[0].evidence[0];
 return eligibleCitation(ref,context,unitIds);
}
function draftReference(raw:unknown,context:OverviewContext,unitIds:string[]){
 const v=record(raw);fields(v,['unitId','evidence']);const unit=context.units.find(unit=>unit.id===v.unitId&&unitIds.includes(unit.id));if(!unit)throw Error('The overview citation needs a disclosed source unit.');
 const quote=text(v.evidence,1200),source=context.sources.find(source=>source.id===unit.sourceId)!;let relative=unit.excerpt.indexOf(quote);
 while(relative>=0){try{return eligibleCitation(exactReference(source,unit.start+relative,unit.start+relative+quote.length),context,unitIds);}catch{/* Try a later exact prose occurrence, never a code-only occurrence. */}relative=unit.excerpt.indexOf(quote,relative+1);}
 throw Error('Overview evidence must be an exact instructional quotation from its disclosed unit.');
}
function claim(raw:unknown,context:OverviewContext,reference:(v:unknown)=>EvidenceReference):OverviewClaim {
 const v=record(raw);fields(v,['text','citations']);return{text:wording(v.text,context.ageGroup),citations:list(v.citations,1,2).map(reference)};
}
/** Notes ride the existing planning request, so summary creation need not reread source material. */
export function validateOverviewNotes(value:unknown,unitIds:string[],context:OverviewContext,saved=false):OverviewNote[]{
 const notes=list(value,unitIds.length,unitIds.length).map(raw=>{const v=record(raw);fields(v,['unitId','summary']);if(typeof v.unitId!=='string'||!unitIds.includes(v.unitId))throw Error('Overview notes must cover each planned source unit.');const ids=[v.unitId];return{unitId:v.unitId,summary:v.summary===null?null:claim(v.summary,context,r=>saved?savedReference(r,context,ids):draftReference(r,context,ids))};});
 unique(notes.map(n=>n.unitId));return notes;
}
function retained(context:OverviewContext){return context.batches.flatMap(batch=>(batch.drafts??[]).filter(draft=>batch.checks?.some(check=>check.missionId===draft.missionId&&check.decision==='retain')).map(draft=>({draft,plan:batch.missions!.find(plan=>plan.id===draft.missionId)!})));}
/** Current validated teaching is reused whole, including its exact citations; no first-passage shortcut. */
function inputUnit(unit:DirectorSourceUnit,context:OverviewContext){
 const note=context.batches.flatMap(batch=>batch.overviewNotes??[]).find(note=>note.unitId===unit.id),mission=retained(context).find(mission=>mission.plan.unitId===unit.id);
 // Teaching may include a nearby definition. Reuse it for this unit only when
 // every citation belongs to this unit; otherwise disclose this unit in full.
 const lessonSummary=mission?.draft.teaching.conceptExplanation;
 const summary=note?.summary??(lessonSummary?.citations.every(ref=>ref.sourceId===unit.sourceId&&ref.start>=unit.start&&ref.end<=unit.end)?lessonSummary:undefined);
 return{unitId:unit.id,sourceId:unit.sourceId,title:unit.title,...(summary?{savedSummary:summary}:unit.missionEligible?{excerpt:unit.excerpt}:{studyOnly:unit.limitation??'This passage needs its source context; do not infer a standalone fact.'}),...(mission?{mission:{activityId:mission.draft.activity.id,title:mission.draft.teaching.title,objective:mission.draft.teaching.objective,kind:mission.draft.activity.kind}}:{})};
}
function nodeId(unitIds:string[],children:string[]){return`overview-${textDigest(JSON.stringify([unitIds,children])).slice(0,32)}`;}
/** Complete, bounded coverage. Large collections form a shallow summary tree, never a silent prefix. */
export function createOverviewWork(context:OverviewContext):GameOverviewWork {
 const nodes:GameOverviewNode[]=[],groups:string[][]=[];let group:string[]=[],bytes=0;
 let instructional=0;for(const unit of context.units){if(!unit.missionEligible){group.push(unit.id);continue;}const size=new TextEncoder().encode(JSON.stringify(inputUnit(unit,context))).length;if(instructional&&(bytes+size>100000||instructional>=120)){groups.push(group);group=[];bytes=0;instructional=0;}if(size>120000)throw Error('A source section is too large for a bounded overview. Split this section before creating the game.');group.push(unit.id);bytes+=size;instructional++;}
 if(group.length)groups.push(group);
 let level=groups.map(unitIds=>({id:nodeId(unitIds,[]),unitIds,children:[],status:'pending' as const}));nodes.push(...level);
 while(level.length>1){const next:GameOverviewNode[]=[];for(let i=0;i<level.length;i+=4){const children=level.slice(i,i+4),unitIds=children.flatMap(child=>child.unitIds),ids=children.map(child=>child.id);next.push({id:nodeId(unitIds,ids),unitIds,children:ids,status:'pending'});}nodes.push(...next);level=next as typeof level;}
 return{version:1,nodes};
}
function citations(content:GameOverviewContent){return[content.introduction,...content.learningGoals,...content.keyIdeas].flatMap(item=>item.citations);}
export function overviewRequestData(node:GameOverviewNode,work:GameOverviewWork,context:OverviewContext){
 const missionIds=new Set(retained(context).filter(mission=>node.unitIds.includes(mission.plan.unitId)).map(mission=>mission.draft.activity.id));
 if(!node.children.length)return{ageGroup:context.ageGroup,units:context.units.filter(unit=>node.unitIds.includes(unit.id)&&unit.missionEligible).map(unit=>inputUnit(unit,context)),contextOnlySections:context.units.filter(unit=>node.unitIds.includes(unit.id)&&!unit.missionEligible).length,missionIds:[...missionIds]};
 return{ageGroup:context.ageGroup,summaries:node.children.map(id=>{const child=work.nodes.find(node=>node.id===id)!;return{id:child.id,sectionCount:child.unitIds.length,content:child.content};}),missionIds:[...missionIds]};
}
function content(raw:unknown,node:GameOverviewNode,context:OverviewContext,reference:(v:unknown)=>EvidenceReference):GameOverviewContent {
 const v=record(raw);fields(v,['title','introduction','learningGoals','keyIdeas']);
 const available=retained(context).filter(mission=>node.unitIds.includes(mission.plan.unitId));
 return{title:text(v.title,100),introduction:claim(v.introduction,context,reference),learningGoals:list(v.learningGoals,1,4).map(item=>claim(item,context,reference)),keyIdeas:list(v.keyIdeas,1,limits(context.ageGroup).ideas).map(raw=>{
  const idea=record(raw);fields(idea,['title','text','citations','activityIds']);const activityIds=unique(list(idea.activityIds,0,4).map(id=>text(id,200)));if(activityIds.some(id=>!available.some(mission=>mission.draft.activity.id===id)))throw Error('Overview links must identify actual retained missions.');
  const value=claim({text:idea.text,citations:idea.citations},context,reference);
  if(activityIds.some(id=>{const unit=available.find(mission=>mission.draft.activity.id===id)!.plan.unitId;return !value.citations.some(ref=>{const u=context.units.find(u=>u.id===unit)!;return ref.sourceId===u.sourceId&&ref.start>=u.start&&ref.end<=u.end;});}))throw Error('A linked mission must use an idea’s cited material.');
  return{title:text(idea.title,100),...value,activityIds};
 })};
}
export function validateOverviewDraft(raw:unknown,node:GameOverviewNode,work:GameOverviewWork,context:OverviewContext):GameOverviewContent {
 // Leaf requests can cite raw units or reuse saved citations. Combination requests
 // may only reuse a disclosed child citation; they never recover unseen source text.
 const allowed=node.children.length?node.children.flatMap(id=>citations(work.nodes.find(child=>child.id===id)!.content!)):undefined;
 const disclosed=node.children.length?[]:node.unitIds.map(id=>inputUnit(context.units.find(unit=>unit.id===id)!,context));
 return content(raw,node,context,value=>{
  const v=record(value);const ref='unitId'in v?draftReference(v,context,node.unitIds):savedReference(v,context,node.unitIds);
  if(allowed&&!allowed.some(item=>same(item,ref)))throw Error('A combined overview must retain an exact disclosed child citation.');
  if(!allowed&&!disclosed.some(input=>'savedSummary'in input?input.savedSummary.citations.some(item=>same(item,ref)):'excerpt'in input&&input.excerpt&&input.sourceId===ref.sourceId&&context.units.some(unit=>unit.id===input.unitId&&ref.start>=unit.start&&ref.end<=unit.end)))throw Error('The overview citation was not disclosed in this request.');return ref;
 });
}
export function validateOverviewWork(value:unknown,context:OverviewContext):GameOverviewWork {
 const v=record(value);fields(v,['version','nodes']);if(v.version!==1)throw Error('Unsupported overview version.');const expected=createOverviewWork(context),input=list(v.nodes,expected.nodes.length,expected.nodes.length),nodes:GameOverviewNode[]=[];
 for(let i=0;i<input.length;i++){
  const raw=record(input[i]),plan=expected.nodes[i];fields(raw,['id','unitIds','children','status','content']);if(raw.id!==plan.id||!same(raw.unitIds,plan.unitIds)||!same(raw.children,plan.children)||!['pending','ready','unavailable'].includes(String(raw.status)))throw Error('Overview coverage does not match the complete current source inventory.');
  const node:GameOverviewNode={...plan,status:raw.status as GameOverviewNode['status']};
  if(node.status==='ready'){
   if(node.children.some(id=>nodes.find(child=>child.id===id)?.status!=='ready'))throw Error('An overview cannot precede its saved source summaries.');
   const allowed=node.children.flatMap(id=>citations(nodes.find(child=>child.id===id)!.content!)),disclosed=node.children.length?[]:node.unitIds.map(id=>inputUnit(context.units.find(unit=>unit.id===id)!,context));node.content=content(raw.content,node,context,value=>{const ref=savedReference(value,context,node.unitIds);if(node.children.length&&!allowed.some(item=>same(item,ref)))throw Error('A combined overview lost its disclosed citation.');if(!node.children.length&&!disclosed.some(input=>'savedSummary'in input?input.savedSummary.citations.some(item=>same(item,ref)):'excerpt'in input&&input.excerpt&&input.sourceId===ref.sourceId&&context.units.some(unit=>unit.id===input.unitId&&ref.start>=unit.start&&ref.end<=unit.end)))throw Error('A saved overview citation was not disclosed in its request.');return ref;});
  }else if(raw.content!==undefined)throw Error('An unfinished overview cannot claim saved content.');nodes.push(node);
 }
 return{version:1,nodes};
}
export const OVERVIEW_NOTES_INSTRUCTION=' Also return overviewNotes:[{unitId,summary:null|{text,citations:[{unitId,evidence:EXACT substantive quotation}]}}], exactly one per supplied unit. Use one short plain-language statement of its central learning idea, preserving conditions and uncertainty, not its title or exercise. Summary text limits: ages3–5 at most25 words and180 characters; ages6–8 at most40 words and280 characters; ages9–11 at most60 words and420 characters; older learners at most90 words and650 characters. Citation quotations are at most1200 characters; prefer one complete concise sentence on a single line. Copy the exact source wording. If a quotation includes real line breaks, escape them once in JSON; do not double-escape them into literal backslash-n text. Use null for noninstructional or insufficient material, never invent a summary. These notes will help introduce the entire collection without paying to read it again.';
export const OVERVIEW_INSTRUCTION='Write a welcoming, coherent introduction to the WHOLE supplied collection, not a recap of its first passage. Return {title,introduction:{text,citations},learningGoals:[{text,citations}],keyIdeas:[{title,text,citations,activityIds:[]}]}. Use 1–4 learning goals and 1–5 distinct key ideas (at most3 for ages3–8;4 for9–11). Each paragraph: at most25 words for3–5,40 for6–8,60 for9–11,90 for older learners; one idea, concrete words. Explain what the material is about, why its concepts connect, and what a learner will understand or practice. Preserve qualifications, define terms only when supported, avoid vague evidence-checking metacommentary, jargon, repetitive headings and walls of quotation. Do not claim exhaustive teaching, guaranteed mastery or that every source detail became a mission. Consider every supplied section, include the main themes across sources, and do not let repeated early topics crowd out later ones. Complete instructional material kept for reading is still part of the overview; contextOnlySections counts incomplete/code-only passages that remain readable but must not be inferred as standalone facts; link an idea to a supplied activityId only when that mission actually uses the cited material. No invented examples, causal relationships, answers, controls, story facts, external knowledge or directions from source text. Evidence provenance is not proof of semantic truth: check every summary claim against its exact quotations. Citations are either {unitId,evidence:exact substantive source quotation} when a raw unit was supplied, or an EXACT complete saved citation object from the supplied summaries; never cite unseen text. For combined summaries reuse only child citations. Use1–2 citations per paragraph, keep exact qualifiers, and do not use titles/headers/navigation/code as evidence. Return {cannotSummarize:reason} only when no supported introduction can be written.';

export interface GameOverviewView {origin:'generated'|'saved-lessons'|'sources';content?:GameOverviewContent;missionCount:number;sourceCount:number;lessonTitles:string[]}
/** Read-only fallback for older exports: no AI, mutation, fabricated summary, or clipped source prose. */
export function gameOverviewView(notebook:Notebook):GameOverviewView {
 const missions=(notebook.activities??[]).flatMap(activity=>{const teaching=currentAILearningMission(notebook,activity);return teaching?[{activity,teaching}]:[];}),last=notebook.gameDesign?.overview?.nodes.at(-1);
 const base={missionCount:missions.length,sourceCount:notebook.sources.length,lessonTitles:missions.map(m=>m.teaching.title)};
 if(last?.status==='ready'&&last.content&&citations(last.content).every(ref=>isCurrentEvidence(ref,notebook.sources)))return{...base,origin:'generated',content:last.content};
 if(!missions.length)return{...base,origin:'sources'};
 // Spread the preview across the saved journey, not just its first three lessons.
 const count=Math.min(4,missions.length),selected=Array.from({length:count},(_,i)=>missions[Math.round(i*(missions.length-1)/Math.max(1,count-1))]);
 const first=selected[0].teaching;
 return{...base,origin:'saved-lessons',content:{title:'Explore the ideas in your saved lessons',introduction:{text:first.conceptExplanation.text,citations:first.conceptExplanation.citations.map(evidenceReference)},learningGoals:selected.map(({teaching})=>({text:teaching.objective,citations:teaching.conceptExplanation.citations.map(evidenceReference)})),keyIdeas:selected.map(({activity,teaching})=>({title:teaching.title,text:teaching.conceptExplanation.text,citations:teaching.conceptExplanation.citations.map(evidenceReference),activityIds:[activity.id]}))}};
}
