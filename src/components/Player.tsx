import AsterGuide from './AsterGuide';
import SourceMaterials from './SourceMaterials';
import '../learning-journey.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, ChevronRight, Flag, Lightbulb, Pause, Sparkles, Volume2, X } from 'lucide-react';
import type { LearningCard, Notebook, Progress } from '../types';
import type { Scaffold } from '../data/scaffolds';
import { AGE_GROUPS } from '../data/scaffolds';
import { recordAttempt } from '../lib/storage';
import {awardPracticeXp,journeyXp,practiceXp} from '../lib/progression';
import { canScoreRecallCard, normalizeText, seededShuffle, stableHash } from '../lib/utils';
import WorldPreview from './WorldPreview';
import {selectExpeditionCards,type CampaignChapter} from '../lib/campaign';
import {getAgePresentation} from '../data/worlds';
import LearningFigures from './LearningFigures';
import {activityActionCue,lessonActionCue} from '../lib/actionFeedback';
import {gameActionFeedback,musicFeedback,duckMusic,setLearningMusicPhase} from '../lib/music';
import LearningBriefing from './LearningBriefing';
import ReactionEffects from './ReactionEffects';
import GameplayHUD, {type GameplayHUDProps} from './GameplayHUD';
import {recallSessionTotals} from '../lib/gameplayHud';
import {buildLearningBriefing,initialLessonState,lessonReady,lessonQuestSupport,lessonToolkit,type LessonState} from '../lib/learningBriefing';
import '../player.css';
import {revealGameMoment} from '../lib/gameViewport';

