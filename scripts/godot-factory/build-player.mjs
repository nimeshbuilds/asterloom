import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,writeFile,rm,access,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const split=arg.indexOf('=');assert(split>2,'Use --name=value arguments.');return[arg.slice(2,split),arg.slice(split+1)];}));
assert(args.godot&&args.templates&&['mac','windows'].includes(args.platform),'Required: --godot=PATH --templates=DIR --platform=mac|windows [--output=NEW_DIR]');
const target=args.platform==='mac'?'darwin':'win32',output=path.resolve(args.output??path.join(repo,'desktop/vendor/godot-factory',target));
const godot=path.resolve(args.godot),templates=path.resolve(args.templates);
const filename=args.platform==='mac'?'macos.zip':'windows_release_x86_64.exe';
const pinned=args.platform==='mac'?'88df5e2e6fee99088699be66e6d42e4da4fb0c5619d054297d755a49558a4792':'d34d36f3be1a6c49c56525ae86469b92e4f417ddf0b43cf00dd80c385c4b0562';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(await readFile(path.join(templates,filename))),pinned,'Use the pinned official Godot 4.7.2 export template.');
await access(godot);
async function run(executable,argv,options={}){await new Promise((resolve,reject)=>{const child=spawn(executable,argv,{cwd:repo,stdio:'inherit',...options});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(`Build tool exited ${code}.`)));});}
await run(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),path.join(root,'tools/build-catalog.ts')]);
const presentation=path.join(root,'tools/prepare-presentation.ts');
await access(presentation);
await run(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),presentation]);
// Existing builds are never overwritten by this tool.
await mkdir(path.dirname(output),{recursive:true});
await mkdir(output);
const staging=await mkdtemp(path.join(tmpdir(),'asterloom-factory-export-'));
try {
  await cp(path.join(root,'project'),staging,{recursive:true,filter:file=>!['.godot','export_presets.cfg'].includes(path.basename(file))});
  const destination=path.join(output,args.platform==='mac'?'Asterloom Native Factory.app':'Asterloom Native Factory.exe');
  const common=`[preset.0]\nname="Factory"\nplatform="${args.platform==='mac'?'macOS':'Windows Desktop'}"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.json,*.txt,*.md"\nexclude_filter="qa/*,tests/*,scripts/*_test.gd,presentation/*_self_test.gd"\nexport_path=${JSON.stringify(destination)}\n\n[preset.0.options]\ncustom_template/release=${JSON.stringify(path.join(templates,filename))}\nbinary_format/architecture="${args.platform==='mac'?'universal':'x86_64'}"\n`;
  const options=args.platform==='mac'?'application/bundle_identifier="build.nimesh.asterloom.factory"\napplication/short_version="0.3.0"\napplication/version="0.3.0"\napplication/copyright="NimeshBuilds"\ncodesign/codesign=1\nnotarization/notarization=0\n':'binary_format/embed_pck=true\ncodesign/enable=false\napplication/company_name="NimeshBuilds"\napplication/product_name="Asterloom Native Factory"\napplication/file_version="0.3.0.0"\napplication/product_version="0.3.0.0"\n';
  await writeFile(path.join(staging,'export_presets.cfg'),common+options);
  await run(godot,['--headless','--editor','--path',staging,'--import']);
  await run(godot,['--headless','--path',staging,'--export-release','Factory',destination]);
  await access(destination);
  await build({entryPoints:[path.join(root,'bridge/cli.ts')],bundle:true,platform:'node',format:'esm',target:'node22',outfile:path.join(output,'assessment.mjs')});
  await cp(path.join(repo,'scripts/godot-pilot/project/GODOT-THIRD-PARTY-NOTICES.txt'),path.join(output,'GODOT-THIRD-PARTY-NOTICES.txt'));
  await cp(path.join(repo,'LICENSE'),path.join(output,'ASTERLOOM-LICENSE.txt'));
  const provenance={format:'asterloom-godot-factory-build',version:1,godotVersion:'4.7.2',platform:target,architecture:target==='darwin'?'universal':'x86_64',templateSha256:pinned,assessmentSha256:digest(await readFile(path.join(output,'assessment.mjs'))),scaffolds:75,activityKinds:18,signing:'development only; release signing and notarization required',builtAt:new Date().toISOString(),files:await readdir(output)};
  await writeFile(path.join(output,'build.json'),JSON.stringify(provenance,null,2)+'\n');
} finally {await rm(staging,{recursive:true,force:true});}
