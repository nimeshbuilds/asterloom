import AsterGuide from './AsterGuide';
import {designedMission} from '../lib/gameDesign';
import {modelPracticeFeedback} from '../lib/modelPractice';
import SequenceWorkshop from './SequenceWorkshop';
import ClassificationBoard from './ClassificationBoard';
import DependencyBoard from './DependencyBoard';
import '../learning-journey.css';
import LearningScene from './LearningScene';
import {getAgePresentation,WORLD_PALETTES,defaultWorldIdForKind} from '../data/worlds';
import {activityScene,sceneActions,applySceneAction} from '../lib/worldScene';
import PictureBuildBoard from './PictureBuildBoard';
import { initialPictureBuildResponse } from '../lib/pictureBuildEngine';
import ChildPlayBoard from './ChildPlayBoard';
import { initialChildPlayResponse } from '../lib/childPlayEngine';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, GripVertical, Lightbulb, RotateCcw } from 'lucide-react';
import { evaluateActivity, validateActivity } from '../lib/structuredEngine';
import type { ActivityResponse, Evaluation, StructuredActivity } from '../lib/structuredEngine';
import type { Notebook, NotebookArtwork, Progress, Source } from '../types';
import {createNotebook} from '../lib/utils';
import {scaffoldById} from '../data/scaffolds';
import LearningBriefing from './LearningBriefing';
import ReactionEffects from './ReactionEffects';
import {buildLearningBriefing,initialLessonState,lessonReady,lessonQuestSupport,type LessonState} from '../lib/learningBriefing';
import {activityActionCue,lessonActionCue} from '../lib/actionFeedback';
import {gameActionFeedback,musicFeedback,setLearningMusicPhase} from '../lib/music';
import LearningFigures from './LearningFigures';
import CompletionBoard from './CompletionBoard';
import { initialCompletionResponse } from '../lib/completionEngine';
import DataBoard from './DataBoard';
import { initialDataResponse } from '../lib/dataEngine';
import MediaBoard from './MediaBoard';
import { initialMediaResponse } from '../lib/mediaEngine';
import ScenarioBoard from './ScenarioBoard';
import { initialScenarioResponse } from '../lib/scenarioEngine';
import CompositionBoard from './CompositionBoard';
import { initialCompositionResponse } from '../lib/compositionEngine';
import PictureBoard from './PictureBoard';
import { initialPictureResponse } from '../lib/pictureEngine';
import RuleSwitchBoard from './RuleSwitchBoard';
import { initialRuleSwitchResponse } from '../lib/ruleSwitchEngine';
import './structured.css';

