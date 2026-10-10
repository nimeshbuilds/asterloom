import {promises as fs} from 'node:fs';
import {copyNativeTree} from './copy-native-tree.mjs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const HERE=path.dirname(fileURLToPath(import.meta.url));
const MAGIC=new Set(['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']);
async function command(binary,args){return run(binary,args,{timeout:300000,maxBuffer:1024*1024});}
async function exists(filename){try{await fs.lstat(filename);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function signWithDeadline(config){
  return new Promise((resolve,reject)=>{
    // The separate process group lets a blocked Keychain request be stopped
    // together with its codesign child, without leaving background signing.
    const child=spawn(process.execPath,[path.join(HERE,'sign-worker.mjs'),JSON.stringify(config)],{stdio:['ignore','pipe','pipe'],detached:true});
    let stderr='';let timedOut=false;
    const kill=signal=>{try{if(child.pid)process.kill(-child.pid,signal);}catch{}};
    const deadline=setTimeout(()=>{timedOut=true;kill('SIGTERM');},180000);
    const forcedDeadline=setTimeout(()=>kill('SIGKILL'),185000);
    child.stdout.on('data',chunk=>process.stdout.write(chunk));
    child.stderr.on('data',chunk=>{if(stderr.length<8000)stderr+=chunk.toString();});
    child.on('error',error=>{clearTimeout(deadline);clearTimeout(forcedDeadline);reject(error);});
    child.on('close',code=>{clearTimeout(deadline);clearTimeout(forcedDeadline);if(timedOut)reject(new Error('Signing exceeded its 180-second bound. Check whether Keychain needs user interaction or the secure timestamp service is unavailable; no signed candidate was published.'));else if(code!==0)reject(new Error(`Developer ID signing failed (${code}): ${stderr.trim()}`));else resolve();});
  });
}

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
  const relative=path.relative(path.resolve(app),path.resolve(filename));
  // Exported games may rename the outer bundle, but retain these Electron
  // executable/helper names. Nested native apps must not inherit JIT access.
  const helpers=['Asterloom Helper','Asterloom Helper (Renderer)','Asterloom Helper (GPU)','Asterloom Helper (Plugin)'];
  const isElectronProcess=relative===''||relative===path.join('Contents','MacOS','Asterloom')||helpers.some(name=>{
    const bundle=path.join('Contents','Frameworks',`${name}.app`);
    return relative===bundle||relative===path.join(bundle,'Contents','MacOS',name);
  });
  return path.join(HERE,'entitlements',isElectronProcess?'electron.plist':'native.plist');
}

/** Creates a separate signed candidate. Does not claim notarization or runtime validation. */
export async function signApplicationCopy({app,output,identity}){
  if(process.platform!=='darwin')throw new Error('Developer ID signing must run on macOS.');
  if(typeof identity!=='string'||!identity.trim())throw new Error('Pass an explicit Developer ID identity name or fingerprint.');
  const source=await fs.realpath(app);const requestedTarget=path.resolve(output);
  if(!source.endsWith('.app')||!requestedTarget.endsWith('.app'))throw new Error('Input and output must be .app bundles.');
  if(requestedTarget===source||requestedTarget.startsWith(source+path.sep))throw new Error('The signed candidate must be outside the original application.');
  // Require a pre-existing output directory so resolving a symlink can never
  // create a subdirectory inside the original before containment is checked.
  let parent;try{parent=await fs.realpath(path.dirname(requestedTarget));}catch(error){if(error.code==='ENOENT')throw new Error('Create the output directory before signing.');throw error;}
  const target=path.join(parent,path.basename(requestedTarget));
  if(target===source||target.startsWith(source+path.sep))throw new Error('The signed candidate must be outside the original application.');
  if(await exists(target))throw new Error('The signed candidate already exists; choose a new output path.');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-sign-'));const candidate=path.join(temp,path.basename(target));let publication;
  try{
    console.log('Copying the application into local signing staging.');
    await copyNativeTree(source,candidate);
    // Only remove presentation metadata that prevents sealing this NEW copy.
    // Security metadata, including quarantine and provenance, is preserved.
    for(const name of ['com.apple.FinderInfo','com.apple.ResourceFork'])await command('/usr/bin/xattr',['-dr',name,candidate]);
    const gameManifest=path.join(candidate,'Contents','Resources','game-manifest.json');
    if(await exists(gameManifest)){const game=JSON.parse(await fs.readFile(gameManifest,'utf8'));await fs.writeFile(gameManifest,JSON.stringify({...game,signing:'developer-id',notarized:false},null,2));}
    const inventory=await signingInventory(candidate);
    console.log(`Signing ${inventory.binaries.length} Mach-O files and ${inventory.bundles.length} bundles with hardened runtime and secure timestamps.`);
    await signWithDeadline({app:candidate,identity,inventory});
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
    const staged=path.join(publication,path.basename(target));await copyNativeTree(candidate,staged);
    await command('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',staged]);
    await fs.rename(staged,target);await fs.writeFile(`${target}.signing.json`,JSON.stringify(report,null,2));
    console.log(`Signed candidate prepared: ${target}. Native/PDF/Tor validation and authenticated notarization remain separate steps.`);
    return {path:target,report};
  }finally{await fs.rm(temp,{recursive:true,force:true});if(publication)await fs.rm(publication,{recursive:true,force:true});}
}
