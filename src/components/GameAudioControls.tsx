import { useEffect, useState } from 'react';
import { Music2, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { getSoundPreferences, setSoundPreferences, getMusicPreferences, setMusicPreferences, getMusicRuntimeStatus, unlockGameAudio, MUSIC_TRACKS } from '../lib/music';
import './game-audio.css';

interface Props { music: boolean; onMusicChange: (enabled: boolean) => void; volume: number; onVolumeChange: (volume: number) => void; trackName?: string }
/** Audio begins only after a learner's explicit gesture; music and feedback stay independent. */
export default function GameAudioControls({ music, onMusicChange, volume, onVolumeChange, trackName }: Props) {
  const [sound, setSound] = useState(getSoundPreferences);
  const [soundtrack, setSoundtrack] = useState(getMusicPreferences);
  const [runtime, setRuntime] = useState(getMusicRuntimeStatus);
  useEffect(() => { const refresh = () => {setSoundtrack(getMusicPreferences());setRuntime(getMusicRuntimeStatus());};window.addEventListener('asterloom:music-preferences',refresh);window.addEventListener('asterloom:music-status',refresh);return()=>{window.removeEventListener('asterloom:music-preferences',refresh);window.removeEventListener('asterloom:music-status',refresh);};},[]);
  const currentTrack=MUSIC_TRACKS.find(item=>item.id===(runtime.trackId??runtime.selection?.trackId))?.name??trackName;
  useEffect(() => { const refresh = () => setSound(getSoundPreferences()); window.addEventListener('asterloom:sound-preferences', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('asterloom:sound-preferences', refresh); window.removeEventListener('storage', refresh); }; }, []);
  function update(patch: Partial<typeof sound>) { setSoundPreferences(patch); setSound(getSoundPreferences()); }
  const active = music || sound.enabled;
  return <div className="game-audio-controls">
    <button type="button" className="game-audio-toggle" aria-pressed={active} onClick={() => {
      const enabled = !active; update({ enabled }); onMusicChange(enabled);
    }}>{active ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{active ? 'Sound on' : 'Enable game sound'}</span></button>
    <details className="game-audio-mixer"><summary aria-label="Adjust game audio"><SlidersHorizontal size={16}/></summary>
      <div className="game-audio-panel"><strong>Your sound mix</strong><p>Quiet while you read. More movement when you explore.</p>
        <label><input type="checkbox" checked={music} onChange={event => {if(event.target.checked)unlockGameAudio();onMusicChange(event.target.checked);}}/><Music2 size={15}/> Background score</label>
        {currentTrack && <small className="game-audio-now">{music?'Playing':'Ready'} · {currentTrack}</small>}
        <div className="game-audio-mode" role="group" aria-label="Soundtrack selection"><button type="button" aria-pressed={soundtrack.mode==='adaptive'} onClick={()=>setMusicPreferences({mode:'adaptive'})}>Follow this game</button><button type="button" aria-pressed={soundtrack.mode==='pinned'} onClick={()=>setMusicPreferences({mode:'pinned',trackId:runtime.trackId??runtime.selection?.trackId??soundtrack.trackId})}>Keep this track</button></div>
        <small>{soundtrack.mode==='adaptive'?'Each chapter gets a score from its game palette.':'Your chosen track follows you. Change it in the music library.'}</small>
        <label className="game-audio-level">Music volume<input aria-label="Game music volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => onVolumeChange(Number(event.target.value))}/></label>
        <label><input type="checkbox" checked={sound.enabled} onChange={event => update({ enabled: event.target.checked })}/><Volume2 size={15}/> Quest feedback sounds</label>
        <label className="game-audio-level">Feedback volume<input aria-label="Quest feedback volume" type="range" min="0" max="1" step="0.01" value={sound.volume} onChange={event => update({ volume: Number(event.target.value) })}/></label>
        <small>Your preference stays on this device.</small>
      </div>
    </details>
  </div>;
}
