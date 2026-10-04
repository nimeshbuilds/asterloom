import type { Source } from '../types';
import { validateChildPlayFields, validateChildPlaySources } from './childPlayEngine';
import type { ChildPlayActivity, ChildPlayCharacter, ChildPlayFigure, ChildPlayProp } from './childPlayEngine';
export interface ChildFigureDraft { sourceId: string; evidence: string; alt: string; x: number; y: number; width: number; height: number }
export interface ChildCharacterDraft { name: string; role: string; evidence: string; puppet: ChildPlayCharacter['puppet']; color: ChildPlayCharacter['color']; figure: ChildFigureDraft }
export interface ChildPropDraft { name: string; evidence: string; symbol: ChildPlayProp['symbol']; figure: ChildFigureDraft }
export interface ChildSceneDraft { title: string; line: string; speaker: 0 | 1; narrationSourceId: string }
export interface ChildPlayAuthorDraft {
 version: 1; mode: ChildPlayActivity['mode']; title: string; sourceId: string; step: number;
 characters: [ChildCharacterDraft,ChildCharacterDraft]; props: [ChildPropDraft,ChildPropDraft];
 stations: [{name:string;evidence:string},{name:string;evidence:string},{name:string;evidence:string}];
 scenes: [ChildSceneDraft,ChildSceneDraft,ChildSceneDraft,ChildSceneDraft];
 actions: [{line:string;evidence:string},{line:string;evidence:string},{line:string;evidence:string}];
 caregiverNote:string; explanation:string;
}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const text=(v:unknown,fallback='',max=2000)=>typeof v==='string'&&v.length<=max?v:fallback;
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const record=(v:unknown)=>plain(v)?v:{};
const blankFigure=():ChildFigureDraft=>({sourceId:'',evidence:'',alt:'',x:0,y:0,width:100,height:100});
export function initialChildPlayAuthorDraft(sourceId=''):ChildPlayAuthorDraft{
 return {version:1,mode:'puppet-story',title:'A little story to play',sourceId,step:0,
 characters:[{name:'',role:'',evidence:'',puppet:'long-ears',color:'sage',figure:blankFigure()},{name:'',role:'',evidence:'',puppet:'round',color:'coral',figure:blankFigure()}],
 props:[{name:'',evidence:'',symbol:'token',figure:blankFigure()},{name:'',evidence:'',symbol:'token',figure:blankFigure()}],
 stations:[{name:'',evidence:''},{name:'',evidence:''},{name:'',evidence:''}],
 scenes:[{title:'The beginning',line:'',speaker:0,narrationSourceId:''},{title:'A turn for the other character',line:'',speaker:1,narrationSourceId:''},{title:'The story goal',line:'',speaker:1,narrationSourceId:''},{title:'Another path',line:'',speaker:1,narrationSourceId:''}],
 actions:[{line:'',evidence:''},{line:'',evidence:''},{line:'',evidence:''}],caregiverNote:'Read the scene aloud or play its supplied recording. Let the child choose a character and action. Mark support when you help choose the answer.',explanation:''};
}
export function restoreChildPlayAuthorDraft(input:unknown,sourceId=''):ChildPlayAuthorDraft{
 const initial=initialChildPlayAuthorDraft(sourceId);if(!plain(input)||input.version!==1)return initial;
 const figure=(v:unknown):ChildFigureDraft=>{const r=record(v);const bound=(v:unknown,f:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:f;return {sourceId:safeId(r.sourceId)?r.sourceId:'',evidence:text(r.evidence,'',20000),alt:text(r.alt,'',500),x:bound(r.x,0),y:bound(r.y,0),width:bound(r.width,100),height:bound(r.height,100)};};
 const at=(v:unknown,i:number)=>Array.isArray(v)?record(v[i]):{};
 return {version:1,mode:input.mode==='pretend-play'?'pretend-play':'puppet-story',title:text(input.title,initial.title,200),sourceId:safeId(input.sourceId)?input.sourceId:sourceId,step:Number.isInteger(input.step)&&Number(input.step)>=0&&Number(input.step)<=3?Number(input.step):0,
 characters:initial.characters.map((c,i)=>{const r=at(input.characters,i);return {name:text(r.name,'',100),role:text(r.role,'',200),evidence:text(r.evidence,'',20000),puppet:['round','pointed','long-ears'].includes(String(r.puppet))?r.puppet as ChildCharacterDraft['puppet']:c.puppet,color:['sage','coral','blue','gold'].includes(String(r.color))?r.color as ChildCharacterDraft['color']:c.color,figure:figure(r.figure)};}) as ChildPlayAuthorDraft['characters'],
 props:initial.props.map((p,i)=>{const r=at(input.props,i);return {name:text(r.name,'',100),evidence:text(r.evidence,'',20000),symbol:['apple','cup','book','parcel','seed','basket','token'].includes(String(r.symbol))?r.symbol as ChildPropDraft['symbol']:p.symbol,figure:figure(r.figure)};}) as ChildPlayAuthorDraft['props'],
 stations:initial.stations.map((_,i)=>{const r=at(input.stations,i);return {name:text(r.name,'',100),evidence:text(r.evidence,'',20000)};}) as ChildPlayAuthorDraft['stations'],
 scenes:initial.scenes.map((s,i)=>{const r=at(input.scenes,i);return {title:text(r.title,s.title,150),line:text(r.line),speaker:r.speaker===0?0:1,narrationSourceId:safeId(r.narrationSourceId)?r.narrationSourceId:''};}) as ChildPlayAuthorDraft['scenes'],
 actions:initial.actions.map((_,i)=>{const r=at(input.actions,i);return {line:text(r.line,'',250),evidence:text(r.evidence,'',20000)};}) as ChildPlayAuthorDraft['actions'],caregiverNote:text(input.caregiverNote,initial.caregiverNote),explanation:text(input.explanation)};
}
export function compileChildPlayDraft(draft:ChildPlayAuthorDraft,sources:Pick<Source,'id'|'text'|'dataUrl'>[],activityId:string):{success:true;activity:ChildPlayActivity}|{success:false;errors:string[]}{
 const errors:string[]=[],refs:ChildPlayActivity['sourceRefs']=[],puppet=draft.mode==='puppet-story';
 const cite=(sourceId:string,evidence:string,context:string)=>{if(!evidence.trim()||evidence.length>20000||!sources.some(s=>s.id===sourceId&&s.text.includes(evidence)))errors.push(`${context}: paste an exact excerpt from its selected source.`);let index=refs.findIndex(r=>r.sourceId===sourceId&&r.evidence===evidence);if(index<0){index=refs.length;refs.push({sourceId,evidence});}return index;};
 const figure=(value:ChildFigureDraft,label:string,evidenceRefs:number[]):ChildPlayFigure|undefined=>{if(!value.sourceId)return undefined;if(!value.evidence.includes(label))errors.push(`${label || 'Picture'}: its image annotation must contain the exact character or prop name.`);const index=cite(value.sourceId,value.evidence,`${label} image`);if(!evidenceRefs.includes(index))evidenceRefs.push(index);const {sourceId,alt,x,y,width,height}=value;return {sourceId,alt,x,y,width,height};};
 const characters=draft.characters.map((c,i):ChildPlayCharacter=>{const evidenceRefs=[cite(draft.sourceId,c.evidence,`Character ${i+1}`)],image=figure(c.figure,c.name.trim(),evidenceRefs);return {id:`character-${i+1}`,name:c.name.trim(),role:c.role.trim(),puppet:c.puppet,color:c.color,evidenceRefs,...image?{figure:image}:{}};});
 const props=draft.props.slice(0,puppet?1:2).map((p,i):ChildPlayProp=>{const evidenceRefs=[cite(draft.sourceId,p.evidence,`Prop ${i+1}`)],image=figure(p.figure,p.name.trim(),evidenceRefs);return {id:`prop-${i+1}`,name:p.name.trim(),symbol:p.symbol,evidenceRefs,...image?{figure:image}:{}};});
 const stations=draft.stations.slice(0,puppet?2:3).map((s,i)=>({id:`station-${i+1}`,name:s.name.trim(),evidenceRefs:[cite(draft.sourceId,s.evidence,`Place ${i+1}`)]}));
 const goalStation=puppet?'station-2':'station-3';
 const locations:Record<string,string>[] =puppet?[{'prop-1':'station-1'},{'prop-1':'station-1'},{'prop-1':'station-2'},{'prop-1':'station-2'}]:[{'prop-1':'station-1','prop-2':'station-1'},{'prop-1':'station-2','prop-2':'station-1'},{'prop-1':'station-3','prop-2':'station-1'},{'prop-1':'station-1','prop-2':'station-2'}];
 const sceneIds=['begin','next-turn','goal','reflect'];
 const scenes=draft.scenes.map((s,i):ChildPlayActivity['scenes'][number]=>{const line=s.line.trim(),evidenceRefs=[cite(draft.sourceId,line,`Scene ${i+1}`)];if(s.narrationSourceId){const index=cite(s.narrationSourceId,line,`Scene ${i+1} recording transcript`);if(!evidenceRefs.includes(index))evidenceRefs.push(index);}return {id:sceneIds[i],title:s.title.trim(),narrative:line,speakerId:`character-${s.speaker+1}`,propLocations:locations[i],mood:i===2?'celebrating':i===3?'thinking':'ready',evidenceRefs,...i>1?{ending:i===2?'goal':'reflect'}:{},...s.narrationSourceId?{narrationSourceId:s.narrationSourceId}:{}};});
 const actions=draft.actions.map((a,i):ChildPlayActivity['actions'][number]=>({id:`action-${i+1}`,fromSceneId:i===1?'next-turn':'begin',toSceneId:i===0?'next-turn':i===1?'goal':'reflect',actorId:`character-${i===1?2:1}`,kind:puppet?'say':'use-prop',label:a.line.trim(),evidenceRefs:[cite(draft.sourceId,a.evidence,`Action ${i+1}`)],...puppet?{}:{propId:`prop-${i===2?2:1}`,stationId:i===1?'station-3':'station-2'}}));
 const activity:ChildPlayActivity={version:1,id:activityId,kind:'child-play',mode:draft.mode,scaffoldIds:[puppet?'puppet-stories':'pretend-play-stations'],title:draft.title.trim(),instruction:puppet?'Choose a puppet and give it a voice. Notice how your choices change the story.':'Play each character in turn. Choose a prop, then the place where you will use it.',explanation:draft.explanation.trim(),hint:'Read the current scene and think about whose turn it is.',reviewStatus:'needs-review',sourceRefs:refs,characters,props,stations,scenes,actions,objectives:[{id:'first-turn',kind:'perform',actionIds:['action-1'],label:actions[0].label,evidenceRefs:actions[0].evidenceRefs},{id:'second-turn',kind:'perform',actionIds:['action-2'],label:actions[1].label,evidenceRefs:actions[1].evidenceRefs},{id:'prop-goal',kind:'place',propId:'prop-1',stationId:goalStation,label:`${props[0].name} reaches ${stations[puppet?1:2].name}.`,evidenceRefs:scenes[2].evidenceRefs}],startSceneId:'begin',maxTurns:4,caregiverNote:draft.caregiverNote.trim()};
 if(!safeId(activityId)||!activity.title||activity.title.length>200||!activity.explanation||activity.explanation.length>2000)errors.push('Provide a title and an explanation of what the story teaches.');
 // The guided graph is deterministic. Explicit setup/ending quotes must ground its prop positions.
 for(const index of [0,1,2,3])for(const prop of props){const station=stations.find(s=>s.id===locations[index][prop.id])!;const available=activity.sourceRefs.filter((_,i)=>[...scenes[index].evidenceRefs,...prop.evidenceRefs,...station.evidenceRefs].includes(i)).map(r=>r.evidence).join('\n');if(!available.includes(prop.name)||!available.includes(station.name))errors.push(`Scene ${index+1}: source excerpts must describe ${prop.name} at ${station.name}.`);}
 errors.push(...validateChildPlayFields(activity as unknown as Record<string,unknown>));if(!errors.length)errors.push(...validateChildPlaySources(activity,sources));
 return errors.length?{success:false,errors:[...new Set(errors)]}:{success:true,activity};
}
