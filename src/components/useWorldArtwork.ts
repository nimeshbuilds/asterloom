import {useEffect,useState} from 'react';
/** Browser cache shares local image bytes across previews. A failed/missing asset
 * leaves the existing vector world usable, including unsupported rendering hosts. */
export function useWorldArtwork(assetPath:string,enabled=true) {
 const [state,setState]=useState<{path:string;status:'loading'|'ready'|'fallback'}>({path:assetPath,status:'loading'});
 useEffect(()=>{
  if(!enabled||typeof Image==='undefined'){setState({path:assetPath,status:'fallback'});return;}
  let current=true;const image=new Image();setState({path:assetPath,status:'loading'});
  image.onload=()=>{if(current)setState({path:assetPath,status:image.naturalWidth>0&&image.naturalHeight>0?'ready':'fallback'});};
  image.onerror=()=>{if(current)setState({path:assetPath,status:'fallback'});};image.src=assetPath;
  return()=>{current=false;image.onload=null;image.onerror=null;};
 },[assetPath,enabled]);
 return state.path===assetPath?state.status:'loading';
}
