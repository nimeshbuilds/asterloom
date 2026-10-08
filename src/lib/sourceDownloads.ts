import type {Source} from '../types';
import {bytesDigest} from './evidence';
import {validateOriginalFile} from './originalFiles';
import {validateMediaAsset,sourceMediaIdentity,COMPACT_FILE_BYTES} from './mediaAssets';
import {validateMediaTranscript} from './mediaTranscript';
import {filenameForMime,sourceDownloadFilename,MAX_INLINE_SOURCE_BYTES} from '../../desktop/source-download-contract.mjs';
import type {SourceDownloadRequest,SourceDownloadNativeResult} from '../../desktop/source-download-contract.mjs';
export type {SourceDownloadRequest,SourceDownloadNativeResult};
export type SourceDownloadKind='original'|'text'|'transcript';
export interface SourceDownloadOption {id:SourceDownloadKind;label:string;filename:string;description?:string}
export interface SourceDownloadResult {status:'saved'|'canceled'|'started';filename:string}
export interface SourceDownloadsDesktop {saveSourceMaterial?:(request:SourceDownloadRequest)=>Promise<SourceDownloadNativeResult>}
const nativeDownloads=()=>typeof window==='undefined'?undefined:(window as unknown as {asterloomDesktop?:SourceDownloadsDesktop}).asterloomDesktop;
const inlineMediaPattern=/^data:(image\/(?:png|jpeg|webp|gif)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|webm|mp4|x-m4a|m4a)|video\/(?:mp4|webm|ogg|quicktime));base64,([A-Za-z0-9+/]*={0,2})$/;
function stem(source:Source){return sourceDownloadFilename(source.title||'source').replace(/\.[a-z0-9]{1,12}$/i,'');}
function inlineMedia(source:Source){
 if(typeof source.dataUrl!=='string'||source.dataUrl.length>Math.ceil(MAX_INLINE_SOURCE_BYTES*4/3)+200)throw new Error('The embedded source attachment exceeds the portable size limit.');
 const match=inlineMediaPattern.exec(source.dataUrl);if(!match||!match[2]||match[2].length%4!==0)throw new Error('This source does not contain a supported original attachment.');
 if(source.mime&&source.mime!==match[1])throw new Error('The source attachment and media type disagree.');
 const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));if(bytes.length>MAX_INLINE_SOURCE_BYTES)throw new Error('The embedded source attachment exceeds the portable size limit.');
 return {mime:match[1],bytes};
}
function timedTranscript(source:Source){
 const transcript=validateMediaTranscript(source.transcript,source.text);
 if(['audio','video'].includes(source.kind)&&(transcript.mediaSourceId!==source.id||sourceMediaIdentity(source)!==`bytes:${transcript.mediaRevision}`))throw new Error('The transcript no longer matches this recording.');
 if(transcript.timing==='unavailable'||transcript.segments.some(segment=>segment.start===null||segment.end===null))throw new Error('This source has no timed transcript. Download its readable text instead.');
 return transcript;
}
/** Availability reflects included bytes/text only. A remote URL is never an original file. */
export function listSourceDownloads(source:Source):SourceDownloadOption[]{
 const options:SourceDownloadOption[]=[];
 try{
  if(source.originalFile)options.push({id:'original',label:'Download original file',filename:filenameForMime(source.originalFile.name,source.originalFile.mime),description:source.webImport?'The preserved web snapshot from import; later text edits are separate.':'The preserved file as imported; later text edits are separate.'});
  else if(source.asset)options.push({id:'original',label:'Download original recording',filename:filenameForMime(source.asset.name,source.asset.mime),description:'The complete recording included with this game.'});
  else if(source.dataUrl){const mime=/^data:([^;]+);base64,/.exec(source.dataUrl)?.[1];if(mime&&source.dataUrl.length<=Math.ceil(MAX_INLINE_SOURCE_BYTES*4/3)+200&&inlineMediaPattern.test(source.dataUrl))options.push({id:'original',label:source.kind==='image'?'Download original image':'Download original recording',filename:filenameForMime(source.title,mime),description:'The attachment included with this game.'});}
 }catch{/* Invalid metadata must not prevent a learner reading the other materials. Saves revalidate bytes. */}
 if(typeof source.text==='string'&&source.text.trim())options.push({id:'text',label:'Download readable text',filename:sourceDownloadFilename(stem(source)+'.readable.txt'),description:'The current editable source text used by this game, including any corrections.'});
 if(source.transcript){try{const transcript=timedTranscript(source);options.push({id:'transcript',label:'Download timed transcript',filename:sourceDownloadFilename(stem(source)+'.transcript.vtt'),description:transcript.timing==='estimated'?'Current transcript as WebVTT. Times are estimates, not aligned to speech.':'Current transcript cues as WebVTT; this is separate from an original caption file.'});}catch{/* Stale timing must not masquerade as a current transcript. Readable text remains available. */}}
 return options;
}
function encode(bytes:Uint8Array){let encoded='';for(let index=0;index<bytes.length;index+=32768)encoded+=String.fromCharCode(...bytes.subarray(index,index+32768));return btoa(encoded);}
function inlineRequest(filename:string,mime:string,bytes:Uint8Array):SourceDownloadRequest{
 if(bytes.length>MAX_INLINE_SOURCE_BYTES)throw new Error('This source is too large for an inline download.');
 return {kind:'inline',filename,mime,dataUrl:`data:${mime};base64,${encode(bytes)}`,size:bytes.length,sha256:bytesDigest(bytes)};
}
function vttStamp(seconds:number){const time=Math.round(seconds*1000),hours=Math.floor(time/3600000),minutes=Math.floor(time/60000)%60;return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(Math.floor(time/1000)%60).padStart(2,'0')}.${String(time%1000).padStart(3,'0')}`;}
function transcriptText(source:Source){const transcript=timedTranscript(source),escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return `WEBVTT\n\nNOTE\nCurrent Asterloom transcript. ${transcript.timing==='estimated'?'Timings are estimates, not speech alignment.':'Check the words and timings against the recording.'}\n\n`+transcript.segments.map((segment,index)=>`${index+1}\n${vttStamp(segment.start!)} --> ${vttStamp(segment.end!)}\n${escape(segment.text)}\n`).join('\n');}
/** Native resolves only local content-addressed assets and confirms completion.
 * The internal browser preview can report only that its download was started. */
export async function downloadSourceMaterial(source:Source,kind:SourceDownloadKind):Promise<SourceDownloadResult>{
 const option=listSourceDownloads(source).find(option=>option.id===kind);if(!option)throw new Error('That source download is not included in this game.');
 let request:SourceDownloadRequest;
 if(kind==='original'&&source.originalFile){const file=validateOriginalFile(source.originalFile);request={kind:'inline',filename:option.filename,mime:file.mime,dataUrl:file.dataUrl,size:file.size,sha256:file.sha256};}
 else if(kind==='original'&&source.asset)request={kind:'asset',filename:option.filename,asset:validateMediaAsset(source.asset)};
 else if(kind==='original'){const {mime,bytes}=inlineMedia(source);request=inlineRequest(option.filename,mime,bytes);}
 else request=inlineRequest(option.filename,kind==='transcript'?'text/vtt':'text/plain',new TextEncoder().encode(kind==='transcript'?transcriptText(source):source.text));
 const desktop=nativeDownloads();
 if(desktop?.saveSourceMaterial){const result=await desktop.saveSourceMaterial(request);if('error' in result)throw new Error(result.error);if(!['saved','canceled'].includes(result.status)||typeof result.filename!=='string')throw new Error('The source save did not report a completed result.');return result;}
 if(typeof document==='undefined')throw new Error('Open this game to download its source material.');
 let bytes:Uint8Array;
 if(request.kind==='asset'){
  if(request.asset.size>COMPACT_FILE_BYTES)throw new Error('Open the updated desktop app to save this complete recording without loading it into memory.');
  const response=await fetch(`/api/media/assets/${request.asset.id}`);if(!response.ok)throw new Error('This recording is missing. Restore its archive or open the complete exported game.');
  const declared=Number(response.headers.get('content-length'));if(declared!==request.asset.size)throw new Error('The recording download size does not match its source.');
  // Browser preview only; keep a strict streaming cap even for an incorrect server response.
  const reader=response.body?.getReader();if(!reader)throw new Error('The recording could not be read.');const parts:Uint8Array[]=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>request.asset.size)throw new Error('The recording download exceeds its source size.');parts.push(value);}}finally{await reader.cancel();}
  bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  if(bytes.length!==request.asset.size||bytesDigest(bytes)!==request.asset.sha256)throw new Error('The original recording failed its checksum check.');
 }else bytes=Uint8Array.from(atob(request.dataUrl.slice(request.dataUrl.indexOf(',')+1)),character=>character.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/octet-stream'}));
 try{const link=document.createElement('a');link.href=url;link.download=option.filename;link.click();}catch(error){URL.revokeObjectURL(url);throw error;}
 setTimeout(()=>URL.revokeObjectURL(url),2000);return {status:'started',filename:option.filename};
}
