import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Sparkles } from 'lucide-react';
import type { Source,EvidenceReference } from '../types';
import {isCurrentEvidence} from '../lib/evidence';
import type { StructuredActivity } from '../lib/structuredEngine';
import {useProviderSession,canRequest} from '../lib/providerSession';
import ProviderConnection from './ProviderConnection';
import { ASSISTANT_ACTIVITY_KINDS, createActivityDraftPrompt, requestActivityDraft, validateActivityDraft } from '../lib/activityAssistant';
import type { ActivityDraftRequest } from '../lib/activityAssistant';
import { download } from '../lib/imports';
import './extended.css';

export interface ActivityAuthorDraft { sourceId: string; excerpt: string; kind: ActivityDraftRequest['kind']; reply: string }
/** Explicitly whitelist author text. Provider configuration never enters a draft file. */
export function serializeActivityAuthorDraft(draft: ActivityAuthorDraft): string {
  return JSON.stringify({ format: 'asterloom-activity-draft', version: 1, sourceId: draft.sourceId, excerpt: draft.excerpt, kind: draft.kind, reply: draft.reply }, null, 2);
}
export function parseActivityAuthorDraft(text: string): ActivityAuthorDraft {
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024) throw new Error('The activity draft backup exceeds 1 MB.');
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new Error('Choose an Asterloom activity draft JSON backup.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose an Asterloom activity draft JSON backup.');
  const value = raw as Record<string, unknown>;
  if (value.format !== 'asterloom-activity-draft' || value.version !== 1 || typeof value.sourceId !== 'string' || value.sourceId.length > 200 || typeof value.excerpt !== 'string' || value.excerpt.length > 6000 || typeof value.reply !== 'string' || value.reply.length > 100_000 || value.kind !== 'auto' && !ASSISTANT_ACTIVITY_KINDS.includes(value.kind as never)) throw new Error('This activity draft has unsupported fields or size limits.');
  return { sourceId: value.sourceId, excerpt: value.excerpt, kind: value.kind as ActivityDraftRequest['kind'], reply: value.reply };
}

