import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, ChevronRight, Flag, Lightbulb, Pause, Sparkles, Volume2, X } from 'lucide-react';
import type { LearningCard, Notebook, Progress } from '../types';
import type { Scaffold } from '../data/scaffolds';
import { AGE_GROUPS } from '../data/scaffolds';
import { recordAttempt, selectDueCards } from '../lib/storage';
import { canScoreRecallCard, normalizeText, seededShuffle, stableHash } from '../lib/utils';
import WorldPreview from './WorldPreview';
import LearningScene from './LearningScene';
import {getAgePresentation} from '../data/worlds';
import LearningFigures from './LearningFigures';
import {musicFeedback,duckMusic} from '../lib/music';
import '../player.css';

interface Props {
  notebook: Notebook; scaffold: Scaffold; progress: Progress;
  onProgress: (progress: Progress) => Promise<boolean>; onExit: () => void; onError: (message: string) => void;
  onComplete?: (score: number, total: number) => void;
}
interface PlayState {
  input: string; selection: string; pairs: Record<string, string>; order: string[];
  submitted: boolean; correct: boolean; assisted: boolean; figures: boolean; hint: boolean; evidence: boolean; reflectionRevealed: boolean;
  correctCount: number; independentCount: number; answeredCount: number; confidence: 'guessing' | 'unsure' | 'confident';
}
const initialState = (score = 0, answered = 0, independent = 0): PlayState => ({ input: '', selection: '', pairs: {}, order: [], submitted: false, correct: false, assisted: false, figures: false, hint: false, evidence: false, reflectionRevealed: false, correctCount: score, independentCount: independent, answeredCount: answered, confidence: 'unsure' });
function restoreState(raw: Record<string, unknown> | undefined): PlayState {
  const value = raw ?? {}; const empty = initialState();
  return { ...empty,
    input: typeof value.input === 'string' ? value.input.slice(0, 10_000) : '',
    selection: typeof value.selection === 'string' ? value.selection : '',
    pairs: value.pairs && typeof value.pairs === 'object' && !Array.isArray(value.pairs) ? Object.fromEntries(Object.entries(value.pairs).filter(([, answer]) => typeof answer === 'string')) : {},
    order: Array.isArray(value.order) && value.order.every(item => typeof item === 'string' && /^\d+$/.test(item)) ? value.order : [],
    assisted: value.assisted === true || value.figures === true || value.hint === true || value.evidence === true || value.reflectionRevealed === true,
    figures: value.figures === true,
    submitted: value.submitted === true, correct: value.correct === true, hint: value.hint === true, evidence: value.evidence === true, reflectionRevealed: value.reflectionRevealed === true,
    correctCount: typeof value.correctCount === 'number' && Number.isInteger(value.correctCount) ? Math.max(0, Math.min(2000, value.correctCount)) : 0,
    independentCount: typeof value.independentCount === 'number' && Number.isInteger(value.independentCount) ? Math.max(0, Math.min(2000, value.independentCount)) : 0,
    answeredCount: typeof value.answeredCount === 'number' && Number.isInteger(value.answeredCount) ? Math.max(0, Math.min(2000, value.answeredCount)) : 0,
    confidence: value.confidence === 'guessing' || value.confidence === 'confident' ? value.confidence : 'unsure',
  };
}

function passageLabel(card: LearningCard): string {
  if (card.questionType === 'definition') return card.prompt.split('\n\n').slice(1).join('\n\n') || card.prompt;
  return card.prompt.replace(/^.*?\n\n/s, '');
}
function chunksFor(card: LearningCard, notebook: Notebook): { items: string[]; isProcedure: boolean } {
  const source = notebook.sources.find(item => item.id === card.sourceId);
  if (card.questionType === 'sequence' && source) {
    const steps: string[] = []; let expected = 1;
    for (const line of source.text.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
      if (match && Number(match[1]) === expected) { steps.push(match[2].trim()); expected++; }
      else if (steps.length && line.trim()) break;
    }
    if (steps.length >= 3 && steps.length <= 8 && new Set(steps).size === steps.length) return { items: steps, isProcedure: true };
  }
  const words = (card.evidence || card.answer).split(/\s+/);
  const size = Math.max(1, Math.ceil(words.length / Math.min(4, words.length)));
  const items = []; for (let index = 0; index < words.length; index += size) items.push(words.slice(index, index + size).join(' '));
  return { items, isProcedure: false };
}

