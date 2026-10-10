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
 'tool-routing-studio':{id:'tool-routing-studio',name:'The tool routing studio'},
 'cloud-systems-yard':{id:'cloud-systems-yard',name:'The cloud systems yard'},
 'inspection-outpost':{id:'inspection-outpost',name:'The inspection outpost'},
 'pocket-theater':{id:'pocket-theater',name:'The pocket puppet theater'},
 'learning-railway':{id:'learning-railway',name:'The little learning railway'},
} as const;
export type WorldArtworkId=keyof typeof WORLD_ARTWORK;
export const SCAFFOLD_ARTWORK:Readonly<Record<string,WorldArtworkId>>={
 'process-reconstruction':'process-waterworks','classification-workshop':'sorting-foundry','concept-map-repair':'systems-observatory',
 'agent-workflow-studio':'tool-routing-studio','cloud-architecture-builder':'cloud-systems-yard','fault-diagnosis':'inspection-outpost',
};
export const JUNIOR_SCAFFOLD_ARTWORK:Readonly<Record<string,WorldArtworkId>>={
 'puppet-stories':'pocket-theater','step-train':'learning-railway',
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
 'tool-routing-studio':'Teal channels link brass workstations around a routing dais in a glass atelier overlooking a distant city.',
 'cloud-systems-yard':'Ivory towers, suspended copper conduits and docking gantries frame a sky harbor above the clouds.',
 'inspection-outpost':'Circular brass inspection lenses and signal instruments overlook misty mountains from a stone outpost.',
 'pocket-theater':'Coral curtains, felt leaves and warm lanterns frame a wooden puppet stage in a cozy garden treehouse.',
 'learning-railway':'A wooden railway crosses low garden bridges between colorful station shelters and small empty wagons.',
};
export function worldArtworkFor(world:Pick<WorldComposition,'layout'> & Partial<Pick<WorldComposition,'id'>>,ageGroup='adult',savedStorySetting?:string) {
 const mature=['12-14','15-17','adult'].includes(ageGroup);
 const junior=ageGroup==='3-5'||ageGroup==='6-8'||ageGroup==='9-11';
 const juniorDefault=ageGroup==='9-11'?'junior-expedition':'junior-discovery';
 const current:WorldArtworkId=junior?(world.id&&JUNIOR_SCAFFOLD_ARTWORK[world.id]||juniorDefault):mature&&world.id&&SCAFFOLD_ARTWORK[world.id]||world.layout;
 // A saved story may refer to the shared setting used before dedicated art was
 // shipped. Keep that setting in play without rewriting paid teaching or taking
 // an arbitrary path from model/source text. Age boundaries remain in force.
 const eligible:WorldArtworkId[]=junior?[current,juniorDefault]:[current,world.layout];
 const saved=eligible.find(id=>savedStorySetting===WORLD_ARTWORK[id].name||savedStorySetting?.startsWith(`${WORLD_ARTWORK[id].name}: `));
 const id=saved??current;
 return {...WORLD_ARTWORK[id],assetPath:`/assets/world-art/${id}.png`,purpose:'decorative-fiction' as const};
}
