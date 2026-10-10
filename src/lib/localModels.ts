export type LocalQualificationStatus='untested'|'outdated'|'needs-work'|'qualified';
export interface LocalQualification {status:LocalQualificationStatus;label:string;reasons:string[];reportId?:string}
export interface LocalModel {
 id:string;name:string;downloadBytes:number;requiredDiskBytes:number;setupRequiredDiskBytes:number|null;recommendedMemoryBytes:number;contextTokens:number;
 installed:boolean;ready:boolean;installedBytes:number|null;error:string;license:string;sourceUrl:string;
 qualification:{asterChat:LocalQualification;gameCreation:LocalQualification};
}
export interface LocalModelStatus {
 provider:'local';localOnly:true;
 runtime:{supported:boolean;installed:boolean;installing:boolean;version:string;error:string;reason:string;downloadBytes:number|null;requiredDiskBytes:number|null;downloadedBytes:number|null;totalBytes:number|null};
 hardware:{platform:string;arch:string;totalMemoryBytes:number|null;freeDiskBytes:number|null};models:LocalModel[];
 job:null|{kind:'runtime'|'model'|'probe'|'remove'|'setup';model?:string;step?:string;phase:string;completedBytes:number|null;totalBytes:number|null;error:string};
 error:string;lastOperation:null|{kind:string;model?:string;status:'completed'|'canceled'|'failed';message:string};
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=4096)=>typeof v==='string'?v.slice(0,max):'';
const bytes=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(v)?v:null;
const unreadable=()=>new Error('The local model status could not be read. Retry the device check.');
function qualification(value:unknown):LocalQualification {
 if(!record(value)||!['untested','outdated','needs-work','qualified'].includes(String(value.status)))return {status:'untested',label:'Not quality-tested',reasons:[]};
 const status=value.status as LocalQualificationStatus;
 const labels:Record<LocalQualificationStatus,string>={untested:'Not quality-tested',outdated:'Quality check needs updating','needs-work':'Quality checks need work',qualified:'Quality-tested'};
 return {status,label:labels[status],reasons:Array.isArray(value.reasons)?value.reasons.filter((v):v is string=>typeof v==='string').slice(0,8).map(v=>v.slice(0,1000)):[],...(typeof value.reportId==='string'?{reportId:value.reportId.slice(0,200)}:{})};
}
/** Readiness is a runtime check. It never grants chat or game-authoring qualification. */
export function localModelStatus(value:unknown):LocalModelStatus {
 if(!record(value)||value.provider!=='local'||value.localOnly!==true||!record(value.runtime)||!record(value.hardware)||!Array.isArray(value.models)||value.models.length>30)throw unreadable();
 const r=value.runtime,h=value.hardware;
 if(['supported','installed','installing'].some(k=>typeof r[k]!=='boolean'))throw unreadable();
 const ids=new Set<string>();
 const models=value.models.map((item:unknown):LocalModel=>{
  if(!record(item)||typeof item.id!=='string'||!item.id.trim()||item.id.length>200||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||typeof item.installed!=='boolean'||typeof item.ready!=='boolean'||item.ready&&!item.installed||bytes(item.downloadBytes)===null||bytes(item.recommendedMemoryBytes)===null||bytes(item.contextTokens)===null)throw unreadable();
  ids.add(item.id);let sourceUrl='';
  if(item.sourceUrl){try{const url=new URL(String(item.sourceUrl));if(url.protocol!=='https:'||url.username||url.password)throw unreadable();sourceUrl=url.href;}catch{throw unreadable();}}
  const q=record(item.qualification)?item.qualification:{};
  return {id:item.id,name:item.name.slice(0,200),downloadBytes:item.downloadBytes as number,requiredDiskBytes:bytes(item.requiredDiskBytes)??(item.downloadBytes as number)+1024**3,setupRequiredDiskBytes:bytes(item.setupRequiredDiskBytes),recommendedMemoryBytes:item.recommendedMemoryBytes as number,contextTokens:item.contextTokens as number,installed:item.installed,ready:item.ready,installedBytes:bytes(item.installedBytes),error:text(item.error),license:text(item.license,500),sourceUrl,qualification:{asterChat:qualification(q.asterChat),gameCreation:qualification(q.gameCreation)}};
 });
 let job:LocalModelStatus['job']=null;
 if(value.job!==null&&value.job!==undefined){const j=value.job;if(!record(j)||!['runtime','model','probe','remove','setup'].includes(String(j.kind))||typeof j.phase!=='string'||j.model!==undefined&&(typeof j.model!=='string'||!ids.has(j.model)))throw unreadable();job={kind:j.kind as NonNullable<LocalModelStatus['job']>['kind'],...(typeof j.model==='string'?{model:j.model}:{}),...(typeof j.step==='string'?{step:j.step.slice(0,30)}:{}),phase:j.phase.slice(0,100),completedBytes:bytes(j.completedBytes),totalBytes:bytes(j.totalBytes),error:text(j.error)};}
 let lastOperation:LocalModelStatus['lastOperation']=null;
 const last=value.lastOperation;
 if(record(last)&&['completed','canceled','failed'].includes(String(last.status)))lastOperation={kind:text(last.kind,30),...(typeof last.model==='string'?{model:last.model.slice(0,200)}:{}),status:last.status as NonNullable<LocalModelStatus['lastOperation']>['status'],message:text(last.message)};
 return {provider:'local',localOnly:true,runtime:{supported:r.supported as boolean,installed:r.installed as boolean,installing:r.installing as boolean,version:text(r.version,100),error:text(r.error),reason:text(r.reason),downloadBytes:bytes(r.downloadBytes),requiredDiskBytes:bytes(r.requiredDiskBytes),downloadedBytes:bytes(r.downloadedBytes),totalBytes:bytes(r.totalBytes)},hardware:{platform:text(h.platform,30),arch:text(h.arch,30),totalMemoryBytes:bytes(h.totalMemoryBytes),freeDiskBytes:bytes(h.freeDiskBytes)},models,job,error:text(value.error),lastOperation};
}
export function formatLocalBytes(value:number|null):string {
 if(value===null)return 'Not reported';
 if(value>=1e9)return `${(value/1e9).toLocaleString(undefined,{maximumFractionDigits:1})} GB`;
 if(value>=1e6)return `${(value/1e6).toLocaleString(undefined,{maximumFractionDigits:0})} MB`;
 return `${Math.round(value/1000).toLocaleString()} KB`;
}
export function localDiskIssue(free:number|null,required:number|null):string {
 if(free===null||required===null)return 'Free storage could not be checked. Retry the device check before installing.';
 return free<required?`Needs ${formatLocalBytes(required)} free storage, including setup space. Free up space, then check again.`:'';
}
export const localModelQualified=(model:LocalModel)=>model.qualification.asterChat.status==='qualified'&&model.qualification.gameCreation.status==='qualified';
