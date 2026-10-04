import type {EvidenceReference} from '../types';
import {isCurrentEvidence} from '../lib/evidence';
import PictureBuildAuthor from './PictureBuildAuthor';
import { PICTURE_BUILD_EXAMPLES, PICTURE_BUILD_EXAMPLE_SOURCE } from '../lib/pictureBuildExamples';
import ChildPlayAuthor from './ChildPlayAuthor';
import { childPlaySources, childPlayFixtures } from '../data/childPlayFixtures';
import { SCENARIO_INTERACTION_EXAMPLES, SCENARIO_INTERACTION_SOURCES } from '../lib/scenarioInteractionExamples';
import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Braces, CheckCircle2, Download, Eye, FilePlus2, Layers3, Pencil, Plus, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import type { Source } from '../types';
import { ACTIVITY_EXAMPLES, EXAMPLE_ACTIVITY_SOURCE, exportActivities, extractStructuredActivities, parseActivities, validateActivity } from '../lib/structuredEngine';
import type { ActivityBase, Primitive, Rule, StructuredActivity } from '../lib/structuredEngine';
import StructuredBoard, { ACTIVITY_KIND_LABELS } from './StructuredBoard';
import { compatibleScaffoldsForActivity } from '../lib/scaffoldRuntime';
import LaboratoryAuthor from './LaboratoryAuthor';
import ScenarioAuthor from './ScenarioAuthor';
import CompositionAuthor from './CompositionAuthor';
import PictureAuthor from './PictureAuthor';
import RuleSwitchAuthor from './RuleSwitchAuthor';
import ActivityAssistant from './ActivityAssistant';
import { pictureSources, pictureDiscoveryFixture, pictureWordFixture } from '../data/pictureFixtures';
import { ruleSwitchSources, ruleSwitchFixture } from '../data/ruleSwitchFixtures';
import { SCENARIO_MODE_EXAMPLES, SCENARIO_MODE_SOURCES } from '../lib/scenarioModeExamples';
import { COMPOSITION_MODE_EXAMPLES, COMPOSITION_MODE_EXAMPLE_SOURCE } from '../lib/compositionModeExamples';
import { EXTENDED_EXAMPLES, EXTENDED_EXAMPLE_SOURCES } from '../lib/extendedExamples';
import { SCENARIO_EXAMPLES, SCENARIO_EXAMPLE_SOURCES } from '../lib/scenarioEngine';
import { COMPOSITION_EXAMPLES, COMPOSITION_EXAMPLE_SOURCE } from '../lib/compositionExamples';
import './structured.css';

