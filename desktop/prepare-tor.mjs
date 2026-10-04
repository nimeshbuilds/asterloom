import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

/** Official expert bundles are PGP-signed archives but contain unsigned Mach-O
 * executables. Apple Silicon requires at least a local ad-hoc code signature. */
export async function prepareTorRuntime(directory,platform){
  if(platform!=='darwin'||process.platform!=='darwin')return false;
  const run=promisify(execFile);
  async function visit(folder){
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      const filename=path.join(folder,entry.name);
      if(entry.isDirectory()){await visit(filename);continue;}
      if(!entry.isFile())continue;
      const handle=await fs.open(filename,'r');const bytes=Buffer.alloc(4);try{await handle.read(bytes,0,4,0);}finally{await handle.close();}
      if(['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca'].includes(bytes.toString('hex')))await run('/usr/bin/codesign',['--force','--sign','-',filename]);
    }
  }
  await visit(path.join(directory,'tor'));return true;
}
