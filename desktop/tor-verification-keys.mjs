import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as openpgp from 'openpgp';

const pins={
 torbrowser:{fingerprint:'EF6E286DDA85EA2A4BA7DE684E2C6E8793298290',sha256:'8c2d63cac51ea4a0245b29d87a9bc84128944d1881cacfb05b48a07663e9d595'},
 dgoulet:{fingerprint:'B74417EDDF22AC9F9E90F49142E86A2A11F48D36',sha256:'0f92ce8833666e5a71b8b938d5dfaf8a58885a5f9024e68be65476b7f12fd0b5'},
};

/** Public release-verification input, pinned independently of network availability. */
export async function loadTorVerificationKey(id,{read=readFile}={}){
 const pin=pins[id];if(!pin)throw new Error('Unknown Tor verification key.');
 const bytes=await read(new URL(`./verification-keys/${id}.asc`,import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new Error('Pinned Tor public key bytes have changed.');
 const key=await openpgp.readKey({armoredKey:Buffer.from(bytes).toString('utf8')});
 if(key.isPrivate()||key.getFingerprint().toUpperCase()!==pin.fingerprint)throw new Error('Pinned Tor public-key fingerprint mismatch.');
 return key;
}
