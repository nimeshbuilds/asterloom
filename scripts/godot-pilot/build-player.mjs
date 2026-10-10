import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, writeFile, rm, access, readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Export authored scenes and data; never run scripts supplied by a learning pack.
const root=path.dirname(fileURLToPath(import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const p=arg.indexOf('=');assert(p>2,'Use --name=value arguments');return [arg.slice(2,p),arg.slice(p+1)];}));
assert(args.godot && args.templates && args.output,'Required: --godot=PATH --templates=DIR --platform=mac|windows --output=DIR');
assert(['mac','windows'].includes(args.platform),'Choose mac or windows');
const output=path.resolve(args.output),godot=path.resolve(args.godot),templates=path.resolve(args.templates);
const filename=args.platform==='mac'?'macos.zip':'windows_release_x86_64.exe';
const expected=args.platform==='mac'?'88df5e2e6fee99088699be66e6d42e4da4fb0c5619d054297d755a49558a4792':'d34d36f3be1a6c49c56525ae86469b92e4f417ddf0b43cf00dd80c385c4b0562';
const digest=data=>createHash('sha256').update(data).digest('hex');
async function sourceFiles(directory,prefix='') {
 const result={};
 for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(['.godot','export_presets.cfg'].includes(entry.name))continue;
  assert(!entry.isSymbolicLink(),'Project source must not contain symbolic links');
  const file=path.join(directory,entry.name),name=prefix+entry.name;
  if(entry.isDirectory())Object.assign(result,await sourceFiles(file,name+'/'));
  else{assert(entry.isFile());const bytes=await readFile(file);result[name]={bytes:bytes.length,sha256:digest(bytes)};}
 }
 return result;
}
const sourceBefore=await sourceFiles(path.join(root,'project'));
assert.equal(digest(await readFile(path.join(templates,filename))),expected,'Export template must match the pinned official Godot 4.7.2 release');
await access(godot);
// Refuse existing outputs so a failed/repeated export cannot destroy another build.
await mkdir(output);
const staging=await mkdtemp(path.join(tmpdir(),'asterloom-godot-export-'));
function run(argv){return new Promise((resolve,reject)=>{const child=spawn(godot,argv,{stdio:'inherit'});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Godot failed: '+code)));});}
try{
 await cp(path.join(root,'project'),staging,{recursive:true,filter:file=>!['.godot','export_presets.cfg'].includes(path.basename(file))});
 const destination=path.join(output,args.platform==='mac'?'Asterloom Signalwright.app':'Asterloom Signalwright.exe');
 const common=`[preset.0]\nname="Pilot"\nplatform="${args.platform==='mac'?'macOS':'Windows Desktop'}"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.json,*.txt,*.md"\nexclude_filter="audio/audio_self_test.gd,qa/*,tests/*"\nexport_path=${JSON.stringify(destination)}\n\n[preset.0.options]\ncustom_template/release=${JSON.stringify(path.join(templates,filename))}\nbinary_format/architecture="${args.platform==='mac'?'universal':'x86_64'}"\n`;
 const options=args.platform==='mac'?'application/bundle_identifier="build.nimesh.asterloom.signalwright.pilot"\napplication/short_version="0.1.0"\napplication/version="0.1.0"\napplication/copyright="NimeshBuilds"\ncodesign/codesign=1\nnotarization/notarization=0\n':'binary_format/embed_pck=true\ncodesign/enable=false\napplication/company_name="NimeshBuilds"\napplication/product_name="Asterloom Signalwright Pilot"\napplication/file_version="0.1.0.0"\napplication/product_version="0.1.0.0"\n';
 await writeFile(path.join(staging,'export_presets.cfg'),common+options);
 await run(['--headless','--editor','--path',staging,'--import']);
 await run(['--headless','--path',staging,'--export-release','Pilot',destination]);
 await access(destination);
 await cp(path.join(root,'project','GODOT-THIRD-PARTY-NOTICES.txt'),path.join(output,'GODOT-THIRD-PARTY-NOTICES.txt'));
 assert.deepEqual(await sourceFiles(path.join(root,'project')),sourceBefore,'Project source changed during export');
 await writeFile(path.join(output,'build.json'),JSON.stringify({format:'asterloom-godot-pilot-build',version:1,experimental:true,gameVersion:'0.1.0',godotVersion:'4.7.2',platform:args.platform,architecture:args.platform==='mac'?'universal':'x86_64',templateSha256:expected,buildScriptSha256:digest(await readFile(fileURLToPath(import.meta.url))),sourceFiles:sourceBefore,signing:'development-only; release signing is a separate verified step',createdAt:new Date().toISOString()},null,2)+'\n');
}finally{await rm(staging,{recursive:true,force:true});}
