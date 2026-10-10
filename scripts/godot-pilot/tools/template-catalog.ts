import {readFileSync} from 'node:fs';
import {SCAFFOLDS} from '../../../src/data/scaffolds';
import type {Notebook} from '../../../src/types';
import type {StructuredActivity} from '../../../src/lib/structuredEngine';

export const TEMPLATE_IDS=['signalwright-workshop','restoration-field-station','archive-investigation'] as const;
export type PilotTemplateId=typeof TEMPLATE_IDS[number];
export interface PilotPresentation {version:1;templateId:PilotTemplateId}
export interface PilotTemplate {
 id:PilotTemplateId;version:1;name:string;fictional:true;setting:'network'|'garden'|'archive';
 compatibleKinds:('sequence'|'dependency')[];
 cast:{id:'aster'|'builder'|'analyst';name:string;role:string;color:string}[];
 briefing:{title:string;text:string};
 acts:{briefing:string;learning:string;building:string;challenge:string;debrief:string};
 palette:{background:string;floor:string;structure:string;accent:string;secondary:string;text:string};
 lighting:{ambientEnergy:number;keyEnergy:number;keyColor:string};
 audioProfile:'network'|'garden'|'archive';
 accessibility:{minFontSize:18;maxActiveCharacters:3;seatedControls:true;reducedMotion:true;flashing:false;timers:false};
 contentSlots:['lessons','sequence.items','dependency.nodes','activityEvidence'];
}
function object(value:unknown,keys:string[]):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))throw new Error('Template contains missing or unsupported fields.');
}
function text(value:unknown,max:number){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw new Error('Template text exceeds its presentation bounds.');}
function color(value:unknown){if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new Error('Template colors must be authored RGB colors.');}
const same=(actual:unknown,expected:unknown)=>JSON.stringify(actual)===JSON.stringify(expected);
/** Catalog content is shipped application data. No pack-provided scene/asset references are accepted. */
export function validateTemplateCatalog(value:unknown):PilotTemplate[]{
 object(value,['version','templates']);
 if(value.version!==1||!Array.isArray(value.templates)||value.templates.length!==TEMPLATE_IDS.length)throw new Error('Unsupported presentation catalog.');
 const seen=new Set<string>();
 for(const p of value.templates){
  object(p,['id','version','name','fictional','setting','compatibleKinds','cast','briefing','acts','palette','lighting','audioProfile','accessibility','contentSlots']);
  if(!TEMPLATE_IDS.includes(p.id as PilotTemplateId)||seen.has(String(p.id))||p.version!==1||p.fictional!==true||!['network','garden','archive'].includes(String(p.setting))||p.audioProfile!==p.setting)throw new Error('Unsupported authored template identity.');
  seen.add(String(p.id));text(p.name,80);
  if(!same(p.compatibleKinds,['sequence','dependency']))throw new Error('This catalog supports only sequence and dependency constructions.');
  if(!Array.isArray(p.cast)||p.cast.length!==3)throw new Error('An authored template has exactly three cast members.');
  p.cast.forEach((member,index)=>{object(member,['id','name','role','color']);if(member.id!==['aster','builder','analyst'][index])throw new Error('Unsupported cast identity.');text(member.name,32);text(member.role,80);color(member.color);});
  object(p.briefing,['title','text']);text(p.briefing.title,100);text(p.briefing.text,600);
  object(p.acts,['briefing','learning','building','challenge','debrief']);Object.values(p.acts).forEach(v=>text(v,80));
  object(p.palette,['background','floor','structure','accent','secondary','text']);Object.values(p.palette).forEach(color);
  object(p.lighting,['ambientEnergy','keyEnergy','keyColor']);color(p.lighting.keyColor);
  if(typeof p.lighting.ambientEnergy!=='number'||!Number.isFinite(p.lighting.ambientEnergy)||p.lighting.ambientEnergy<0.4||p.lighting.ambientEnergy>0.9||typeof p.lighting.keyEnergy!=='number'||!Number.isFinite(p.lighting.keyEnergy)||p.lighting.keyEnergy<0.8||p.lighting.keyEnergy>2)throw new Error('Lighting exceeds the authored comfort budget.');
  const budget={minFontSize:18,maxActiveCharacters:3,seatedControls:true,reducedMotion:true,flashing:false,timers:false};object(p.accessibility,Object.keys(budget));
  const accessibility=p.accessibility;
  if(Object.entries(budget).some(([key,value])=>accessibility[key]!==value))throw new Error('Unsupported accessibility budget.');
  if(!same(p.contentSlots,['lessons','sequence.items','dependency.nodes','activityEvidence']))throw new Error('Unsupported source-content slot.');
 }
 return structuredClone(value.templates) as PilotTemplate[];
}
const profiles=validateTemplateCatalog(JSON.parse(readFileSync(new URL('../project/data/templates.json',import.meta.url),'utf8')));
export function pilotTemplates():PilotTemplate[]{return structuredClone(profiles);}
export function pilotTemplate(id:string):PilotTemplate{
 const profile=profiles.find(item=>item.id===id);if(!profile)throw new Error('Choose a shipped pilot template: '+TEMPLATE_IDS.join(', ')+'.');return structuredClone(profile);
}
function themed(value:string):PilotTemplateId|undefined{
 const terms=value.toLowerCase().split(/[^a-z]+/);
 if(terms.some(term=>['ecology','ecological','ecosystem','restoration','biology','environment','garden','forest','nature'].includes(term)))return'restoration-field-station';
 if(terms.some(term=>['archive','history','historical','chronology','evidence','investigation','library'].includes(term)))return'archive-investigation';
}
/** Presentation preference only; metadata never changes the lesson, answer model or source. */
export function selectPilotTemplate(notebook:Notebook,activities:StructuredActivity[],explicit?:string):PilotTemplate{
 if(explicit!==undefined)return pilotTemplate(explicit);
 const theme=themed(notebook.theme);
 if(notebook.themeSelection==='manual'&&theme)return pilotTemplate(theme);
 const selected=activities.flatMap(activity=>activity.scaffoldIds??[]);
 const ids=selected.length?selected:notebook.scaffoldIds;
 const votes=new Map<PilotTemplateId,number>();
 for(const id of new Set(ids)){
  const scaffold=SCAFFOLDS.find(item=>item.id===id);if(!scaffold)continue;
  const match=themed([scaffold.domain,...scaffold.skills].join(' '));if(match)votes.set(match,(votes.get(match)??0)+1);
 }
 const ranked=[...votes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 return pilotTemplate(ranked[0]?.[0]??theme??'signalwright-workshop');
}
/** Pure parity helper for the native contract. Missing presentation is the legacy default. */
export function resolvePilotPresentation(pack:Record<string,unknown>):{profile:PilotTemplate;legacy:boolean}{
 const legacy=pack.presentation===undefined;
 let id:PilotTemplateId='signalwright-workshop';
 if(!legacy){object(pack.presentation,['version','templateId']);if(pack.presentation.version!==1||typeof pack.presentation.templateId!=='string')throw new Error('Unsupported pilot presentation.');id=pilotTemplate(pack.presentation.templateId).id;}
 const profile=pilotTemplate(id),kinds=['sequence','dependency'].filter(kind=>pack[kind]!==undefined);
 if(!kinds.length)throw new Error('A template requires a supported construction.');
 for(const kind of kinds){
  const activity=pack[kind] as Record<string,unknown>;if(!activity||typeof activity!=='object'||activity.kind!==kind)throw new Error('Template activity kind does not match.');
  const items=activity[kind==='sequence'?'items':'nodes'];const rules=activity[kind==='sequence'?'constraints':'edges'];
  if(!Array.isArray(items)||items.length<2||items.length>8||!Array.isArray(rules)||rules.length<1||rules.length>12)throw new Error('Template construction exceeds its fixed bounds.');
 }
 return {profile,legacy};
}
