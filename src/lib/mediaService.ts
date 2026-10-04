import { api } from './imports';
import type { TranscriptInputSegment } from './mediaTranscript';
export interface TranscriptionResult {
  segments:TranscriptInputSegment[];text:string;duration:number;language:string;engine:string;model:string;mediaRevision:string;
}
export interface TranscriptionJob {
  id:string;assetId:string;mediaRevision:string;state:'queued'|'preparing'|'decoding'|'transcribing'|'complete'|'canceled'|'error';
  progress:number;stage:string;createdAt:string;updatedAt:string;result?:TranscriptionResult;error?:string;
}
export interface RecordingServiceStatus {available?:boolean;maxAssetBytes:number;models:{id:string;label?:string;downloadBytes:number;installed:boolean}[];jobs?:TranscriptionJob[]}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const boundedText=(value:unknown,max=2000):value is string=>typeof value==='string'&&value.length<=max;
function message(value:unknown,fallback:string):string{return boundedText(value)?value:record(value)&&boundedText(value.message)?value.message:fallback;}
/** Service errors are structured records, never React children. Validate persisted jobs at this boundary. */
export function readTranscriptionJob(value:unknown):TranscriptionJob{
 if(!record(value)||!boundedText(value.id,200)||!boundedText(value.assetId,64)||!boundedText(value.mediaRevision,64)||!['queued','preparing','decoding','transcribing','complete','canceled','error'].includes(String(value.state))||typeof value.progress!=='number'||!Number.isFinite(value.progress)||!boundedText(value.stage)||!boundedText(value.createdAt,100)||!boundedText(value.updatedAt,100))throw new Error('The local speech service returned an invalid job. Reopen the recording and retry.');
 const job:TranscriptionJob={id:value.id,assetId:value.assetId,mediaRevision:value.mediaRevision,state:value.state as TranscriptionJob['state'],progress:Math.max(0,Math.min(1,value.progress)),stage:value.stage,createdAt:value.createdAt,updatedAt:value.updatedAt,...(value.error===undefined?{}:{error:message(value.error,'Transcription could not finish. Retry this recording.')})};
 if(value.result!==undefined){const result=value.result;if(!record(result)||!Array.isArray(result.segments)||result.segments.length>10000||!boundedText(result.text,500000)||typeof result.duration!=='number'||!Number.isFinite(result.duration)||result.duration<=0||result.duration>43200||!['language','engine','model','mediaRevision'].every(key=>boundedText(result[key],200)))throw new Error('The local transcript is incomplete. Retry the recording or add checked captions.');
  const segments=result.segments.map(segment=>{if(!record(segment)||!boundedText(segment.text,4000)||typeof segment.start!=='number'||typeof segment.end!=='number'||!Number.isFinite(segment.start)||!Number.isFinite(segment.end)||segment.start<0||segment.end<segment.start||segment.end>(result.duration as number)+.5||segment.confidence!==undefined&&(typeof segment.confidence!=='number'||!Number.isFinite(segment.confidence)||segment.confidence<0||segment.confidence>1)||segment.uncertain!==undefined&&typeof segment.uncertain!=='boolean')throw new Error('The local transcript contains an invalid segment. Retry or add checked captions.');return{start:segment.start,end:segment.end,text:segment.text,...(segment.confidence===undefined?{}:{confidence:segment.confidence as number}),...(segment.uncertain===undefined?{}:{uncertain:segment.uncertain as boolean})};});
  job.result={segments,text:result.text,duration:result.duration,language:result.language as string,engine:result.engine as string,model:result.model as string,mediaRevision:result.mediaRevision as string};
 }
 return job;
}
export async function recordingServiceStatus():Promise<RecordingServiceStatus>{const status=await api('/api/media/status');if(!record(status)||!Array.isArray(status.models)||status.models.some(model=>!record(model)||!boundedText(model.id,30)||!Number.isSafeInteger(model.downloadBytes)||Number(model.downloadBytes)<0||typeof model.installed!=='boolean'))throw new Error('The local speech service is unavailable. Reopen the desktop studio.');return{available:status.available===true,maxAssetBytes:Number(status.maxAssetBytes)||0,models:status.models.map(model=>({id:model.id,downloadBytes:model.downloadBytes,installed:model.installed,...(boundedText(model.label,200)?{label:model.label}:{})})),...(Array.isArray(status.jobs)?{jobs:status.jobs.map(readTranscriptionJob)}:{})};}
export async function startTranscription(assetId:string,model:string,language:string):Promise<TranscriptionJob>{return readTranscriptionJob((await api('/api/media/transcriptions',{assetId,model,language})).job);}
export async function getTranscription(id:string):Promise<TranscriptionJob>{return readTranscriptionJob((await api(`/api/media/transcriptions/${encodeURIComponent(id)}`)).job);}
export async function cancelTranscription(id:string):Promise<TranscriptionJob>{const response=await fetch(`/api/media/transcriptions/${encodeURIComponent(id)}`,{method:'DELETE'});const value=await response.json();if(!response.ok)throw new Error(message(value.error,'Could not cancel transcription.'));return readTranscriptionJob(value.job);}
export const transcriptionActive=(job:TranscriptionJob|undefined)=>!!job&&['queued','preparing','decoding','transcribing'].includes(job.state);
