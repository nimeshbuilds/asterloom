import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Copy,Globe2,LoaderCircle,LogOut,RefreshCw,Send,ShieldCheck,Trophy,Users,WifiOff} from 'lucide-react';
import type {Notebook} from '../types';
import {stableHash} from '../lib/utils';

export interface RoomResult {missionId:string;score:number;maxScore:number;correct?:number;total?:number;durationMs?:number;completedAt?:string}
interface QueuedResult extends RoomResult {eventId:string;roomId:string}
interface RoomSession {roomId:string;playerId:string;playerToken:string;inviteCode?:string;relay:string;packHash:string}
interface Standing {playerId:string;playerName:string;score:number;missionsCompleted:number;isYou:boolean}
interface Room {roomId:string;notebookId:string;notebookTitle:string;packHash:string;standings:Standing[];revision:number;trust:string;missions:{id:string;maxScore:number}[]}
interface RoomReply extends Room {playerId:string;playerToken:string;inviteCode?:string}
const messageOf=(error:unknown)=>error instanceof Error?error.message:'The room could not be reached.';
const fingerprint=(notebook:Notebook)=>stableHash(JSON.stringify({cards:notebook.cards.map(card=>[card.id,card.prompt,card.answer,card.options]),activities:notebook.activities||[],scaffolds:notebook.scaffoldIds})).toString(36);

interface TorState {installed:boolean;status:string;bootstrap?:number;hostname?:string;proxyConfigured?:boolean;error?:string}
const roomStorageKey=(notebook:Notebook)=>`asterloom:rooms:${notebook.id}`;
const missionIdsFor=(notebook:Notebook)=>[...new Set([...(notebook.scaffoldIds.length?notebook.scaffoldIds:['practice']),...(notebook.activities||[]).map(activity=>activity.id)])];

/** Call when a mission completes, even if the multiplayer dialog is closed. */
export function enqueueRoomResult(notebook:Notebook,result:RoomResult):{queued:boolean;reason?:string}{
  const key=roomStorageKey(notebook);
  try{
    const saved=localStorage.getItem(key);if(!saved)return {queued:false};
    const current=JSON.parse(saved) as RoomSession;
    if(!current?.roomId||!current.playerToken)return {queued:false};
    if(current.packHash!==fingerprint(notebook))return {queued:false,reason:'This notebook has changed. Create a new room or use the shared revision to sync this mission.'};
    if(!missionIdsFor(notebook).includes(result.missionId))return {queued:false,reason:'This mission does not belong to the shared notebook.'};
    if(!Number.isFinite(result.score)||!Number.isFinite(result.maxScore)||result.maxScore<=0)return {queued:false,reason:'This mission score is invalid.'};
    const completedAt=result.completedAt||new Date().toISOString();
    const eventId=`result-${stableHash(JSON.stringify([current.playerId,result.missionId,result.score,result.maxScore,completedAt])).toString(36)}`;
    const stored=JSON.parse(localStorage.getItem(`${key}:outbox`)||'[]');const outbox:QueuedResult[]=Array.isArray(stored)?stored:[];
    if(!outbox.some(item=>item.roomId===current.roomId&&item.eventId===eventId)){
      outbox.push({...result,eventId,roomId:current.roomId,score:Math.max(0,Math.min(1000,Math.round(result.score/result.maxScore*1000))),maxScore:1000,completedAt});
      localStorage.setItem(`${key}:outbox`,JSON.stringify(outbox));
    }
    window.dispatchEvent(new CustomEvent('asterloom:room-result',{detail:{notebookId:notebook.id}}));
    return {queued:true};
  }catch{return {queued:false,reason:'Your multiplayer result could not be saved. Export a progress backup before closing this game.'};}
}
function invitationText(code:string,relay:string){return relay?`AL1.${btoa(JSON.stringify({code,relay})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`:code;}
function parseInvitation(value:string):{code:string;relay?:string}{
  const trimmed=value.trim();if(!trimmed.startsWith('AL1.'))return {code:trimmed};
  try{if(trimmed.length>4096)throw new Error();const data=JSON.parse(atob(trimmed.slice(4).replace(/-/g,'+').replace(/_/g,'/')));if(typeof data.code!=='string'||data.code.length>200||typeof data.relay!=='string')throw new Error();return {code:data.code,relay:normalizeRelay(data.relay)};}catch{throw new Error('This invitation could not be read. Ask the host to copy it again.');}
}

