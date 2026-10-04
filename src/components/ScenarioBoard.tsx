import { useMemo, useState } from 'react';
import { ArrowRight, Check, Compass, FileSearch, Flag, RotateCcw, Sparkles } from 'lucide-react';
import { advanceScenario, initialScenarioResponse, replayScenario, scenarioAvailableActions } from '../lib/scenarioEngine';
import type { ScenarioActivity, ScenarioResponse } from '../lib/scenarioEngine';
import ScenarioCommitments from './ScenarioCommitments';
import ScenarioInteractions from './ScenarioInteractions';
import '../scenario.css';

export interface ScenarioBoardProps {
  activity: ScenarioActivity;
  response: ScenarioResponse;
  onChange: (response: ScenarioResponse) => void;
  disabled?: boolean;
}

/** Interaction only: StructuredBoard owns author review, assistance, grading and persistence. */
export default function ScenarioBoard({ activity, response, onChange, disabled = false }: ScenarioBoardProps) {
  const snapshot = useMemo(() => replayScenario(activity, response), [activity, response]);
  const choices = useMemo(() => scenarioAvailableActions(activity, response), [activity, response]);
  const [actionError, setActionError] = useState('');
  const visible = activity.variables.filter(variable => variable.visibility === 'visible');
  const roleView = activity.scenarioPresentation?.dialogue?.roles.find(role => role.id === snapshot.dialogue?.currentRoleId);
  const interactionMode = !!(activity.scenarioPresentation?.dialogue || activity.scenarioPresentation?.promptComparison);
  const found = activity.observations.filter(observation => snapshot.observationIds.includes(observation.id) && (!roleView || roleView.observationIds.includes(observation.id)));
  const selected = choices.find(item => item.action.id === response.selectedActionId);
  const last = snapshot.history.at(-1);
  const phaseText = { active: 'Investigation open', success: 'Outcome reached', failed: 'Stopping condition reached', exhausted: 'Run finished', invalid: 'Case needs attention' }[snapshot.phase];
  const reset = () => { setActionError(''); onChange(initialScenarioResponse(activity)); };
  const takeAction = () => {
    const result = advanceScenario(activity, response, response.selectedActionId);
    if (!result.success) { setActionError(result.error); return; }
    setActionError(''); onChange(result.response);
  };
  const toggleEvidence = (id: string, checked: boolean) => onChange({ ...response, selectedEvidenceIds: checked ? [...response.selectedEvidenceIds.filter(value => value !== id), id] : response.selectedEvidenceIds.filter(value => value !== id) });

  if (snapshot.phase === 'invalid') return <section className="scenario-invalid" aria-label="Scenario unavailable">
    <Flag aria-hidden="true" size={24}/><h3>Review this case before continuing</h3><p role="alert">{snapshot.error}</p>
    {activity.reviewStatus === 'reviewed' && <button type="button" className="button secondary" disabled={disabled} onClick={reset}><RotateCcw size={16} aria-hidden="true"/> Start a fresh investigation</button>}
  </section>;

  return <section className="scenario-board" aria-label="Stateful investigation">
    <div className="scenario-run-header">
      <div className="scenario-run-mark"><Compass size={22} aria-hidden="true"/><div><span className="scenario-kicker">Your investigation</span><strong>{phaseText}</strong></div></div>
      <span className="scenario-step">{snapshot.history.length} / {activity.maxSteps} actions</span>
    </div>
    {response.notice && <p className="scenario-notice" role="status">{response.notice}</p>}
    <div className="scenario-dashboard">
      <div className="scenario-resource"><div><span>{activity.budget.label} remaining</span><strong>{snapshot.remaining}<small> / {activity.budget.limit}</small></strong></div><meter min={0} max={activity.budget.limit} value={snapshot.remaining} aria-label={`${activity.budget.label} remaining`}/><p>Every decision uses the amount shown on its action.</p></div>
      <dl className="scenario-state">{visible.map(variable => <div key={variable.id}><dt>{variable.label}</dt><dd>{typeof snapshot.state[variable.id] === 'boolean' ? snapshot.state[variable.id] ? <><Check size={15} aria-hidden="true"/> Yes</> : 'Not yet' : String(snapshot.state[variable.id])}</dd></div>)}</dl>
    </div>
    <div className="scenario-objectives"><span className="scenario-kicker"><Flag size={13} aria-hidden="true"/> Your objective</span><ul>{activity.objectives.map(objective => <li key={objective.id}>{objective.label}</li>)}</ul></div>
    <ScenarioInteractions activity={activity} response={response} snapshot={snapshot} onChange={onChange} disabled={disabled}/>
    <ScenarioCommitments activity={activity} response={response} snapshot={snapshot} onChange={onChange} disabled={disabled}/>
    <div className={`scenario-consequence ${snapshot.phase}`} role="status" aria-live="polite" aria-atomic="true">
      <Sparkles size={18} aria-hidden="true"/>
      <div><strong>{last ? `After action ${last.step}` : 'Where you begin'}</strong><p>{last?.consequence ?? 'Read the initial observations, choose a useful action, and watch what changes.'}</p>
        {snapshot.phase === 'success' && <p className="scenario-next-instruction">Complete the reviewed reflection above, select the evidence for your conclusion, then choose “Check my work”.</p>}
        {(snapshot.phase === 'failed' || snapshot.phase === 'exhausted') && <p className="scenario-next-instruction">Review your decision history, then start a fresh investigation to try a different plan.</p>}
      </div>
    </div>
    <div className={`scenario-workspace ${interactionMode ? 'scenario-interaction-evidence' : ''}`}>
      {!interactionMode && <section className="scenario-actions" aria-labelledby={`${activity.id}-actions-title`}>
        <div className="scenario-section-heading"><span className="scenario-kicker">01 / Take a decision</span><h3 id={`${activity.id}-actions-title`}>What will you do next?</h3><p>Inspect, change, and verify. Actions can change the situation or reveal new evidence.</p></div>
        <fieldset disabled={disabled || snapshot.phase !== 'active'}><legend className="scenario-sr-only">Choose the next action</legend>
          {choices.map(({ action, available, reason }) => <label key={action.id} className={`scenario-action ${response.selectedActionId === action.id ? 'selected' : ''} ${!available ? 'unavailable' : ''}`}>
            <input type="radio" name={`${activity.id}-action`} value={action.id} checked={response.selectedActionId === action.id} disabled={!available} aria-describedby={`${activity.id}-${action.id}-description`} onChange={() => { setActionError(''); onChange({ ...response, selectedActionId: action.id }); }}/>
            <span className="scenario-action-content"><span className="scenario-action-top"><strong>{action.label}</strong><span>{action.cost} {activity.budget.label}</span></span><span id={`${activity.id}-${action.id}-description`} className="scenario-action-description">{action.description}{reason && <em>{reason}</em>}</span></span>
          </label>)}
        </fieldset>
        <button type="button" className="button primary scenario-commit" disabled={disabled || !selected?.available} onClick={takeAction}>Take this action <ArrowRight aria-hidden="true" size={16}/></button>
        {actionError && <p className="scenario-notice" role="alert">{actionError}</p>}
      </section>}
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
    </div>
    <section className="scenario-history" aria-labelledby={`${activity.id}-history-title`}>
      <div className="scenario-history-heading"><div><span className="scenario-kicker">The path you took</span><h3 id={`${activity.id}-history-title`}>Decision & consequence history</h3></div><button type="button" className="button secondary" disabled={disabled || (!response.actions.length && !response.commitments?.length)} onClick={reset}><RotateCcw size={15} aria-hidden="true"/> Start a new run</button></div>
      {!snapshot.history.length ? <p className="scenario-empty">Your choices will form a replayable record here. Progress saves after each action and evidence selection.</p> : <ol>{snapshot.history.map(entry => <li key={entry.step}>
        <span className="scenario-history-number" aria-hidden="true">{entry.step}</span><div><div className="scenario-history-title"><strong>{activity.actions.find(item => item.id === entry.actionId)?.label}</strong><span>−{entry.cost} {activity.budget.label}</span></div><p>{entry.consequence}</p>
          {entry.changes.filter(change => visible.some(variable => variable.id === change.field)).length > 0 && <ul className="scenario-changes">{entry.changes.filter(change => visible.some(variable => variable.id === change.field)).map(change => <li key={change.field}>{visible.find(variable => variable.id === change.field)?.label}: <span>{String(change.before)} → {String(change.after)}</span></li>)}</ul>}
          {entry.revealed.length > 0 && <small>{entry.revealed.length} new observation{entry.revealed.length === 1 ? '' : 's'} recorded</small>}
        </div>
      </li>)}</ol>}
    </section>
  </section>;
}
