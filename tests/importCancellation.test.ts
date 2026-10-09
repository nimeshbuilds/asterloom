import {afterEach,describe,expect,it,vi} from 'vitest';
import {importFile} from '../src/lib/imports';
import {bytesDigest} from '../src/lib/evidence';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();});
const pdf=()=>new File(['%PDF-1.7\nExact uploaded bytes.'],'notes.pdf',{type:'application/pdf'});
function stalledExtraction(){
 let reached!:()=>void;const started=new Promise<void>(resolve=>{reached=resolve;});
 const fetch=vi.fn((_url:string,options:RequestInit)=>new Promise((_resolve,reject)=>{
  const signal=options.signal!;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});reached();
 }));vi.stubGlobal('fetch',fetch);return{fetch,started};
}
describe('document import completion and cancellation',()=>{
 it('reuses the preserved original bytes for extraction without a second file read',async()=>{
  const file=pdf(),read=vi.spyOn(file,'arrayBuffer');
  const fetch=vi.fn(async()=>new Response(JSON.stringify({source:{content:'Extracted readable text.'},warnings:[]})));vi.stubGlobal('fetch',fetch);
  vi.stubGlobal('FileReader',class{constructor(){throw new Error('A document must not be read twice.');}});
  const source=await importFile(file),body=JSON.parse(fetch.mock.calls[0][1].body);
  expect(read).toHaveBeenCalledTimes(1);
  expect(body.dataBase64).toBe(source.originalFile!.dataUrl.split(',')[1]);
  expect(source.originalFile!.sha256).toBe(bytesDigest(new Uint8Array(await File.prototype.arrayBuffer.call(file))));
  expect(source).toMatchObject({kind:'document',status:'ready',text:'Extracted readable text.'});
 });
 it('cancels an extraction request promptly instead of leaving the upload running',async()=>{
  vi.useFakeTimers();const {fetch,started}=stalledExtraction(),controller=new AbortController();
  const pending=importFile(pdf(),{signal:controller.signal}),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
  await started;controller.abort();await rejected;
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('bounds a stalled extraction and reports a timeout, while clearing its timer',async()=>{
  vi.useFakeTimers();const {started}=stalledExtraction();
  const pending=importFile(pdf()),rejected=expect(pending).rejects.toMatchObject({name:'TimeoutError',message:expect.stringContaining('three minutes')});
  await started;await vi.advanceTimersByTimeAsync(180000);await rejected;expect(vi.getTimerCount()).toBe(0);
 });
 it('does not read or send a source when import is already canceled',async()=>{
  const file=pdf(),read=vi.spyOn(file,'arrayBuffer'),fetch=vi.fn(),controller=new AbortController();vi.stubGlobal('fetch',fetch);controller.abort();
  await expect(importFile(file,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
  expect(read).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not return an imported source when cancellation happens during the file read',async()=>{
  const file=pdf(),controller=new AbortController(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  vi.spyOn(file,'arrayBuffer').mockImplementation(async()=>{controller.abort();return new TextEncoder().encode('%PDF-1.7').buffer;});
  await expect(importFile(file,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(fetch).not.toHaveBeenCalled();
 });
});
