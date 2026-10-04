import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyNativeTree,copyNativeFile} from './copy-native-tree.mjs';
const run=promisify(execFile);
async function temporary(fn){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-native-copy-'));try{await fn(folder);}finally{await fs.rm(folder,{recursive:true,force:true});}}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const xattr=async(name,file)=>(await run('/usr/bin/xattr',['-px',name,file])).stdout.replace(/\s/g,'');

test('native-tree copy prunes old media and preserves independent files, modes and symlink text',async()=>temporary(async root=>{
 const source=path.join(root,'source'),target=path.join(root,'copy');await fs.mkdir(path.join(source,'Contents','Resources','media-assets'),{recursive:true});await fs.mkdir(path.join(source,'Contents','MacOS'));
 await fs.writeFile(path.join(source,'Contents','MacOS','Asterloom'),'runtime',{mode:0o755});await fs.writeFile(path.join(source,'Contents','Resources','media-assets','private'),'unrelated media');
 await fs.symlink('../MacOS/Asterloom',path.join(source,'Contents','Resources','relative'));await fs.symlink(path.join(root,'absent'),path.join(source,'dangling'));
 await copyNativeTree(source,target,{exclude:['Contents/Resources/media-assets']});
 assert.equal(await fs.readFile(path.join(target,'Contents','MacOS','Asterloom'),'utf8'),'runtime');assert.equal(await fs.readlink(path.join(target,'Contents','Resources','relative')),'../MacOS/Asterloom');assert.equal(await fs.readlink(path.join(target,'dangling')),path.join(root,'absent'));
 await assert.rejects(fs.lstat(path.join(target,'Contents','Resources','media-assets')),error=>error.code==='ENOENT');
 if(process.platform!=='win32')assert.equal((await fs.stat(path.join(target,'Contents','MacOS','Asterloom'))).mode&0o777,0o755);
 assert.notEqual((await fs.stat(path.join(source,'Contents','MacOS','Asterloom'))).ino,(await fs.stat(path.join(target,'Contents','MacOS','Asterloom'))).ino);
 await fs.writeFile(path.join(target,'Contents','MacOS','Asterloom'),'edited');assert.equal(await fs.readFile(path.join(source,'Contents','MacOS','Asterloom'),'utf8'),'runtime');
}));

test('copy rejects existing and source-contained destinations without touching them',async()=>temporary(async root=>{
 const source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'original'),'safe');
 await assert.rejects(copyNativeTree(source,source),/outside/);await assert.rejects(copyNativeTree(source,path.join(source,'copy')),/outside/);
 const alias=path.join(root,'alias');await fs.symlink(source,alias);await assert.rejects(copyNativeTree(source,path.join(alias,'copy')),/outside/);
 const existing=path.join(root,'existing');await fs.mkdir(existing);await fs.writeFile(path.join(existing,'keep'),'do not change');await assert.rejects(copyNativeTree(source,existing),/already exists/);
 await assert.rejects(copyNativeTree(source,path.join(root,'invalid'),{exclude:['..']}),/descendants/);assert.deepEqual(await fs.readdir(source),['original']);assert.equal(await fs.readFile(path.join(existing,'keep'),'utf8'),'do not change');
 const file=path.join(root,'existing-file');await fs.writeFile(file,'preserve');await assert.rejects(copyNativeFile(path.join(source,'original'),file),/already exists/);assert.equal(await fs.readFile(file,'utf8'),'preserve');
}));

test('macOS filtered ancestors and cloned subtrees retain quarantine, custom xattrs and ACLs',{skip:process.platform!=='darwin'},async()=>temporary(async root=>{
 const source=path.join(root,'source'),target=path.join(root,'copy');await fs.mkdir(path.join(source,'Contents','Resources','media-assets'),{recursive:true});const file=path.join(source,'Contents','runtime');await fs.writeFile(file,'runtime',{mode:0o750});
 const locations=[source,path.join(source,'Contents'),path.join(source,'Contents','Resources'),file];
 for(const location of locations){await run('/usr/bin/xattr',['-w','com.apple.quarantine','0081;66ffffee;Asterloom-copy-test;',location]);await run('/usr/bin/xattr',['-w','com.asterloom.copy-test','retained',location]);}
 await run('/bin/chmod',['+a','everyone allow readattr,readextattr',path.join(source,'Contents')]);
 await copyNativeTree(source,target,{exclude:['Contents/Resources/media-assets']});
 for(const location of locations){const copied=path.join(target,path.relative(source,location));for(const attribute of ['com.apple.quarantine','com.asterloom.copy-test'])assert.equal(await xattr(attribute,copied),await xattr(attribute,location));}
 const acl=file=>run('/bin/ls',['-lde',file]).then(result=>result.stdout.split('\n').filter(line=>/^\s*\d+:/.test(line)));
 assert.deepEqual(await acl(path.join(target,'Contents')),await acl(path.join(source,'Contents')));
}));

test('macOS copies share APFS blocks, then destination edits detach without mutating the source',{skip:process.platform!=='darwin'},async()=>temporary(async root=>{
 const source=path.join(root,'source');await fs.mkdir(source);const file=path.join(source,'bytes'),bytes=randomBytes(8*1024*1024);await fs.writeFile(file,bytes);let handle=await fs.open(file,'r');await handle.sync();await handle.close();
 const result=await copyNativeTree(source,path.join(root,'copy'));assert.equal(result.method,'macos-clone-or-copy');const copied=path.join(root,'copy','bytes'),selected=path.join(root,'selected');await copyNativeFile(file,selected);
 // A diagnostic test tool only, never a production dependency. F_LOG2PHYS_EXT
 // directly verifies shared extents; timing/free-space estimates cannot do that.
 const physical=async files=>JSON.parse((await run('/usr/bin/python3',['-c','import os,fcntl,struct,sys,json\nout=[]\nfor p in sys.argv[1:]:\n fd=os.open(p,os.O_RDONLY)\n try: out.append(struct.unpack("=Iqq",fcntl.fcntl(fd,65,struct.pack("=Iqq",0,4096,0)))[2])\n finally: os.close(fd)\nprint(json.dumps(out))',...files])).stdout);
 const before=await physical([file,copied,selected]);assert.ok(before[0]>0);assert.equal(before[0],before[1],'tree copy must share source blocks on APFS');assert.equal(before[0],before[2],'recording copy must share source blocks on APFS');
 assert.notEqual((await fs.stat(file)).ino,(await fs.stat(copied)).ino);assert.equal(hash(await fs.readFile(copied)),hash(bytes));
 handle=await fs.open(copied,'r+');await handle.write(Buffer.from([bytes[0]^255]),0,1,0);await handle.sync();await handle.close();
 const after=await physical([file,copied]);assert.notEqual(after[0],after[1]);assert.equal(hash(await fs.readFile(file)),hash(bytes));assert.equal(hash(await fs.readFile(selected)),hash(bytes));
}));
