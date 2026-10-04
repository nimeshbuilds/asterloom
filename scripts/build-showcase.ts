import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {demoNotebooks} from '../src/data/demo';
import {serializePackage,exportOfflineHtml} from '../src/lib/package';

const notebook=demoNotebooks().find(n=>n.id==='demo-network')!;
notebook.id='asterloom-showcase-systems-v1';
notebook.title='The Systems Expedition';
notebook.description='Rebuild a process, connect a system, apply an access policy and equip a small lab. Eight hands-on activities, with every rule attached to its source.';
await mkdir('release/examples',{recursive:true});
await writeFile('release/examples/The-Systems-Expedition.learnpack',serializePackage(notebook));
await writeFile('release/examples/The-Systems-Expedition.html',exportOfflineHtml(notebook,await readFile('dist/runtime.html','utf8')));
console.log('Prepared one editable notebook and its complete offline game in release/examples.');
