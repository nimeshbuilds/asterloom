import type {Source} from '../types';
import {bytesDigest} from './evidence';
const formats:Record<string,string>={'':'text/plain',txt:'text/plain',md:'text/markdown',markdown:'text/markdown',csv:'text/csv',tsv:'text/tab-separated-values',yaml:'application/yaml',yml:'application/yaml',log:'text/plain',rtf:'application/rtf',json:'application/json',srt:'application/x-subrip',vtt:'text/vtt',html:'text/html',htm:'text/html',xml:'application/xml',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',epub:'application/epub+zip'};
export function sourceFileExtension(name:string):string {const dot=name.lastIndexOf('.');return dot>0?name.slice(dot+1).toLowerCase():'';}
function base64(bytes:Uint8Array){let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
export async function captureOriginalFile(file:File):Promise<Source['originalFile']>{
 const ext=sourceFileExtension(file.name),mime=formats[ext];if(!mime||!ext&&/^(?:image|audio|video)\//.test(file.type))return undefined;
 const bytes=new Uint8Array(await file.arrayBuffer());return {name:file.name,mime,dataUrl:`data:${mime};base64,${base64(bytes)}`,size:bytes.length,sha256:bytesDigest(bytes)};
}
export function validateOriginalFile(input:unknown):NonNullable<Source['originalFile']>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('The original source attachment is invalid.');
 const v=input as Record<string,unknown>;
 if(typeof v.name!=='string'||!v.name.trim()||v.name.length>500||/[\x00-\x1f/\\]/.test(v.name))throw new Error('Original source filenames must be simple filenames.');
 const ext=sourceFileExtension(v.name);
 if(!formats[ext]||formats[ext]!==v.mime)throw new Error('The original source format is not supported.');
 if(typeof v.size!=='number'||!Number.isInteger(v.size)||v.size<0||v.size>20*1024*1024||typeof v.sha256!=='string'||!/^([a-f0-9]{64})$/.test(v.sha256))throw new Error('Original source size or checksum is invalid.');
 if(typeof v.dataUrl!=='string'||v.dataUrl.length>Math.ceil(20*1024*1024*4/3)+200||!v.dataUrl.startsWith(`data:${v.mime};base64,`))throw new Error('The original source attachment is not correctly encoded.');
 const encoded=v.dataUrl.slice(v.dataUrl.indexOf(',')+1),body=encoded.replace(/={1,2}$/,'');if(encoded.length%4!==0||/[^A-Za-z0-9+/]/.test(body))throw new Error('The original source attachment has invalid base64.');
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 if(bytes.length!==v.size||bytesDigest(bytes)!==v.sha256)throw new Error('The original source checksum does not match. Reimport the file.');
 return {name:v.name,mime:v.mime as string,dataUrl:v.dataUrl,size:v.size,sha256:v.sha256};
}
/** Download only: never render original HTML/XML/Office files as active application content. */
export function saveOriginalFile(source:Source){
 if(!source.originalFile)throw new Error('This source has no preserved original file. Reimport it to include one.');
 const original=validateOriginalFile(source.originalFile),bytes=Uint8Array.from(atob(original.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=original.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
