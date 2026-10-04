import {useState} from 'react';
import {ArrowRight,BookOpen,Check,Compass,Layers,Route,Sparkles} from 'lucide-react';
import type {Notebook,Progress} from '../types';
import type {Scaffold} from '../data/scaffolds';
import {scaffoldById} from '../data/scaffolds';
import {resolveScaffoldRuntime} from '../lib/scaffoldRuntime';
import {chapterProgress,expeditionInvitation,type CampaignChapter,type LearningCampaign} from '../lib/campaign';
import {ACTIVITY_KIND_LABELS} from './StructuredBoard';
import './campaign.css';

interface Props {notebook:Notebook;progress:Progress;campaign:LearningCampaign;onStudy:(chapter:CampaignChapter)=>void;onRecall:(chapter?:CampaignChapter)=>void;onActivity:(id:string,fresh?:boolean)=>void;onScaffold:(scaffold:Scaffold)=>void}
export default function CampaignMap({notebook,progress,campaign,onStudy,onRecall,onActivity,onScaffold}:Props){
  const [visible,setVisible]=useState(8),[filter,setFilter]=useState('');
  const chapters=campaign.chapters.filter(c=>!filter||c.unit.sourceId===filter);
  const invitation=expeditionInvitation(notebook,campaign,progress);
  const explored=campaign.chapters.filter(c=>chapterProgress(c,progress).explored).length;
  const activities=new Map((notebook.activities??[]).map(a=>[a.id,a]));
  const availableModes=notebook.scaffoldIds.map(scaffoldById).filter((s):s is Scaffold=>!!s&&resolveScaffoldRuntime(s.id,notebook).available);
  const activityButton=(id:string)=>{const a=activities.get(id);if(!a)return null;return <button key={id} data-activity-id={id} className={`campaign-task ${progress.structured?.[id]?.completed?'completed':''}`} onClick={()=>onActivity(id)}><span className="campaign-task-icon">{progress.structured?.[id]?.completed?<Check size={17}/>:<Layers size={17}/>}</span><span><strong>{a.title}</strong><small>{ACTIVITY_KIND_LABELS[a.kind]}{a.reviewStatus==='needs-review'?' · Practice draft':''}</small></span><ArrowRight size={16}/></button>};
  return <section className="campaign-map" aria-label="Learning expedition">
    <div className="campaign-intro"><div className="campaign-emblem"><Compass size={29}/></div><div><span className="eyebrow">YOUR LEARNING EXPEDITION</span><h2>Understand it. Try it. Make it yours.</h2><p>Follow a topic from your material into a hands-on mission. Choose where to explore; your discoveries stay in your field guide.</p></div></div>
    {invitation&&<section className="campaign-invitation" aria-label="Your next expedition"><div><span className="eyebrow">YOUR NEXT EXPEDITION</span><h3>{invitation.title}</h3><p>{invitation.reason}</p></div><button onClick={()=>{if(invitation.kind==='activity')onActivity(invitation.activityId,invitation.fresh);else if(invitation.kind==='recall')onRecall(invitation.chapter);else onStudy(invitation.chapter);}}>{invitation.label}<ArrowRight size={18}/></button></section>}
    <div className="campaign-summary"><span><Route size={16}/>{campaign.chapters.length} source chapters</span><span><BookOpen size={16}/>{explored} field notes collected</span><span><Layers size={16}/>{notebook.activities?.length??0} playable models</span></div>
    {notebook.sources.length>1&&<label className="campaign-filter">Explore a source<select value={filter} onChange={e=>{setFilter(e.target.value);setVisible(8);}}><option value="">All your materials</option>{notebook.sources.filter(s=>campaign.chapters.some(c=>c.unit.sourceId===s.id)).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
    <div className="campaign-chapters">{chapters.slice(0,visible).map((chapter,index)=>{const status=chapterProgress(chapter,progress);return <article key={chapter.id} className={`campaign-chapter ${status.explored?'explored':''}`}>
      <div className="campaign-chapter-line"><span className="campaign-chapter-number">{status.explored?<Check size={18}/>:String(index+1).padStart(2,'0')}</span><span className="eyebrow">{chapter.sourceTitle}</span><span className="campaign-kind">{chapter.unit.kind==='concept'?'Connect ideas':chapter.unit.kind==='procedure'?'Trace a process':chapter.unit.kind==='reference'?'Inspect a model':'Explore & explain'}</span></div>
      <h3>{chapter.title}</h3><p className="campaign-preview">{chapter.unit.quote.replace(/\s+/g,' ').slice(0,200)}{chapter.unit.quote.length>200?'…':''}</p>
      <button className="campaign-explore" onClick={()=>onStudy(chapter)}><BookOpen size={17}/>{status.explored?'Open your field note':'Explore this chapter'}<ArrowRight size={17}/></button>
      {(chapter.activityIds.length>0||chapter.cardIds.length>0)&&<div className="campaign-tasks" aria-label={`Missions for ${chapter.title}`}>{chapter.activityIds.map(activityButton)}{chapter.cardIds.length>0&&<button className="campaign-task" onClick={()=>onRecall(chapter)}><span className="campaign-task-icon"><Sparkles size={17}/></span><span><strong>Retrieve the key ideas</strong><small>{status.practiced}/{chapter.cardIds.length} practiced · {status.independent} independently recalled</small></span><ArrowRight size={16}/></button>}</div>}
      {!status.hasPractice&&<p className="campaign-reading-note">Capture an observation and a question from this material. This chapter builds your field guide without a guessed answer key.</p>}
    </article>})}</div>
    {chapters.length>visible&&<button className="button secondary full" onClick={()=>setVisible(v=>v+8)}>Explore the next {Math.min(8,chapters.length-visible)} chapters <ArrowRight size={16}/></button>}
    {(campaign.unboundActivityIds.length>0||campaign.unboundCardIds.length>0)&&<div className="campaign-extra"><h3>Across your sources</h3><p>These missions combine material or use a separately authored model.</p>{campaign.unboundActivityIds.map(activityButton)}{campaign.unboundCardIds.length>0&&<button className="campaign-task" onClick={()=>onRecall()}><BookOpen size={17}/><span><strong>Recall expedition</strong><small>Practice the notebook's prepared questions</small></span><ArrowRight size={16}/></button>}</div>}
    {availableModes.length>0&&<details className="campaign-modes"><summary>Choose a game mode <span>{availableModes.length} ready</span></summary><div>{availableModes.map(s=><button className="campaign-task" key={s.id} onClick={()=>onScaffold(s)}><span>{s.icon}</span><span><strong>{s.name}</strong><small>{s.tagline}</small></span><ArrowRight size={16}/></button>)}</div></details>}
    {!chapters.length&&!notebook.activities?.length&&!notebook.cards.length&&<p className="empty-state">Add readable material to begin your expedition.</p>}
  </section>;
}
