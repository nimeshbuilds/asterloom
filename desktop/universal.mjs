import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {makeUniversalApp} from '@electron/universal';
import {sign} from '@electron/osx-sign';
import {signingInventory,entitlementPath} from './signing.mjs';
import {executableArchitectures} from './architectures.mjs';

const run=promisify(execFile);
const appCode=bundle=>path.join(bundle,'Contents','Resources','app');
/** Only call with disposable, unsigned packaging inputs, never published apps. */
export async function mergeMacApplications({arm64App,x64App,output}){
  if(process.platform!=='darwin')throw new Error('A Mac universal application must be assembled on macOS.');
  const inputs=[arm64App,x64App].map(appCode);
  const bindings=inputs.map((root,index)=>path.join(root,'node_modules','@napi-rs',`canvas-darwin-${index===0?'arm64':'x64'}`,`skia.darwin-${index===0?'arm64':'x64'}.node`));
  const bindingHashes=[];for(const file of bindings)bindingHashes.push(createHash('sha256').update(await fs.readFile(file)).digest('hex'));
  const universal=path.join(inputs[0],'node_modules','@napi-rs','canvas','skia.darwin-universal.node');
  await run('/usr/bin/lipo',['-create',...bindings,'-output',universal],{timeout:120000});
  if((await executableArchitectures(universal)).join(',')!=='arm64,x64')throw new Error('The merged PDF canvas binding must contain both Mac architectures.');
  await fs.copyFile(universal,path.join(inputs[1],'node_modules','@napi-rs','canvas','skia.darwin-universal.node'));
  for(const root of inputs){
    const scope=path.join(root,'node_modules','@napi-rs');
    for(const name of await fs.readdir(scope))if(name.startsWith('canvas-'))await fs.rm(path.join(scope,name),{recursive:true,force:true});
  }
  // Matching Tor paths and all Electron Mach-O files are combined by the
  // official merger. JS, media, notices and source archives stay shared.
  await makeUniversalApp({arm64AppPath:arm64App,x64AppPath:x64App,outAppPath:output});
  const inventory=[];
  async function inspect(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory())await inspect(filename);
    else if(entry.isFile()){
      const arches=await executableArchitectures(filename);
      if(arches.length){if(arches.join(',')!=='arm64,x64')throw new Error(`A native component is missing a Mac architecture: ${path.relative(output,filename)}`);inventory.push(path.relative(output,filename));}
    }
  }}
  await inspect(path.join(output,'Contents'));
  return {architectures:['arm64','x64'],machOBinaries:inventory,canvasInputSha256:bindingHashes};
}

/** Seal a newly merged development output without accessing a publisher identity. */
export async function sealDevelopmentMacApplication(app){
 const inventory=await signingInventory(app);const allowed=new Set([...inventory.binaries,...inventory.bundles]);
 await sign({app,identity:'-',identityValidation:false,platform:'darwin',type:'development',strictVerify:true,preAutoEntitlements:false,preEmbedProvisioningProfile:false,ignore:filename=>!allowed.has(filename),optionsForFile:filename=>({hardenedRuntime:false,entitlements:entitlementPath(filename,app)})});
 await run('/usr/bin/codesign',['--verify','--deep','--strict',app],{timeout:120000});
 for(const filename of inventory.binaries)await run('/usr/bin/codesign',['--verify','--strict',filename],{timeout:30000});
 return {signing:'development-ad-hoc',publisherSigned:false,notarized:false};
}