export interface ActivityStudioProps {
  initialEvidence?: EvidenceReference;
  notebookId?: string;
  ageGroup?: string;
  goal?: string;
  sources: Source[];
  activities: StructuredActivity[];
  onChange: (activities: StructuredActivity[]) => void;
  onError: (message: string) => void;
  onLoadExample?: (source: Source | Source[], activities: StructuredActivity[]) => void;
}
type Kind = 'sequence' | 'classification' | 'decision' | 'dependency' | 'budget' | 'rubric' | 'diagram';
const KINDS: { id: Kind; icon: string; name: string; purpose: string; columns: string[]; placeholders: string[] }[] = [
  { id: 'sequence', icon: '🪜', name: 'Sequence', purpose: 'Rebuild a process, one step at a time.', columns: ['Step, in the correct order'], placeholders: ['Collect the observations'] },
  { id: 'classification', icon: '🗂️', name: 'Classification', purpose: 'Discover which rule each example follows.', columns: ['Item to classify', 'Correct category'], placeholders: ['A display reading of 12', 'Observation'] },
  { id: 'decision', icon: '🧭', name: 'Decision', purpose: 'Apply an explicit policy to a concrete case.', columns: ['Condition name', 'Required value', 'Value in this case'], placeholders: ['approved', 'true', 'false'] },
  { id: 'dependency', icon: '🕸️', name: 'Connections', purpose: 'Join ideas with meaningful relationships.', columns: ['From concept', 'Relationship', 'To concept'], placeholders: ['Collect', 'precedes', 'Analyze'] },
  { id: 'budget', icon: '📦', name: 'Resources', purpose: 'Build a plan that fits real constraints.', columns: ['Resource', 'Cost each', 'Maximum quantity', 'Capacity each'], placeholders: ['Small workstation', '3', '4', '1'] },
  { id: 'rubric', icon: '✍️', name: 'Review', purpose: 'Explain what makes a piece of work strong.', columns: ['Criterion', 'Developing level', 'Meeting level', 'Reviewed level (1 or 2)'], placeholders: ['Evidence', 'No specific evidence', 'Specific evidence supports the claim', '2'] },
  { id: 'diagram', icon: '🧩', name: 'Labeled model', purpose: 'Connect the parts to their places.', columns: ['Label', 'Target description'], placeholders: ['Input', 'Left position'] },
];
const INSTRUCTIONS: Record<Kind, string> = {
  sequence: 'Arrange the steps in the order established by the source.', classification: 'Classify each item using the source’s categories.', decision: 'Apply the stated rule to the current case and choose the supported action.', dependency: 'Connect the concepts using the relationships established by the source.', budget: 'Meet the capacity requirement without exceeding the available budget.', rubric: 'Review the prepared sample against each criterion.', diagram: 'Place each label at the target described in the source.',
};
function blankRows(kind: Kind): string[][] { return Array.from({ length: kind === 'decision' ? 1 : 2 }, () => Array(KINDS.find(item => item.id === kind)!.columns.length).fill('')); }
function valueOf(value: string): Primitive { const text = value.trim(); if (text === 'true') return true; if (text === 'false') return false; if (text === 'null') return null; if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text); return text; }
const newId = () => `activity-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
function combine(existing: StructuredActivity[], incoming: StructuredActivity[]): StructuredActivity[] { const map = new Map(existing.map(activity => [activity.id, activity])); incoming.forEach(activity => map.set(activity.id, activity)); return [...map.values()]; }

export default function ActivityStudio({ notebookId, ageGroup, goal, sources, activities, onChange, onError, onLoadExample, initialEvidence }: ActivityStudioProps) {
  const prefix = useId();
  const [tab, setTab] = useState<'build' | 'guided' | 'json'>('build');
  const [laboratory, setLaboratory] = useState<'practice' | 'scenario' | 'composition' | 'picture' | 'switch' | 'child-play' | 'picture-build' | 'assistant'>('practice');
  const [kind, setKind] = useState<Kind>('sequence');
  const [rows, setRows] = useState<string[][]>(blankRows('sequence'));
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState(INSTRUCTIONS.sequence);
  const [sourceId, setSourceId] = useState(sources.find(source => source.status === 'ready')?.id ?? '');
  const [evidence, setEvidence] = useState('');
  const [explanation, setExplanation] = useState('');
  const [hint, setHint] = useState('Look for the relevant rule, relationship or example in the source.');
  const [reviewed, setReviewed] = useState(false);
  const [json, setJson] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<StructuredActivity | null>(null);
  const [budget, setBudget] = useState('12');
  const [currency, setCurrency] = useState('credits');
  const [minimum, setMinimum] = useState('4');
  const [requirement, setRequirement] = useState('Capacity');
  const [passChoice, setPassChoice] = useState('The request meets the policy');
  const [failChoice, setFailChoice] = useState('The request does not meet the policy');
  const [sample, setSample] = useState('');
  const [selfAssessment, setSelfAssessment] = useState(false);
  const [acyclic, setAcyclic] = useState(false);
  const [recipeBinding, setRecipeBinding] = useState('');
  const skipDraftSave = useRef(true);
  const draftSaveWarning = useRef(false);
  useEffect(() => {
    skipDraftSave.current = true;
    if (!notebookId) return;
    setTab('build'); setKind('sequence'); setRows(blankRows('sequence')); setTitle(''); setInstruction(INSTRUCTIONS.sequence);
    setSourceId(sources.find(source => source.status === 'ready')?.id ?? ''); setEvidence(''); setExplanation(''); setHint('Look for the relevant rule, relationship or example in the source.');
    setReviewed(false); setJson(''); setBudget('12'); setCurrency('credits'); setMinimum('4'); setRequirement('Capacity'); setPassChoice('The request meets the policy'); setFailChoice('The request does not meet the policy'); setSample(''); setSelfAssessment(false); setAcyclic(false); setRecipeBinding(''); setPreview(null); setMessage('');
    try {
      const raw = localStorage.getItem(`asterloom:activity-author:${notebookId}`);
      if (!raw) return;
      const envelope = JSON.parse(raw);
      if (!envelope || envelope.version !== 1 || envelope.notebookId !== notebookId || !envelope.draft || typeof envelope.draft !== 'object') return;
      const draft = envelope.draft as Record<string, unknown>;
      const draftKind = KINDS.some(item => item.id === draft.kind) ? draft.kind as Kind : 'sequence';
      const read = (key: string, fallback = '', max = 20000) => typeof draft[key] === 'string' ? (draft[key] as string).slice(0, max) : fallback;
      setKind(draftKind); setTab(draft.tab === 'json' ? 'json' : draft.tab === 'guided' ? 'guided' : 'build');
      const columns = KINDS.find(item => item.id === draftKind)!.columns.length;
      const validRows = Array.isArray(draft.rows) && draft.rows.length > 0 && draft.rows.length <= 20 && draft.rows.every(row => Array.isArray(row) && row.length === columns && row.every(cell => typeof cell === 'string' && cell.length <= 4000));
      setRows(validRows ? draft.rows as string[][] : blankRows(draftKind));
      setTitle(read('title')); setInstruction(read('instruction', INSTRUCTIONS[draftKind])); setSourceId(read('sourceId'));
      setEvidence(read('evidence')); setExplanation(read('explanation')); setHint(read('hint', 'Look for the relevant rule in the source.'));
      setReviewed(draft.reviewed === true); setJson(read('json', '', 2_000_000)); setBudget(read('budget', '12')); setCurrency(read('currency', 'credits'));
      setMinimum(read('minimum', '4')); setRequirement(read('requirement', 'Capacity')); setPassChoice(read('passChoice', 'The request meets the policy'));
      setFailChoice(read('failChoice', 'The request does not meet the policy')); setSample(read('sample')); setSelfAssessment(draft.selfAssessment === true);
      setAcyclic(draft.acyclic === true); setRecipeBinding(read('recipeBinding')); setPreview(null);
      setMessage('Your unfinished activity draft was restored.');
    } catch { setMessage('The saved authoring draft could not be restored. Your prepared notebook activities are unaffected.'); }
  }, [notebookId]);
  useEffect(()=>{if(initialEvidence&&isCurrentEvidence(initialEvidence,sources)){setTab('guided');setLaboratory('assistant');}},[initialEvidence]);
  useEffect(() => {
    if (skipDraftSave.current) { skipDraftSave.current = false; return; }
    if (!notebookId) return;
    const draft = { tab, kind, rows, title, instruction, sourceId, evidence, explanation, hint, reviewed, json, budget, currency, minimum, requirement, passChoice, failChoice, sample, selfAssessment, acyclic, recipeBinding };
    try { localStorage.setItem(`asterloom:activity-author:${notebookId}`, JSON.stringify({ version: 1, notebookId, updatedAt: new Date().toISOString(), draft })); }
    catch { if (!draftSaveWarning.current) { draftSaveWarning.current = true; setMessage('This browser could not save the unfinished authoring draft. Save the prepared activity or copy its JSON before leaving.'); onError('The unfinished activity draft could not be saved in browser storage.'); } }
  }, [notebookId, tab, kind, rows, title, instruction, sourceId, evidence, explanation, hint, reviewed, json, budget, currency, minimum, requirement, passChoice, failChoice, sample, selfAssessment, acyclic, recipeBinding]);
  const meta = KINDS.find(item => item.id === kind)!;
  const selectedSource = sources.find(source => source.id === sourceId);
  function fail(text: string) { setMessage(text); onError(text); }
  function chooseKind(next: Kind) { setKind(next); setReviewed(false); setRecipeBinding(''); setRows(blankRows(next)); setInstruction(INSTRUCTIONS[next]); setPreview(null); setMessage(''); }
  function changeCell(index: number, column: number, value: string) { setReviewed(false); setRows(previous => previous.map((row, i) => i === index ? row.map((cell, j) => j === column ? value : cell) : row)); }
  function build(): StructuredActivity | null {
    if (!selectedSource || selectedSource.status !== 'ready') { fail('Choose a readable source before building the activity.'); return null; }
    if (!evidence.trim() || !selectedSource.text.includes(evidence)) { fail('Add an exact excerpt from the selected source so the activity keeps its evidence.'); return null; }
    const clean = rows.map(row => row.map(cell => cell.trim()));
    if (clean.some(row => row.some((cell, column) => !cell && !(kind === 'rubric' && selfAssessment && column === 3)))) { fail('Complete every row, or remove a row you do not need.'); return null; }
    const base: ActivityBase = { version: 1, id: newId(), title: title.trim(), instruction: instruction.trim(), sourceRefs: [{ sourceId, evidence }], reviewStatus: reviewed ? 'reviewed' : 'needs-review', explanation: explanation.trim() || evidence, hint: hint.trim(), ...(recipeBinding ? { scaffoldIds: [recipeBinding] } : {}) };
    let activity: StructuredActivity;
    switch (kind) {
      case 'sequence': { const items = clean.map((row, i) => ({ id: `step-${i + 1}`, label: row[0] })); activity = { ...base, kind, items, constraints: items.slice(1).map((item, i) => ({ before: items[i].id, after: item.id })) }; break; }
      case 'classification': { const names = [...new Set(clean.map(row => row[1]))]; const categories = names.map((label, i) => ({ id: `category-${i + 1}`, label })); const itemNames = [...new Set(clean.map(row => row[0]))]; const items = itemNames.map((label, i) => ({ id: `item-${i + 1}`, label })); activity = { ...base, kind, categories, items, membership: items.map(item => ({ itemId: item.id, categoryIds: [...new Set(clean.filter(row => row[0] === item.label).map(row => categories.find(category => category.label === row[1])!.id))] })) }; break; }
      case 'decision': { if (new Set(clean.map(row => row[0])).size !== clean.length) { fail('Give every condition a distinct name.'); return null; } const context = Object.fromEntries(clean.map(row => [row[0], valueOf(row[2])])); const rules: Rule[] = clean.map(row => ({ op: 'eq', field: row[0], value: valueOf(row[1]) })); activity = { ...base, kind, context, choices: [{ id: 'meets-policy', label: passChoice.trim() }, { id: 'does-not-meet', label: failChoice.trim() }], rules: [{ id: 'required-conditions', when: { op: 'and', rules }, choiceId: 'meets-policy', reason: 'Every required condition matches the supplied rule.' }], defaultChoiceId: 'does-not-meet', defaultReason: 'At least one condition does not meet the supplied rule.' }; break; }
      case 'dependency': { const names = [...new Set(clean.flatMap(row => [row[0], row[2]]))], nodes = names.map((label, i) => ({ id: `node-${i + 1}`, label })); activity = { ...base, kind, nodes, edges: clean.map(row => ({ from: nodes.find(node => node.label === row[0])!.id, relation: row[1], to: nodes.find(node => node.label === row[2])!.id })), acyclic }; break; }
      case 'budget': { const items = clean.map((row, i) => ({ id: `resource-${i + 1}`, label: row[0], cost: Number(row[1]), unit: 'unit', maxQuantity: Number(row[2]) })); activity = { ...base, kind, budget: Number(budget), currency: currency.trim(), items, requirements: [{ id: 'capacity', label: requirement.trim(), minimum: Number(minimum), contributions: Object.fromEntries(items.map((item, i) => [item.id, Number(clean[i][3])])) }] }; break; }
      case 'rubric': activity = { ...base, kind, mode: selfAssessment ? 'self-assessment' : 'sample-review', sample: sample.trim(), criteria: clean.map((row, i) => ({ id: `criterion-${i + 1}`, label: row[0], levels: [row[1], row[2]], ...(!selfAssessment ? { expectedLevel: Number(row[3]) - 1 } : {}) })) }; break;
      case 'diagram': { const labels = clean.map((row, i) => ({ id: `label-${i + 1}`, label: row[0] })), targets = clean.map((row, i) => ({ id: `target-${i + 1}`, label: row[1], x: clean.length <= 4 ? 15 + i * 70 / Math.max(1, clean.length - 1) : 15 + i % 4 * 23, y: clean.length <= 4 ? 50 : 20 + Math.floor(i / 4) * 60 / Math.max(1, Math.ceil(clean.length / 4) - 1) })); activity = { ...base, kind, labels, targets, mapping: labels.map((label, i) => ({ labelId: label.id, targetId: targets[i].id })) }; break; }
    }
    const checked = validateActivity(activity, sources);
    if (!checked.success) { fail(checked.errors.slice(0, 3).join(' ')); return null; }
    return checked.value;
  }
  function extract() {
    const result = extractStructuredActivities(sources);
    if (!result.activities.length) { fail(result.warnings.join(' ')); return; }
    const next = combine(activities, result.activities); onChange(next); setMessage(`${result.activities.length} activities extracted for your review. Every answer follows explicit source structure.`);
  }
  function loadExamples() {
    if (!onLoadExample) { fail('Example loading is not connected in this workspace. You can still build from your own sources.'); return; }
    const source: Source = { ...EXAMPLE_ACTIVITY_SOURCE, kind: 'text', addedAt: new Date().toISOString() };
    const examples = structuredClone(ACTIVITY_EXAMPLES); onLoadExample(source, examples); setSourceId(source.id); setMessage('Eight worked examples and their source material were added. Open one to explore the interaction.');
  }
  function importJson() {
    const checked = parseActivities(json, sources);
    if (!checked.success) { fail(checked.errors.slice(0, 4).join(' ')); return; }
    onChange(combine(activities, checked.value)); setMessage(`${checked.value.length} activities saved with validated structure and source references.`); setPreview(checked.value[0]);
  }
  function loadLaboratories() {
    if (!onLoadExample) return;
    const sources = [...EXTENDED_EXAMPLE_SOURCES, ...SCENARIO_EXAMPLE_SOURCES, COMPOSITION_EXAMPLE_SOURCE].map(source => ({ ...source, kind: ('kind' in source ? source.kind : 'text') as Source['kind'], addedAt: 'addedAt' in source ? String(source.addedAt) : new Date().toISOString() }));
    const models = [...EXTENDED_EXAMPLES, ...SCENARIO_EXAMPLES, ...COMPOSITION_EXAMPLES];
    onLoadExample(structuredClone(sources), structuredClone(models)); setMessage(`${models.length} source-backed laboratory examples added. Explore their models, then replace them with your own reviewed material.`);
  }
  function loadPictureWorlds() {
    if (!onLoadExample) return;
    onLoadExample(structuredClone(pictureSources), structuredClone([pictureDiscoveryFixture, pictureWordFixture]));
    setMessage('Two picture activities and their annotated source scene were added. Picture facts come from the source annotations; optional narration can be attached by the creator.');
  }
  function loadAdvancedModes() {
    if (!onLoadExample) return;
    onLoadExample(structuredClone([...SCENARIO_MODE_SOURCES, ...SCENARIO_INTERACTION_SOURCES, COMPOSITION_MODE_EXAMPLE_SOURCE]), structuredClone([...SCENARIO_MODE_EXAMPLES, ...SCENARIO_INTERACTION_EXAMPLES, ...COMPOSITION_MODE_EXAMPLES]));
    setMessage('Prediction, multi-case planning, partner reasoning and source-code review examples were added with their reviewed source models.');
  }
  function loadChangingRules() {
    if (!onLoadExample) return;
    onLoadExample(structuredClone(ruleSwitchSources), [structuredClone(ruleSwitchFixture)]);
    setMessage('A two-round sorting game and its source annotations were added. The second rule genuinely changes how the same objects belong together.');
  }
  return <section className="activity-studio" aria-label="Structured activity studio">
    <div className="activity-studio-heading"><div><span className="structured-kicker">Make knowledge playable</span><h2>Go beyond the answer.</h2><p>Build a process, connect evidence, make a decision or solve a resource challenge. Everything here runs without AI.</p></div><span className="structured-badge"><Layers3 size={14}/>{Object.keys(ACTIVITY_KIND_LABELS).length} interaction engines</span></div>
    <div className="activity-studio-shortcuts"><button type="button" onClick={extract}><WandSparkles size={20}/><span><strong>Extract source structures</strong><small>Use explicit steps, tables, categories and relationships</small></span><Plus size={17}/></button><button type="button" onClick={loadExamples} disabled={!onLoadExample}><Sparkles size={20}/><span><strong>Load example activities</strong><small>Try seven foundational interactions with source material</small></span><Plus size={17}/></button></div>
    <details className="activity-format-help"><summary><BookOpen size={15}/>How to prepare material for automatic extraction</summary><p>Use these explicit structures in your notes. Extraction preserves what the source says; you review its accuracy.</p><div><code>1. Collect observations<br/>2. Compare results<br/>3. Explain the conclusion</code><code>Observation &gt; Display reads 12<br/>Interpretation &gt; Battery may be weak</code><code>Collect -&gt; precedes -&gt; Analyze<br/>If approval is missing then ask for approval</code></div></details>
    <div className="activity-builder-actions"><button type="button" className="structured-secondary" onClick={() => { onLoadExample?.(structuredClone(childPlaySources), structuredClone(childPlayFixtures)); setMessage('Two original source scripts and their playable story scenes were added.'); }} disabled={!onLoadExample}>Try puppet & pretend play</button><button type="button" className="structured-secondary" onClick={() => { onLoadExample?.(structuredClone(PICTURE_BUILD_EXAMPLE_SOURCE), structuredClone(PICTURE_BUILD_EXAMPLES)); setMessage('Two source-linked picture-building briefs and caregiver telling prompts were added.'); }} disabled={!onLoadExample}>Try build & tell</button><button type="button" className="structured-secondary" onClick={loadLaboratories} disabled={!onLoadExample}><Sparkles size={16}/>Explore advanced laboratories</button><button type="button" className="structured-secondary" onClick={loadPictureWorlds} disabled={!onLoadExample}>Try picture worlds</button><button type="button" className="structured-secondary" onClick={loadChangingRules} disabled={!onLoadExample}>Try changing rules</button><button type="button" className="structured-secondary" onClick={loadAdvancedModes} disabled={!onLoadExample}>Try prediction & team labs</button></div>
    <div className="activity-author-panel"><div className="activity-author-tabs" role="tablist" aria-label="Activity authoring method"><button type="button" role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'selected' : ''} onClick={() => setTab('build')}><Pencil size={16}/>Quick build</button><button type="button" role="tab" aria-selected={tab === 'guided'} className={tab === 'guided' ? 'selected' : ''} onClick={() => setTab('guided')}><Layers3 size={16}/>Design a laboratory</button><button type="button" role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? 'selected' : ''} onClick={() => setTab('json')}><Braces size={16}/>Advanced JSON</button></div>
    {tab === 'build' ? <div className="activity-builder"><div className="activity-kind-grid">{KINDS.map(item => <button type="button" key={item.id} className={kind === item.id ? 'selected' : ''} aria-pressed={kind === item.id} onClick={() => chooseKind(item.id)}><span>{item.icon}</span><strong>{item.name}</strong></button>)}</div><div className="activity-builder-purpose"><strong>{meta.name}</strong><span>{meta.purpose}</span></div>
      <div className="activity-form-grid"><label>Activity title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="A challenge worth exploring" maxLength={4000}/></label><label>Reference source<select value={sourceId} onChange={event => { setSourceId(event.target.value); setEvidence(''); }}><option value="">Choose a source</option>{sources.filter(source => source.status === 'ready').map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label></div>
      <label className="activity-field">Link to a suitable recipe (optional)<select value={recipeBinding} onChange={event => setRecipeBinding(event.target.value)}><option value="">Use as a standalone structured activity</option>{compatibleScaffoldsForActivity({ kind }).map(scaffold => <option key={scaffold.id} value={scaffold.id}>{scaffold.name}</option>)}</select><small className="structured-helper">Choose a recipe only when your authored content meets its learning objective. Review the answers and evidence before the recipe becomes playable.</small></label>
      <label className="activity-field">What should the player do?<textarea rows={2} value={instruction} onChange={event => setInstruction(event.target.value)}/></label>
      {kind === 'decision' && <><p className="structured-helper">All conditions below must match. Use true/false for switches, numbers for quantities, and plain words for categories. More complex rule trees can be imported with Advanced JSON.</p><div className="activity-form-grid"><label>When every condition matches<input value={passChoice} onChange={event => setPassChoice(event.target.value)}/></label><label>When a condition does not match<input value={failChoice} onChange={event => setFailChoice(event.target.value)}/></label></div></>}
      {kind === 'budget' && <div className="activity-form-grid four"><label>Available budget<input type="number" min="0" value={budget} onChange={event => setBudget(event.target.value)}/></label><label>Budget unit<input value={currency} onChange={event => setCurrency(event.target.value)}/></label><label>Requirement name<input value={requirement} onChange={event => setRequirement(event.target.value)}/></label><label>Minimum capacity<input type="number" min="0" value={minimum} onChange={event => setMinimum(event.target.value)}/></label></div>}
      {kind === 'rubric' && <><label className="activity-field">Sample or reflection prompt<textarea rows={3} value={sample} onChange={event => setSample(event.target.value)} placeholder="Paste a prepared sample to review, or a prompt for private reflection."/></label><label className="activity-check"><input type="checkbox" checked={selfAssessment} onChange={event => setSelfAssessment(event.target.checked)}/><span>Use this for self-reflection, with no automatic correctness grade</span></label></>}
      <div className="activity-row-table"><div className="activity-row-table-scroll"><table><thead><tr>{meta.columns.map((column, i) => <th key={column}>{kind === 'rubric' && selfAssessment && i === 3 ? 'Not graded' : column}</th>)}<th><span className="sr-only">Remove row</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}><input aria-label={`${meta.columns[column]}, row ${index + 1}`} placeholder={meta.placeholders[column]} value={value} disabled={kind === 'rubric' && selfAssessment && column === 3} onChange={event => changeCell(index, column, event.target.value)}/></td>)}<td><button type="button" className="structured-icon-button" aria-label={`Remove row ${index + 1}`} disabled={rows.length <= (kind === 'decision' || kind === 'budget' || kind === 'rubric' ? 1 : 2)} onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div><button type="button" className="structured-text-button" disabled={rows.length >= (kind === 'decision' ? 12 : 20)} onClick={() => setRows([...rows, Array(meta.columns.length).fill('')])}><Plus size={15}/>Add {kind === 'sequence' ? 'step' : kind === 'decision' ? 'condition' : 'row'}</button></div>
      {kind === 'classification' && <p className="structured-helper">Use at least two categories. Repeat an item on another row if it belongs to more than one category.</p>}
      {kind === 'dependency' && <label className="activity-check"><input type="checkbox" checked={acyclic} onChange={event => setAcyclic(event.target.checked)}/><span>These are dependencies that must not form a cycle</span></label>}
      {kind === 'diagram' && <p className="structured-helper">This creates a simple numbered schematic. Make each target description meaningful enough to use without seeing the picture.</p>}
      <div className="activity-evidence-field"><div><label htmlFor={`${prefix}-evidence`}>Exact source excerpt</label><button type="button" className="structured-text-button" disabled={!selectedSource?.text} onClick={() => setEvidence(selectedSource!.text.slice(0, 20000))}>Use source text</button></div><textarea id={`${prefix}-evidence`} value={evidence} onChange={event => setEvidence(event.target.value)} rows={3} placeholder="Paste the source passage that supports the answers. It must appear exactly in the selected source."/></div>
      <div className="activity-form-grid"><label>Explanation after the attempt<textarea rows={3} value={explanation} onChange={event => setExplanation(event.target.value)} placeholder="Explain why the solution works. Leave blank to show the source excerpt."/></label><label>A helpful hint<textarea rows={3} value={hint} onChange={event => setHint(event.target.value)}/></label></div>
      <label className="activity-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/><span>I checked the answers and their supporting evidence</span></label>
      <div className="activity-builder-actions"><button type="button" className="structured-secondary" onClick={() => { const activity = build(); if (activity) { setPreview(activity); setMessage('Preview ready. Try the activity before saving.'); } }}><Eye size={17}/>Preview activity</button><button type="button" className="structured-primary" onClick={() => { const activity = build(); if (activity) { onChange([...activities, activity]); setPreview(activity); setMessage('Activity saved. Its rules and evidence travel with the notebook.'); } }}><FilePlus2 size={17}/>Save activity</button></div>
    </div> : tab === 'guided' ? <div><div className="activity-author-tabs"><button type="button" className={laboratory === 'practice' ? 'selected' : ''} aria-pressed={laboratory === 'practice'} onClick={() => setLaboratory('practice')}>Worked models & recordings</button><button type="button" className={laboratory === 'scenario' ? 'selected' : ''} aria-pressed={laboratory === 'scenario'} onClick={() => setLaboratory('scenario')}>Investigation & decisions</button><button type="button" className={laboratory === 'composition' ? 'selected' : ''} aria-pressed={laboratory === 'composition'} onClick={() => setLaboratory('composition')}>Construction & reasoning</button><button type="button" className={laboratory === 'picture' ? 'selected' : ''} aria-pressed={laboratory === 'picture'} onClick={() => setLaboratory('picture')}>Picture discovery</button><button type="button" className={laboratory === 'switch' ? 'selected' : ''} aria-pressed={laboratory === 'switch'} onClick={() => setLaboratory('switch')}>Changing rules</button><button type="button" className={laboratory === 'child-play' ? 'selected' : ''} aria-pressed={laboratory === 'child-play'} onClick={() => setLaboratory('child-play')}>Puppets & pretend play</button><button type="button" className={laboratory === 'picture-build' ? 'selected' : ''} aria-pressed={laboratory === 'picture-build'} onClick={() => setLaboratory('picture-build')}>Build & tell</button><button type="button" className={laboratory === 'assistant' ? 'selected' : ''} aria-pressed={laboratory === 'assistant'} onClick={() => setLaboratory('assistant')}>Optional assistant</button></div>{laboratory === 'picture-build' ? <PictureBuildAuthor notebookId={notebookId} sources={sources} onSave={activity => { onChange([...activities, activity]); setPreview(activity); }} onError={onError}/> : laboratory === 'child-play' ? <ChildPlayAuthor notebookId={notebookId} sources={sources} onCreate={activity => { onChange([...activities, activity]); setPreview(activity); }}/> : laboratory === 'assistant' ? <ActivityAssistant initialEvidence={initialEvidence} notebookId={notebookId} ageGroup={ageGroup} goal={goal} sources={sources} onCreate={activity => { onChange([...activities, activity]); setPreview(activity); }} onError={onError}/> : laboratory === 'composition' ? <CompositionAuthor notebookId={notebookId} sources={sources} onSave={activity => { onChange([...activities, activity]); setPreview(activity); }} onError={onError}/> : laboratory === 'switch' ? <RuleSwitchAuthor notebookId={notebookId} sources={sources} onCreate={activity => { onChange([...activities, activity]); setPreview(activity); }}/> : laboratory === 'picture' ? <PictureAuthor notebookId={notebookId} sources={sources} onCreate={activity => { onChange([...activities, activity]); setPreview(activity); }}/> : laboratory === 'scenario' ? <ScenarioAuthor notebookId={notebookId ?? 'preview'} sources={sources} onSave={activity => { onChange([...activities, activity]); setPreview(activity); }} onError={onError}/> : <LaboratoryAuthor notebookId={notebookId} sources={sources} onSave={activity => { onChange([...activities, activity]); setPreview(activity); }} onError={onError}/>}</div> : <div className="activity-json-panel"><h3>A portable, editable definition</h3><p>Paste one activity or an array. Only supported data fields and bounded rules are accepted. Source references must match your notebook; existing activity IDs are updated.</p><label htmlFor={`${prefix}-json`}>Activity JSON</label><textarea id={`${prefix}-json`} className="activity-json-editor" rows={15} spellCheck={false} value={json} onChange={event => setJson(event.target.value)} placeholder={'{\n  "version": 1,\n  "kind": "sequence",\n  ...\n}'}/><div className="activity-builder-actions"><button type="button" className="structured-secondary" disabled={!json.trim()} onClick={() => { const checked = parseActivities(json, sources); if (!checked.success) fail(checked.errors.slice(0, 4).join(' ')); else { setPreview(checked.value[0]); setMessage(`${checked.value.length} valid activities. Previewing the first.`); } }}><Eye size={17}/>Validate and preview</button><button type="button" className="structured-primary" disabled={!json.trim()} onClick={importJson}><Plus size={17}/>Import activities</button></div></div>}
    </div>
    {message && <p className="activity-studio-status" role="status"><CheckCircle2 size={17}/>{message}</p>}
    {preview && <div className="activity-preview"><div className="activity-preview-heading"><span className="structured-kicker">Play preview · changes here do not affect learner progress</span><button type="button" className="structured-text-button" onClick={() => setPreview(null)}>Close preview</button></div><StructuredBoard key={preview.id} activity={preview} sources={sources} onSave={() => {}} onComplete={() => {}}/></div>}
    <div className="activity-library-heading"><div><h3>Your structured activities <span>{activities.length}</span></h3><p>Each one carries its source material, answer rules and explanations.</p></div><button type="button" className="structured-secondary" disabled={!activities.length} onClick={() => { try { const content = exportActivities(activities); const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'learning-activities.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { fail(error instanceof Error ? error.message : 'Export failed.'); } }}><Download size={16}/>Export JSON</button></div>
    <div className="activity-library">{activities.map(activity => <article key={activity.id}><div className="activity-library-icon">{KINDS.find(kind => kind.id === activity.kind)?.icon ?? '🛠️'}</div><div className="activity-library-copy"><span className="structured-kicker">{ACTIVITY_KIND_LABELS[activity.kind]}</span><h4>{activity.title}</h4><p>{activity.instruction}</p><span className={`activity-review-tag ${activity.reviewStatus}`}>{activity.reviewStatus === 'reviewed' ? 'Author reviewed' : 'Needs author review'}</span></div><div className="activity-library-actions">{activity.reviewStatus !== 'reviewed' && <button type="button" className="structured-text-button" onClick={() => { const checked = validateActivity(activity, sources); if (!checked.success) { fail(checked.errors.slice(0, 3).join(' ')); return; } onChange(activities.map(item => item.id === activity.id ? { ...item, reviewStatus: 'reviewed' } : item)); if (preview?.id === activity.id) setPreview({ ...activity, reviewStatus: 'reviewed' }); setMessage('Marked reviewed. Your approval confirms you checked the answers, source evidence and intended audience.'); }}><CheckCircle2 size={15}/>Mark reviewed</button>}<button type="button" className="structured-icon-button" aria-label={`Preview ${activity.title}`} onClick={() => setPreview(activity)}><Eye size={18}/></button><button type="button" className="structured-icon-button" aria-label={`Edit ${activity.title}`} onClick={() => { setJson(JSON.stringify(activity, null, 2)); setTab('json'); setMessage('The activity is open in Advanced JSON. Import to save changes under the same ID.'); }}><Pencil size={17}/></button><button type="button" className="structured-icon-button" aria-label={`Remove ${activity.title}`} onClick={() => { onChange(activities.filter(item => item.id !== activity.id)); if (preview?.id === activity.id) setPreview(null); }}><Trash2 size={17}/></button></div></article>)}</div>
    {!activities.length && <div className="activity-empty"><Layers3 size={27}/><h3>A richer challenge starts with a clear rule.</h3><p>Build one above, extract explicit structures from your sources, or explore the worked examples.</p></div>}
  </section>;
}
