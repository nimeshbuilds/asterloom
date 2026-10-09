import type {EvidenceReference} from '../types';
import type {AsterAIResult} from '../lib/asterAI';
import {summarizeAIUsage,type AIUsageReceipt} from '../lib/aiUsage';
import './aster-ai.css';
// Render only bounded inline emphasis; source/provider text never becomes HTML or links.
export const renderAsterText=(text:string)=>text.split(/(\*\*[^*\n]{1,240}\*\*)/g).map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part);
export function AsterAIUsage({receipts}:{receipts:AIUsageReceipt[]}){
 if(!receipts.length)return null;
 const totals=summarizeAIUsage(receipts);
 return <details className="aster-ai-usage"><summary>AI help usage · {totals.requests} request{totals.requests===1?'':'s'}</summary><dl>{[['Input tokens',totals.input],['Output tokens',totals.output]].map(([label,item])=>{const metric=item as typeof totals.input;return <div key={String(label)}><dt>{String(label)}</dt><dd>{metric.value===null?'Not reported':metric.value.toLocaleString()}{metric.missing>0&&metric.value!==null?' (reported subtotal)':''}</dd></div>;})}</dl><p>Provider measurements for this app session. Missing counts are unknown. Cached input is included in input; reasoning is included in output. Your game’s creation usage is separate.</p></details>;
}
export default function AsterAIAnswer({result,onSource,onHelp,onConnect,canOpenSource,canHelp,label='Aster AI answer',historical=false}:{label?:string;historical?:boolean;result:AsterAIResult;onSource:(reference:EvidenceReference)=>void;onHelp:()=>void;onConnect:()=>void;canOpenSource:boolean;canHelp:boolean}){
 return <section className="aster-ai-answer" aria-label={label}><span className="aster-eyebrow">{result.status==='answered'?result.contextFingerprint?(result.citations.length?'SOURCES & CURRENT ACTIVITY':'YOUR CURRENT ACTIVITY'):result.citations.length?'AI EXPLANATION · WITH SOURCES':'AI ASTER':'ASTER CHECKED YOUR MATERIAL'}</span>{result.answer.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{renderAsterText(paragraph)}</p>)}
  {result.status==='not-supported'&&result.retrieval.passages.length>0&&<details><summary>Related passages Aster checked</summary>{result.retrieval.passages.map(({reference,sourceTitle},index)=><blockquote key={`${reference.sourceId}-${reference.start}-${index}`}><p>{reference.quote}</p><footer>{sourceTitle} · {canOpenSource?<button type="button" onClick={()=>onSource(reference)}>{reference.locator.label} · Open source</button>:reference.locator.label}</footer></blockquote>)}</details>}
  {result.citations.length>0&&<details><summary>Read the supporting passages</summary>{result.citations.map((reference,index)=><blockquote key={`${reference.sourceId}-${reference.start}-${index}`}><p>{reference.quote}</p><footer>{canOpenSource?<button type="button" onClick={()=>onSource(reference)}>Source {index+1} · {reference.locator.label}</button>:<>Source {index+1} · {reference.locator.label}</>}</footer></blockquote>)}</details>}
  {historical&&<small>Earlier reply. Ask again for current activity or progress.</small>}
  <div className="aster-ai-actions">{!historical&&result.actions.map((action,index)=>action.type==='open-source'?(canOpenSource&&<button type="button" key={index} onClick={()=>onSource(action.reference)}>{action.label}</button>):action.type==='open-current-help'?(canHelp&&<button type="button" key={index} onClick={onHelp}>{action.label}</button>):<button type="button" key={index} onClick={onConnect}>{action.label}</button>)}</div>
  {(result.status!=='answered'||result.citations.length>0)&&<small>{result.status==='answered'?'AI can make mistakes. Check the cited passages when a detail matters.':'I’ll keep the explanation grounded in your material. The source reader is available if you want to look at the surrounding section.'}</small>}
 </section>;
}
