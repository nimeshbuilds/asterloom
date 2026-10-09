import {useId,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,FileText,NotebookPen} from 'lucide-react';
import type {Notebook,Source} from '../types';
import type {CampaignChapter} from '../lib/campaign';
import {sourceRevision} from '../lib/evidence';
import {sourceReaderContentRanges} from '../lib/asterRetrieval';
import {sourceDisplayTitle,sourcePassagePresentation,sourceReadingBlocks,sourceReadingPages,initialSourceReadingPage} from './sourceReaderModel';
import './source-library.css';

interface Props {notebook:Notebook;chapters:CampaignChapter[];onStudy:(chapter:CampaignChapter)=>void;sourceId?:string}
function SourceReader({source,notebook,chapters,onStudy,onBack}:Omit<Props,'sourceId'>&{source:Source;onBack:()=>void}){
 const pages=useMemo(()=>sourceReadingPages(source),[source]),blocks=useMemo(()=>sourceReadingBlocks(source),[source]),ranges=useMemo(()=>sourceReaderContentRanges(source),[source]);
 const [index,setIndex]=useState(()=>initialSourceReadingPage(source,pages,blocks,notebook)),[notes,setNotes]=useState(false);
 const current=pages[Math.min(index,pages.length-1)],id=useId();
 const shown=useMemo(()=>current?ranges.filter(range=>range.start<current.end&&range.end>current.start):[],[ranges,current]);
 const pageChapters=current?chapters.filter(chapter=>chapter.unit.sourceId===source.id&&chapter.unit.start<current.end&&chapter.unit.end>current.start):[];
 const navigate=(at:number)=>{setIndex(at);setNotes(false);};
 const navigation=<nav className="source-reader-navigation" aria-label="Source pages"><button type="button" disabled={index===0} onClick={()=>navigate(index-1)} aria-label="Previous source page"><ArrowLeft size={17}/></button><label htmlFor={id}>Read<select id={id} value={index} onChange={event=>navigate(Number(event.target.value))}>{pages.map((page,i)=><option value={i} key={page.id}>{page.label}</option>)}</select></label><span>{index+1} / {pages.length}</span><button type="button" disabled={index>=pages.length-1} onClick={()=>navigate(index+1)} aria-label="Next source page"><ArrowRight size={17}/></button></nav>;
 return <section className="source-reader" aria-label="Original source reader">
  <header><button type="button" className="source-reader-back" onClick={onBack}><ArrowLeft size={16}/>All sources</button><span>REFERENCE LIBRARY</span></header>
  <h3>{sourceDisplayTitle(source.title)}</h3><p className="source-reader-purpose">Read the source at your own pace. These are original passages, not additional lessons or a test. All pages remain available.</p>
  {pages.length>0? <>{navigation}<article className="source-reader-page" aria-label={current.label}>
   <div className="source-reader-page-heading"><BookOpen size={19}/><h4>{current.label}</h4><span>Original source text</span></div>
   {shown.length?shown.map(block=>{const start=Math.max(block.start,current.start),end=Math.min(block.end,current.end),passage=sourcePassagePresentation(source.text.slice(start,end));return <section className={`source-reader-passage${passage.structured?' source-reader-structured':''}`} key={`${start}-${end}`}>{passage.heading&&<h5>{passage.heading}</h5>}{passage.text&&<p>{passage.text}</p>}</section>;}):<div className="source-reader-reference"><FileText size={23}/><p>The reading view has no text for this page. Open the original text below to see the complete page, including cover or navigation material.</p></div>}
   <details className="source-reader-original" key={current.id}><summary>Original text · complete {current.label.toLowerCase()}</summary><p>Exact extracted text, including page furniture, headings and any material omitted from the reading view. Layout may differ from the uploaded file.</p><pre tabIndex={0} aria-label={`Complete original text: ${current.label}`}>{source.text.slice(current.start,current.end)}</pre></details>
  </article><div className="source-reader-end"><span>Reference reading does not require a written answer.</span>{pageChapters.length>0&&<button type="button" onClick={()=>setNotes(value=>!value)} aria-expanded={notes}><NotebookPen size={16}/>{notes?'Close field notes':'Add or revisit a field note'}</button>}</div>
  {notes&&<section className="source-reader-notes" aria-label="Field note sections"><p>Choose an original passage for your optional note. Existing notes stay linked to the same source.</p>{pageChapters.map((chapter,i)=><button type="button" key={chapter.id} onClick={()=>onStudy(chapter)}><span>{chapter.teaching?.title??chapter.unit.headingPath.at(-1)??`Passage ${i+1}`}</span><ArrowRight size={16}/></button>)}</section>}
  {pages.length>1&&<div className="source-reader-continue"><button type="button" disabled={index===0} onClick={()=>navigate(index-1)}><ArrowLeft size={15}/>Previous</button><span>{current.label}</span><button type="button" disabled={index>=pages.length-1} onClick={()=>navigate(index+1)}>Next<ArrowRight size={15}/></button></div>}</>:<p className="source-reader-reference">This source has no readable text yet. Open Source materials to see which file or text downloads are available.</p>}
 </section>;
}
export default function SourceLibrary({notebook,chapters,onStudy,sourceId}:Props){
 const [selected,setSelected]=useState<string|undefined>();
 const sources=notebook.sources.filter(source=>!sourceId||source.id===sourceId),source=sources.find(item=>item.id===selected);
 return source?<SourceReader key={`${notebook.id}:${source.id}:${sourceRevision(source)}`} source={source} notebook={notebook} chapters={chapters} onStudy={onStudy} onBack={()=>setSelected(undefined)}/>:<section className="source-library" aria-label="Original source library">
  <div className="source-library-heading"><BookOpen size={24}/><div><h3>Your original materials</h3><p>Open a document to read it in context. You can revisit any page and keep optional notes without creating extra quests.</p></div></div>
  <div className="source-library-files">{sources.map(source=>{const pages=sourceReadingPages(source),sections=chapters.filter(chapter=>chapter.unit.sourceId===source.id);return <article className="source-library-file" key={source.id}><div className="source-library-file-icon"><FileText size={23}/></div><div><h4>{sourceDisplayTitle(source.title)}</h4><p>{source.kind==='document'?'Document':source.kind.charAt(0).toUpperCase()+source.kind.slice(1)}{pages.length>0?` · ${pages.length} ${pages.some(page=>page.label.startsWith('Page '))?'pages':'reading sections'}`:' · No readable text yet'}</p><small>{sections.length>0?'Original text and your optional field notes':'Included source material'}</small></div><button type="button" onClick={()=>setSelected(source.id)} aria-label={`Read source: ${source.title}`}>Read source<ArrowRight size={16}/></button></article>;})}</div>
 </section>;
}
