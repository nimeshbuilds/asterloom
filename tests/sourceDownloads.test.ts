import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Source} from '../src/types';
import {bytesDigest} from '../src/lib/evidence';
import {listSourceDownloads,downloadSourceMaterial,type SourceDownloadRequest} from '../src/lib/sourceDownloads';
import {normalizeMediaTranscript} from '../src/lib/mediaTranscript';
import {sourceDownloadFilename} from '../desktop/source-download-contract.mjs';

const source=(overrides:Partial<Source>={}):Source=>({id:'source-a',title:'My lesson',kind:'text',text:'Current corrected material.\r\n',status:'ready',addedAt:'2026-10-08T00:00:00.000Z',...overrides});
const attachment=(text='Original words.\r\n',name='lesson.md',mime='text/markdown')=>{const bytes=new TextEncoder().encode(text);return {name,mime,dataUrl:`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,size:bytes.length,sha256:bytesDigest(bytes)};};
function native(result:any={status:'saved',filename:'saved-copy.txt'}){const save=vi.fn().mockResolvedValue(result);vi.stubGlobal('window',{asterloomDesktop:{saveSourceMaterial:save}});return save;}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('downloadable source material',()=>{
 it('separates preserved original bytes from the current readable text and never invents a remote original',async()=>{
  const s=source({originalFile:attachment(),url:'https://example.org/lesson'}),save=native();
  expect(listSourceDownloads(s).map(option=>[option.id,option.filename])).toEqual([['original','lesson.md'],['text','My lesson.readable.txt']]);
  expect(await downloadSourceMaterial(s,'original')).toEqual({status:'saved',filename:'saved-copy.txt'});
  const {name:originalName,...original}=s.originalFile!;expect(save.mock.calls[0][0]).toEqual({kind:'inline',filename:originalName,...original});
  await downloadSourceMaterial(s,'text');
  const request=save.mock.calls[1][0];expect(Buffer.from(request.dataUrl.split(',')[1],'base64').toString()).toBe(s.text);expect(request.sha256).toBe(bytesDigest(new TextEncoder().encode(s.text)));
  expect(listSourceDownloads(source({kind:'notebooklm',url:'https://notebooklm.google.com/notebook/example',text:''}))).toEqual([]);
  expect(listSourceDownloads(source({kind:'website',url:'https://example.org/lesson'})).map(option=>option.id)).toEqual(['text']);
 });
 it('does not render or execute preserved HTML, and rejects a changed original before invoking native save',async()=>{
  const original=attachment('<script>untrusted()</script>\n','page.html','text/html'),save=native();
  await downloadSourceMaterial(source({originalFile:original}),'original');
  expect(save.mock.calls[0][0].dataUrl).toBe(original.dataUrl);
  save.mockClear();await expect(downloadSourceMaterial(source({originalFile:{...original,sha256:'0'.repeat(64)}}),'original')).rejects.toThrow(/checksum/);expect(save).not.toHaveBeenCalled();
 });
 it('enumerates malformed attachments safely while leaving readable text available',()=>{
  for(const originalFile of [{...attachment(),mime:'application/x-executable'},null,{name:null,mime:null}] as any[])expect(listSourceDownloads(source({originalFile})).map(option=>option.id)).toEqual(['text']);
  expect(listSourceDownloads(source({asset:{mime:'bogus',name:'x'} as any})).map(option=>option.id)).toEqual(['text']);
  expect(listSourceDownloads(source({kind:'image',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'})).map(option=>option.id)).toEqual(['text']);
 });
 it('uses safe portable filenames without changing file contents',async()=>{
  expect(sourceDownloadFilename('../CON.txt')).toBe('-CON.txt');expect(sourceDownloadFilename('NUL.txt')).toBe('_NUL.txt');expect(sourceDownloadFilename('CON .txt')).toBe('_CON.txt');expect(sourceDownloadFilename('COM¹.txt')).toBe('_COM¹.txt');
  const filename=sourceDownloadFilename('🌌'.repeat(150)+'.pdf');expect(new TextEncoder().encode(filename).length).toBeLessThanOrEqual(180);expect(filename.endsWith('.pdf')).toBe(true);
  const s=source({title:'../bad/name\u202e.exe'});expect(listSourceDownloads(s)[0].filename).not.toMatch(/[\/\\\u202e]/);
  const save=native();await downloadSourceMaterial(source({originalFile:attachment('opaque text','README','text/plain')}),'original');expect(save.mock.calls[0][0].filename).toBe('README');
 });
 it('native cancellation and failures never pretend a download was saved or fall back to a browser save',async()=>{
  const save=native({status:'canceled',filename:'My lesson.readable.txt'});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect(await downloadSourceMaterial(source(),'text')).toEqual({status:'canceled',filename:'My lesson.readable.txt'});
  save.mockResolvedValue({error:'Disk full'});await expect(downloadSourceMaterial(source(),'text')).rejects.toThrow('Disk full');expect(fetcher).not.toHaveBeenCalled();
  save.mockResolvedValue({});await expect(downloadSourceMaterial(source(),'text')).rejects.toThrow(/completed result/);
 });
 it('passes only the manifest for large recordings, never their bytes or arbitrary URLs',async()=>{
  const save=native(),asset={id:'a'.repeat(64),sha256:'a'.repeat(64),name:'recording.mp4',mime:'video/mp4',size:1024**3};
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await downloadSourceMaterial(source({kind:'video',asset,text:''}),'original');
  expect(save.mock.calls[0][0]).toEqual({kind:'asset',filename:'recording.mp4',asset});expect(JSON.stringify(save.mock.calls[0][0]).length).toBeLessThan(400);expect(fetcher).not.toHaveBeenCalled();
  vi.stubGlobal('window',{});vi.stubGlobal('document',{});await expect(downloadSourceMaterial(source({kind:'video',asset,text:''}),'original')).rejects.toThrow(/updated desktop/);expect(fetcher).not.toHaveBeenCalled();
 });
 it('handles a supported near-limit embedded recording without regex stack overflow',async()=>{
  const bytes=Buffer.alloc(20*1024**2-3,0x41),s=source({kind:'audio',title:'Long recording.mp3',mime:'audio/mpeg',dataUrl:'data:audio/mpeg;base64,'+bytes.toString('base64'),text:''}),save=native();
  expect(listSourceDownloads(s).map(option=>option.id)).toEqual(['original']);await downloadSourceMaterial(s,'original');
  const request=save.mock.calls[0][0] as Extract<SourceDownloadRequest,{kind:'inline'}>;expect(request.size).toBe(bytes.length);expect(request.sha256).toBe(bytesDigest(bytes));expect(request.dataUrl).toBe(s.dataUrl);
 });
 it('offers validated current captions, preserves timestamps, and labels estimated timing',async()=>{
  const prepared=normalizeMediaTranscript({format:'vtt',text:'WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nA <b>source</b> idea &amp; its condition.'},{mediaSourceId:'recording-a',mediaRevision:'a'.repeat(64)});
  const s=source({kind:'transcript',text:prepared.text,transcript:prepared.transcript}),save=native();
  expect(listSourceDownloads(s).map(option=>option.id)).toEqual(['text','transcript']);await downloadSourceMaterial(s,'transcript');
  const text=Buffer.from(save.mock.calls[0][0].dataUrl.split(',')[1],'base64').toString();expect(text).toContain('00:00:01.250 --> 00:00:03.500');expect(text).toContain('A source idea &amp; its condition.');
  const estimated=normalizeMediaTranscript({format:'plain',text:'A source idea. Another source idea.'},{mediaSourceId:'recording-a',mediaRevision:'a'.repeat(64),duration:10});
  expect(listSourceDownloads(source({kind:'transcript',...estimated})).find(option=>option.id==='transcript')?.description).toMatch(/estimates/);
  const stale={...s,text:s.text+' revised'};expect(listSourceDownloads(stale).map(option=>option.id)).toEqual(['text']);await expect(downloadSourceMaterial(stale,'transcript')).rejects.toThrow(/not included/);
 });
 it('detects an attached recording changed beneath its timed transcript',()=>{
  const prepared=normalizeMediaTranscript({format:'vtt',text:'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nWords from the recording.'},{mediaSourceId:'source-a',mediaRevision:'a'.repeat(64)});
  const s=source({kind:'audio',...prepared,asset:{id:'b'.repeat(64),sha256:'b'.repeat(64),name:'new.mp3',mime:'audio/mpeg',size:100}});
  expect(listSourceDownloads(s).map(option=>option.id)).toEqual(['original','text']);
 });
 it('browser preview starts an inert download with exact bytes and reports only started',async()=>{
  vi.stubGlobal('window',{});const link={href:'',download:'',click:vi.fn()},createObjectURL=vi.fn().mockReturnValue('blob:test');
  vi.stubGlobal('document',{createElement:vi.fn().mockReturnValue(link)});vi.spyOn(URL,'createObjectURL').mockImplementation(createObjectURL);vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  const s=source({originalFile:attachment('Original\r\nmaterial\u0000.','notes.txt','text/plain')});expect(await downloadSourceMaterial(s,'original')).toEqual({status:'started',filename:'notes.txt'});
  const blob=createObjectURL.mock.calls[0][0] as Blob;expect(blob.type).toBe('application/octet-stream');expect(await blob.text()).toBe('Original\r\nmaterial\u0000.');expect(link.click).toHaveBeenCalledOnce();
 });
});
