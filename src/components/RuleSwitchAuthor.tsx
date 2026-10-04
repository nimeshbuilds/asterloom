import { useEffect, useState } from 'react';
import type { Source } from '../types';
import type { RuleSwitchActivity } from '../lib/ruleSwitchEngine';
import { compileRuleSwitchDraft, initialRuleSwitchAuthorDraft, restoreRuleSwitchAuthorDraft, switchCategoryLabels } from '../lib/ruleSwitchAuthorDraft';
import type { SwitchItemDraft, SwitchRuleDraft } from '../lib/ruleSwitchAuthorDraft';
import './ruleSwitch.css';
type Props = { sources: Source[]; notebookId?: string; onCreate: (activity: RuleSwitchActivity) => void; onCancel?: () => void };
export default function RuleSwitchAuthor(props: Props) {
  const draftKey = `asterloom.rule-switch-author.v1.${props.notebookId ?? props.sources.map(s => s.id).join('|').slice(0, 300)}`;
  return <RuleSwitchAuthorForm {...props} draftKey={draftKey} key={draftKey}/>;
}
function RuleSwitchAuthorForm({ sources, onCreate, onCancel, draftKey }: Props & { draftKey: string }) {
  const available = sources.filter(source => source.status === 'ready' && !!source.text.trim());
  const [draft, setDraft] = useState(() => { try { const saved = localStorage.getItem(draftKey); return saved && saved.length <= 1024 * 1024 ? restoreRuleSwitchAuthorDraft(JSON.parse(saved), available[0]?.id) : initialRuleSwitchAuthorDraft(available[0]?.id); } catch { return initialRuleSwitchAuthorDraft(available[0]?.id); } });
  const [errors, setErrors] = useState<string[]>([]), [saveError, setSaveError] = useState('');
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); setSaveError(''); } catch { setSaveError('This device could not save your unfinished sorting activity. Keep this form open until you save it, or free some browser storage.'); } }, [draft, draftKey]);
  function updateRule(index: 0 | 1, change: Partial<SwitchRuleDraft>) {
    setDraft(value => {
      const rules = [...value.rules] as typeof value.rules; rules[index] = { ...rules[index], ...change };
      const allowed = switchCategoryLabels(rules[index].categories);
      const key = index === 0 ? 'firstCategory' : 'secondCategory';
      const items = change.categories === undefined ? value.items : value.items.map(item => ({ ...item, [key]: allowed.includes(item[key]) ? item[key] : '' }));
      return { ...value, rules, items };
    });
  }
  function updateItem(id: string, change: Partial<SwitchItemDraft>) { setDraft(value => ({ ...value, items: value.items.map(item => item.id === id ? { ...item, ...change } : item) })); }
  function create() {
    const prepared = compileRuleSwitchDraft(draft, sources, `rule-switch-${crypto.randomUUID().slice(0, 12)}`);
    if (!prepared.success) { setErrors(prepared.errors); return; }
    onCreate(prepared.activity); try { localStorage.removeItem(draftKey); } catch { /* The saved notebook remains authoritative. */ }
  }
  return <section className="switch-author switch-board" aria-label="Create a changing-rule sorting activity"><h3>Make a changing-rule activity</h3><p>Choose two features from your material. Prepare the groups and show where each object belongs under both rules. The learner will sort the same objects twice.</p><p className="switch-draft-status">Your unfinished form saves on this device. Completed activities start as drafts for review.</p>{saveError && <p role="alert" className="switch-author-alert">{saveError}</p>}
    {!available.length ? <p role="alert" className="switch-author-alert">Add source material with text before preparing this activity. Each rule and object needs an exact source excerpt.</p> : <>
      <label>Activity title<input value={draft.title} maxLength={200} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      {draft.rules.map((rule, n) => { const index = n as 0 | 1; return <fieldset key={n}><legend>Rule {n + 1}{n === 1 ? ' · the rule changes' : ''}</legend>
        <label>Feature name, exactly as written in the source<input aria-label={`Rule ${n + 1} feature name`} value={rule.featureLabel} maxLength={150} placeholder={n ? 'shape, purpose, or priority' : 'color, location, or owner'} onChange={e => updateRule(index, { featureLabel: e.target.value })}/></label>
        <label>Groups, one name per line<textarea aria-label={`Rule ${n + 1} category names`} value={rule.categories} maxLength={600} placeholder={n ? 'circle\ntriangle' : 'red\nblue'} onChange={e => updateRule(index, { categories: e.target.value })}/></label><small>Use two to five distinct names from your source. Keep their exact spelling.</small>
        <label>What the learner should do<textarea aria-label={`Rule ${n + 1} learner instruction`} value={rule.instruction} maxLength={2000} onChange={e => updateRule(index, { instruction: e.target.value })}/></label>
        <label>Source supporting this rule<select aria-label={`Rule ${n + 1} source`} value={rule.sourceId} onChange={e => updateRule(index, { sourceId: e.target.value, evidence: '' })}>{!available.some(s => s.id === rule.sourceId) && <option value={rule.sourceId}>Missing source — choose a replacement</option>}{available.map(source => <option value={source.id} key={source.id}>{source.title}</option>)}</select></label>
        <details><summary>Read the selected source</summary><p className="switch-source-text">{sources.find(source => source.id === rule.sourceId)?.text}</p></details>
        <label>Exact source excerpt naming this feature<textarea aria-label={`Rule ${n + 1} exact source excerpt`} value={rule.evidence} maxLength={20000} onChange={e => updateRule(index, { evidence: e.target.value })}/></label>
      </fieldset>; })}
      <fieldset><legend>Objects to sort in both rounds</legend><p>Prepare three to twelve objects. The second rule must actually regroup some objects; changing the group names alone is not enough.</p>{draft.items.map((item, n) => <div className="switch-object-author" key={item.id}><h4>Object {n + 1}</h4>
        <label>Object name, exactly as written in the source<input aria-label={`Object ${n + 1} name`} value={item.label} maxLength={300} onChange={e => updateItem(item.id, { label: e.target.value })}/></label>
        <div className="switch-author-columns">{([0, 1] as const).map(index => <label key={index}>{index === 0 ? 'First rule' : 'New rule'}: {draft.rules[index].featureLabel || `feature ${index + 1}`}<select aria-label={`Object ${n + 1} rule ${index + 1} category`} value={index === 0 ? item.firstCategory : item.secondCategory} onChange={e => updateItem(item.id, index === 0 ? { firstCategory: e.target.value } : { secondCategory: e.target.value })}><option value="">Choose its group</option>{switchCategoryLabels(draft.rules[index].categories).slice(0, 5).map((label, i) => <option key={i} value={label}>{label}</option>)}</select></label>)}</div>
        <label>Source supporting this object<select aria-label={`Object ${n + 1} source`} value={item.sourceId} onChange={e => updateItem(item.id, { sourceId: e.target.value, evidence: '' })}>{!available.some(s => s.id === item.sourceId) && <option value={item.sourceId}>Missing source — choose a replacement</option>}{available.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
        <details><summary>Read the selected object source</summary><p className="switch-source-text">{sources.find(source => source.id === item.sourceId)?.text}</p></details>
        <label>Exact excerpt containing its name and both feature values<textarea aria-label={`Object ${n + 1} exact source excerpt`} value={item.evidence} maxLength={20000} onChange={e => updateItem(item.id, { evidence: e.target.value })}/></label>
        <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter(value => value.id !== item.id) })}>Remove object {n + 1}</button>
      </div>)}<button type="button" disabled={draft.items.length >= 12} onClick={() => setDraft({ ...draft, items: [...draft.items, { id: `object-${crypto.randomUUID().slice(0, 12)}`, label: '', firstCategory: '', secondCategory: '', sourceId: available[0].id, evidence: '' }] })}>Add an object</button></fieldset>
      <label>How to introduce the changed rule (optional)<textarea aria-label="Rule-change introduction" value={draft.transitionInstruction} maxLength={2000} onChange={e => setDraft({ ...draft, transitionInstruction: e.target.value })} placeholder="If left blank, the learner is told to switch from the first feature to the second."/></label>
      <label>Explanation after the learner checks their work<textarea aria-label="Explanation after checking both rules" value={draft.explanation} maxLength={2000} onChange={e => setDraft({ ...draft, explanation: e.target.value })}/></label>
      <button type="button" className="switch-primary" disabled={draft.items.length < 3} onClick={create}>Save changing-rule activity for review</button>
    </>}{errors.length > 0 && <div role="alert" className="switch-author-alert"><p>These details need attention before saving:</p><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}{onCancel && <button type="button" onClick={onCancel}>Close editor</button>}
  </section>;
}
