import {useEffect,useRef} from 'react';
import type {Notebook} from '../types';
import {isCanceled,isOnionRelay,readRoomOutbox,readRoomSession,retryDelay,RoomRequestError,roomFingerprint,roomStorageKey,sessionIdentity,type RoomSession} from '../lib/roomClient';
import {getRoomSyncStatus,publishRoomSyncStatus,syncFailureStatus,syncRoomOnce} from '../lib/roomSync';
interface Entry {session:RoomSession;fingerprint:string;controller?:AbortController;timer?:ReturnType<typeof setTimeout>;failures:number;paused:boolean}
/** One app-wide coordinator. It renders nothing and never sends notebook source material. */
export default function RoomBackgroundSync({notebooks}:{notebooks:Notebook[]}){
 const latest=useRef(notebooks);latest.current=notebooks;
 useEffect(()=>{
  let alive=true;const entries=new Map<string,Entry>();
  const stop=(entry:Entry)=>{entry.controller?.abort();entry.controller=undefined;if(entry.timer)clearTimeout(entry.timer);entry.timer=undefined;};
  const run=async(notebook:Notebook,entry:Entry)=>{
   if(!alive||entry.controller||entry.paused)return;
   if(entry.timer)clearTimeout(entry.timer);entry.timer=undefined;
   const key=roomStorageKey(notebook),current=latest.current.find(value=>value.id===notebook.id);
   if(!current||roomFingerprint(current)!==entry.fingerprint){stop(entry);return;}
   try{if(!readRoomOutbox(localStorage,key).some(item=>item.roomId===entry.session.roomId))return;}catch(error){entry.paused=true;publishRoomSyncStatus(entry.session,syncFailureStatus(error,null));return;}
   const controller=new AbortController();entry.controller=controller;
   publishRoomSyncStatus(entry.session,{state:'syncing',message:'Syncing saved mission results…'});
   try{
    const result=await syncRoomOnce(current,entry.session,{signal:controller.signal,desktop:window.asterloomDesktop});
    if(!alive||controller.signal.aborted)return;
    entry.failures=0;publishRoomSyncStatus(entry.session,{state:'synced',message:'Your mission results are synced.',result});
   }catch(error){
    if(!alive||isCanceled(error))return;
    entry.failures++;const delay=error instanceof RoomRequestError&&!error.retryable?null:retryDelay(entry.failures,error);
    entry.paused=delay===null;publishRoomSyncStatus(entry.session,syncFailureStatus(error,delay));
    if(delay!==null)entry.timer=setTimeout(()=>void run(current,entry),delay);
   }finally{
    if(entry.controller===controller)entry.controller=undefined;
    if(alive&&!entry.paused&&!entry.timer&&!controller.signal.aborted){try{if(readRoomOutbox(localStorage,key).some(item=>item.roomId===entry.session.roomId))entry.timer=setTimeout(()=>void run(current,entry),8000);}catch{}}
   }
  };
  const scan=()=>{
   if(!alive)return;
   for(const [id,entry] of entries){const current=latest.current.find(value=>value.id===id);if(!current||roomFingerprint(current)!==entry.fingerprint){stop(entry);entries.delete(id);}}
   for(const notebook of latest.current){
    const key=roomStorageKey(notebook);let session:RoomSession|null;try{session=readRoomSession(localStorage,key);}catch{continue;}
    const prior=entries.get(notebook.id);
    if(!session){if(prior){stop(prior);entries.delete(notebook.id);}continue;}
    const fingerprint=roomFingerprint(notebook);
    if(prior&&(sessionIdentity(prior.session)!==sessionIdentity(session)||prior.fingerprint!==fingerprint)){stop(prior);entries.delete(notebook.id);}
    let entry=entries.get(notebook.id);
    if(!entry){entry={session,fingerprint,failures:0,paused:getRoomSyncStatus(session)?.state==='paused'};entries.set(notebook.id,entry);}
    if(!entry.timer)void run(notebook,entry);
   }
  };
  const wake=()=>{if(document.visibilityState!=='visible')return;for(const entry of entries.values()){if(entry.timer)clearTimeout(entry.timer);entry.timer=undefined;}scan();};
  const recovered=()=>{for(const entry of entries.values())if(getRoomSyncStatus(entry.session)?.state==='synced'){entry.paused=false;entry.failures=0;}scan();};
  const torPreference=(event:Event)=>{const enabled=(event as CustomEvent).detail?.enabled===true;for(const entry of entries.values()){if(!isOnionRelay(entry.session.relay))continue;if(!enabled){stop(entry);entry.paused=true;publishRoomSyncStatus(entry.session,{state:'paused',message:'Tor is turned off. Enable private connectivity to resume syncing your saved results.'});}else if(getRoomSyncStatus(entry.session)?.message.startsWith('Tor is turned off.')){entry.paused=false;entry.timer=undefined;publishRoomSyncStatus(entry.session,{state:'retrying',message:'Tor is reconnecting. Your results remain saved.'});}}if(enabled)scan();};
  scan();window.addEventListener('asterloom:room-result',scan);window.addEventListener('asterloom:room-session',scan);window.addEventListener('storage',scan);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('asterloom:room-sync',recovered);window.addEventListener('asterloom:tor-preference',torPreference);
  return()=>{alive=false;for(const entry of entries.values())stop(entry);window.removeEventListener('asterloom:room-result',scan);window.removeEventListener('asterloom:room-session',scan);window.removeEventListener('storage',scan);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('asterloom:room-sync',recovered);window.removeEventListener('asterloom:tor-preference',torPreference);};
 },[notebooks]);
 return null;
}
