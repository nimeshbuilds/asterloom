import { useId } from 'react';
import type { RecallActivity, RecallResponse } from '../lib/recallEngine';

export default function RecallBoard({activity,response,onChange}:{activity:RecallActivity;response:RecallResponse;onChange:(response:RecallResponse)=>void}) {
  const prefix=useId();
  return <section className="completion-workbench" aria-label="Source recall locks">
    <p>Recall the source’s term to open each lock. You can reveal a term to practise with support.</p>
    <div className="completion-slots">{activity.questions.map((question,index)=><article className="completion-slot" key={question.id}>
      <div className="completion-slot-number">Lock {index+1} of {activity.questions.length}</div>
      <label htmlFor={`${prefix}-${question.id}`}>{question.prompt}</label>
      <input id={`${prefix}-${question.id}`} value={response.answers[question.id]??''} maxLength={2000} autoComplete="off" onChange={event=>onChange({...response,selectedQuestionId:question.id,answers:{...response.answers,[question.id]:event.target.value}})}/>
      {response.revealedIds.includes(question.id)?<p role="status"><strong>{question.answer}</strong> — {question.reason}<br/><small>This lock is supported practice.</small></p>:<button type="button" onClick={()=>onChange({...response,selectedQuestionId:question.id,revealedIds:[...response.revealedIds,question.id]})}>Reveal this term</button>}
    </article>)}</div>
  </section>;
}