export default function ActivityAssistant({ notebookId = 'preview', sources, ageGroup = 'adult', goal = 'Apply the material', onCreate, onError, initialEvidence }: {
  initialEvidence?: EvidenceReference; notebookId?: string; sources: Source[]; ageGroup?: string; goal?: string; onCreate: (activity: StructuredActivity) => void; onError: (message: string) => void;
}) {
  const key = `asterloom:activity-assistant:${notebookId}`;
  const [initial] = useState(() => { try { const v = JSON.parse(localStorage.getItem(key) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } });
  const [sourceId, setSourceId] = useState(typeof initial.sourceId === 'string' ? initial.sourceId : sources.find(s => s.status === 'ready' && s.text)?.id ?? '');
  const [excerpt, setExcerpt] = useState(typeof initial.excerpt === 'string' ? initial.excerpt.slice(0, 6000) : '');
  const [kind, setKind] = useState<ActivityDraftRequest['kind']>(ASSISTANT_ACTIVITY_KINDS.includes(initial.kind) ? initial.kind : 'auto');
  const [reply, setReply] = useState(typeof initial.reply === 'string' ? initial.reply.slice(0, 100_000) : '');
  const [config, setConfig] = useProviderSession();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [draftSaveError, setDraftSaveError] = useState('');
  const saveFailureReported = useRef(false), draftInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null), latest = useRef({ sources, onCreate, onError }); latest.current = { sources, onCreate, onError };
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ sourceId, excerpt, kind, reply })); setDraftSaveError(''); saveFailureReported.current = false; }
    catch {
      const warning = 'This activity draft could not be saved on this device. Save a draft backup before leaving this screen.';
      setDraftSaveError(warning);
      if (!saveFailureReported.current) { saveFailureReported.current = true; latest.current.onError(warning); }
    }
  }, [key, sourceId, excerpt, kind, reply]);
  useEffect(()=>{if(initialEvidence&&isCurrentEvidence(initialEvidence,latest.current.sources)){setSourceId(initialEvidence.sourceId);setExcerpt(initialEvidence.quote);setReply('');setMessage('The exact selected evidence is ready. Review the passage, then choose whether to request a draft.');}},[initialEvidence]);
  const source = sources.find(s => s.id === sourceId);
  function request(): ActivityDraftRequest {
    const current = latest.current.sources.find(s => s.id === sourceId);
    if (!current || current.status !== 'ready') throw new Error('Select a readable source first.');
    return { source: current, excerpt, kind, ageGroup, goal };
  }
  function report(error: unknown) { onError(error instanceof Error ? error.message : String(error)); }
  async function copy() { try { await navigator.clipboard.writeText(createActivityDraftPrompt(request())); setMessage('Prompt copied. Send it only to the assistant you choose.'); } catch (error) { report(error); } }
  async function generate() {
    try {
      const input = request(); createActivityDraftPrompt(input);
      setBusy(true); setMessage('Preparing one draft. Your existing activities stay saved.'); controller.current = new AbortController();
      const text = await requestActivityDraft(input, config, controller.current.signal);
      const current = latest.current.sources.find(s => s.id === input.source.id);
      if (!current || current.text !== input.source.text) throw new Error('The source changed during drafting. Your edits were kept; prepare a new request from the current source.');
      setReply(text); setMessage('Draft received. Validate it, then review every rule and answer against the source.');
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) report(error); else setMessage('Request canceled.'); }
    finally { setBusy(false); controller.current = null; }
  }
  async function restoreDraft(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('The activity draft backup exceeds 1 MB.');
      const draft = parseActivityAuthorDraft(await file.text());
      const original = latest.current.sources.find(source => source.id === draft.sourceId && source.status === 'ready');
      if ((draft.sourceId || draft.excerpt) && (!original || !original.text.includes(draft.excerpt))) throw new Error('This draft needs its original readable source and exact passage. Restore that material before loading this draft.');
      setSourceId(draft.sourceId); setExcerpt(draft.excerpt); setKind(draft.kind); setReply(draft.reply);
      setMessage('Draft restored. Its activity still needs validation and author review.');
    } catch (error) { report(error); }
    finally { if (draftInput.current) draftInput.current.value = ''; }
  }
  function apply() {
    try {
      const activity = validateActivityDraft(request(), reply, `activity-${crypto.randomUUID()}`);
      latest.current.onCreate(activity); setReply(''); setMessage('Draft added for author review. Exact citations and valid structure do not prove that its reasoning is correct.');
    } catch (error) { report(error); }
  }
  return <div className="laboratory-author activity-assistant">
    <h3>A little help preparing a model</h3><p>Choose a short passage. An optional assistant can draft one process, sorting, connection, completion or resource game. You review its rules before sharing.</p>
    {draftSaveError && <p role="alert" className="structured-notice warning">{draftSaveError}</p>}
    <div className="activity-builder-actions"><button type="button" className="structured-secondary" disabled={busy || (!sourceId && !excerpt && !reply)} onClick={() => download(serializeActivityAuthorDraft({ sourceId, excerpt, kind, reply }), 'asterloom-activity-draft.json', 'application/json')}><Download size={16}/>Save draft backup</button><button type="button" className="structured-secondary" disabled={busy} onClick={() => draftInput.current?.click()}>Restore draft backup</button><input ref={draftInput} type="file" hidden accept=".json,application/json" aria-label="Restore activity draft file" onChange={event => void restoreDraft(event.target.files?.[0])}/></div>
    <label>Draft source<select value={sourceId} onChange={event => { setSourceId(event.target.value); setExcerpt(''); setReply(''); }} disabled={busy}><option value="">Choose material</option>{sources.filter(s => s.status === 'ready' && s.text).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <details><summary>Read the selected source</summary><pre className="activity-source-preview">{source?.text.slice(0, 30_000) ?? 'Select readable material.'}</pre></details>
    <label>Exact passage to share<textarea rows={5} maxLength={6000} value={excerpt} onChange={event => setExcerpt(event.target.value)} disabled={busy} placeholder="Paste an exact passage from your source"/></label>
    <label>Activity to prepare<select value={kind} disabled={busy} onChange={event => setKind(event.target.value as typeof kind)}><option value="auto">Let the assistant choose a supported family</option>{ASSISTANT_ACTIVITY_KINDS.map(k => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select></label>
    <p className="structured-helper">Only this passage, source title, audience and learning goal are shared. One request with no automatic retries. API routes request at most 3,000 output tokens; ChatGPT plan requests use provider-controlled limits. The provider may charge for API use.</p>
    <div className="activity-builder-actions"><button type="button" className="structured-secondary" disabled={!excerpt.trim()} onClick={() => void copy()}><Copy size={16}/>Copy activity prompt</button><button type="button" className="structured-secondary" disabled={!excerpt.trim()} onClick={() => { try { download(createActivityDraftPrompt(request()), 'asterloom-activity-prompt.txt', 'text/plain'); } catch (error) { report(error); } }}><Download size={16}/>Save activity prompt</button></div>
    <details><summary>Or use an API / local model</summary><p>Connect an available provider below. You can also use the prepared prompt with your existing assistant.</p>
      <ProviderConnection config={config} onChange={setConfig} disabled={busy}/>
      <button type="button" className="structured-secondary" disabled={busy || !excerpt.trim() || !canRequest(config)} onClick={() => void generate()}><Sparkles size={16}/>{busy ? 'Preparing a draft…' : 'Request one activity draft'}</button>
      {busy && <button type="button" className="structured-secondary" onClick={() => controller.current?.abort()}>Cancel request</button>}
    </details>
    <label>Activity assistant JSON reply<textarea aria-label="Activity assistant JSON reply" rows={8} maxLength={100_000} value={reply} disabled={busy} onChange={event => setReply(event.target.value)} placeholder={'{"activity":{…}}'}/></label>
    <button type="button" className="structured-primary" disabled={busy || !reply.trim()} onClick={apply}>Validate and add draft</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
