import type {Source} from '../types';
import {captureOriginalFile,sourceFileExtension} from './originalFiles';
import {mediaServiceAvailable,uploadMediaAsset,type MediaUploadOptions} from './mediaUpload';
export const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const readDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read this file.'));reader.readAsDataURL(file);});
export async function api(path:string,body?:unknown,token?:string,signal?:AbortSignal){const r=await fetch(path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),...(signal?{signal}:{})});const text=await r.text();let result:any;try{result=JSON.parse(text);}catch{throw new Error('Start the local companion to use document import, website import, or shared rooms. Plain text, media, editing and play work offline.');}if(!r.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||result.message||'The request could not be completed.');return result;}
export async function importFile(file:File,options:MediaUploadOptions={}):Promise<Source>{
 const assertActive=()=>{if(options.signal?.aborted)throw new DOMException('Source import canceled.','AbortError');};assertActive();
 const extMedia=sourceFileExtension(file.name);
 const knownMedia:Record<string,string>={mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',mov:'video/quicktime',webm:'video/webm',ogg:'audio/ogg'};
 const mediaMime=knownMedia[extMedia]||(/^(audio|video)\//.test(file.type)?file.type:'');
 if(mediaMime&&await mediaServiceAvailable()){const asset=await uploadMediaAsset(file,mediaMime,options);return{id:uid(),title:file.name,kind:mediaMime.startsWith('video/')?'video':'audio',mime:mediaMime,asset,text:'',status:'needs-transcript',addedAt:new Date().toISOString()};}
 assertActive();if(file.size>20*1024*1024)throw new Error('This file exceeds the 20 MB compact import limit. Open the desktop studio for recordings up to 2 GB; split large documents into chapters.');const ext=sourceFileExtension(file.name);const originalFile=await captureOriginalFile(file);assertActive();const base={id:uid(),title:file.name,addedAt:new Date().toISOString(),...(originalFile?{originalFile}:{})};if(['','txt','md','markdown','csv','tsv','yaml','yml','log','json','srt','vtt','html','htm','xml'].includes(ext||'')&&(ext||!mediaMime&&!file.type.startsWith('image/'))){let text=await file.text();assertActive();if(['html','htm'].includes(ext||'')){const doc=new DOMParser().parseFromString(text,'text/html');doc.querySelectorAll('script,style,noscript,nav,footer,header,iframe').forEach(e=>e.remove());text=doc.body.textContent||'';}return{...base,kind:['srt','vtt'].includes(ext||'')?'transcript':'text',text,status:'ready'};}
 // Document originals have already been read and encoded. Reuse those exact
 // bytes instead of reading a second full copy through FileReader.
 const dataUrl=originalFile?.dataUrl??await readDataUrl(file);assertActive();
 const mediaTypes:Record<string,string>={mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',mov:'video/quicktime',webm:'video/webm',ogg:'audio/ogg'};
 if(file.type.startsWith('audio/')||file.type.startsWith('video/')||mediaTypes[ext||'']){const mime=mediaTypes[ext||'']||file.type;return{...base,kind:mime.startsWith('video/')?'video':'audio',mime,dataUrl:dataUrl.replace(/^data:[^;]*;/,`data:${mime};`),text:'',status:'needs-transcript'};}
 const imageTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
 if(file.type.startsWith('image/')||imageTypes[ext||'']){const mime=imageTypes[ext||'']||file.type;if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime))throw new Error('Use PNG, JPEG, WebP, or GIF for portable image sources.');return{...base,kind:'image',mime,dataUrl:dataUrl.replace(/^data:[^;]*;/,`data:${mime};`),text:'',status:'needs-transcript'};}

 const controller=new AbortController(),cancel=()=>controller.abort(new DOMException('Source import canceled.','AbortError'));
 options.signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Document import took longer than three minutes. Try a smaller document or paste its text. Your original file is unchanged.','TimeoutError')),180000);
 try{assertActive();const result=await api('/api/import-file',{name:file.name,mimeType:file.type,dataBase64:dataUrl.split(',')[1]},undefined,controller.signal);assertActive();controller.signal.throwIfAborted();return{...base,kind:'document',text:result.source?.content||'',status:result.needsTranscript||result.needsAssistance||!result.source?.content?'needs-transcript':'ready',error:result.warnings?.join(' ')};}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
export function download(content:string,name:string,mime='application/json'){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'notebook';
