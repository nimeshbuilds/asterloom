import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.ASTERLOOM_SMOKE_APP;
assert(binary&&path.isAbsolute(binary),'Set ASTERLOOM_SMOKE_APP to the packaged desktop executable.');
assert(['darwin','win32'].includes(process.platform),'Run packaged verification on macOS or Windows.');
const resources=process.platform==='darwin'?path.resolve(path.dirname(binary),'../Resources'):path.join(path.dirname(binary),'resources');
const runtime=path.join(resources,'app','desktop','vendor','godot-factory','runtime');
const player=process.platform==='darwin'?path.join(runtime,'Asterloom Native Factory.app','Contents','MacOS','Asterloom Native Factory'):path.join(runtime,'Asterloom Native Factory.exe');
const engine=path.join(runtime,'assessment.mjs');
await Promise.all([binary,player,engine].map(filename=>access(filename)));
const output=path.join(repo,'.qa',`native-packaged-all75-${process.platform}-${process.arch}`);
await mkdir(output,{recursive:true});
const tsx=path.join(repo,'node_modules/tsx/dist/cli.mjs');
async function run(name,executable,args,environment={}) {
  const started=Date.now();
  const {code,log,timedOut}=await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:repo,env:{...process.env,...environment},shell:false,stdio:['ignore','pipe','pipe']});
    let log='',timedOut=false,force;
    child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
    const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');force=setTimeout(()=>child.kill('SIGKILL'),5000);},180000);
    const clear=()=>{clearTimeout(timeout);clearTimeout(force);};
    child.once('error',error=>{clear();reject(error);});
    child.once('close',code=>{clear();resolve({code,log,timedOut});});
  });
  await writeFile(path.join(output,`${name}.log`),log);
  assert(!timedOut&&code===0&&!/(?:^|\n)(?:SCRIPT ERROR|ERROR):/m.test(log),`${name} failed; see ${path.join(output,name+'.log')}`);
  process.stdout.write(`${name}: passed (${Date.now()-started} ms)\n`);
}
await run('reference-contracts',process.execPath,[tsx,'scripts/factory-benchmark/offline.ts','--output',output]);
const nativeResults=path.join(output,'native-report.json');
// Assessment requests must never appear in the user's legacy Godot storage:
// a simultaneous desktop deletion correctly refuses unknown shared files.
const scratch=await mkdtemp(path.join(output,'.runtime-state-'));
try{
  await run('packaged-native-all75',player,['--headless','--',`--node=${binary}`,`--engine=${engine}`,`--save-dir=${scratch}`,`--qa-manifest=${path.join(output,'native-manifest.json')}`,`--qa-output=${nativeResults}`],{ELECTRON_RUN_AS_NODE:'1'});
}finally{await rm(scratch,{recursive:true,force:true});}
await run('native-reference-parity',process.execPath,[tsx,'scripts/factory-benchmark/offline.ts','--output',output,'--native-results',nativeResults,'--require-native']);
const report=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
assert.equal(report.counts.expected,75);assert.equal(report.counts.nativeRendered,75);assert.equal(report.gates.nativeAutomatedSmoke,true);
await writeFile(path.join(output,'execution.json'),JSON.stringify({version:1,platform:process.platform,architecture:process.arch,packagedRuntime:true,packagedAssessmentHost:true,counts:report.counts,gates:report.gates,measuredAt:new Date().toISOString()},null,2)+'\n');
process.stdout.write(JSON.stringify({output,counts:report.counts,gates:report.gates},null,2)+'\n');
