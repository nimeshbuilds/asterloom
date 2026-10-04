import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const variants={'darwin-arm64':'canvas-darwin-arm64','darwin-x64':'canvas-darwin-x64','win32-x64':'canvas-win32-x64-msvc'};

/** Cross-packaging must use the target platform's N-API binary, not whatever
 * npm installed on the build host. Every archive is pinned by package-lock. */
export async function prepareNativeDependencies(root,target){
  const name=variants[`${target.platform}-${target.arch}`];if(!name)throw new Error('This native target has no configured canvas dependency.');
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  const record=lock.packages[`node_modules/@napi-rs/${name}`];
  const canvas=JSON.parse(await fs.readFile(path.join(root,'node_modules','@napi-rs','canvas','package.json'),'utf8'));
  if(!record||record.version!==canvas.optionalDependencies[`@napi-rs/${name}`]||!record.integrity?.startsWith('sha512-'))throw new Error('The target canvas dependency must have an exact SHA-512 package-lock entry.');
  const url=new URL(record.resolved);if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org')throw new Error('Native runtime dependencies must come from the locked npm registry.');
  const directory=path.join(root,'desktop','vendor','native',`${name}-${record.version}`);
  const archive=directory+'.tgz';await fs.mkdir(path.dirname(directory),{recursive:true});
  let bytes;try{bytes=await fs.readFile(archive);}catch{}
  const valid=data=>data&&`sha512-${createHash('sha512').update(data).digest('base64')}`===record.integrity;
  if(!valid(bytes)){
    console.log(`Downloading locked native dependency ${name}@${record.version}…`);
    const response=await fetch(url);if(!response.ok)throw new Error(`Native dependency download failed (${response.status}).`);
    bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>80*1024*1024||!valid(bytes))throw new Error('Native dependency checksum mismatch.');
    await fs.writeFile(archive,bytes);
  }
  const run=promisify(execFile);const {stdout}=await run('tar',['-tzf',archive]);
  if(stdout.split(/\r?\n/).filter(Boolean).some(entry=>!entry.startsWith('package/')||entry.split('/').includes('..')))throw new Error('The native dependency archive has an unsafe path.');
  await fs.rm(directory,{recursive:true,force:true});await fs.mkdir(directory,{recursive:true});await run('tar',['-xzf',archive,'--strip-components=1','-C',directory]);
  return {name,directory,version:record.version,integrity:record.integrity};
}

export async function installNativeDependencies(buildPath,dependency){
  const scope=path.join(buildPath,'node_modules','@napi-rs');await fs.mkdir(scope,{recursive:true});
  for(const entry of await fs.readdir(scope))if(entry.startsWith('canvas-'))await fs.rm(path.join(scope,entry),{recursive:true,force:true});
  await fs.cp(dependency.directory,path.join(scope,dependency.name),{recursive:true});
  const binaries=[];
  async function inspect(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,entry.name);if(entry.isDirectory())await inspect(filename);else if(entry.isFile()&&entry.name.endsWith('.node'))binaries.push(filename);}}
  await inspect(path.join(buildPath,'node_modules'));
  if(binaries.length!==1||!binaries[0].startsWith(path.join(scope,dependency.name)+path.sep))throw new Error('An additional native dependency needs explicit target packaging support.');
}
