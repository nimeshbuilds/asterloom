import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as openpgp from 'openpgp';import {loadTorVerificationKey} from './tor-verification-keys.mjs';
test('pinned public Tor keys verify the exact browser and source release manifests offline',async()=>{
 for(const [id,file]of [['torbrowser','sha256sums-signed-build.txt'],['dgoulet','tor-0.4.9.13.tar.gz.sha256sum']]){
  const key=await loadTorVerificationKey(id);assert.equal(key.isPrivate(),false);
  const data=await readFile(new URL(`./fixtures/tor/${file}`,import.meta.url));
  const signature=await openpgp.readSignature({armoredSignature:await readFile(new URL(`./fixtures/tor/${file}.asc`,import.meta.url),'utf8')});
  const result=await openpgp.verify({message:await openpgp.createMessage({binary:data}),signature,verificationKeys:key});assert.equal(result.signatures.length,1);await result.signatures[0].verified;
  data[0]^=1;const changed=await openpgp.verify({message:await openpgp.createMessage({binary:data}),signature,verificationKeys:key});await assert.rejects(changed.signatures[0].verified);
 }
});
test('changed verification-key input is rejected before parsing',async()=>{
 await assert.rejects(loadTorVerificationKey('torbrowser',{read:async()=>Buffer.from('changed')}),/bytes have changed/);
 await assert.rejects(loadTorVerificationKey('untrusted'),/Unknown Tor/);
});
