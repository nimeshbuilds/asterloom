import type {Source} from '../types';
import {textDigest} from './evidence';

export interface TranscriptInputSegment {start:number;end:number;text:string;confidence?:number;uncertain?:boolean}
export interface TranscriptOrigin {format:'srt'|'vtt'|'plain'|'asr';timing:'provided'|'estimated';language?:string;engine?:string;model?:string}
export type MediaTranscriptInput = {format:'srt'|'vtt'|'plain';text:string} | {format:'asr';segments:TranscriptInputSegment[];text?:string;duration?:number;language?:string;engine?:string;model?:string} | {format:'edited';segments:TranscriptInputSegment[];origin:TranscriptOrigin;duration?:number};
export interface MediaTranscriptSegment {
 id:string;start:number|null;end:number|null;startOffset:number;endOffset:number;text:string;confidence?:number;uncertain:boolean;
}
export interface MediaTranscript {
 version:1;mediaSourceId:string;mediaRevision:string;sourceRevision:string;edited?:boolean;format:'srt'|'vtt'|'plain'|'asr';timing:'provided'|'estimated'|'unavailable';duration?:number;language?:string;engine?:string;model?:string;
 segments:MediaTranscriptSegment[];warnings:string[];
}
export interface TranscriptOptions {mediaSourceId:string;mediaRevision:string;duration?:number;language?:string;engine?:string;model?:string}
export interface PreparedMediaTranscript {text:string;transcript:MediaTranscript;warnings:string[]}
const MAX_TEXT=500_000,MAX_SEGMENTS=10_000,MAX_SEGMENT_TEXT=4000,MAX_SECONDS=43200;
const SAFE_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const HASH=/^[a-f0-9]{64}$/;
const formats=['srt','vtt','plain','asr'];
const forbidden=new Set(['__proto__','constructor','prototype']);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const validId=(value:unknown):value is string=>typeof value==='string'&&SAFE_ID.test(value)&&!forbidden.has(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function only(value:Record<string,unknown>,keys:string[],label:string){if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error(`${label} contains unsupported fields.`);}
function boundedText(value:unknown,max:number,label:string):asserts value is string {if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label} must contain 1–${max} characters.`);}
function cleanText(text:string){return text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();}
function spokenText(text:string){return cleanText(text.replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name as 'amp'])));}
const uncertainWords=(text:string)=>/\[(?:inaudible|unintelligible|unclear|unknown)\]|\?{2,}/i.test(text);
function stamp(text:string){const match=text.trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})$/);if(!match||Number(match[2])>59||Number(match[3])>59)return null;const value=Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;return value<=MAX_SECONDS?value:null;}
function subtitleSegments(text:string):TranscriptInputSegment[]{
 const lines=cleanText(text).split('\n'),segments:TranscriptInputSegment[]=[];let metadata=false;
 for(let index=0;index<lines.length;index++){
  const line=lines[index].trim();if(!line){metadata=false;continue;}
  if(/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(line)){metadata=true;continue;}
  if(metadata)continue;if(!line.includes('-->'))continue;
  const parts=line.match(/^(\S+)\s*-->\s*(\S+)(?:\s.*)?$/),start=parts?stamp(parts[1]):null,end=parts?stamp(parts[2]):null;
  if(start===null||end===null||end<=start)throw new Error(`Subtitle line ${index+1} has an invalid start/end time.`);
  const body:string[]=[];while(index+1<lines.length&&lines[index+1].trim()&&!lines[index+1].includes('-->'))body.push(lines[++index]);
  if(index+1<lines.length&&lines[index+1].includes('-->')&&/^\d+$/.test(body.at(-1)?.trim()??''))body.pop();
  const content=spokenText(body.join('\n'));if(content)segments.push({start,end,text:content});
 }
 if(!segments.length)throw new Error('No readable timed cues were found. Supply valid SRT/VTT captions or choose plain transcript text.');return segments;
}
/** Canonical readable text is the evidence surface; source-file bytes are retained separately. */
export function normalizeMediaTranscript(input:MediaTranscriptInput,options:TranscriptOptions):PreparedMediaTranscript {
 if(input.format==='asr'||input.format==='edited'){const origin=input.format==='edited'?input.origin:input;if(input.format==='edited'&&(!origin||!formats.includes(String(input.origin.format))||!['provided','estimated'].includes(input.origin.timing)))throw new Error('Edited transcript provenance is invalid.');options={...options,duration:options.duration??input.duration,language:options.language??origin.language,engine:options.engine??origin.engine,model:options.model??origin.model};}
 if(!validId(options.mediaSourceId)||!HASH.test(options.mediaRevision))throw new Error('Link the transcript to a recording ID and its SHA-256 byte checksum.');
 if(options.duration!==undefined&&(!finite(options.duration)||options.duration<1||options.duration>MAX_SECONDS))throw new Error('Recording duration must be between 1 second and 12 hours.');
 if(options.language!==undefined)boundedText(options.language,100,'Transcript language');if(options.engine!==undefined)boundedText(options.engine,200,'Transcript engine');if(options.model!==undefined)boundedText(options.model,200,'Transcript model');
 const warnings:string[]=[];let raw:{start:number|null;end:number|null;text:string;confidence?:number;uncertain?:boolean}[];let timing:MediaTranscript['timing'];
 if(input.format==='asr'||input.format==='edited'){
  const inputLabel=input.format==='asr'?'Machine':'Edited';if(!Array.isArray(input.segments)||!input.segments.length||input.segments.length>MAX_SEGMENTS)throw new Error(`A transcript needs 1–${MAX_SEGMENTS} segments.`);
  raw=input.segments.map((segment,index)=>{if(!object(segment))throw new Error(`${inputLabel} segment ${index+1} is invalid.`);boundedText(segment.text,MAX_SEGMENT_TEXT,`${inputLabel} segment ${index+1}`);if(!finite(segment.start)||!finite(segment.end)||segment.start<0||segment.end<=segment.start||segment.end>MAX_SECONDS)throw new Error(`${inputLabel} segment ${index+1} has invalid times.`);if(segment.confidence!==undefined&&(!finite(segment.confidence)||segment.confidence<0||segment.confidence>1))throw new Error(`${inputLabel} segment ${index+1} confidence must be between 0 and 1.`);if(segment.uncertain!==undefined&&typeof segment.uncertain!=='boolean')throw new Error(`${inputLabel} segment ${index+1} uncertainty flag is invalid.`);return{start:segment.start,end:segment.end,text:cleanText(segment.text),...(segment.confidence===undefined?{}:{confidence:segment.confidence}),uncertain:segment.uncertain===true};});
  timing=input.format==='edited'?input.origin.timing:'provided';if(input.format==='edited')warnings.push('Transcript cues were edited by the creator. Compare the edited words and times with the recording before approving learning activities.');if(input.format==='edited'&&input.origin.timing==='estimated')warnings.push('These timings originated as text-length estimates. Editing a cue does not automatically establish speech alignment.');if(input.format==='asr'||input.origin.format==='asr')warnings.push('Machine transcript: compare the words and timings with the recording before approving learning activities. Confidence values, when supplied, are recognition estimates, not factual verification.');
 }else{
  boundedText(input.text,MAX_TEXT,'Transcript');
  if(input.format==='plain'){
   const text=cleanText(input.text);raw=text.split(/\n+/).flatMap(line=>/^\s*\d+[.)]\s/.test(line)||line.includes(':')||line.includes('：')?[line]:line.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u)).filter(value=>value.trim()).map(text=>({start:null,end:null,text:cleanText(text)}));timing=options.duration?'estimated':'unavailable';
   if(options.duration){const weights=raw.map(segment=>Math.max(1,segment.text.split(/\s+/).length)),total=weights.reduce((a,b)=>a+b,0);let elapsed=0;raw=raw.map((segment,i)=>{const start=elapsed;elapsed+=options.duration!*weights[i]/total;return{...segment,start,end:i===raw.length-1?options.duration!:elapsed};});warnings.push('Plain-text timings are estimated from word counts, not aligned to speech. Review and adjust every checkpoint before publishing.');}
   else warnings.push('This transcript has no timestamps or recording duration. Text-based practice is available; timed checkpoints require duration or timed captions.');
  }else{raw=subtitleSegments(input.text);timing='provided';}
 }
 if(!raw.length||raw.length>MAX_SEGMENTS)throw new Error(`Use 1–${MAX_SEGMENTS} readable transcript segments.`);
 let text='',previous=-1,overlap=false;const segments:MediaTranscriptSegment[]=raw.map((segment,index)=>{
  boundedText(segment.text,MAX_SEGMENT_TEXT,`Transcript segment ${index+1}`);if(segment.start!==null&&segment.end!==null){if(segment.start<previous)throw new Error('Transcript segments must be in chronological order.');if(index&&raw[index-1].end!==null&&segment.start<raw[index-1].end!)overlap=true;previous=segment.start;if(options.duration&&segment.end>options.duration+.5)throw new Error(`Transcript segment ${index+1} ends after the attached recording.`);}
  if(text)text+='\n';const startOffset=text.length;text+=segment.text;
  return{id:`cue-${index+1}-${textDigest(segment.text).slice(0,10)}`,start:segment.start,end:segment.end,startOffset,endOffset:text.length,text:segment.text,...(segment.confidence===undefined?{}:{confidence:segment.confidence}),uncertain:segment.uncertain===true||uncertainWords(segment.text)||(segment.confidence!==undefined&&segment.confidence<.65)};
 });
 if(text.length>MAX_TEXT)throw new Error('The readable transcript exceeds 500,000 characters. Split the recording into smaller chapters.');
 if(overlap)warnings.push('Some supplied cues overlap. Review speaker overlap and checkpoint timing.');if(options.duration&&timing==='provided'&&options.duration-Math.max(...segments.map(segment=>segment.end??0))>Math.max(5,options.duration*.1))warnings.push('The transcript ends well before the recording. Check for missing spoken material or an intentionally silent ending.');const uncertain=segments.filter(segment=>segment.uncertain).length;if(uncertain)warnings.push(`${uncertain} transcript segment${uncertain===1?'':'s'} flagged uncertain; generated checkpoints using them are not selected automatically.`);
 const duration=options.duration??(timing==='provided'?Math.max(...segments.map(segment=>segment.end??0)):undefined);
 const transcript:MediaTranscript={version:1,mediaSourceId:options.mediaSourceId,mediaRevision:options.mediaRevision,sourceRevision:textDigest(text),format:input.format==='edited'?input.origin.format:input.format,timing,...(input.format==='edited'?{edited:true}:{}),...(duration?{duration}:{}),...(options.language?{language:options.language}:{}),...(options.engine?{engine:options.engine}:{}),...(options.model?{model:options.model}:{}),segments,warnings};
 return{text,transcript:validateMediaTranscript(transcript,text),warnings};
}
/** Reject stale offsets/checksums and unsupported metadata; return only portable fields. */
export function validateMediaTranscript(input:unknown,text:string,sources?:Source[]):MediaTranscript {
 if(!object(input))throw new Error('Transcript metadata must be an object.');only(input,['version','mediaSourceId','mediaRevision','sourceRevision','edited','format','timing','duration','language','engine','model','segments','warnings'],'Transcript metadata');
 if(input.version!==1||!validId(input.mediaSourceId)||typeof input.mediaRevision!=='string'||!HASH.test(input.mediaRevision)||input.sourceRevision!==textDigest(text)||!formats.includes(String(input.format))||!['provided','estimated','unavailable'].includes(String(input.timing)))throw new Error('Transcript metadata is invalid or no longer matches the readable source. Rebuild its timeline from the current text.');
 if(input.edited!==undefined&&typeof input.edited!=='boolean')throw new Error('Transcript correction metadata is invalid.');
 if(input.duration!==undefined&&(!finite(input.duration)||input.duration<1||input.duration>MAX_SECONDS))throw new Error('Transcript duration is invalid.');if(input.language!==undefined)boundedText(input.language,100,'Transcript language');if(input.engine!==undefined)boundedText(input.engine,200,'Transcript engine');if(input.model!==undefined)boundedText(input.model,200,'Transcript model');
 if(!Array.isArray(input.warnings)||input.warnings.length>20||input.warnings.some(v=>typeof v!=='string'||!v.trim()||v.length>2000))throw new Error('Transcript warnings exceed the portable limits.');
 if(!Array.isArray(input.segments)||!input.segments.length||input.segments.length>MAX_SEGMENTS||text.length>MAX_TEXT)throw new Error('Transcript segments exceed the portable limits.');
 const ids=new Set<string>();let previousTime=-1,previousOffset=-1;
 const segments=input.segments.map((segment,index):MediaTranscriptSegment=>{
  if(!object(segment))throw new Error(`Transcript segment ${index+1} is invalid.`);only(segment,['id','start','end','startOffset','endOffset','text','confidence','uncertain'],'Transcript segment');
  if(!validId(segment.id)||ids.has(segment.id))throw new Error('Transcript cue IDs must be unique.');ids.add(segment.id);boundedText(segment.text,MAX_SEGMENT_TEXT,'Transcript cue');
  if(!Number.isInteger(segment.startOffset)||!Number.isInteger(segment.endOffset)||Number(segment.startOffset)<0||Number(segment.startOffset)<=previousOffset||Number(segment.endOffset)<=Number(segment.startOffset)||Number(segment.endOffset)>text.length||text.slice(Number(segment.startOffset),Number(segment.endOffset))!==segment.text)throw new Error('Transcript cue offsets must identify exact, ordered source text.');previousOffset=Number(segment.endOffset)-1;
  const untimed=segment.start===null&&segment.end===null;
  if(!untimed&&(!finite(segment.start)||!finite(segment.end)||segment.start<previousTime||segment.start<0||segment.end<=segment.start||segment.end>MAX_SECONDS||(finite(input.duration)&&segment.end>input.duration+.5)))throw new Error('Transcript cue times must be ordered and within the recording.');
  if(input.timing==='unavailable'&&!untimed||input.timing!=='unavailable'&&untimed)throw new Error('Transcript timing mode does not match its cues.');if(finite(segment.start))previousTime=segment.start;
  if(segment.confidence!==undefined&&(!finite(segment.confidence)||segment.confidence<0||segment.confidence>1)||typeof segment.uncertain!=='boolean')throw new Error('Transcript uncertainty metadata is invalid.');
  return{id:segment.id,start:segment.start as number|null,end:segment.end as number|null,startOffset:Number(segment.startOffset),endOffset:Number(segment.endOffset),text:segment.text,...(segment.confidence===undefined?{}:{confidence:segment.confidence as number}),uncertain:segment.uncertain||uncertainWords(segment.text)||(typeof segment.confidence==='number'&&segment.confidence<.65)};
 });
 if(segments.map(segment=>segment.text).join('\n')!==text)throw new Error('Transcript segments must cover the complete canonical readable text.');
 if(sources){const media=sources.find(s=>s.id===input.mediaSourceId);if(!media||!['audio','video'].includes(media.kind))throw new Error('The transcript recording is missing.');if(media.asset?.sha256&&media.asset.sha256!==input.mediaRevision)throw new Error('The transcript belongs to different recording bytes.');}
 return{version:1,mediaSourceId:input.mediaSourceId,mediaRevision:input.mediaRevision,sourceRevision:input.sourceRevision as string,...(input.edited===undefined?{}:{edited:input.edited as boolean}),format:input.format as MediaTranscript['format'],timing:input.timing as MediaTranscript['timing'],...(input.duration===undefined?{}:{duration:input.duration as number}),...(input.language===undefined?{}:{language:input.language as string}),...(input.engine===undefined?{}:{engine:input.engine as string}),...(input.model===undefined?{}:{model:input.model as string}),segments,warnings:[...input.warnings] as string[]};
}
export function detectTranscriptFormat(text:string,filename=''): 'srt'|'vtt'|'plain' {if(/^\uFEFF?WEBVTT(?:\s|$)/.test(text)||/\.vtt$/i.test(filename))return'vtt';if(/\.srt$/i.test(filename)||/\d{2}:\d{2}[.,]\d{3}\s*-->/.test(text))return'srt';return'plain';}
export function prepareTranscriptSource(recording:Source,input:MediaTranscriptInput,options:Omit<TranscriptOptions,'mediaSourceId'> & {id?:string;title?:string;addedAt?:string}):Source {
 const prepared=normalizeMediaTranscript(input,{...options,mediaSourceId:recording.id});if(options.id===recording.id)return{...recording,text:prepared.text,status:'ready',transcript:prepared.transcript};return{id:options.id??`transcript-${textDigest(recording.id).slice(0,16)}`,title:options.title??`${recording.title} · transcript`,kind:'transcript',text:prepared.text,status:'ready',addedAt:options.addedAt??recording.addedAt,transcript:prepared.transcript};
}
function filenameStem(title:string){return title.normalize('NFKC').toLocaleLowerCase().replace(/\.(?:srt|vtt|txt|md|mp3|mp4|m4a|wav|mov|webm|ogg|opus|aac|flac)$/,'').replace(/(?:[ ._-]+(?:transcript|captions?|subtitles?))(?:[ ._-]+[a-z]{2,3})?$/,'').replace(/[._-]+(?:en|es|fr|de|it|pt|nl|ja|ko|zh|hi|ar|ru)(?:-[a-z]{2})?$/,'').replace(/[ ._-]+/g,' ').trim();}
export function matchCompanionTranscript(recording:Source,sources:Source[]):{source?:Source;reason:'linked-id'|'same-source'|'filename'|'ambiguous'|'none';warnings:string[]} {
 const eligible=sources.filter(s=>s.text.trim()&&s.status==='ready'&&['transcript','text','audio','video'].includes(s.kind));const linked=eligible.filter(s=>s.transcript?.mediaSourceId===recording.id);
 if(linked.length===1)return{source:linked[0],reason:'linked-id',warnings:[]};if(linked.length>1)return{reason:'ambiguous',warnings:['Several transcripts are explicitly linked to this recording. Choose the intended version.']};
 if(recording.text.trim())return{source:recording,reason:'same-source',warnings:[]};const stem=filenameStem(recording.asset?.name??recording.originalFile?.name??recording.title),matched=eligible.filter(s=>s.id!==recording.id&&filenameStem(s.originalFile?.name??s.title)===stem);
 if(matched.length===1)return{source:matched[0],reason:'filename',warnings:['Matched the companion transcript by filename. Confirm that it describes this recording.']};return{reason:matched.length?'ambiguous':'none',warnings:[matched.length?'Several companion transcripts share this filename. Choose one before generating activities.':'Add a transcript or transcribe the recording locally to prepare source-grounded activities.']};
}
