const localFailure=message=>Object.assign(new Error(message),{status:422,publicMessage:true});

/** A download may be long, but headers and stalled progress are bounded. */
export function transferWatchdog(parent, {headerMs=30000, idleMs=120000}={}) {
 const controller=new AbortController();let timer;
 const reset=milliseconds=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(localFailure('The local download stopped making progress. Check the connection and retry to resume.')),milliseconds);timer.unref?.();};
 reset(headerMs);
 return {signal:parent?AbortSignal.any([parent,controller.signal]):controller.signal,
  headers:()=>reset(headerMs),touch:()=>reset(idleMs),abort:error=>controller.abort(error),close:()=>clearTimeout(timer),get stalled(){return controller.signal.aborted;}};
}
