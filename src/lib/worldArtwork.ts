import type {WorldComposition} from '../data/worlds';
/** Nine decorative environments enrich 75 authored object compositions; these are
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
} as const;
export type WorldArtworkId=keyof typeof WORLD_ARTWORK;
export function worldArtworkFor(world:Pick<WorldComposition,'layout'>,ageGroup='adult') {
 const id:WorldArtworkId=ageGroup==='3-5'||ageGroup==='6-8'?'junior-discovery':ageGroup==='9-11'?'junior-expedition':world.layout;
 return {...WORLD_ARTWORK[id],assetPath:`/assets/world-art/${id}.png`,purpose:'decorative-fiction' as const};
}
