import {useEffect,useRef,useState} from 'react';
import {Globe,LoaderCircle,RefreshCw,ShieldCheck} from 'lucide-react';
import {torCanConnect,torStatusMessage,type TorState} from '../lib/roomClient';

export default function TorSettings({onError}:{onError:(message:string)=>void}){
 const [status,setStatus]=useState<TorState|null>(null),[busy,setBusy]=useState(false),[statusError,setStatusError]=useState('');
 const desktop=window.asterloomDesktop,mounted=useRef(true),refreshing=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(!desktop?.getTorStatus)return;let active=true;
  const refresh=async()=>{if(refreshing.current)return;refreshing.current=true;try{const state=await desktop.getTorStatus();if(active){setStatus(state);setStatusError('');}}catch{if(active)setStatusError('The transport status could not be read. Keep the app open; status will refresh automatically.');}finally{refreshing.current=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>{active=false;clearInterval(timer);};
 },[desktop]);
 const enabled=!!status&&['starting','connecting','connected','ready'].includes(status.status);
 async function toggle(){if(!desktop?.setTorEnabled)return;setBusy(true);try{const state=await desktop.setTorEnabled(!enabled);if(mounted.current){setStatus(state);setStatusError('');window.dispatchEvent(new CustomEvent('asterloom:tor-preference',{detail:{enabled:!enabled}}));if(state.error)onError(state.error);}}catch(error){if(mounted.current)onError(error instanceof Error?error.message:'Tor could not change its connection state.');}finally{if(mounted.current)setBusy(false);}}
 return <div className="soft-card tor-settings"><Globe size={24}/><h3>Private challenge rooms</h3><p>Connect two desktop games through a Tor onion address. Players compete on their own schedules; the room host stays open to sync results.</p>{desktop?<><button className="button secondary full" disabled={busy||!status||status.installed===false} onClick={()=>void toggle()}>{busy?<LoaderCircle size={16} className="spin"/>:status?.status==='error'||status?.status==='stopped'?<RefreshCw size={16}/>:<ShieldCheck size={16}/>} {enabled?'Turn Tor off':status?.status==='error'||status?.status==='stopped'?'Retry private connectivity':'Enable private connectivity'}</button><p className="small" role="status">{torStatusMessage(status)}</p>{statusError&&<p className="small" role="alert">{statusError}</p>}{status?.hostname&&torCanConnect(status)&&<label className="small">Your host address · {status.reachabilityVerified?'reachability checked':'publication not yet verified'}<input readOnly aria-label="Your Tor room host address" value={`http://${status.hostname}`} onFocus={e=>e.target.select()}/></label>}{status?.error&&<p className="small" role="alert">{status.error}</p>}</>:<p className="small muted">Open the desktop application to enable Tor connectivity. Browser games can use an HTTPS room service.</p>}</div>;
}
