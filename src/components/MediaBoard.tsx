import { useEffect, useId, useRef, useState } from 'react';
import type { Source } from '../types';
import { mediaCaptionTrack } from '../lib/mediaEngine';
import { duckMusic } from '../lib/music';
import type { MediaActivity, MediaResponse } from '../lib/mediaEngine';
import './extended.css';
export default function MediaBoard({ activity, response, sources, onChange }: { activity: MediaActivity; response: MediaResponse; sources: Source[]; onChange: (value: MediaResponse) => void }) {
  const media = useRef<HTMLMediaElement | null>(null), restored = useRef(false), prefix = useId(), [error, setError] = useState('');
  const currentResponse = useRef(response), manualSeek = useRef(false);
  currentResponse.current = response;
  const source = sources.find(s => s.id === activity.mediaSourceId), active = activity.checkpoints.find(c => c.id === response.activeCheckpointId) ?? activity.checkpoints[0];
  useEffect(() => () => duckMusic(false), []);
  const playable = source?.dataUrl && /^data:(?:audio|video)\/[a-z0-9.+-]+;base64,/i.test(source.dataUrl);
  const time = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  function emit(next: MediaResponse) { currentResponse.current = next; onChange(next); }
  function seek(position: number, checkpointId = response.activeCheckpointId) {
    manualSeek.current = true;
    emit({ ...currentResponse.current, position, activeCheckpointId: checkpointId, visitedCheckpointIds: [...new Set([...currentResponse.current.visitedCheckpointIds, ...activity.checkpoints.filter(c => c.at <= position + .15).map(c => c.id)])] });
    if (media.current) { media.current.pause(); media.current.currentTime = position; } else manualSeek.current = false;
  }
  function update() {
    if (!media.current || manualSeek.current) return;
    const current = currentResponse.current, position = Math.min(activity.duration, media.current.currentTime), checkpoint = !media.current.paused && activity.checkpoints.find(c => c.at <= position + .15 && !current.visitedCheckpointIds.includes(c.id));
    if (checkpoint) { emit({ ...current, position, activeCheckpointId: checkpoint.id, visitedCheckpointIds: [...current.visitedCheckpointIds, checkpoint.id] }); media.current.pause(); }
    else if (Math.abs(position - current.position) >= 1 || media.current.paused && Math.abs(position - current.position) > .01) emit({ ...current, position });
  }
  const props = { controls: true, preload: 'metadata', src: playable ? source!.dataUrl : undefined, ref: (element: HTMLMediaElement | null) => { media.current = element; }, onLoadedMetadata: () => { if (!restored.current && media.current) { media.current.currentTime = Math.min(response.position, Number.isFinite(media.current.duration) ? media.current.duration : activity.duration); restored.current = true; if (Number.isFinite(media.current.duration) && Math.abs(media.current.duration - activity.duration) > 1) setError('The recording length differs from the authored timeline. Ask the creator to review cue and checkpoint times.'); } }, onTimeUpdate: update, onSeeked: () => { manualSeek.current = false; update(); }, onPlay: () => { manualSeek.current = false; duckMusic(true); }, onPause: () => { duckMusic(false); update(); }, onEnded: () => duckMusic(false), onError: () => { manualSeek.current = false; duckMusic(false); setError('This device could not play the attached recording. The transcript and checkpoint responses remain available.'); } };
  return <div className="media-workbench">{playable ? source?.kind === 'video' || source?.mime?.startsWith('video/') ? <video {...props}><track kind="captions" src={mediaCaptionTrack(activity)} label="Source transcript" default/></video> : <audio {...props}/> : <p role="alert" className="structured-notice warning">Attach the original audio or video file to this source to enable offline playback. The text transcript is available below.</p>}{error && <p role="status">{error}</p>}
    <p className="structured-helper">The recording pauses at new checkpoints. You can revisit any segment or work from the transcript. Position and responses are saved; listening time does not earn points.</p>
    <nav className="media-progress" aria-label="Recording checkpoints">{activity.checkpoints.map((c, i) => <button type="button" key={c.id} aria-current={active.id === c.id} onClick={() => seek(c.at, c.id)}>{i + 1} · {time(c.at)} {response.answers[c.id] ? '✓' : ''}</button>)}</nav>
    <fieldset className="media-checkpoint"><legend>At {time(active.at)} · {active.prompt}</legend>{active.choices.map(c => <label key={c.id}><input type="radio" name={`${prefix}-${active.id}`} checked={response.answers[active.id] === c.id} onChange={() => emit({ ...currentResponse.current, answers: { ...currentResponse.current.answers, [active.id]: c.id } })}/>{c.label}</label>)}<button type="button" className="structured-secondary" style={{ marginTop: 14 }} onClick={() => { if (media.current) void media.current.play().catch(() => setError('Use the recording’s play control to resume playback.')); }}>Continue recording</button></fieldset>
    <details open><summary>Timed source transcript</summary><div className="media-cues">{activity.cues.map(c => <button type="button" key={c.id} className={response.position >= c.start && response.position < c.end ? 'current' : ''} onClick={() => seek(c.start)}><strong>{time(c.start)}</strong> · {c.text}</button>)}</div></details>
  </div>;
}
