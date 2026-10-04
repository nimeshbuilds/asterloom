import {useState} from 'react';
import {Check,Copy,Download,MessageSquare} from 'lucide-react';
import type {Notebook,LearningCard} from '../types';
import {createRefinementPrompt,applyRefinementResponse} from '../lib/provider';
import {download} from '../lib/imports';

export default function AssistantTransfer({notebook,onApply,onError}:{notebook:Notebook;onApply:(cards:LearningCard[])=>void;onError:(message:string)=>void}){
 const [draft,setDraft]=useState(''),[copied,setCopied]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(createRefinementPrompt(notebook));setCopied(true);}catch{onError('Clipboard access is unavailable. Save the prompt as a text file instead.');}}
 function apply(){try{const result=applyRefinementResponse(notebook,draft);onApply(result.cards);}catch(e){onError((e as Error).message);}}
 return <details className="assistant-transfer"><summary><MessageSquare size={17}/>Use an assistant subscription you already have</summary><p>Copy a small refinement prompt into your existing assistant, then paste its JSON reply here. You choose which service receives the prepared challenges and their evidence.</p><div className="button-row"><button className="button secondary" onClick={()=>void copy()} disabled={!notebook.cards.length}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Prompt copied':'Copy prepared prompt'}</button><button className="text-button" disabled={!notebook.cards.length} onClick={()=>{try{download(createRefinementPrompt(notebook),'asterloom-refinement-prompt.txt','text/plain');}catch(e){onError((e as Error).message);}}}><Download size={15}/>Save prompt</button></div><label>Paste the assistant’s JSON reply<textarea rows={6} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={'{"cards": […]}'}/></label><p className="small muted">Asterloom checks the answer keys and source references before importing. Review the wording yourself before sharing.</p><button className="button primary" disabled={!draft.trim()} onClick={apply}>Validate and apply draft <Check size={15}/></button></details>;
}
