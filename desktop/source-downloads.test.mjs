import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createAssetStore} from '../server/media-assets.mjs';
import {publicAsset} from '../server/media-service.mjs';
import {saveSourceMaterial,validateSourceDownloadRequest} from './source-downloads.mjs';
import {createGameBundle,loadEmbeddedGame} from './bundles.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inline=(bytes=Buffer.from('Exact source bytes.\r\n'),filename='source.txt',mime='text/plain')=>({kind:'inline',filename,mime,dataUrl:`data:${mime};base64,${bytes.toString('base64')}`,size:bytes.length,sha256:hash(bytes)});
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-source-download-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const choose=filename=>async()=>({canceled:false,filePath:filename});

test('native source saves preserve exact bytes, respect cancellation, and report the chosen filename',async t=>{
 const root=await setup(t),destination=path.join(root,'my copy.txt'),bytes=Buffer.from('source\r\nbytes\0 untouched');
 assert.deepEqual(await saveSourceMaterial(inline(bytes),{chooseDestination:choose(destination)}),{status:'saved',filename:'my copy.txt'});assert.deepEqual(await fs.readFile(destination),bytes);
 assert.deepEqual(await saveSourceMaterial(inline(),{chooseDestination:async()=>({canceled:true})}),{status:'canceled',filename:'source.txt'});assert.deepEqual(await fs.readdir(root),['my copy.txt']);
});
test('native boundary rejects paths, URLs, invalid MIME, executable extensions, oversized data and bad hashes before opening a dialog',async()=>{
 const valid=inline();let dialogs=0;
 for(const request of [{...valid,filename:'../source.txt'},{...valid,filename:'C:\\source.txt'},{...valid,filename:'NUL.txt'},{...valid,filename:'source.exe'},{...valid,mime:'application/x-executable'},{...valid,size:21*1024**2},{...valid,sha256:'0'.repeat(64)},{...valid,dataUrl:'https://example.org/source.txt'},{...valid,path:'/etc/passwd'},{kind:'asset',filename:'source.mp3',asset:{id:'../../file',sha256:'../../file',name:'source.mp3',mime:'audio/mpeg',size:10}}])await assert.rejects(saveSourceMaterial(request,{chooseDestination:async()=>{dialogs++;return{canceled:true};}}));
 assert.equal(dialogs,0);
 for(const [filename,mime] of [['README','text/plain'],['notes.yaml','application/yaml'],['notes.tsv','text/tab-separated-values'],['notes.rtf','application/rtf']])assert.equal(validateSourceDownloadRequest(inline(Buffer.from('untouched'),filename,mime)).filename,filename);
});
test('streamed recordings verify every byte and preserve an existing destination if the stored recording is corrupt',async t=>{
 const root=await setup(t),store=await createAssetStore({directory:path.join(root,'assets'),reserveBytes:0});
 const asset=publicAsset(await store.ingest(createReadStream(new URL('../server/fixtures/media/jfk.mp3',import.meta.url)),{name:'speech.mp3'})),request={kind:'asset',filename:asset.name,asset},destination=path.join(root,'speech.mp3');
 const resolveAsset=value=>store.lookup(value.id);assert.equal((await saveSourceMaterial(request,{chooseDestination:choose(destination),resolveAsset})).status,'saved');assert.deepEqual(await fs.readFile(destination),await fs.readFile(new URL('../server/fixtures/media/jfk.mp3',import.meta.url)));
 await fs.writeFile(destination,'previous good download');const item=await store.lookup(asset.id),bytes=await fs.readFile(item.path);bytes[bytes.length-1]^=0xff;await fs.writeFile(item.path,bytes);
 await assert.rejects(saveSourceMaterial(request,{chooseDestination:choose(destination),resolveAsset}),/checksum/);assert.equal(await fs.readFile(destination,'utf8'),'previous good download');assert.equal((await fs.readdir(root)).some(name=>name.startsWith('.asterloom-source-')),false);
});
test('source save rejects symbolic-link destinations, source overwrite and missing recordings without losing files',async t=>{
 const root=await setup(t),store=await createAssetStore({directory:path.join(root,'assets'),reserveBytes:0}),asset=publicAsset(await store.ingest(createReadStream(new URL('../server/fixtures/media/jfk.mp3',import.meta.url)),{name:'speech.mp3'})),item=await store.lookup(asset.id),request={kind:'asset',filename:asset.name,asset},resolveAsset=value=>store.lookup(value.id);
 await assert.rejects(saveSourceMaterial(request,{chooseDestination:choose(item.path),resolveAsset}),/outside the original/);
 if(process.platform!=='win32'){const target=path.join(root,'target.txt'),link=path.join(root,'link.txt');await fs.writeFile(target,'keep');await fs.symlink(target,link);await assert.rejects(saveSourceMaterial(inline(),{chooseDestination:choose(link)}),/symbolic link/);assert.equal(await fs.readFile(target,'utf8'),'keep');}
 let dialogs=0;await assert.rejects(saveSourceMaterial({...request,asset:{...asset,id:'a'.repeat(64),sha256:'a'.repeat(64)}},{chooseDestination:async()=>{dialogs++;return{canceled:true};},resolveAsset}),/missing/);assert.equal(dialogs,0);
 await assert.rejects(saveSourceMaterial(inline(),{chooseDestination:choose(path.join(root,'absent','source.txt'))}));assert.equal((await fs.readdir(root)).some(name=>name.startsWith('.asterloom-source-')),false);
});
test('a standalone game recipient downloads its own bundled media and preserved document without the creator store',async t=>{
 const root=await setup(t),store=await createAssetStore({directory:path.join(root,'creator'),reserveBytes:0}),asset=await store.ingest(createReadStream(new URL('../server/fixtures/media/jfk.mp3',import.meta.url)),{name:'speech.mp3'}),original=inline(Buffer.from('# Exact document\r\n\r\nIts unedited source.'),'lesson.md','text/markdown'),now='2026-10-08T00:00:00.000Z';
 const notebook={id:'download-game',title:'Source download game',description:'',createdAt:now,updatedAt:now,ageGroup:'adult',goal:'Learn',theme:'islands',scaffoldIds:[],cards:[],sources:[{id:'recording',title:'speech.mp3',kind:'audio',text:'Words in the recording.',status:'ready',addedAt:now,asset},{id:'document',title:'Edited lesson',kind:'text',text:'Corrected readable source.',status:'ready',addedAt:now,originalFile:{name:original.filename,mime:original.mime,dataUrl:original.dataUrl,size:original.size,sha256:original.sha256}}],revision:1};
 const template=path.join(root,'template'),output=path.join(root,'exports');await fs.mkdir(path.join(template,'resources'),{recursive:true});await fs.writeFile(path.join(template,'Asterloom.exe'),'template fixture');await fs.mkdir(output);
 const exported=await createGameBundle({packageText:JSON.stringify({format:'learnpack',version:1,exportedAt:now,notebook}),target:'windows',template,destination:output,sign:false,resolveAsset:a=>store.lookup(a.id)});
 await fs.rm(store.directory,{recursive:true,force:true});const resources=path.join(exported.path,'resources'),embedded=await loadEmbeddedGame(resources),recipient=await createAssetStore({directory:path.join(root,'recipient'),bundledDirectory:path.join(resources,'media-assets'),reserveBytes:0});
 const recording=embedded.notebook.sources[0].asset,download=path.join(root,'recipient.mp3');await saveSourceMaterial({kind:'asset',filename:recording.name,asset:recording},{chooseDestination:choose(download),resolveAsset:a=>recipient.lookup(a.id)});assert.deepEqual(await fs.readFile(download),await fs.readFile(new URL('../server/fixtures/media/jfk.mp3',import.meta.url)));
 const document=embedded.notebook.sources[1].originalFile,documentPath=path.join(root,'recipient.md');await saveSourceMaterial({kind:'inline',filename:document.name,mime:document.mime,dataUrl:document.dataUrl,size:document.size,sha256:document.sha256},{chooseDestination:choose(documentPath)});assert.deepEqual(await fs.readFile(documentPath),Buffer.from(original.dataUrl.split(',')[1],'base64'));
});
