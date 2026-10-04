import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const inside=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
function command(binary,args,input){return new Promise((resolve,reject)=>{
  const env={...process.env,LC_ALL:'C'};delete env.COPYFILE_DISABLE;
  const child=spawn(binary,args,{stdio:['pipe','pipe','pipe'],env});let stdout='',stderr='',settled=false,terminalError;
  const timer=setTimeout(()=>{terminalError=new Error('Native application copying exceeded its five-minute limit.');child.kill('SIGKILL');},300000);
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(stdout);};
  child.on('error',finish);child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>1024*1024){terminalError=new Error('Native copy metadata exceeded its safe limit.');child.kill('SIGKILL');}});
  child.stderr.on('data',chunk=>{if(stderr.length<8000)stderr+=chunk;});child.on('close',code=>finish(terminalError||(code===0?undefined:new Error(`Native copy command failed (${path.basename(binary)}, ${code}): ${stderr.trim()}`))));
  child.stdin.on('error',()=>{});child.stdin.end(input);
});}
async function absent(filename){try{await fs.lstat(filename);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}

// Only ancestors of excluded paths need manual metadata copying. Whole included
// subtrees use Apple's cp, preserving their ACLs, xattrs and symlinks natively.
async function directoryMetadata(source,target,stat){
  await fs.chmod(target,stat.mode&0o7777);
  const listing=await command('/bin/ls',['-lde',source]);const acl=[...listing.matchAll(/^\s*\d+: (.+)$/gm)].map(match=>match[1]).join('\n');
  if(acl)await command('/bin/chmod',['-E',target],acl+'\n');else await command('/bin/chmod',['-N',target]);
  const attributes=(await command('/usr/bin/xattr',[source])).split('\n').filter(Boolean);
  for(const name of attributes){
    const hex=(await command('/usr/bin/xattr',['-px',name,source])).replace(/\s/g,'');
    // exec argument limits are bounded; never silently discard a security xattr.
    if(hex.length>128*1024)throw new Error(`Cannot safely copy the unusually large directory attribute ${name}. Choose a different export location.`);
    await command('/usr/bin/xattr',['-wx',name,hex,target]);
  }
  await fs.utimes(target,stat.atime,stat.mtime);
}

/**
 * Copy a trusted runtime into a NEW path without following source symlinks.
 * macOS cp -c uses clonefile (Node's FICLONE flag is ineffective there), with
 * Apple's metadata-preserving copyfile fallback on non-cloning volumes.
 * Excluded source paths are pruned before copying, including old recordings.
 */
export async function copyNativeTree(sourcePath,targetPath,{exclude=[]}={}){
  const source=await fs.realpath(sourcePath),stat=await fs.lstat(source);
  if(!stat.isDirectory())throw new Error('The native runtime source must be a directory.');
  const parent=await fs.realpath(path.dirname(path.resolve(targetPath))),target=path.join(parent,path.basename(targetPath));
  if(inside(source,target))throw new Error('The native copy must be outside its source.');
  if(!await absent(target))throw new Error('The native copy destination already exists.');
  const exclusions=exclude.map(value=>path.resolve(source,value));
  if(exclusions.some(value=>value===source||!inside(source,value)))throw new Error('Excluded paths must be descendants of the native runtime.');
  const omitted=filename=>exclusions.some(value=>inside(value,filename));
  // Atomically reserve the new root. Cleanup is limited to this owned path.
  await fs.mkdir(target,{mode:0o700});
  try{
    if(process.platform!=='darwin'){
      // Node 24 rejects errorOnExist when even the directory root exists.
      // Keep our exclusive reservation and copy only absent children into it.
      for(const entry of await fs.readdir(source))await fs.cp(path.join(source,entry),path.join(target,entry),{recursive:true,verbatimSymlinks:true,errorOnExist:true,force:false,preserveTimestamps:true,mode:constants.COPYFILE_FICLONE,filter:filename=>!omitted(filename)});
      await fs.chmod(target,stat.mode&0o7777);await fs.utimes(target,stat.atime,stat.mtime);
      return {method:'portable-copy'};
    }
    async function copyDirectory(from,to){
      const hasExclusion=exclusions.some(value=>inside(from,value));
      if(!hasExclusion){await command('/bin/cp',['-cRp',from+path.sep,to]);return;}
      const info=await fs.lstat(from);
      for(const entry of await fs.readdir(from,{withFileTypes:true})){
        const next=path.join(from,entry.name),output=path.join(to,entry.name);if(omitted(next))continue;
        if(entry.isDirectory()&&exclusions.some(value=>inside(next,value))){await fs.mkdir(output,{mode:0o700});await copyDirectory(next,output);}
        else await command('/bin/cp',['-cRp',next,output]);
      }
      await directoryMetadata(from,to,info);
    }
    await copyDirectory(source,target);
    return {method:'macos-clone-or-copy'};
  }catch(error){await fs.rm(target,{recursive:true,force:true}).catch(()=>{});throw error;}
}

/** Selected recording files use the same native clone path, with no hard links. */
export async function copyNativeFile(sourcePath,targetPath){
  const source=await fs.realpath(sourcePath);if(!(await fs.stat(source)).isFile())throw new Error('The recording source must be a regular file.');
  const target=path.join(await fs.realpath(path.dirname(path.resolve(targetPath))),path.basename(targetPath));
  if(!await absent(target))throw new Error('The recording copy destination already exists.');
  try{
    if(process.platform==='darwin')await command('/bin/cp',['-cRp',source,target]);
    else await fs.copyFile(source,target,constants.COPYFILE_EXCL|constants.COPYFILE_FICLONE);
  }catch(error){await fs.rm(target,{force:true}).catch(()=>{});throw error;}
}
