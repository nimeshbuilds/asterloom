import {getAgePresentation} from '../data/worlds';
import { useEffect, useId, useRef, useState } from 'react';
import type { Source } from '../types';
import { initialPictureResponse, isPictureNarration, isPictureRaster, validatePictureSources } from '../lib/pictureEngine';
import type { PictureActivity, PictureResponse, PictureToken } from '../lib/pictureEngine';
import { duckMusic } from '../lib/music';
import './picture.css';

export default function PictureBoard({ activity, response, onChange, sources, ageGroup = 'adult', caregiverOpen, onCaregiverToggle }: {
  activity: PictureActivity; response: PictureResponse; onChange: (value: PictureResponse) => void; sources: Source[]; ageGroup?:string;caregiverOpen?:boolean;onCaregiverToggle?:(open:boolean)=>void;
}) {
  const prefix = useId(), audio = useRef<HTMLAudioElement>(null);
  const [imageSize, setImageSize] = useState({ width: 100, height: 100 });
  const [mediaError, setMediaError] = useState('');
  const [imageBroken, setImageBroken] = useState(false);
  const state = initialPictureResponse(activity, response);
  const scene = sources.find(s => s.id === activity.sceneSourceId);
  const activeIndex = activity.rounds.findIndex(r => r.id === state.activeRoundId), active = activity.rounds[activeIndex];
  const recording = sources.find(s => s.id === active.narrationSourceId);
  useEffect(() => () => duckMusic(false), [activity.id, state.phase, active.id]);
  const errors = validatePictureSources(activity, sources);
  const currentSelection = state.answers[active.id];
  const explored = activity.tokens.find(t => t.id === state.exploredTokenIds.at(-1));
  function change(value: Partial<PictureResponse>) { onChange({ ...state, ...value, caregiverSupport: state.caregiverSupport || value.caregiverSupport === true }); }
  function choose(token: PictureToken) {
    if (state.phase === 'explore') change({ exploredTokenIds: [...state.exploredTokenIds.filter(id => id !== token.id), token.id] });
    else if (active.tokenIds.includes(token.id)) change({ answers: { ...state.answers, [active.id]: token.id } });
  }
  function round(id: string) { audio.current?.pause(); setMediaError(''); change({ phase: 'play', activeRoundId: id }); }
  function crop(token: PictureToken) {
    const x = token.x * imageSize.width / 100, y = token.y * imageSize.height / 100, width = token.width * imageSize.width / 100, height = token.height * imageSize.height / 100, clip = `${prefix}-${token.id}-crop`;
    return <svg viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true" focusable="false"><defs><clipPath id={clip}><rect x={x} y={y} width={width} height={height}/></clipPath></defs><image href={scene?.dataUrl} width={imageSize.width} height={imageSize.height} clipPath={`url(#${clip})`}/></svg>;
  }
  if (errors.length || imageBroken || !isPictureRaster(scene?.dataUrl)) return <div className="picture-board"><p className="picture-notice" role="alert">This picture needs its original image and source notes before it can be played. Open the studio to restore the missing material.</p><details><summary>Material to restore</summary><ul>{[...errors, ...(imageBroken ? ['The attached raster file could not be decoded by this browser.'] : [])].map((error, i) => <li key={i}>{error}</li>)}</ul></details></div>;
  return <section className={`picture-board presentation-${getAgePresentation(ageGroup).density}`} aria-label={activity.mode === 'word-picture' ? 'Words and pictures' : 'Picture discovery'}>
    <div className="picture-modes" aria-label="Picture activity modes">
      <button type="button" aria-pressed={state.phase === 'explore'} onClick={() => { audio.current?.pause(); change({ phase: 'explore' }); }}>Explore the picture</button>
      <button type="button" aria-pressed={state.phase === 'play'} onClick={() => change({ phase: 'play' })}>Play with pictures</button>
    </div>
    <p className="picture-intro">{state.phase === 'explore' ? 'Touch a number or a picture. What do you notice?' : activity.mode === 'word-picture' ? 'Look at the word. Choose the picture that goes with it.' : 'Look carefully. Choose a picture for the clue.'}</p>
    <div className={`picture-scene ${state.phase === 'play' && activity.mode === 'word-picture' ? 'picture-scene-small' : ''}`}>
      <img src={scene.dataUrl} alt={activity.sceneAlt} onLoad={event => { const image = event.currentTarget; setImageSize({ width: image.naturalWidth, height: image.naturalHeight }); }} onError={() => setImageBroken(true)}/>
      {(state.phase === 'explore' || activity.mode === 'discovery') && activity.tokens.map((token, i) => (state.phase === 'explore' || active.tokenIds.includes(token.id)) && <button type="button" className={`picture-hotspot ${currentSelection === token.id && state.phase === 'play' ? 'chosen' : ''}`} key={token.id} style={{ left: `${token.x + token.width / 2}%`, top: `${token.y + token.height / 2}%` }} aria-label={`${state.phase === 'explore' ? 'Explore' : 'Choose'} ${token.label}`} aria-pressed={state.phase === 'play' ? currentSelection === token.id : explored?.id === token.id} onClick={() => choose(token)}>{i + 1}</button>)}
    </div>
    {state.phase === 'explore' ? <>
      <div className="picture-discovery-label" aria-live="polite">{explored ? <><strong>{explored.label}</strong><span>{activity.sourceRefs[explored.evidenceRefs[0]]?.evidence}</span></> : <span>Pick something to explore. There is no hurry.</span>}</div>
      <div className="picture-token-tray">{activity.tokens.map(token => <button type="button" className="picture-choice" key={token.id} aria-pressed={explored?.id === token.id} aria-label={`Explore ${token.label}`} onClick={() => choose(token)}>{crop(token)}<span>{token.label}</span></button>)}</div>
      <button type="button" className="picture-primary" onClick={() => change({ phase: 'play' })}>I’m ready to play <span aria-hidden="true">→</span></button>
    </> : <>
      <nav className="picture-rounds" aria-label="Picture prompts">{activity.rounds.map((r, i) => <button type="button" key={r.id} aria-current={r.id === active.id ? 'step' : undefined} aria-label={`Prompt ${i + 1}${state.answers[r.id] ? ', picture chosen' : ''}`} onClick={() => round(r.id)}>{i + 1}{state.answers[r.id] && <span aria-hidden="true"> ✓</span>}</button>)}</nav>
      <div className="picture-clue"><p className="picture-eyebrow">{activity.mode === 'word-picture' ? 'Find the picture for this word' : 'Your picture clue'}</p><h3 id={`${prefix}-clue`}>{active.prompt}</h3>
        {active.narrationSourceId && isPictureNarration(recording?.dataUrl) ? <div className="picture-listen"><audio key={active.id} ref={audio} controls preload="metadata" src={recording.dataUrl} aria-label={`Recorded clue: ${active.prompt}`} onPlay={() => { duckMusic(true); change({ listenedRoundIds: [...new Set([...state.listenedRoundIds, active.id])] }); }} onPause={() => duckMusic(false)} onEnded={() => duckMusic(false)} onError={() => { duckMusic(false); setMediaError('This recording could not be played. The same clue is written above for a caregiver to read.'); }}/><p>The same clue, in a supplied recording.</p></div> : <p className="picture-read-together">A grown-up can read this clue aloud. No recording is attached.</p>}
      </div>
      <div className="picture-token-tray" role="group" aria-labelledby={`${prefix}-clue`}>{active.tokenIds.map(tokenId => {
        const token = activity.tokens.find(t => t.id === tokenId)!;
        return <button type="button" key={token.id} className={`picture-choice ${currentSelection === token.id ? 'chosen' : ''}`} aria-pressed={currentSelection === token.id} aria-label={`Choose ${token.label}`} onClick={() => choose(token)}>{crop(token)}<span className="picture-choice-marker">{currentSelection === token.id ? 'My choice ✓' : 'Choose this picture'}</span></button>;
      })}</div>
      <div className="picture-next"><span role="status">{currentSelection ? 'Picture saved. You can change your mind.' : 'Choose one picture when you are ready.'}</span>{activeIndex < activity.rounds.length - 1 ? <button type="button" className="picture-primary" disabled={!currentSelection} onClick={() => round(activity.rounds[activeIndex + 1].id)}>Next clue <span aria-hidden="true">→</span></button> : <p>{Object.values(state.answers).every(Boolean) ? 'Ready? Use “Check my work” below.' : 'Visit the other clues to finish your picture choices.'}</p>}</div>
    </>}
    {mediaError && <p role="alert" className="picture-notice">{mediaError}</p>}
    <details className="picture-caregiver" open={caregiverOpen} onToggle={event=>{if(event.currentTarget.open!==caregiverOpen)onCaregiverToggle?.(event.currentTarget.open);}}><summary>For a grown-up</summary><p>{activity.caregiverNote}</p><p>Read the words, help with the controls, and invite the child to explain what they notice. If you guide the answer, mark this attempt as supported. Listening and taking breaks never cost points.</p><button type="button" disabled={state.caregiverSupport} onClick={() => change({ caregiverSupport: true })}>{state.caregiverSupport ? 'Caregiver support recorded' : 'We worked on the answers together'}</button></details>
  </section>;
}
