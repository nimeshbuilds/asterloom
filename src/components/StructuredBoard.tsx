import PictureBuildBoard from './PictureBuildBoard';
import { initialPictureBuildResponse } from '../lib/pictureBuildEngine';
import ChildPlayBoard from './ChildPlayBoard';
import { initialChildPlayResponse } from '../lib/childPlayEngine';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, GripVertical, Lightbulb, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { evaluateActivity, validateActivity } from '../lib/structuredEngine';
import type { ActivityResponse, Evaluation, StructuredActivity } from '../lib/structuredEngine';
import type { NotebookArtwork, Source } from '../types';
import LearningFigures from './LearningFigures';
import CompletionBoard from './CompletionBoard';
import { initialCompletionResponse } from '../lib/completionEngine';
import DataBoard from './DataBoard';
import { initialDataResponse } from '../lib/dataEngine';
import MediaBoard from './MediaBoard';
import { initialMediaResponse } from '../lib/mediaEngine';
import ScenarioBoard from './ScenarioBoard';
import { initialScenarioResponse } from '../lib/scenarioEngine';
import CompositionBoard from './CompositionBoard';
import { initialCompositionResponse } from '../lib/compositionEngine';
import PictureBoard from './PictureBoard';
import { initialPictureResponse } from '../lib/pictureEngine';
import RuleSwitchBoard from './RuleSwitchBoard';
import { initialRuleSwitchResponse } from '../lib/ruleSwitchEngine';
import './structured.css';

