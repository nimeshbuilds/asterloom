import { useEffect, useState } from 'react';
import { Check, Search, Volume2 } from 'lucide-react';
import { MUSIC_TRACKS,getMusicPreferences,setMusicPreferences,getMusicRuntimeStatus,unlockGameAudio } from '../lib/music';
import './game-audio.css';

export default function MusicLibrary({ track, playing, onSelect }: { track: string; playing: boolean; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [kind,setKind]=useState<'all'|'recording'|'interactive'>('all');
  const [preference,setPreference]=useState(getMusicPreferences);
  const [runtime,setRuntime]=useState(getMusicRuntimeStatus);
  useEffect(()=>{const refresh=()=>{setPreference(getMusicPreferences());setRuntime(getMusicRuntimeStatus());};window.addEventListener('asterloom:music-preferences',refresh);window.addEventListener('asterloom:music-status',refresh);return()=>{window.removeEventListener('asterloom:music-preferences',refresh);window.removeEventListener('asterloom:music-status',refresh);};},[]);
  const selectedTrack=runtime.trackId??runtime.selection?.trackId??(preference.mode==='pinned'?preference.trackId:track);
  const [limit, setLimit] = useState(12);
  const matches = MUSIC_TRACKS.filter(item => (kind==='all'||item.kind===kind)&&`${item.name} ${item.mood} ${item.collection}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="music-library">
    <div className="music-library-auto"><div><strong>{preference.mode==='adaptive'?'Music follows your game':'A favourite for every game'}</strong><p>{preference.mode==='adaptive'?'Reading uses a quiet recording. Missions select their own prepared score.':'Your chosen track stays selected until you return to game soundtracks.'}</p></div><button type="button" className="button secondary" aria-pressed={preference.mode==='adaptive'} onClick={()=>setMusicPreferences({mode:'adaptive'})}>Use game soundtracks</button></div>
    <div className="music-library-filters" role="group" aria-label="Soundtrack collection">{([['all','All 100'],['recording','10 recordings'],['interactive','90 interactive scores']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>{setKind(value);setLimit(12);}}>{label}</button>)}</div>
    <label className="music-library-search"><Search size={17}/><input aria-label="Find a soundtrack" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="Find a world, instrument, or mood…"/></label>
    <p className="music-library-count">{matches.length} soundtracks · bundled for offline play</p>
    <div className="track-grid">{matches.slice(0, limit).map(item => <button className={`track-button ${selectedTrack === item.id ? 'selected' : ''}`} key={item.id} onClick={() => {unlockGameAudio();setMusicPreferences({mode:'pinned',trackId:item.id});onSelect(item.id);}} aria-pressed={selectedTrack === item.id}>
      <span>{selectedTrack === item.id && playing ? <Volume2 size={16}/> : String(MUSIC_TRACKS.indexOf(item) + 1).padStart(2, '0')}</span>
      <div><strong>{item.name}</strong><small>{item.mood} · {item.kind==='recording'?'Recording':'Interactive'}</small></div>{selectedTrack === item.id && <Check size={15}/>}
    </button>)}</div>
    {!matches.length && <p>No soundtrack matches. Try a different mood or world.</p>}
    {matches.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 24)}>Explore more soundtracks ({matches.length - limit} more)</button>}
  </div>;
}
