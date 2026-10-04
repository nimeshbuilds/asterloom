import { useId } from 'react';
import { ArrowRight, Layers3, MousePointer2, RotateCcw } from 'lucide-react';
import type { CompletionActivity, CompletionResponse } from '../lib/completionEngine';
import './extended.css';
import './completion.css';

/** Arrange only the author's prepared pieces. Filled is progress, never a correctness signal. */
export default function CompletionBoard({ activity, response, onChange }: { activity: CompletionActivity; response: CompletionResponse; onChange: (value: CompletionResponse) => void }) {
  const prefix = useId(),selected=activity.tokens.find(token=>token.id===response.selectedTokenId);
  const filled=activity.slots.filter(slot=>activity.tokens.some(token=>token.id===response.slotTokens[slot.id])).length;
  function place(slotId:string,tokenId:string){onChange({...response,slotTokens:{...response.slotTokens,[slotId]:tokenId}});}
  return <div className={`completion-workbench${activity.pattern ? ' pattern-workbench' : ''}`}>
    <div className="extended-context"><span className="structured-kicker">{activity.pattern ? 'The repeating rule' : 'Worked context'}</span><p>{activity.context}</p></div>
    {activity.pattern && <div className="pattern-demonstration" aria-label="Demonstrated pattern">{activity.pattern.shown.map((id, i) => <span key={i}>{activity.tokens.find(t => t.id === id)?.label}</span>)}<span aria-hidden="true">→</span></div>}
    <div className="completion-progress"><div><Layers3 size={20} aria-hidden="true"/><strong>{filled} of {activity.slots.length} places built</strong></div><span>Arrangement progress · check the model to assess it</span><progress value={filled} max={activity.slots.length} aria-label="Positions filled"/></div>
    <div className="completion-building-area">
      <section className="completion-tray" aria-label="Prepared source pieces"><h3>Choose a piece</h3><p>Then choose a place in the model. Pieces can be used again.</p><div className="completion-token-list">{activity.tokens.map((token,index)=><button type="button" key={token.id} className="completion-token" data-tone={index%5} aria-pressed={selected?.id===token.id} onClick={()=>onChange({...response,selectedTokenId:selected?.id===token.id?'':token.id})}><span>{token.label}</span></button>)}</div><p className="completion-selection" role="status"><MousePointer2 size={16} aria-hidden="true"/>{selected?`Selected: ${selected.label}`:'Select a source piece to begin.'}</p></section>
      <section className="completion-model" aria-label="Build the source model"><h3>{activity.pattern?'Extend the pattern':'Build the model'}</h3><div className="completion-slots">{activity.slots.map((slot,i)=>{const token=activity.tokens.find(t=>t.id===response.slotTokens[slot.id]);return <article className={`completion-slot ${token?'filled':''}`} key={slot.id}>
        <div className="completion-slot-number"><span aria-hidden="true">{i+1}</span><span>Position {i+1}</span>{token&&<button type="button" className="completion-clear" aria-label={`Clear position ${i+1}`} onClick={()=>place(slot.id,'')}><RotateCcw size={15} aria-hidden="true"/></button>}</div>
        <div className="completion-statement"><span id={`${prefix}-before-${slot.id}`}>{slot.before}</span><button type="button" className="completion-placement" aria-label={`Place selected piece at position ${i+1}`} aria-describedby={`${prefix}-before-${slot.id} ${prefix}-after-${slot.id}`} disabled={!selected} onClick={()=>{if(selected)place(slot.id,selected.id);}}><ArrowRight size={16} aria-hidden="true"/>{token?token.label:selected?'Place selected piece':'Choose a piece from the tray'}</button><span id={`${prefix}-after-${slot.id}`}>{slot.after}</span></div>
      </article>;})}</div></section>
    </div>
    <details className="completion-direct"><summary>Choose pieces directly</summary><p>These controls edit the same saved model, one position at a time.</p><div>{activity.slots.map((slot,i)=><label key={slot.id} htmlFor={`${prefix}-${slot.id}`}><span>Position {i+1}</span><select id={`${prefix}-${slot.id}`} aria-label={`Complete position ${i+1}`} value={response.slotTokens[slot.id]??''} onChange={event=>place(slot.id,event.target.value)}><option value="">Choose a piece…</option>{activity.tokens.map(token=><option key={token.id} value={token.id}>{token.label}</option>)}</select></label>)}</div></details>
    {filled>0&&<section className="completion-preview" aria-label="Current constructed model"><h3>Your model so far</h3><ol>{activity.slots.map((slot,i)=>{const token=activity.tokens.find(t=>t.id===response.slotTokens[slot.id]);return <li key={slot.id}><span className="completion-preview-number">{i+1}</span><p>{slot.before} <strong>{token?.label??'[piece still needed]'}</strong> {slot.after}</p></li>;})}</ol><p className="completion-preview-note">This preview shows your choices. Use the mission’s check control when you are ready for source-backed feedback.</p></section>}
  </div>;
}
