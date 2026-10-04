import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
let html=await readFile('dist/index.html','utf8');
for(const match of [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {const js=await readFile(path.join('dist',match[1]),'utf8');html=html.replace(match[0],()=>`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`);}
for(const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {const css=await readFile(path.join('dist',match[1]),'utf8');html=html.replace(match[0],()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>`);}
await writeFile('dist/index.html',html);await writeFile('dist/runtime.html',html);await mkdir('release',{recursive:true});await writeFile('release/Asterloom-Studio.html',html);console.log('Created self-contained studio and export runtime.');
