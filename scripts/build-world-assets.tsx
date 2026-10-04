import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile} from 'node:fs/promises';
import WorldPreview from '../src/components/WorldPreview';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {getDefaultAgeForScaffold,WORLD_COMPOSITIONS,validateWorldCatalog} from '../src/data/worlds';
const errors=validateWorldCatalog();if(errors.length)throw new Error(errors.join('\n'));
await mkdir('public/assets/scaffolds',{recursive:true});
for(const scaffold of SCAFFOLDS){const svg=renderToStaticMarkup(<WorldPreview scaffoldId={scaffold.id} ageGroup={getDefaultAgeForScaffold(scaffold)} theme={scaffold.visual.scene} title={`${scaffold.name}: ${scaffold.tagline}`}/>).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');await writeFile(`public/assets/scaffolds/${scaffold.id}.svg`,svg);}
await writeFile('public/assets/world-compositions.json',JSON.stringify({version:1,description:'75 authored settings composed from seven layouts and thirty vector objects. Live learning objects and rules are bound separately to reviewed material.',worlds:WORLD_COMPOSITIONS},null,2));
console.log(`Prepared ${SCAFFOLDS.length} source-independent world illustrations; no learning diagrams or factual claims were generated.`);
