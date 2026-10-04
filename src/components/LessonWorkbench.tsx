import { CheckCircle2, FileText, Lightbulb, MoveRight } from 'lucide-react';
import { lessonRehearsalChecks, lessonRehearsalReady, type LearningPlan, type LessonRehearsalState } from '../lib/learningBriefing';

/** Source-open rehearsal: every piece and every corrective example has an exact citation. */
export default function LessonWorkbench({plan,state,onChange,disabled=false}:{plan:LearningPlan;state:LessonRehearsalState;onChange:(state:LessonRehearsalState)=>void;disabled?:boolean}) {
  const kit=plan.rehearsal!,young=plan.ageGroup==='3-5'||plan.ageGroup==='6-8';
  const placedCount=kit.slots.filter(slot=>state.answers[slot.id]).length;
  const checks=lessonRehearsalChecks(plan,state),ready=lessonRehearsalReady(plan,state);
  const selected=kit.tiles.find(tile=>tile.id===state.selectedTileId);
  function place(slotId:string){
    if(!selected)return;
    const answers=Object.fromEntries(Object.entries(state.answers).filter(([id,tile])=>id!==slotId&&tile!==selected.id));
    onChange({...state,answers:{...answers,[slotId]:selected.id},selectedTileId:'',checked:false});
  }
  return <div className="lesson-workbench" data-kit={kit.kind}>
    <div className="lesson-kit-figures">{plan.media.filter(media=>media.kind==='image').map(media=><figure key={media.sourceId}><img src={media.url} alt={media.alt}/><figcaption>{media.title} · supplied source image</figcaption></figure>)}</div>
    <div className="lesson-kit-coach"><Lightbulb size={21} aria-hidden="true"/><div><strong>{young?'Let’s build together':'A first move, worked for you'}</strong><p>{young?'A grown-up reads the source with you. One piece is already placed. Choose another piece and try a place for it.':kit.kind==='route-kit'?'The first source step is already placed. Read its action, then build the rest of the route.':'One connection is already placed. Its source line shows how the term and meaning belong together; build the remaining connections.'}</p></div></div>
    <div className="lesson-kit-progress"><label htmlFor={`kit-progress-${plan.id}`}>Pieces placed <strong>{placedCount} / {kit.slots.length}</strong></label><progress id={`kit-progress-${plan.id}`} value={placedCount} max={kit.slots.length}/><small>Placement progress · check the source to test the arrangement</small></div><div className="lesson-kit-board">
      <section className="lesson-kit-pieces" aria-label={kit.kind==='route-kit'?'Source step tiles':'Source term tiles'}>
        <h3>{kit.kind==='route-kit'?'Your source steps':'Your source ideas'}</h3>
        <p>Choose a piece, then a place.</p>
        {[...kit.tiles].reverse().map(tile=>{const placed=Object.values(state.answers).includes(tile.id);return <button key={tile.id} type="button" aria-pressed={state.selectedTileId===tile.id} disabled={disabled} className={`lesson-kit-piece ${placed?'placed':''}`} onClick={()=>onChange({...state,selectedTileId:state.selectedTileId===tile.id?'':tile.id})}><span>{tile.label}</span>{placed&&<CheckCircle2 size={17} aria-label="Placed"/>}</button>;})}
        <p className="lesson-kit-selection" role="status">{selected?`Selected: ${selected.label}. Choose its place in your kit.`:'You can move a placed piece to revise your kit.'}</p>
      </section>
      <section className="lesson-kit-assembly" aria-label="My mission kit">
        <h3>{kit.kind==='route-kit'?'The source route':'Your field guide'}</h3>
        <ol>{kit.slots.map((slot,index)=>{const tile=kit.tiles.find(t=>t.id===state.answers[slot.id]),shown=state.revealed.includes(slot.id),checked=state.checked?checks.find(c=>c.id===slot.id):undefined,correction=!!checked&&!checked.correct;return <li key={slot.id} className={`lesson-kit-slot ${checked?checked.correct?'matched':'revisit':''}`}>
          <div className="lesson-kit-slot-heading"><span className="lesson-kit-number" aria-hidden="true">{index+1}</span><p>{slot.label}</p></div>
          <button type="button" className="lesson-kit-place" disabled={disabled||!selected} aria-label={`Place selected piece in slot ${index+1}`} onClick={()=>place(slot.id)}><MoveRight size={16} aria-hidden="true"/>{tile?tile.label:selected?`Place ${selected.label}`:'Choose a piece to place here'}</button>
          {checked&&<p className="lesson-kit-feedback">{checked.correct?'This placement matches the source.':'Revisit this placement. The source line below shows the relationship to use.'}</p>}
          <button type="button" className="lesson-kit-clue" disabled={disabled||correction} aria-expanded={shown||correction} aria-controls={`kit-evidence-${slot.id}`} onClick={()=>onChange({...state,revealed:shown?state.revealed.filter(id=>id!==slot.id):[...state.revealed,slot.id]})}>{correction?'Source line shown':shown?'Close source line':'Inspect source line'}</button>
          {(shown||correction)&&<div id={`kit-evidence-${slot.id}`} className="lesson-kit-evidence"><blockquote>{slot.reference.quote}</blockquote><div className="lesson-citation"><FileText size={14} aria-hidden="true"/><span>{plan.passages.find(p=>p.reference.sourceId===slot.reference.sourceId)?.title} · {slot.reference.locator.label}</span></div></div>}
        </li>;})}</ol>
      </section>
    </div>
    <div className="lesson-kit-check"><button type="button" disabled={disabled||!kit.slots.every(slot=>state.answers[slot.id])} onClick={()=>onChange({...state,selectedTileId:'',checked:true})}>Check my kit against the source</button><p role="status">{ready?'Your kit is ready to carry into the quest. This was source-supported preparation, not an independent assessment.':state.checked?'Some pieces need another look. Use the cited line, adjust your kit and check again.':'Build every connection, then check. The source stays open while you practise.'}</p></div>
  </div>;
}
