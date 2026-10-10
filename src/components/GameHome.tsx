import {useMemo,type ReactNode} from 'react';
import {ArrowRight,BookOpen,Copy,Download,FlaskConical,PenLine,Play,Sparkles,Trash2,Users} from 'lucide-react';
import type {Notebook,Progress} from '../types';
import {journeyXp} from '../lib/progression';
import {expeditionInvitation,type LearningCampaign,type ExpeditionInvitation} from '../lib/campaign';
import {validateGameCreativeDirection} from '../lib/gameCreativeDirection';
import {currentAILearningMission} from '../lib/aiLearningPlan';
import {hasCurrentActivityEvidence} from '../lib/scaffoldRuntime';
import {gameOverviewView} from '../lib/gameOverview';
import WorldPreview from './WorldPreview';
import SourceMaterials from './SourceMaterials';
import AIUsageReport from './AIUsageReport';
import './game-home.css';

interface Props {
 notebook:Notebook;progress:Progress;campaign:LearningCampaign;children:ReactNode;
 onPlay:(next?:ExpeditionInvitation)=>void;onEdit:()=>void;onExport:()=>void;onRemix:()=>void;onCompetition:()=>void;onDelete:()=>void;
 onExperimentalPlay?:()=>void;experimentalOpening?:boolean;
}

/** A game has one front door. Authoring tools and unfinished players belong behind it. */
export default function GameHome({notebook,progress,campaign,children,onPlay,onEdit,onExport,onRemix,onCompetition,onDelete,onExperimentalPlay,experimentalOpening}:Props){
 const direction=useMemo(()=>{try{return notebook.gameDesign?.creativeDirection?validateGameCreativeDirection(notebook.gameDesign.creativeDirection,notebook):undefined;}catch{return;}},[notebook]);
 const invitation=expeditionInvitation(notebook,campaign,progress);
 const activities=(notebook.activities??[]).filter(activity=>hasCurrentActivityEvidence(activity,notebook.sources));
 const next=invitation?.kind==='activity'?activities.find(activity=>activity.id===invitation.activityId):undefined;
 const teaching=next?currentAILearningMission(notebook,next):undefined;
 const overview=useMemo(()=>gameOverviewView(notebook),[notebook]);
 const begun=!!progress.activeSession||Object.keys(progress.structured??{}).length>0||Object.keys(progress.studies??{}).length>0;
 const freshReview=invitation?.kind==='activity'&&invitation.fresh===true;
 const playable=activities.length>0||notebook.cards.length>0||campaign.chapters.length>0;
 return <div className="game-home">
  <section className="adventure-home-hero" aria-label="Your adventure">
   <WorldPreview scaffoldId={direction?.primaryScaffoldId??notebook.scaffoldIds[0]} theme={notebook.theme} ageGroup={notebook.ageGroup} title={direction?.title??notebook.title}/>
   <div className="adventure-home-shade" aria-hidden="true"/>
   <div className="adventure-home-copy"><span className="adventure-home-kicker">{direction?.title??'Your learning adventure'}</span><h1>{notebook.title.replaceAll('_',' ')}</h1>
    <p className="adventure-home-purpose">{overview.origin==='generated'&&overview.content?overview.content.introduction.text:activities.length?`Learn the ideas in your material, then put them to work across ${activities.length} ${activities.length===1?'mission':'missions'}. Your lessons, sources and progress stay together.`:notebook.description||'Explore the ideas in your material. Put them to work, one mission at a time.'}</p>
    <div className="adventure-home-start"><button className="button primary" disabled={!playable} onClick={()=>onPlay(invitation)}><Play size={19} fill="currentColor"/>{freshReview?'Start review':begun?'Continue game':'Play game'}<ArrowRight size={19}/></button><div><span>{freshReview?'Ready for a fresh attempt':begun?'Pick up your mission':'Your first mission'}</span><strong>{teaching?.title??invitation?.title??'Explore your material'}</strong>{freshReview&&<span>{invitation.reason}</span>}</div></div>
   </div>
   <div className="adventure-home-stats" aria-label="Adventure progress"><span><BookOpen size={16}/><strong>{activities.length||notebook.cards.length}</strong>{activities.length?'missions':'challenges'}</span><span><Sparkles size={16}/><strong>{journeyXp(progress)}</strong>Journey XP</span><span>{notebook.sources.length} {notebook.sources.length===1?'source':'sources'} included</span></div>
  </section>
  <nav className="adventure-home-tools" aria-label="Game tools"><button className="button secondary" onClick={onEdit}><PenLine size={16}/>Edit materials</button><SourceMaterials notebook={notebook}/><button className="button secondary" onClick={onExport}><Download size={16}/>Export this notebook</button><details className="adventure-home-more"><summary>More options</summary><div><button onClick={onCompetition}><Users size={16}/>Open challenge room</button><button onClick={onRemix}><Copy size={16}/>Make a remix</button><button className="danger" onClick={onDelete}><Trash2 size={16}/>Delete game</button></div></details></nav>
  {children}
  <details className="adventure-build-details"><summary>Creation details &amp; experimental tools</summary><p>Creation information stays here while you play.</p><AIUsageReport receipts={[...(notebook.gameDesign?.receipts??[]),...(notebook.aiToolReceipts??[])]}/>
   {onExperimentalPlay&&<section className="adventure-experimental"><h3><FlaskConical size={17}/>Experimental Godot player</h3><p>A separate player under development. Its progress stays separate. Aster chat, challenge rooms and original-file downloads are available in the main game.</p><button className="button secondary" disabled={experimentalOpening} onClick={onExperimentalPlay}>{experimentalOpening?'Opening…':'Open experimental player'}<ArrowRight size={16}/></button></section>}
  </details>
 </div>;
}
