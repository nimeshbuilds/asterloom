import { useEffect, useState } from 'react';
import type { Source } from '../types';
import type { PictureActivity, PictureRound, PictureToken } from '../lib/pictureEngine';
import { isPictureNarration, isPictureRaster, validatePictureFields, validatePictureSources } from '../lib/pictureEngine';
import { initialPictureAuthorDraft, restorePictureAuthorDraft } from '../lib/pictureAuthorDraft';
import type { PictureAuthorDraft, PictureRegionDraft, PictureRoundDraft } from '../lib/pictureAuthorDraft';
import './picture.css';

const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
type Props = { sources: Source[]; notebookId?: string; onCreate: (activity: PictureActivity) => void; onCancel?: () => void };
/** A deterministic authoring path: a creator marks actual source regions and reviews the rules. */
export default function PictureAuthor(props: Props) {
  const draftKey = `asterloom.picture-author.v1.${props.notebookId ?? props.sources.map(s => s.id).join('|').slice(0, 300)}`;
  return <PictureAuthorForm {...props} draftKey={draftKey} key={draftKey}/>;
}
function PictureAuthorForm({ sources, onCreate, onCancel, draftKey }: Props & { draftKey: string }) {
  const images = sources.filter(s => isPictureRaster(s.dataUrl));
  const [initial] = useState(() => { try { const raw = localStorage.getItem(draftKey); return raw && raw.length <= 1024 * 1024 ? restorePictureAuthorDraft(JSON.parse(raw), images[0]?.id) : initialPictureAuthorDraft(images[0]?.id); } catch { return initialPictureAuthorDraft(images[0]?.id); } });
  const [sourceId, setSourceId] = useState(initial.sourceId), [title, setTitle] = useState(initial.title);
  const [mode, setMode] = useState(initial.mode), [sceneAlt, setSceneAlt] = useState(initial.sceneAlt);
  const [caregiverNote, setCaregiverNote] = useState(initial.caregiverNote);
  const [regions, setRegions] = useState<PictureRegionDraft[]>(initial.regions), [rounds, setRounds] = useState<PictureRoundDraft[]>(initial.rounds);
  const [point, setPoint] = useState(initial.point);
  const [selection, setSelection] = useState(initial.selection);
  const [label, setLabel] = useState(initial.label), [excerpt, setExcerpt] = useState(initial.excerpt), [errors, setErrors] = useState<string[]>([]), [saveError, setSaveError] = useState('');
  useEffect(() => {
    const draft: PictureAuthorDraft = { version: 1, sourceId, title, mode, sceneAlt, caregiverNote, regions, rounds, point, selection, label, excerpt };
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); setSaveError(''); } catch { setSaveError('This device could not save the unfinished picture activity. Keep this form open until you save the activity, or free some browser storage.'); }
  }, [draftKey, sourceId, title, mode, sceneAlt, caregiverNote, regions, rounds, point, selection, label, excerpt]);
  const source = sources.find(s => s.id === sourceId);
  function addRegion() {
    if (!source || !label.trim() || !excerpt.trim() || !source.text.includes(excerpt) || !excerpt.includes(label.trim())) { setErrors(['Use the region’s name exactly as it appears in an exact excerpt of the image source notes.']); return; }
    if (regions.length >= 8) return;
    setRegions([...regions, { id: makeId('picture'), label: label.trim(), ...selection, evidence: excerpt }]); setLabel(''); setPoint(null); setErrors([]);
  }
  function create() {
    if (!source) return;
    const refs: PictureActivity['sourceRefs'] = [];
    function evidence(sourceId: string, quote: string) { let i = refs.findIndex(r => r.sourceId === sourceId && r.evidence === quote); if (i < 0) { i = refs.length; refs.push({ sourceId, evidence: quote }); } return i; }
    const tokens: PictureToken[] = regions.map(({ evidence: quote, ...region }) => ({ ...region, evidenceRefs: [evidence(source.id, quote)] }));
    const prepared: PictureRound[] = rounds.map(r => {
      const prompt = mode === 'word-picture' ? regions.find(t => t.id === r.correctId)?.label ?? '' : r.prompt;
      const evidenceRefs = [evidence(source.id, r.evidence)];
      if (r.narrationSourceId) evidenceRefs.push(evidence(r.narrationSourceId, prompt));
      return { id: r.id, prompt, tokenIds: regions.slice(0, 6).map(t => t.id), correctTokenIds: [r.correctId], reason: r.reason, evidenceRefs, ...(r.narrationSourceId ? { narrationSourceId: r.narrationSourceId } : {}) };
    });
    const activity: PictureActivity = { version: 1, id: makeId('picture-activity'), kind: 'picture', mode, title: title.trim(), instruction: 'Explore the picture, then choose a picture for each clue.', explanation: 'The prepared choices refer to the creator’s reviewed source image and annotations.', hint: 'Look at the picture and its source notes together.', reviewStatus: 'needs-review', sourceRefs: refs, sceneSourceId: source.id, sceneAlt: sceneAlt.trim(), caregiverNote: caregiverNote.trim(), tokens, rounds: prepared };
    const issues = [...(!activity.title ? ['Give the picture activity a title.'] : []), ...validatePictureFields(activity as unknown as Record<string, unknown>), ...validatePictureSources(activity, sources)];
    if (issues.length) { setErrors(issues); return; }
    onCreate(activity);
    try { localStorage.removeItem(draftKey); } catch { /* The saved notebook remains authoritative. */ }
  }
  function updateRound(id: string, update: Partial<PictureRoundDraft>) { setRounds(rounds.map(r => r.id === id ? { ...r, ...update } : r)); }
  return <div className="picture-author picture-board">
    <h3>Make a picture activity</h3><p>Use a real image from your material. Mark its regions, attach exact source notes, and prepare the clues. Your unfinished form saves on this device; the completed activity starts as a draft for review.</p>{saveError && <p role="alert" className="picture-notice">{saveError}</p>}
    {!images.length ? <p role="alert" className="picture-notice">First add a PNG, JPEG or WebP source image and an accurate text description of its contents. This activity never invents what a picture contains.</p> : <>
      <label>Activity title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)}/></label>
      <label>Picture source<select aria-label="Picture source" value={sourceId} onChange={e => { setSourceId(e.target.value); setRegions([]); setRounds([]); setPoint(null); setErrors([]); }}>{!images.some(s => s.id === sourceId) && <option value={sourceId}>Missing image — choose a replacement</option>}{images.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label>
      <label>How children will play<select aria-label="How children will play" value={mode} onChange={e => setMode(e.target.value as PictureActivity['mode'])}><option value="discovery">Explore a scene and respond to picture clues</option><option value="word-picture">Match a written word to its picture</option></select></label>
      <label>Accessible scene description<textarea aria-label="Accessible scene description" value={sceneAlt} maxLength={2000} onChange={e => setSceneAlt(e.target.value)} placeholder="Describe the scene clearly, without relying on color alone."/></label>
      <details><summary>Original image source notes</summary><p className="picture-source-notes">{source?.text || 'This image needs a reviewed text description in Sources before it can support an activity.'}</p></details>
      <fieldset><legend>1. Mark picture regions</legend><p>Click two opposite corners around one object. You can also enter the region coordinates below, as percentages of the original picture. Keep each region focused on a single object.</p>
        <div className="picture-author-scene" onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect(), next = { x: Math.round((e.clientX - rect.left) / rect.width * 1000) / 10, y: Math.round((e.clientY - rect.top) / rect.height * 1000) / 10 };
          if (!point) { setPoint(next); return; }
          setSelection({ x: Math.min(point.x, next.x), y: Math.min(point.y, next.y), width: Math.round(Math.abs(point.x - next.x) * 10) / 10, height: Math.round(Math.abs(point.y - next.y) * 10) / 10 }); setPoint(null);
        }}><img src={source?.dataUrl} alt={sceneAlt || 'Source picture; numerical region controls are available below.'}/>{regions.map(region => <span key={region.id} className="picture-author-region" style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}>{region.label}</span>)}<span className="picture-author-region draft" style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }}/></div>
        <p role="status">{point ? 'First corner set. Click the opposite corner.' : 'Current region shown with a dashed border.'}</p>
        <div className="picture-coordinate-fields">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{({ x: 'Left (%)', y: 'Top (%)', width: 'Width (%)', height: 'Height (%)' })[key]}<input type="number" min={0} max={100} step="0.1" value={selection[key]} onChange={e => setSelection({ ...selection, [key]: e.target.valueAsNumber })}/></label>)}</div>
        <label>Object name, exactly as written in the source notes<input value={label} maxLength={120} onChange={e => setLabel(e.target.value)}/></label>
        <label>Exact source excerpt describing this object<textarea aria-label="Exact source excerpt describing this object" value={excerpt} maxLength={20000} onChange={e => setExcerpt(e.target.value)}/></label>
        <button type="button" disabled={regions.length >= 6} onClick={addRegion}>Add picture region ({regions.length}/6)</button>
        <ul>{regions.map(region => <li key={region.id}>{region.label} <button type="button" onClick={() => { setRegions(regions.filter(r => r.id !== region.id)); setRounds(rounds.filter(r => r.correctId !== region.id)); }}>Remove {region.label}</button></li>)}</ul>
      </fieldset>
      <fieldset><legend>2. Prepare short clues</legend><p>Every clue uses the marked picture choices. Nothing is generated or graded by AI.</p>
        {rounds.map((r, i) => <div className="picture-round-author" key={r.id}><h4>Clue {i + 1}</h4><label>Correct picture<select aria-label="Correct picture" value={r.correctId} onChange={e => updateRound(r.id, { correctId: e.target.value })}>{regions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>{mode === 'discovery' ? <label>Clue the child will read or hear<input value={r.prompt} maxLength={500} onChange={e => updateRound(r.id, { prompt: e.target.value })}/></label> : <p>The displayed word will be <strong>{regions.find(t => t.id === r.correctId)?.label}</strong>.</p>}<label>Exact source excerpt supporting the answer<textarea aria-label="Exact source excerpt supporting the answer" value={r.evidence} maxLength={20000} onChange={e => updateRound(r.id, { evidence: e.target.value })}/></label><label>Explanation after checking<textarea aria-label="Explanation after checking" value={r.reason} maxLength={2000} onChange={e => updateRound(r.id, { reason: e.target.value })}/></label><label>Optional recording of this exact clue<select aria-label="Optional recording of this exact clue" value={r.narrationSourceId} onChange={e => updateRound(r.id, { narrationSourceId: e.target.value })}><option value="">No recording; a caregiver can read it</option>{sources.filter(s => isPictureNarration(s.dataUrl)).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><small>The recording source must include this exact clue in its transcript. Upload your recording in Sources first.</small><button type="button" onClick={() => setRounds(rounds.filter(v => v.id !== r.id))}>Remove clue {i + 1}</button></div>)}
        <button type="button" disabled={regions.length < 2 || rounds.length >= 12} onClick={() => setRounds([...rounds, { id: makeId('clue'), prompt: '', correctId: regions[0].id, evidence: regions[0].evidence, reason: '', narrationSourceId: '' }])}>Add a clue</button>
      </fieldset>
      <label>Caregiver guidance<textarea aria-label="Caregiver guidance" value={caregiverNote} maxLength={2000} onChange={e => setCaregiverNote(e.target.value)}/></label>
      <button type="button" className="picture-primary" disabled={regions.length < 2 || !rounds.length} onClick={create}>Save picture activity for review</button>
    </>}{errors.length > 0 && <div role="alert" className="picture-notice"><p>These details need attention before saving:</p><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
  </div>;
}
