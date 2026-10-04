import {promises as fs} from 'node:fs';
import {copyNativeTree,copyNativeFile} from './copy-native-tree.mjs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parsePackage,serializePackage} from './generated/package-validation.mjs';
import {isUniversalMacApp} from './architectures.mjs';
import {sha256File,atomicJson} from '../server/media-assets.mjs';

export const TARGETS={mac:{platform:'darwin',arch:'universal',directory:'Asterloom-darwin-universal'},windows:{platform:'win32',arch:'x64',directory:'Asterloom-win32-x64'}};
export function normalizeTarget(target){if(['mac','mac-intel','mac-arm64','mac-universal'].includes(target))return 'mac';if(target==='windows')return target;throw new Error('Choose Mac or Windows as the export platform.');}
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
  target=normalizeTarget(target);
  for(const root of roots.filter(Boolean)){
    const directory=path.join(root,TARGETS[target].directory);
    const candidate=target.startsWith('mac')?path.join(directory,'Asterloom.app'):directory;
    if(target==='mac'?await isUniversalMacApp(candidate):await existing(path.join(candidate,'Asterloom.exe')))return candidate;
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
export async function createGameBundle({packageText,target,template,destination,sign=true,resolveAsset}){
  const game=readGame(packageText);
  const selectedAssets=[...new Map(game.notebook.sources.filter(s=>s.asset).map(s=>[s.asset.id,s.asset])).values()];
  const media=[];for(const asset of selectedAssets){if(!resolveAsset)throw new Error('The original recording must be available in the local media library before export.');const item=await resolveAsset(asset);if(await sha256File(item.path)!==asset.sha256)throw new Error('An original recording failed its integrity check. Re-import it before exporting.');media.push(item);}
  target=normalizeTarget(target);
  const source=await fs.realpath(template);const destinationRoot=await fs.realpath(destination);
  if(destinationRoot===source||destinationRoot.startsWith(source+path.sep))throw new Error('Choose an export folder outside the application itself.');
  const executable=target.startsWith('mac')?path.join(source,'Contents','MacOS','Asterloom'):path.join(source,'Asterloom.exe');
  if(!await existing(executable))throw new Error('This platform’s desktop template is incomplete. Rebuild the desktop release.');
  if(target==='mac'&&!await isUniversalMacApp(source))throw new Error('This Mac template supports only one processor type. Install the universal Mac studio before exporting.');
  const output=await uniqueDestination(destinationRoot,`${safeTitle(game.notebook.title)}${target==='windows'?' - Windows':''}`,target);
  // File Provider destinations can synthesize FinderInfo that cannot be
  // removed. Sign on the local temporary filesystem, then publish atomically
  // through a hidden destination directory, including across disk volumes.
  const needsMacSigning=target.startsWith('mac')&&process.platform==='darwin'&&sign;
  const signing=needsMacSigning?'ad-hoc':'unsigned';
  const staging=await fs.mkdtemp(path.join(needsMacSigning?os.tmpdir():destinationRoot,'.asterloom-export-'));
  const stagedOutput=path.join(staging,path.basename(output));
  let publication;
  try{
    const previousAssets=path.join(resourcesDirectory(source,target),'media-assets');
    await copyNativeTree(source,stagedOutput,{exclude:[previousAssets]});
    const resources=resourcesDirectory(stagedOutput,target);await fs.mkdir(resources,{recursive:true});
    if(media.length){const assetDir=path.join(resources,'media-assets');await fs.mkdir(assetDir);for(const item of media){const targetFile=path.join(assetDir,item.asset.id);await copyNativeFile(item.path,targetFile);if(await sha256File(targetFile)!==item.asset.sha256)throw new Error('A recording changed during export. Retry with the original recording.');await atomicJson(targetFile+'.json',item.asset);}}
    const license=path.join(resources,'app','LICENSE');
    if(await existing(license))await fs.copyFile(license,path.join(resources,'ASTERLOOM-LICENSE.txt'));
    await fs.writeFile(path.join(resources,'game.learnpack'),game.packageText,'utf8');
    await fs.writeFile(path.join(resources,'game-manifest.json'),JSON.stringify({format:'asterloom-desktop-game',version:1,identity:game.identity,notebookId:game.notebook.id,title:game.notebook.title,platform:TARGETS[target].platform,arch:TARGETS[target].arch,exportedAt:new Date().toISOString(),signing,notarized:false},null,2));
    // A copied macOS app changes its resource seal when notebook content is embedded.
    // Ad-hoc re-signing enables local development testing; this is not notarization.
    if(needsMacSigning){
      // Finder can attach presentation metadata while a destination folder is
      // being viewed. Apple rejects that metadata when sealing a new bundle.
      // Remove only these two attributes from our new copy; keep quarantine
      // and provenance attributes and leave the original application alone.
      for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork'])await run('/usr/bin/xattr',['-dr',attribute,stagedOutput]);
      await run('/usr/bin/codesign',['--force','--deep','--sign','-',stagedOutput]);
      await run('/usr/bin/codesign',['--verify','--deep','--strict',stagedOutput]);
    }
    if(needsMacSigning){
      publication=await fs.mkdtemp(path.join(destinationRoot,'.asterloom-export-'));
      const publishingOutput=path.join(publication,path.basename(output));
      await copyNativeTree(stagedOutput,publishingOutput);
      await fs.rename(publishingOutput,output);
    }else await fs.rename(stagedOutput,output);
    return {path:output,identity:game.identity,notebookId:game.notebook.id,platform:target,signing,notarized:false,warning:target==='mac'?'This new game has changed content. It is not publisher-signed or notarized; trusted distribution requires a separate signing step.':'Keep the complete Windows folder together. This export is not signed for trusted distribution.'};
  }finally{await fs.rm(staging,{recursive:true,force:true});if(publication)await fs.rm(publication,{recursive:true,force:true});}
}

export async function loadEmbeddedGame(resources){
  const filename=path.join(resources,'game.learnpack');if(!await existing(filename))return null;
  const stat=await fs.stat(filename);if(stat.size>64*1024*1024)throw new Error('The embedded notebook exceeds the 64 MB package limit.');
  return readGame(await fs.readFile(filename,'utf8'));
}
