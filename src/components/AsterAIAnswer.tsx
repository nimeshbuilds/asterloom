import type {EvidenceReference} from '../types';
import type {AsterAIResult} from '../lib/asterAI';
import {summarizeAIUsage,type AIUsageReceipt} from '../lib/aiUsage';
import './aster-ai.css';
export function AsterAIUsage({receipts}:{receipts:AIUsageReceipt[]}){
 if(!receipts.length)return null;
 const totals=summarizeAIUsage(receipts);
 return <details className="aster-ai-usage"><summary>AI help usage · {totals.requests} request{totals.requests===1?'':'s'}</summary><dl>{[['Input tokens',totals.input],['Output tokens',totals.output]].map(([label,item])=>{const metric=item as typeof totals.input;return <div key={String(label)}><dt>{String(label)}</dt><dd>{metric.value===null?'Not reported':metric.value.toLocaleString()}{metric.missing>0&&metric.value!==null?' (reported subtotal)':''}</dd></div>;})}</dl><p>Provider measurements for this app session. Missing counts are unknown. Cached input is included in input; reasoning is included in output. Your game’s creation usage is separate.</p></details>;
}
export default function AsterAIAnswer({result,onSource,onHelp,onConnect,canOpenSource,canHelp}:{result:AsterAIResult;onSource:(reference:EvidenceReference)=>void;onHelp:()=>void;onConnect:()=>void;canOpenSource:boolean;canHelp:boolean}){
 return <section className="aster-ai-answer" aria-label="Aster AI answer"><span className="aster-eyebrow">{result.status==='answered'?'AI EXPLANATION · WITH SOURCES':'ASTER CHECKED YOUR MATERIAL'}</span>{result.answer.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}
  {result.status==='not-supported'&&result.retrieval.passages.length>0&&<details><summary>Related passages Aster checked</summary>{result.retrieval.passages.map(({reference,sourceTitle},index)=><blockquote key={`${reference.sourceId}-${reference.start}-${index}`}><p>{reference.quote}</p><footer>{sourceTitle} · {canOpenSource?<button type="button" onClick={()=>onSource(reference)}>{reference.locator.label} · Open source</button>:reference.locator.label}</footer></blockquote>)}</details>}
  {result.citations.length>0&&<details><summary>Read the supporting passages</summary>{result.citations.map((reference,index)=><blockquote key={`${reference.sourceId}-${reference.start}-${index}`}><p>{reference.quote}</p><footer>{canOpenSource?<button type="button" onClick={()=>onSource(reference)}>Source {index+1} · {reference.locator.label}</button>:<>Source {index+1} · {reference.locator.label}</>}</footer></blockquote>)}</details>}
  <div className="aster-ai-actions">{result.actions.map((action,index)=>action.type==='open-source'?(canOpenSource&&<button type="button" key={index} onClick={()=>onSource(action.reference)}>{action.label}</button>):action.type==='open-current-help'?(canHelp&&<button type="button" key={index} onClick={onHelp}>{action.label}</button>):<button type="button" key={index} onClick={onConnect}>{action.label}</button>)}</div>
  <small>{result.status==='answered'?'AI can make mistakes. Check the cited passages when a detail matters.':'Aster could not produce a supported answer from these passages. You can explore the sources or ask about a specific concept.'}</small>
 </section>;
}
