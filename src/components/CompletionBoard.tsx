import { useId } from 'react';
import type { CompletionActivity, CompletionResponse } from '../lib/completionEngine';
import './extended.css';
export default function CompletionBoard({ activity, response, onChange }: { activity: CompletionActivity; response: CompletionResponse; onChange: (value: CompletionResponse) => void }) {
  const prefix = useId();
  return <div className={`completion-workbench${activity.pattern ? ' pattern-workbench' : ''}`}>
    <div className="extended-context"><span className="structured-kicker">{activity.pattern ? 'The repeating rule' : 'Worked context'}</span><p>{activity.context}</p></div>
    {activity.pattern && <div className="pattern-demonstration" aria-label="Demonstrated pattern">{activity.pattern.shown.map((id, i) => <span key={i}>{activity.tokens.find(t => t.id === id)?.label}</span>)}<span aria-hidden="true">→</span></div>}
    <div className="completion-slots">{activity.slots.map((slot, i) => <div className="completion-slot" key={slot.id}><span className="structured-step-number">{i + 1}</span><label htmlFor={`${prefix}-${slot.id}`}><span>{slot.before || `Position ${i + 1}`}</span><select id={`${prefix}-${slot.id}`} aria-label={`Complete position ${i + 1}`} value={response.slotTokens[slot.id]} onChange={e => onChange({ slotTokens: { ...response.slotTokens, [slot.id]: e.target.value } })}><option value="">Choose a piece…</option>{activity.tokens.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><span>{slot.after}</span></label></div>)}</div>
    <p className="structured-helper">Pieces may be used again. The model accepts every alternative explicitly supported by the source.</p>
  </div>;
}
