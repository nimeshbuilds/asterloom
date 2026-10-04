import {promises as fs} from 'node:fs';
import path from 'node:path';

/** Playwright adds Electron flags itself, so use an isolated exec wrapper to
 * select the non-default universal slice without changing the app bundle. */
export async function nativeTestExecutable(binary,directory,arch=process.env.ASTERLOOM_SMOKE_ARCH){
  if(!arch)return binary;
  if(process.platform!=='darwin'||!['arm64','x64'].includes(arch)||!binary)throw new Error('An explicit Mac app and arm64 or x64 test architecture are required.');
  const wrapper=path.join(directory,`launch-${arch}.sh`);
  const quoted="'"+binary.replaceAll("'","'\\''")+"'";
  await fs.writeFile(wrapper,`#!/bin/sh\nexec /usr/bin/arch -${arch==='x64'?'x86_64':'arm64'} ${quoted} "$@"\n`,{mode:0o700});
  return wrapper;
}
