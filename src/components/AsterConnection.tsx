import {createContext,useContext,useState,useCallback,type ReactNode} from 'react';
import {Sparkles} from 'lucide-react';
import type {ProviderConfig} from '../lib/provider';
import {canRequest,useProviderSession} from '../lib/providerSession';
import Dialog from './Dialog';
import ProviderConnection from './ProviderConnection';
import {upsertAIUsageReceipt,type AIUsageReceipt} from '../lib/aiUsage';

interface AsterConnectionState {enabled:boolean;config:ProviderConfig;connect:()=>void;disable:()=>void;receipts:AIUsageReceipt[];recordReceipt:(receipt:AIUsageReceipt)=>void}
const Context=createContext<AsterConnectionState|undefined>(undefined);
/** Opt-in belongs to this running app, never to a notebook or exported package. */
export function useAsterConnection(){return useContext(Context);}
export default function AsterConnection({children}:{children:ReactNode}){
 const [config,setConfig]=useProviderSession(),[enabled,setEnabled]=useState(false),[open,setOpen]=useState(false);
 const [receipts,setReceipts]=useState<AIUsageReceipt[]>([]);
 const recordReceipt=useCallback((receipt:AIUsageReceipt)=>setReceipts(previous=>upsertAIUsageReceipt(previous,receipt)),[]);
 const ready=canRequest(config),active=enabled&&ready;
 return <Context.Provider value={{config,enabled:active,connect:()=>setOpen(true),disable:()=>setEnabled(false),receipts,recordReceipt}}>
  {children}
  {open&&<Dialog title="Connect Aster to AI" onClose={()=>setOpen(false)} wide>
   <p>Give Aster a live AI connection to explain ideas, compare concepts and suggest the next step using this game’s material. Regular Aster and the whole game still work offline.</p>
   <p className="notice small">When you ask an AI question, your selected provider receives that question, a few relevant source passages, up to four recent replies from this conversation, and a short summary of your current activity and progress. This uses your account’s limits or API credits. Nothing is sent automatically.</p>
   <ProviderConnection config={config} onChange={value=>{setEnabled(false);setConfig(value);}}/>
   <div className="dialog-footer"><button type="button" className="button secondary" onClick={()=>{setEnabled(false);setOpen(false);}}>Use regular Aster</button><button type="button" className="button primary" disabled={!ready} onClick={()=>{setEnabled(true);setOpen(false);}}><Sparkles size={16} aria-hidden="true"/>{active?'Return to AI Aster':'Enable AI for Aster'}</button></div>
   <p className="small muted">Your choice lasts for this app session. Shared games start with regular Aster; every player can connect their own account. AI help supports practice and does not award points or change your game.</p>
  </Dialog>}
 </Context.Provider>;
}
