import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {signApplicationCopy,entitlementPath} from './signing.mjs';

test('signing rejects missing identity before accessing or mutating an app',{skip:process.platform!=='darwin'},async()=>{
  await assert.rejects(()=>signApplicationCopy({app:'/missing.app',output:'/candidate.app',identity:''}),/explicit Developer ID/);
});

test('signing cannot follow output-directory symlinks into the original app',{skip:process.platform!=='darwin'},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asterloom-sign-path-'));
  try{
    const app=path.join(directory,'Original.app');await fs.mkdir(app);const alias=path.join(directory,'alias');await fs.symlink(app,alias);
    await assert.rejects(()=>signApplicationCopy({app,identity:'test-only',output:path.join(alias,'new','Candidate.app')}),/Create the output directory/);
    await assert.rejects(()=>fs.lstat(path.join(app,'new')),error=>error.code==='ENOENT');
    await assert.rejects(()=>signApplicationCopy({app,identity:'test-only',output:path.join(alias,'Candidate.app')}),/outside the original/);
    assert.deepEqual(await fs.readdir(app),[]);
    const broken=path.join(directory,'Candidate.app');await fs.symlink(path.join(directory,'missing'),broken);
    await assert.rejects(()=>signApplicationCopy({app,identity:'test-only',output:broken}),/already exists/);
    assert.equal((await fs.lstat(broken)).isSymbolicLink(),true);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('only Electron processes receive a JIT exception',async()=>{
  const app='/tmp/Asterloom.app';
  assert.match(entitlementPath(app,app),/electron.plist$/);
  assert.match(entitlementPath(`${app}/Contents/MacOS/Asterloom`,app),/electron.plist$/);
  for(const name of ['Asterloom Helper','Asterloom Helper (Renderer)','Asterloom Helper (GPU)','Asterloom Helper (Plugin)']){
    const bundle=path.join(app,'Contents','Frameworks',`${name}.app`);
    assert.match(entitlementPath(bundle,app),/electron.plist$/);
    assert.match(entitlementPath(path.join(bundle,'Contents','MacOS',name),app),/electron.plist$/);
  }
  const godot='Contents/Resources/app/desktop/vendor/godot-factory/runtime/Asterloom Native Factory.app';
  for(const suffix of ['Contents/Resources/app/desktop/vendor/tor/runtime/tor/tor','Contents/Resources/app/native/canvas.node','Contents/Frameworks/Electron Framework.framework',godot,`${godot}/Contents/MacOS/Asterloom Native Factory`])assert.match(entitlementPath(`${app}/${suffix}`,app),/native.plist$/);
  const electron=await fs.readFile(entitlementPath(app,app),'utf8');assert.deepEqual([...electron.matchAll(/<key>([^<]+)<\/key>/g)].map(match=>match[1]),['com.apple.security.cs.allow-jit']);
  const native=await fs.readFile(entitlementPath(`${app}/Contents/native.node`,app),'utf8');assert.doesNotMatch(native,/<key>/);
});

test('renamed exports preserve Electron entitlements without granting them to nested or lookalike apps',()=>{
  const app='/tmp/My Learning Game.app';
  assert.match(entitlementPath(app,app),/electron.plist$/);
  assert.match(entitlementPath(`${app}/Contents/MacOS/Asterloom`,app),/electron.plist$/);
  const nested='Contents/Resources/Asterloom Helper (Renderer).app';
  for(const suffix of [
    'Contents/MacOS/Other Tool',
    'Contents/Frameworks/Other.app',
    'Contents/Frameworks/Other.app/Contents/MacOS/Other',
    'Contents/Frameworks/Asterloom Helper (Other).app',
    'Contents/Frameworks/Asterloom Helper.app/Contents/MacOS/Other',
    nested,`${nested}/Contents/MacOS/Asterloom Helper (Renderer)`,
    '../Other.app/Contents/MacOS/Asterloom',
  ])assert.match(entitlementPath(path.join(app,suffix),app),/native.plist$/,suffix);
});
