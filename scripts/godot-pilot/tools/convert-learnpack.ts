import {constants} from 'node:fs';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {resolve,dirname,basename,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {convertLearnpack,listPilotActivities,type PilotSelection} from './mission-pack';

export async function main(args=process.argv.slice(2)){
 const options:Record<string,string>={};let list=false;
 for(let index=0;index<args.length;index++){
  const key=args[index];if(key==='--list'){if(list)throw new Error('Duplicate --list.');list=true;continue;}
  if(!['--input','--output','--sequence','--dependency','--template'].includes(key)||options[key]!==undefined||!args[index+1]||args[index+1].startsWith('--'))throw new Error('Use --input game.learnpack with --list, or --output pack.json and explicit --sequence ID / --dependency ID; --template selects a shipped presentation.');
  options[key]=args[++index];
 }
 if(!options['--input']||extname(options['--input']).toLowerCase()!=='.learnpack')throw new Error('Choose a .learnpack input file.');
 const input=resolve(options['--input']);const inputFile=await open(input,constants.O_RDONLY|constants.O_NOFOLLOW);
 let text:string;
 try{const stat=await inputFile.stat();if(!stat.isFile()||stat.size>64*1024*1024)throw new Error('The input must be a regular .learnpack file of at most 64 MiB.');const bytes=await inputFile.readFile();try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('The input is not valid UTF-8; no bytes were replaced.');}const after=await inputFile.stat();if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs)throw new Error('The input changed during reading; no output was written.');}finally{await inputFile.close();}
 if(list){if(options['--output']||options['--sequence']||options['--dependency']||options['--template'])throw new Error('--list cannot export a pack.');process.stdout.write(JSON.stringify(listPilotActivities(text),null,2)+'\n');return;}
 if(!options['--output']||extname(options['--output']).toLowerCase()!=='.json')throw new Error('Choose a .json output file.');
 const output=resolve(options['--output']);if(input===output)throw new Error('The output must differ from the original source package.');
 const selection:PilotSelection={...(options['--sequence']?{sequenceId:options['--sequence']}:{}),...(options['--dependency']?{dependencyId:options['--dependency']}:{}),...(options['--template']?{templateId:options['--template']}:{})};
 const pack=convertLearnpack(text,selection);
 try{await lstat(output);throw new Error('The output already exists; choose a new filename.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const temporary=resolve(dirname(output),`.${basename(output)}.${randomUUID()}.pending`);
 const file=await open(temporary,'wx',0o600);
 try{await file.writeFile(JSON.stringify(pack,null,2)+'\n','utf8');await file.sync();}catch(error){await file.close();await unlink(temporary).catch(()=>{});throw error;}
 await file.close();
 try{await link(temporary,output);}finally{await unlink(temporary);}
 process.stdout.write(`Saved ${pack.lessons.length} source-cited lesson sections and ${pack.teaching.length} practice activities. Original package and progress unchanged.\n`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(`Pilot export failed: ${error instanceof Error?error.message:'Unknown error'}\n`);process.exitCode=1;});
