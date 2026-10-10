import {mkdir,stat,rename,rm,chmod,writeFile} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import yauzl from 'yauzl';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=path.join(repo,'.qa/godot-factory-tools');
const releases={
 darwin:{file:'Godot_v4.7.2-stable_macos.universal.zip',sha256:'c58a24e31d720be9d62f60cb5627c4e695fb72f21b0cfe1bc9ccaa9a3b3ba63e',bytes:170622178,exe:'Godot.app/Contents/MacOS/Godot'},
 win32:{file:'Godot_v4.7.2-stable_win64.exe.zip',sha256:'731980f9608d61333e5baf54a2ef17210acc7a538446c0cb9969f002aca1e953',bytes:86013866,exe:'Godot_v4.7.2-stable_win64_console.exe'},
 linux:{file:'Godot_v4.7.2-stable_linux.x86_64.zip',sha256:'cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4',bytes:77860424,exe:'Godot_v4.7.2-stable_linux.x86_64'},
};
const editor=releases[process.platform];if(!editor)throw Error('This build host is not supported.');
const templates={file:'Godot_v4.7.2-stable_export_templates.tpz',sha256:'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011',bytes:1281349702};
const hashFile=async filename=>{const hash=createHash('sha256');for await(const chunk of createReadStream(filename))hash.update(chunk);return hash.digest('hex');};
async function download(input){
  const filename=path.join(root,input.file);
  try{if((await stat(filename)).size===input.bytes&&await hashFile(filename)===input.sha256)return filename;}catch{}
  const temp=filename+'.part';await rm(temp,{force:true});
  const response=await fetch(`https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/${input.file}`,{signal:AbortSignal.timeout(300000)});
  if(!response.ok||!response.body)throw Error(`Official Godot download failed (${response.status}).`);
  let length=0;const hash=createHash('sha256');
  const verify=new Transform({transform(chunk,_encoding,callback){length+=chunk.length;if(length>input.bytes)return callback(Error('Godot archive exceeds its pinned size.'));hash.update(chunk);callback(null,chunk);}});
  try{await pipeline(Readable.fromWeb(response.body),verify,createWriteStream(temp,{flags:'wx'}));if(length!==input.bytes||hash.digest('hex')!==input.sha256)throw Error('Official Godot archive did not match its pinned checksum.');await rename(temp,filename);}catch(error){await rm(temp,{force:true});throw error;}
  return filename;
}
async function extract(filename,directory,select=()=>true){
  await mkdir(directory,{recursive:true});
  await new Promise((resolve,reject)=>yauzl.open(filename,{lazyEntries:true},(error,zip)=>{
    if(error)return reject(error);zip.on('error',reject);zip.on('end',resolve);
    zip.on('entry',entry=>{void (async()=>{
      const name=entry.fileName;if(!select(name)){zip.readEntry();return;}
      if(name.includes('\\')||name.startsWith('/')||name.split('/').includes('..'))throw Error('Invalid archive entry.');
      const mode=(entry.externalFileAttributes>>>16)&0xffff;if((mode&0xf000)===0xa000)throw Error('Archive symlinks are unsupported.');
      const output=path.join(directory,name);if(name.endsWith('/')){await mkdir(output,{recursive:true});zip.readEntry();return;}
      await mkdir(path.dirname(output),{recursive:true});
      const stream=await new Promise((yes,no)=>zip.openReadStream(entry,(error,value)=>error?no(error):yes(value)));
      await pipeline(stream,createWriteStream(output));if(mode&0o111)await chmod(output,0o755);zip.readEntry();
    })().catch(error=>{zip.close();reject(error);});});zip.readEntry();
  }));
}
await mkdir(root,{recursive:true});
await extract(await download(editor),path.join(root,'editor'));
if(!process.argv.includes('--editor-only'))await extract(await download(templates),root,name=>['templates/version.txt','templates/macos.zip','templates/windows_release_x86_64.exe','templates/windows_release_x86_64_console.exe'].includes(name));
const result={godot:path.join(root,'editor',editor.exe),templates:path.join(root,'templates'),version:'4.7.2-stable',checksums:{editor:editor.sha256,templates:templates.sha256}};
await writeFile(path.join(root,'tools.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result)+'\n');
