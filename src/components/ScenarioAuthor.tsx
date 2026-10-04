import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
import type { Source } from '../types';
import { buildSceneScenario } from '../lib/scenarioEngine';
import type { ScenarioActivity, SceneScenarioDraft } from '../lib/scenarioEngine';
import '../scenario.css';

export interface ScenarioAuthorProps { notebookId: string; sources: Source[]; onSave: (activity: ScenarioActivity) => void; onError: (message: string) => void }
const identifier = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Math.random().toString(36).slice(2)}`;
function emptyDraft(sources: Source[]): SceneScenarioDraft {
  return { id: identifier('scenario'), title: '', instruction: '', objective: '', sourceId: sources.find(source => source.status === 'ready' && source.text)?.id ?? '', evidence: '', budget: 4, maxSteps: 6,
    scenes: [{ id: 'start', label: 'Initial situation', observation: '', ending: 'continue' }, { id: 'investigated', label: 'After investigation', observation: '', ending: 'continue' }, { id: 'resolved', label: 'Resolved situation', observation: '', ending: 'success' }],
    actions: [{ id: 'investigate', label: '', from: 'start', to: 'investigated', cost: 1, consequence: '' }, { id: 'resolve', label: '', from: 'investigated', to: 'resolved', cost: 1, consequence: '' }], requiredSceneIds: ['investigated', 'resolved'] };
}
function loadDraft(notebookId: string, sources: Source[]): SceneScenarioDraft {
  const fresh = emptyDraft(sources);
  try {
    const text = localStorage.getItem(`asterloom:scenario-author:${notebookId}`); if (!text || text.length > 100000) return fresh;
    const value = JSON.parse(text);
    if (!value || !['id', 'title', 'instruction', 'objective', 'sourceId', 'evidence'].every(key => typeof value[key] === 'string') || !Number.isInteger(value.budget) || !Number.isInteger(value.maxSteps)) return fresh;
    if (!Array.isArray(value.scenes) || value.scenes.length < 2 || value.scenes.length > 8 || value.scenes.some((scene: any) => !scene || !['id', 'label', 'observation'].every(key => typeof scene[key] === 'string') || !['continue', 'success', 'failure'].includes(scene.ending))) return fresh;
    if (!Array.isArray(value.actions) || value.actions.length > 16 || value.actions.some((action: any) => !action || !['id', 'label', 'from', 'to', 'consequence'].every(key => typeof action[key] === 'string') || !Number.isInteger(action.cost))) return fresh;
    if (!Array.isArray(value.requiredSceneIds) || value.requiredSceneIds.length > 8 || value.requiredSceneIds.some((id: unknown) => typeof id !== 'string')) return fresh;
    return { id: value.id, title: value.title, instruction: value.instruction, objective: value.objective, sourceId: value.sourceId, evidence: value.evidence, budget: value.budget, maxSteps: value.maxSteps, scenes: value.scenes, actions: value.actions, requiredSceneIds: value.requiredSceneIds };
  } catch { return fresh; }
}

export default function ScenarioAuthor({ notebookId, sources, onSave, onError }: ScenarioAuthorProps) {
  const [entry, setEntry] = useState(() => ({ notebookId, draft: loadDraft(notebookId, sources) }));
  const [savedMessage, setSavedMessage] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const storageFailed = useRef(false), errorHandler = useRef(onError); errorHandler.current = onError;
  useEffect(() => { if (entry.notebookId !== notebookId) { setEntry({ notebookId, draft: loadDraft(notebookId, sources) }); setSavedMessage(''); } }, [notebookId, entry.notebookId, sources]);
  useEffect(() => {
    if (entry.notebookId !== notebookId) return;
    try { localStorage.setItem(`asterloom:scenario-author:${notebookId}`, JSON.stringify(entry.draft)); storageFailed.current = false; setStorageWarning(''); }
    catch { const message = 'This browser could not save the unfinished case draft. Save the activity before leaving this page.'; setStorageWarning(message); if (!storageFailed.current) errorHandler.current(message); storageFailed.current = true; }
  }, [entry, notebookId]);
  if (entry.notebookId !== notebookId) return <p>Loading this notebook’s case draft…</p>;
  const draft = entry.draft, source = sources.find(item => item.id === draft.sourceId);
  const patch = (changes: Partial<SceneScenarioDraft>) => { setSavedMessage(''); setEntry(current => ({ ...current, draft: { ...current.draft, ...changes } })); };
  const sceneChange = (id: string, changes: Partial<SceneScenarioDraft['scenes'][number]>) => patch({ scenes: draft.scenes.map(scene => scene.id === id ? { ...scene, ...changes } : scene) });
  const actionChange = (id: string, changes: Partial<SceneScenarioDraft['actions'][number]>) => patch({ actions: draft.actions.map(action => action.id === id ? { ...action, ...changes } : action) });
  const save = () => {
    try {
      if (!source) throw new Error('Choose a source for the case.');
      const activity = buildSceneScenario(draft, source); onSave(activity);
      setSavedMessage('Case saved as a draft. Review the rules and source evidence before enabling play.');
    } catch (error) { onError(error instanceof Error ? error.message : 'This case could not be saved.'); }
  };
  return <section className="scenario-author" aria-label="Guided scenario authoring">
    <div className="scenario-author-heading"><span className="scenario-kicker">Make decisions matter</span><h3>Build an investigation</h3><p>Describe a situation, connect choices to consequences, and decide which evidence supports a successful conclusion. This builder uses finite scenes; advanced JSON supports richer state variables and conditional rules.</p></div>
    {storageWarning && <p className="scenario-notice" role="alert">{storageWarning}</p>}
    <div className="scenario-author-section"><h4>1. Ground the case</h4><div className="scenario-author-grid">
      <label>Case title<input maxLength={160} value={draft.title} onChange={event => patch({ title: event.target.value })} placeholder="A problem worth investigating"/></label>
      <label>Source for the case<select value={draft.sourceId} onChange={event => patch({ sourceId: event.target.value, evidence: '' })}><option value="">Choose a readable source</option>{sources.filter(item => item.status === 'ready' && item.text).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </div><label>Exact source passage supporting the rules<textarea rows={4} maxLength={20000} value={draft.evidence} onChange={event => patch({ evidence: event.target.value })} placeholder="Copy the passage that supports the initial facts, allowed actions, costs and consequences."/></label>
      {source && draft.evidence && <p className={`scenario-author-source-status ${source.text.includes(draft.evidence.trim()) ? 'valid' : 'invalid'}`} role="status">{source.text.includes(draft.evidence.trim()) ? 'The excerpt occurs in the selected source. You still need to review whether it supports every rule.' : 'The excerpt must match the selected source exactly.'}</p>}
      <label>Learner instructions<textarea rows={2} maxLength={2000} value={draft.instruction} onChange={event => patch({ instruction: event.target.value })} placeholder="Explain the situation and what the learner is trying to accomplish."/></label>
      <label>Successful learning objective<input maxLength={1000} value={draft.objective} onChange={event => patch({ objective: event.target.value })} placeholder="Reach an outcome and justify it with evidence"/></label>
      <div className="scenario-author-grid"><label>Effort budget<input type="number" min={1} max={10000} value={draft.budget} onChange={event => patch({ budget: Number(event.target.value) })}/></label><label>Maximum actions per run<input type="number" min={1} max={24} value={draft.maxSteps} onChange={event => patch({ maxSteps: Number(event.target.value) })}/></label></div>
    </div>
    <div className="scenario-author-section"><h4>2. Describe the scenes</h4><p>The first scene is the starting point. Enter only observations the learner can know after reaching that scene.</p>
      {draft.scenes.map((scene, index) => <fieldset className="scenario-author-scene" key={scene.id}><legend>{index === 0 ? 'Starting scene' : `Scene ${index + 1}`}</legend>
        <div className="scenario-author-grid"><label>Scene name<input value={scene.label} maxLength={80} onChange={event => sceneChange(scene.id, { label: event.target.value })}/></label><label>Scene outcome<select value={scene.ending} disabled={index === 0} onChange={event => sceneChange(scene.id, { ending: event.target.value as typeof scene.ending })}><option value="continue">Investigation continues</option><option value="success">Successful ending</option><option value="failure">Unsuccessful ending</option></select></label></div>
        <label>Observation discovered here<textarea rows={2} maxLength={2000} value={scene.observation} onChange={event => sceneChange(scene.id, { observation: event.target.value })}/></label>
        <div className="scenario-author-row"><label className="scenario-author-check"><input type="checkbox" checked={draft.requiredSceneIds.includes(scene.id)} onChange={event => patch({ requiredSceneIds: event.target.checked ? [...draft.requiredSceneIds, scene.id] : draft.requiredSceneIds.filter(id => id !== scene.id) })}/> Required evidence for the conclusion</label>{index > 0 && <button type="button" className="scenario-author-remove" aria-label={`Remove scene ${index + 1}`} onClick={() => patch({ scenes: draft.scenes.filter(item => item.id !== scene.id), requiredSceneIds: draft.requiredSceneIds.filter(id => id !== scene.id), actions: draft.actions.filter(action => action.from !== scene.id && action.to !== scene.id) })}><Trash2 size={15} aria-hidden="true"/> Remove</button>}</div>
      </fieldset>)}
      <button type="button" className="button secondary" disabled={draft.scenes.length >= 8} onClick={() => patch({ scenes: [...draft.scenes, { id: identifier('scene'), label: `Scene ${draft.scenes.length + 1}`, observation: '', ending: 'continue' }] })}><Plus size={15} aria-hidden="true"/> Add a scene</button>
    </div>
    <div className="scenario-author-section"><h4>3. Connect actions to consequences</h4><p>Each action can be used once, and only from its specified scene. Costs, available paths and supporting observations are checked before saving.</p>
      {draft.actions.map((action, index) => <fieldset className="scenario-author-action" key={action.id}><legend>Action {index + 1}</legend>
        <div className="scenario-author-grid"><label>Action label<input value={action.label} maxLength={160} placeholder="What the learner chooses to do" onChange={event => actionChange(action.id, { label: event.target.value })}/></label><label>Effort cost<input type="number" min={0} max={10000} value={action.cost} onChange={event => actionChange(action.id, { cost: Number(event.target.value) })}/></label></div>
        <div className="scenario-author-route"><label>Available in<select value={action.from} onChange={event => actionChange(action.id, { from: event.target.value })}>{draft.scenes.filter(scene => scene.ending === 'continue').map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label><ArrowRight size={17} aria-hidden="true"/><label>Leads to<select value={action.to} onChange={event => actionChange(action.id, { to: event.target.value })}>{draft.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label></div>
        <label>Consequence shown after the action<textarea rows={2} maxLength={2000} value={action.consequence} onChange={event => actionChange(action.id, { consequence: event.target.value })} placeholder="Explain what changed or what was discovered."/></label>
        <button type="button" className="scenario-author-remove" aria-label={`Remove action ${index + 1}`} onClick={() => patch({ actions: draft.actions.filter(item => item.id !== action.id) })}><Trash2 size={15} aria-hidden="true"/> Remove action</button>
      </fieldset>)}
      <button type="button" className="button secondary" disabled={draft.actions.length >= 16 || !draft.scenes.some(scene => scene.ending === 'continue')} onClick={() => patch({ actions: [...draft.actions, { id: identifier('action'), label: '', from: draft.scenes.find(scene => scene.ending === 'continue')?.id ?? '', to: draft.scenes.at(-1)?.id ?? '', cost: 1, consequence: '' }] })}><Plus size={15} aria-hidden="true"/> Add an action</button>
    </div>
    <div className="scenario-author-footer"><p>Saving creates an unreviewed activity. Source matching checks quotation accuracy; an author must still verify the model’s meaning and consequences.</p><button type="button" className="button primary" onClick={save}><Save size={16} aria-hidden="true"/> Save case for review</button></div>
    {savedMessage && <p className="scenario-author-saved" role="status">{savedMessage}</p>}
  </section>;
}
