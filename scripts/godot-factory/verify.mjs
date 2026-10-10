import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';

const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const supplied=process.argv.find(arg=>arg.startsWith('--godot='))?.slice(8);
const godot=supplied??JSON.parse(await readFile(path.join(repo,'.qa/godot-factory-tools/tools.json'),'utf8')).godot;
const output=path.join(repo,'.qa/native-factory-benchmark'),manifest=path.join(output,'native-manifest.json'),report=path.join(output,'native-report.json');
await mkdir(output,{recursive:true});
const engine=path.join(root,'bridge/assessment.mjs');
await build({entryPoints:[path.join(root,'bridge/cli.ts')],bundle:true,platform:'node',format:'esm',target:'node22',outfile:engine});
async function run(name,executable,args,env={}) {
  const {code,log}=await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:repo,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let log='';
    child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
    const timeout=setTimeout(()=>child.kill('SIGTERM'),180000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('close',code=>{clearTimeout(timeout);resolve({code,log});});
  });
  await writeFile(path.join(output,`${name}.log`),log);
  if(code!==0||/(?:^|\n)(?:SCRIPT ERROR|ERROR):/m.test(log))throw Error(`${name} failed. See ${path.join(output,name+'.log')}`);
  process.stdout.write(`${name}: passed\n`);
}
const tsx=path.join(repo,'node_modules/tsx/dist/cli.mjs'),project=path.join(root,'project');
await run('reference-contracts',process.execPath,[tsx,'scripts/factory-benchmark/offline.ts','--output',output]);
await run('catalog',process.execPath,[tsx,'scripts/godot-factory/tools/build-catalog.ts']);
await run('presentation-assets',process.execPath,[tsx,'scripts/godot-factory/tools/prepare-presentation.ts']);
await run('godot-import',godot,['--headless','--editor','--path',project,'--import']);
const env={ASTERLOOM_FACTORY_NODE:process.execPath,ASTERLOOM_FACTORY_ENGINE:engine};
const scratch=await mkdtemp(path.join(output,'.runtime-state-'));
try{
  const save=`--save-dir=${scratch}`;
  await run('native-render-assessment-resume',godot,['--headless','--path',project,'--',save,`--qa-manifest=${manifest}`,`--qa-output=${report}`],env);
  await run('native-controls',godot,['--headless','--path',project,'--script','res://scripts/native_interaction_test.gd','--',save,`--manifest=${manifest}`],env);
  await run('native-spatial-play',godot,['--headless','--path',project,'--script','res://scripts/spatial_contract_test.gd','--',save,`--manifest=${manifest}`],env);
  await run('native-response-rendering',godot,['--headless','--path',project,'--script','res://scripts/render_contract_test.gd','--',save,`--manifest=${manifest}`],env);
  await run('native-progress-isolation',godot,['--headless','--path',project,'--script','res://scripts/progress_contract_test.gd','--',save,`--manifest=${manifest}`],env);
  await run('native-shape-and-image-contracts',godot,['--headless','--path',project,'--script','res://scripts/shape_contract_test.gd','--',save],env);
  await run('native-presentation',godot,['--headless','--path',project,'--script','res://presentation/presentation_self_test.gd','--',save],env);
}finally{await rm(scratch,{recursive:true,force:true});}
await run('native-reference-parity',process.execPath,[tsx,'scripts/factory-benchmark/offline.ts','--output',output,'--native-results',report,'--require-native']);
const measured=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
process.stdout.write(JSON.stringify({counts:measured.counts,gates:measured.gates,report:path.join(output,'report.json')},null,2)+'\n');
