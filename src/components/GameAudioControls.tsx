import { useEffect, useState } from 'react';
import { Music2, Play, SkipForward, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { getSoundPreferences, setSoundPreferences, getMusicPreferences, setMusicPreferences, getMusicRuntimeStatus, unlockGameAudio, skipLearningSoundtrack, previewRewardSound, gameActionFeedback, MUSIC_TRACKS } from '../lib/music';
import './game-audio.css';

interface Props { music: boolean; onMusicChange: (enabled: boolean) => void; volume: number; onVolumeChange: (volume: number) => void; trackName?: string }
/** One explicit sound choice, with an independent mix and a real reward sound check. */
export default function GameAudioControls({ music, onMusicChange, volume, onVolumeChange, trackName }: Props) {
  const [sound, setSound] = useState(getSoundPreferences);
  const [soundtrack, setSoundtrack] = useState(getMusicPreferences);
  const [runtime, setRuntime] = useState(getMusicRuntimeStatus);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const refresh = () => { setSoundtrack(getMusicPreferences()); setRuntime(getMusicRuntimeStatus()); };
    window.addEventListener('asterloom:music-preferences', refresh);
    window.addEventListener('asterloom:music-status', refresh);
    return () => { window.removeEventListener('asterloom:music-preferences', refresh); window.removeEventListener('asterloom:music-status', refresh); };
  }, []);
  useEffect(() => {
    const refresh = () => setSound(getSoundPreferences());
    window.addEventListener('asterloom:sound-preferences', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('asterloom:sound-preferences', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const currentTrack = MUSIC_TRACKS.find(item => item.id === (runtime.trackId ?? runtime.selection?.trackId))?.name ?? trackName;
  const playbackLabel = !music ? 'Ready' : volume === 0 ? 'Music muted' : runtime.state === 'playing' ? 'Playing' : runtime.state === 'suspended' ? 'Paused' : runtime.state === 'unavailable' ? 'Audio unavailable' : 'Ready';
  const active = music || sound.enabled;
  const effectsAllowed = runtime.effects !== 'off';
  const audibleEffects = sound.enabled && sound.volume > 0 && effectsAllowed;
  const audibleMusic = music && volume > 0;
  const soundLabel = !active ? 'Enable game sound' : audibleEffects && audibleMusic ? 'Sound on' : audibleEffects ? 'Effects on' : audibleMusic ? 'Music only' : 'Sound muted';
  const soundDetail = !active ? 'Music, actions & celebrations' : !effectsAllowed ? 'This game has effects off' : !audibleEffects ? 'Reward sounds are muted' : !audibleMusic ? 'Actions & celebrations' : 'Music & reward sounds';
  function update(patch: Partial<typeof sound>) { setSoundPreferences(patch); setSound(getSoundPreferences()); setPreview(''); }
  function soundCheck() {
    unlockGameAudio();
    setPreview(previewRewardSound() ? 'Reward sound played. This is a preview; no points are awarded.' : 'Sound is paused or another recording is playing. Try again when it finishes.');
  }
  return <div className="game-audio-controls" data-sound-enabled={active}>
    <div className="game-audio-choice">
      <button type="button" className="game-audio-toggle" aria-pressed={active} onClick={() => {
        const enabled = !active;
        update({ enabled }); onMusicChange(enabled);
        if (enabled) gameActionFeedback('reveal');
      }}>{active ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{soundLabel}</span></button>
      <small className="game-audio-hint">{soundDetail}</small>
    </div>
    <details className="game-audio-mixer"><summary aria-label="Adjust game audio"><SlidersHorizontal size={16}/></summary>
      <div className="game-audio-panel"><strong>Your sound mix</strong><p>Music follows the mission. Reward sounds mark your progress.</p>
        <label><input type="checkbox" checked={music} onChange={event => { if (event.target.checked) unlockGameAudio(); onMusicChange(event.target.checked); }}/><Music2 size={15}/> Background score</label>
        {currentTrack && <small className="game-audio-now" role="status">{playbackLabel} · {currentTrack}</small>}
        {music && runtime.state === 'suspended' && <button type="button" className="game-audio-next" onClick={unlockGameAudio}>Resume audio</button>}
        {music && runtime.state === 'unavailable' && <small>{runtime.reason ?? 'Audio could not start. Your game and progress still work.'}</small>}
        {music && soundtrack.mode === 'adaptive' && (runtime.selection?.playlist?.length ?? 0) > 1 && <button type="button" className="game-audio-next" disabled={runtime.state !== 'playing'} onClick={() => { skipLearningSoundtrack(); }}><SkipForward size={14}/>Next track for this game</button>}
        <div className="game-audio-mode" role="group" aria-label="Soundtrack selection"><button type="button" aria-pressed={soundtrack.mode === 'adaptive'} onClick={() => setMusicPreferences({ mode: 'adaptive' })}>Follow this game</button><button type="button" aria-pressed={soundtrack.mode === 'pinned'} onClick={() => setMusicPreferences({ mode: 'pinned', trackId: runtime.trackId ?? runtime.selection?.trackId ?? soundtrack.trackId })}>Keep this track</button></div>
        <small>{soundtrack.mode === 'adaptive' ? 'Music moves between pieces that fit this mission.' : 'Your chosen track repeats. Choose Follow this game for a changing soundtrack.'}</small>
        <label className="game-audio-level">Music volume<input aria-label="Game music volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => onVolumeChange(Number(event.target.value))}/></label>
        <label><input type="checkbox" checked={sound.enabled} onChange={event => update({ enabled: event.target.checked })}/><Volume2 size={15}/> Game & Aster sounds</label>
        <label className="game-audio-level">Feedback volume<input aria-label="Quest feedback volume" type="range" min="0" max="1" step="0.01" value={sound.volume} onChange={event => update({ volume: Number(event.target.value) })}/></label>
        <button type="button" className="game-audio-preview" disabled={!audibleEffects} onClick={soundCheck}><Play size={14}/>Play reward sound</button>
        {preview && <small role="status" className="game-audio-preview-status">{preview}</small>}
        {!effectsAllowed && <small>This game’s creator turned off effects.</small>}
        <small>Your mix stays on this device. You can learn with sound off.</small>
      </div>
    </details>
  </div>;
}
