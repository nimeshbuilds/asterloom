import {readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {factoryRequest} from './engine';

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--request'||args[2]!=='--response'||!isAbsolute(args[1])||!isAbsolute(args[3])||resolve(args[1])===resolve(args[3])) {
  process.stderr.write('Use --request <absolute JSON file> --response <absolute JSON file>.\n');process.exitCode=2;
} else {
  const output=args[3],temporary=`${output}.${process.pid}.tmp`;
  try {
    if((await stat(args[1])).size>64*1024*1024)throw Error('The local request exceeds 64 MB.');
    const result=factoryRequest(JSON.parse(await readFile(args[1],'utf8')));
    await writeFile(temporary,JSON.stringify(result),{mode:0o600,flag:'wx'});await rename(temporary,output);
    process.exitCode=result.ok?0:1;
  } catch {
    await rm(temporary,{force:true}).catch(()=>{});
    await writeFile(output,JSON.stringify({ok:false,error:'The local assessment request could not be read or saved.'}),{mode:0o600}).catch(()=>{});
    process.exitCode=1;
  }
}