export type ActivityEvaluation = Evaluation;
export interface StructuredBoardProps {
  activity: StructuredActivity;
  sources: Source[];
  artwork?: NotebookArtwork[];
  savedResponse?: unknown;
  onSave: (response: unknown) => void;
  onComplete: (evaluation: ActivityEvaluation) => void;
}
export const ACTIVITY_KIND_LABELS: Record<StructuredActivity['kind'], string> = {
  sequence: 'Rebuild the sequence', classification: 'Sort the evidence', decision: 'Make the decision',
  dependency: 'Connect the system', budget: 'Balance the resources', rubric: 'Review with a purpose', diagram: 'Complete the model',
  completion: 'Complete the worked model', data: 'Investigate the observations', media: 'Explore the recording',
  scenario: 'Investigate and act', construction: 'Build, test and revise', explanation: 'Connect the reasoning',
  picture: 'Discover through pictures',
  'rule-switch': 'Adapt to a new rule', 'child-play': 'Bring the source story to life', 'picture-build': 'Build a picture and tell its story',
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function restoredResponse(activity: StructuredActivity, saved?: unknown): ActivityResponse {
  const value = object(saved);
  switch (activity.kind) {
    case 'completion': return initialCompletionResponse(activity, saved);
    case 'data': return initialDataResponse(activity, saved);
    case 'media': return initialMediaResponse(activity, saved);
    case 'scenario': return initialScenarioResponse(activity, saved);
    case 'construction': case 'explanation': return initialCompositionResponse(activity, saved);
    case 'picture-build': return initialPictureBuildResponse(activity, saved);
    case 'child-play': return initialChildPlayResponse(activity, saved);
    case 'picture': return initialPictureResponse(activity, saved);
    case 'rule-switch': return initialRuleSwitchResponse(activity, saved);
    case 'sequence': {
      const ids = activity.items.map(item => item.id), order = value.order;
      return { order: Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && order.every(id => typeof id === 'string' && ids.includes(id)) ? order : [...ids].reverse() };
    }
    case 'classification': return { assignments: Object.fromEntries(activity.items.map(item => { const prior = object(value.assignments)[item.id]; return [item.id, Array.isArray(prior) ? [...new Set(prior.filter(id => typeof id === 'string' && activity.categories.some(category => category.id === id)))] : []]; })) };
    case 'decision': return { choiceId: typeof value.choiceId === 'string' && activity.choices.some(choice => choice.id === value.choiceId) ? value.choiceId : '' };
    case 'dependency': return { edges: Array.isArray(value.edges) ? value.edges.filter((edge): edge is { from: string; to: string; relation: string } => { const data = object(edge); return typeof data.relation === 'string' && activity.nodes.some(node => node.id === data.from) && activity.nodes.some(node => node.id === data.to); }).slice(0, 120) : [] };
    case 'budget': return { quantities: Object.fromEntries(activity.items.map(item => { const prior = object(value.quantities)[item.id]; return [item.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior <= item.maxQuantity ? prior : 0]; })) };
    case 'rubric': return { ratings: Object.fromEntries(activity.criteria.map(criterion => { const prior = object(value.ratings)[criterion.id]; return [criterion.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior < criterion.levels.length ? prior : -1]; })) };
    case 'diagram': return { placements: Object.fromEntries(activity.labels.map(label => { const prior = object(value.placements)[label.id]; return [label.id, typeof prior === 'string' && activity.targets.some(target => target.id === prior) ? prior : '']; })) };
  }
}

export default function StructuredBoard({ activity, sources, artwork, savedResponse, onSave, onComplete }: StructuredBoardProps) {
  const [response, setResponse] = useState<ActivityResponse>(() => restoredResponse(activity, savedResponse));
  const initialDraft = object(object(savedResponse)._draft);
  const [result, setResult] = useState<Evaluation | null>(() => initialDraft.checked === true ? evaluateActivity(activity, restoredResponse(activity, savedResponse)) : null);
  const [showHint, setShowHint] = useState(initialDraft.showHint === true);
  const [hintUsed, setHintUsed] = useState(initialDraft.hintUsed === true);
  const [evidenceOpen, setEvidenceOpen] = useState(initialDraft.evidenceOpen === true);
  const [announcement, setAnnouncement] = useState('');
  const [edgeFrom, setEdgeFrom] = useState(typeof initialDraft.edgeFrom === 'string' ? initialDraft.edgeFrom : '');
  const [edgeTo, setEdgeTo] = useState(typeof initialDraft.edgeTo === 'string' ? initialDraft.edgeTo : '');
  const [edgeRelation, setEdgeRelation] = useState(typeof initialDraft.edgeRelation === 'string' ? initialDraft.edgeRelation : '');
  const [selectedLabel, setSelectedLabel] = useState(typeof initialDraft.selectedLabel === 'string' ? initialDraft.selectedLabel : '');
  const prefix = useId().replaceAll(':', '');
  const fingerprint = JSON.stringify(activity);
  const validation = useMemo(() => validateActivity(activity, sources), [fingerprint, sources]);
  useEffect(() => {
    const draft = object(object(savedResponse)._draft), restored = restoredResponse(activity, savedResponse);
    setResponse(restored); setResult(draft.checked === true ? evaluateActivity(activity, restored) : null); setShowHint(draft.showHint === true); setHintUsed(draft.hintUsed === true); setEvidenceOpen(draft.evidenceOpen === true);
    setEdgeFrom(typeof draft.edgeFrom === 'string' ? draft.edgeFrom : ''); setEdgeTo(typeof draft.edgeTo === 'string' ? draft.edgeTo : ''); setEdgeRelation(typeof draft.edgeRelation === 'string' ? draft.edgeRelation : ''); setSelectedLabel(typeof draft.selectedLabel === 'string' ? draft.selectedLabel : ''); setAnnouncement('');
  }, [fingerprint]);
  function persist(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    onSave({ ...next, _draft: { edgeFrom, edgeTo, edgeRelation, selectedLabel, showHint, hintUsed, evidenceOpen, checked: Boolean(result), ...draft } });
  }
  function change(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    const supported = hintUsed || ('caregiverSupport' in next && next.caregiverSupport === true);
    if (supported) setHintUsed(true);
    setResponse(next); setResult(null); persist(next, { checked: false, ...draft, hintUsed: supported });
  }
  function check() {
    const assessed = evaluateActivity(activity, response);
    const evaluation = { ...assessed, hintUsed: hintUsed || assessed.hintUsed === true }; setResult(evaluation);
    if (evaluation.hintUsed) setHintUsed(true);
    persist(response, { checked: true, hintUsed: evaluation.hintUsed });
    if (evaluation.valid) onComplete(evaluation);
  }
  function restart() { setShowHint(false); setSelectedLabel(''); setEdgeFrom(''); setEdgeTo(''); setEdgeRelation(''); change(restoredResponse(activity), { showHint: false, hintUsed, selectedLabel: '', edgeFrom: '', edgeTo: '', edgeRelation: '' }); setAnnouncement('A fresh attempt is ready.'); }
  if (!validation.success) return <div className="structured-notice warning" role="alert"><strong>This activity needs an author’s attention.</strong><p>{validation.errors.slice(0, 3).join(' ')}</p></div>;
  const referencedFigure = sources.find(source => source.kind === 'image' && typeof source.dataUrl === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source.dataUrl) && activity.sourceRefs.some(reference => reference.sourceId === source.id));
  const hints = result?.details ?? [];
  const detailClass = (id: string) => result?.valid ? hints.find(detail => detail.id === id)?.correct === true ? ' is-correct' : hints.find(detail => detail.id === id)?.correct === false ? ' needs-revision' : '' : '';
  return <section className={`structured-board board-${activity.kind}`} aria-label={activity.title}>
    <header className="structured-heading"><div><span className="structured-kicker">{ACTIVITY_KIND_LABELS[activity.kind]}</span><h2>{activity.title}</h2></div><span className="structured-badge">{activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Reflection' : 'Hands-on challenge'}</span></header>
    <p className="structured-instruction">{activity.instruction}</p>
    {activity.reviewStatus === 'needs-review' && <p className="structured-review-note">Author review is still needed for this activity’s content.</p>}
    <div className="sr-only" aria-live="polite">{announcement}</div>
    {activity.kind === 'completion' && 'slotTokens' in response && <CompletionBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'data' && 'evidenceRows' in response && <DataBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'media' && 'activeCheckpointId' in response && <MediaBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'scenario' && 'actions' in response && <ScenarioBoard activity={activity} response={response} onChange={change}/>}
    {(activity.kind === 'construction' || activity.kind === 'explanation') && ('instances' in response || 'arguments' in response) && <CompositionBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'picture-build' && 'parts' in response && <PictureBuildBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'child-play' && 'actionIds' in response && <ChildPlayBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'picture' && 'exploredTokenIds' in response && <PictureBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'rule-switch' && 'firstCommitted' in response && <RuleSwitchBoard activity={activity} response={response} onChange={change}/>}

    {activity.kind === 'sequence' && 'order' in response && <div className="structured-sequence"><p className="structured-helper">Move the steps into a valid order. Use the arrows to rearrange them.</p><ol>{response.order.map((id, index) => { const item = activity.items.find(item => item.id === id)!; const move = (offset: number) => { const order = [...response.order]; [order[index], order[index + offset]] = [order[index + offset], order[index]]; change({ order }); setAnnouncement(`${item.label} moved to position ${index + offset + 1}.`); }; return <li key={id}><span className="structured-step-number">{index + 1}</span><GripVertical size={16} className="structured-grip" aria-hidden="true"/><span>{item.label}</span><div className="structured-move-controls"><button type="button" className="structured-icon-button" disabled={index === 0} aria-label={`Move ${item.label} up`} onClick={() => move(-1)}><ArrowUp size={17}/></button><button type="button" className="structured-icon-button" disabled={index === response.order.length - 1} aria-label={`Move ${item.label} down`} onClick={() => move(1)}><ArrowDown size={17}/></button></div></li>; })}</ol></div>}

    {activity.kind === 'classification' && 'assignments' in response && !('firstCommitted' in response) && <div className="structured-classification"><p className="structured-helper">Choose every category that applies to each item.</p>{activity.items.map((item, index) => <fieldset key={item.id} className={`structured-item${detailClass(item.id)}`}><legend><span className="structured-index">{String(index + 1).padStart(2, '0')}</span>{item.label}</legend><div className="structured-choice-pills">{activity.categories.map(category => { const selected = response.assignments[item.id]?.includes(category.id); return <label key={category.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={selected} onChange={() => change({ assignments: { ...response.assignments, [item.id]: selected ? response.assignments[item.id].filter(id => id !== category.id) : [...response.assignments[item.id], category.id] } })}/>{selected && <Check size={14}/>}<span>{category.label}</span></label>; })}</div></fieldset>)}</div>}

    {activity.kind === 'decision' && 'choiceId' in response && <div className="structured-decision"><div className="structured-case"><span className="structured-kicker">The situation</span><dl>{Object.entries(activity.context).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value === null ? 'Not supplied' : String(value)}</dd></div>)}</dl></div><fieldset className="structured-decisions"><legend>What should happen next?</legend>{activity.choices.map((choice, index) => <label key={choice.id} className={`structured-answer${response.choiceId === choice.id ? ' selected' : ''}`}><input type="radio" name={`${prefix}-decision`} checked={response.choiceId === choice.id} onChange={() => change({ choiceId: choice.id })}/><span className="structured-answer-letter">{String.fromCharCode(65 + index)}</span><span>{choice.label}</span><ArrowRight size={17}/></label>)}</fieldset></div>}

    {activity.kind === 'dependency' && 'edges' in response && !('instances' in response) && <div className="structured-connections"><div className="structured-node-map"><svg viewBox={`0 0 680 ${Math.max(230, Math.ceil(activity.nodes.length / 4) * 110 + 10)}`} role="img" aria-label={`Your model with ${response.edges.length} connections. A text list is below.`}><defs><marker id={`${prefix}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#66857b"/></marker></defs>{response.edges.map((edge, index) => { const from = activity.nodes.findIndex(node => node.id === edge.from), to = activity.nodes.findIndex(node => node.id === edge.to); const point = (i: number) => ({ x: 80 + (i % 4) * 170, y: 65 + Math.floor(i / 4) * 110 }); const a = point(from), b = point(to), dx = b.x - a.x, dy = b.y - a.y; const offset = Math.min(dx ? 68 / Math.abs(dx) : 1e6, dy ? 30 / Math.abs(dy) : 1e6); const path = from === to ? `M${a.x - 20},${a.y - 27} C${a.x - 65},${a.y - 73} ${a.x + 65},${a.y - 73} ${a.x + 20},${a.y - 27}` : `M${a.x + dx * offset},${a.y + dy * offset} L${b.x - dx * offset},${b.y - dy * offset}`; return <g key={`${edge.from}-${edge.to}-${index}`}><title>{edge.relation}</title><path d={path} fill="none" stroke="#66857b" strokeWidth="2" markerEnd={`url(#${prefix}-arrow)`}/><text x={(a.x + b.x) / 2} y={from === to ? a.y - 56 : (a.y + b.y) / 2 - 8} textAnchor="middle" fontSize="9" fill="#526947">{edge.relation.length > 24 ? edge.relation.slice(0, 22) + '…' : edge.relation}</text></g>; })}{activity.nodes.map((node, i) => <g key={node.id} transform={`translate(${80 + i % 4 * 170} ${65 + Math.floor(i / 4) * 110})`}><title>{node.label}</title><rect x="-66" y="-27" width="132" height="54" rx="15" fill="#fffefa" stroke="#d1ded6"/><text textAnchor="middle" dominantBaseline="middle" fill="#37594e" fontSize="12">{node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}</text></g>)}</svg></div><div className="structured-connect-controls"><label>From<select value={edgeFrom} onChange={event => { setEdgeFrom(event.target.value); persist(response, { edgeFrom: event.target.value }); }}><option value="">Choose a concept</option>{activity.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>Relationship<select value={edgeRelation} onChange={event => { setEdgeRelation(event.target.value); persist(response, { edgeRelation: event.target.value }); }}><option value="">Choose a link</option>{[...new Set(activity.edges.map(edge => edge.relation))].map(relation => <option key={relation}>{relation}</option>)}</select></label><label>To<select value={edgeTo} onChange={event => { setEdgeTo(event.target.value); persist(response, { edgeTo: event.target.value }); }}><option value="">Choose a concept</option>{activity.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><button type="button" className="structured-secondary" disabled={!edgeFrom || !edgeTo || !edgeRelation || response.edges.length >= 120} onClick={() => { if (response.edges.some(edge => edge.from === edgeFrom && edge.to === edgeTo && edge.relation === edgeRelation)) { setAnnouncement('That connection is already in your model.'); return; } change({ edges: [...response.edges, { from: edgeFrom, to: edgeTo, relation: edgeRelation }] }); setAnnouncement('Connection added.'); }}><Plus size={16}/>Add connection</button></div><ul className="structured-edge-list">{response.edges.map((edge, index) => <li key={index}><Link2 size={16}/><span><strong>{activity.nodes.find(node => node.id === edge.from)?.label}</strong><span className="structured-edge-relation">{edge.relation}</span><strong>{activity.nodes.find(node => node.id === edge.to)?.label}</strong></span><button type="button" className="structured-icon-button" aria-label={`Remove connection ${index + 1}`} onClick={() => change({ edges: response.edges.filter((_, i) => i !== index) })}><Trash2 size={16}/></button></li>)}</ul>{!response.edges.length && <p className="structured-empty-small">Your model starts here. Add a relationship above.</p>}</div>}

    {activity.kind === 'budget' && 'quantities' in response && (() => { const total = activity.items.reduce((sum, item) => sum + (response.quantities[item.id] || 0) * item.cost, 0); return <div className="structured-budget"><div className={`structured-budget-meter${total > activity.budget ? ' over-budget' : ''}`}><div><span>Resources used</span><strong>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}<small> / {activity.budget} {activity.currency}</small></strong></div><div className="structured-meter"><span style={{ width: `${Math.min(100, activity.budget ? total / activity.budget * 100 : total ? 100 : 0)}%` }}/></div><span>{total <= activity.budget ? `${(activity.budget - total).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${activity.currency} available` : `${(total - activity.budget).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${activity.currency} over budget`}</span></div><div className="structured-resource-grid">{activity.items.map(item => <div className="structured-resource" key={item.id}><h3>{item.label}</h3><p>{item.cost} {activity.currency} / {item.unit}</p><label>Quantity<input type="number" min="0" max={item.maxQuantity} step="1" value={response.quantities[item.id]} onChange={event => { const quantity = Number(event.target.value); change({ quantities: { ...response.quantities, [item.id]: Number.isFinite(quantity) ? Math.max(0, Math.min(item.maxQuantity, Math.floor(quantity))) : 0 } }); }}/></label><small>Up to {item.maxQuantity}</small></div>)}</div><div className="structured-requirements"><span className="structured-kicker">What your plan needs</span>{activity.requirements.map(requirement => { const actual = Object.entries(requirement.contributions).reduce((sum, [id, contribution]) => sum + (response.quantities[id] || 0) * contribution, 0); return <div key={requirement.id} className={actual >= requirement.minimum ? 'met' : ''}><CheckCircle2 size={18}/><span>{requirement.label}</span><strong>{actual} / {requirement.minimum}</strong></div>; })}</div></div>; })()}

    {activity.kind === 'rubric' && 'ratings' in response && <div className="structured-rubric"><div className="structured-work-sample"><span className="structured-kicker">{activity.mode === 'self-assessment' ? 'Your reflection prompt' : 'Work to review'}</span><blockquote>{activity.sample}</blockquote></div>{activity.mode === 'self-assessment' && <p className="structured-helper">Use these criteria to reflect. Your choices are saved without an automatic correctness grade.</p>}{activity.criteria.map(criterion => <fieldset key={criterion.id} className={`structured-criterion${detailClass(criterion.id)}`}><legend>{criterion.label}</legend><div>{criterion.levels.map((level, index) => <label key={index} className={response.ratings[criterion.id] === index ? 'selected' : ''}><input type="radio" name={`${prefix}-${criterion.id}`} checked={response.ratings[criterion.id] === index} onChange={() => change({ ratings: { ...response.ratings, [criterion.id]: index } })}/><span className="structured-level">{index + 1}</span><span>{level}</span></label>)}</div></fieldset>)}</div>}

    {activity.kind === 'diagram' && 'placements' in response && <div className="structured-diagram"><p className="structured-helper">Choose a label, then select its place in the model. You can also drag a label onto a target.</p><div className="structured-label-bank" aria-label="Labels to place">{activity.labels.map(label => <button type="button" key={label.id} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', label.id); event.dataTransfer.effectAllowed = 'move'; setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} onClick={() => { setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} aria-pressed={selectedLabel === label.id} className={`${selectedLabel === label.id ? 'selected' : ''}${response.placements[label.id] ? ' placed' : ''}`}><GripVertical size={14}/>{label.label}{response.placements[label.id] && <Check size={13}/>}</button>)}</div><div className={`structured-diagram-canvas${referencedFigure ? ' has-source-image' : ''}`} aria-label="Model target locations">{referencedFigure && <img className="structured-source-image" src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}. Labeled target descriptions are available in the text placement controls.`}/>}{activity.targets.map((target, index) => { const placed = activity.labels.find(label => response.placements[label.id] === target.id); const place = (labelId: string) => { if (!activity.labels.some(label => label.id === labelId)) return; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, value]) => [id, id === labelId ? target.id : value === target.id ? '' : value])); change({ placements }, { selectedLabel: '' }); setSelectedLabel(''); setAnnouncement(`${activity.labels.find(label => label.id === labelId)?.label} placed at ${target.label}.`); }; return <button type="button" key={target.id} className={`structured-target-dot${placed ? ' filled' : ''}${selectedLabel ? ' ready' : ''}`} aria-label={`Place selected label at ${target.label}${placed ? `; currently ${placed.label}` : ''}`} style={{ left: `${Math.max(12, Math.min(88, target.x))}%`, top: `${Math.max(18, Math.min(82, target.y))}%` }} onClick={() => { if (selectedLabel) place(selectedLabel); else setAnnouncement('Choose a label from the bank first.'); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); place(event.dataTransfer.getData('text/plain')); }}><span>{index + 1}</span><strong>{placed?.label ?? 'Place here'}</strong><small>{target.label}</small></button>; })}</div>{referencedFigure && <p className="structured-image-caption">Source figure · {referencedFigure.title}</p>}<details className="structured-text-alternative"><summary>Use the text placement controls</summary><div className="structured-placement-list">{activity.labels.map(label => <label className={`structured-placement${detailClass(label.id)}`} key={label.id}><span>{label.label}</span><select aria-label={`Place ${label.label}`} value={response.placements[label.id] ?? ''} onChange={event => { const targetId = event.target.value; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, target]) => [id, id === label.id ? targetId : targetId && target === targetId ? '' : target])); change({ placements }); }}><option value="">Choose a target</option>{activity.targets.map((target, index) => <option value={target.id} key={target.id}>{index + 1}. {target.label}</option>)}</select></label>)}</div></details></div>}

    <div className="structured-tools"><button type="button" className="structured-text-button" aria-expanded={showHint} onClick={() => { const open = !showHint; setShowHint(open); if (open) setHintUsed(true); persist(response, { showHint: open, hintUsed: hintUsed || open }); }}><Lightbulb size={16}/>{showHint ? 'Hide hint' : 'A little help'}</button><button type="button" className="structured-text-button" onClick={restart}><RotateCcw size={15}/>Start over</button></div>
    {showHint && <div className="structured-hint"><Lightbulb size={18}/><p>{activity.hint}</p></div>}
    <details className="structured-evidence" open={evidenceOpen} onToggle={event => { const open = event.currentTarget.open; setEvidenceOpen(open); if (open) setHintUsed(true); persist(response, { evidenceOpen: open, hintUsed: hintUsed || open }); }}><summary><BookOpen size={16}/>Explore the source material</summary>{activity.sourceRefs.map((reference, index) => <div key={index}><strong>{sources.find(source => source.id === reference.sourceId)?.title ?? reference.sourceId}{reference.locator ? ` · ${reference.locator}` : ''}</strong><blockquote>{reference.evidence}</blockquote>{referencedFigure?.id === reference.sourceId && activity.kind !== 'diagram' && <figure className="structured-reference-figure"><img src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}`}/><figcaption>{referencedFigure.title}</figcaption></figure>}</div>)}<LearningFigures notebook={{sources,artwork}} activity={activity}/></details>
    {result && <div className={`structured-feedback ${result.outcome}`} role="status"><div>{result.correct ? <CheckCircle2 size={23}/> : <CircleHelp size={23}/>}<strong>{result.outcome === 'correct' ? 'Your work holds together.' : result.outcome === 'self-reviewed' ? 'A useful reflection.' : result.outcome === 'invalid' ? 'A little more to complete.' : 'You have something to build on.'}</strong></div><p>{result.feedback}</p>{result.details.length > 0 && <ul tabIndex={0} aria-label="Evaluation details">{result.details.map(detail => <li key={detail.id} className={detail.correct === true ? 'passed' : detail.correct === false ? 'revisit' : ''}>{detail.correct === true ? <Check size={15}/> : <span className="structured-feedback-dot"/>}<span>{detail.message}</span></li>)}</ul>}</div>}
    <footer className="structured-board-footer"><span>{result?.valid && result.correct !== null ? `${result.score} of ${result.maxScore} checks satisfied` : 'Saved as you explore'}</span><button type="button" className="structured-primary" onClick={check} disabled={result?.correct === true}><CheckCircle2 size={18}/>{result?.correct ? 'Challenge complete' : activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Save my reflection' : 'Check my work'}</button></footer>
  </section>;
}
