import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

/** Account tokens live outside the application bundle and never travel in exports. */
export function createCredentialStore({filename,safeStorage,platform=process.platform}){
  function encryption(){
    if(!safeStorage.isEncryptionAvailable()||(platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text'))throw new Error('Secure account storage is unavailable on this computer. Sign-in credentials cannot be saved as plain text.');
  }
  return {
    async load(){
      let bytes;try{const stat=await fs.stat(filename);if(stat.size>1024*1024)throw new Error('The saved account file is too large. Sign out and sign in again.');bytes=await fs.readFile(filename);}catch(error){if(error.code==='ENOENT')return null;throw error;}
      encryption();
      try{const value=JSON.parse(safeStorage.decryptString(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new Error('The saved account could not be decrypted. Sign out and sign in again.');}
    },
    async save(value){
      if(value===null){await fs.rm(filename,{force:true});return;}
      encryption();if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The account state must be an object.');
      const text=JSON.stringify(value);if(Buffer.byteLength(text)>512*1024)throw new Error('The account state is too large.');
      const encrypted=safeStorage.encryptString(text);await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
      const temporary=filename+'.'+randomUUID()+'.tmp';
      try{await fs.writeFile(temporary,encrypted,{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true});}
    },
  };
}