export type ActivityEvaluation = Evaluation;
export interface StructuredBoardProps {
  activity: StructuredActivity;
  notebook?: Notebook;
  /** Only acknowledged saved progress should be supplied here. */
  progress?: Progress;
  sources: Source[];
  artwork?: NotebookArtwork[];
  savedResponse?: unknown;
  ageGroup?: string;
  theme?: string;
  scaffoldId?: string;
  onSave: (response: unknown) => void | Promise<boolean | void>;
  onComplete: (evaluation: ActivityEvaluation) => void | Promise<boolean | void>;
  onCommit?: (response: unknown, evaluation: ActivityEvaluation) => void | Promise<boolean | void>;
  onRetrySave?: (evaluation: ActivityEvaluation) => void | Promise<boolean | void>;
}
export const ACTIVITY_KIND_LABELS: Record<StructuredActivity['kind'], string> = {
  sequence: 'Rebuild the sequence', classification: 'Sort the evidence', decision: 'Make the decision',
  dependency: 'Connect the system', budget: 'Balance the resources', rubric: 'Review with a purpose', diagram: 'Complete the model',
  completion: 'Complete the worked model', data: 'Investigate the observations', media: 'Explore the recording',
  scenario: 'Investigate and act', construction: 'Build, test and revise', explanation: 'Connect the reasoning',
  picture: 'Discover through pictures',
  'rule-switch': 'Adapt to a new rule', 'child-play': 'Bring the source story to life', 'picture-build': 'Build a picture and tell its story',
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function restoredResponse(activity: StructuredActivity, saved?: unknown): ActivityResponse {
  const value = object(saved);
  switch (activity.kind) {
    case 'completion': return initialCompletionResponse(activity, saved);
    case 'data': return initialDataResponse(activity, saved);
    case 'media': return initialMediaResponse(activity, saved);
    case 'scenario': return initialScenarioResponse(activity, saved);
    case 'construction': case 'explanation': return initialCompositionResponse(activity, saved);
    case 'picture-build': return initialPictureBuildResponse(activity, saved);
    case 'child-play': return initialChildPlayResponse(activity, saved);
    case 'picture': return initialPictureResponse(activity, saved);
    case 'rule-switch': return initialRuleSwitchResponse(activity, saved);
    case 'sequence': {
      const ids = activity.items.map(item => item.id), order = value.order;
      return { order: Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && order.every(id => typeof id === 'string' && ids.includes(id)) ? order : [...ids].reverse() };
    }
    case 'classification': return { assignments: Object.fromEntries(activity.items.map(item => { const prior = object(value.assignments)[item.id]; return [item.id, Array.isArray(prior) ? [...new Set(prior.filter(id => typeof id === 'string' && activity.categories.some(category => category.id === id)))] : []]; })) };
    case 'decision': return { choiceId: typeof value.choiceId === 'string' && activity.choices.some(choice => choice.id === value.choiceId) ? value.choiceId : '' };
    case 'dependency': return { edges: Array.isArray(value.edges) ? value.edges.filter((edge): edge is { from: string; to: string; relation: string } => { const data = object(edge); return typeof data.relation === 'string' && activity.nodes.some(node => node.id === data.from) && activity.nodes.some(node => node.id === data.to); }).slice(0, 120) : [] };
    case 'budget': return { quantities: Object.fromEntries(activity.items.map(item => { const prior = object(value.quantities)[item.id]; return [item.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior <= item.maxQuantity ? prior : 0]; })) };
    case 'rubric': return { ratings: Object.fromEntries(activity.criteria.map(criterion => { const prior = object(value.ratings)[criterion.id]; return [criterion.id, typeof prior === 'number' && Number.isInteger(prior) && prior >= 0 && prior < criterion.levels.length ? prior : -1]; })) };
    case 'diagram': return { placements: Object.fromEntries(activity.labels.map(label => { const prior = object(value.placements)[label.id]; return [label.id, typeof prior === 'string' && activity.targets.some(target => target.id === prior) ? prior : '']; })) };
  }
}

export default function StructuredBoard({ activity, notebook, progress, sources, artwork, savedResponse, onSave, onComplete, onCommit, onRetrySave, ageGroup = 'adult', theme = 'islands', scaffoldId }: StructuredBoardProps) {
  const [response, setResponse] = useState<ActivityResponse>(() => restoredResponse(activity, savedResponse));
  const currentResponse = useRef(response);
  currentResponse.current = response;
  const checkInFlight = useRef(false);
  const assistanceInFlight = useRef(false);
  const initialDraft = object(object(savedResponse)._draft);
  const teachingNotebook = useMemo(() => notebook ?? createNotebook({id:`activity-${activity.id}`,title:activity.title,sources,cards:[],activities:[activity],ageGroup,theme}), [notebook,activity,sources,ageGroup,theme]);
  const missionPresentation=designedMission(notebook?.gameDesign,activity.id);
  const teachingScaffold = scaffoldById(scaffoldId ?? activity.scaffoldIds?.[0] ?? defaultWorldIdForKind(activity.kind)) ?? scaffoldById('recall-escape-mission')!;
  const lessonPlan = useMemo(() => buildLearningBriefing({notebook:teachingNotebook,scaffold:teachingScaffold,activity}), [teachingNotebook,teachingScaffold,activity]);
  const [lesson,setLesson] = useState(() => initialLessonState(lessonPlan,initialDraft.lesson));
  const lessonUnlocked = lessonReady(lessonPlan,lesson);
  const [reactionEvent,setReactionEvent] = useState(0);
  useEffect(() => {setLesson(initialLessonState(lessonPlan,object(object(savedResponse)._draft).lesson));},[lessonPlan.id]);
  useEffect(() => {if(lessonUnlocked)setLearningMusicPhase('quest');return()=>setLearningMusicPhase('intro');},[lessonUnlocked]);

  const [result, setResult] = useState<Evaluation | null>(() => initialDraft.checked === true ? evaluateActivity(activity, restoredResponse(activity, savedResponse)) : null);
  const [showHint, setShowHint] = useState(initialDraft.showHint === true);
  const [hintUsed, setHintUsed] = useState(initialDraft.hintUsed === true);
  const asterAssisted=useRef(initialDraft.hintUsed===true);
  const [evidenceOpen, setEvidenceOpen] = useState(initialDraft.evidenceOpen === true);
  const [announcement, setAnnouncement] = useState('');
  const [savingResult, setSavingResult] = useState(false);
  const [saveError, setSaveError] = useState('');
  const checkRevision = useRef(0);
  const failedCheck = useRef<Evaluation | null>(null);
  const [edgeFrom, setEdgeFrom] = useState(typeof initialDraft.edgeFrom === 'string' ? initialDraft.edgeFrom : '');
  const [edgeTo, setEdgeTo] = useState(typeof initialDraft.edgeTo === 'string' ? initialDraft.edgeTo : '');
  const [edgeRelation, setEdgeRelation] = useState(typeof initialDraft.edgeRelation === 'string' ? initialDraft.edgeRelation : '');
  const [precisionOpen,setPrecisionOpen] = useState(initialDraft.precisionOpen === true);
  const [caregiverPanelOpen,setCaregiverPanelOpen] = useState(initialDraft.caregiverPanelOpen === true);
  const [worldSelection, setWorldSelection] = useState(typeof initialDraft.worldSelection === 'string' ? initialDraft.worldSelection : '');
  const [selectedLabel, setSelectedLabel] = useState(typeof initialDraft.selectedLabel === 'string' ? initialDraft.selectedLabel : '');
  const prefix = useId().replaceAll(':', '');
  const fingerprint = JSON.stringify(activity);
  const validation = useMemo(() => validateActivity(activity, sources), [fingerprint, sources]);
  useEffect(() => {
    checkRevision.current += 1; checkInFlight.current = false; assistanceInFlight.current = false; failedCheck.current = null; setSavingResult(false); setSaveError('');
    const draft = object(object(savedResponse)._draft), restored = restoredResponse(activity, savedResponse);
    currentResponse.current = restored; asterAssisted.current = draft.hintUsed === true;
    setResponse(restored); setResult(draft.checked === true ? evaluateActivity(activity, restored) : null); setShowHint(draft.showHint === true); setHintUsed(draft.hintUsed === true); setEvidenceOpen(draft.evidenceOpen === true);
    setEdgeFrom(typeof draft.edgeFrom === 'string' ? draft.edgeFrom : ''); setEdgeTo(typeof draft.edgeTo === 'string' ? draft.edgeTo : ''); setEdgeRelation(typeof draft.edgeRelation === 'string' ? draft.edgeRelation : ''); setSelectedLabel(typeof draft.selectedLabel === 'string' ? draft.selectedLabel : ''); setPrecisionOpen(draft.precisionOpen === true); setCaregiverPanelOpen(draft.caregiverPanelOpen === true); setWorldSelection(typeof draft.worldSelection === 'string' ? draft.worldSelection : ''); setAnnouncement('');
  }, [fingerprint]);
  function persistedResponse(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    return { ...next, _draft: { lesson, edgeFrom, edgeTo, edgeRelation, selectedLabel, showHint, hintUsed:hintUsed||asterAssisted.current, evidenceOpen, checked: Boolean(result), worldSelection, precisionOpen, caregiverPanelOpen, ...draft } };
  }
  function persist(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    failedCheck.current = null; setSaveError('');
    return onSave(persistedResponse(next, draft));
  }
  function change(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    if (checkInFlight.current) return;
    currentResponse.current = next;
    gameActionFeedback(activityActionCue(response,next),teachingScaffold.id,ageGroup);
    const supported = asterAssisted.current || hintUsed || ('caregiverSupport' in next && next.caregiverSupport === true) || ('sourceConsulted' in next && next.sourceConsulted === true);
    if (supported) setHintUsed(true);
    setResponse(next); setResult(null); persist(next, { checked: false, ...draft, hintUsed: supported });
  }
  async function check() {
    if (checkInFlight.current || assistanceInFlight.current || !lessonUnlocked) return;
    checkInFlight.current = true;
    const checkedResponse = currentResponse.current;
    const revision = ++checkRevision.current;
    const retry = onRetrySave ? failedCheck.current : null;
    const assessed = retry ?? evaluateActivity(activity, checkedResponse);
    const evaluation = { ...assessed, hintUsed: asterAssisted.current || hintUsed || assessed.hintUsed === true || lessonQuestSupport(lessonPlan,lesson).assisted };
    setSavingResult(true); setSaveError(''); setResult(null);
    if (evaluation.hintUsed) setHintUsed(true);
    try {
      let saved: (boolean | void)[];
      if (retry && onRetrySave) {
        // Retry the same progress snapshot rather than counting another attempt.
        saved = [await onRetrySave(evaluation)];
      } else if (onCommit) {
        // Response, completion, points and review scheduling share one transaction.
        saved = [await onCommit(persistedResponse(checkedResponse, { checked: true, hintUsed: evaluation.hintUsed }), evaluation)];
      } else {
        // Preview hosts may use separate callbacks; both must acknowledge success.
        const responseSave = persist(checkedResponse, { checked: true, hintUsed: evaluation.hintUsed });
        const completionSave = evaluation.valid ? onComplete(evaluation) : undefined;
        saved = await Promise.all([Promise.resolve(responseSave), Promise.resolve(completionSave)]);
      }
      if (revision !== checkRevision.current) return;
      if (saved.some(value => value === false)) throw new Error('The result could not be saved.');
      failedCheck.current = null; setResult(evaluation); setReactionEvent(value=>value+1);
      const practice=modelPracticeFeedback(activity,checkedResponse);if(evaluation.valid||practice)musicFeedback(evaluation.correct===true||evaluation.outcome==='self-reviewed'||practice?.correct?'success':'try-again',teachingScaffold.id,ageGroup);
    } catch {
      if (revision === checkRevision.current) { failedCheck.current = evaluation; setSaveError('Your result has not been saved yet. Keep this page open and try saving it again.'); }
    } finally {
      if (revision === checkRevision.current) { checkInFlight.current = false; setSavingResult(false); }
    }
  }
  async function saveLesson(next:LessonState):Promise<boolean> {
    if(checkInFlight.current)return false;
    try {
      const saved=await onSave(persistedResponse(response,{lesson:next,checked:false}));
      if(saved===false)return false;
      gameActionFeedback(lessonActionCue(lesson,next),teachingScaffold.id,ageGroup);
      setLesson(next);setResult(null);return true;
    } catch {return false;}
  }
  function restart() { setShowHint(false); setSelectedLabel(''); setEdgeFrom(''); setEdgeTo(''); setEdgeRelation(''); change(restoredResponse(activity), { showHint: false, hintUsed, selectedLabel: '', edgeFrom: '', edgeTo: '', edgeRelation: '' }); setAnnouncement('A fresh attempt is ready.'); }
  if (!validation.success) return <div className="structured-notice warning" role="alert"><strong>This activity needs an author’s attention.</strong><p>{validation.errors.slice(0, 3).join(' ')}</p></div>;
  const companion=<AsterGuide notebook={teachingNotebook} progress={progress} learningState={{title:activity.title,phase:savingResult?'saving':!lessonUnlocked?'lesson':result?'feedback':'answering',sourceId:activity.sourceRefs[0]?.sourceId,supported:asterAssisted.current||hintUsed||lessonQuestSupport(lessonPlan,lesson).assisted,saveFailed:!!saveError,lessonStage:lesson.stage,lessonStep:lesson.walkthroughStep+1,lessonSteps:lessonPlan.walkthrough.steps.length,nextAction:saveError?onRetrySave?'Keep this page open and choose Retry saving result.':'Keep this page open and choose Check my work to retry saving the result.':!lessonUnlocked?lesson.stage==='mission'?'Read the mission and accept it to begin the lesson.':lesson.stage==='context'?'Read the source context and continue to the walkthrough.':lesson.stage==='walkthrough'?'Follow the next walkthrough step, then continue to practice.':'Prepare your explanation and compare it with the source before entering the challenge.':result?.correct?'Return to the game world and choose another mission.':result?'Read the saved feedback, revise your work, then choose Check my work.':'Try a move in this activity, then choose Check my work.'}} mode={lessonUnlocked?'play':'study'} activityId={activity.id} expressions={missionPresentation?.asterDirection} onAssistance={async()=>{if(checkInFlight.current||assistanceInFlight.current)return false;assistanceInFlight.current=true;asterAssisted.current=true;setHintUsed(true);try{return await persist(currentResponse.current,{hintUsed:true})!==false;}catch{return false;}finally{assistanceInFlight.current=false;}}} feedback={result&&reactionEvent>0?{outcome:result.correct===true||result.outcome==='self-reviewed'||modelPracticeFeedback(activity,response)?.correct?'success':'retry',eventKey:`${activity.id}-${reactionEvent}`,committed:true,...((modelPracticeFeedback(activity,response)?.maxScore??result.maxScore)>0?{score:{value:modelPracticeFeedback(activity,response)?.score??result.score,max:modelPracticeFeedback(activity,response)?.maxScore??result.maxScore}}:{})}:undefined}/>;
  if (!lessonUnlocked) return <><LearningBriefing plan={lessonPlan} saved={lesson} onSave={saveLesson} onReady={()=>{}}/>{companion}</>;
  const referencedFigure = sources.find(source => source.kind === 'image' && typeof source.dataUrl === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source.dataUrl) && activity.sourceRefs.some(reference => reference.sourceId === source.id));
  const practice=result?modelPracticeFeedback(activity,response):undefined;
  const hints = result?.details ?? [];
  const detailClass = (id: string) => result?.valid ? hints.find(detail => detail.id === id)?.correct === true ? ' is-correct' : hints.find(detail => detail.id === id)?.correct === false ? ' needs-revision' : '' : '';
  const presentation = getAgePresentation(ageGroup);
  const scene = activityScene(activity, response);
  const palette = WORLD_PALETTES[theme] ?? WORLD_PALETTES.islands;
  return <section className={`structured-board board-${activity.kind} presentation-${presentation.density}`} data-age={presentation.id} data-theme={theme} aria-busy={savingResult} aria-label={activity.title} style={{'--world-ink':palette.ink,'--world-accent':palette.accent,'--world-tint':palette.sky,'--world-paper':palette.paper} as CSSProperties}>
    <header className="structured-heading"><div><span className="structured-kicker">{ACTIVITY_KIND_LABELS[activity.kind]}</span><h2>{activity.title}</h2></div><span className="structured-badge">{activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Reflection' : 'Hands-on challenge'}</span></header>
    <div className="quest-learning-status"><BookOpen size={16}/><span>Lesson complete · {lessonQuestSupport(lessonPlan,lesson).assisted?'Apply what you just learned':'Independent retrieval'}</span><button type="button" disabled={savingResult} onClick={()=>void saveLesson(initialLessonState(lessonPlan))}>Revisit the lesson</button></div>
    <p className="structured-instruction">{activity.instruction}</p>
    {activity.reviewStatus === 'needs-review' && <p className="structured-review-note">Practice follows this game’s generated rules. Their meaning has not been reviewed against the source, so practice scores do not count toward mastery or competition.</p>}
    <div className="sr-only" aria-live="polite">{announcement}</div>
    <div className="structured-workspace" inert={savingResult || undefined}>
    {activity.kind!=='construction'&&<LearningScene interaction="overview" scaffoldId={scaffoldId ?? activity.scaffoldIds?.[0] ?? defaultWorldIdForKind(activity.kind)} theme={theme} ageGroup={ageGroup} snapshot={scene} selectedId={worldSelection} onSelect={id => {if(worldSelection!==id)gameActionFeedback('select',teachingScaffold.id,ageGroup);setWorldSelection(id);persist(response,{worldSelection:id});}} actions={sceneActions(activity,response,worldSelection)} onAction={action => change(applySceneAction(activity,response,action))} compact={['picture','picture-build','child-play'].includes(activity.kind)}/>}
    {activity.kind === 'completion' && 'slotTokens' in response && <CompletionBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'data' && 'evidenceRows' in response && <DataBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'media' && 'activeCheckpointId' in response && <MediaBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'scenario' && 'actions' in response && <ScenarioBoard activity={activity} response={response} onChange={change}/>}
    {(activity.kind === 'construction' || activity.kind === 'explanation') && ('instances' in response || 'arguments' in response) && <CompositionBoard activity={activity} response={response} onChange={change} ageGroup={ageGroup}/>}
    {activity.kind === 'picture-build' && 'parts' in response && <PictureBuildBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} precisionOpen={precisionOpen} onPrecisionChange={open=>{setPrecisionOpen(open);persist(response,{precisionOpen:open});}}/>}
    {activity.kind === 'child-play' && 'actionIds' in response && <ChildPlayBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} caregiverOpen={caregiverPanelOpen} onCaregiverToggle={open=>{setCaregiverPanelOpen(open);persist(response,{caregiverPanelOpen:open});}}/>}
    {activity.kind === 'picture' && 'exploredTokenIds' in response && <PictureBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} caregiverOpen={caregiverPanelOpen} onCaregiverToggle={open=>{setCaregiverPanelOpen(open);persist(response,{caregiverPanelOpen:open});}}/>}
    {activity.kind === 'rule-switch' && 'firstCommitted' in response && <RuleSwitchBoard activity={activity} response={response} onChange={change}/>}

    {activity.kind === 'sequence' && 'order' in response && <SequenceWorkshop activity={activity} order={response.order} onChange={change} scaffoldId={teachingScaffold.id} theme={theme} ageGroup={ageGroup}/>}

    {activity.kind === 'classification' && 'assignments' in response && !('firstCommitted' in response) && <ClassificationBoard activity={activity} response={response} selectedItemId={worldSelection} onSelect={id=>{if(worldSelection!==id)gameActionFeedback('select',teachingScaffold.id,ageGroup);setWorldSelection(id);persist(response,{worldSelection:id});}} onChange={change}/>}

    {activity.kind === 'decision' && 'choiceId' in response && <div className="structured-decision"><div className="structured-case"><span className="structured-kicker">The situation</span><dl>{Object.entries(activity.context).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value === null ? 'Not supplied' : String(value)}</dd></div>)}</dl></div><fieldset className="structured-decisions"><legend>What should happen next?</legend>{activity.choices.map((choice, index) => <label key={choice.id} className={`structured-answer${response.choiceId === choice.id ? ' selected' : ''}`}><input type="radio" name={`${prefix}-decision`} checked={response.choiceId === choice.id} onChange={() => change({ choiceId: choice.id })}/><span className="structured-answer-letter">{String.fromCharCode(65 + index)}</span><span>{choice.label}</span><ArrowRight size={17}/></label>)}</fieldset></div>}

    {activity.kind === 'dependency' && 'edges' in response && !('instances' in response) && <DependencyBoard activity={activity} response={response} draft={{from:edgeFrom,to:edgeTo,relation:edgeRelation}} onDraftChange={draft=>{setEdgeFrom(draft.from);setEdgeTo(draft.to);setEdgeRelation(draft.relation);persist(response,{edgeFrom:draft.from,edgeTo:draft.to,edgeRelation:draft.relation});}} onChange={change}/>}

    {activity.kind === 'budget' && 'quantities' in response && (() => { const total = activity.items.reduce((sum, item) => sum + (response.quantities[item.id] || 0) * item.cost, 0); return <div className="structured-budget"><div className={`structured-budget-meter${total > activity.budget ? ' over-budget' : ''}`}><div><span>Resources used</span><strong>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}<small> / {activity.budget} {activity.currency}</small></strong></div><div className="structured-meter"><span style={{ width: `${Math.min(100, activity.budget ? total / activity.budget * 100 : total ? 100 : 0)}%` }}/></div><span>{total <= activity.budget ? `${(activity.budget - total).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${activity.currency} available` : `${(total - activity.budget).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${activity.currency} over budget`}</span></div><div className="structured-resource-grid">{activity.items.map(item => <div className="structured-resource" key={item.id}><h3>{item.label}</h3><p>{item.cost} {activity.currency} / {item.unit}</p><label>Quantity<input type="number" min="0" max={item.maxQuantity} step="1" value={response.quantities[item.id]} onChange={event => { const quantity = Number(event.target.value); change({ quantities: { ...response.quantities, [item.id]: Number.isFinite(quantity) ? Math.max(0, Math.min(item.maxQuantity, Math.floor(quantity))) : 0 } }); }}/></label><small>Up to {item.maxQuantity}</small></div>)}</div><div className="structured-requirements"><span className="structured-kicker">What your plan needs</span>{activity.requirements.map(requirement => { const actual = Object.entries(requirement.contributions).reduce((sum, [id, contribution]) => sum + (response.quantities[id] || 0) * contribution, 0); return <div key={requirement.id} className={actual >= requirement.minimum ? 'met' : ''}><CheckCircle2 size={18}/><span>{requirement.label}</span><strong>{actual} / {requirement.minimum}</strong></div>; })}</div></div>; })()}

    {activity.kind === 'rubric' && 'ratings' in response && <div className="structured-rubric"><div className="structured-work-sample"><span className="structured-kicker">{activity.mode === 'self-assessment' ? 'Your reflection prompt' : 'Work to review'}</span><blockquote>{activity.sample}</blockquote></div>{activity.mode === 'self-assessment' && <p className="structured-helper">Use these criteria to reflect. Your choices are saved without an automatic correctness grade.</p>}{activity.criteria.map(criterion => <fieldset key={criterion.id} className={`structured-criterion${detailClass(criterion.id)}`}><legend>{criterion.label}</legend><div>{criterion.levels.map((level, index) => <label key={index} className={response.ratings[criterion.id] === index ? 'selected' : ''}><input type="radio" name={`${prefix}-${criterion.id}`} checked={response.ratings[criterion.id] === index} onChange={() => change({ ratings: { ...response.ratings, [criterion.id]: index } })}/><span className="structured-level">{index + 1}</span><span>{level}</span></label>)}</div></fieldset>)}</div>}

    {activity.kind === 'diagram' && 'placements' in response && <div className="structured-diagram"><p className="structured-helper">Choose a label, then select its place in the model. You can also drag a label onto a target.</p><div className="structured-label-bank" aria-label="Labels to place">{activity.labels.map(label => <button type="button" key={label.id} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', label.id); event.dataTransfer.effectAllowed = 'move'; setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} onClick={() => { setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} aria-pressed={selectedLabel === label.id} className={`${selectedLabel === label.id ? 'selected' : ''}${response.placements[label.id] ? ' placed' : ''}`}><GripVertical size={14}/>{label.label}{response.placements[label.id] && <Check size={13}/>}</button>)}</div><div className={`structured-diagram-canvas${referencedFigure ? ' has-source-image' : ''}`} aria-label="Model target locations">{referencedFigure && <img className="structured-source-image" src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}. Labeled target descriptions are available in the text placement controls.`}/>}{activity.targets.map((target, index) => { const placed = activity.labels.find(label => response.placements[label.id] === target.id); const place = (labelId: string) => { if (!activity.labels.some(label => label.id === labelId)) return; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, value]) => [id, id === labelId ? target.id : value === target.id ? '' : value])); change({ placements }, { selectedLabel: '' }); setSelectedLabel(''); setAnnouncement(`${activity.labels.find(label => label.id === labelId)?.label} placed at ${target.label}.`); }; return <button type="button" key={target.id} className={`structured-target-dot${placed ? ' filled' : ''}${selectedLabel ? ' ready' : ''}`} aria-label={`Place selected label at ${target.label}${placed ? `; currently ${placed.label}` : ''}`} style={{ left: `${Math.max(12, Math.min(88, target.x))}%`, top: `${Math.max(18, Math.min(82, target.y))}%` }} onClick={() => { if (selectedLabel) place(selectedLabel); else setAnnouncement('Choose a label from the bank first.'); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); place(event.dataTransfer.getData('text/plain')); }}><span>{index + 1}</span><strong>{placed?.label ?? 'Place here'}</strong><small>{target.label}</small></button>; })}</div>{referencedFigure && <p className="structured-image-caption">Source figure · {referencedFigure.title}</p>}<details className="structured-text-alternative"><summary>Use the text placement controls</summary><div className="structured-placement-list">{activity.labels.map(label => <label className={`structured-placement${detailClass(label.id)}`} key={label.id}><span>{label.label}</span><select aria-label={`Place ${label.label}`} value={response.placements[label.id] ?? ''} onChange={event => { const targetId = event.target.value; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, target]) => [id, id === label.id ? targetId : targetId && target === targetId ? '' : target])); change({ placements }); }}><option value="">Choose a target</option>{activity.targets.map((target, index) => <option value={target.id} key={target.id}>{index + 1}. {target.label}</option>)}</select></label>)}</div></details></div>}

    <div className="structured-tools"><button type="button" className="structured-text-button" aria-expanded={showHint} onClick={() => { const open = !showHint; setShowHint(open); if (open) {setHintUsed(true);gameActionFeedback('reveal',teachingScaffold.id,ageGroup);} persist(response, { showHint: open, hintUsed: hintUsed || open }); }}><Lightbulb size={16}/>{showHint ? 'Hide hint' : 'A little help'}</button><button type="button" className="structured-text-button" onClick={restart}><RotateCcw size={15}/>Start over</button></div>
    {showHint && <div className="structured-hint"><Lightbulb size={18}/><p>{activity.hint}</p></div>}
    <details className="structured-evidence" open={evidenceOpen} onToggle={event => { const open = event.currentTarget.open; setEvidenceOpen(open); if (open) setHintUsed(true); persist(response, { evidenceOpen: open, hintUsed: hintUsed || open }); }}><summary><BookOpen size={16}/>Explore the source material</summary>{activity.sourceRefs.map((reference, index) => <div key={index}><strong>{sources.find(source => source.id === reference.sourceId)?.title ?? reference.sourceId}{reference.locator ? ` · ${reference.locator}` : ''}</strong><blockquote>{reference.evidence}</blockquote>{referencedFigure?.id === reference.sourceId && activity.kind !== 'diagram' && <figure className="structured-reference-figure"><img src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}`}/><figcaption>{referencedFigure.title}</figcaption></figure>}</div>)}<LearningFigures notebook={{sources,artwork}} activity={activity}/></details>
    </div>
    {saveError && <p className="structured-save-error" role="alert">{saveError}</p>}
    {result && <div className={`structured-feedback ${result.outcome}`} role="status"><ReactionEffects artDirection={missionPresentation?.audioDirection} theme={theme} activityKind={activity.kind} outcome={result.correct===true||result.outcome==='self-reviewed'||practice?.correct?'success':'retry'} scaffoldId={teachingScaffold.id} ageGroup={ageGroup} eventKey={reactionEvent}/><div>{result.correct||practice?.correct ? <CheckCircle2 size={23}/> : <CircleHelp size={23}/>}<strong>{result.outcome === 'draft-preview' ? practice?.correct?'Mission rules satisfied':practice?'Keep experimenting':'Practice feedback' : result.outcome === 'correct' ? 'Your work holds together.' : result.outcome === 'self-reviewed' ? 'A useful reflection.' : result.outcome === 'invalid' ? 'A little more to complete.' : 'You have something to build on.'}</strong></div><p>{practice?practice.feedback:result.feedback}</p>{practice&&<p className="model-practice-score"><strong>{practice.score} / {practice.maxScore}</strong> practice checks satisfied <small>Based on this game’s model · no mastery or competition credit</small></p>}{result.details.length > 0 && <ul tabIndex={0} aria-label="Evaluation details">{result.details.map(detail => <li key={detail.id} className={detail.correct === true ? 'passed' : detail.correct === false ? 'revisit' : ''}>{detail.correct === true ? <Check size={15}/> : <span className="structured-feedback-dot"/>}<span>{detail.message}</span></li>)}</ul>}</div>}
    <footer className="structured-board-footer"><span role={savingResult ? 'status' : undefined}>{savingResult ? 'Saving your result…' : practice?`${practice.score} of ${practice.maxScore} practice checks satisfied`:result?.valid && result.correct !== null ? `${result.score} of ${result.maxScore} checks satisfied` : 'Saved as you explore'}</span><button type="button" className="structured-primary" onClick={() => void check()} disabled={savingResult || result?.correct === true}><CheckCircle2 size={18}/>{savingResult ? 'Saving result…' : saveError && onRetrySave ? 'Retry saving result' : result?.correct ? 'Challenge complete' : activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Save my reflection' : 'Check my work'}</button></footer>
    <p className="nimeshbuilds-credit">Crafted by <a href="https://github.com/NimeshBuilds" target="_blank" rel="noreferrer">NimeshBuilds</a></p>
    {companion}
  </section>;
}
