import {worldForScaffold} from '../data/worlds';
import {worldBackdropMarkup,worldArtworkOverlayMarkup} from '../lib/worldIllustration';
import {worldArtworkFor} from '../lib/worldArtwork';
import {useWorldArtwork} from './useWorldArtwork';
/** Illustrated setting only: source evidence and factual diagrams belong to the activity. */
export default function WorldPreview({scaffoldId,theme='islands',ageGroup='adult',title,className=''}:{scaffoldId?:string;theme?:string;ageGroup?:string;title?:string;className?:string}){
 const world=worldForScaffold(scaffoldId),art=worldArtworkFor(world,ageGroup),status=useWorldArtwork(art.assetPath);
 return <svg className={`world-art world-preview ${className}`} viewBox="0 0 800 360" role="img" aria-label={title??`${world.name}, illustrated setting for ${world.domain}`} data-world-art={art.id} data-art-status={status}>
  <g dangerouslySetInnerHTML={{__html:worldBackdropMarkup(world,theme,ageGroup)}}/>
  {status==='ready'&&<><image href={art.assetPath} width="800" height="360" preserveAspectRatio="xMidYMid slice"/><g dangerouslySetInnerHTML={{__html:worldArtworkOverlayMarkup(world,theme,ageGroup)}}/></>}
 </svg>;
}
