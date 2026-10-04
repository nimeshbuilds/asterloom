import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createCredentialStore} from './credential-store.mjs';

function secureFixture(){const key=randomBytes(32);return {isEncryptionAvailable:()=>true,encryptString:text=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);},decryptString:bytes=>{const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}};}
test('account storage writes encrypted private bytes, reloads and clears without leaving temporary files',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-account-test-'));const filename=path.join(directory,'ai-account.enc'),storage=createCredentialStore({filename,safeStorage:secureFixture()});
  try{assert.equal(await storage.load(),null);const account={accessToken:'secret-access-token',refreshToken:'secret-refresh-token'};await storage.save(account);assert.deepEqual(await storage.load(),account);const bytes=await fs.readFile(filename);assert.equal(bytes.includes(Buffer.from(account.accessToken)),false);if(process.platform!=='win32')assert.equal((await fs.stat(filename)).mode&0o777,0o600);assert.deepEqual(await fs.readdir(directory),['ai-account.enc']);await storage.save(null);assert.equal(await storage.load(),null);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('unavailable encryption and Linux plaintext backend never persist credentials',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-account-test-'));const filename=path.join(directory,'ai-account.enc');
  try{for(const safeStorage of [{isEncryptionAvailable:()=>false},{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'basic_text'}]){const storage=createCredentialStore({filename,safeStorage,platform:'linux'});await assert.rejects(()=>storage.save({token:'must-not-write'}),/cannot be saved as plain text/);assert.deepEqual(await fs.readdir(directory),[]);}}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('invalid ciphertext is reported without exposing credential or native error text',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-account-test-'));const filename=path.join(directory,'ai-account.enc');
  try{await fs.writeFile(filename,'not ciphertext');const storage=createCredentialStore({filename,safeStorage:secureFixture()});await assert.rejects(()=>storage.load(),error=>error.message==='The saved account could not be decrypted. Sign out and sign in again.');await storage.save(null);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
