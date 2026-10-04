import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as openpgp from 'openpgp';
import {loadTorVerificationKey} from '../desktop/tor-verification-keys.mjs';

const root=path.resolve(import.meta.dirname,'..');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const git=(cwd:string,...args:string[])=>execFileSync('git',['-c','core.attributesFile=',...args],{cwd,stdio:['ignore','pipe','pipe']});

async function checkout(parent:string,files:Map<string,Buffer>,attributes?:Buffer){
 const repository=path.join(parent,attributes?'protected':'unprotected');
 await mkdir(repository);git(repository,'init','--quiet');git(repository,'config','core.autocrlf','true');git(repository,'config','core.safecrlf','false');
 for(const [name,bytes]of files){const destination=path.join(repository,name);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);}
 if(attributes)await writeFile(path.join(repository,'.gitattributes'),attributes);
 git(repository,'add','--all');
 const output=path.join(parent,attributes?'protected-checkout':'unprotected-checkout');await mkdir(output);
 git(repository,'checkout-index','--all','--force',`--prefix=${output.replaceAll('\\','/')}/`);
 return{repository,output};
}

describe('byte-pinned release inputs across Git checkouts',()=>{
 it('preserves exact licensed and signed payloads with Windows autocrlf without weakening their verification',async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'asterloom-pinned-checkout-'));
  try{
   const ocr=JSON.parse(await readFile(path.join(root,'scripts/ocr-assets.lock.json'),'utf8'));
   const noticePins=JSON.parse(await readFile(path.join(root,'scripts/licenses/notice-sources.json'),'utf8'));
   const names=[ocr.dataLicense.path,...Object.values(noticePins.fallbacks).map((pin:any)=>pin.path),noticePins.cc0.path,'public/assets/licenses/MUSIC-CREDITS.md','public/assets/licenses/Juhani-Junkala-INFO.txt',
    'desktop/verification-keys/torbrowser.asc','desktop/verification-keys/dgoulet.asc',
    'desktop/fixtures/tor/sha256sums-signed-build.txt','desktop/fixtures/tor/sha256sums-signed-build.txt.asc',
    'desktop/fixtures/tor/tor-0.4.9.13.tar.gz.sha256sum','desktop/fixtures/tor/tor-0.4.9.13.tar.gz.sha256sum.asc'];
   const files=new Map<string,Buffer>();for(const name of names)files.set(name,await readFile(path.join(root,name)));
   // Demonstrate the same class of failure: checkout conversion alters pinned bytes.
   const unprotected=await checkout(temporary,new Map([[ocr.dataLicense.path,files.get(ocr.dataLicense.path)!]]));
   const converted=await readFile(path.join(unprotected.output,ocr.dataLicense.path));
   expect(converted.includes(Buffer.from('\r\n'))).toBe(true);
   expect(sha(converted)).not.toBe(ocr.dataLicense.sha256);

   const binary=Buffer.from([0,13,10,255,10,42]);files.set('fixtures/binary-control.bin',binary);files.set('fixtures/text-control.txt',Buffer.from('first\nsecond\n'));
   const protectedCheckout=await checkout(temporary,files,await readFile(path.join(root,'.gitattributes')));
   for(const [name,original]of files){
    const committed=git(protectedCheckout.repository,'show',`:${name}`),restored=await readFile(path.join(protectedCheckout.output,name));
    expect(sha(committed),`Git blob ${name}`).toBe(sha(original));
    expect(sha(restored),`Windows-style checkout ${name}`).toBe(sha(original));
   }
   expect(sha(await readFile(path.join(protectedCheckout.output,ocr.dataLicense.path)))).toBe(ocr.dataLicense.sha256);
   for(const pin of [...Object.values(noticePins.fallbacks),noticePins.cc0] as Array<{path:string;sha256:string}>)expect(sha(await readFile(path.join(protectedCheckout.output,pin.path)))).toBe(pin.sha256);
   // Exercise the production raw-key checksum and real detached signatures on
   // the checkout bytes, not just an attribute-string or source-code assertion.
   for(const [id,file]of [['torbrowser','sha256sums-signed-build.txt'],['dgoulet','tor-0.4.9.13.tar.gz.sha256sum']]){
    const key=await loadTorVerificationKey(id,{read:()=>readFile(path.join(protectedCheckout.output,`desktop/verification-keys/${id}.asc`))});
    const data=await readFile(path.join(protectedCheckout.output,'desktop/fixtures/tor',file));
    const signature=await openpgp.readSignature({armoredSignature:await readFile(path.join(protectedCheckout.output,'desktop/fixtures/tor',`${file}.asc`),'utf8')});
    const result=await openpgp.verify({message:await openpgp.createMessage({binary:data}),signature,verificationKeys:key});
    expect(result.signatures).toHaveLength(1);await expect(result.signatures[0].verified).resolves.toBe(true);
   }
  }finally{await rm(temporary,{recursive:true,force:true});}
 },30000);
});
