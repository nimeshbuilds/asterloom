import {build} from 'esbuild';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Inspect the actual browser dependency graph without writing a build or contacting a registry. */
export async function browserPackages(){
 const result=await build({entryPoints:['src/main.tsx'],absWorkingDir:ROOT,write:false,bundle:true,metafile:true,platform:'browser',format:'esm',target:'es2022',outdir:path.join(ROOT,'.qa','notice-inventory-unused'),jsx:'automatic',loader:{'.woff2':'dataurl','.woff':'dataurl','.ogg':'dataurl','.svg':'dataurl','.png':'dataurl','.jpg':'dataurl'},plugins:[{name:'notice-raw-imports',setup(builder){builder.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));builder.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
 const found=new Map();
 for(const input of Object.keys(result.metafile.inputs)){
  const absolute=path.resolve(ROOT,input),normalized=absolute.replaceAll('\\','/'),offset=normalized.lastIndexOf('/node_modules/');if(offset<0)continue;
  const tail=normalized.slice(offset+14).split('/'),name=tail[0].startsWith('@')?tail.slice(0,2).join('/'):tail[0],directory=normalized.slice(0,offset+14)+name;
  if(found.has(directory))continue;const metadata=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));found.set(directory,{directory,metadata});
 }
 return [...found.values()].sort((a,b)=>`${a.metadata.name}@${a.metadata.version}`.localeCompare(`${b.metadata.name}@${b.metadata.version}`,'en'));
}
export async function collectBrowserNotices(){
 const pins=JSON.parse(await readFile(path.join(ROOT,'scripts/licenses/notice-sources.json'),'utf8')),lock=JSON.parse(await readFile(path.join(ROOT,'package-lock.json'),'utf8')),packages=[];
 const graph=(await browserPackages()).map(item=>({...item,scope:'browser library or asset'}));
 for(const name of ['vite','rolldown']){const directory=path.join(ROOT,'node_modules',name);graph.push({directory,metadata:JSON.parse(await readFile(path.join(directory,'package.json'),'utf8')),scope:'generated browser runtime helpers'});}
 for(const {directory,metadata:p,scope} of graph){
  const names=(await readdir(directory,{withFileTypes:true})).filter(f=>f.isFile()&&/^(?:licen[sc]e|notice|copying|copyright|third-party-license)(?:\.[\w.-]+)?$/i.test(f.name)).map(f=>f.name).sort();const texts=[];
  for(const name of names){let bytes=await readFile(path.join(directory,name));let label=name;if(p.name==='vite'&&name==='LICENSE.md'){const text=bytes.toString('utf8'),boundary=text.indexOf('# Licenses of bundled dependencies');if(boundary<0)throw new Error('Vite core license boundary changed; review the generated helper notice.');bytes=Buffer.from(text.slice(0,boundary));label='LICENSE.md · complete Vite core license';}texts.push({name:label,origin:`${p.name}@${p.version}/${name}`,sha256:hash(bytes),text:bytes.toString('utf8')});}
  if(!texts.length){const pin=pins.fallbacks[`${p.name}@${p.version}`];if(!pin)throw new Error(`Missing license text for browser dependency ${p.name}@${p.version}. Resolve its exact upstream notice before release.`);const record=Object.entries(lock.packages).find(([key,value])=>key.endsWith(`/node_modules/${p.name}`)||key===`node_modules/${p.name}`)?.[1];if(!record||record.version!==p.version||record.integrity!==pin.packageIntegrity)throw new Error(`License fallback is not bound to the installed ${p.name} release.`);const bytes=await readFile(path.join(ROOT,pin.path));if(hash(bytes)!==pin.sha256)throw new Error('Pinned upstream license changed.');texts.push({name:'LICENSE',origin:pin.url,sha256:pin.sha256,text:bytes.toString('utf8')});}
  packages.push({name:p.name,version:p.version,scope,license:typeof p.license==='string'?p.license:p.license?.type??'See included notice',notices:texts});
 }
 const assets=[];
 for(const [name,filename] of [['Music credits','public/assets/licenses/MUSIC-CREDITS.md'],['Juhani Junkala original note','public/assets/licenses/Juhani-Junkala-INFO.txt']]){const bytes=await readFile(path.join(ROOT,filename));assets.push({name,origin:filename,sha256:hash(bytes),text:bytes.toString('utf8')});}
 const cc0=await readFile(path.join(ROOT,pins.cc0.path));if(hash(cc0)!==pins.cc0.sha256)throw new Error('Pinned CC0 text changed.');assets.push({name:'CC0 1.0 Universal · music',origin:pins.cc0.url,sha256:pins.cc0.sha256,text:cc0.toString('utf8')});
 return{format:'asterloom-browser-notices',version:1,scope:'Libraries, generated runtime helpers, fonts, icons and music carried by the self-contained browser studio and its exported games. Separate native binaries and optional authoring models retain their accompanying notices.',packages,assets};
}
export async function verifyBrowserNotices(){const expected=await collectBrowserNotices(),current=JSON.parse(await readFile(path.join(ROOT,'src/data/thirdPartyNotices.generated.json'),'utf8'));if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('Browser third-party notices are stale. Run node scripts/generate-browser-notices.mjs, review the exact license changes, then commit the updated notice data.');return expected;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const data=process.argv.includes('--check')?await verifyBrowserNotices():await collectBrowserNotices();if(!process.argv.includes('--check'))await writeFile(path.join(ROOT,'src/data/thirdPartyNotices.generated.json'),JSON.stringify(data,null,2)+'\n');console.log(`${process.argv.includes('--check')?'Verified':'Prepared'} ${data.packages.length} exact package/helper notices, fonts/icons and original music credits.`);}
