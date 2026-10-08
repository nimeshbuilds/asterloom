import {useEffect,useRef,useState} from 'react';
import {BookOpen,Download,ExternalLink,FileText,LoaderCircle} from 'lucide-react';
import type {Notebook,Source} from '../types';
import {downloadSourceMaterial,listSourceDownloads,type SourceDownloadKind} from '../lib/sourceDownloads';
import Dialog from './Dialog';
import './source-materials.css';

interface Props {
  notebook:Pick<Notebook,'id'|'sources'>;
  beforeDownload?:()=>void|boolean|Promise<void|boolean>;
  disabled?:boolean;
  className?:string;
}
function originalLink(source:Source){
  try{const url=new URL(source.url??'');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
export default function SourceMaterials({notebook,beforeDownload,disabled=false,className='button secondary'}:Props){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const request=useRef(0),flight=useRef(false),prepare=useRef(beforeDownload),currentSources=useRef(notebook.sources);
  prepare.current=beforeDownload;currentSources.current=notebook.sources;
  useEffect(()=>{request.current++;setOpen(false);setMessage('');setError('');return()=>{request.current++;};},[notebook.id]);
  function close(){request.current++;setOpen(false);setMessage('');setError('');}
  async function visit(source:Source){
    if(flight.current||disabled)return;
    const version=++request.current;flight.current=true;setBusy(`${source.id}:link`);setError('');setMessage('');
    try{
      if(await prepare.current?.()===false)throw new Error('Your source-help progress could not be saved. Retry after saving this mission.');
      if(version!==request.current)return;
      if(!currentSources.current.includes(source))throw new Error('This source changed. Choose its current link below.');
      const url=originalLink(source);if(url)window.open(url,'_blank','noopener,noreferrer');
    }catch(caught){if(version===request.current)setError(caught instanceof Error?caught.message:'This source could not be opened.');}
    finally{flight.current=false;setBusy('');}
  }
  async function save(source:Source,kind:SourceDownloadKind){
    if(flight.current||disabled)return;
    const version=++request.current;flight.current=true;setBusy(`${source.id}:${kind}`);setError('');setMessage('');
    try{
      if(await prepare.current?.()===false)throw new Error('Your source-help progress could not be saved. Retry after saving this mission.');
      if(version!==request.current)return;
      if(!currentSources.current.includes(source))throw new Error('This source changed. Choose its current download below.');
      const result=await downloadSourceMaterial(source,kind);
      if(version!==request.current)return;
      setMessage(result.status==='saved'?`Saved ${result.filename}.`:result.status==='canceled'?'Save canceled. Your material is still here.':`Download started: ${result.filename}.`);
    }catch(caught){if(version===request.current)setError(caught instanceof Error?caught.message:'This material could not be saved. Please try again.');}
    finally{flight.current=false;setBusy('');}
  }
  return <>
    <button type="button" className={`${className} source-materials-trigger`} disabled={disabled} onClick={()=>setOpen(true)}><BookOpen size={16} aria-hidden="true"/>Source materials</button>
    {open&&<Dialog title="Source materials" onClose={close} wide>
      <div className="source-materials-intro"><span><Download size={22} aria-hidden="true"/></span><div><p>Keep a copy of the material behind this game.</p><small>Original files are preserved uploads or captured snapshots. Readable text is the version used by this game.</small></div></div>
      {beforeDownload&&<p className="source-materials-support">Use these files for source-supported practice. Previously saved results keep their original score.</p>}
      {message&&<p className="source-materials-status" role="status">{message}</p>}
      {error&&<p className="source-materials-error" role="alert">{error}</p>}
      <div className="source-materials-list" aria-label="Materials included in this game" aria-busy={!!busy}>
        {notebook.sources.length===0?<p>No materials have been added to this game yet.</p>:notebook.sources.map(source=>{
          const options=listSourceDownloads(source),link=originalLink(source);
          return <article className="source-material-row" key={source.id} aria-label={source.title}>
            <div className="source-material-title"><FileText size={19} aria-hidden="true"/><h3>{source.title}</h3></div>
            {source.webImport&&<p className="source-material-provenance">Page snapshot saved {new Date(source.webImport.retrievedAt).toLocaleDateString()}{source.webImport.contentStatus==='partial'?' · Partial page':''}.</p>}
            {options.length>0?<div className="source-material-options">{options.map(option=><div key={option.id}><button type="button" className="button secondary" disabled={!!busy||disabled} onClick={()=>void save(source,option.id)}>{busy===`${source.id}:${option.id}`?<LoaderCircle size={15} aria-hidden="true" className="spin"/>:<Download size={15} aria-hidden="true"/>}{option.label}</button><small>{option.description??option.filename}</small></div>)}</div>:<p className="source-material-unavailable">{link?'This game contains a link, but no saved file or readable text to download.':'No file or readable text was preserved for this source.'}</p>}
            {link&&(beforeDownload?<button type="button" className="source-material-link" disabled={!!busy||disabled} onClick={()=>void visit(source)}>Visit original link <ExternalLink size={13} aria-hidden="true"/></button>:<a className="source-material-link" href={link} target="_blank" rel="noreferrer">Visit original link <ExternalLink size={13} aria-hidden="true"/></a>)}
          </article>;
        })}
      </div>
    </Dialog>}
  </>;
}
