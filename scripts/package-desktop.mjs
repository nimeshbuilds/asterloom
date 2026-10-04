import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packager} from '@electron/packager';
import {build} from 'esbuild';
import {prepareTorRuntime} from '../desktop/prepare-tor.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const platformArg=process.argv.find(value=>value.startsWith('--platform='))?.split('=')[1];
const allTargets=[{platform:'darwin',arch:'arm64'},{platform:'darwin',arch:'x64'},{platform:'win32',arch:'x64'}];
const targets=platformArg==='mac'?allTargets.slice(0,2):platformArg==='mac-arm64'?[allTargets[0]]:platformArg==='mac-intel'?[allTargets[1]]:platformArg==='windows'?[allTargets[2]]:allTargets;
const manifest=JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8'));
const electronVersion=JSON.parse(await fs.readFile(path.join(ROOT,'node_modules','electron','package.json'),'utf8')).version;
await fs.access(path.join(ROOT,'dist','index.html'));
await fs.mkdir(path.join(ROOT,'desktop','generated'),{recursive:true});
await build({entryPoints:[path.join(ROOT,'src','lib','package.ts')],bundle:true,platform:'node',target:'es2022',format:'esm',outfile:path.join(ROOT,'desktop','generated','package-validation.mjs')});
const out=path.join(ROOT,'release','desktop');await fs.mkdir(out,{recursive:true});
const builds=[];
for(const target of targets){
  const icon=path.join(ROOT,'public','assets','brand',target.platform==='darwin'?'icon.icns':'icon.ico');
  let hasIcon=false;try{await fs.access(icon);hasIcon=true;}catch{}
  console.log(`Packaging Asterloom ${target.platform}/${target.arch} (development unsigned)…`);
  const result=await packager({dir:ROOT,name:'Asterloom',executableName:'Asterloom',appBundleId:'com.asterloom.studio',appVersion:manifest.version,buildVersion:manifest.version,electronVersion,...target,out,overwrite:true,prune:true,asar:false,icon:hasIcon?icon:undefined,appCopyright:'Asterloom',ignore:[/^\/(?:release|deliverables|\.qa|\.git|test-results|playwright-report|tests|docs|src|scripts)(?:\/|$)/,/^\/server\/\.data(?:\/|$)/,/^\/desktop\/(?:vendor|dev-resources|download-tor\.mjs|.*\.test\.mjs)(?:\/|$)/,/^\/(?:build_product_plan\.py|.*\.log|\.env.*|package-lock\.json|tsconfig.*|vite\.config.*|playwright\.config.*)$/],afterCopy:[async({buildPath})=>{const file=path.join(buildPath,'package.json');const current=JSON.parse(await fs.readFile(file,'utf8'));current.main='desktop/main.mjs';await fs.writeFile(file,JSON.stringify(current,null,2));const tor=path.join(ROOT,'desktop','vendor','tor',`${target.platform}-${target.arch}`);try{await fs.access(tor);await prepareTorRuntime(tor,target.platform);await fs.cp(tor,path.join(buildPath,'desktop','vendor','tor','runtime'),{recursive:true});await fs.copyFile(path.join(ROOT,'desktop','vendor','tor','manifest.json'),path.join(buildPath,'desktop','vendor','tor','manifest.json'));}catch(error){if(error.code!=='ENOENT')throw error;console.log('Tor runtime not downloaded; this build will report it unavailable.');}}]});
  for(const directory of result){const targetInfo={directory,platform:target.platform,arch:target.arch,version:manifest.version,electronVersion,signing:'development-unsigned',notarized:false,generatedAt:new Date().toISOString()};await fs.writeFile(path.join(directory,'ASTERLOOM-RELEASE.json'),JSON.stringify(targetInfo,null,2));builds.push(targetInfo);console.log(`Created ${directory}`);}
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({builds},null,2));
console.log('Desktop packaging complete. macOS signing/notarization and Windows Authenticode signing have not been performed.');
