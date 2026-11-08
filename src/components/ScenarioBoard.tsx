import { useMemo, useState } from 'react';
import { Compass, FileSearch, Flag, RotateCcw, Sparkles } from 'lucide-react';
import { advanceScenario, initialScenarioResponse, replayScenario, scenarioAvailableActions } from '../lib/scenarioEngine';
import { scenarioCommitmentDetails } from '../lib/scenarioCommitments';
import type { ScenarioActivity, ScenarioResponse } from '../lib/scenarioEngine';
import ScenarioCommitments from './ScenarioCommitments';
import ScenarioInteractions from './ScenarioInteractions';
import ScenarioWorld from './ScenarioWorld';
import type {SceneFeedbackEvent} from '../lib/sceneFeedback';
import type {GameAudioDirection} from '../lib/gameArtDirection';
import '../scenario.css';

export interface ScenarioBoardProps {
  activity: ScenarioActivity;
  response: ScenarioResponse;
  onChange: (response: ScenarioResponse) => void;
  /** Station inspection changes presentation only, not the checked solution. */
  onInspect?: (response: ScenarioResponse) => void;
  disabled?: boolean;
  storySetting?:string;artDirection?:GameAudioDirection;scaffoldId?: string;theme?: string;ageGroup?: string;actionFeedback?:SceneFeedbackEvent;feedback?:{event:number;outcome:'complete'|'retry'|'reflection'};
}

