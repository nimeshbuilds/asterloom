import {useEffect,useId,useRef,useState} from 'react';
import {Check,Download,HardDrive,LoaderCircle,Monitor,RefreshCw,Trash2} from 'lucide-react';
import type {ProviderConfig} from '../lib/provider';
import {api} from '../lib/imports';
import {formatLocalBytes,localDiskIssue,localModelQualified,localModelStatus,type LocalModelStatus} from '../lib/localModels';

const phases:Record<string,string>={downloading:'Downloading',verifying:'Checking downloaded files',starting:'Starting the local engine',probing:'Testing a short local response',removing:'Removing the download',canceling:'Stopping'};
export default function LocalModelConnection({config,onChange,disabled=false}:{config:ProviderConfig;onChange:(value:ProviderConfig)=>void;disabled?:boolean}){
 const [status,setStatus]=useState<LocalModelStatus|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[pending,setPending]=useState(''),[settingUp,setSettingUp]=useState(''),[retryModel,setRetryModel]=useState('');
 const headingId=useId(),epoch=useRef(0),mounted=useRef(false),flight=useRef<Promise<void>|null>(null),pendingAction=useRef(''),latest=useRef({config,onChange});latest.current={config,onChange};
 const signature=(value:ProviderConfig)=>JSON.stringify([value.provider,value.model,value.apiKey,value.baseUrl??'']);
 const setup=useRef<{model:string;selection:string}|null>(null);
 function stopSetup(message?:string){const model=setup.current?.model;setup.current=null;setSettingUp('');if(message){setError(message);if(model)setRetryModel(model);}}
 function advanceSetup(next:LocalModelStatus){
  const flow=setup.current;if(!flow)return;
  if(signature(latest.current.config)!==flow.selection){stopSetup();return;}
  if(next.job||next.runtime.installing)return;
  const model=next.models.find(model=>model.id===flow.model);
  if(!next.runtime.supported||!model){stopSetup('This model is no longer available for this computer. Retry the device check.');return;}
  if(next.lastOperation?.status==='canceled'){stopSetup();return;}
  if(!next.runtime.installed||!model.ready||next.lastOperation?.kind!=='setup'||next.lastOperation.model!==model.id||next.lastOperation.status!=='completed'){stopSetup(model.error||next.runtime.error||next.error||next.lastOperation?.message||'Setup did not finish its readiness check. Retry setup when ready.');return;}
  stopSetup();setRetryModel('');latest.current.onChange({provider:'local',apiKey:'',model:model.id});
 }
 function accept(value:unknown){const next=localModelStatus(value);setStatus(next);setError('');advanceSetup(next);const selected=latest.current.config;if(!setup.current&&selected.provider==='local'&&selected.model&&(!next.runtime.installed||!next.runtime.supported||!next.models.some(model=>model.id===selected.model&&model.ready))&&!next.job)latest.current.onChange({provider:'local',apiKey:'',model:''});}
 async function readStatus(){
  // The operation response owns the next state transition. A focus/poll read
  // before the service accepts it can still describe the previous idle state.
  if(pendingAction.current)return;
  if(flight.current)return flight.current;
  const token=epoch.current;
  const operation=(async()=>{try{const value=await api('/api/ai/local/status');if(mounted.current&&token===epoch.current)accept(value);}catch(e){if(mounted.current&&token===epoch.current)setError((e as Error).message);}finally{if(mounted.current&&token===epoch.current)setLoading(false);}})();
  flight.current=operation;try{await operation;}finally{if(flight.current===operation)flight.current=null;}
 }
 useEffect(()=>{mounted.current=true;void readStatus();return()=>{mounted.current=false;epoch.current++;flight.current=null;setup.current=null;};},[]);
 useEffect(()=>{if(setup.current&&setup.current.selection!==signature(config))stopSetup();},[signature(config)]);
 useEffect(()=>{const active=!!status?.job;const timer=setInterval(()=>void readStatus(),active?1000:15000);const refresh=()=>void readStatus();window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[!!status?.job]);
 async function act(action:string,model?:string){
  if(disabled||pendingAction.current&&action!=='cancel')return;
  if(action==='cancel')stopSetup();
  const token=++epoch.current;pendingAction.current=action;setPending(action);setError('');
  try{const value=await api(`/api/ai/local/${action}`,model?{model}:{});if(mounted.current&&token===epoch.current)accept(value);}
  catch(e){if(mounted.current&&token===epoch.current){stopSetup((e as Error).message);setError((e as Error).message);}}
  finally{if(mounted.current&&token===epoch.current){pendingAction.current='';setPending('');setLoading(false);}}
 }
 function beginSetup(modelId:string){if(disabled||pendingAction.current||status?.job||!status)return;const model=status.models.find(model=>model.id===modelId);if(!model)return;if(model.ready&&status.runtime.installed){onChange({provider:'local',apiKey:'',model:model.id});return;}setup.current={model:modelId,selection:signature(latest.current.config)};setSettingUp(modelId);setError('');void act('models/setup',modelId);}
 const busy=!!status?.job||!!pending||!!status?.runtime.installing;
 const runtimeIssue=status?localDiskIssue(status.hardware.freeDiskBytes,status.runtime.requiredDiskBytes):'';
 const completed=status?.job?.completedBytes??status?.runtime.downloadedBytes,total=status?.job?.totalBytes??status?.runtime.totalBytes;
 const progress=total&&completed!==null&&completed!==undefined?Math.min(100,Math.max(0,completed/total*100)):undefined;
 const jobName=status?.job?.model&&status.job.step!=='runtime'?status.models.find(model=>model.id===status.job?.model)?.name:'Local engine';
 return <section className="local-model-connection" aria-labelledby={headingId}>
  <div className="local-model-heading"><Monitor size={24} aria-hidden="true"/><div><h3 id={headingId}>AI on this computer</h3><p>Set up a model for this app, then use it for Aster and game creation without an API key. Questions and source passages stay on this computer; there is no cloud fallback.</p></div></div>
  <p className="local-model-boundary">Downloads need internet. Aster and game creation share this app’s model setup. Exported games include neither model downloads nor this connection; each exported app keeps its own local model setup. Finished games still play without AI.</p>
  {loading&&!status&&<p role="status"><LoaderCircle size={16} className="spin"/> Checking this computer…</p>}
  {error&&<p className="provider-error" role="alert">{error}</p>}
  {status&&<>
   <div className="local-device-summary"><span><Monitor size={16} aria-hidden="true"/>Memory: <strong>{formatLocalBytes(status.hardware.totalMemoryBytes)}</strong></span><span><HardDrive size={16} aria-hidden="true"/>Free storage: <strong>{formatLocalBytes(status.hardware.freeDiskBytes)}</strong></span></div>
   {!status.runtime.supported&&<p className="provider-error" role="status">{status.runtime.reason||'Local AI is not supported on this computer. Installed models on another device are not used here.'}</p>}
   <div className="local-runtime-card"><div><strong>{status.runtime.installed?'Local engine installed':'Your selected model includes engine setup'}</strong><p>{status.runtime.installed?`Ready to manage this device’s models${status.runtime.version?` · ${status.runtime.version}`:''}.`:`Setup installs one shared local engine${status.runtime.downloadBytes!==null?` · ${formatLocalBytes(status.runtime.downloadBytes)} download`:''}, downloads your model, checks that it runs, and selects it for this session.`}</p></div></div>
   {status.runtime.error&&<p className="provider-error" role="status">{status.runtime.error}</p>}
   {(status.job||pending||status.runtime.installing)&&<div className="local-install-progress" aria-live="polite" aria-atomic="true"><strong>{status.job?`${phases[status.job.phase]??'Working'} · ${jobName??'Local model'}`:pending==='cancel'?'Stopping…':'Starting your request…'}</strong><progress aria-label="Local model setup progress" max={100} value={progress}/>{completed!==null&&completed!==undefined&&<span>{formatLocalBytes(completed)}{total?` of ${formatLocalBytes(total)}`:''}</span>}<button type="button" className="text-button" disabled={disabled||pending==='cancel'||status.job?.phase==='canceling'} onClick={()=>void act('cancel')}>Cancel setup</button></div>}
   {!busy&&status.lastOperation?.status==='canceled'&&<p className="provider-status" role="status">Setup canceled. You can retry when ready.</p>}
   {status.error&&status.error!==status.runtime.error&&<p className="provider-error" role="status">{status.error}</p>}
   {status.models.length>0&&status.models.every(model=>!localModelQualified(model))&&<p className="local-model-boundary">Local models are being evaluated. These candidates are experimental; none is recommended yet for Aster or game creation.</p>}
   <div className="local-model-list" aria-label="Local model candidates">{status.models.map(model=>{
    const selected=config.provider==='local'&&config.model===model.id;const modelSpace=model.installed?0:model.requiredDiskBytes;const requiredSpace=model.setupRequiredDiskBytes??(status.runtime.installed?modelSpace:status.runtime.requiredDiskBytes===null?null:status.runtime.requiredDiskBytes+modelSpace);const diskIssue=model.ready&&status.runtime.installed||requiredSpace===0?'':localDiskIssue(status.hardware.freeDiskBytes,requiredSpace);const qualified=localModelQualified(model);
    return <article key={model.id} className={`local-model-card${selected?' selected':''}`} aria-label={model.name}>
     <div className="provider-card-heading"><h4>{model.name}</h4><span className={`provider-badge ${selected?'connected':''}`}>{selected?<><Check size={13} aria-hidden="true"/>Selected</>:qualified?'Quality-tested':'Experimental'}</span></div>
     <dl className="local-model-specs"><div><dt>Download</dt><dd>{formatLocalBytes(model.downloadBytes)}</dd></div><div><dt>Memory guidance</dt><dd>{formatLocalBytes(model.recommendedMemoryBytes)}</dd></div><div><dt>Context window</dt><dd>{model.contextTokens.toLocaleString()} tokens</dd></div></dl>
     {status.hardware.totalMemoryBytes!==null&&status.hardware.totalMemoryBytes<model.recommendedMemoryBytes&&<p className="local-storage-note">This computer has less memory than the model’s guidance. It may run slowly or fail to load.</p>}
     <div className="local-model-quality"><p><strong>Aster chat:</strong> {model.qualification.asterChat.label}</p><p><strong>Game creation:</strong> {model.qualification.gameCreation.label}</p>{!qualified&&<small>A successful readiness check only proves that the model runs. It does not establish answer quality or successful game creation.</small>}</div>
     <p className="local-model-readiness" role="status">{model.ready?<><Check size={15} aria-hidden="true"/>Runs on this computer · readiness check passed</>:model.installed?'Downloaded · readiness check needed':'Not downloaded'}</p>
     {diskIssue&&<p className="local-storage-note">{diskIssue}</p>}
     {model.error&&<p className="provider-error" role="status">{model.error}</p>}
     <div className="provider-actions">
      <button type="button" className="button primary" disabled={disabled||busy||selected||!status.runtime.supported||!!diskIssue} onClick={()=>beginSetup(model.id)}>{settingUp===model.id?<><LoaderCircle size={16} className="spin" aria-hidden="true"/>Setting up {model.name}…</>:selected?'Selected for this session':model.ready&&status.runtime.installed?qualified?'Use model':'Use experimental model':`${retryModel===model.id?'Retry setup':'Set up'} & use ${qualified?'model':'experimental model'}`}</button>
      {model.installed&&<button type="button" className="text-button" aria-label={`Remove ${model.name} download`} disabled={disabled||busy} onClick={()=>void act('models/remove',model.id)}><Trash2 size={14} aria-hidden="true"/>Remove download</button>}
     </div>
     <small>{model.license}{model.sourceUrl&&<> · <a href={model.sourceUrl} target="_blank" rel="noreferrer">Model source and terms</a></>}</small>
    </article>;
   })}</div>
   {status.models.length===0&&<p>No verified model downloads are available for this build.</p>}
  </>}
  {status&&<details className="local-model-maintenance"><summary>Engine maintenance</summary><p>Model setup handles this automatically. Install just the engine if you want to prepare this computer first.</p><button type="button" className="button secondary" disabled={disabled||busy||status.runtime.installed||!status.runtime.supported||!!runtimeIssue} onClick={()=>void act('runtime/install')}><Download size={16} aria-hidden="true"/>{status.runtime.installed?'Engine already installed':'Install local engine only'}</button></details>}
  <button type="button" className="text-button local-device-recheck" disabled={disabled||!!pending} onClick={()=>void readStatus()}><RefreshCw size={15} aria-hidden="true"/>Retry device check</button>
 </section>;
}
