import {readFile,mkdir,writeFile,rename,readdir,unlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(await readFile(path.join(root,'scripts/retrieval-assets.lock.json'),'utf8'));
const require=createRequire(path.join(root,'package.json'));
async function packageRoot(name){let dir=path.dirname(require.resolve(name));for(let i=0;i<6;i++){try{const data=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));if(data.name===name)return{dir,data};}catch{}dir=path.dirname(dir);}throw new Error(`Cannot locate ${name}`);}
const transformers=await packageRoot('@huggingface/transformers'),ort=await packageRoot('onnxruntime-web');
if(transformers.data.version!==lock.transformersVersion||ort.data.version!==lock.onnxRuntimeVersion)throw new Error('Local inference dependencies differ from the audited artifact lock. Update and verify the lock deliberately.');
const destination=path.join(root,'public/retrieval');
async function put(relative,bytes,file){if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Integrity check failed: ${relative}`);const target=path.join(destination,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target+'.partial',bytes);await rename(target+'.partial',target);}
for(const file of lock.files){
 const relative=`models/${lock.revision}/${lock.model}/${file.path}`,target=path.join(destination,relative);let bytes;
 try{bytes=await readFile(target);if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)bytes=undefined;}catch{}
 if(!bytes){try{const prior=await readFile(path.join(destination,`models/${lock.model}/${file.path}`));if(prior.length===file.size&&createHash('sha256').update(prior).digest('hex')===file.sha256)bytes=prior;}catch{}}
 if(!bytes){console.log(`Downloading pinned model asset ${file.path}`);const response=await fetch(`https://huggingface.co/${lock.model}/resolve/${lock.revision}/${file.path}`,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error(`Download failed: ${response.status} ${file.path}`);bytes=Buffer.from(await response.arrayBuffer());}
 await put(relative,bytes,file);
}
await rm(path.join(destination,'models',lock.model),{recursive:true,force:true});
// Remove obsolete generated runtime variants after a deliberate lock update.
for(const name of await readdir(path.join(destination,'wasm')).catch(()=>[]))if(/^ort-wasm[^/]+\.(?:mjs|wasm)$/.test(name)&&!lock.runtimeFiles.some(file=>file.path===name))await unlink(path.join(destination,'wasm',name));
for(const file of lock.runtimeFiles)await put(`wasm/${file.path}`,await readFile(path.join(ort.dir,'dist',file.path)),file);
if(lock.javascript.destination!=='transformers.web.min.js')await rm(path.join(destination,'transformers.web.min.js'),{force:true});
await put(lock.javascript.destination,await readFile(path.join(transformers.dir,lock.javascript.path)),lock.javascript);
for(const file of lock.licenses){let bytes;try{const cached=await readFile(path.join(destination,file.destination));if(cached.length===file.size&&createHash('sha256').update(cached).digest('hex')===file.sha256)bytes=cached;}catch{}if(!bytes){if(file.url){const response=await fetch(file.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('License download failed.');bytes=Buffer.from(await response.arrayBuffer());}else bytes=await readFile(path.join(transformers.dir,file.path));}await put(file.destination,bytes,file);}
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(lock,null,2));
await writeFile(path.join(destination,'NOTICE.txt'),`Asterloom local authoring retrieval\n\nModel: ${lock.model}\nImmutable revision: ${lock.revision}\nOriginal model: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2\nConverted model: https://huggingface.co/${lock.model}\nModel license: Apache License 2.0 (LICENSE-APACHE-2.0.txt). Model card accompanies the weights.\n\nTransformers.js ${lock.transformersVersion}: Hugging Face, Apache License 2.0.\nONNX Runtime Web ${lock.onnxRuntimeVersion}: Microsoft, MIT License (LICENSE-ONNX-RUNTIME.txt).\nRuntime JavaScript and WASM are a matched, integrity-verified pair.\n\nThe small English-focused model matches passages by meaning. Retrieval is a suggestion, not factual verification. Source text remains on the learner's device; no hosted inference is used. This asset bundle is for authoring; exported games never require it to play.\n`);
console.log('Local retrieval bundle verified: pinned q8 model, matching WASM, licenses and manifest.');
