import { useState } from 'react';
import { Check, Search, Volume2 } from 'lucide-react';
import { MUSIC_TRACKS } from '../lib/music';
import './game-audio.css';

export default function MusicLibrary({ track, playing, onSelect }: { track: string; playing: boolean; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const matches = MUSIC_TRACKS.filter(item => `${item.name} ${item.mood}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="music-library">
    <label className="music-library-search"><Search size={17}/><input aria-label="Find a soundtrack" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="Find a world, instrument, or mood…"/></label>
    <p className="music-library-count">{matches.length} soundtracks · bundled for offline play</p>
    <div className="track-grid">{matches.slice(0, limit).map(item => <button className={`track-button ${track === item.id ? 'selected' : ''}`} key={item.id} onClick={() => onSelect(item.id)} aria-pressed={track === item.id}>
      <span>{track === item.id && playing ? <Volume2 size={16}/> : String(MUSIC_TRACKS.indexOf(item) + 1).padStart(2, '0')}</span>
      <div><strong>{item.name}</strong><small>{item.mood}</small></div>{track === item.id && <Check size={15}/>}
    </button>)}</div>
    {!matches.length && <p>No soundtrack matches. Try a different mood or world.</p>}
    {matches.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 24)}>Explore more soundtracks ({matches.length - limit} more)</button>}
  </div>;
}
