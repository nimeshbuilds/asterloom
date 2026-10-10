import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {WORLD_COMPOSITIONS,worldForScaffold} from '../src/data/worlds';
import {WORLD_ARTWORK,SCAFFOLD_ARTWORK,JUNIOR_SCAFFOLD_ARTWORK,worldArtworkFor} from '../src/lib/worldArtwork';
import {worldArtworkOverlayMarkup} from '../src/lib/worldIllustration';
describe('Decorative world art',()=>{
 it('keeps saved shared settings while new games receive the dedicated scene',()=>{
  const pairs=[['agent-workflow-studio','network','tool-routing-studio','adult'],['cloud-architecture-builder','network','cloud-systems-yard','adult'],['fault-diagnosis','console','inspection-outpost','adult'],['puppet-stories','junior-discovery','pocket-theater','3-5'],['step-train','junior-discovery','learning-railway','6-8']] as const;
  for(const [scaffold,old,current,age] of pairs){const world=worldForScaffold(scaffold);expect(worldArtworkFor(world,age).id).toBe(current);expect(worldArtworkFor(world,age,`${WORLD_ARTWORK[old].name}: Original description.`).id).toBe(old);expect(worldArtworkFor(world,age,'https://untrusted.example/image.png').id).toBe(current);}
  expect(worldArtworkFor(worldForScaffold('fault-diagnosis'),'3-5',`${WORLD_ARTWORK.console.name}: Adult setting.`).id).toBe('junior-discovery');
 });
 it('ships distinct decodable-size local PNG environments for the catalog',async()=>{
  const hashes=[];for(const id of Object.keys(WORLD_ARTWORK)){const bytes=await readFile(`public/assets/world-art/${id}.png`);expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(800);expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(360);hashes.push(createHash('sha256').update(bytes).digest('hex'));}expect(new Set(hashes).size).toBe(Object.keys(WORLD_ARTWORK).length);
 });
 it('maps every actual recipe and supported audience to bundled settings',()=>{
  expect(SCAFFOLDS).toHaveLength(75);expect(Object.keys(WORLD_ARTWORK)).toHaveLength(17);
  for(const scaffold of SCAFFOLDS)for(const age of ['3-5','6-8','9-11','12-14','15-17','adult']){
   const world=worldForScaffold(scaffold.id),art=worldArtworkFor(world,age);
   expect(art.assetPath).toBe(`/assets/world-art/${art.id}.png`);expect(art.purpose).toBe('decorative-fiction');
   expect(art.id).toBe(['3-5','6-8','9-11'].includes(age)?JUNIOR_SCAFFOLD_ARTWORK[scaffold.id]??(age==='9-11'?'junior-expedition':'junior-discovery'):SCAFFOLD_ARTWORK[scaffold.id]??world.layout);
  }
 });
 it('preserves distinct authored motifs for75 recipes over shared environments without altering model data',()=>{
  const before=JSON.stringify(WORLD_COMPOSITIONS);
  expect(new Set(WORLD_COMPOSITIONS.map(world=>worldArtworkOverlayMarkup(world))).size).toBe(75);
  for(const world of WORLD_COMPOSITIONS){const overlay=worldArtworkOverlayMarkup(world);expect(overlay).not.toMatch(/https?:|<script|<foreignObject|onload=/);expect(overlay.match(/<ellipse cy="40"/g)).toHaveLength(3);}
  expect(JSON.stringify(WORLD_COMPOSITIONS)).toBe(before);
 });
 it('keeps younger motifs more concrete and theme colors independent of the chosen environment',()=>{
  const world=worldForScaffold('process-reconstruction');expect(worldArtworkOverlayMarkup(world,'forest','3-5')).not.toBe(worldArtworkOverlayMarkup(world,'ocean','adult'));
  expect(worldArtworkFor(world,'unknown').id).toBe('trail');expect(worldArtworkOverlayMarkup(world,'forest','adult',false)).not.toContain('<ellipse');
 });
});
