import type { RuleSwitchActivity, RuleSwitchResponse } from '../lib/ruleSwitchEngine';
import { initialRuleSwitchResponse } from '../lib/ruleSwitchEngine';
import './ruleSwitch.css';

const colors: Record<string, string> = { red: '#b83f2b', blue: '#3d6d9a', green: '#42774b', yellow: '#d4a52b' };
function sourceSymbol(attributes: Record<string, string>) {
  const shape = attributes.shape, fill = colors[attributes.color];
  if (!fill || !['circle', 'triangle', 'square'].includes(shape)) return null;
  return <svg className="switch-object-symbol" viewBox="0 0 80 70" aria-hidden="true" focusable="false">{shape === 'circle' ? <circle cx="40" cy="35" r="26" fill={fill}/> : shape === 'triangle' ? <path d="M40 7 72 62H8Z" fill={fill}/> : <rect x="14" y="9" width="52" height="52" rx="3" fill={fill}/>}</svg>;
}
export default function RuleSwitchBoard({ activity, response, onChange }: { activity: RuleSwitchActivity; response: RuleSwitchResponse; onChange: (response: RuleSwitchResponse) => void }) {
  const state = initialRuleSwitchResponse(activity, response), active = activity.rounds[state.phase === 'first' ? 0 : 1];
  const selected = activity.items.find(item => item.id === state.selectedItemId)!;
  const assigned = state.assignments[active.id], complete = activity.items.every(item => !!assigned[item.id]);
  const symbols = (item: RuleSwitchActivity['items'][number]) => sourceSymbol(Object.fromEntries(activity.rounds.map(round => [(round.featureLabel ?? round.feature).toLowerCase(), round.categories.find(category => category.id === item.attributes[round.feature])?.label.toLowerCase() ?? ''])));
  function place(categoryId: string) {
    const assignments = { ...state.assignments, [active.id]: { ...assigned, [selected.id]: categoryId } };
    const next = activity.items.find(item => !assignments[active.id][item.id]);
    onChange({ ...state, assignments, selectedItemId: next?.id ?? selected.id });
  }
  return <section className="switch-board" aria-label="Two rounds, changing the sorting rule">
    <ol className="switch-steps" aria-label="Sorting rounds"><li className={state.phase === 'first' ? 'active' : ''}><span>1</span>{activity.rounds[0].label}{state.firstCommitted && <small>Saved</small>}</li><li className={state.phase !== 'first' ? 'active' : ''}><span>2</span>{activity.rounds[1].label}</li></ol>
    {state.phase === 'transition' ? <div className="switch-transition" role="status"><p className="switch-eyebrow">A new rule</p><h3>Same objects. A different way to sort.</h3><p>{activity.transitionInstruction}</p><div><span>Before: {activity.rounds[0].label}</span><strong>Now: {activity.rounds[1].label}</strong></div><p>{activity.rounds[1].instruction}</p><button type="button" className="switch-primary" onClick={() => onChange({ ...state, phase: 'second', switchAcknowledged: true, selectedItemId: activity.items[0].id })}>I’m ready for the new rule</button></div> : <>
      <div className="switch-rule" aria-live="polite"><p className="switch-eyebrow">Rule {state.phase === 'first' ? '1' : '2'} · {active.featureLabel ?? active.feature}</p><h3>{active.label}</h3><p>{active.instruction}</p></div>
      <p className="switch-helper">Choose an object, then choose its group. You can also use the category controls in each group. Your choices save as you go.</p>
      <div className="switch-items" role="group" aria-label="Objects to sort">{activity.items.map(item => <button type="button" key={item.id} className={selected.id === item.id ? 'selected' : ''} aria-pressed={selected.id === item.id} onClick={() => onChange({ ...state, selectedItemId: item.id })}>{symbols(item)}<strong>{item.label}</strong><span>{assigned[item.id] ? `Placed: ${active.categories.find(c => c.id === assigned[item.id])?.label}` : 'Choose a group'}</span></button>)}</div>
      <p className="switch-selected" role="status">Selected: <strong>{selected.label}</strong></p>
      <div className="switch-groups">{active.categories.map(category => <div className="switch-group" key={category.id}><h4>{category.label}</h4><button type="button" className="switch-place" onClick={() => place(category.id)}>Place {selected.label} in {category.label}</button><ul aria-label={`${category.label} group`}>{activity.items.filter(item => assigned[item.id] === category.id).map(item => <li key={item.id}>{item.label}<button type="button" aria-label={`Move ${item.label}`} onClick={() => onChange({ ...state, selectedItemId: item.id })}>Move</button></li>)}</ul></div>)}</div>
      {state.phase === 'first' ? <button type="button" className="switch-primary" disabled={!complete} onClick={() => onChange({ ...state, phase: 'transition', firstCommitted: true })}>Save this sort and change the rule</button> : <p className="switch-ready">{complete ? 'Both rounds are saved. Use “Check my work” below.' : 'Sort every object using the new rule.'}</p>}
    </>}
    {state.firstCommitted && <details className="switch-history"><summary>My first sort · {activity.rounds[0].label}</summary><p>The first round is saved separately. Changing the new sort does not rewrite it.</p><ul>{activity.items.map(item => <li key={item.id}>{item.label} → {activity.rounds[0].categories.find(c => c.id === state.assignments[activity.rounds[0].id][item.id])?.label}</li>)}</ul></details>}
    {state.firstCommitted && <button type="button" className="switch-reset" onClick={() => onChange(initialRuleSwitchResponse(activity))}>Start these two rounds again</button>}
  </section>;
}
