import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {packager} from '@electron/packager';
import {build} from 'esbuild';
import {prepareTorRuntime} from '../desktop/prepare-tor.mjs';
import {prepareNativeDependencies,installNativeDependencies} from '../desktop/native-dependencies.mjs';
import {prepareMediaRuntime} from './prepare-media-runtime.mjs';
import {mergeMacApplications,sealDevelopmentMacApplication} from '../desktop/universal.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const platformArg=process.argv.find(value=>value.startsWith('--platform='))?.split('=')[1];
if(platformArg&&!['mac','mac-universal','mac-arm64','mac-intel','windows'].includes(platformArg))throw new Error('Choose --platform=mac or --platform=windows.');
const includeMac=platformArg!=='windows',includeWindows=!platformArg||platformArg==='windows';
if(includeMac&&process.platform!=='darwin')throw new Error('Build the universal Mac application on macOS. Use --platform=windows on other hosts.');
const manifest=JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8'));
const electronVersion=JSON.parse(await fs.readFile(path.join(ROOT,'node_modules','electron','package.json'),'utf8')).version;
await fs.access(path.join(ROOT,'dist','index.html'));
await fs.mkdir(path.join(ROOT,'desktop','generated'),{recursive:true});
await build({entryPoints:[path.join(ROOT,'src','lib','package.ts')],bundle:true,platform:'node',target:'es2022',format:'esm',outfile:path.join(ROOT,'desktop','generated','package-validation.mjs')});
const out=path.join(ROOT,'release','desktop');await fs.mkdir(out,{recursive:true});
const builds=[];
async function ensureTor(target){
  const directory=path.join(ROOT,'desktop','vendor','tor',`${target.platform}-${target.arch}`);
  try{await fs.access(path.join(directory,'tor',target.platform==='win32'?'tor.exe':'tor'));await fs.access(path.join(ROOT,'desktop','vendor','tor','sources','SOURCE-PROVENANCE.json'));await fs.access(path.join(ROOT,'desktop','vendor','tor','manifest.json'));}
  catch{console.log('Resolving the verified bundled Tor runtime…');const selected=target.platform==='win32'?'windows':target.arch==='arm64'?'mac-arm64':'mac-intel';await promisify(execFile)(process.execPath,[path.join(ROOT,'desktop','download-tor.mjs'),`--platform=${selected}`],{timeout:300000,maxBuffer:2*1024*1024});}
  await fs.access(path.join(directory,'tor',target.platform==='win32'?'tor.exe':'tor'));await prepareTorRuntime(directory,target.platform);return directory;
}
async function packageTarget(target,destination){
  const nativeDependency=await prepareNativeDependencies(ROOT,target),tor=await ensureTor(target),media=await prepareMediaRuntime(target);
  const icon=path.join(ROOT,'public','assets','brand',target.platform==='darwin'?'icon.icns':'icon.ico');
  console.log(`Preparing the ${target.platform==='darwin'?'Mac':'Windows'} runtime (${target.arch})…`);
  const result=await packager({dir:ROOT,name:'Asterloom',executableName:'Asterloom',appBundleId:'com.asterloom.studio',appVersion:manifest.version,buildVersion:manifest.version,electronVersion,...target,out:destination,overwrite:true,prune:true,asar:false,icon,appCopyright:'Asterloom',afterPrune:[async({buildPath})=>installNativeDependencies(buildPath,nativeDependency)],ignore:[/^\/node_modules\/(?:\.vite|\.cache|\.vite-temp)(?:\/|$)/,/^\/(?:release|deliverables|\.qa|\.git|test-results|playwright-report|tests|docs|src|scripts)(?:\/|$)/,/^\/server\/\.data(?:\/|$)/,/^\/desktop\/(?:vendor|dev-resources|(?:download-tor|prepare-tor|native-dependencies|universal|testing|signing|sign-worker)\.mjs|.*\.test\.mjs)(?:\/|$)/,/^\/(?:build_product_plan\.py|.*\.log|\.env.*|package-lock\.json|tsconfig.*|vite\.config.*|playwright\.config.*)$/],afterCopy:[async({buildPath})=>{
    const file=path.join(buildPath,'package.json'),current=JSON.parse(await fs.readFile(file,'utf8'));current.main='desktop/main.mjs';await fs.writeFile(file,JSON.stringify(current,null,2));
    await fs.cp(media,path.join(buildPath,'desktop','vendor','media','runtime'),{recursive:true,filter:filename=>path.basename(filename)!=='BUILD.json'});
    await fs.cp(path.join(ROOT,'desktop','vendor','media','sources'),path.join(buildPath,'desktop','vendor','media','sources'),{recursive:true});
    await fs.cp(tor,path.join(buildPath,'desktop','vendor','tor','runtime'),{recursive:true});
    await fs.copyFile(path.join(ROOT,'desktop','vendor','tor','manifest.json'),path.join(buildPath,'desktop','vendor','tor','manifest.json'));
    await fs.cp(path.join(ROOT,'desktop','vendor','tor','sources'),path.join(buildPath,'desktop','vendor','tor','sources'),{recursive:true});
  }]});
  return {directory:result[0],nativeDependency:{name:nativeDependency.name,version:nativeDependency.version,integrity:nativeDependency.integrity}};
}
async function recordBuild(info){
  const distribution=JSON.parse(await fs.readFile(path.join(ROOT,'desktop','distribution.json'),'utf8'));
  const record={...info,distributionMode:distribution.mode,version:manifest.version,electronVersion,signing:info.platform==='darwin'?'development-ad-hoc':'development-unsigned',notarized:false,generatedAt:new Date().toISOString(),included:['Electron and Node runtime','complete studio and offline game runtime','PDF, DOCX, PPTX, XLSX and EPUB extraction libraries','native PDF canvas binding','verified Tor runtime and source notices','FFmpeg 9.0.2 LGPL decoder and whisper.cpp 1.9.4 with exact corresponding sources','streaming original media store and recording archives','local Tesseract OCR runtime and English, Spanish, French, German recognition data'],optionalNotBundled:['Whisper speech models: verified managed first-use download, then offline reuse','Official Codex, Claude Code and Grok Build engines: verified managed installation when the user selects a connection']};
  await fs.copyFile(path.join(ROOT,'LICENSE'),path.join(info.directory,'ASTERLOOM-LICENSE.txt'));
  await fs.writeFile(path.join(info.directory,'ASTERLOOM-RELEASE.json'),JSON.stringify(record,null,2));builds.push(record);console.log(`Created ${info.directory}`);
}
if(includeMac){
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-universal-inputs-'));
  try{
    // Resolve both archives before copying so shared provenance is identical.
    await ensureTor({platform:'darwin',arch:'arm64'});await ensureTor({platform:'darwin',arch:'x64'});
    await prepareMediaRuntime({platform:'darwin',arch:'arm64'});await prepareMediaRuntime({platform:'darwin',arch:'x64'});
    const arm64=await packageTarget({platform:'darwin',arch:'arm64'},temporary),x64=await packageTarget({platform:'darwin',arch:'x64'},temporary);
    const merged=path.join(temporary,'Asterloom.app');
    const universal=await mergeMacApplications({arm64App:path.join(arm64.directory,'Asterloom.app'),x64App:path.join(x64.directory,'Asterloom.app'),output:merged});
    await sealDevelopmentMacApplication(merged);
    // Free the disposable thin inputs before publishing/signing the larger app.
    await fs.rm(arm64.directory,{recursive:true,force:true});await fs.rm(x64.directory,{recursive:true,force:true});
    const directory=path.join(out,'Asterloom-darwin-universal');await fs.mkdir(directory,{recursive:true});
    await fs.rm(path.join(directory,'Asterloom.app'),{recursive:true,force:true});await fs.rename(merged,path.join(directory,'Asterloom.app'));
    await recordBuild({directory,platform:'darwin',arch:'universal',universal,nativeDependencies:[arm64.nativeDependency,x64.nativeDependency]});
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
}
if(includeWindows){const packaged=await packageTarget({platform:'win32',arch:'x64'},out);await recordBuild({...packaged,platform:'win32',arch:'x64'});}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({builds},null,2));
console.log('Desktop packaging complete. Release signing and notarization are separate steps.');
