import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Flag, Lightbulb, Plus, Route, Trash2 } from 'lucide-react';
import type { ScenarioActivity, ScenarioResponse, ScenarioSnapshot } from '../lib/scenarioEngine';
import { recordScenarioCommitment, scenarioConditionMet } from '../lib/scenarioEngine';
import { currentCampaignPlan, currentCampaignStage, predictionOutcomesReady } from '../lib/scenarioCommitments';
import type { ScenarioCommitmentInput, ScenarioModeDraft } from '../lib/scenarioCommitments';

interface Props { activity: ScenarioActivity; response: ScenarioResponse; snapshot: ScenarioSnapshot; onChange: (response: ScenarioResponse) => void; disabled?: boolean }
export default function ScenarioCommitments({ activity, response, snapshot, onChange, disabled = false }: Props) {
  const [error, setError] = useState('');
  const presentation = activity.scenarioPresentation;
  if (!presentation?.prediction && !presentation?.campaign) return null;
  const draft = response.modeDraft ?? {};
  const patch = (value: Partial<ScenarioModeDraft>) => { setError(''); onChange({ ...response, modeDraft: { ...draft, ...value } }); };
  const commit = (entry: ScenarioCommitmentInput) => {
    const result = recordScenarioCommitment(activity, response, entry);
    if (!result.success) { setError(result.error); return; }
    setError(''); onChange(result.response);
  };
  const prediction = presentation.prediction, p = snapshot.prediction;
  const outcomeReady = predictionOutcomesReady(activity, snapshot);
  const hypothesisId = draft.hypothesisId ?? p?.finalChoiceId ?? p?.initialChoiceId ?? '';
  const reviewId = draft.reviewId ?? p?.reviewId ?? '';
  const campaign = presentation.campaign, stage = currentCampaignStage(activity, snapshot), plan = currentCampaignPlan(snapshot);
  const stageReady = !!stage && scenarioConditionMet(stage.completionWhen, snapshot.state);
  const stageDraft = draft.stageId === stage?.id ? draft : {};
  const planned = stageDraft.plannedActionIds ?? [];
  const chosenPlanAction = stageDraft.planActionId ?? '';
  const editPlan = (values: string[]) => patch({ stageId: stage?.id, plannedActionIds: values });
  const movePlan = (index: number, direction: number) => { const next = [...planned]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; editPlan(next); };
  const actionLabel = (id: string) => activity.actions.find(action => action.id === id)?.label ?? id;
  return <div className="scenario-commitments">
    {prediction && p && <section className="scenario-prediction" aria-labelledby={`${activity.id}-prediction-title`}>
      <div className="scenario-mode-heading"><Lightbulb size={21} aria-hidden="true"/><div><span className="scenario-kicker">Predict · observe · revise</span><h3 id={`${activity.id}-prediction-title`}>Keep a record of your thinking</h3></div></div>
      <p className="scenario-mode-intro">Initial predictions are ungraded. Your final explanation is assessed using the observations you collect.</p>
      {!p.initialChoiceId ? <>
        <fieldset disabled={disabled}><legend>{prediction.prompt}</legend>{prediction.hypotheses.map(choice => <label className="scenario-mode-choice" key={choice.id}><input type="radio" name={`${activity.id}-initial-hypothesis`} checked={hypothesisId === choice.id} onChange={() => patch({ hypothesisId: choice.id })}/><span><strong>{choice.label}</strong><small>{choice.prediction}</small></span></label>)}</fieldset>
        <button type="button" className="button primary" disabled={disabled || !hypothesisId} onClick={() => commit({ type: 'prediction', choiceId: hypothesisId })}>Commit my prediction</button>
      </> : <>
        <div className="scenario-locked-choice"><span className="scenario-kicker">Your initial prediction</span><strong>{prediction.hypotheses.find(choice => choice.id === p.initialChoiceId)?.label}</strong><p>{prediction.hypotheses.find(choice => choice.id === p.initialChoiceId)?.prediction}</p></div>
        {!outcomeReady && <p className="scenario-mode-wait">Take the investigative actions below. The hypothesis review opens after the required outcomes have been observed.</p>}
        {outcomeReady && <div className="scenario-revision-grid">
          <div><fieldset disabled={disabled}><legend>{prediction.revisionPrompt}</legend>{prediction.hypotheses.map(choice => <label className="scenario-mode-choice" key={choice.id}><input type="radio" name={`${activity.id}-final-hypothesis`} checked={hypothesisId === choice.id} onChange={() => patch({ hypothesisId: choice.id })}/><span><strong>{choice.label}</strong><small>{choice.prediction}</small></span></label>)}</fieldset><button type="button" className="button secondary" disabled={disabled || !hypothesisId} onClick={() => commit({ type: 'hypothesis-revision', choiceId: hypothesisId })}>Record my current hypothesis</button></div>
          <div><fieldset disabled={disabled || !p.finalChoiceId}><legend>{prediction.reviewPrompt}</legend>{prediction.reviewChoices.map(choice => <label className="scenario-mode-choice" key={choice.id}><input type="radio" name={`${activity.id}-outcome-review`} checked={reviewId === choice.id} onChange={() => patch({ reviewId: choice.id })}/><span>{choice.label}</span></label>)}</fieldset><button type="button" className="button secondary" disabled={disabled || !p.finalChoiceId || !reviewId} onClick={() => commit({ type: 'outcome-review', choiceId: reviewId })}>Record outcome review</button></div>
        </div>}
      </>}
      {p.history.length > 0 && <details className="scenario-thinking-history"><summary>Prediction & revision history ({p.history.length})</summary><ol>{p.history.map((entry, index) => <li key={index}><span>{entry.type === 'prediction' ? 'Initial prediction' : entry.type === 'hypothesis-revision' ? 'Hypothesis confirmed or revised' : 'Outcome reviewed'} · after {entry.atStep} actions</span><strong>{(entry.type === 'outcome-review' ? prediction.reviewChoices : prediction.hypotheses).find(choice => choice.id === entry.choiceId)?.label}</strong></li>)}</ol></details>}
    </section>}
    {campaign && snapshot.campaign && <section className="scenario-campaign" aria-labelledby={`${activity.id}-campaign-title`}>
      <div className="scenario-mode-heading"><Route size={21} aria-hidden="true"/><div><span className="scenario-kicker">Plan · act · transfer</span><h3 id={`${activity.id}-campaign-title`}>A campaign of connected cases</h3></div></div>
      <ol className="scenario-stage-map" aria-label="Campaign stages">{campaign.stages.map((item, index) => <li key={item.id} className={snapshot.campaign!.completedStageIds.includes(item.id) ? 'complete' : index === snapshot.campaign!.stageIndex ? 'current' : ''} aria-current={index === snapshot.campaign!.stageIndex ? 'step' : undefined}><span>{snapshot.campaign!.completedStageIds.includes(item.id) ? <Check size={13} aria-hidden="true"/> : index + 1}</span><strong>{item.title}</strong></li>)}</ol>
      {!stage ? <p className="scenario-mode-finished"><Check size={17} aria-hidden="true"/> All stages and the transfer debrief are recorded. Select your supporting evidence, then check your work.</p> : <>
        <div className="scenario-stage-brief"><span className="scenario-kicker">{stage.transfer ? 'Apply it in a changed case' : 'Establish a useful principle'}</span><h4>{stage.title}</h4><p>{stage.briefing}</p><dl><div><dt>What is different here</dt><dd>{stage.changedContext}</dd></div><div><dt>Learning to carry forward</dt><dd>{stage.learningToTransfer}</dd></div></dl></div>
        {!stageReady ? <div className="scenario-plan-grid">
          <div className="scenario-current-plan"><h4>{plan ? 'The plan you committed' : 'A plan before action'}</h4>{!plan ? <p>{campaign.planningPrompt}</p> : <ol>{plan.actionIds.map((id, index) => <li key={`${index}-${id}`} className={index < plan.executed ? 'done' : index === plan.executed ? 'next' : ''}>{index < plan.executed && <Check size={13} aria-hidden="true"/>}<span>{actionLabel(id)}</span>{index === plan.executed && <small>Next</small>}</li>)}</ol>}{plan && <p>{plan.executed} of {plan.actionIds.length} planned actions completed. Record a revision before taking a different action.</p>}</div>
          <div className="scenario-plan-builder"><h4>{plan ? 'Prepare a plan revision' : 'Prepare your plan'}</h4><p>Choose one to six actions in order. Future actions can have prerequisites that earlier steps satisfy.</p>
            <label>Action to add to the plan<select aria-label="Action to add to the plan" value={chosenPlanAction} disabled={disabled} onChange={event => patch({ stageId: stage.id, planActionId: event.target.value })}><option value="">Choose an action</option>{stage.actionIds.map(id => <option key={id} value={id}>{actionLabel(id)} · {activity.actions.find(action => action.id === id)?.cost} units</option>)}</select></label><button type="button" className="button secondary" disabled={disabled || !chosenPlanAction || planned.length >= 6} onClick={() => editPlan([...planned, chosenPlanAction])}><Plus size={14} aria-hidden="true"/> Add planned action</button>
            {planned.length > 0 && <ol className="scenario-plan-draft">{planned.map((id, index) => <li key={`${index}-${id}`}><span>{actionLabel(id)}</span><div><button type="button" disabled={disabled || index === 0} aria-label={`Move planned ${actionLabel(id)} at position ${index + 1} up`} onClick={() => movePlan(index, -1)}><ArrowUp size={14} aria-hidden="true"/></button><button type="button" disabled={disabled || index === planned.length - 1} aria-label={`Move planned ${actionLabel(id)} at position ${index + 1} down`} onClick={() => movePlan(index, 1)}><ArrowDown size={14} aria-hidden="true"/></button><button type="button" disabled={disabled} aria-label={`Remove planned ${actionLabel(id)} at position ${index + 1}`} onClick={() => editPlan(planned.filter((_, position) => position !== index))}><Trash2 size={14} aria-hidden="true"/></button></div></li>)}</ol>}
            {plan && <label>Why revise the plan?<select aria-label="Why revise the plan?" value={stageDraft.revisionReasonId ?? ''} disabled={disabled} onChange={event => patch({ stageId: stage.id, revisionReasonId: event.target.value })}><option value="">Choose a reason</option>{campaign.revisionReasons.map(reason => <option key={reason.id} value={reason.id}>{reason.label}</option>)}</select></label>}
            <button type="button" className="button primary" disabled={disabled || !planned.length || !!plan && !stageDraft.revisionReasonId} onClick={() => commit(plan ? { type: 'plan-revision', stageId: stage.id, actionIds: planned, reasonId: stageDraft.revisionReasonId } : { type: 'plan', stageId: stage.id, actionIds: planned })}>{plan ? 'Record plan revision' : 'Commit this plan'}</button>
          </div>
        </div> : <div className="scenario-stage-debrief"><Flag size={19} aria-hidden="true"/><div><span className="scenario-kicker">{stage.transfer ? 'Transfer debrief' : 'Stage debrief'}</span><fieldset disabled={disabled}><legend>{stage.debrief.prompt}</legend>{stage.debrief.choices.map(choice => <label className="scenario-mode-choice" key={choice.id}><input type="radio" name={`${activity.id}-${stage.id}-debrief`} checked={stageDraft.debriefChoiceId === choice.id} onChange={() => patch({ stageId: stage.id, debriefChoiceId: choice.id })}/><span>{choice.label}</span></label>)}</fieldset><button type="button" className="button primary" disabled={disabled || !stageDraft.debriefChoiceId} onClick={() => commit({ type: 'debrief', stageId: stage.id, choiceId: stageDraft.debriefChoiceId! })}>{stage.transfer ? 'Record transfer debrief' : 'Record stage debrief'}</button>{snapshot.campaign.debriefs.at(-1)?.stageId === stage.id && !snapshot.campaign.debriefs.at(-1)?.accepted && <p role="status" className="scenario-mode-wait">That interpretation is not supported by the reviewed debrief. Revisit the observations and revise your selection.</p>}</div></div>}
      </>}
      {snapshot.campaign.plans.length > 0 && <details className="scenario-thinking-history"><summary>Plans, revisions & debriefs</summary><ol>{snapshot.campaign.plans.map((item, index) => <li key={`plan-${index}`}><span>{campaign.stages.find(stage => stage.id === item.stageId)?.title} · {item.reasonId ? 'revised plan' : 'initial plan'} · after {item.atStep} actions</span><strong>{item.actionIds.map(actionLabel).join(' → ')}</strong>{item.reasonId && <p>{campaign.revisionReasons.find(reason => reason.id === item.reasonId)?.label}</p>}</li>)}{snapshot.campaign.debriefs.map((item, index) => <li key={`debrief-${index}`}><span>Debrief · {item.accepted ? 'supported' : 'needs revision'} · after {item.atStep} actions</span><strong>{campaign.stages.find(stage => stage.id === item.stageId)?.debrief.choices.find(choice => choice.id === item.choiceId)?.label}</strong></li>)}</ol></details>}
    </section>}
    {error && <p role="alert" className="scenario-notice">{error}</p>}
  </div>;
}