function normalizeRelay(value:string):string {
  if(!value.trim())return '';
  let url:URL;try{url=new URL(value);}catch{throw new Error('Enter a complete service address, such as https://your-service.example.');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const onion=/^[a-z2-7]{56}\.onion$/.test(url.hostname);
  if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw new Error('Use an http or https service address without credentials, a query, or a fragment.');
  if(url.protocol==='http:'&&!local&&!onion)throw new Error('Remote services need HTTPS. Localhost and Tor onion addresses may use HTTP.');
  return url.origin;
}

async function roomRequest<T>(route:string,relay:string,body?:unknown,token?:string):Promise<T> {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),relay.includes('.onion')?60000:12000);
  try{
    const response=await fetch(`${relay}${route}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    let data;try{data=await response.json();}catch{throw new Error('The multiplayer service is not available here. Open this notebook in the native app or start the local service.');}
    if(!response.ok)throw new Error(data.error||'The room request failed.');return data as T;
  }catch(error){if(error instanceof TypeError || (error instanceof Error&&error.name==='AbortError'))throw new Error('The room service is unreachable. Saved results will retry when you reconnect.');throw error;}
  finally{clearTimeout(timer);}
}

export default function Rooms({notebook,onError,result}:{notebook:Notebook;onError:(message:string)=>void;result?:RoomResult}){
  const key=roomStorageKey(notebook);
  const [session,setSession]=useState<RoomSession|null>(null),[room,setRoom]=useState<Room|null>(null),[playerName,setPlayerName]=useState(''),[invite,setInvite]=useState(''),[relay,setRelay]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[connected,setConnected]=useState(false),[status,setStatus]=useState(''),[pending,setPending]=useState(0),[copied,setCopied]=useState(false),[lastSync,setLastSync]=useState(''),[showNetwork,setShowNetwork]=useState(false),[tor,setTor]=useState<TorState|null>(null);
  const queue=useRef<QueuedResult[]>([]),flushing=useRef(false),mounted=useRef(true),latestSession=useRef<RoomSession|null>(null),onErrorRef=useRef(onError);
  onErrorRef.current=onError;latestSession.current=session;
  const packHash=fingerprint(notebook);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const saveQueue=useCallback((next:QueuedResult[])=>{
    localStorage.setItem(`${key}:outbox`,JSON.stringify(next));queue.current=next;if(mounted.current)setPending(next.length);
  },[key]);
  useEffect(()=>{
    setLoading(true);setRoom(null);setSession(null);queue.current=[];
    try{
      const raw=localStorage.getItem(key),outbox=localStorage.getItem(`${key}:outbox`);
      const stored=raw?JSON.parse(raw) as RoomSession:null;
      if(stored?.roomId&&stored.playerToken&&typeof stored.relay==='string'){setSession(stored);setRelay(stored.relay);}
      const items=outbox?JSON.parse(outbox):[];queue.current=Array.isArray(items)?items:[];setPending(queue.current.length);
      setPlayerName(localStorage.getItem('asterloom:player-name')||'');
    }catch{onErrorRef.current('Room recovery could not be read. Export your learning progress before clearing browser storage.');}
    finally{setLoading(false);}
  },[key]);
  const flush=useCallback(async(current:RoomSession)=>{
    if(flushing.current)return;flushing.current=true;
    try{
      const available=queue.current.filter(item=>item.roomId===current.roomId);
      for(const item of available){
        const updated=await roomRequest<Room>(`/api/rooms/${current.roomId}/results`,current.relay,item,current.playerToken);
        const fresh=JSON.parse(localStorage.getItem(`${key}:outbox`)||'[]') as QueuedResult[];saveQueue(fresh.filter(entry=>entry.eventId!==item.eventId||entry.roomId!==item.roomId));
        if(mounted.current&&latestSession.current?.roomId===current.roomId)setRoom(updated);
      }
      if(available.length&&mounted.current)setStatus('Your mission results are synced.');
    }finally{flushing.current=false;}
  },[saveQueue,key]);
  const refresh=useCallback(async(current:RoomSession,manual=false)=>{
    if(manual)setBusy(true);
    try{
      await flush(current);
      const updated=await roomRequest<Room>(`/api/rooms/${current.roomId}`,current.relay,undefined,current.playerToken);
      if(!mounted.current||latestSession.current?.roomId!==current.roomId)return;
      setRoom(updated);setConnected(true);setLastSync(new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
      if(manual)setStatus('Standings refreshed.');
    }catch(error){if(mounted.current){setConnected(false);setStatus(messageOf(error));}}
    finally{if(manual&&mounted.current)setBusy(false);}
  },[flush]);
  useEffect(()=>{
    if(!session)return;
    void refresh(session);
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(session);},8000);
    const reconnect=()=>void refresh(session);
    window.addEventListener('online',reconnect);
    return()=>{clearInterval(timer);window.removeEventListener('online',reconnect);};
  },[session,refresh]);
  useEffect(()=>{
    const update=()=>{try{const stored=JSON.parse(localStorage.getItem(`${key}:outbox`)||'[]');queue.current=Array.isArray(stored)?stored:[];setPending(queue.current.length);if(latestSession.current)void refresh(latestSession.current);}catch{}};
    window.addEventListener('asterloom:room-result',update);window.addEventListener('storage',update);
    return()=>{window.removeEventListener('asterloom:room-result',update);window.removeEventListener('storage',update);};
  },[key,refresh]);
  useEffect(()=>{if(result&&session&&!loading){const outcome=enqueueRoomResult(notebook,result);if(outcome.reason)setStatus(outcome.reason);}},[result,session,loading,notebook]);
  useEffect(()=>{
    let active=true;
    const update=async()=>{try{const state=window.asterloomDesktop?.getTorStatus?await window.asterloomDesktop.getTorStatus():await roomRequest<TorState>('/api/tor/status','');if(active)setTor(state);}catch{}};
    void update();const timer=setInterval(()=>void update(),4000);return()=>{active=false;clearInterval(timer);};
  },[]);
  async function enableTor(){
    if(!window.asterloomDesktop?.setTorEnabled){setStatus('Enable Tor in your native runtime or open this onion service in Tor Browser.');return;}
    try{const state=await window.asterloomDesktop.setTorEnabled(true);setTor(state);if(state.error)throw new Error(state.error);setStatus('Tor is connecting. Keep this app open while its private address becomes available.');}
    catch(error){setStatus(messageOf(error));}
  }
  async function prepareOnion(base:string){
    if(!base.includes('.onion')||!window.asterloomDesktop?.setTorEnabled)return;
    let state=await window.asterloomDesktop.getTorStatus();
    if(!['starting','connecting','connected','ready'].includes(state.status))state=await window.asterloomDesktop.setTorEnabled(true);
    const deadline=Date.now()+120000;
    while(state.status!=='ready'&&Date.now()<deadline){
      if(state.error||['error','unavailable','stopped'].includes(state.status))throw new Error(state.error||'Tor could not connect. Check your network and try again.');
      setTor(state);setStatus(`Connecting through Tor · ${state.bootstrap||0}%`);
      await new Promise(resolve=>setTimeout(resolve,1000));state=await window.asterloomDesktop.getTorStatus();
    }
    setTor(state);if(state.status!=='ready'||!state.proxyConfigured)throw new Error('Tor is still connecting. Keep this app open and try the invitation again.');
  }
  const publicRelay=session?.relay||(tor?.status==='ready'&&tor.hostname?`http://${tor.hostname}`:'');
  const shareInvitation=session?.inviteCode?invitationText(session.inviteCode,publicRelay):'';
  async function connect(joining:boolean){
    setBusy(true);setStatus('');
    try{
      if(!playerName.trim())throw new Error('Choose a player name first.');
      const invitation=joining?parseInvitation(invite):undefined;
      const base=normalizeRelay(invitation?.relay??relay);setRelay(base);await prepareOnion(base);
      const missionIds=missionIdsFor(notebook);
      const response=joining?await roomRequest<RoomReply>('/api/rooms/join',base,{inviteCode:invitation?.code,playerName:playerName.trim(),packHash}):await roomRequest<RoomReply>('/api/rooms',base,{notebookId:notebook.id,notebookTitle:notebook.title,playerName:playerName.trim(),packHash,missions:missionIds.map(id=>({id,maxScore:1000}))});
      const saved:RoomSession={roomId:response.roomId,playerId:response.playerId,playerToken:response.playerToken,inviteCode:response.inviteCode||invitation?.code,relay:base,packHash:response.packHash||packHash};
      localStorage.setItem(key,JSON.stringify(saved));localStorage.setItem('asterloom:player-name',playerName.trim());
      setSession(saved);setRoom(response);setConnected(true);setStatus(joining?'You joined the room. Your next completed missions can be shared.':'Your room is ready. Share the invitation and this notebook export.');
    }catch(error){setStatus(messageOf(error));onErrorRef.current(messageOf(error));}
    finally{setBusy(false);}
  }
  async function copyInvite(){
    if(!session?.inviteCode)return;
    try{await navigator.clipboard.writeText(shareInvitation);setCopied(true);setTimeout(()=>setCopied(false),2000);}
    catch{setStatus('Select and copy the invitation code below. Clipboard access is unavailable here.');}
  }
  function leave(){
    if(pending){setStatus('Sync your queued results before disconnecting. They stay saved on this device.');return;}
    try{localStorage.removeItem(key);setSession(null);setRoom(null);setConnected(false);setStatus('Disconnected on this device. Your previous room results remain on the service.');}
    catch{onErrorRef.current('Your room connection could not be removed from device storage.');}
  }
  if(loading)return <div className="rooms-loading"><LoaderCircle className="spin" size={22}/> Restoring your room…</div>;
  return <div className="rooms-panel"><style>{roomStyles}</style>
    <div className="rooms-intro"><span className="small-icon lavender"><Users size={24}/></span><div><h3>A little company. A shared adventure.</h3><p>Play on your own schedule and compare your best mission results with people you invite.</p></div></div>
    {!session?<>
      <label>Your player name<input value={playerName} onChange={event=>setPlayerName(event.target.value)} maxLength={48} placeholder="A name your friends will recognize" autoComplete="nickname"/></label>
      <div className="rooms-actions"><section className="rooms-action"><h4>Start a room</h4><p>Invite friends with the same exported notebook. Each mission is worth up to 1,000 points.</p><button className="button primary full" disabled={busy||!playerName.trim()} onClick={()=>void connect(false)}>{busy?<LoaderCircle className="spin" size={16}/>:<Users size={16}/>} Create private room</button></section><section className="rooms-action"><h4>Have an invitation?</h4><label>Invitation code<input value={invite} onChange={event=>setInvite(event.target.value)} placeholder="Paste your invitation" spellCheck={false}/></label><button className="button secondary full" disabled={busy||!invite.trim()||!playerName.trim()} onClick={()=>void connect(true)}><Send size={16}/> Join room</button></section></div>
      <button className="text-button rooms-network-toggle" onClick={()=>setShowNetwork(!showNetwork)} aria-expanded={showNetwork}><Globe2 size={15}/> {showNetwork?'Hide connection settings':'Using a shared service or Tor address?'}</button>
      {showNetwork&&<div className="rooms-network"><label>Service address<input type="url" value={relay} onChange={event=>setRelay(event.target.value)} placeholder="Leave empty for this app’s local service"/></label><p>A remote service needs HTTPS and must allow this app’s origin. An onion invitation starts the bundled Tor transport in the native app. Browser play needs Tor Browser or a separate compatible transport.</p></div>}
    </>:<>
      <div className="rooms-connection"><span className={`status-pill ${connected?'ready':'pending'}`}>{connected?<Check size={13}/>:<WifiOff size={13}/>} {connected?'Connected':'Waiting for connection'}</span><span>{pending?`${pending} result${pending===1?'':'s'} queued`:lastSync?`Updated ${lastSync}`:'Your room is saved on this device'}</span><button className="icon-button" title="Refresh standings" aria-label="Refresh standings" disabled={busy} onClick={()=>void refresh(session,true)}><RefreshCw size={16} className={busy?'spin':''}/></button></div>
      <div className="rooms-invite"><div><strong>Invite a learning companion</strong><p>Share this invitation with the same notebook export. A connected Tor address is included automatically.</p></div><button className="button secondary" onClick={()=>void copyInvite()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy invitation'}</button><input aria-label="Your room invitation" value={shareInvitation} readOnly onFocus={event=>event.target.select()}/><small>Service: {publicRelay||'This device only — enable Tor to invite another device'} · Keep this invitation private.</small></div>
      <div className="rooms-board-heading"><h3><Trophy size={18}/> Mission standings</h3><span className="muted small">Best score per mission</span></div>
      <div className="rooms-board" role="table" aria-label="Room standings"><div role="row" className="rooms-board-header"><span role="columnheader">Player</span><span role="columnheader">Missions</span><span role="columnheader">Points</span></div>{room?.standings.map((standing,index)=><div key={standing.playerId} role="row" className={`rooms-standing ${standing.isYou?'is-you':''}`}><span role="cell"><b className="rooms-rank">{index+1}</b><strong>{standing.playerName}</strong>{standing.isYou&&<small>You</small>}</span><span role="cell">{standing.missionsCompleted}</span><strong role="cell">{standing.score.toLocaleString()}</strong></div>)}{!room&&<p className="rooms-empty">Your room will appear when the service is reachable.</p>}</div>
      <p className="rooms-score-note">Finish a mission, then open this room to sync its result. Retrying a mission can improve your best score. Repeated submissions never add duplicate points.</p>
      <button className="text-button" onClick={leave}><LogOut size={15}/> Disconnect this device</button>
    </>}
    {window.asterloomDesktop&&<div className="rooms-network"><strong>Private connection with Tor</strong><p>{tor?.status==='ready'?'Tor is connected. Your invitation can reach this room while the host app is running.':tor&&['starting','connecting','connected'].includes(tor.status)?`Connecting to Tor · ${tor.bootstrap||0}%`:'Enable the bundled Tor transport to connect private rooms across devices.'}</p>{(!tor||!['starting','connecting','connected','ready'].includes(tor.status))&&<button className="button secondary" disabled={busy} onClick={()=>void enableTor()}>Enable Tor connection</button>}</div>}
    {status&&<div className="rooms-status" role="status">{status}</div>}
    <div className="rooms-footnote"><ShieldCheck size={18}/><p><strong>Friendly competition, private invitations.</strong> Results are reported by each game and are not exam-certified. The service host can read player names and scores. Your host must be running and reachable to sync; offline results wait on your device. Multiplayer needs the local/native service or a configured shared service.</p></div>
  </div>;
}

const roomStyles=`
.rooms-panel{display:grid;gap:20px}.rooms-panel p{color:var(--muted,#6e6b76);font-size:13px;line-height:1.65}.rooms-panel h3,.rooms-panel h4,.rooms-panel p{margin:0}.rooms-intro{display:flex;align-items:flex-start;gap:16px}.rooms-intro h3{margin:0 0 6px}.rooms-intro .small-icon{flex-shrink:0}.rooms-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rooms-action{padding:20px;border:1px solid var(--border,#e6e1ec);border-radius:16px;display:flex;flex-direction:column;gap:13px}.rooms-action .button{margin-top:auto}.rooms-action label{margin:0}.rooms-network{padding:16px;background:var(--surface-alt,#f7f5f9);border-radius:14px}.rooms-network p{margin-top:10px}.rooms-network-toggle{justify-self:start}.rooms-connection{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted,#6e6b76)}.rooms-connection .icon-button{margin-left:auto}.rooms-invite{padding:18px;background:var(--surface-alt,#f7f5f9);border-radius:16px;display:grid;grid-template-columns:1fr auto;gap:10px}.rooms-invite input,.rooms-invite small{grid-column:1/-1;min-width:0}.rooms-invite input{font:11px monospace;letter-spacing:.02em}.rooms-invite small{color:var(--muted,#6e6b76);overflow-wrap:anywhere}.rooms-board-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.rooms-board-heading h3{display:flex;gap:8px;align-items:center}.rooms-board{border:1px solid var(--border,#e6e1ec);border-radius:16px;overflow:hidden}.rooms-board-header,.rooms-standing{display:grid;grid-template-columns:1fr 70px 80px;padding:14px 18px;align-items:center;gap:10px}.rooms-board-header{background:#f7f5fa;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#777080}.rooms-board-header span:not(:first-child),.rooms-standing>[role=cell]:not(:first-child){text-align:right}.rooms-standing{border-top:1px solid #eeeaf2;font-size:14px}.rooms-standing>span:first-child{display:flex;gap:10px;align-items:center;min-width:0}.rooms-standing strong{overflow-wrap:anywhere}.rooms-standing.is-you{background:#f4efff}.rooms-standing small{font-size:10px;background:#e9ddff;color:#67499b;border-radius:6px;padding:3px 5px}.rooms-rank{width:23px;height:23px;display:grid;place-items:center;background:#ece8f2;border-radius:50%;font-size:11px;flex-shrink:0}.rooms-empty{padding:20px}.rooms-score-note{font-size:12px!important}.rooms-status{padding:12px 15px;background:#f0ecf9;border-radius:12px;font-size:13px;line-height:1.6;color:#5d487d}.rooms-footnote{display:flex;align-items:flex-start;gap:10px;border-top:1px solid var(--border,#e6e1ec);padding-top:16px}.rooms-footnote svg{flex-shrink:0;color:#837891;margin-top:3px}.rooms-footnote p{font-size:11px}.rooms-loading{display:flex;gap:10px;align-items:center;padding:30px}@media(max-width:560px){.rooms-actions{grid-template-columns:1fr}.rooms-invite{grid-template-columns:1fr}.rooms-invite .button{justify-self:start}.rooms-connection{flex-wrap:wrap}.rooms-board-header,.rooms-standing{padding:12px;grid-template-columns:1fr 50px 60px}.rooms-board-heading{align-items:flex-start;flex-direction:column}}
`;
