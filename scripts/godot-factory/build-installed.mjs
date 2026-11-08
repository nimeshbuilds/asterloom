import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const tools=JSON.parse(await readFile(path.join(repo,'.qa/godot-factory-tools/tools.json'),'utf8'));
const platform=process.argv.find(arg=>arg.startsWith('--platform='))?.slice(11);
if(!['mac','windows'].includes(platform))throw Error('Choose --platform=mac or --platform=windows.');
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'build-player.mjs'),`--godot=${tools.godot}`,`--templates=${tools.templates}`,`--platform=${platform}`],{stdio:'inherit'});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(`Native build failed (${code}).`)));});
