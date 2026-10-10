import type {Source} from '../types';
import {sourceRevision,textDigest} from './evidence';
import {isLearningContentRange} from './sourceContent';
import {segmentSource,sourceSentences} from './sourceUnits';

export interface GameDraftCitationWindow {sourceId:string;start:number;end:number}
export interface GameDraftCitationContext {source:Source;primaryWindow:GameDraftCitationWindow;teachingWindow:GameDraftCitationWindow}
export interface GameDraftCitationEntry {evidenceId:string;start:number;end:number;evidence:string;activity:boolean;teaching:boolean}
export interface GameDraftCitationCatalog {version:1;sourceId:string;sourceRevision:string;entries:GameDraftCitationEntry[]}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.filter(object):[];
const inside=(start:number,end:number,window:GameDraftCitationWindow)=>start>=window.start&&end<=window.end;

/** Supplemental exact spans, never a replacement for the disclosed source window.
 * Catalog limits leave literal exact citations available. IDs bind source revision,
 * both permitted windows and absolute UTF-16 offsets; no model-defined pool is used. */
export function buildGameDraftCitationCatalog(source:Source,primaryWindow:GameDraftCitationWindow,teachingWindow:GameDraftCitationWindow):GameDraftCitationCatalog {
 for(const window of [primaryWindow,teachingWindow])if(window.sourceId!==source.id||!Number.isSafeInteger(window.start)||!Number.isSafeInteger(window.end)||window.start<0||window.end<=window.start||window.end>source.text.length||window.end-window.start>6000)throw Error('Citation choices require complete current source windows within 6,000 characters.');
 if(!inside(primaryWindow.start,primaryWindow.end,teachingWindow))throw Error('The teaching citation window must contain the primary unit.');
 const revision=sourceRevision(source),binding=textDigest(JSON.stringify([source.id,revision,primaryWindow.start,primaryWindow.end,teachingWindow.start,teachingWindow.end])).slice(0,20);
 const text=source.text.slice(teachingWindow.start,teachingWindow.end),segments=segmentSource(text),code=segmentSource(source.text).filter(segment=>segment.kind==='code');
 const entries:GameDraftCitationEntry[]=[],seen=new Set<string>();
 const add=(start:number,end:number)=>{
  while(start<end&&/\s/u.test(source.text[start]))start++;
  while(end>start&&/\s/u.test(source.text[end-1]))end--;
  if(start>=end||!inside(start,end,teachingWindow)||entries.length>=64)return;
  const key=`${start}:${end}`;if(seen.has(key))return;seen.add(key);
  const activity=inside(start,end,primaryWindow),teaching=end-start<=1200&&!code.some(segment=>segment.start<end&&segment.end>start)&&isLearningContentRange(source.text,start,end);
  if(!activity&&!teaching)return;
  entries.push({evidenceId:`cite-${binding}-${start.toString(36)}-${end.toString(36)}`,start,end,evidence:source.text.slice(start,end),activity,teaching});
 };
 add(primaryWindow.start,primaryWindow.end);
 add(teachingWindow.start,teachingWindow.end);
 // Preserve complete paragraphs, lists and inert code before adding finer spans.
 for(const segment of segments){
  add(teachingWindow.start+segment.start,teachingWindow.start+segment.end);
 }
 // Provided cue text is copied as stored; timestamps remain in the media contract.
 for(const cue of source.transcript?.segments??[]){
  let offset=text.indexOf(cue.text);
  while(cue.text&&offset>=0&&entries.length<64){add(teachingWindow.start+offset,teachingWindow.start+offset+cue.text.length);offset=text.indexOf(cue.text,offset+1);}
 }
 for(const segment of segments)if(segment.kind!=='code')for(const sentence of sourceSentences(segment.quote,segment.start+teachingWindow.start))add(sentence.start,sentence.end);
 for(const line of text.matchAll(/[^\r\n]+/gu))add(teachingWindow.start+line.index!,teachingWindow.start+line.index!+line[0].length);
 return{version:1,sourceId:source.id,sourceRevision:revision,entries};
}

/** Decode provider-only citation IDs at known citation positions, then pass the
 * unchanged native shapes through all existing exact-source and semantic checks.
 * Never resolve arbitrary strings, action lines, answer text, code or asset IDs. */
export function resolveGameDraftCitationReply(reply:Record<string,unknown>,context:GameDraftCitationContext):Record<string,unknown> {
 if(!object(reply))throw Error('Expected a bounded writer reply.');
 const catalog=buildGameDraftCitationCatalog(context.source,context.primaryWindow,context.teachingWindow),allowed=new Map(catalog.entries.map(entry=>[entry.evidenceId,entry]));
 const result=structuredClone(reply);
 const resolve=(value:unknown,scope:'activity'|'teaching'):unknown=>{
  if(!object(value)||!Object.hasOwn(value,'evidenceId'))return value;
  if(Object.keys(value).some(key=>!['sourceId','evidenceId'].includes(key))||value.sourceId!==catalog.sourceId||typeof value.evidenceId!=='string')throw Error('A citation ID must name its disclosed source and cannot be combined with a literal quotation.');
  const entry=allowed.get(value.evidenceId);
  if(!entry||!entry[scope])throw Error('A citation ID is unknown, stale or outside this field’s disclosed source window.');
  return{sourceId:catalog.sourceId,evidence:entry.evidence};
 };
 const citations=(value:Record<string,unknown>,key:string,scope:'activity'|'teaching')=>{if(Array.isArray(value[key]))value[key]=(value[key] as unknown[]).map(item=>resolve(item,scope));};
 for(const mission of rows(result.missions)){
  if(object(mission.activity))citations(mission.activity,'sourceRefs','activity');
  if(!object(mission.teaching))continue;
  const teaching=mission.teaching;
  if(object(teaching.conceptExplanation))citations(teaching.conceptExplanation,'citations','teaching');
  for(const chunk of rows(teaching.chunks))citations(chunk,'citations','teaching');
  if(object(teaching.workedExample)){
   teaching.workedExample.sourceEvidence=resolve(teaching.workedExample.sourceEvidence,'teaching');
   for(const step of rows(teaching.workedExample.steps))citations(step,'citations','teaching');
  }
 }
 return result;
}

export const GAME_DRAFT_CITATION_INSTRUCTION=' Citation choices: each mission.citationChoices entry is an exact app-supplied source span, not a generated claim. Prefer {sourceId:mission.citationChoices.sourceId,evidenceId:the entry evidenceId} instead of copying its quotation. For activity.sourceRefs use only entries with activity:true; for teaching citations and workedExample.sourceEvidence use only entries with teaching:true. The app restores the exact original quotation before all ordinary source checks. Choose the complete supporting span, preserving its conditions. If no listed span fits, the existing {sourceId,evidence:EXACT contiguous substring} form remains available. Never combine evidenceId and evidence, concatenate passages into one quotation, invent an ID, or use a teaching-only span as scored activity evidence. Citation IDs are accepted ONLY in sourceRefs and teaching citation objects; exact source action lines, role names, evidence-piece text, code, answers and asset identifiers still use their required literal values.';
