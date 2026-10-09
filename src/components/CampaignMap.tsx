import {useMemo,useState} from 'react';
import {ArrowRight,BookOpen,Check,Compass,Layers,Route,Sparkles} from 'lucide-react';
import type {Notebook,Progress} from '../types';
import type {Scaffold} from '../data/scaffolds';
import {scaffoldById} from '../data/scaffolds';
import {resolveScaffoldRuntime} from '../lib/scaffoldRuntime';
import {chapterProgress,expeditionInvitation,type CampaignChapter,type LearningCampaign} from '../lib/campaign';
import {ACTIVITY_KIND_LABELS} from './StructuredBoard';
import {currentAILearningMission} from '../lib/aiLearningPlan';
import {activityExplored} from '../lib/campaign';
import './campaign.css';

interface Props {notebook:Notebook;progress:Progress;campaign:LearningCampaign;onStudy:(chapter:CampaignChapter)=>void;onRecall:(chapter?:CampaignChapter)=>void;onActivity:(id:string,fresh?:boolean)=>void;onScaffold:(scaffold:Scaffold)=>void}
export default function CampaignMap({notebook,progress,campaign,onStudy,onRecall,onActivity,onScaffold}:Props){
  const [visible,setVisible]=useState(8),[filter,setFilter]=useState(''),[library,setLibrary]=useState(false);
  const chapters=campaign.chapters.filter(c=>!filter||c.unit.sourceId===filter);
  const invitation=expeditionInvitation(notebook,campaign,progress);
  const explored=campaign.chapters.filter(c=>chapterProgress(c,progress).explored).length;
  const activities=new Map((notebook.activities??[]).map(a=>[a.id,a]));
  const sourceActivityIds=new Set([...campaign.chapters.flatMap(chapter=>chapter.activityIds),...campaign.unboundActivityIds]);
  const lessons=useMemo(()=>[...new Set([...campaign.chapters.flatMap(chapter=>chapter.activityIds),...campaign.unboundActivityIds])].flatMap(id=>{const activity=notebook.activities?.find(a=>a.id===id),teaching=activity?currentAILearningMission(notebook,activity):undefined;return activity&&teaching?[{activity,teaching,chapter:campaign.chapters.find(c=>c.activityIds.includes(id))}]:[];}),[notebook,campaign]);
  const lessonView=lessons.length>0&&!library;
  const shownLessons=lessons.filter(({activity})=>!filter||activity.sourceRefs.some(ref=>ref.sourceId===filter));
  const finishedLessons=lessons.filter(({activity})=>progress.structured?.[activity.id]?.completed||activityExplored(progress,activity.id)).length;
  const availableModes=notebook.scaffoldIds.map(scaffoldById).filter((s):s is Scaffold=>!!s&&resolveScaffoldRuntime(s.id,notebook).available);
  const activityButton=(id:string)=>{const a=activities.get(id);if(!a)return null;return <button key={id} data-activity-id={id} className={`campaign-task ${progress.structured?.[id]?.completed?'completed':''}`} onClick={()=>onActivity(id)}><span className="campaign-task-icon">{progress.structured?.[id]?.completed?<Check size={17}/>:<Layers size={17}/>}</span><span><strong>{a.title}</strong><small>{ACTIVITY_KIND_LABELS[a.kind]}{a.reviewStatus==='needs-review'?' · Practice draft':''}</small></span><ArrowRight size={16}/></button>};
  return <section className="campaign-map" aria-label="Learning expedition">
    <div className="campaign-intro"><div className="campaign-emblem"><Compass size={29}/></div><div><span className="eyebrow">YOUR LEARNING EXPEDITION</span><h2>Understand it. Try it. Make it yours.</h2><p>{lessons.length?'Learn a clear idea, practise it, then put it to work in a quest. Your lessons and progress are ready whenever you return.':'Follow a topic from your material into a hands-on mission. Choose where to explore; your discoveries stay in your field guide.'}</p></div></div>
    {invitation&&<section className="campaign-invitation" aria-label="Your next expedition"><div><span className="eyebrow">YOUR NEXT EXPEDITION</span><h3>{invitation.title}</h3><p>{invitation.reason}</p></div><button onClick={()=>{if(invitation.kind==='activity')onActivity(invitation.activityId,invitation.fresh);else if(invitation.kind==='recall')onRecall(invitation.chapter);else onStudy(invitation.chapter);}}>{invitation.label}<ArrowRight size={18}/></button></section>}
    <div className="campaign-summary">{lessons.length?<><span><Route size={16}/>{lessons.length} prepared {lessons.length===1?'lesson':'lessons'}</span><span><Check size={16}/>{finishedLessons} quests explored</span><span><BookOpen size={16}/>{notebook.sources.filter(source=>campaign.chapters.some(c=>c.unit.sourceId===source.id)).length} original materials</span></>:<><span><Route size={16}/>{campaign.chapters.length} source chapters</span><span><BookOpen size={16}/>{explored} field notes collected</span><span><Layers size={16}/>{sourceActivityIds.size} source-linked models</span></>}</div>
    {lessons.length>0&&<div className="campaign-view-switch" role="group" aria-label="Choose lessons or original material"><button type="button" aria-pressed={lessonView} onClick={()=>{setLibrary(false);setVisible(8);}}>Lessons &amp; quests <span>{lessons.length}</span></button><button type="button" aria-pressed={!lessonView} onClick={()=>{setLibrary(true);setVisible(8);}}>Source library</button></div>}
    {lessons.length>0&&library&&<p className="campaign-library-note">Original passages and your field notes are here when you want more context. These are reference sections, not additional required lessons.</p>}
    {notebook.sources.length>1&&<label className="campaign-filter">Explore a source<select value={filter} onChange={e=>{setFilter(e.target.value);setVisible(8);}}><option value="">All your materials</option>{notebook.sources.filter(s=>campaign.chapters.some(c=>c.unit.sourceId===s.id)).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
    {lessonView?<><div className="campaign-chapters campaign-lessons">{shownLessons.slice(0,visible).map(({activity,teaching,chapter},index)=>{const finished=progress.structured?.[activity.id]?.completed||activityExplored(progress,activity.id),started=!!progress.structured?.[activity.id]?.response;return <article key={activity.id} className={`campaign-chapter campaign-lesson ${finished?'explored':''}`} data-activity-id={activity.id}>
      <div className="campaign-chapter-line"><span className="campaign-chapter-number">{finished?<Check size={18}/>:String(index+1).padStart(2,'0')}</span><span className="eyebrow">LESSON {index+1}</span><span className="campaign-kind">{ACTIVITY_KIND_LABELS[activity.kind]}</span></div>
      <h3>{teaching.title}</h3><p className="campaign-lesson-objective">{teaching.objective}</p><p className="campaign-preview">{teaching.conceptExplanation.text}</p>
      <button className="campaign-explore" onClick={()=>onActivity(activity.id)}><BookOpen size={17}/>{finished?'Revisit this mission':started?'Continue this mission':'Learn & play this mission'}<ArrowRight size={17}/></button>
      {chapter&&<button className="text-button campaign-source-link" onClick={()=>onStudy(chapter)}>Open original passages &amp; notes</button>}
      <p className="campaign-reading-note">{finished?'Your quest progress is saved. Revisit the explanation or practise again.':'Learn the ideas → guided practice → your quest'}</p>
    </article>;})}</div>{shownLessons.length>visible&&<button className="button secondary full" onClick={()=>setVisible(v=>v+8)}>Show the next {Math.min(8,shownLessons.length-visible)} lessons <ArrowRight size={16}/></button>}</>:<><div className="campaign-chapters">{chapters.slice(0,visible).map((chapter,index)=>{const status=chapterProgress(chapter,progress);return <article key={chapter.id} className={`campaign-chapter ${status.explored?'explored':''}`}>
      <div className="campaign-chapter-line"><span className="campaign-chapter-number">{status.explored?<Check size={18}/>:String(index+1).padStart(2,'0')}</span><span className="eyebrow">{chapter.sourceTitle}</span><span className="campaign-kind">{chapter.unit.kind==='concept'?'Connect ideas':chapter.unit.kind==='procedure'?'Trace a process':chapter.unit.kind==='reference'?'Inspect a model':'Explore & explain'}</span></div>
      <h3>{chapter.teaching?.title??chapter.title}</h3><p className="campaign-preview">{chapter.teaching?.introduction??`${chapter.unit.quote.replace(/\s+/g,' ').slice(0,200)}${chapter.unit.quote.length>200?'…':''}`}</p>
      <button className="campaign-explore" onClick={()=>chapter.teaching?onActivity(chapter.teaching.activityId):onStudy(chapter)}><BookOpen size={17}/>{chapter.teaching?'Learn & play this mission':status.explored?'Open your field note':'Explore this chapter'}<ArrowRight size={17}/></button>
      {chapter.teaching&&<button className="text-button campaign-source-link" onClick={()=>onStudy(chapter)}>Read the original source & your notes</button>}
      {(chapter.activityIds.length>0||chapter.cardIds.length>0)&&<div className="campaign-tasks" aria-label={`Missions for ${chapter.title}`}>{chapter.activityIds.map(activityButton)}{chapter.cardIds.length>0&&<button className="campaign-task" onClick={()=>onRecall(chapter)}><span className="campaign-task-icon"><Sparkles size={17}/></span><span><strong>Retrieve the key ideas</strong><small>{status.practiced}/{chapter.cardIds.length} practiced · {status.independent} independently recalled</small></span><ArrowRight size={16}/></button>}</div>}
      {!status.hasPractice&&<p className="campaign-reading-note">Capture an observation and a question from this material. This chapter builds your field guide without a guessed answer key.</p>}
    </article>})}</div>
    {chapters.length>visible&&<button className="button secondary full" onClick={()=>setVisible(v=>v+8)}>Explore the next {Math.min(8,chapters.length-visible)} chapters <ArrowRight size={16}/></button>}
    {(campaign.unboundActivityIds.length>0||campaign.unboundCardIds.length>0)&&<div className="campaign-extra"><h3>Across your sources</h3><p>These missions combine material or use a separately authored model.</p>{campaign.unboundActivityIds.map(activityButton)}{campaign.unboundCardIds.length>0&&<button className="campaign-task" onClick={()=>onRecall()}><BookOpen size={17}/><span><strong>Recall expedition</strong><small>Practice the notebook's prepared questions</small></span><ArrowRight size={16}/></button>}</div>}
    </>}
    {availableModes.length>0&&<details className="campaign-modes"><summary>Choose a game mode <span>{availableModes.length} ready</span></summary><div>{availableModes.map(s=><button className="campaign-task" key={s.id} onClick={()=>onScaffold(s)}><span>{s.icon}</span><span><strong>{s.name}</strong><small>{s.tagline}</small></span><ArrowRight size={16}/></button>)}</div></details>}
    {!chapters.length&&!sourceActivityIds.size&&!campaign.unboundCardIds.length&&<p className="empty-state">{notebook.activities?.length||notebook.cards.length?'These activities need current source evidence. Open the Studio to review their materials.':'Add readable material to begin your expedition.'}</p>}
  </section>;
}
