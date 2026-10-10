import type {Source} from '../types';
import {isPictureRaster} from './pictureEngine';
import {validateMediaTranscript} from './mediaTranscript';
import {sourceMediaIdentity} from './mediaAssets';
import {isReadyLearningSource} from './scaffoldRuntime';
import type {StructuredActivity} from './structuredEngine';

export interface GameDraftPictureRegion {label:string;x:number;y:number;width:number;height:number}
export interface GameDraftSourceContext {
 picture?:{sourceId:string;regions:GameDraftPictureRegion[]};
 recording?:{sourceId:string;mediaRevision:string;duration:number;cues:{id:string;start:number;end:number;text:string}[]};
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Explicit author annotations are needed because the bounded writer receives text, not image pixels.
 * The readable source contains one line: Picture regions: [{"label":"cup","x":10,"y":20,"width":25,"height":30}]
 * This line remains ordinary exact-cited source content; no hidden coordinates are inferred from OCR. */
export function sourcePictureRegions(excerpt:string):GameDraftPictureRegion[]{
 const lines=excerpt.split(/\r?\n/).filter(line=>/^Picture regions:\s*\[/.test(line.trim()));
 if(lines.length!==1)return[];
 try{
  const rows:unknown=JSON.parse(lines[0].trim().slice('Picture regions:'.length));
  if(!Array.isArray(rows)||rows.length<2||rows.length>8)return[];
  const labels=new Set<string>();
  for(const row of rows){
   if(!record(row)||Object.keys(row).some(key=>!['label','x','y','width','height'].includes(key))||typeof row.label!=='string'||!row.label.trim()||row.label.length>120||labels.has(row.label)||['x','y','width','height'].some(key=>typeof row[key]!=='number'||!Number.isFinite(row[key]))||Number(row.x)<0||Number(row.y)<0||Number(row.width)<2||Number(row.height)<2||Number(row.x)+Number(row.width)>100||Number(row.y)+Number(row.height)>100)return[];
   labels.add(row.label);
  }
  return rows.map(row=>({label:row.label,x:row.x,y:row.y,width:row.width,height:row.height}));
 }catch{return[];}
}
/** Only verified attachment metadata for the primary evidence unit crosses the AI boundary. */
export function gameDraftSourceContext(source:Source,excerpt:string,sources:Source[]=[]):GameDraftSourceContext{
 const context:GameDraftSourceContext={},available=[source,...sources.filter(item=>item.id!==source.id)];
 if(!excerpt.trim()||!source.text.includes(excerpt)||!isReadyLearningSource(source,available))return context;
 const regions=sourcePictureRegions(excerpt);
 if(source.kind==='image'&&isPictureRaster(source.dataUrl)&&regions.length)context.picture={sourceId:source.id,regions};
 if(source.transcript){
  try{
   const transcript=validateMediaTranscript(source.transcript,source.text,available),recording=available.find(item=>item.id===transcript.mediaSourceId);
   if(recording&&sourceMediaIdentity(recording)===`bytes:${transcript.mediaRevision}`&&transcript.timing==='provided'&&typeof transcript.duration==='number'){
    const cues=transcript.segments.filter(segment=>!segment.uncertain&&typeof segment.start==='number'&&typeof segment.end==='number'&&excerpt.includes(segment.text)).slice(0,8).map(segment=>({id:segment.id,start:segment.start!,end:segment.end!,text:segment.text}));
    if(cues.length)context.recording={sourceId:recording.id,mediaRevision:transcript.mediaRevision,duration:transcript.duration,cues};
   }
  }catch{/* A missing or stale attachment makes the source unsuitable for timed authoring. */}
 }
 return context;
}
/** These are additional AI input-disclosure checks, not replacements for engine validation. */
export function validateGameDraftSourceContract(activity:StructuredActivity,source:Source,excerpt:string,sources:Source[]=[]):void{
 if(activity.sourceRefs.some(ref=>ref.sourceId!==source.id||!excerpt.includes(ref.evidence)))throw new Error('Every scored citation must be an exact quotation from the disclosed primary source unit.');
 if(activity.kind==='picture'){
  const supplied=gameDraftSourceContext(source,excerpt,sources).picture;
  if(!supplied||activity.sceneSourceId!==supplied.sourceId)throw new Error('Picture authoring requires a supplied primary raster with explicit Picture regions annotations.');
  if(activity.tokens.some(token=>!supplied.regions.some(region=>['label','x','y','width','height'].every(key=>region[key as keyof GameDraftPictureRegion]===token[key as keyof typeof token]))))throw new Error('Picture labels and coordinates must exactly match the supplied region annotations.');
  if(activity.rounds.some(round=>round.narrationSourceId!==undefined))throw new Error('This bounded picture writer does not author unprovided narration.');
 }
 if(activity.kind==='media'){
  const supplied=gameDraftSourceContext(source,excerpt,sources).recording;
  if(!supplied||activity.mediaSourceId!==supplied.sourceId||activity.duration!==supplied.duration)throw new Error('Timed authoring requires the disclosed recording, current byte identity and provided transcript duration.');
  if(activity.cues.some(cue=>!supplied.cues.some(original=>cue.text===original.text&&cue.start===original.start&&cue.end===original.end)))throw new Error('Copy exact provided transcript cue text and times; invented or estimated timings are not supported.');
  if(activity.checkpoints.some(checkpoint=>!activity.cues.some(cue=>cue.end===checkpoint.at&&checkpoint.evidenceRefs.some(index=>activity.sourceRefs[index]?.evidence.includes(cue.text)))))throw new Error('Every checkpoint must occur at the end of a cited supplied cue.');
 }
 if(activity.kind==='picture-build'&&(activity.parts.some(part=>part.imageSourceId!==undefined)||activity.tell.narrationSourceIds.length))throw new Error('Use source-backed symbolic parts and caregiver telling without unprovided picture or narration assets.');
 if(activity.kind==='rubric'&&!excerpt.includes(activity.sample))throw new Error('The reviewed sample must occur exactly in the disclosed primary source unit.');
 if(activity.kind==='decision'){
  const check=(rule:import('./structuredEngine').Rule):boolean=>rule.op==='and'||rule.op==='or'?rule.rules.every(check):rule.op==='not'?check(rule.rule):'field' in rule&&Object.hasOwn(activity.context,rule.field);
  if(activity.rules.some(rule=>!check(rule.when)))throw new Error('Decision rules may reference only the supplied case fields.');
 }
}