interface Props {
  chapter?: CampaignChapter;
  notebook: Notebook; scaffold: Scaffold; progress: Progress;
  onProgress: (progress: Progress) => Promise<boolean>; onExit: () => void; onError: (message: string) => void;
  onComplete?: (score: number, total: number) => void;
  audioControls?: ReactNode;
}
interface PlayState {
  lesson?: LessonState;
  resultAssisted?: boolean;
  resultXp?: number;
  resultPracticeXp?: number;
  sessionPracticeXp?: number;
  input: string; selection: string; pairs: Record<string, string>; order: string[];
  submitted: boolean; correct: boolean; assisted: boolean; figures: boolean; hint: boolean; evidence: boolean; reflectionRevealed: boolean;
  correctCount: number; independentCount: number; answeredCount: number; attemptsOnCard: number; confidence: 'guessing' | 'unsure' | 'confident';
}
const initialState = (score = 0, answered = 0, independent = 0): PlayState => ({ input: '', selection: '', pairs: {}, order: [], submitted: false, correct: false, assisted: false, figures: false, hint: false, evidence: false, reflectionRevealed: false, correctCount: score, independentCount: independent, answeredCount: answered, attemptsOnCard:0, confidence: 'unsure' });
function restoreState(raw: Record<string, unknown> | undefined): PlayState {
  const value = raw ?? {}; const empty = initialState();
  return { ...empty,
    ...(typeof value.resultAssisted==='boolean'?{resultAssisted:value.resultAssisted}:{}),
    ...Object.fromEntries(['resultXp','resultPracticeXp','sessionPracticeXp'].filter(key=>typeof value[key]==='number'&&Number.isInteger(value[key])&&Number(value[key])>=0&&Number(value[key])<=1_000_000).map(key=>[key,value[key]])),
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
    attemptsOnCard: typeof value.attemptsOnCard === 'number' && Number.isInteger(value.attemptsOnCard) ? Math.max(0,Math.min(1000,value.attemptsOnCard)) : value.submitted === true ? 1 : 0,
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

export default function Player({ chapter, notebook, scaffold, progress, onProgress, onExit, onError, onComplete, audioControls }: Props) {
  const eligibleCards = notebook.cards.filter(item => (!chapter || chapter.cardIds.includes(item.id)) && canScoreRecallCard(item, notebook.sources));
  const awaitingReview = notebook.cards.filter(item => item.reviewStatus === 'needs-review').length;
  const [session] = useState(() => {
    const saved = progress.activeSession;
    if (saved?.scaffoldId === scaffold.id && saved.chapterId === chapter?.id && saved.index < saved.cardIds.length && saved.cardIds.every(id => eligibleCards.some(card => card.id === id))) return saved;
    const seed = stableHash(`${notebook.id}:${Date.now()}`);
    return { scaffoldId: scaffold.id, ...(chapter ? {chapterId:chapter.id} : {}), cardIds: selectExpeditionCards(eligibleCards, progress, Math.min(8, eligibleCards.length)).map(card => card.id), index: 0, seed, startedAt: new Date().toISOString(), state: undefined };
  });
  const lessonPlan = useMemo(() => buildLearningBriefing({ notebook, scaffold, cardIds: session.cardIds }), [notebook, scaffold, session.cardIds]);
  const [index, setIndex] = useState(Math.min(session.index, session.cardIds.length));
  const [state, setState] = useState<PlayState>(() => ({...restoreState(session.state), lesson: initialLessonState(lessonPlan, session.state?.lesson ?? progress.lessons?.[lessonPlan.id])}));
  const [elapsed, setElapsed] = useState(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000)));
  const latestProgress = useRef(progress); latestProgress.current = progress;
  const currentState = useRef(state); currentState.current = state;
  const [committedProgress, setCommittedProgress] = useState(progress);
  const [savingCount, setSavingCount] = useState(0);
  const [savingCritical, setSavingCritical] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [writeFailed, setWriteFailed] = useState(false);
  const [reactionEvent,setReactionEvent] = useState(0);
  const freshCompletion = useRef(false);
  type Transition = { next: PlayState; nextIndex: number; progress: Progress; kind: 'answer' | 'advance' | 'exit' | 'lesson' };
  const pendingTransition = useRef<Transition | null>(null);
  const criticalInFlight = useRef(false);
  const initialized = useRef(false);
  const mounted = useRef(true);
  const ownedSpeech=useRef<SpeechSynthesisUtterance|null>(null);
  function stopOwnedSpeech(){const utterance=ownedSpeech.current;if(!utterance)return;ownedSpeech.current=null;utterance.onstart=null;utterance.onend=null;utterance.onerror=null;window.speechSynthesis.cancel();duckMusic(false);}
  useEffect(() => { mounted.current = true; return () => { mounted.current = false;stopOwnedSpeech(); }; }, []);
  const locked = savingCritical || pendingTransition.current !== null;
  const completed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if(reactionEvent > 0) revealGameMoment(resultPanel.current); }, [reactionEvent]);
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
    gameActionFeedback(activityActionCue(previous,next),scaffold.id,notebook.ageGroup);
    currentState.current = next; setState(next); void persist(next);
  }
  async function commitTransition(operation: Transition): Promise<boolean> {
    if (criticalInFlight.current) return false;
    criticalInFlight.current = true; setSavingCritical(true); setSaveError('');
    const saved = await writeProgress(operation.progress);
    if (!mounted.current) { criticalInFlight.current = false; return false; }
    if (saved) {
      pendingTransition.current = null;
      if(operation.kind==='lesson')gameActionFeedback(lessonActionCue(currentState.current.lesson,operation.next.lesson),scaffold.id,notebook.ageGroup);
      currentState.current = operation.next; setState(operation.next); setIndex(operation.nextIndex);
      if (operation.kind === 'answer') {setReactionEvent(event=>event+1);musicFeedback(operation.next.correct ? 'success' : 'try-again', scaffold.id, notebook.ageGroup);}
      if (operation.kind === 'advance') {stopOwnedSpeech();setReactionEvent(0);if(operation.nextIndex>=cards.length&&cards.length)freshCompletion.current=true;}
      if (operation.kind === 'advance') window.setTimeout(() => heading.current?.focus(), 30);
      if (operation.kind === 'exit') onExit();
    } else setSaveError('Your progress has not been saved yet. Retry the same save before continuing; your answer will not be counted twice.');
    criticalInFlight.current = false; setSavingCritical(false); return saved;
  }
  function transition(next: PlayState, nextIndex: number, base: Progress, kind: Transition['kind']) {
    if (pendingTransition.current || criticalInFlight.current) return;
    const operation = { next, nextIndex, progress: withSession(next, nextIndex, base), kind };
    pendingTransition.current = operation; void commitTransition(operation);
  }

  const lessonUnlocked = lessonReady(lessonPlan, state.lesson);
  useLayoutEffect(() => { if(lessonUnlocked && !state.submitted) revealGameMoment(heading.current); }, [lessonUnlocked,index]);
  async function saveLesson(lesson: LessonState): Promise<boolean> {
    // A failed lesson write can be retried (or replaced by newer local notes).
    // Answer/advance transitions remain immutable until their original save succeeds.
    if (criticalInFlight.current || pendingTransition.current && pendingTransition.current.kind !== 'lesson') return false;
    const next = {...currentState.current, lesson};
    const prior = latestProgress.current;
    const lessons = {...prior.lessons, [lessonPlan.id]: lesson};
    const bounded = Object.fromEntries(Object.entries(lessons).slice(-300));
    const operation: Transition = {next, nextIndex:index, progress:withSession(next,index,{...prior,lessons:bounded}), kind:'lesson'};
    pendingTransition.current = operation;
    return commitTransition(operation);
  }
  useEffect(() => { if(done||lessonUnlocked)setLearningMusicPhase(done?'success':'quest'); return () => setLearningMusicPhase('intro'); }, [done, lessonUnlocked]);

  useEffect(() => { if (!initialized.current && sessionIsCurrent && cards.length) { initialized.current = true; void persist(state, index, { ...latestProgress.current, sessions: latestProgress.current.sessions + (session.state ? 0 : 1) }); } }, []);
  useEffect(() => {
    if (!isTimed || done) return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [isTimed, done, session.startedAt]);
  useEffect(() => {
    if (sessionIsCurrent && done && cards.length && freshCompletion.current && !completed.current) { completed.current = true; musicFeedback('complete', scaffold.id, notebook.ageGroup); onComplete?.(state.independentCount, cards.length); }
  }, [done, sessionIsCurrent, cards.length, state.independentCount]);

  async function submit(correct: boolean) {
    if (!card || currentState.current.submitted || pendingTransition.current || criticalInFlight.current) return;
    const state = currentState.current;
    if (!sessionIsCurrent || !canScoreRecallCard(card, notebook.sources)) { onError('This challenge needs author review or its source evidence changed. Review it in the studio before scored play.'); return; }
    if (!lessonReady(lessonPlan, state.lesson)) { onError('Complete the source lesson and guided practice before starting this quest.'); return; }
    criticalInFlight.current=true;setSavingCritical(true);
    const priorProgress=latestProgress.current;
    const assisted = state.assisted || state.hint || state.evidence || scaffold.family === 'explain' || lessonQuestSupport(lessonPlan,state.lesson).assisted;
    let updated = recordAttempt(priorProgress, card, correct, assisted ? 'guessing' : state.confidence);
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
    try {
      const legacySucceeded=!priorProgress.practice&&(priorProgress.attempts.some(attempt=>attempt.cardId===card.id&&attempt.correct)||scaffold.family==='explain'&&priorProgress.journal.some(entry=>entry.cardId===card.id));
      const rewarded=await awardPracticeXp(priorProgress,notebook,{kind:'card',card},assisted&&(correct||scaffold.family==='explain'),new Date(),legacySucceeded);
      if(rewarded.practice)updated={...updated,practice:rewarded.practice};
      if(!mounted.current)return;
      const gainedPractice=practiceXp(updated)-practiceXp(priorProgress);
      const next = { ...state, submitted: true, correct, resultAssisted:assisted,resultXp:journeyXp(updated)-journeyXp(priorProgress),resultPracticeXp:gainedPractice,sessionPracticeXp:(state.sessionPracticeXp??0)+gainedPractice, correctCount: state.correctCount + (correct ? 1 : 0), independentCount: state.independentCount + (correct && !assisted ? 1 : 0), answeredCount: state.answeredCount + (state.attemptsOnCard === 0 ? 1 : 0), attemptsOnCard:state.attemptsOnCard+1 };
      criticalInFlight.current=false;setSavingCritical(false);
      transition(next, index, updated, 'answer');
    } catch(error) {if(mounted.current)onError(`Your result could not be prepared for saving. ${error instanceof Error?error.message:'Try again.'}`);}
    finally {if(!pendingTransition.current){criticalInFlight.current=false;if(mounted.current)setSavingCritical(false);}}
  }
  function nextCard() { const state = currentState.current; if (!state.submitted) return; const nextIndex = index + 1; const next = {...initialState(state.correctCount, state.answeredCount, state.independentCount), lesson:state.lesson,sessionPracticeXp:state.sessionPracticeXp}; transition(next, nextIndex, latestProgress.current, 'advance'); }
  function retryCard() {
    const prior=currentState.current;if(!prior.submitted||prior.correct)return;
    transition({...prior,submitted:false,correct:false,selection:'',input:'',pairs:{},order:[],assisted:true,hint:true,evidence:false},index,latestProgress.current,'advance');
  }
  function pause() { transition(currentState.current, index, latestProgress.current, 'exit'); }
  function speak() {
    if (!('speechSynthesis' in window)) { onError('Read-aloud is unavailable in this browser.'); return; }
    stopOwnedSpeech();const utterance=new SpeechSynthesisUtterance(card?.prompt ?? scaffold.name);ownedSpeech.current=utterance;
    utterance.onstart=()=>{if(mounted.current&&ownedSpeech.current===utterance)duckMusic(true);};
    const finish=()=>{if(ownedSpeech.current!==utterance)return;ownedSpeech.current=null;duckMusic(false);};
    utterance.onend=finish;utterance.onerror=finish;window.speechSynthesis.speak(utterance);
  }

  const sessionTotals=recallSessionTotals(committedProgress,session,card?.id);
  const lastResult=state.submitted?sessionTotals.lastAttempt:undefined;
  const currentSupport=state.assisted||state.hint||state.evidence||scaffold.family==='explain'||lessonQuestSupport(lessonPlan,state.lesson).assisted;
  // Looking at figures after a saved answer must not relabel that answer's original support mode.
  const sourceAssistance=async()=>{if(pendingTransition.current||criticalInFlight.current)return false;const next={...currentState.current,assisted:true};currentState.current=next;setState(next);return await persist(next);};
  const companion=<AsterGuide notebook={notebook} progress={committedProgress} learningState={{title:chapter?.title??scaffold.name,phase:savingCritical||savingCount>0?'saving':done?'complete':!lessonUnlocked?'lesson':state.submitted?'feedback':'answering',position:Math.min(cards.length,index+1),total:cards.length,sourceId:card?.sourceId??lessonPlan.passages[0]?.reference.sourceId,supported:state.submitted?(state.resultAssisted??currentSupport):currentSupport,saveFailed:writeFailed||!!saveError,lessonStage:state.lesson?.stage,lessonStep:(state.lesson?.walkthroughStep??0)+1,lessonSteps:lessonPlan.walkthrough.steps.length,nextAction:writeFailed||!!saveError?'Keep this page open and choose Retry saving progress.':!lessonUnlocked?state.lesson?.stage==='mission'?'Read the mission and accept it to begin the lesson.':state.lesson?.stage==='context'?'Read the source context and continue to the walkthrough.':state.lesson?.stage==='walkthrough'?'Follow the next walkthrough step, then continue to practice.':'Prepare your explanation and compare it with the source before entering the challenge.':done?'Return to my notebook to choose another mission.':state.submitted?state.correct?'Continue exploring, or complete this chapter.':'Read the saved feedback, then try again with the source or continue exploring.':'Make your next move, then choose Check my answer.'}} mode={lessonUnlocked?'play':'study'} contextKey={`${session.seed}:${index}:${card?.id??'done'}`} onAssistance={sourceAssistance} feedback={lastResult&&state.submitted&&reactionEvent>0?{outcome:lastResult.correct?'success':'retry',eventKey:lastResult.id,committed:true,score:{value:state.correctCount,max:state.answeredCount,xp:state.resultXp??lastResult.xp}}:undefined}/>;
  const supportedNow=state.submitted?(state.resultAssisted??(lastResult?.xp?false:currentSupport)):currentSupport;
  const hudMode:GameplayHUDProps['mode']=!lessonUnlocked?'learning':scaffold.family==='explain'?'reflection':supportedNow||done&&state.correctCount>state.independentCount?'practice':'independent';
  const hudProps:GameplayHUDProps={
    totalXp:journeyXp(committedProgress),practiceXp:practiceXp(committedProgress),sessionXp:sessionTotals.xp+(state.sessionPracticeXp??0),
    score:{value:scaffold.family==='explain'?state.answeredCount:state.correctCount,max:cards.length,label:scaffold.family==='explain'?'Reflections saved':'Mission score'},
    mission:{label:'Challenges explored',completed:Math.min(cards.length,state.answeredCount),total:cards.length},
    mode:hudMode,modeReason:done&&scaffold.family!=='explain'?`${state.independentCount} independent correct · ${Math.max(0,state.correctCount-state.independentCount)} supported correct. Points are saved separately.`:hudMode==='learning'?'Preparation saves your work; it does not award XP.':hudMode==='practice'?'Successful supported practice earns Journey XP once per challenge. It does not award independent mastery.':hudMode==='independent'?'Correct due reviews earn XP. Early repeats earn no new XP.':undefined,
    saving:savingCount>0,saveError:writeFailed||!!saveError,
    ...(done?{outcome:{id:`complete-${session.seed}`,kind:'complete' as const,xpDelta:0,label:'Chapter complete · progress saved'}}:lastResult?{outcome:{id:lastResult.id,kind:scaffold.family==='explain'?'reflection' as const:lastResult.correct?'correct' as const:'retry' as const,xpDelta:state.resultXp??lastResult.xp,label:scaffold.family==='explain'?'Reflection saved':lastResult.correct?supportedNow?'Source-supported success':lastResult.xp>0?'Independent recall confirmed':'Correct · no new XP on this review':'Use the source to prepare your next move'}}:{})
  };

  if (!sessionIsCurrent || (!cards.length && notebook.cards.length > 0)) return <div className="player-empty"><BookOpen size={40}/><h2>{awaitingReview ? 'These challenges need author review' : 'Review the source references'}</h2><p>{awaitingReview ? 'Review the wording, answer and source evidence in the studio, then choose “Mark as reviewed”. Draft questions earn no scores or learning progress.' : 'These challenges reference material that changed. Rebuild from the current sources or review the questions in the studio before playing.'}</p><button className="btn primary" onClick={onExit}>Back to notebook</button></div>;
  if (!cards.length) return <div className="player-empty"><BookOpen size={40}/><h2>No challenges to play yet</h2><p>Add sources and create challenges in the studio first.</p><button className="btn primary" onClick={onExit}>Back to the studio</button></div>;

  if (done) return <div className="player-shell"><header className="player-topbar"><button className="btn ghost" onClick={onExit}><ArrowLeft size={18}/>Back to notebook</button><span className="eyebrow">SESSION COMPLETE</span><SourceMaterials notebook={notebook} className="btn secondary"/></header><GameplayHUD {...hudProps}/><div className="session-complete"><div className="completion-art"><WorldPreview scaffoldId={scaffold.id} theme={notebook.theme} ageGroup={notebook.ageGroup}/></div><ReactionEffects outcome="complete" scaffoldId={scaffold.id} ageGroup={notebook.ageGroup} eventKey={session.seed} animate={freshCompletion.current} theme={notebook.theme} artDirection={notebook.gameDesign?.audioDirection}/><span className="completion-badge"><Flag size={22}/> A little further than before</span><h1>Your next chapter is taking shape.</h1><p>You studied the source material and practiced {cards.length} challenges in {scaffold.name.toLowerCase()}. Your progress is saved on this device.</p><div className="completion-stats"><div><strong>{state.correctCount}/{cards.length}</strong><span>Correct this session</span></div><div><strong>{journeyXp(committedProgress)}</strong><span>Journey XP</span></div><div><strong>{committedProgress.bestStreak}</strong><span>Best answer streak</span></div></div><p className="muted">A later review helps more than repeating the same answers immediately. Missed ideas are queued for another visit.</p><button className="btn primary" onClick={onExit}>Return to my notebook<ArrowRight size={18}/></button></div>{companion}</div>;

  if (!lessonUnlocked) return <div className={`player-shell learning-first presentation-${getAgePresentation(notebook.ageGroup).density}`} data-theme={notebook.theme}>
    <header className="player-topbar"><button className="btn ghost" disabled={locked} onClick={pause}><Pause size={17}/>Save & exit</button><div className="player-game-name"><BookOpen size={19}/><strong>{scaffold.name}</strong></div><div className="player-top-actions"><SourceMaterials notebook={notebook} beforeDownload={sourceAssistance} disabled={locked} className="btn secondary"/>{audioControls}</div></header>
    <GameplayHUD {...hudProps}/>
    <div className="player-lesson-layout"><LearningBriefing plan={lessonPlan} saved={state.lesson} onSave={saveLesson} onReady={()=>{}} onError={onError}/>
      {saveError && pendingTransition.current?.kind !== 'lesson' && <div className="notice" role="alert"><p>{saveError}</p><button className="btn primary" disabled={savingCritical} onClick={()=>{if(pendingTransition.current)void commitTransition(pendingTransition.current);}}>Retry saving progress</button></div>}
      <p className="player-save-note" role="status">{savingCount ? 'Saving progress…' : writeFailed ? 'Some progress is not saved. Retry before leaving.' : 'Progress saved on this device · Lesson and quest included offline'}</p>
    </div>{companion}</div>;

  const source = notebook.sources.find(item => item.id === card.sourceId);
  const toolkit = lessonToolkit(lessonPlan,state.lesson);
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
    <header className="player-topbar"><button className="btn ghost" disabled={locked} onClick={pause}><Pause size={17}/>Save & exit</button><div className="player-game-name"><span>{scaffold.icon}</span><strong>{scaffold.name}</strong></div><div className="player-top-actions"><SourceMaterials notebook={notebook} beforeDownload={sourceAssistance} disabled={locked} className="btn secondary"/>{audioControls}<span className="xp-pill"><Sparkles size={16}/>{journeyXp(committedProgress)} XP</span><button className="icon-button" onClick={speak} aria-label="Read this challenge aloud"><Volume2 size={19}/></button></div></header>
    <GameplayHUD {...hudProps}/>
    <div className="player-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={index} aria-label={`Challenge ${index + 1} of ${cards.length}`}><div style={{ width: `${index / cards.length * 100}%` }}/></div>
    <div className="player-layout">
      <aside className="player-sidebar" aria-label="Expedition progress"><WorldPreview scaffoldId={scaffold.id} theme={notebook.theme} ageGroup={notebook.ageGroup}/><span className="eyebrow">YOUR EXPEDITION</span><h2>{chapter?.title??notebook.title}</h2><p>{chapter?chapter.sourceTitle:scaffold.tagline}</p><ol className="mission-path">{cards.map((item, at) => <li key={item.id} className={at < index ? 'complete' : at === index ? 'current' : ''}><span>{at < index ? <Check size={12}/> : at + 1}</span><div>{at === index ? 'You are here' : at < index ? 'Explored' : `Challenge ${at + 1}`}</div></li>)}</ol><div className="player-note"><Lightbulb size={18}/><p>Hints are always available. Supported practice is saved separately from independent recall.</p></div></aside>
      <section className="challenge-area" aria-label="Quest workspace">
        <div className="challenge-meta"><span className="eyebrow">CHALLENGE {index + 1} OF {cards.length}</span>{isTimed && <span className="timer-chip" aria-label="Elapsed session time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · no time limit</span>}<span className="concept-chip">{conceptLabel}</span></div>
        <div className="quest-learning-status"><BookOpen size={16}/><span>Lesson complete · {lessonQuestSupport(lessonPlan,state.lesson).assisted ? "Apply what you just learned" : supportedNow ? "Supported practice" : "Independent retrieval"}</span><button type="button" onClick={()=>void saveLesson(initialLessonState(lessonPlan))}>Revisit the lesson</button></div><p className="game-instructions">{instructions[scaffold.family]}</p>{awaitingReview > 0 && <p className="caregiver-note">{awaitingReview} draft {awaitingReview === 1 ? 'challenge awaits' : 'challenges await'} author review and {awaitingReview === 1 ? 'is' : 'are'} excluded from this scored session.</p>}
        {card.questionType === 'manual' && !card.sourceId && <p className="caregiver-note">Author-written challenge. The answer was supplied by the notebook author.</p>}
        {young && <p className="caregiver-note">{notebook.ageGroup === '3-5' ? 'Explore together with a grown-up. Use read-aloud whenever it helps.' : 'Need a little help? Try read-aloud or open a hint.'}</p>}
        <section className="quest-purpose"><span className="eyebrow">YOUR MISSION</span><p>{lessonPlan.mission.handoff}</p><div><span>{state.correctCount} ideas recovered</span><span>{cards.length-index} challenges ahead</span></div></section>
        {toolkit.length>0&&<details className="quest-toolkit" onToggle={e=>{if(e.currentTarget.open&&!state.submitted&&!state.assisted)change({assisted:true});}}><summary><BookOpen size={16}/>Your field kit · {toolkit.length} source connections</summary><p>Use the connections you built in the lesson. Opening this kit makes the current attempt supported practice.</p><dl>{toolkit.map(entry=><div key={entry.id}><dt>{entry.label}</dt><dd>{entry.meaning}</dd></div>)}</dl></details>}
        <section className="challenge-card">
          {saveError && <div className="notice" role="alert"><p>{saveError}</p><button className="btn primary" disabled={savingCritical} onClick={() => { if (pendingTransition.current) void commitTransition(pendingTransition.current); }}>Retry saving progress</button></div>}
          {savingCritical && <p role="status" className="muted">Saving progress before continuing…</p>}
          <h1 ref={heading} tabIndex={-1}>{pairMode ? (scaffold.family === 'sort' ? 'Give every idea a home.' : scaffold.family === 'connect' ? 'Make the connections.' : 'Find the matching pairs.') : scaffold.family === 'sequence' ? (ordering.isProcedure ? 'What happens first? And next?' : 'Put the passage back together.') : scaffold.family === 'explain' ? `How would you explain ${card.concept}?` : card.prompt.split('\n\n')[0]}</h1>
          <fieldset disabled={locked} aria-label="Challenge controls" style={{border:0,padding:0,margin:0,minWidth:0}}>
          {!pairMode && !['sequence', 'explain'].includes(scaffold.family) && card.prompt.includes('\n\n') && <p className="question-passage">{card.prompt.split('\n\n').slice(1).join('\n\n')}</p>}


          {sourceVisuals.length > 0 && <div className="player-figures"><button className="btn ghost" aria-expanded={state.figures} onClick={() => change({ figures: !state.figures })}><BookOpen size={17}/>{state.figures ? 'Hide learning figures' : 'View learning figures'}</button>{state.figures && <><p className="muted small">Use the author's reviewed visuals for supported practice. Viewing them before answering does not earn independent-recall credit.</p><LearningFigures notebook={{ sources: notebook.sources, artwork: sourceVisuals }}/></>}</div>}

          {pairMode ? <div className={`pair-board ${scaffold.family}`}>
            {pool.map((item, at) => <div className="pair-row" key={item.id}><div className="pair-prompt"><span className="pair-number">{at + 1}</span><p>{passageLabel(item)}</p></div><label><span className="sr-only">Match description {at + 1} to a concept</span><select aria-label={`Match description ${at + 1} to a concept`} disabled={state.submitted} value={state.pairs[item.id] ?? ''} onChange={event => change({ pairs: { ...state.pairs, [item.id]: event.target.value } })}><option value="">Choose a concept…</option>{pairAnswers.map(answer => <option key={answer} value={answer}>{answer}</option>)}</select></label>{state.submitted && <span className={state.pairs[item.id] === item.answer ? 'pair-correct' : 'pair-incorrect'}>{state.pairs[item.id] === item.answer ? <Check size={18}/> : <X size={18}/>}</span>}</div>)}
            {scaffold.family === 'connect' && <p className="muted">Every connection is grounded in a supplied source description.</p>}
          </div> : scaffold.family === 'sequence' ? <div className="sequence-board">{sequenceOrder.map((item, position) => <div className="sequence-step" key={item}><span className="step-number">{position + 1}</span><p>{ordering.items[Number(item)]}</p><div className="sequence-controls"><button aria-label={`Move step ${position + 1} up`} disabled={position === 0 || state.submitted} onClick={() => { const order = [...sequenceOrder]; [order[position - 1], order[position]] = [order[position], order[position - 1]]; change({ order }); }}><ArrowUp size={16}/></button><button aria-label={`Move step ${position + 1} down`} disabled={position === sequenceOrder.length - 1 || state.submitted} onClick={() => { const order = [...sequenceOrder]; [order[position + 1], order[position]] = [order[position], order[position + 1]]; change({ order }); }}><ArrowDown size={16}/></button></div></div>)}</div>
          : scaffold.family === 'cloze' ? <div className="written-answer"><label htmlFor="recall-answer">Your answer</label><input id="recall-answer" autoComplete="off" value={state.input} disabled={state.submitted} placeholder="Bring it back from memory…" onChange={event => change({ input: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && state.input.trim() && !state.submitted) check(); }}/><small>Spelling and punctuation are normalized. This exercise expects the source’s wording.</small></div>
          : scaffold.family === 'explain' ? <div className="reflection-board"><label htmlFor="explanation">Teach it to someone new to the topic.</label><textarea id="explanation" rows={5} value={state.input} disabled={state.submitted} onChange={event => change({ input: event.target.value })} placeholder="The main idea is… An example is…"/>{!state.reflectionRevealed ? <button className="btn secondary" disabled={!state.input.trim()} onClick={() => change({ reflectionRevealed: true })}>Compare with the source<BookOpen size={16}/></button> : <div className="self-assessment"><blockquote>{card.evidence || card.answer}</blockquote><p>Did your explanation capture the idea accurately? Your reflection is saved; this is your assessment, not an automated grade.</p>{!state.submitted && <div className="button-row"><button className="btn secondary" onClick={() => submit(false)}>I want another look</button><button className="btn primary" onClick={() => submit(true)}>I explained the main idea<Check size={16}/></button></div>}</div>}</div>
          : <><div className={scaffold.family === 'diagram' ? 'diagram-board' : 'answer-grid'}>{scaffold.family === 'diagram' && <div className="diagram-center"><span>Missing label</span><strong>?</strong></div>}{displayOptions.map((option, at) => <button key={option} className={`answer-option ${state.selection === option ? 'selected' : ''} ${state.submitted && option === card.answer ? 'correct' : ''} ${state.submitted && state.selection === option && !state.correct ? 'incorrect' : ''}`} disabled={state.submitted} onClick={() => change({ selection: option })}><span className="option-letter">{String.fromCharCode(65 + at)}</span><span>{option}</span>{state.submitted && option === card.answer && <CheckCircle2 size={20}/>}</button>)}</div>{scaffold.family === 'scenario' && !state.submitted && <button className="btn ghost evidence-button" onClick={() => change({ evidence: !state.evidence })}><BookOpen size={17}/>{state.evidence ? 'Close' : 'Inspect'} source evidence</button>}</>}

          {state.evidence && !state.submitted && <blockquote className="source-evidence">{card.evidence || card.answer}</blockquote>}
          {state.hint && !state.submitted && <div className="hint-box"><Lightbulb size={18}/><p>{scaffold.family === 'sequence' ? `The passage begins: “${ordering.items[0]}”` : `Read the complete idea and its conditions: “${card.evidence || card.answer}” — ${source?.title ?? 'Author’s notes'}`}</p></div>}

          {!state.submitted && scaffold.family !== 'explain' && <div className="challenge-footer"><button className="btn ghost" onClick={() => change({ hint: !state.hint })}><Lightbulb size={17}/>{state.hint ? 'Hide hint' : 'A little hint'}</button><button className="btn primary" disabled={!canSubmit} onClick={check}>Check my answer<ChevronRight size={18}/></button></div>}

          {state.submitted && <div className={`answer-feedback ${state.correct ? 'success' : 'retry'}`} ref={resultPanel} tabIndex={-1} role="status"><ReactionEffects outcome={state.correct?'success':'retry'} scaffoldId={scaffold.id} ageGroup={notebook.ageGroup} eventKey={`${card.id}:${state.attemptsOnCard}`} animate={reactionEvent>0} theme={notebook.theme} artDirection={notebook.gameDesign?.audioDirection}/><div className="feedback-reward"><strong>{scaffold.family==='explain'?'Reflection saved':state.correct?'Mission score +1':'Keep the idea in play'}</strong><span>+{state.resultXp??lastResult?.xp??0} Journey XP · {supportedNow?'supported practice':'independent attempt'}</span></div><div className="feedback-heading">{state.correct ? <CheckCircle2 size={24}/> : <Lightbulb size={24}/>}<h3>{scaffold.family === 'explain' ? 'Reflection saved.' : state.correct ? scaffold.dialogue.success : scaffold.dialogue.tryAgain}</h3></div>{pairMode ? <ul className="pair-feedback">{pool.map(item => <li key={item.id}><strong>{item.answer}</strong> — {passageLabel(item)}</li>)}</ul> : scaffold.family === 'sequence' ? <ol>{ordering.items.map((item, at) => <li key={at}>{item}</li>)}</ol> : <p>{card.explanation}</p>}<details><summary><BookOpen size={15}/>View source evidence{source ? ` · ${source.title}` : ''}</summary><blockquote>{card.evidence || 'This challenge was written by the notebook author.'}</blockquote>{source?.url && <a href={source.url} target="_blank" rel="noreferrer">Open original source</a>}</details>{!state.correct&&scaffold.family!=='explain'&&<button className="btn secondary" onClick={retryCard}>Try again with the source<ArrowRight size={16}/></button>}<button className="btn primary" onClick={nextCard}>{index === cards.length - 1 ? 'Complete this chapter' : 'Continue exploring'}<ArrowRight size={18}/></button></div>}
          </fieldset>
        </section>
        <p className="player-save-note" role="status"><Check size={13}/>{saveError ? 'Progress needs a successful save before continuing' : savingCount > 0 ? 'Saving progress…' : writeFailed ? 'Some progress is not saved. Use Save & exit to retry before leaving.' : 'Progress saved on this device · No AI needed to play'}</p><p className="nimeshbuilds-credit">Crafted by <a href="https://github.com/NimeshBuilds" target="_blank" rel="noreferrer">NimeshBuilds</a></p>
      </section>
    </div>
  {companion}</div>;
}
