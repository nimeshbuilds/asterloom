import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Copy,Globe2,LoaderCircle,LogOut,RefreshCw,Send,ShieldCheck,Trophy,Users,WifiOff} from 'lucide-react';
import type {Notebook} from '../types';
import {ensureTorTransport,invitationText,isCanceled,isOnionRelay,missionIdsFor,normalizeRelay,parseInvitation,queueRoomResult,readRoomOutbox,readRoomSession,retryDelay,RoomRequestError,roomFingerprint,roomRequest,roomStorageKey,sessionIdentity,torCanConnect,torStatusMessage} from '../lib/roomClient';
import type {RoomResult,RoomSession,TorState} from '../lib/roomClient';
export type {RoomResult} from '../lib/roomClient';
import {getRoomSyncStatus,publishRoomSyncStatus,syncFailureStatus,syncRoomOnce} from '../lib/roomSync';
interface Standing {playerId:string;playerName:string;score:number;missionsCompleted:number;isYou:boolean}
interface Room {roomId:string;notebookId:string;notebookTitle:string;packHash:string;standings:Standing[];revision:number;trust:string;missions:{id:string;maxScore:number}[]}
interface RoomReply extends Room {playerId:string;playerToken:string;inviteCode?:string}
const messageOf=(error:unknown)=>error instanceof Error?error.message:'The room could not be reached.';
/** Persist each result under its own key, including while the room dialog is closed. */
export function enqueueRoomResult(notebook:Notebook,result:RoomResult):{queued:boolean;reason?:string}{
  const outcome=queueRoomResult(notebook,result,localStorage);
  if(outcome.queued)window.dispatchEvent(new CustomEvent('asterloom:room-result',{detail:{notebookId:notebook.id}}));
  return outcome;
}
export default function Rooms({notebook,onError,result}:{notebook:Notebook;onError:(message:string)=>void;result?:RoomResult}){
  const key=roomStorageKey(notebook),packHash=roomFingerprint(notebook);
  const [session,setSession]=useState<RoomSession|null>(null),[room,setRoom]=useState<Room|null>(null),[playerName,setPlayerName]=useState(''),[invite,setInvite]=useState(''),[relay,setRelay]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[connected,setConnected]=useState(false),[status,setStatus]=useState(''),[pending,setPending]=useState(0),[copied,setCopied]=useState(false),[lastSync,setLastSync]=useState(''),[showNetwork,setShowNetwork]=useState(false),[tor,setTor]=useState<TorState|null>(null),[retryAt,setRetryAt]=useState<number|null>(null);
  const mounted=useRef(true),latestSession=useRef<RoomSession|null>(null),onErrorRef=useRef(onError),active=useRef<AbortController|null>(null),retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null),failures=useRef(0),refreshRef=useRef<(current:RoomSession,manual?:boolean)=>Promise<void>>(async()=>{}),generation=useRef(0);
  onErrorRef.current=onError;latestSession.current=session;
  const stop=useCallback(()=>{generation.current++;active.current?.abort();active.current=null;if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=null;if(mounted.current){setBusy(false);setRetryAt(null);}},[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[stop]);
  const updatePending=useCallback(()=>{const items=readRoomOutbox(localStorage,key);if(mounted.current)setPending(items.length);return items;},[key]);
  useEffect(()=>{
    stop();setLoading(true);setRoom(null);setSession(null);setConnected(false);setStatus('');setRetryAt(null);setBusy(false);failures.current=0;
    try{const stored=readRoomSession(localStorage,key);if(stored){latestSession.current=stored;setSession(stored);setRelay(stored.relay);}updatePending();setPlayerName(localStorage.getItem('asterloom:player-name')||'');}
    catch(error){onErrorRef.current(messageOf(error));}
    finally{setLoading(false);}
  },[key,stop,updatePending]);
  const refresh=useCallback(async(current:RoomSession,manual=false)=>{
    if(active.current)return;
    if(!manual&&getRoomSyncStatus(current)?.state==='paused'){setConnected(false);setStatus(getRoomSyncStatus(current)!.message);return;}
    if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=null;setRetryAt(null);
    const controller=new AbortController(),epoch=generation.current;active.current=controller;
    if(manual)setBusy(true);
    const currentStill=()=>mounted.current&&epoch===generation.current&&!!latestSession.current&&sessionIdentity(latestSession.current)===sessionIdentity(current);
    let delay:number|null=8000;
    try{
      const outcome=await syncRoomOnce(notebook,current,{signal:controller.signal,desktop:window.asterloomDesktop,allowEnableTor:manual,onTorStatus:state=>{if(currentStill()){setTor(state);if(!torCanConnect(state))setStatus(torStatusMessage(state));}}});
      if(!currentStill())return;
      updatePending();setRoom(outcome.room);setConnected(true);failures.current=0;setLastSync(new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
      const message=outcome.sent?'Your mission results are synced.':manual?'Standings refreshed.':'';setStatus(message);
      publishRoomSyncStatus(current,{state:'synced',message,result:outcome});
    }catch(error){
      if(isCanceled(error)||!currentStill())return;
      setConnected(false);failures.current++;
      delay=error instanceof RoomRequestError&&!error.retryable?null:retryDelay(failures.current,error);
      const failure=syncFailureStatus(error,delay);setStatus(failure.message);publishRoomSyncStatus(current,failure);
    }finally{
      if(active.current===controller)active.current=null;
      if(currentStill()){
        if(manual)setBusy(false);
        if(delay!==null){setRetryAt(Date.now()+delay);retryTimer.current=setTimeout(()=>{if(document.visibilityState==='visible')void refreshRef.current(current);else retryTimer.current=null;},delay);}
      }
    }
  },[key,packHash,notebook,updatePending]);
  refreshRef.current=refresh;
  useEffect(()=>{if(!session)return;void refresh(session);return()=>{stop();};},[session,refresh,stop]);
  useEffect(()=>{
    const reconnect=()=>{if(latestSession.current&&document.visibilityState==='visible')void refreshRef.current(latestSession.current);};
    const offline=()=>{if(latestSession.current?.relay){active.current?.abort();setConnected(false);setStatus('You are offline. Your results are saved and will retry when the connection returns.');}};
    window.addEventListener('online',reconnect);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',reconnect);
    return()=>{window.removeEventListener('online',reconnect);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',reconnect);};
  },[]);
  useEffect(()=>{
    const update=(event:Event)=>{if(event instanceof StorageEvent&&event.key&&!event.key.startsWith(key))return;try{updatePending();if(latestSession.current)void refreshRef.current(latestSession.current);}catch(error){setStatus(messageOf(error));}};
    window.addEventListener('asterloom:room-result',update);window.addEventListener('storage',update);
    return()=>{window.removeEventListener('asterloom:room-result',update);window.removeEventListener('storage',update);};
  },[key,updatePending]);
  useEffect(()=>{
    const update=()=>{const current=latestSession.current;if(!current)return;const status=getRoomSyncStatus(current);if(!status)return;setStatus(status.message);setRetryAt(status.retryAt??null);if(status.result){setRoom(status.result.room);setConnected(true);updatePending();setLastSync(new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));}else if(status.state!=='syncing')setConnected(false);};
    window.addEventListener('asterloom:room-sync',update);update();return()=>window.removeEventListener('asterloom:room-sync',update);
  },[session,updatePending]);
  useEffect(()=>{if(result&&session&&!loading){const outcome=enqueueRoomResult(notebook,result);if(outcome.reason)setStatus(outcome.reason);}},[result,session,loading,notebook]);
  useEffect(()=>{
    let alive=true,inFlight=false;
    const update=async()=>{if(inFlight)return;inFlight=true;try{const state=window.asterloomDesktop?.getTorStatus?await window.asterloomDesktop.getTorStatus():await roomRequest<TorState>('/api/tor/status','');if(alive)setTor(state);}catch{}finally{inFlight=false;}};
    void update();const timer=setInterval(()=>void update(),4000);return()=>{alive=false;clearInterval(timer);};
  },[]);
  async function enableTor(){
    const desktop=window.asterloomDesktop;if(!desktop)return;
    setBusy(true);try{const state=await desktop.setTorEnabled(true);if(!mounted.current)return;setTor(state);setStatus(torStatusMessage(state));if(state.error)throw new Error(state.error);if(latestSession.current)void refreshRef.current(latestSession.current,true);}
    catch(error){if(mounted.current)setStatus(messageOf(error));}finally{if(mounted.current)setBusy(false);}
  }
  const publicRelay=session?.relay||(tor?.status==='ready'&&tor.bootstrap===100&&tor.hostname?`http://${tor.hostname}`:'');
  const shareInvitation=session?.inviteCode?invitationText(session.inviteCode,publicRelay):'';
  async function connect(joining:boolean){
    if(active.current)return;
    const controller=new AbortController(),epoch=generation.current;active.current=controller;setBusy(true);setStatus('');
    try{
      if(!playerName.trim())throw new Error('Choose a player name first.');
      const invitation=joining?parseInvitation(invite):undefined;
      const base=normalizeRelay(invitation?.relay??relay);setRelay(base);
      if(isOnionRelay(base)&&window.asterloomDesktop)await ensureTorTransport(window.asterloomDesktop,{signal:controller.signal,onStatus:state=>{if(mounted.current){setTor(state);setStatus(torStatusMessage(state));}}});
      const response=joining?await roomRequest<RoomReply>('/api/rooms/join',base,{inviteCode:invitation?.code,playerName:playerName.trim(),packHash},undefined,controller.signal):await roomRequest<RoomReply>('/api/rooms',base,{notebookId:notebook.id,notebookTitle:notebook.title,playerName:playerName.trim(),packHash,missions:missionIdsFor(notebook).map(id=>({id,maxScore:1000}))},undefined,controller.signal);
      if(controller.signal.aborted||!mounted.current||epoch!==generation.current)return;
      if(!response.roomId||!response.playerId||!response.playerToken||!Array.isArray(response.standings))throw new Error('The service returned an incomplete room connection.');
      const saved:RoomSession={roomId:response.roomId,playerId:response.playerId,playerToken:response.playerToken,inviteCode:response.inviteCode||invitation?.code,relay:base,packHash:response.packHash||packHash};
      localStorage.setItem(key,JSON.stringify(saved));localStorage.setItem('asterloom:player-name',playerName.trim());
      latestSession.current=saved;setSession(saved);window.dispatchEvent(new CustomEvent('asterloom:room-session'));setRoom(response);setConnected(true);setStatus(joining?'You joined the room. Your next completed missions can be shared.':'Your room is ready. Share the invitation and this notebook export.');
    }catch(error){if(!isCanceled(error)&&mounted.current&&epoch===generation.current){setStatus(messageOf(error));onErrorRef.current(messageOf(error));}}
    finally{if(active.current===controller)active.current=null;if(mounted.current&&epoch===generation.current)setBusy(false);}
  }
  async function copyInvite(){
    if(!session?.inviteCode)return;
    try{await navigator.clipboard.writeText(shareInvitation);if(mounted.current)setCopied(true);setTimeout(()=>{if(mounted.current)setCopied(false);},2000);}
    catch{setStatus('Select and copy the invitation code below. Clipboard access is unavailable here.');}
  }
  function leave(){
    try{if(updatePending().length){setStatus('Sync your queued results before disconnecting. They stay saved on this device, including while the host is offline.');return;}stop();localStorage.removeItem(key);window.dispatchEvent(new CustomEvent('asterloom:room-session'));latestSession.current=null;setSession(null);setRoom(null);setConnected(false);setBusy(false);setRetryAt(null);setStatus('Disconnected on this device. Your previous room results remain on the service.');}
    catch(error){onErrorRef.current(messageOf(error));}
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
      <div className="rooms-connection"><span className={`status-pill ${connected?'ready':'pending'}`}>{connected?<Check size={13}/>:<WifiOff size={13}/>} {connected?'Connected':'Waiting for connection'}</span><span>{pending?`${pending} result${pending===1?'':'s'} queued`:lastSync?`Updated ${lastSync}`:'Your room is saved on this device'}</span>{!connected&&retryAt&&<small>Automatic retry scheduled</small>}<button className="icon-button" title="Refresh standings" aria-label="Refresh standings" disabled={busy} onClick={()=>void refresh(session,true)}><RefreshCw size={16} className={busy?'spin':''}/></button></div>
      <div className="rooms-invite"><div><strong>Invite a learning companion</strong><p>Share this invitation with the same notebook export. A connected Tor address is included automatically.</p></div><button className="button secondary" onClick={()=>void copyInvite()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy invitation'}</button><input aria-label="Your room invitation" value={shareInvitation} readOnly onFocus={event=>event.target.select()}/><small>Service: {publicRelay||'This device only — enable Tor to invite another device'} · Keep this invitation private.</small></div>
      <div className="rooms-board-heading"><h3><Trophy size={18}/> Mission standings</h3><span className="muted small">Best score per mission</span></div>
      <div className="rooms-board" role="table" aria-label="Room standings"><div role="row" className="rooms-board-header"><span role="columnheader">Player</span><span role="columnheader">Missions</span><span role="columnheader">Points</span></div>{room?.standings.map((standing,index)=><div key={standing.playerId} role="row" className={`rooms-standing ${standing.isYou?'is-you':''}`}><span role="cell"><b className="rooms-rank">{index+1}</b><strong>{standing.playerName}</strong>{standing.isYou&&<small>You</small>}</span><span role="cell">{standing.missionsCompleted}</span><strong role="cell">{standing.score.toLocaleString()}</strong></div>)}{!room&&<p className="rooms-empty">Your room will appear when the service is reachable.</p>}</div>
      <p className="rooms-score-note">Finished missions sync in the background while this app is open. Offline results wait safely for reconnection. Retrying a mission can improve your best score. Repeated submissions never add duplicate points.</p>
      <button className="text-button" onClick={leave}><LogOut size={15}/> Disconnect this device</button>
    </>}
    {window.asterloomDesktop&&<div className="rooms-network"><strong>Private connection with Tor</strong><p>{torStatusMessage(tor)}</p>{(!tor||!['starting','connecting','connected','ready'].includes(tor.status))&&<button className="button secondary" disabled={busy} onClick={()=>void enableTor()}>Retry Tor connection</button>}</div>}
    {status&&<div className="rooms-status" role="status">{status}</div>}
    <div className="rooms-footnote"><ShieldCheck size={18}/><p><strong>Friendly competition, private invitations.</strong> Results are reported by each game and are not exam-certified. The service host can read player names and scores. Your host must be running and reachable to sync; offline results wait on your device. Multiplayer needs the local/native service or a configured shared service.</p></div>
  </div>;
}

const roomStyles=`
.rooms-panel{display:grid;gap:20px;--muted:#605d68}.rooms-panel .text-button{color:#555f50}.rooms-panel p{color:var(--muted,#6e6b76);font-size:13px;line-height:1.65}.rooms-panel h3,.rooms-panel h4,.rooms-panel p{margin:0}.rooms-intro{display:flex;align-items:flex-start;gap:16px}.rooms-intro h3{margin:0 0 6px}.rooms-intro .small-icon{flex-shrink:0}.rooms-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rooms-action{padding:20px;border:1px solid var(--border,#e6e1ec);border-radius:16px;display:flex;flex-direction:column;gap:13px}.rooms-action .button{margin-top:auto}.rooms-action label{margin:0}.rooms-network{padding:16px;background:var(--surface-alt,#f7f5f9);border-radius:14px}.rooms-network p{margin-top:10px}.rooms-network-toggle{justify-self:start}.rooms-connection{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted,#6e6b76)}.rooms-connection .icon-button{margin-left:auto}.rooms-invite{padding:18px;background:var(--surface-alt,#f7f5f9);border-radius:16px;display:grid;grid-template-columns:1fr auto;gap:10px}.rooms-invite input,.rooms-invite small{grid-column:1/-1;min-width:0}.rooms-invite input{font:11px monospace;letter-spacing:.02em}.rooms-invite small{color:var(--muted,#6e6b76);overflow-wrap:anywhere}.rooms-board-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.rooms-board-heading h3{display:flex;gap:8px;align-items:center}.rooms-board{border:1px solid var(--border,#e6e1ec);border-radius:16px;overflow:hidden}.rooms-board-header,.rooms-standing{display:grid;grid-template-columns:1fr 70px 80px;padding:14px 18px;align-items:center;gap:10px}.rooms-board-header{background:#f7f5fa;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#62596d}.rooms-board-header span:not(:first-child),.rooms-standing>[role=cell]:not(:first-child){text-align:right}.rooms-standing{border-top:1px solid #eeeaf2;font-size:14px}.rooms-standing>span:first-child{display:flex;gap:10px;align-items:center;min-width:0}.rooms-standing strong{overflow-wrap:anywhere}.rooms-standing.is-you{background:#f4efff}.rooms-standing small{font-size:10px;background:#e9ddff;color:#67499b;border-radius:6px;padding:3px 5px}.rooms-rank{width:23px;height:23px;display:grid;place-items:center;background:#ece8f2;border-radius:50%;font-size:11px;flex-shrink:0}.rooms-empty{padding:20px}.rooms-score-note{font-size:12px!important}.rooms-status{padding:12px 15px;background:#f0ecf9;border-radius:12px;font-size:13px;line-height:1.6;color:#5d487d}.rooms-footnote{display:flex;align-items:flex-start;gap:10px;border-top:1px solid var(--border,#e6e1ec);padding-top:16px}.rooms-footnote svg{flex-shrink:0;color:#837891;margin-top:3px}.rooms-footnote p{font-size:11px}.rooms-loading{display:flex;gap:10px;align-items:center;padding:30px}@media(max-width:560px){.rooms-actions{grid-template-columns:1fr}.rooms-invite{grid-template-columns:1fr}.rooms-invite .button{justify-self:start}.rooms-connection{flex-wrap:wrap}.rooms-board-header,.rooms-standing{padding:12px;grid-template-columns:1fr 50px 60px}.rooms-board-heading{align-items:flex-start;flex-direction:column}}
`;
