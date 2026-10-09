import type {WorldComposition} from '../data/worlds';
/** Bundled environments enrich 75 authored object compositions; these are
 * fictional settings, never diagrams or evidence extracted from learning sources. */
export const WORLD_ARTWORK = {
 trail:{id:'trail',name:'Expedition routes'},
 network:{id:'network',name:'The connection observatory'},
 workbench:{id:'workbench',name:'The maker’s workbench'},
 stage:{id:'stage',name:'The story pavilion'},
 garden:{id:'garden',name:'The discovery conservatory'},
 archive:{id:'archive',name:'The evidence archive'},
 console:{id:'console',name:'The systems station'},
 'junior-discovery':{id:'junior-discovery',name:'The little discovery world'},
 'junior-expedition':{id:'junior-expedition',name:'The junior expedition'},
 'process-waterworks':{id:'process-waterworks',name:'The turning waterworks'},
 'sorting-foundry':{id:'sorting-foundry',name:'The sorting foundry'},
 'systems-observatory':{id:'systems-observatory',name:'The systems observatory'},
} as const;
export type WorldArtworkId=keyof typeof WORLD_ARTWORK;
export const SCAFFOLD_ARTWORK:Readonly<Record<string,WorldArtworkId>>={
 'process-reconstruction':'process-waterworks','classification-workshop':'sorting-foundry','concept-map-repair':'systems-observatory',
};
export const ARTWORK_SETTINGS:Record<WorldArtworkId,string>={
 trail:'Stone bridges and paths connect islands, a harbor and a distant observatory.',
 network:'Luminous conduits connect modular platforms beneath a glass canopy.',
 workbench:'A wooden and brass atelier holds modular pieces and crafted tools.',
 stage:'An open-air story pavilion has arches, indigo curtains and warm spotlights.',
 garden:'A discovery conservatory has plants, water channels and stepping stones.',
 archive:'An evidence archive has sweeping shelves, brass balconies and reading tables.',
 console:'A cliffside analysis laboratory has circular instrument stations and panoramic windows.',
 'junior-discovery':'A sunny storybook garden has rounded treehouses, toy blocks and a gentle stream.',
 'junior-expedition':'An adventure island has a treehouse laboratory, explorer harbor and discovery trails.',
 'process-waterworks':'Stone and bronze canal platforms are joined by turquoise channels and mechanical sluices.',
 'sorting-foundry':'Brass conveyor tracks branch into collection bays in a glass and copper foundry.',
 'systems-observatory':'Circular platforms and illuminated bridges surround a brass astrolabe in an astronomical atrium.',
};
export function worldArtworkFor(world:Pick<WorldComposition,'layout'> & Partial<Pick<WorldComposition,'id'>>,ageGroup='adult') {
 const mature=['12-14','15-17','adult'].includes(ageGroup);
 const id:WorldArtworkId=ageGroup==='3-5'||ageGroup==='6-8'?'junior-discovery':ageGroup==='9-11'?'junior-expedition':mature&&world.id&&SCAFFOLD_ARTWORK[world.id]||world.layout;
 return {...WORLD_ARTWORK[id],assetPath:`/assets/world-art/${id}.png`,purpose:'decorative-fiction' as const};
}
