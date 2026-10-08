import {describe,it,expect} from 'vitest';
import {captureOriginalFile,validateOriginalFile} from '../src/lib/originalFiles';
import {importFile} from '../src/lib/imports';
import {createNotebook} from '../src/lib/utils';
import {bytesDigest} from '../src/lib/evidence';
import {parsePackage,serializePackage} from '../src/lib/package';
import {demoNotebooks} from '../src/data/demo';
describe('portable original source vault',()=>{
 const bytes=new TextEncoder().encode('The exact original material.\n'),original={name:'notes.md',mime:'text/markdown',dataUrl:`data:text/markdown;base64,${btoa(String.fromCharCode(...bytes))}`,size:bytes.length,sha256:bytesDigest(bytes)};
 it('retains exact originals through package validation without provider credentials',()=>{const n=demoNotebooks()[0];n.sources[0].originalFile=original;const pack=serializePackage({...n,apiKey:'never-export'} as typeof n);expect(parsePackage(pack).sources[0].originalFile).toEqual(original);expect(pack).not.toContain('never-export');});
 it('detects tampering, path names and unsupported executable attachments',()=>{expect(()=>validateOriginalFile({...original,sha256:'0'.repeat(64)})).toThrow(/checksum/);expect(()=>validateOriginalFile({...original,name:'../notes.md'})).toThrow(/filenames/);expect(()=>validateOriginalFile({...original,name:'run.exe'})).toThrow(/format/);expect(()=>validateOriginalFile({...original,size:1})).toThrow(/checksum/);});
 it('allows archived HTML only as a validated download attachment',()=>{expect(validateOriginalFile({...original,name:'saved.html',mime:'text/html',dataUrl:original.dataUrl.replace('text/markdown','text/html')})).toMatchObject({name:'saved.html'});});
 it.each([['chapter.markdown','text/markdown'],['table.tsv','text/tab-separated-values'],['config.yaml','application/yaml'],['config.yml','application/yaml'],['session.log','text/plain'],['README','text/plain'],['.notes','text/plain']])('retains exact %s bytes independently of decoded or edited source text',async(name,mime)=>{
  const originalBytes=Uint8Array.from([239,187,191,...new TextEncoder().encode('Name\tMeaning\r\nPacket\tA unit of data.\r\n')]);
  const source=await importFile(new File([originalBytes],name,{type:'application/octet-stream'}));
  expect(source.originalFile).toMatchObject({name,mime,size:originalBytes.length,sha256:bytesDigest(originalBytes)});
  const restored=parsePackage(serializePackage(createNotebook({sources:[{...source,text:'Edited learning text keeps the archived file unchanged.'}]}))).sources[0];
  expect(Uint8Array.from(atob(restored.originalFile!.dataUrl.split(',')[1]),char=>char.charCodeAt(0))).toEqual(originalBytes);
  expect(restored.text).toBe('Edited learning text keeps the archived file unchanged.');
 });
 it('retains an RTF attachment for download while its readable import still needs conversion',async()=>{
  const file=new File(['{\\rtf1\\ansi Exact source}'],'document.rtf');
  const retained=await captureOriginalFile(file);expect(validateOriginalFile(retained)).toMatchObject({name:'document.rtf',mime:'application/rtf',size:file.size});
 });
 it('does not invent an original for legacy text-only sources',()=>{
  const notebook=demoNotebooks()[0],restored=parsePackage(serializePackage(notebook));
  expect(restored.sources.every(source=>!source.originalFile)).toBe(true);
 });
 it('leaves extensionless images and recordings in their binary media path',async()=>{
  for(const type of ['image/png','audio/wav','video/mp4'])expect(await captureOriginalFile(new File([Uint8Array.of(0,1,2,3)],'capture',{type}))).toBeUndefined();
 });
 it('validates a 20 MiB preserved PDF without a recursive base64 regex failure',()=>{
  const bytes=new Uint8Array(20*1024*1024);bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  const file={name:'large.pdf',mime:'application/pdf',size:bytes.length,sha256:bytesDigest(bytes),dataUrl:'data:application/pdf;base64,'+Buffer.from(bytes).toString('base64')};
  expect(validateOriginalFile(file)).toEqual(file);
 });
 it.each(['AAA','A===','AA=A','AAAA=','AAAA====','AA?='])('rejects malformed original padding or alphabet %s',encoded=>{
  expect(()=>validateOriginalFile({...original,dataUrl:'data:text/markdown;base64,'+encoded})).toThrow(/base64/);
 });
});
