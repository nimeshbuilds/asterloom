import { initialActivityResponse as restoredResponse } from '../lib/activityResponse';
import RecallBoard from './RecallBoard';
import { initialRecallResponse } from '../lib/recallEngine';
import type {AsterLearningState} from '../lib/asterAwareness';
import AsterGuide from './AsterGuide';
import {questDirections} from './questDirections';
import SourceMaterials from './SourceMaterials';
import {designedMission} from '../lib/gameDesign';
import {modelPracticeFeedback,modelPracticeReflection} from '../lib/modelPractice';
import SequenceWorkshop from './SequenceWorkshop';
import BudgetBoard from './BudgetBoard';
import ClassificationBoard from './ClassificationBoard';
import DependencyBoard from './DependencyBoard';
import '../learning-journey.css';
import MissionArena from './MissionArena';
import type {SceneFeedbackEvent} from '../lib/sceneFeedback';
import {getAgePresentation,WORLD_PALETTES,defaultWorldIdForKind} from '../data/worlds';
import {activityScene,sceneActions,applySceneAction} from '../lib/worldScene';
import PictureBuildBoard from './PictureBuildBoard';
import { initialPictureBuildResponse } from '../lib/pictureBuildEngine';
import ChildPlayBoard from './ChildPlayBoard';
import { initialChildPlayResponse } from '../lib/childPlayEngine';
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, GripVertical, Lightbulb, RotateCcw } from 'lucide-react';
import { evaluateActivity, validateActivity } from '../lib/structuredEngine';
import type { ActivityResponse, Evaluation, StructuredActivity } from '../lib/structuredEngine';
import type { Notebook, NotebookArtwork, Progress, Source } from '../types';
import {createNotebook} from '../lib/utils';
import {scaffoldById} from '../data/scaffolds';
import LearningBriefing from './LearningBriefing';
import ReactionEffects from './ReactionEffects';
import {buildLearningBriefing,initialLessonState,restartLesson,lessonReady,lessonRequiresWalkthrough,lessonAllowsGuidedStart,lessonQuestSupport,type LessonState} from '../lib/learningBriefing';
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
import {revealGameMoment} from '../lib/gameViewport';

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
  recall: 'Open the source locks', sequence: 'Rebuild the sequence', classification: 'Sort the evidence', decision: 'Make the decision',
  dependency: 'Connect the system', budget: 'Balance the resources', rubric: 'Review with a purpose', diagram: 'Complete the model',
  completion: 'Complete the worked model', data: 'Investigate the observations', media: 'Explore the recording',
  scenario: 'Investigate and act', construction: 'Build, test and revise', explanation: 'Connect the reasoning',
  picture: 'Discover through pictures',
  'rule-switch': 'Adapt to a new rule', 'child-play': 'Bring the source story to life', 'picture-build': 'Build a picture and tell its story',
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

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
  const [briefingAwareness,setBriefingAwareness]=useState<{planId:string;state:AsterLearningState}>();
  const awarenessPlan=useRef(lessonPlan.id);awarenessPlan.current=lessonPlan.id;
  const reportBriefingAwareness=useCallback((planId:string,state:AsterLearningState|null)=>setBriefingAwareness(previous=>{
    if(!state)return previous?.planId===planId?undefined:previous;
    if(planId!==awarenessPlan.current)return previous;
    return previous?.planId===planId&&JSON.stringify(previous.state)===JSON.stringify(state)?previous:{planId,state};
  }),[]);
  const [lesson,setLesson] = useState(() => initialLessonState(lessonPlan,initialDraft.lesson));
  const lessonUnlocked = lessonReady(lessonPlan,lesson);
  const [reactionEvent,setReactionEvent] = useState(0);
  const [actionVisual,setActionVisual] = useState<SceneFeedbackEvent>();
  const [detailedWorkspaceOpen,setDetailedWorkspaceOpen] = useState(false);
  const [feedbackEvent,setFeedbackEvent] = useState(0);
  const questHeading = useRef<HTMLHeadingElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const previousUnlocked = useRef(false);
  useLayoutEffect(() => {
    if (lessonUnlocked && !previousUnlocked.current) revealGameMoment(questHeading.current);
    previousUnlocked.current = lessonUnlocked;
  }, [lessonUnlocked]);
  useLayoutEffect(() => { if (feedbackEvent > 0) revealGameMoment(resultPanel.current); }, [feedbackEvent]);
  useEffect(() => {setLesson(initialLessonState(lessonPlan,object(object(savedResponse)._draft).lesson));},[lessonPlan.id]);
  useEffect(() => {if(lessonUnlocked)setLearningMusicPhase('quest');return()=>setLearningMusicPhase('intro');},[lessonUnlocked]);

  const [result, setResult] = useState<Evaluation | null>(() => initialDraft.checked === true ? evaluateActivity(activity, restoredResponse(activity, savedResponse)) : null);
  const practice=result?modelPracticeFeedback(activity,response):undefined;
  const reflected=!!result&&(result.outcome==='self-reviewed'||modelPracticeReflection(activity,response));
  const [showHint, setShowHint] = useState(initialDraft.showHint === true);
  const [hintUsed, setHintUsed] = useState(initialDraft.hintUsed === true);
  const asterAssisted=useRef(initialDraft.hintUsed===true);
  // Help read after checking belongs to the next revision, not the saved result.
  const postResultAssistance=useRef(initialDraft.postResultAssistance===true);
  const [evidenceOpen, setEvidenceOpen] = useState(initialDraft.evidenceOpen === true);
  const [announcement, setAnnouncement] = useState('');
  const [savingResult, setSavingResult] = useState(false);
  const [saveError, setSaveError] = useState('');
  const checkRevision = useRef(0);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;checkRevision.current+=1;checkInFlight.current=false;};},[]);
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
    setReactionEvent(0); setActionVisual(undefined);
    const draft = object(object(savedResponse)._draft), restored = restoredResponse(activity, savedResponse);
    currentResponse.current = restored; asterAssisted.current = draft.hintUsed === true; postResultAssistance.current = draft.postResultAssistance === true;
    setResponse(restored); setResult(draft.checked === true ? evaluateActivity(activity, restored) : null); setShowHint(draft.showHint === true); setHintUsed(draft.hintUsed === true); setEvidenceOpen(draft.evidenceOpen === true);
    setEdgeFrom(typeof draft.edgeFrom === 'string' ? draft.edgeFrom : ''); setEdgeTo(typeof draft.edgeTo === 'string' ? draft.edgeTo : ''); setEdgeRelation(typeof draft.edgeRelation === 'string' ? draft.edgeRelation : ''); setSelectedLabel(typeof draft.selectedLabel === 'string' ? draft.selectedLabel : ''); setPrecisionOpen(draft.precisionOpen === true); setCaregiverPanelOpen(draft.caregiverPanelOpen === true); setWorldSelection(typeof draft.worldSelection === 'string' ? draft.worldSelection : ''); setAnnouncement('');
  }, [fingerprint]);
  function persistedResponse(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    return { ...next, _draft: { lesson, edgeFrom, edgeTo, edgeRelation, selectedLabel, showHint, hintUsed:hintUsed||asterAssisted.current, ...(postResultAssistance.current?{postResultAssistance:true}:{}), evidenceOpen, checked: Boolean(result), worldSelection, precisionOpen, caregiverPanelOpen, ...draft } };
  }
  function persist(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    if(failedCheck.current&&!checkInFlight.current)return Promise.resolve(false);
    failedCheck.current = null; setSaveError('');
    return onSave(persistedResponse(next, draft));
  }
  function change(next: ActivityResponse, draft: Record<string, unknown> = {}) {
    if (checkInFlight.current||failedCheck.current) return;
    const cue=activityActionCue(currentResponse.current,next);
    currentResponse.current = next;
    gameActionFeedback(cue,teachingScaffold.id,ageGroup);
    if(cue)setActionVisual(previous=>({event:(previous?.event??0)+1,kind:cue}));
    const supported = ('revealedIds' in next && next.revealedIds.length > 0) || asterAssisted.current || hintUsed || postResultAssistance.current || ('caregiverSupport' in next && next.caregiverSupport === true) || ('sourceConsulted' in next && next.sourceConsulted === true);
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
    const evaluation = { ...assessed, hintUsed: asterAssisted.current || hintUsed || postResultAssistance.current || assessed.hintUsed === true || lessonQuestSupport(lessonPlan,lesson).assisted };
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
      failedCheck.current = null; setResult(evaluation); setFeedbackEvent(value=>value+1);
      const practice=modelPracticeFeedback(activity,checkedResponse),reflected=modelPracticeReflection(activity,checkedResponse);
      if(evaluation.valid||practice||reflected){setReactionEvent(value=>value+1);musicFeedback(evaluation.correct===true||evaluation.outcome==='self-reviewed'||practice?.correct||reflected?'complete':'try-again',teachingScaffold.id,ageGroup);}else setReactionEvent(0);
    } catch {
      if (revision === checkRevision.current) { failedCheck.current = evaluation; setSaveError('Your result has not been saved yet. Keep this page open and try saving it again.'); }
    } finally {
      if (revision === checkRevision.current) { checkInFlight.current = false; setSavingResult(false); }
    }
  }
  async function saveLesson(next:LessonState):Promise<boolean> {
    if(checkInFlight.current||failedCheck.current)return false;
    try {
      const saved=await onSave(persistedResponse(response,{lesson:next,checked:false}));
      if(saved===false||!mounted.current)return false;
      gameActionFeedback(lessonActionCue(lesson,next),teachingScaffold.id,ageGroup);
      setLesson(next);setResult(null);return true;
    } catch {return false;}
  }
  function restart() { if(checkInFlight.current||failedCheck.current)return;setShowHint(false); setSelectedLabel(''); setEdgeFrom(''); setEdgeTo(''); setEdgeRelation(''); change(restoredResponse(activity), { showHint: false, hintUsed, selectedLabel: '', edgeFrom: '', edgeTo: '', edgeRelation: '' }); setAnnouncement('A fresh attempt is ready.'); }
  if (!validation.success) return <div className="structured-notice warning" role="alert"><strong>This activity needs an author’s attention.</strong><p>{validation.errors.slice(0, 3).join(' ')}</p></div>;
  const sourceAssistance=async()=>{
    if(checkInFlight.current||failedCheck.current||assistanceInFlight.current)return false;
    assistanceInFlight.current=true;
    if(result)postResultAssistance.current=true;
    else{asterAssisted.current=true;setHintUsed(true);}
    try{return await persist(currentResponse.current,{hintUsed:result?hintUsed||asterAssisted.current:true})!==false;}
    catch{return false;}finally{assistanceInFlight.current=false;}
  };
  const directions=questDirections(activity,lessonPlan.teaching?.objective);
  const questControls=savingResult?[]:saveError?[onRetrySave?'Retry saving result':'Check my work']:['Revisit the lesson',...((activity.kind==='sequence'||activity.kind==='classification')&&activity.items.length<=24?sceneActions(activity,response,worldSelection).filter(action=>!action.disabled).map(action=>action.label):activity.kind==='dependency'&&edgeFrom&&edgeTo&&edgeRelation?['Connect concepts']:[]),...(result?.correct||practice?.correct||reflected?[]:[activity.kind==='rubric'&&activity.mode==='self-assessment'?'Save my reflection':'Check my work']),showHint?'Hide hint':'A little help','Start over','Explore the source material'];
  const companion=<AsterGuide notebook={teachingNotebook} progress={progress} learningState={{title:activity.title,goal:lessonPlan.teaching?.objective??lessonPlan.mission.assignment,controls:lessonUnlocked?questControls:[],phase:savingResult?'saving':!lessonUnlocked?'lesson':result?'feedback':'answering',sourceId:activity.sourceRefs[0]?.sourceId,supported:asterAssisted.current||hintUsed||lessonQuestSupport(lessonPlan,lesson).assisted,saveFailed:!!saveError,lessonStage:lesson.stage,lessonStep:lesson.walkthroughStep+1,lessonSteps:lessonPlan.walkthrough.steps.length,nextAction:saveError?onRetrySave?'Keep this page open and choose Retry saving result.':'Keep this page open and choose Check my work to retry saving the result.':!lessonUnlocked?lesson.stage==='mission'?'Read the mission and accept it to begin the lesson.':lesson.stage==='context'?lessonRequiresWalkthrough(lessonPlan)?'Read the source context and continue to the walkthrough.':'Read the ideas, then choose Try it in practice.':lesson.stage==='walkthrough'?'Follow the next walkthrough step, then continue to practice.':lessonAllowsGuidedStart(lessonPlan)?'Choose Start guided quest to save your preparation and try a move in the game.':'Prepare your explanation and compare it with the source before entering the challenge.':result?.correct||practice?.correct||reflected?'Return to the game world and choose another mission.':result?'Read the saved feedback, revise your work, then choose Check my work.':`${directions.action} ${activity.kind==='rubric'&&activity.mode==='self-assessment'?'Choose Save my reflection when ready.':'Choose Check my work when ready.'}`,...(!lessonUnlocked&&briefingAwareness?.planId===lessonPlan.id?briefingAwareness.state:{})}} mode={lessonUnlocked?'play':'study'} activityId={activity.id} expressions={missionPresentation?.asterDirection} onAssistance={sourceAssistance} feedback={result&&reactionEvent>0&&!reflected?{outcome:result.correct===true||result.outcome==='self-reviewed'||practice?.correct?'success':'retry',eventKey:`${activity.id}-${reactionEvent}`,committed:true,...((practice?.maxScore??result.maxScore)>0?{score:{value:practice?.score??result.score,max:practice?.maxScore??result.maxScore}}:{})}:undefined}/>;
  const materials=<div className="structured-materials-toolbar"><SourceMaterials notebook={teachingNotebook} beforeDownload={sourceAssistance} disabled={savingResult||!!saveError}/></div>;
  if (!lessonUnlocked) return <>{materials}<LearningBriefing plan={lessonPlan} onAwareness={reportBriefingAwareness} saved={lesson} onSave={saveLesson} onReady={()=>{}}/>{companion}</>;
  const referencedFigure = sources.find(source => source.kind === 'image' && typeof source.dataUrl === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source.dataUrl) && activity.sourceRefs.some(reference => reference.sourceId === source.id));
  const hints = practice?.details ?? result?.details ?? [];
  const detailClass = (id: string) => result?.valid ? hints.find(detail => detail.id === id)?.correct === true ? ' is-correct' : hints.find(detail => detail.id === id)?.correct === false ? ' needs-revision' : '' : '';
  const presentation = getAgePresentation(ageGroup);
  const scene = activityScene(activity, response);
  const palette = WORLD_PALETTES[theme] ?? WORLD_PALETTES.islands;
  const arenaPrimary=(activity.kind==='sequence'||activity.kind==='classification')&&activity.items.length<=24;
  const workControls=<>
    {activity.kind === 'recall' && 'revealedIds' in response && <RecallBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'completion' && 'slotTokens' in response && <CompletionBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'data' && 'evidenceRows' in response && <DataBoard activity={activity} response={response} onChange={change}/>}
    {activity.kind === 'media' && 'activeCheckpointId' in response && <MediaBoard activity={activity} response={response} sources={sources} onChange={change}/>}
    {activity.kind === 'scenario' && 'actions' in response && <ScenarioBoard activity={activity} response={response} onChange={change}/>}
    {(activity.kind === 'construction' || activity.kind === 'explanation') && ('instances' in response || 'arguments' in response) && <CompositionBoard activity={activity} response={response} onChange={change} ageGroup={ageGroup}/>}
    {activity.kind === 'picture-build' && 'parts' in response && <PictureBuildBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} precisionOpen={precisionOpen} onPrecisionChange={open=>{setPrecisionOpen(open);persist(response,{precisionOpen:open});}}/>}
    {activity.kind === 'child-play' && 'actionIds' in response && <ChildPlayBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} caregiverOpen={caregiverPanelOpen} onCaregiverToggle={open=>{setCaregiverPanelOpen(open);persist(response,{caregiverPanelOpen:open});}}/>}
    {activity.kind === 'picture' && 'exploredTokenIds' in response && <PictureBoard activity={activity} response={response} sources={sources} onChange={change} ageGroup={ageGroup} caregiverOpen={caregiverPanelOpen} onCaregiverToggle={open=>{setCaregiverPanelOpen(open);persist(response,{caregiverPanelOpen:open});}}/>}
    {activity.kind === 'rule-switch' && 'firstCommitted' in response && <RuleSwitchBoard activity={activity} response={response} onChange={change}/>}

    {activity.kind === 'sequence' && 'order' in response && <SequenceWorkshop paused={savingResult||arenaPrimary&&!detailedWorkspaceOpen} activity={activity} order={response.order} onChange={change} scaffoldId={teachingScaffold.id} theme={theme} ageGroup={ageGroup}/>}

    {activity.kind === 'classification' && 'assignments' in response && !('firstCommitted' in response) && <ClassificationBoard activity={activity} response={response} selectedItemId={worldSelection} onSelect={id=>{if(worldSelection!==id)gameActionFeedback('select',teachingScaffold.id,ageGroup);setWorldSelection(id);persist(response,{worldSelection:id});}} onChange={change}/>}

    {activity.kind === 'decision' && 'choiceId' in response && <div className="structured-decision"><div className="structured-case"><span className="structured-kicker">The situation</span><dl>{Object.entries(activity.context).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value === null ? 'Not supplied' : String(value)}</dd></div>)}</dl></div><fieldset className="structured-decisions"><legend>What should happen next?</legend>{activity.choices.map((choice, index) => <label key={choice.id} className={`structured-answer${response.choiceId === choice.id ? ' selected' : ''}`}><input type="radio" name={`${prefix}-decision`} checked={response.choiceId === choice.id} onChange={() => change({ choiceId: choice.id })}/><span className="structured-answer-letter">{String.fromCharCode(65 + index)}</span><span>{choice.label}</span><ArrowRight size={17}/></label>)}</fieldset></div>}

    {activity.kind === 'dependency' && 'edges' in response && !('instances' in response) && <DependencyBoard activity={activity} response={response} draft={{from:edgeFrom,to:edgeTo,relation:edgeRelation}} onDraftChange={draft=>{setEdgeFrom(draft.from);setEdgeTo(draft.to);setEdgeRelation(draft.relation);persist(response,{edgeFrom:draft.from,edgeTo:draft.to,edgeRelation:draft.relation});}} onChange={change}/>}

    {activity.kind === 'budget' && 'quantities' in response && <BudgetBoard activity={activity} response={response} onChange={change} theme={theme} ageGroup={ageGroup}/>}

    {activity.kind === 'rubric' && 'ratings' in response && <div className="structured-rubric"><div className="structured-work-sample"><span className="structured-kicker">{activity.mode === 'self-assessment' ? 'Your reflection prompt' : 'Work to review'}</span><blockquote>{activity.sample}</blockquote></div>{activity.mode === 'self-assessment' && <p className="structured-helper">Use these criteria to reflect. Your choices are saved without an automatic correctness grade.</p>}{activity.criteria.map(criterion => <fieldset key={criterion.id} className={`structured-criterion${detailClass(criterion.id)}`}><legend>{criterion.label}</legend><div>{criterion.levels.map((level, index) => <label key={index} className={response.ratings[criterion.id] === index ? 'selected' : ''}><input type="radio" name={`${prefix}-${criterion.id}`} checked={response.ratings[criterion.id] === index} onChange={() => change({ ratings: { ...response.ratings, [criterion.id]: index } })}/><span className="structured-level">{index + 1}</span><span>{level}</span></label>)}</div></fieldset>)}</div>}

    {activity.kind === 'diagram' && 'placements' in response && <div className="structured-diagram"><p className="structured-helper">Choose a label, then select its place in the model. You can also drag a label onto a target.</p><div className="structured-label-bank" aria-label="Labels to place">{activity.labels.map(label => <button type="button" key={label.id} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', label.id); event.dataTransfer.effectAllowed = 'move'; setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} onClick={() => { setSelectedLabel(label.id); persist(response, { selectedLabel: label.id }); }} aria-pressed={selectedLabel === label.id} className={`${selectedLabel === label.id ? 'selected' : ''}${response.placements[label.id] ? ' placed' : ''}`}><GripVertical size={14}/>{label.label}{response.placements[label.id] && <Check size={13}/>}</button>)}</div><div className={`structured-diagram-canvas${referencedFigure ? ' has-source-image' : ''}`} aria-label="Model target locations">{referencedFigure && <img className="structured-source-image" src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}. Labeled target descriptions are available in the text placement controls.`}/>}{activity.targets.map((target, index) => { const placed = activity.labels.find(label => response.placements[label.id] === target.id); const place = (labelId: string) => { if (!activity.labels.some(label => label.id === labelId)) return; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, value]) => [id, id === labelId ? target.id : value === target.id ? '' : value])); change({ placements }, { selectedLabel: '' }); setSelectedLabel(''); setAnnouncement(`${activity.labels.find(label => label.id === labelId)?.label} placed at ${target.label}.`); }; return <button type="button" key={target.id} className={`structured-target-dot${placed ? ' filled' : ''}${selectedLabel ? ' ready' : ''}`} aria-label={`Place selected label at ${target.label}${placed ? `; currently ${placed.label}` : ''}`} style={{ left: `${Math.max(12, Math.min(88, target.x))}%`, top: `${Math.max(18, Math.min(82, target.y))}%` }} onClick={() => { if (selectedLabel) place(selectedLabel); else setAnnouncement('Choose a label from the bank first.'); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); place(event.dataTransfer.getData('text/plain')); }}><span>{index + 1}</span><strong>{placed?.label ?? 'Place here'}</strong><small>{target.label}</small></button>; })}</div>{referencedFigure && <p className="structured-image-caption">Source figure · {referencedFigure.title}</p>}<details className="structured-text-alternative"><summary>Use the text placement controls</summary><div className="structured-placement-list">{activity.labels.map(label => <label className={`structured-placement${detailClass(label.id)}`} key={label.id}><span>{label.label}</span><select aria-label={`Place ${label.label}`} value={response.placements[label.id] ?? ''} onChange={event => { const targetId = event.target.value; const placements = Object.fromEntries(Object.entries(response.placements).map(([id, target]) => [id, id === label.id ? targetId : targetId && target === targetId ? '' : target])); change({ placements }); }}><option value="">Choose a target</option>{activity.targets.map((target, index) => <option value={target.id} key={target.id}>{index + 1}. {target.label}</option>)}</select></label>)}</div></details></div>}

  </>;
  return <section className={`structured-board board-${activity.kind} presentation-${presentation.density}${arenaPrimary?' board-arena-primary':''}`} data-age={presentation.id} data-theme={theme} aria-busy={savingResult} aria-label={activity.title} style={{'--world-ink':palette.ink,'--world-accent':palette.accent,'--world-tint':palette.sky,'--world-paper':palette.paper} as CSSProperties}>
    {materials}
    <header className="structured-heading"><div><span className="structured-kicker">{ACTIVITY_KIND_LABELS[activity.kind]}</span><h2 ref={questHeading} tabIndex={-1}>{activity.title}</h2></div><span className="structured-badge">{activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Reflection' : 'Hands-on challenge'}</span></header>
    <div className="quest-learning-status"><BookOpen size={16}/><span>Lesson complete · {lessonQuestSupport(lessonPlan,lesson).assisted?'Apply what you just learned':'Independent retrieval'}</span><button type="button" disabled={savingResult||!!saveError} onClick={()=>void saveLesson(restartLesson(lessonPlan,lesson))}>Revisit the lesson</button></div>
    <section className="quest-directions" aria-label="Your goal and how to play"><div><h3>Your goal</h3><p className="structured-instruction">{directions.goal}</p>{directions.detail&&!directions.detailCollapsed&&<p className="quest-directions-detail">{directions.detail}</p>}</div><div><h3>How to play</h3><p>{directions.action}</p><small>{directions.finish&&`${directions.finish} `}{activity.kind==='rubric'&&activity.mode==='self-assessment'?'Choose Save my reflection when you are ready.':'Choose Check my work to see feedback and improve your next move.'}</small></div>{directions.detailCollapsed&&<details className="quest-saved-directions"><summary>Original task details</summary><small>Saved task wording. Use How to play above for the current controls.</small><p>{directions.detail}</p></details>}</section>
    {activity.reviewStatus === 'needs-review' && <details className="structured-rules-note"><summary>About practice scoring</summary><p>Practice follows this game’s generated rules. Their meaning has not been reviewed against the source. You can earn practice XP; mastery and competition credit need author review.</p></details>}
    <div className="sr-only" aria-live="polite">{announcement}</div>
    <div className="structured-workspace" inert={savingResult || !!saveError || undefined}>
    {activity.kind!=='construction'&&<MissionArena storySetting={lessonPlan.teaching?.storyFrame?.setting} actionFeedback={actionVisual} artDirection={missionPresentation?.audioDirection} activityKind={activity.kind} mode={arenaPrimary?'play':'backdrop'} key={activity.id} scaffoldId={teachingScaffold.id} theme={theme} ageGroup={ageGroup} snapshot={scene} selectedId={worldSelection} onSelect={id=>{if(worldSelection!==id)gameActionFeedback('select',teachingScaffold.id,ageGroup);setWorldSelection(id);persist(response,{worldSelection:id});}} actions={sceneActions(activity,response,worldSelection)} onAction={action=>change(applySceneAction(activity,response,action))} feedback={result?{event:reactionEvent,outcome:reflected||result.outcome==='self-reviewed'?'reflection':result.correct||practice?.correct?'complete':'retry'}:undefined}/>}

    {!arenaPrimary&&workControls}

    <div className="structured-tools"><button type="button" className="structured-text-button" aria-expanded={showHint} onClick={() => { const open = !showHint; setShowHint(open); if (open) {setHintUsed(true);gameActionFeedback('reveal',teachingScaffold.id,ageGroup);} persist(response, { showHint: open, hintUsed: hintUsed || open }); }}><Lightbulb size={16}/>{showHint ? 'Hide hint' : 'A little help'}</button><button type="button" className="structured-text-button" onClick={restart}><RotateCcw size={15}/>Start over</button></div>
    {showHint && <div className="structured-hint"><Lightbulb size={18}/><p>{activity.hint}</p></div>}
    <details className="structured-evidence" open={evidenceOpen} onToggle={event => { const open = event.currentTarget.open; setEvidenceOpen(open); if (open) setHintUsed(true); persist(response, { evidenceOpen: open, hintUsed: hintUsed || open }); }}><summary><BookOpen size={16}/>Explore the source material</summary>{activity.sourceRefs.map((reference, index) => <div key={index}><strong>{sources.find(source => source.id === reference.sourceId)?.title ?? reference.sourceId}{reference.locator ? ` · ${reference.locator}` : ''}</strong><blockquote>{reference.evidence}</blockquote>{referencedFigure?.id === reference.sourceId && activity.kind !== 'diagram' && <figure className="structured-reference-figure"><img src={referencedFigure.dataUrl} alt={`Source figure: ${referencedFigure.title}`}/><figcaption>{referencedFigure.title}</figcaption></figure>}</div>)}<LearningFigures notebook={{sources,artwork}} activity={activity}/></details>
    </div>
    {saveError && <p className="structured-save-error" role="alert">{saveError}</p>}
    {result && <div className={`structured-feedback ${result.outcome}`} data-response={result.correct||practice?.correct?'correct':reflected||result.outcome==='self-reviewed'?'reflection':'retry'} ref={resultPanel} tabIndex={-1} role="status"><ReactionEffects artDirection={missionPresentation?.audioDirection} theme={theme} activityKind={activity.kind} outcome={reflected||result.outcome==='self-reviewed'?'reflection':result.correct===true||practice?.correct?'complete':'retry'} scaffoldId={teachingScaffold.id} ageGroup={ageGroup} eventKey={reactionEvent} animate={reactionEvent>0}/><div>{result.correct||practice?.correct||reflected ? <CheckCircle2 size={23}/> : <CircleHelp size={23}/>}<strong>{reflected?'Your reflection is saved':result.outcome === 'draft-preview' ? practice?.correct?'Mission rules satisfied':practice?'Keep experimenting':'Practice feedback' : result.outcome === 'correct' ? 'Your work holds together.' : result.outcome === 'self-reviewed' ? 'A useful reflection.' : result.outcome === 'invalid' ? 'A little more to complete.' : 'You have something to build on.'}</strong></div><p>{reflected?'Your observation is saved. Compare it with the source and keep exploring; it is not automatically graded.':practice?practice.feedback:result.feedback}</p>{(result.correct===true||practice?.correct)&&lessonPlan.teaching&&<div className="mission-takeaway"><span>Take this with you</span><p>{lessonPlan.teaching.conceptExplanation.text}</p><details><summary>Source behind this idea</summary>{lessonPlan.teaching.conceptExplanation.citations.map((ref,i)=><blockquote key={i}>{ref.quote}<cite>{sources.find(source=>source.id===ref.sourceId)?.title} · {ref.locator.label}</cite></blockquote>)}</details></div>}{practice&&<p className="model-practice-score"><strong>{practice.score} / {practice.maxScore}</strong> practice checks satisfied <small>Based on this game’s model · no mastery or competition credit</small></p>}{hints.length > 0 && <ul tabIndex={0} aria-label="Evaluation details">{hints.map(detail => <li key={detail.id} className={detail.correct === true ? 'passed' : detail.correct === false ? 'revisit' : ''}>{detail.correct === true ? <Check size={15}/> : <span className="structured-feedback-dot"/>}<span>{detail.message}</span></li>)}</ul>}</div>}
    <footer className="structured-board-footer"><span role={savingResult ? 'status' : undefined}>{savingResult ? 'Saving your result…' : practice?`${practice.score} of ${practice.maxScore} practice checks satisfied`:result?.valid && result.correct !== null ? `${result.score} of ${result.maxScore} checks satisfied` : 'Saved as you explore'}</span><button type="button" className="structured-primary" onClick={() => void check()} disabled={savingResult || result?.correct === true || practice?.correct === true || reflected}><CheckCircle2 size={18}/>{savingResult ? 'Saving result…' : saveError && onRetrySave ? 'Retry saving result' : reflected?'Reflection saved':result?.correct||practice?.correct ? 'Challenge complete' : activity.kind === 'rubric' && activity.mode === 'self-assessment' ? 'Save my reflection' : 'Check my work'}</button></footer>
    {arenaPrimary&&<details className="arena-detailed-workspace" onToggle={event=>setDetailedWorkspaceOpen(event.currentTarget.open)} inert={savingResult||!!saveError||undefined}><summary>Detailed workspace <span>{activity.kind==='sequence'?'Drag, reorder and replay your route':'Sort with the category workbench'}</span></summary>{workControls}</details>}
    <p className="nimeshbuilds-credit">Crafted by <a href="https://github.com/NimeshBuilds" target="_blank" rel="noreferrer">NimeshBuilds</a></p>
    {companion}
  </section>;
}
