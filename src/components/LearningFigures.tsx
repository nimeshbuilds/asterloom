import type {Notebook} from '../types';
import type {StructuredActivity} from '../lib/structuredEngine';
export default function LearningFigures({notebook,activity}:{notebook:Pick<Notebook,'sources'|'artwork'>;activity?:StructuredActivity}){
 const figures=notebook.artwork?.filter(a=>a.reviewStatus==='reviewed'&&notebook.sources.some(s=>s.id===a.sourceId&&s.text.includes(a.evidence))&&(!activity||a.purpose==='instructional'&&activity.sourceRefs.some(r=>r.sourceId===a.sourceId&&(r.evidence.includes(a.evidence)||a.evidence.includes(r.evidence))))).slice(0,3)||[];
 if(!figures.length)return null;
 return <section className="learning-figures" aria-label="Reviewed learning visuals">{figures.map(a=><figure key={a.id}><img src={a.dataUrl} alt={a.title}/><figcaption><strong>{a.title}</strong><span>{a.purpose==='decorative'?'Atmosphere · no learning claims':'Author-reviewed learning figure'}</span><details><summary>See supporting source</summary><blockquote>{a.evidence}</blockquote><small>{notebook.sources.find(s=>s.id===a.sourceId)?.title}</small></details></figcaption></figure>)}</section>;
}