/** Interaction only: StructuredBoard owns author review, assistance, grading and persistence. */
export default function ScenarioBoard({ activity, response, onChange, onInspect = onChange, disabled = false,scaffoldId,theme,ageGroup,actionFeedback,feedback,storySetting,artDirection }: ScenarioBoardProps) {
  const snapshot = useMemo(() => replayScenario(activity, response, {practice:true}), [activity, response]);
  const choices = useMemo(() => scenarioAvailableActions(activity, response, {practice:true}), [activity, response]);
  const [actionError, setActionError] = useState('');
  const visible = activity.variables.filter(variable => variable.visibility === 'visible');
  const roleView = activity.scenarioPresentation?.dialogue?.roles.find(role => role.id === snapshot.dialogue?.currentRoleId);
  const interactionMode = !!(activity.scenarioPresentation?.dialogue || activity.scenarioPresentation?.promptComparison);
  const found = activity.observations.filter(observation => snapshot.observationIds.includes(observation.id) && (!roleView || roleView.observationIds.includes(observation.id)));
  const last = snapshot.history.at(-1);
  const [evidenceOpen,setEvidenceOpen]=useState(false);
  const phaseText = { active: 'Investigation open', success: 'Outcome reached', failed: 'Stopping condition reached', exhausted: 'Run finished', invalid: 'Case needs attention' }[snapshot.phase];
  const pendingCommitments = snapshot.phase === 'success' ? scenarioCommitmentDetails(activity, snapshot).filter(detail => !detail.correct) : [];
  const pendingReviewInstructions = [...new Set(pendingCommitments.map(detail => {
    if (detail.id === 'prediction-review') return 'Compare your current hypothesis with the discovered observations and record your outcome review above.';
    if (detail.id === 'dialogue-debrief') return activity.scenarioPresentation?.dialogue?.requiredRoleIds.some(id => !snapshot.dialogue?.visitedRoleIds.includes(id)) ? 'Inspect the required perspectives and record the conversation debrief above.' : 'Review what the conversation supports and record the conversation debrief above.';
    if (detail.id.startsWith('prompt-')) return 'Compare every rubric criterion and record the comparison review above.';
    const stage = activity.scenarioPresentation?.campaign?.stages.find(stage => detail.id === `campaign-${stage.id}`);
    return stage ? `Complete the ${stage.transfer ? 'transfer' : 'stage'} debrief above for “${stage.title}”.` : detail.message;
  }))];
  const reset = () => { setActionError(''); onChange(initialScenarioResponse(activity)); };
  const takeAction = () => {
    const result = advanceScenario(activity, response, response.selectedActionId, {practice:true});
    if (!result.success) { setActionError(result.error); return; }
    setActionError(''); onChange(result.response); if(result.snapshot.phase==='success')setEvidenceOpen(true);
  };
  const toggleEvidence = (id: string, checked: boolean) => onChange({ ...response, selectedEvidenceIds: checked ? [...response.selectedEvidenceIds.filter(value => value !== id), id] : response.selectedEvidenceIds.filter(value => value !== id) });

  if (snapshot.phase === 'invalid') return <section className="scenario-invalid" aria-label="Scenario unavailable">
    <Flag aria-hidden="true" size={24}/><h3>Review this case before continuing</h3><p role="alert">{snapshot.error}</p>
    {activity.reviewStatus === 'reviewed' && <button type="button" className="button secondary" disabled={disabled} onClick={reset}><RotateCcw size={16} aria-hidden="true"/> Start a fresh investigation</button>}
  </section>;

  return <section className="scenario-board" aria-label="Stateful investigation">
    {interactionMode&&<div className="scenario-run-header">
      <div className="scenario-run-mark"><Compass size={22} aria-hidden="true"/><div><span className="scenario-kicker">Your investigation</span><strong>{phaseText}</strong></div></div>
      <span className="scenario-step">{snapshot.history.length} / {activity.maxSteps} actions</span>
    </div>
    }
    {response.notice && <p className="scenario-notice" role="status">{response.notice}</p>}
    {interactionMode&&<div className="scenario-objectives"><span className="scenario-kicker"><Flag size={13} aria-hidden="true"/> Your objective</span><ul>{activity.objectives.map(objective => <li key={objective.id}>{objective.label}</li>)}</ul></div>}
    {interactionMode&&<div className="scenario-dashboard" aria-label="Conversation resources and situation">
      <div className="scenario-resource"><div><span>{activity.budget.label} remaining</span><strong>{snapshot.remaining}<small> / {activity.budget.limit}</small></strong></div><meter min={0} max={activity.budget.limit} value={snapshot.remaining} aria-label={`${activity.budget.label} remaining`}/><p>Each action uses the amount shown.</p></div>
      <dl className="scenario-state">{visible.map(variable=><div key={variable.id}><dt>{variable.label}</dt><dd>{typeof snapshot.state[variable.id]==='boolean'?snapshot.state[variable.id]?'Yes':'Not yet':String(snapshot.state[variable.id])}</dd></div>)}</dl>
    </div>}
    <ScenarioInteractions activity={activity} response={response} snapshot={snapshot} onChange={onChange} disabled={disabled}/>
    <ScenarioCommitments activity={activity} response={response} snapshot={snapshot} onChange={onChange} disabled={disabled}/>
    {!interactionMode&&<ScenarioWorld storySetting={storySetting} artDirection={artDirection} activity={activity} response={response} snapshot={snapshot} choices={choices} disabled={disabled} scaffoldId={scaffoldId} theme={theme} ageGroup={ageGroup} actionFeedback={actionFeedback} feedback={feedback} onSelect={id=>{setActionError('');onInspect({...response,selectedActionId:id});}} onAct={takeAction}/>}
    {actionError&&<p className="scenario-notice" role="alert">{actionError}</p>}
    <div className={`scenario-consequence ${snapshot.phase}`} role="status" aria-live="polite" aria-atomic="true">
      <Sparkles size={18} aria-hidden="true"/>
      <div><strong>{last ? `After action ${last.step}` : 'Where you begin'}</strong><p>{last?.consequence ?? found[0]?.text ?? 'Read the initial observations, choose a useful action, and watch what changes.'}</p>
        {snapshot.phase === 'success' && <p className="scenario-next-instruction">{pendingReviewInstructions.length ? `The outcome is reached. ${pendingReviewInstructions.join(' ')} Finish the review before selecting your final evidence.` : 'The outcome is reached. Open your evidence, select observations that support the objective, then check your work.'}</p>}
        {(snapshot.phase === 'failed' || snapshot.phase === 'exhausted') && <p className="scenario-next-instruction">Use your decision record to see what happened. Start a new run to try a different plan.</p>}
      </div>
      {last&&last.revealed.length>0&&<span className="scenario-discovery-count">+{last.revealed.length} discovered</span>}
    </div>
    <details className="scenario-evidence-drawer" open={evidenceOpen} onToggle={event=>setEvidenceOpen(event.currentTarget.open)}><summary><FileSearch size={19}/><span>Your evidence <small>{found.length} discovered · {response.selectedEvidenceIds.length} selected for your conclusion</small></span><span>{evidenceOpen?'Close':'Open'}</span></summary>
    <div className="scenario-workspace scenario-interaction-evidence">
      <section className="scenario-evidence" aria-labelledby={`${activity.id}-evidence-title`}>
        <div className="scenario-section-heading"><span className="scenario-kicker">02 / Build a conclusion</span><h3 id={`${activity.id}-evidence-title`}><FileSearch size={20} aria-hidden="true"/> Your evidence notebook</h3><p>Only discovered observations are available. Select the ones that support the stated objective.</p></div>
        <fieldset disabled={disabled}><legend className="scenario-sr-only">Evidence supporting your conclusion</legend>
          {found.map((observation, index) => <label key={observation.id} className={`scenario-observation ${response.selectedEvidenceIds.includes(observation.id) ? 'selected' : ''}`}>
            <input type="checkbox" checked={response.selectedEvidenceIds.includes(observation.id)} onChange={event => toggleEvidence(observation.id, event.target.checked)}/>
            <span><small>Observation {index + 1}</small><strong>{observation.label}</strong><span>{observation.text}</span><em>Source reference{observation.evidenceRefs.length === 1 ? '' : 's'} {observation.evidenceRefs.map(ref => ref + 1).join(', ')}</em></span>
          </label>)}
          {!found.length && <p className="scenario-empty">Take an investigative action to discover the first observation.</p>}
        </fieldset>
        <p className="scenario-evidence-count" aria-live="polite">{response.selectedEvidenceIds.length} selected · {found.length} discovered</p>
      </section>
    </div></details>
    <details className="scenario-history-drawer"><summary>Decision record <span>{snapshot.history.length} moves</span></summary>
    <section className="scenario-history" aria-labelledby={`${activity.id}-history-title`}>
      <div className="scenario-history-heading"><div><span className="scenario-kicker">The path you took</span><h3 id={`${activity.id}-history-title`}>Decision & consequence history</h3></div></div>
      {!snapshot.history.length ? <p className="scenario-empty">Your choices will form a replayable record here. Progress saves after each action and evidence selection.</p> : <ol>{snapshot.history.map(entry => <li key={entry.step}>
        <span className="scenario-history-number" aria-hidden="true">{entry.step}</span><div><div className="scenario-history-title"><strong>{activity.actions.find(item => item.id === entry.actionId)?.label}</strong><span>−{entry.cost} {activity.budget.label}</span></div><p>{entry.consequence}</p>
          {entry.changes.filter(change => visible.some(variable => variable.id === change.field)).length > 0 && <ul className="scenario-changes">{entry.changes.filter(change => visible.some(variable => variable.id === change.field)).map(change => <li key={change.field}>{visible.find(variable => variable.id === change.field)?.label}: <span>{String(change.before)} → {String(change.after)}</span></li>)}</ul>}
          {entry.revealed.length > 0 && <small>{entry.revealed.length} new observation{entry.revealed.length === 1 ? '' : 's'} recorded</small>}
        </div>
      </li>)}</ol>}
    </section></details>
    <div className="scenario-run-controls"><span>{snapshot.phase==='active'?'Your decisions and discoveries save as you play.':phaseText}</span><button type="button" disabled={disabled||(!response.actions.length&&!response.commitments?.length)} onClick={reset}><RotateCcw size={15}/>Start a new run</button></div>
  </section>;
}
