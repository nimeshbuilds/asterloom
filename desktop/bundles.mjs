import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parsePackage,serializePackage} from './generated/package-validation.mjs';

export const TARGETS={mac:{platform:'darwin',arch:'arm64',directory:'Asterloom-darwin-arm64'},'mac-intel':{platform:'darwin',arch:'x64',directory:'Asterloom-darwin-x64'},windows:{platform:'win32',arch:'x64',directory:'Asterloom-win32-x64'}};
export function safeTitle(value){return String(value).normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').replace(/[. ]+$/g,'').trim().slice(0,70)||'Learning adventure';}
export function readGame(text){
  if(typeof text!=='string')throw new Error('The notebook must be a serialized .learnpack.');
  const notebook=parsePackage(text);
  const packageText=serializePackage(notebook);
  const identity=createHash('sha256').update(JSON.stringify(notebook)).digest('hex').slice(0,24);
  return {notebook,packageText,identity};
}
export function resourcesDirectory(bundle,target){return target.startsWith('mac')?path.join(bundle,'Contents','Resources'):path.join(bundle,'resources');}
export async function existing(file){try{await fs.access(file);return true;}catch{return false;}}

export async function findTemplate(target,roots=[]){
  if(!TARGETS[target])throw new Error('Choose mac, mac-intel or windows as the export platform.');
  for(const root of roots.filter(Boolean)){
    const directory=path.join(root,TARGETS[target].directory);
    const candidate=target.startsWith('mac')?path.join(directory,'Asterloom.app'):directory;
    if(await existing(target.startsWith('mac')?path.join(candidate,'Contents','MacOS','Asterloom'):path.join(candidate,'Asterloom.exe')))return candidate;
  }
  return null;
}

async function uniqueDestination(directory,name,target){
  const extension=target.startsWith('mac')?'.app':'';
  for(let i=0;i<1000;i++){
    const candidate=path.join(directory,`${name}${i?` (${i+1})`:''}${extension}`);
    if(!await existing(candidate))return candidate;
  }
  throw new Error('Choose a destination folder with fewer existing copies.');
}
function run(binary,args){return new Promise((resolve,reject)=>{const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',chunk=>{if(error.length<4000)error+=chunk.toString();});child.stdout.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Application signing failed (${code}). ${error.trim()}`)));});}

/** Copies a trusted runtime template and embeds exactly one validated notebook, never local state. */
export async function createGameBundle({packageText,target,template,destination,sign=true}){
  const game=readGame(packageText);
  if(!TARGETS[target])throw new Error('Choose mac, mac-intel or windows as the export platform.');
  const source=await fs.realpath(template);const destinationRoot=await fs.realpath(destination);
  if(destinationRoot===source||destinationRoot.startsWith(source+path.sep))throw new Error('Choose an export folder outside the application itself.');
  const executable=target.startsWith('mac')?path.join(source,'Contents','MacOS','Asterloom'):path.join(source,'Asterloom.exe');
  if(!await existing(executable))throw new Error('This platform’s desktop template is incomplete. Rebuild the desktop release.');
  const output=await uniqueDestination(destinationRoot,`${safeTitle(game.notebook.title)}${target==='windows'?' - Windows':''}`,target);
  try{
    await fs.cp(source,output,{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
    const resources=resourcesDirectory(output,target);await fs.mkdir(resources,{recursive:true});
    await fs.writeFile(path.join(resources,'game.learnpack'),game.packageText,'utf8');
    await fs.writeFile(path.join(resources,'game-manifest.json'),JSON.stringify({format:'asterloom-desktop-game',version:1,identity:game.identity,notebookId:game.notebook.id,title:game.notebook.title,platform:TARGETS[target].platform,arch:TARGETS[target].arch,exportedAt:new Date().toISOString(),signing:'development-unsigned'},null,2));
    // A copied macOS app changes its resource seal when notebook content is embedded.
    // Ad-hoc re-signing enables local development testing; this is not notarization.
    let signing='unsigned';
    if(target.startsWith('mac')&&process.platform==='darwin'&&sign){await run('/usr/bin/codesign',['--force','--deep','--sign','-',output]);signing='ad-hoc';}
    return {path:output,identity:game.identity,notebookId:game.notebook.id,platform:target,signing};
  }catch(error){await fs.rm(output,{recursive:true,force:true});throw error;}
}

export async function loadEmbeddedGame(resources){
  const filename=path.join(resources,'game.learnpack');if(!await existing(filename))return null;
  const stat=await fs.stat(filename);if(stat.size>64*1024*1024)throw new Error('The embedded notebook exceeds the 64 MB package limit.');
  return readGame(await fs.readFile(filename,'utf8'));
}
