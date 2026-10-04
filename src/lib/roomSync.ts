import type {Notebook} from '../types';
import {acknowledgeRoomResult,ensureTorTransport,isCanceled,isOnionRelay,readRoomOutbox,RoomRequestError,roomFingerprint,roomRequest,roomStorageKey,sessionIdentity,type RoomSession,type TorState,type TorTransport} from './roomClient';
export interface RoomStanding {playerId:string;playerName:string;score:number;missionsCompleted:number;isYou:boolean}
export interface RoomSnapshot {roomId:string;notebookId:string;notebookTitle:string;packHash:string;standings:RoomStanding[];revision:number;trust:string;missions:{id:string;maxScore:number}[]}
export interface RoomSyncResult {room:RoomSnapshot;sent:number;pending:number}
export interface RoomSyncStatus {state:'syncing'|'synced'|'retrying'|'paused';message:string;retryAt?:number;result?:RoomSyncResult}
const statuses=new Map<string,RoomSyncStatus>();
export function getRoomSyncStatus(session:RoomSession){return statuses.get(sessionIdentity(session));}
export function publishRoomSyncStatus(session:RoomSession,status:RoomSyncStatus){statuses.set(sessionIdentity(session),status);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('asterloom:room-sync',{detail:{identity:sessionIdentity(session)}}));}
interface Operation {controller:AbortController;listeners:Set<symbol>;promise:Promise<RoomSyncResult>}
const operations=new Map<string,Operation>();
function abortError(){const error=new Error('Room synchronization canceled.');error.name='AbortError';return error;}
/** A single idempotent dispatch stream is shared by the dialog and background learner session. */
export function syncRoomOnce(notebook:Notebook,session:RoomSession,options:{signal?:AbortSignal;storage?:Storage;desktop?:TorTransport;allowEnableTor?:boolean;onTorStatus?:(state:TorState)=>void}={}):Promise<RoomSyncResult>{
 const {signal,storage=localStorage,desktop,onTorStatus,allowEnableTor=false}=options;
 if(signal?.aborted)return Promise.reject(abortError());
 if(session.packHash!==roomFingerprint(notebook))return Promise.reject(new RoomRequestError('This notebook changed after joining. Restore the exact shared notebook revision to sync its saved results.',409,false));
 const identity=sessionIdentity(session),key=roomStorageKey(notebook);
 let operation=operations.get(identity);
 if(operation?.controller.signal.aborted){operations.delete(identity);operation=undefined;}
 if(!operation){
  const controller=new AbortController();operation={controller,listeners:new Set(),promise:Promise.resolve(null as unknown as RoomSyncResult)};
  const current=operation;operations.set(identity,current);
  current.promise=Promise.resolve().then(async()=>{
   if(controller.signal.aborted)throw abortError();
   if(session.relay&&typeof navigator!=='undefined'&&navigator.onLine===false)throw new RoomRequestError('You are offline. Your results stay saved until the connection returns.');
   if(isOnionRelay(session.relay)&&desktop)await ensureTorTransport(desktop,{signal:controller.signal,onStatus:onTorStatus,allowEnable:allowEnableTor});
   const items=readRoomOutbox(storage,key).filter(item=>item.roomId===session.roomId);
   for(const item of items){
    if(item.playerId&&item.playerId!==session.playerId||item.packHash&&item.packHash!==session.packHash)throw new RoomRequestError('A saved result belongs to another player or notebook revision. No results were removed.',409,false);
    await roomRequest<RoomSnapshot>(`/api/rooms/${session.roomId}/results`,session.relay,item,session.playerToken,controller.signal);
    if(controller.signal.aborted)throw abortError();
    acknowledgeRoomResult(storage,key,item);
   }
   const room=await roomRequest<RoomSnapshot>(`/api/rooms/${session.roomId}`,session.relay,undefined,session.playerToken,controller.signal);
   if(room.roomId!==session.roomId||!Array.isArray(room.standings))throw new RoomRequestError('The service returned an unreadable room. Your saved results are kept.',0,false);
   return{room,sent:items.length,pending:readRoomOutbox(storage,key).length};
  }).finally(()=>{if(operations.get(identity)===current)operations.delete(identity);});
 }
 const current=operation,listener=Symbol();current.listeners.add(listener);
 return new Promise((resolve,reject)=>{
  let finished=false;
  const detach=()=>{current.listeners.delete(listener);signal?.removeEventListener('abort',abort);};
  const abort=()=>{if(finished)return;finished=true;detach();if(!current.listeners.size)current.controller.abort();reject(abortError());};
  signal?.addEventListener('abort',abort,{once:true});
  current.promise.then(result=>{if(finished)return;finished=true;detach();resolve(result);},error=>{if(finished)return;finished=true;detach();reject(error);});
 });
}
export function syncFailureStatus(error:unknown,delay:number|null):RoomSyncStatus{return{state:delay===null?'paused':'retrying',message:`${error instanceof Error?error.message:'The room could not be reached.'}${delay===null?' Automatic retries are paused. Check the invitation or ask the host, then refresh.':' Results stay saved and will retry automatically.'}`,...(delay===null?{}:{retryAt:Date.now()+delay})};}
export {isCanceled};
