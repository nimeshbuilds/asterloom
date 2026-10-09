import {useMemo} from 'react';
import {BookOpen,Compass,Link2} from 'lucide-react';
import type {EvidenceReference,Notebook} from '../types';
import {gameOverviewView} from '../lib/gameOverview';
import './game-overview.css';
function Citations({references,notebook}:{references:EvidenceReference[];notebook:Notebook}){
 return <details className="game-overview-evidence"><summary>Check the source</summary>{references.map((ref,i)=><figure key={`${ref.sourceId}-${ref.start}-${i}`}><figcaption>{notebook.sources.find(source=>source.id===ref.sourceId)?.title} · {ref.locator.label}</figcaption><blockquote>{ref.quote}</blockquote></figure>)}</details>;
}
export default function GameOverview({notebook}:{notebook:Notebook}){
 const overview=useMemo(()=>gameOverviewView(notebook),[notebook]),content=overview.content;
 return <section className="game-overview" aria-label="Learn about this game and what it teaches" data-origin={overview.origin}>
  <div className="game-overview-kicker"><Compass size={17} aria-hidden="true"/> Start with the big picture</div>
  <h2>Learn about this game and what it teaches</h2>
  {overview.origin==='generated'&&content?<><h3 className="game-overview-title">{content.title}</h3><p className="game-overview-introduction">{content.introduction.text}</p><Citations references={content.introduction.citations} notebook={notebook}/></>:<p className="game-overview-introduction">{overview.missionCount?`Your saved game has ${overview.missionCount} short lessons with hands-on quests. Explore the ideas below, then choose a lesson. Each quest uses the material you added.`:'Explore your materials, learn the ideas they explain, then try the available activities. Original source files and readable text stay in the Source library.'}</p>}
  {content&&<details className="game-overview-explore"><summary>Explore what you’ll learn</summary>
   <div className="game-overview-goals"><h3><BookOpen size={18} aria-hidden="true"/>{overview.origin==='generated'?'What you’ll learn':'A preview of your learning goals'}</h3><ul>{content.learningGoals.map((goal,i)=><li key={i}><span>{goal.text}</span><Citations references={goal.citations} notebook={notebook}/></li>)}</ul></div>
   <div className="game-overview-ideas"><h3>{overview.origin==='generated'?'Ideas you’ll put into practice':'Ideas from across your saved lessons'}</h3><div className="game-overview-grid">{content.keyIdeas.map((idea,i)=><article key={i}><span className="game-overview-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><h4>{idea.title}</h4><p>{idea.text}</p>{idea.activityIds.map(id=>{const mission=notebook.aiLearningPlan?.missions.find(mission=>mission.activityId===id);return mission?<p className="game-overview-mission" key={id}><Link2 size={14} aria-hidden="true"/><span>Practice: {mission.title}</span></p>:null;})}<Citations references={idea.citations} notebook={notebook}/></article>)}</div></div>
  </details>}
  <div className="game-overview-route" aria-label="How learning works"><span><b>1</b> Learn one idea</span><span><b>2</b> Try it with guidance</span><span><b>3</b> Play the quest and learn from feedback</span></div>
  {overview.origin==='saved-lessons'&&<details className="game-overview-lesson-list"><summary>See all {overview.lessonTitles.length} saved lesson topics</summary><ol>{overview.lessonTitles.map((title,i)=><li key={i}>{title}</li>)}</ol></details>}
  <details className="game-overview-about"><summary>About this introduction</summary><p className="game-overview-note">{overview.origin==='generated'?'AI-prepared introduction with exact source citations. Citations make the wording inspectable; they do not guarantee that every explanation is correct. Some material stays in the Source library rather than becoming a scored quest.':overview.origin==='saved-lessons'?'This preview uses your saved lessons. It is not a new AI summary of every source detail; no AI request was made.':'Source reading and prepared activities are available offline.'}</p></details>
 </section>;
}
