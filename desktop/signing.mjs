import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sign} from '@electron/osx-sign';

const run=promisify(execFile);
const HERE=path.dirname(fileURLToPath(import.meta.url));
const MAGIC=new Set(['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']);
async function command(binary,args){return run(binary,args,{timeout:300000,maxBuffer:1024*1024});}
async function exists(filename){try{await fs.access(filename);return true;}catch{return false;}}

export async function signingInventory(app){
  const binaries=[];const bundles=[app];
  async function visit(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const filename=path.join(directory,entry.name);
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){
        if(/\.(app|framework)$/.test(entry.name))bundles.push(filename);
        await visit(filename);
      }else if(entry.isFile()){
        const handle=await fs.open(filename,'r');
        try{const bytes=Buffer.alloc(4);const {bytesRead}=await handle.read(bytes,0,4,0);if(bytesRead===4&&MAGIC.has(bytes.toString('hex')))binaries.push(filename);}
        finally{await handle.close();}
      }
    }
  }
  await visit(path.join(app,'Contents'));return {binaries,bundles};
}

export function entitlementPath(filename,app){
  const isElectronProcess=filename===app||/\.app\/Contents\/MacOS\/[^/]+$/.test(filename)||/Asterloom Helper(?: \([^)]+\))?\.app$/.test(filename);
  return path.join(HERE,'entitlements',isElectronProcess?'electron.plist':'native.plist');
}

/** Creates a separate signed candidate. Does not claim notarization or runtime validation. */
export async function signApplicationCopy({app,output,identity}){
  if(process.platform!=='darwin')throw new Error('Developer ID signing must run on macOS.');
  if(typeof identity!=='string'||!identity.trim())throw new Error('Pass an explicit Developer ID identity name or fingerprint.');
  const source=await fs.realpath(app);const target=path.resolve(output);
  if(!source.endsWith('.app')||!target.endsWith('.app'))throw new Error('Input and output must be .app bundles.');
  if(target===source||target.startsWith(source+path.sep))throw new Error('The signed candidate must be outside the original application.');
  if(await exists(target))throw new Error('The signed candidate already exists; choose a new output path.');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-sign-'));const candidate=path.join(temp,path.basename(target));let publication;
  try{
    console.log('Copying the application into local signing staging.');
    await fs.cp(source,candidate,{recursive:true,verbatimSymlinks:true,errorOnExist:true,force:false});
    // Only remove presentation metadata that prevents sealing this NEW copy.
    // Security metadata, including quarantine and provenance, is preserved.
    for(const name of ['com.apple.FinderInfo','com.apple.ResourceFork'])await command('/usr/bin/xattr',['-dr',name,candidate]);
    const gameManifest=path.join(candidate,'Contents','Resources','game-manifest.json');
    if(await exists(gameManifest)){const game=JSON.parse(await fs.readFile(gameManifest,'utf8'));await fs.writeFile(gameManifest,JSON.stringify({...game,signing:'developer-id',notarized:false},null,2));}
    const inventory=await signingInventory(candidate);const allowed=new Set([...inventory.binaries,...inventory.bundles]);
    console.log(`Signing ${inventory.binaries.length} Mach-O files and ${inventory.bundles.length} bundles with hardened runtime and secure timestamps.`);
    await sign({app:candidate,identity,platform:'darwin',type:'distribution',identityValidation:true,strictVerify:true,preAutoEntitlements:false,preEmbedProvisioningProfile:false,
      ignore:filename=>!allowed.has(filename),optionsForFile:filename=>({hardenedRuntime:true,entitlements:entitlementPath(filename,candidate)})});
    await command('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',candidate]);
    let appDetails='';
    for(const filename of [candidate,...inventory.binaries]){
      await command('/usr/bin/codesign',['--verify','--strict',filename]);
      const {stderr}=await command('/usr/bin/codesign',['--display','--verbose=4',filename]);
      if(!/Authority=Developer ID Application:/.test(stderr)||!/flags=.*runtime/.test(stderr)||!/^Timestamp=/m.test(stderr)||!/^TeamIdentifier=(?!not set).+/m.test(stderr))throw new Error(`Incomplete Developer ID signature: ${path.relative(candidate,filename)||path.basename(candidate)}`);
      if(filename===candidate)appDetails=stderr;
    }
    const report={format:'asterloom-signing-report',version:1,app:path.basename(target),signing:'developer-id',authority:appDetails.match(/^Authority=(.+)$/m)?.[1],teamIdentifier:appDetails.match(/^TeamIdentifier=(.+)$/m)?.[1],timestamp:appDetails.match(/^Timestamp=(.+)$/m)?.[1],hardenedRuntime:true,strictDeepVerification:true,machOBinaries:inventory.binaries.length,notarized:false,runtimeValidation:'pending',generatedAt:new Date().toISOString()};
    await fs.mkdir(path.dirname(target),{recursive:true});publication=await fs.mkdtemp(path.join(path.dirname(target),'.asterloom-signing-'));
    const staged=path.join(publication,path.basename(target));await fs.cp(candidate,staged,{recursive:true,verbatimSymlinks:true,errorOnExist:true,force:false});
    await command('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',staged]);
    await fs.rename(staged,target);await fs.writeFile(`${target}.signing.json`,JSON.stringify(report,null,2));
    console.log(`Signed candidate prepared: ${target}. Native/PDF/Tor validation and authenticated notarization remain separate steps.`);
    return {path:target,report};
  }finally{await fs.rm(temp,{recursive:true,force:true});if(publication)await fs.rm(publication,{recursive:true,force:true});}
}
