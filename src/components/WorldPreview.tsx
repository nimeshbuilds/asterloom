import { worldForScaffold } from '../data/worlds';
import { worldBackdropMarkup } from '../lib/worldIllustration';
/** Uses the same authored composition as the live scene; it is an illustrated setting, not a learning diagram. */
export default function WorldPreview({scaffoldId,theme='islands',ageGroup='adult',title,className=''}:{scaffoldId?:string;theme?:string;ageGroup?:string;title?:string;className?:string}){const world=worldForScaffold(scaffoldId);return <svg className={`world-art world-preview ${className}`} viewBox="0 0 800 360" role="img" aria-label={title??`${world.name}, illustrated setting for ${world.domain}`}><g dangerouslySetInnerHTML={{__html:worldBackdropMarkup(world,theme,ageGroup)}}/></svg>;}
