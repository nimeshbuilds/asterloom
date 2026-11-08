import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Records repository code hashes and explicitly supplied run settings. This
 * performs no model request, discovers no credentials, and stores no code text. */
export async function captureCohortContext(output:string,settings:Record<string,unknown>){
 const paths=execFileSync('rg',['--files','src/lib','src/data','server','scripts/factory-benchmark','tests/fixtures','tests/gameDraftAuthoring.fixture.ts','--glob','*.ts','--glob','*.mjs'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort(),codeSnapshot:Record<string,string>={};
 for(const path of paths)codeSnapshot[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 const context={version:1,recordedAt:new Date().toISOString(),...settings,codeSnapshot};await mkdir(output,{recursive:true});await writeFile(join(output,'cohort-context.json'),JSON.stringify(context,null,2)+'\n');return context;
}
async function main(){const args=process.argv.slice(2),option=(flag:string)=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;if(!option('--output')||!option('--settings'))throw Error('Provide --output and --settings pointing to explicit non-secret run metadata.');const context=await captureCohortContext(resolve(option('--output')!),JSON.parse(await readFile(resolve(option('--settings')!),'utf8')));console.log(JSON.stringify({recordedAt:context.recordedAt,hashedFiles:Object.keys(context.codeSnapshot).length}));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
