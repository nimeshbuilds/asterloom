import {useEffect,useState} from 'react';
import {Globe,LoaderCircle,ShieldCheck} from 'lucide-react';
import type {TorStatus} from '../App';

export default function TorSettings({onError}:{onError:(message:string)=>void}){
 const [status,setStatus]=useState<TorStatus|null>(null),[busy,setBusy]=useState(false);
 const desktop=window.asterloomDesktop;
 useEffect(()=>{if(!desktop?.getTorStatus)return;let active=true;const refresh=()=>void desktop.getTorStatus().then(s=>{if(active)setStatus(s);}).catch(()=>{});refresh();const timer=setInterval(refresh,3000);return()=>{active=false;clearInterval(timer);};},[desktop]);
 const enabled=!!status&& !['disabled','unavailable','not-installed','stopped'].includes(status.status);
 async function toggle(){if(!desktop?.setTorEnabled)return;setBusy(true);try{setStatus(await desktop.setTorEnabled(!enabled));}catch(e){onError((e as Error).message);}finally{setBusy(false);}}
 return <div className="soft-card tor-settings"><Globe size={24}/><h3>Private challenge rooms</h3><p>Connect two desktop games through a Tor onion address. Players compete on their own schedules; the room host stays open to sync results.</p>{desktop?<><button className="button secondary full" disabled={busy||status?.installed===false} onClick={()=>void toggle()}>{busy?<LoaderCircle size={16} className="spin"/>:<ShieldCheck size={16}/>} {enabled?'Turn Tor off':'Enable private connectivity'}</button><p className="small" role="status">{!status?'Checking connectivity…':status.status==='disabled'?'Tor is off. Turn it on when you want to host or join an onion room.':`${status.status}${typeof status.bootstrap==='number'&&status.bootstrap<100?` · ${status.bootstrap}% connected`:''}`}</p>{status?.hostname&&<label className="small">Your host address<input readOnly aria-label="Your Tor room host address" value={`http://${status.hostname}`} onFocus={e=>e.target.select()}/></label>}{status?.error&&<p className="small" role="alert">{status.error}</p>}{status?.installed===false&&<p className="small">This application build does not include the Tor runtime.</p>}</>:<p className="small muted">Open the desktop application to enable Tor connectivity. Browser games can use an HTTPS room service.</p>}</div>;
}
