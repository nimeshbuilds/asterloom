import {useSyncExternalStore} from 'react';
import type {ProviderConfig} from './provider';
let current:ProviderConfig={provider:'openai',apiKey:'',model:'',baseUrl:''};
const listeners=new Set<()=>void>();
/** A session-only connection shared by authoring screens; never saved or exported. */
export function useProviderSession():[ProviderConfig,(value:ProviderConfig)=>void]{
 const config=useSyncExternalStore(callback=>{listeners.add(callback);return()=>listeners.delete(callback);},()=>current);
 return [config,value=>{current=value;for(const listener of listeners)listener();}];
}
export const canRequest=(config:ProviderConfig)=>!!config.model.trim()&&(config.provider==='local'||config.provider==='compatible'||config.provider==='chatgpt'||config.provider==='grok'||config.provider==='claude-code'||!!config.apiKey.trim());
