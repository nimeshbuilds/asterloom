import {useEffect,useRef} from 'react';
import {asterTransitionFeedback} from '../lib/music';
import type {AsterTransitionCue} from '../lib/actionFeedback';

/** The sound follows actual playback, not a connection effect or restored state.
 * A stalled, canceled or late video never queues a sound to play afterward. */
export default function AsterTransitionVideo({direction,ageGroup,onFinish}:{direction:AsterTransitionCue;ageGroup?:string;onFinish:()=>void}){
 const attempted=useRef(false),cancelSound=useRef<(()=>void)|undefined>(undefined);
 const stop=()=>{cancelSound.current?.();cancelSound.current=undefined;};
 useEffect(()=>stop,[]);
 return <video className="aster-transformation-video" data-direction={direction} src={`/assets/aster/transitions/${direction}.webm`} muted autoPlay playsInline preload="auto" tabIndex={-1}
  onPlaying={event=>{if(attempted.current)return;attempted.current=true;if(document.documentElement.dataset.reduced==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(event.currentTarget.currentTime<=.25)cancelSound.current=asterTransitionFeedback(direction,ageGroup);}}
  onPause={stop} onWaiting={stop} onSeeking={stop}
  onEnded={()=>{stop();onFinish();}} onError={()=>{stop();onFinish();}}/>;
}
