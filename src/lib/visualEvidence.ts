import type { Source } from '../types';
import { bytesDigest } from './evidence';
import { recordingDigest } from './mediaAssets';

export const OCR_LANGUAGES = [{id:'eng',label:'English'},{id:'spa',label:'Spanish'},{id:'fra',label:'French'},{id:'deu',label:'German'}] as const;
export type OcrLanguage = typeof OCR_LANGUAGES[number]['id'];
export interface VisualEvidence {
  version:1;
  parentSourceId:string;
  parentMediaRevision:string;
  capture:'image'|'video-frame';
  requestedAt?:number;
  at?:number;
  timestampBasis?:'decoded-frame'|'media-clock';
  width:number;
  height:number;
  frameSha256:string;
  engine:'tesseract.js';
  engineVersion:'7.0.0';
  language:OcrLanguage;
  confidence:number|null;
  rawText:string;
  reviewStatus:'needs-review'|'reviewed';
  /** Binds the review acknowledgement to exactly the corrected readable text. */
  reviewedTextSha256?:string;
  warnings:string[];
}
export type VisualSource = Source & {visualEvidence?:VisualEvidence};
export interface VisualCapture {id:string;dataUrl:string;width:number;height:number;requestedAt?:number;at?:number;timestampBasis?:'decoded-frame'|'media-clock';rawText:string;text:string;confidence:number|null;reviewed:boolean;warnings:string[];language:OcrLanguage}
export interface OcrProgress {stage:string;progress:number}
export const VISUAL_IMAGE_DATA = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const SHA = /^[a-f0-9]{64}$/;
const WARNING = 'Text recognition can miss or change words, numbers and reading order. It does not interpret diagrams, graphs, equations or relationships. Check the picture before using this text for learning.';
export const OCR_REVIEW_WARNING = WARNING;
const isRecord=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const boundedVisualNumber=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
export function imageBytesDigest(dataUrl:string):string {
  if(!VISUAL_IMAGE_DATA.test(dataUrl)||dataUrl.length>28_000_000)throw new Error('Use a PNG, JPEG, WebP or GIF image no larger than 20 MB.');
  return bytesDigest(Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',')+1)),c=>c.charCodeAt(0)));
}
export function visualParentRevision(source:Source):string {
  if(source.kind==='image')return imageBytesDigest(source.dataUrl??'');
  if(source.kind==='video')return recordingDigest(source);
  throw new Error('Choose an attached image or video.');
}
export function validateVisualEvidence(value:unknown):string[] {
  if(!isRecord(value))return ['Visual evidence must be an object.'];
  const v=value,errors:string[]=[];
  const allowed=new Set(['version','parentSourceId','parentMediaRevision','capture','requestedAt','at','timestampBasis','width','height','frameSha256','engine','engineVersion','language','confidence','rawText','reviewStatus','reviewedTextSha256','warnings']);
  if(Object.keys(v).some(key=>!allowed.has(key)))errors.push('Visual evidence contains unknown fields.');
  if(v.version!==1||v.engine!=='tesseract.js'||v.engineVersion!=='7.0.0')errors.push('Visual evidence engine/version is unsupported.');
  if(typeof v.parentSourceId!=='string'||!v.parentSourceId.trim()||v.parentSourceId.length>200)errors.push('A parent source ID is required.');
  if(typeof v.parentMediaRevision!=='string'||!SHA.test(v.parentMediaRevision)||typeof v.frameSha256!=='string'||!SHA.test(v.frameSha256))errors.push('Visual evidence must retain SHA-256 media fingerprints.');
  if(!Number.isInteger(v.width)||!boundedVisualNumber(v.width,1,32768)||!Number.isInteger(v.height)||!boundedVisualNumber(v.height,1,32768))errors.push('Image dimensions are invalid.');
  if(v.capture!=='image'&&v.capture!=='video-frame')errors.push('Capture type is invalid.');
  if(v.capture==='video-frame'&&(!boundedVisualNumber(v.at,0,43200)||!boundedVisualNumber(v.requestedAt,0,43200)||!['decoded-frame','media-clock'].includes(String(v.timestampBasis))))errors.push('Video frames require a requested time, captured time and timing basis.');
  if(v.capture==='image'&&['at','requestedAt','timestampBasis'].some(k=>v[k]!==undefined))errors.push('An uploaded image must not invent a video timestamp.');
  if(!OCR_LANGUAGES.some(x=>x.id===v.language))errors.push('Choose one of the four bundled OCR languages.');
  if(v.confidence!==null&&!boundedVisualNumber(v.confidence,0,100))errors.push('Recognition confidence must be null or between 0 and 100.');
  if(typeof v.rawText!=='string'||v.rawText.length>200000)errors.push('Raw OCR text is invalid or too long.');
  if(v.reviewStatus!=='needs-review'&&v.reviewStatus!=='reviewed')errors.push('Visual text needs an explicit review status.');
  if(v.reviewStatus==='reviewed'&&(typeof v.reviewedTextSha256!=='string'||!SHA.test(v.reviewedTextSha256)))errors.push('Reviewed visual text requires its exact text fingerprint.');
  if(v.reviewStatus==='needs-review'&&v.reviewedTextSha256!==undefined)errors.push('Unreviewed OCR must not carry a review fingerprint.');
  if(!Array.isArray(v.warnings)||v.warnings.length>20||v.warnings.some(w=>typeof w!=='string'||w.length>1500))errors.push('Visual evidence warnings are invalid.');
  return errors;
}
export function validateVisualEvidenceSource(source:VisualSource,sources?:readonly Source[]):string[] {
  if(!source.visualEvidence)return [];
  const v=source.visualEvidence,errors=validateVisualEvidence(v);if(errors.length)return errors;
  if(source.kind!=='image')errors.push('Visual evidence must belong to a retained image source.');
  try{if(imageBytesDigest(source.dataUrl??'')!==v.frameSha256)errors.push('The retained image differs from its visual evidence fingerprint.');}catch(e){errors.push((e as Error).message);}
  if(v.reviewStatus!=='reviewed'&&source.status==='ready')errors.push('Unreviewed OCR cannot be a ready learning source.');
  if(v.reviewStatus==='reviewed'&&bytesDigest(new TextEncoder().encode(source.text))!==v.reviewedTextSha256)errors.push('Visual source text changed after review; review the corrected text again.');
  if(v.capture==='image'&&(v.parentSourceId!==source.id||v.parentMediaRevision!==v.frameSha256))errors.push('Uploaded image evidence must reference its own unchanged image.');
  if(v.capture==='video-frame'&&v.parentSourceId===source.id)errors.push('A video frame must reference its parent recording.');
  if(sources&&v.capture==='video-frame') {
    const parent=sources.find(s=>s.id===v.parentSourceId);
    if(!parent||parent.kind!=='video')errors.push('The parent video is missing.');
    else try{if(visualParentRevision(parent)!==v.parentMediaRevision)errors.push('The parent recording changed after this frame was captured.');if(parent.asset?.duration!==undefined&&v.at!>parent.asset.duration+.5)errors.push('The frame timestamp is outside the parent recording.');}catch(e){errors.push((e as Error).message);}
  }
  return errors;
}
export function visualTextReviewed(source:VisualSource):boolean {
  return !source.visualEvidence||source.visualEvidence.reviewStatus==='reviewed'&&validateVisualEvidenceSource(source).length===0;
}
/** The interior of equal time intervals avoids an empty first/end title frame; no claim to find every slide. */
export function frameSampleTimes(duration:number,count=6):number[] {
  if(!boundedVisualNumber(duration,.001,43200))throw new Error('The video must have a finite duration of at most 12 hours.');
  if(!Number.isInteger(count)||count<1||count>24)throw new Error('Choose between 1 and 24 frames.');
  return Array.from({length:count},(_,i)=>Math.round(duration*(i+.5)/count*1000)/1000).map(t=>Math.min(t,Math.max(0,duration-.001)));
}
export function parseFrameTimes(text:string,duration:number):number[] {
  if(!boundedVisualNumber(duration,.001,43200))throw new Error('Read the video duration before choosing frames.');
  const parts=text.split(/[,\n]+/).map(x=>x.trim()).filter(Boolean);
  if(!parts.length||parts.length>24)throw new Error('Enter 1–24 timestamps, separated by commas.');
  const times=parts.map(part=>{if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(part))throw new Error('Use seconds, mm:ss or hh:mm:ss timestamps.');const fields=part.split(':').map(Number);if(fields.slice(1).some(x=>x>=60))throw new Error('Minutes and seconds within a timestamp must be below 60.');return fields.reduce((t,x)=>t*60+x,0);});
  if(times.some(t=>t<0||t>=duration))throw new Error('Every frame time must be inside the video duration.');
  return [...new Set(times)].sort((a,b)=>a-b);
}
export function formatFrameTime(value:number):string {const ms=Math.round(value*1000),s=Math.floor(ms/1000);return `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s/60)%60<10?'0':''}${Math.floor(s/60)%60}:${(s%60).toString().padStart(2,'0')}.${(ms%1000).toString().padStart(3,'0')}`;}
export function makeVisualSources(parent:Source,captures:readonly VisualCapture[],parentRevision:string):VisualSource[] {
  if(visualParentRevision(parent)!==parentRevision)throw new Error('The source changed during capture. Start again from the current image or recording.');
  if(!captures.length||captures.length>24||parent.kind==='image'&&captures.length!==1)throw new Error('Save one image or up to 24 video frames.');
  const prior=(parent as VisualSource).visualEvidence;
  if(prior?.capture==='video-frame'&&prior.frameSha256!==parentRevision)throw new Error('The retained frame changed. Capture a fresh frame from the original video.');
  return captures.map(c=>{
    const text=c.text.trim(),reviewed=c.reviewed&&text.length>0;
    const visualEvidence:VisualEvidence={version:1,parentSourceId:prior?.capture==='video-frame'?prior.parentSourceId:parent.id,parentMediaRevision:prior?.capture==='video-frame'?prior.parentMediaRevision:parentRevision,capture:prior?.capture==='video-frame'?'video-frame':parent.kind==='image'?'image':'video-frame',width:c.width,height:c.height,frameSha256:imageBytesDigest(c.dataUrl),engine:'tesseract.js',engineVersion:'7.0.0',language:c.language,confidence:c.confidence,rawText:c.rawText,reviewStatus:reviewed?'reviewed':'needs-review',warnings:[...new Set([WARNING,...c.warnings])],...(parent.kind==='video'?{requestedAt:c.requestedAt,at:c.at,timestampBasis:c.timestampBasis}:prior?.capture==='video-frame'?{requestedAt:prior.requestedAt,at:prior.at,timestampBasis:prior.timestampBasis}:{}),...(reviewed?{reviewedTextSha256:bytesDigest(new TextEncoder().encode(text))}:{})};
    const source:VisualSource=parent.kind==='image'?{...parent,text,status:reviewed?'ready':'needs-transcript',visualEvidence}:{id:c.id,title:`${parent.title} · frame ${formatFrameTime(c.at??0)}`,kind:'image',mime:'image/jpeg',dataUrl:c.dataUrl,text,status:reviewed?'ready':'needs-transcript',addedAt:new Date().toISOString(),visualEvidence};
    const errors=validateVisualEvidenceSource(source,parent.kind==='video'?[parent]:undefined);if(errors.length)throw new Error(errors.join(' '));return source;
  });
}
