import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
let html=await readFile('dist/index.html','utf8');
for(const match of [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {const js=await readFile(path.join('dist',match[1]),'utf8');html=html.replace(match[0],()=>`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`);}
for(const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {const css=await readFile(path.join('dist',match[1]),'utf8');html=html.replace(match[0],()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>`);}
await writeFile('dist/index.html',html);
// The HTML document is an internal Electron renderer, not a distributable game.
await rm('dist/runtime.html',{force:true});
await rm('release/Asterloom-Studio.html',{force:true});
console.log('Prepared the bundled desktop renderer. Standalone HTML distribution is disabled.');
