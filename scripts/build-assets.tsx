import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
import WorldArt,{BrandMark,THEMES} from '../src/components/WorldArt';
import {SCAFFOLDS} from '../src/data/scaffolds';
import WorldPreview from '../src/components/WorldPreview';
import {getDefaultAgeForScaffold,worldForScaffold} from '../src/data/worlds';
const dest='public/assets';await mkdir(`${dest}/brand`,{recursive:true});await mkdir(`${dest}/scaffolds`,{recursive:true});await mkdir(`${dest}/worlds`,{recursive:true});await mkdir(`${dest}/licenses`,{recursive:true});
const xmlns=(svg:string)=>svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
const logo=xmlns(renderToStaticMarkup(<BrandMark size={1024}/>));await writeFile(`${dest}/brand/icon.svg`,logo);
await writeFile(`${dest}/brand/icon.png`,new Resvg(logo,{fitTo:{mode:'width',value:1024}}).render().asPng());
const mark=logo.replace(/^<svg[^>]*>/,'<g transform="translate(4 4) scale(1.6)">').replace(/<\/svg>$/,'</g>');
await writeFile(`${dest}/brand/wordmark.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="86" viewBox="0 0 480 86">${mark}<text x="85" y="47" font-family="Georgia,serif" font-size="43" fill="#354136" letter-spacing="-1.5">Asterloom</text><text x="87" y="69" font-family="Arial,sans-serif" font-size="8.5" fill="#8c9981" letter-spacing="3">LEARNING, MADE PLAYABLE</text></svg>`);
for(const theme of THEMES){const svg=xmlns(renderToStaticMarkup(<WorldArt theme={theme.id} title={theme.name}/>));await writeFile(`${dest}/worlds/${theme.id}.svg`,svg);}
for(const s of SCAFFOLDS){const svg=xmlns(renderToStaticMarkup(<WorldPreview scaffoldId={s.id} theme={s.visual.scene} ageGroup={getDefaultAgeForScaffold(s)} title={`${s.name}: ${s.tagline}`}/>));await writeFile(`${dest}/scaffolds/${s.id}.svg`,svg);}
const iconset=`${dest}/brand/icon.iconset`;await mkdir(iconset,{recursive:true});for(const size of [16,32,128,256,512])for(const scale of [1,2])await writeFile(`${iconset}/icon_${size}x${size}${scale===2?'@2x':''}.png`,new Resvg(logo,{fitTo:{mode:'width',value:size*scale}}).render().asPng());
const manifest={brand:'Asterloom',version:2,worlds:THEMES.map(t=>({id:t.id,name:t.name,file:`worlds/${t.id}.svg`})),scaffolds:SCAFFOLDS.map(s=>({id:s.id,family:s.family,scene:s.visual.scene,motif:s.visual.motif,composition:worldForScaffold(s.id),file:`scaffolds/${s.id}.svg`})),music:{type:'CC0 recordings with deterministic synthesized fallbacks',count:10,source:'src/lib/musicRecordings.ts',credits:'licenses/MUSIC-CREDITS.md',manifest:'src/assets/music/manifest.json'}};await writeFile(`${dest}/manifest.json`,JSON.stringify(manifest,null,2));
for(const font of ['dm-sans','fraunces']){try{await copyFile(`node_modules/@fontsource-variable/${font}/LICENSE`,`${dest}/licenses/${font}-OFL.txt`);}catch{}}
await writeFile(`${dest}/licenses/ASSETS.md`,'# Asterloom asset permissions\n\nThe Asterloom geometric illustrations and synthesized musical fallbacks were authored for this project. The ten included music recordings are by Juhani Junkala / SubspaceAudio and hernandack, released under CC0 1.0; original credits and license references are in MUSIC-CREDITS.md. Asterloom original geometric illustrations, world compositions and synthesized musical fallbacks are covered by the Asterloom Personal Learning License in the root LICENSE file. Personal/family learning and free personal sharing are permitted under that license; commercial use requires a separate agreement. Third-party recordings, fonts and icons retain their original licenses, including their independent redistribution permissions. Brand marks identify the studio; this does not grant ownership of the Asterloom brand.\n\nDM Sans and Fraunces fonts use the SIL Open Font License; notices are included alongside this file. Lucide interface icons are ISC licensed. External source material remains subject to its own rights.\n');
console.log(`Prepared logo, app icon, six worlds, ${SCAFFOLDS.length} scaffold illustrations, and asset manifest.`);