export default function Player({ notebook, scaffold, progress, onProgress, onExit, onError, onComplete }: Props) {
  const eligibleCards = notebook.cards.filter(item => canScoreRecallCard(item, notebook.sources));
  const awaitingReview = notebook.cards.filter(item => item.reviewStatus === 'needs-review').length;
  const [session] = useState(() => {
    const saved = progress.activeSession;
    if (saved?.scaffoldId === scaffold.id && saved.index < saved.cardIds.length && saved.cardIds.every(id => eligibleCards.some(card => card.id === id))) return saved;
    const seed = stableHash(`${notebook.id}:${Date.now()}`);
    return { scaffoldId: scaffold.id, cardIds: selectDueCards(eligibleCards, progress, Math.min(8, eligibleCards.length)).map(card => card.id), index: 0, seed, startedAt: new Date().toISOString(), state: undefined };
  });
  const [index, setIndex] = useState(Math.min(session.index, session.cardIds.length));
  const [state, setState] = useState<PlayState>(() => restoreState(session.state));
  const [elapsed, setElapsed] = useState(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000)));
  const latestProgress = useRef(progress); latestProgress.current = progress;
  const currentState = useRef(state); currentState.current = state;
  const [committedProgress, setCommittedProgress] = useState(progress);
  const [savingCount, setSavingCount] = useState(0);
  const [savingCritical, setSavingCritical] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [writeFailed, setWriteFailed] = useState(false);
  type Transition = { next: PlayState; nextIndex: number; progress: Progress; kind: 'answer' | 'advance' | 'exit' };
  const pendingTransition = useRef<Transition | null>(null);
  const criticalInFlight = useRef(false);
  const initialized = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = savingCritical || pendingTransition.current !== null;
  const completed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const sessionIsCurrent = session.cardIds.every(id => eligibleCards.some(item => item.id === id));
  const cards = session.cardIds.map(id => eligibleCards.find(card => card.id === id)).filter((card): card is LearningCard => !!card);
  const card = cards[index];
  const done = index >= cards.length;
  const young = notebook.ageGroup === '3-5' || notebook.ageGroup === '6-8';
  const age = AGE_GROUPS.find(group => group.id === notebook.ageGroup);
  const isTimed = scaffold.family === 'timed' && !young;

  function withSession(next: PlayState, nextIndex = index, base = latestProgress.current): Progress {
    return { ...base, activeSession: { ...session, index: nextIndex, state: next as unknown as Record<string, unknown> }, updatedAt: new Date().toISOString() };
  }
  async function writeProgress(updated: Progress): Promise<boolean> {
    latestProgress.current = updated;
    if (mounted.current) setSavingCount(count => count + 1);
    try {
      const saved = await onProgress(updated);
      if (saved !== true) { if (mounted.current) setWriteFailed(true); return false; }
      if (mounted.current) { setCommittedProgress(updated); if (latestProgress.current === updated) setWriteFailed(false); }
      return true;
    } catch (error) {
      if (mounted.current) setWriteFailed(true);
      onError(`Progress could not be saved. ${error instanceof Error ? error.message : 'Try saving again.'}`);
      return false;
    } finally { if (mounted.current) setSavingCount(count => Math.max(0, count - 1)); }
  }
  function persist(next: PlayState, nextIndex = index, base = latestProgress.current) { return writeProgress(withSession(next, nextIndex, base)); }
  function change(patch: Partial<PlayState>) {
    if (pendingTransition.current || criticalInFlight.current) return;
    const previous = currentState.current;
    const next = { ...previous, ...patch, assisted: previous.assisted || patch.figures === true || patch.hint === true || patch.evidence === true || patch.reflectionRevealed === true };
    currentState.current = next; setState(next); void persist(next);
  }
  async function commitTransition(operation: Transition) {
    if (criticalInFlight.current) return;
    criticalInFlight.current = true; setSavingCritical(true); setSaveError('');
    const saved = await writeProgress(operation.progress);
    if (!mounted.current) { criticalInFlight.current = false; return; }
    if (saved) {
      pendingTransition.current = null;
      currentState.current = operation.next; setState(operation.next); setIndex(operation.nextIndex);
      if (operation.kind === 'answer') musicFeedback(operation.next.correct ? 'success' : 'try-again');
      if (operation.kind === 'advance') window.setTimeout(() => heading.current?.focus(), 30);
      if (operation.kind === 'exit') onExit();
    } else setSaveError('Your progress has not been saved yet. Retry the same save before continuing; your answer will not be counted twice.');
    criticalInFlight.current = false; setSavingCritical(false);
  }
  function transition(next: PlayState, nextIndex: number, base: Progress, kind: Transition['kind']) {
    if (pendingTransition.current || criticalInFlight.current) return;
    const operation = { next, nextIndex, progress: withSession(next, nextIndex, base), kind };
    pendingTransition.current = operation; void commitTransition(operation);
  }

  useEffect(() => { if (!initialized.current && sessionIsCurrent && cards.length) { initialized.current = true; void persist(state, index, { ...latestProgress.current, sessions: latestProgress.current.sessions + (session.state ? 0 : 1) }); } }, []);
  useEffect(() => {
    if (!isTimed || done) return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [isTimed, done, session.startedAt]);
  useEffect(() => {
    if (sessionIsCurrent && done && cards.length && !completed.current) { completed.current = true; musicFeedback('complete'); onComplete?.(state.independentCount, cards.length); }
  }, [done, sessionIsCurrent, cards.length, state.independentCount]);

  function submit(correct: boolean) {
    if (!card || currentState.current.submitted || pendingTransition.current || criticalInFlight.current) return;
    const state = currentState.current;
    if (!sessionIsCurrent || !canScoreRecallCard(card, notebook.sources)) { onError('This challenge needs author review or its source evidence changed. Review it in the studio before scored play.'); return; }
    const assisted = state.assisted || state.hint || state.evidence || scaffold.family === 'explain';
    let updated = recordAttempt(latestProgress.current, card, correct, assisted ? 'guessing' : state.confidence);
    if (assisted) {
      // Supported practice and self-assessment must not award independent-recall XP or advance intervals.
      const previous = latestProgress.current.cards[card.id];
      updated.xp = latestProgress.current.xp;
      updated.completedCardIds = latestProgress.current.completedCardIds;
      updated.mastery = latestProgress.current.mastery;
      updated.streak = latestProgress.current.streak; updated.bestStreak = latestProgress.current.bestStreak;
      updated.attempts = updated.attempts.map((attempt, attemptIndex) => attemptIndex === updated.attempts.length - 1 ? { ...attempt, xp: 0 } : attempt);
      updated.cards[card.id] = { ...updated.cards[card.id], correct: previous?.correct ?? 0, lastCorrect: previous?.lastCorrect ?? false, successfulReviews: previous?.successfulReviews ?? 0, intervalDays: previous?.intervalDays ?? 0, dueAt: previous?.dueAt ?? new Date().toISOString() };
    }
    if (scaffold.family === 'explain' && state.input.trim()) updated.journal = [...updated.journal, { id: `reflection-${Date.now()}`, text: state.input.trim(), cardId: card.id, at: new Date().toISOString() }].slice(-2000);
    const next = { ...state, submitted: true, correct, correctCount: state.correctCount + (correct ? 1 : 0), independentCount: state.independentCount + (correct && !assisted ? 1 : 0), answeredCount: state.answeredCount + 1 };
    transition(next, index, updated, 'answer');
  }
  function nextCard() { const state = currentState.current; if (!state.submitted) return; const nextIndex = index + 1; const next = initialState(state.correctCount, state.answeredCount, state.independentCount); transition(next, nextIndex, latestProgress.current, 'advance'); }
  function pause() { transition(currentState.current, index, latestProgress.current, 'exit'); }
  function speak() {
    if (!('speechSynthesis' in window)) { onError('Read-aloud is unavailable in this browser.'); return; }
    window.speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(card?.prompt ?? scaffold.name); utterance.onstart=()=>duckMusic(true);utterance.onend=()=>duckMusic(false);utterance.onerror=()=>duckMusic(false);window.speechSynthesis.speak(utterance);
  }

  if (!sessionIsCurrent || (!cards.length && notebook.cards.length > 0)) return <div className="player-empty"><BookOpen size={40}/><h2>{awaitingReview ? 'These challenges need author review' : 'Review the source references'}</h2><p>{awaitingReview ? 'Review the wording, answer and source evidence in the studio, then choose “Mark as reviewed”. Draft questions earn no scores or learning progress.' : 'These challenges reference material that changed. Rebuild from the current sources or review the questions in the studio before playing.'}</p><button className="btn primary" onClick={onExit}>Back to notebook</button></div>;
  if (!cards.length) return <div className="player-empty"><BookOpen size={40}/><h2>No challenges to play yet</h2><p>Add sources and create challenges in the studio first.</p><button className="btn primary" onClick={onExit}>Back to the studio</button></div>;

  if (done) return <div className="player-shell"><header className="player-topbar"><button className="btn ghost" onClick={onExit}><ArrowLeft size={18}/>Back to notebook</button><span className="eyebrow">SESSION COMPLETE</span></header><div className="session-complete"><div className="completion-art"><WorldPreview scaffoldId={scaffold.id} theme={notebook.theme} ageGroup={notebook.ageGroup}/></div><span className="completion-badge"><Flag size={22}/> A little further than before</span><h1>Your next chapter is taking shape.</h1><p>You practiced {cards.length} challenges in {scaffold.name.toLowerCase()}. Your progress is saved on this device.</p><div className="completion-stats"><div><strong>{state.correctCount}/{cards.length}</strong><span>Correct this session</span></div><div><strong>{committedProgress.xp}</strong><span>Total practice XP</span></div><div><strong>{committedProgress.bestStreak}</strong><span>Best answer streak</span></div></div><p className="muted">A later review helps more than repeating the same answers immediately. Missed ideas are queued for another visit.</p><button className="btn primary" onClick={onExit}>Return to my notebook<ArrowRight size={18}/></button></div></div>;

  const source = notebook.sources.find(item => item.id === card.sourceId);
  const sourceVisuals = (notebook.artwork ?? []).filter(art => art.sourceId === card.sourceId && art.reviewStatus === 'reviewed' && source?.text.includes(art.evidence));
  const conceptLabel = normalizeText(card.concept).includes(normalizeText(card.answer)) ? 'Source recall' : card.concept;
  const pool = [card, ...seededShuffle(eligibleCards.filter(item => item.id !== card.id && normalizeText(item.answer) !== normalizeText(card.answer)), session.seed + index)].filter((item, at, all) => all.findIndex(other => normalizeText(other.answer) === normalizeText(item.answer)) === at).slice(0, young ? 2 : 3);
  const pairAnswers = seededShuffle(pool.map(item => item.answer), session.seed + index + 31);
  const ordering = chunksFor(card, notebook);
  const sequenceOrder = state.order.length === ordering.items.length && new Set(state.order).size === ordering.items.length && state.order.every(value => Number(value) < ordering.items.length) ? state.order : seededShuffle(ordering.items.map((_, at) => String(at)), session.seed + index + 47);
  const pairMode = scaffold.family === 'match' || scaffold.family === 'sort' || scaffold.family === 'connect';
  const optionLimit = age?.recommendedSettings.choices ?? 4;
  const displayOptions = seededShuffle([card.answer, ...card.options.filter(option => option !== card.answer).slice(0, optionLimit - 1)], session.seed + index + 17);
  const canSubmit = scaffold.family === 'cloze' ? !!state.input.trim() : scaffold.family === 'sequence' ? ordering.items.length > 0 : pairMode ? pool.every(item => !!state.pairs[item.id]) : !!state.selection;
  const instructions: Record<string, string> = {
    recall: 'Bring an idea back from memory. Choose an answer, then check the source.',
    match: 'Match each description with its source term. Use every term once.',
    sequence: ordering.isProcedure ? 'Rebuild the numbered procedure in the order given by the source.' : 'This source has no validated procedure. Rebuild its exact passage as a reading-recall exercise.',
    sort: 'Place each source description under the matching concept. These bins test source associations.',
    cloze: 'Retrieve the exact source answer before revealing the explanation.',
    scenario: 'Inspect the source evidence when you need it, then commit to an answer. This is source-based investigation practice.',
    diagram: 'Complete a source-recall diagram by choosing the missing label. Connections show answer choices, not causal relationships.',
    explain: 'Explain the idea in your own words, compare with the source, and assess your own explanation. No AI grading is used.',
    connect: 'Connect source descriptions to the concepts they describe. These are reference links, not inferred causal relationships.',
    timed: young ? 'Take your time. Timers are disabled for this age setting.' : 'A gentle pace check, with no deadline or speed-based score. Accuracy comes first.',
  };

  function check() {
    if (pendingTransition.current || criticalInFlight.current) return;
    const state = currentState.current;
    if (scaffold.family === 'cloze') submit(normalizeText(state.input) === normalizeText(card.answer));
    else if (scaffold.family === 'sequence') submit(sequenceOrder.every((item, at) => Number(item) === at));
    else if (pairMode) submit(pool.every(item => state.pairs[item.id] === item.answer));
    else submit(state.selection === card.answer);
  }

  return <div className={`player-shell family-${scaffold.family} presentation-${getAgePresentation(notebook.ageGroup).density}`} data-theme={notebook.theme}>
    <header className="player-topbar"><button className="btn ghost" disabled={locked} onClick={pause}><Pause size={17}/>Save & exit</button><div className="player-game-name"><span>{scaffold.icon}</span><strong>{scaffold.name}</strong></div><div className="player-top-actions"><span className="xp-pill"><Sparkles size={16}/>{committedProgress.xp} XP</span><button className="icon-button" onClick={speak} aria-label="Read this challenge aloud"><Volume2 size={19}/></button></div></header>
    <div className="player-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={index} aria-label={`Challenge ${index + 1} of ${cards.length}`}><div style={{ width: `${index / cards.length * 100}%` }}/></div>
    <div className="player-layout">
      <aside className="player-sidebar"><WorldPreview scaffoldId={scaffold.id} theme={notebook.theme} ageGroup={notebook.ageGroup}/><span className="eyebrow">YOUR EXPEDITION</span><h2>{notebook.title}</h2><p>{scaffold.tagline}</p><ol className="mission-path">{cards.map((item, at) => <li key={item.id} className={at < index ? 'complete' : at === index ? 'current' : ''}><span>{at < index ? <Check size={12}/> : at + 1}</span><div>{at === index ? 'You are here' : at < index ? 'Explored' : `Challenge ${at + 1}`}</div></li>)}</ol><div className="player-note"><Lightbulb size={18}/><p>Hints are always available. Supported practice is saved separately from independent recall.</p></div></aside>
      <main className="challenge-area">
        <div className="challenge-meta"><span className="eyebrow">CHALLENGE {index + 1} OF {cards.length}</span>{isTimed && <span className="timer-chip" aria-label="Elapsed session time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · no time limit</span>}<span className="concept-chip">{conceptLabel}</span></div>
        <p className="game-instructions">{instructions[scaffold.family]}</p>{awaitingReview > 0 && <p className="caregiver-note">{awaitingReview} draft {awaitingReview === 1 ? 'challenge awaits' : 'challenges await'} author review and {awaitingReview === 1 ? 'is' : 'are'} excluded from this scored session.</p>}
        {card.questionType === 'manual' && !card.sourceId && <p className="caregiver-note">Author-written challenge. The answer was supplied by the notebook author.</p>}
        {young && <p className="caregiver-note">{notebook.ageGroup === '3-5' ? 'Explore together with a grown-up. Use read-aloud whenever it helps.' : 'Need a little help? Try read-aloud or open a hint.'}</p>}
        <section className="challenge-card">
          {saveError && <div className="notice" role="alert"><p>{saveError}</p><button className="btn primary" disabled={savingCritical} onClick={() => { if (pendingTransition.current) void commitTransition(pendingTransition.current); }}>Retry saving progress</button></div>}
          {savingCritical && <p role="status" className="muted">Saving progress before continuing…</p>}
          <h1 ref={heading} tabIndex={-1}>{pairMode ? (scaffold.family === 'sort' ? 'Give every idea a home.' : scaffold.family === 'connect' ? 'Make the connections.' : 'Find the matching pairs.') : scaffold.family === 'sequence' ? (ordering.isProcedure ? 'What happens first? And next?' : 'Put the passage back together.') : scaffold.family === 'explain' ? `How would you explain ${card.concept}?` : card.prompt.split('\n\n')[0]}</h1>
          <fieldset disabled={locked} aria-label="Challenge controls" style={{border:0,padding:0,margin:0,minWidth:0}}>
          {!pairMode && !['sequence', 'explain'].includes(scaffold.family) && card.prompt.includes('\n\n') && <p className="question-passage">{card.prompt.split('\n\n').slice(1).join('\n\n')}</p>}

          {!pairMode && !['cloze','explain','sequence'].includes(scaffold.family) && <LearningScene scaffoldId={scaffold.id} theme={notebook.theme} ageGroup={notebook.ageGroup} snapshot={{nodes:displayOptions.map(option => ({id:option,label:option,detail:state.selection===option?'Your selected answer':'Available answer',active:state.selection===option})),links:[],summary:'Bring the idea back from memory. Choose a possibility, then check your answer.',metrics:[{label:'This chapter',value:`${index+1} of ${cards.length}`}],layout:'trail'}} selectedId={state.selection} onSelect={state.submitted||locked?undefined:id=>change({selection:id})}/>}

          {sourceVisuals.length > 0 && <div className="player-figures"><button className="btn ghost" aria-expanded={state.figures} onClick={() => change({ figures: !state.figures })}><BookOpen size={17}/>{state.figures ? 'Hide learning figures' : 'View learning figures'}</button>{state.figures && <><p className="muted small">Use the author's reviewed visuals for supported practice. Viewing them before answering does not earn independent-recall credit.</p><LearningFigures notebook={{ sources: notebook.sources, artwork: sourceVisuals }}/></>}</div>}

          {pairMode ? <div className={`pair-board ${scaffold.family}`}>
            {pool.map((item, at) => <div className="pair-row" key={item.id}><div className="pair-prompt"><span className="pair-number">{at + 1}</span><p>{passageLabel(item)}</p></div><label><span className="sr-only">Match description {at + 1} to a concept</span><select aria-label={`Match description ${at + 1} to a concept`} disabled={state.submitted} value={state.pairs[item.id] ?? ''} onChange={event => change({ pairs: { ...state.pairs, [item.id]: event.target.value } })}><option value="">Choose a concept…</option>{pairAnswers.map(answer => <option key={answer} value={answer}>{answer}</option>)}</select></label>{state.submitted && <span className={state.pairs[item.id] === item.answer ? 'pair-correct' : 'pair-incorrect'}>{state.pairs[item.id] === item.answer ? <Check size={18}/> : <X size={18}/>}</span>}</div>)}
            {scaffold.family === 'connect' && <p className="muted">Every connection is grounded in a supplied source description.</p>}
          </div> : scaffold.family === 'sequence' ? <div className="sequence-board">{sequenceOrder.map((item, position) => <div className="sequence-step" key={item}><span className="step-number">{position + 1}</span><p>{ordering.items[Number(item)]}</p><div className="sequence-controls"><button aria-label={`Move step ${position + 1} up`} disabled={position === 0 || state.submitted} onClick={() => { const order = [...sequenceOrder]; [order[position - 1], order[position]] = [order[position], order[position - 1]]; change({ order }); }}><ArrowUp size={16}/></button><button aria-label={`Move step ${position + 1} down`} disabled={position === sequenceOrder.length - 1 || state.submitted} onClick={() => { const order = [...sequenceOrder]; [order[position + 1], order[position]] = [order[position], order[position + 1]]; change({ order }); }}><ArrowDown size={16}/></button></div></div>)}</div>
          : scaffold.family === 'cloze' ? <div className="written-answer"><label htmlFor="recall-answer">Your answer</label><input id="recall-answer" autoComplete="off" value={state.input} disabled={state.submitted} placeholder="Bring it back from memory…" onChange={event => change({ input: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && state.input.trim() && !state.submitted) check(); }}/><small>Spelling and punctuation are normalized. This exercise expects the source’s wording.</small></div>
          : scaffold.family === 'explain' ? <div className="reflection-board"><label htmlFor="explanation">Teach it to someone new to the topic.</label><textarea id="explanation" rows={5} value={state.input} disabled={state.submitted} onChange={event => change({ input: event.target.value })} placeholder="The main idea is… An example is…"/>{!state.reflectionRevealed ? <button className="btn secondary" disabled={!state.input.trim()} onClick={() => change({ reflectionRevealed: true })}>Compare with the source<BookOpen size={16}/></button> : <div className="self-assessment"><blockquote>{card.evidence || card.answer}</blockquote><p>Did your explanation capture the idea accurately? Your reflection is saved; this is your assessment, not an automated grade.</p>{!state.submitted && <div className="button-row"><button className="btn secondary" onClick={() => submit(false)}>I want another look</button><button className="btn primary" onClick={() => submit(true)}>I explained the main idea<Check size={16}/></button></div>}</div>}</div>
          : <><div className={scaffold.family === 'diagram' ? 'diagram-board' : 'answer-grid'}>{scaffold.family === 'diagram' && <div className="diagram-center"><span>Missing label</span><strong>?</strong></div>}{displayOptions.map((option, at) => <button key={option} className={`answer-option ${state.selection === option ? 'selected' : ''} ${state.submitted && option === card.answer ? 'correct' : ''} ${state.submitted && state.selection === option && !state.correct ? 'incorrect' : ''}`} disabled={state.submitted} onClick={() => change({ selection: option })}><span className="option-letter">{String.fromCharCode(65 + at)}</span><span>{option}</span>{state.submitted && option === card.answer && <CheckCircle2 size={20}/>}</button>)}</div>{scaffold.family === 'scenario' && !state.submitted && <button className="btn ghost evidence-button" onClick={() => change({ evidence: !state.evidence })}><BookOpen size={17}/>{state.evidence ? 'Close' : 'Inspect'} source evidence</button>}</>}

          {state.evidence && !state.submitted && <blockquote className="source-evidence">{card.evidence || card.answer}</blockquote>}
          {state.hint && !state.submitted && <div className="hint-box"><Lightbulb size={18}/><p>{scaffold.family === 'sequence' ? `The passage begins: “${ordering.items[0]}”` : `Look for ${card.answer.split(/\s+/).length > 1 ? 'a phrase' : 'a word'} beginning with “${card.answer.slice(0, Math.min(2, card.answer.length))}”. Source: ${source?.title ?? 'Author’s notes'}.`}</p></div>}

          {!state.submitted && scaffold.family !== 'explain' && <div className="challenge-footer"><button className="btn ghost" onClick={() => change({ hint: !state.hint })}><Lightbulb size={17}/>{state.hint ? 'Hide hint' : 'A little hint'}</button><button className="btn primary" disabled={!canSubmit} onClick={check}>Check my answer<ChevronRight size={18}/></button></div>}

          {state.submitted && <div className={`answer-feedback ${state.correct ? 'success' : 'retry'}`} role="status"><div className="feedback-heading">{state.correct ? <CheckCircle2 size={24}/> : <Lightbulb size={24}/>}<h3>{scaffold.family === 'explain' ? 'Reflection saved.' : state.correct ? 'You found it.' : 'A useful moment to learn.'}</h3></div>{pairMode ? <ul className="pair-feedback">{pool.map(item => <li key={item.id}><strong>{item.answer}</strong> — {passageLabel(item)}</li>)}</ul> : scaffold.family === 'sequence' ? <ol>{ordering.items.map((item, at) => <li key={at}>{item}</li>)}</ol> : <p>{card.explanation}</p>}<details><summary><BookOpen size={15}/>View source evidence{source ? ` · ${source.title}` : ''}</summary><blockquote>{card.evidence || 'This challenge was written by the notebook author.'}</blockquote>{source?.url && <a href={source.url} target="_blank" rel="noreferrer">Open original source</a>}</details><button className="btn primary" onClick={nextCard}>{index === cards.length - 1 ? 'Complete this chapter' : 'Continue exploring'}<ArrowRight size={18}/></button></div>}
          </fieldset>
        </section>
        <p className="player-save-note" role="status"><Check size={13}/>{saveError ? 'Progress needs a successful save before continuing' : savingCount > 0 ? 'Saving progress…' : writeFailed ? 'Some progress is not saved. Use Save & exit to retry before leaving.' : 'Progress saved on this device · No AI needed to play'}</p><p className="nimeshbuilds-credit">Crafted by <a href="https://github.com/NimeshBuilds" target="_blank" rel="noreferrer">NimeshBuilds</a></p>
      </main>
    </div>
  </div>;
}
