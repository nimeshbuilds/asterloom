import {scaffoldStorySummary} from './scaffoldStoryContext';
import type {Source} from '../types';
import {SCAFFOLDS} from '../data/scaffolds';
import {SCAFFOLD_RUNTIME,scaffoldRequiredCapabilities,type ScaffoldCapability} from './scaffoldRuntime';
import {ACTIVITY_DRAFT_SCHEMAS,validateActivityDraft,type AssistantActivityKind} from './activityAssistant';
import {validateActivity,type StructuredActivity} from './structuredEngine';

/** Prompt contracts match real bounded engines. A quotation is provenance, not semantic approval. */
export const GAME_DRAFT_SCHEMAS={...ACTIVITY_DRAFT_SCHEMAS,
 'child-play':'Only for an explicit source script that names characters/roles, props, stations, available lines/actions, branching consequences and a story goal. Never invent events or moral rules from generic facts. mode:"puppet-story"|"pretend-play",characters:[{id,name,role,puppet:"round"|"pointed"|"long-ears",color:"sage"|"coral"|"blue"|"gold",evidenceRefs:[sourceRefIndex]}],props:[{id,name,symbol:"apple"|"cup"|"book"|"parcel"|"seed"|"basket"|"token",evidenceRefs}],stations:[{id,name,evidenceRefs}],scenes:[{id,title,narrative:EXACT source line,speakerId,propLocations:{propId:stationId},mood:"ready"|"thinking"|"celebrating",optional ending:"goal"|"reflect",evidenceRefs}],actions:[{id,fromSceneId,toSceneId,actorId,kind:"say"|"use-prop",label:EXACT source action line,optional propId,optional stationId,evidenceRefs}],objectives:[{id,label,kind:"perform",actionIds:[actionId],evidenceRefs} OR {id,label,kind:"place",propId,stationId,evidenceRefs}],startSceneId,maxTurns:integer2..8,caregiverNote. Use2–4characters,1–4props,2–4stations,3–6scenes,2–8actions. Names/roles/lines must occur in their citations. Every scene must be reachable; goal scenes must fulfill every objective. Puppet-story needs two speakers and an explicit meaningful branch. Pretend-play needs distinct props and genuine source-stated location changes. Omit figure/narration assets; prepared puppets are presentation, not factual illustrations.',
 'rule-switch':'Only when source annotations give at least3 objects, TWO distinct named features, categories and values for every object. items:[{id,label,attributes:{featureId:categoryId,otherFeatureId:categoryId},evidenceRefs:[sourceRefIndex]}],rounds:[{id,feature:identifier,featureLabel:EXACT source feature name,label,instruction,categories:[{id,label}],evidenceRefs},{same fields for second distinct feature}],transitionInstruction. Exactly2 rounds,3–8items,2–5categories per round. Each item citation must contain its exact label and both category values; round citations name the feature. The second rule must actually regroup at least one pair, not rename the same partition.',
 construction:'Only when the source states component inventories, compatible ports/connections, costs/limits and the required structure. components:[{id,label,description,maxInstances,ports:[{id,label,direction:"in"|"out",type:identifier,maxConnections}],costs:{resourceId:number},evidenceRefs:[sourceRefIndex]}], resources:[{id,label,unit,limit,evidenceRefs}], requirements:[{id,label,kind:"instances",componentIds:[id],minimum,maximum,evidenceRefs} OR {id,label,kind:"path",from:[componentId],to:[componentId],through:[[componentId]],avoid:[componentId],scope:"some"|"every-target",evidenceRefs}], allowCycles:boolean, requireAllConnected:boolean, referenceBuilds:[{instances:[{id,componentId,x:0..100,y:0..100}],edges:[{from:instanceId,fromPort:portId,to:instanceId,toPort:portId}]}]. Supply at least one feasible referenceBuild, locally checked against ALL limits. Do not invent a physical simulator from a diagram or generic prose.',
 explanation:'Only when the source gives a claim, supporting observations and the reasoning connecting them. pieces:[{id,role:"claim"|"evidence"|"warrant"|"counterpoint"|"rebuttal",text,evidenceRefs:[sourceRefIndex]}], arguments:[{id,label,prompt,evidenceRefs,alternatives:[{id,claimId,evidenceIds:[pieceId],warrantId,explanation,evidenceRefs,optional counterpointId,optional rebuttalId}]}]. Evidence-piece text MUST occur exactly in its cited source quotation. Preserve the source limits and qualifications. Do not invent unsupported distractor claims. Counterpoint/rebuttal are optional as a paired set; omit partner/codeReview.',
 scenario:'Only when the source EXPLICITLY defines an initial case, available actions, resulting transitions/observations, action/resource limits and success conditions. Do not convert ordinary factual prose into invented causal rules. variables:[{id,label,visibility:"visible"|"hidden",type:"boolean"|"number"|"enum",initial,evidenceRefs:[sourceRefIndex],min/max for number,values:[string] for enum}], budget:{label,limit:integer,evidenceRefs}, maxSteps:integer1..8, observations:[{id,label,text,evidenceRefs}], initialObservationIds:[observationId], actions:[{id,label,description,cost:integer,maxUses:integer,optional guard:Rule,evidenceRefs,transitions:[{id,optional when:Rule,effects:[{field:variableId,op:"set"|"add",value}],reveal:[observationId],consequence,evidenceRefs}]}], objectives:[{id,label,when:Rule,requiredObservations:[observationId],evidenceRefs}], successWhen:Rule, optional failureWhen:Rule. Rule is {op:"eq"|"neq"|"gt"|"gte"|"lt"|"lte",field:variableId,value} or {op:"and"|"or",rules:[Rule]} or {op:"not",rule:Rule}. Each action has exactly one unconditional fallback transition LAST; other conditions must not overlap. A success must be reachable within all limits. No scenarioPresentation; this is a bounded authored case, not live-world inference.',
} as const;
export type GameDraftKind=keyof typeof GAME_DRAFT_SCHEMAS;
/** Only capabilities actually represented by the bounded writer contract belong here.
 * Recipe IDs and domain bindings come from the playback registry, never a second hand-picked list. */
export const GAME_WRITER_CAPABILITIES:Readonly<Partial<Record<GameDraftKind,readonly ScaffoldCapability[]>>>={
 'child-play':['child-play:puppet-story','child-play:pretend-play'],
};
export const GAME_FAMILY_RECIPES=Object.fromEntries((Object.keys(GAME_DRAFT_SCHEMAS) as GameDraftKind[]).map(kind=>[
 kind,SCAFFOLD_RUNTIME.filter(runtime=>runtime.engineReady&&runtime.mode==='structured'&&runtime.activityKinds.includes(kind)&&scaffoldRequiredCapabilities(runtime.scaffoldId).every(capability=>GAME_WRITER_CAPABILITIES[kind]?.includes(capability))).map(runtime=>runtime.scaffoldId),
])) as Record<GameDraftKind,string[]>;
export function gameRecipeMetadata(scaffoldId:string){
 const scaffold=SCAFFOLDS.find(item=>item.id===scaffoldId);
 if(!scaffold)throw new Error('Unknown game recipe.');
 return{domain:scaffold.domain,mechanic:scaffold.mechanic,requires:scaffold.prerequisites,
  // Common draft/review boundaries are already in the request's system contract.
  limitations:scaffold.contentContract.limitations.filter(value=>!['Author-reviewed source evidence is required before publishing.','This contract validates shape; it does not establish factual correctness.'].includes(value))};
}
export function gameRecipeChoices(ageGroup:string){
 return(Object.keys(GAME_FAMILY_RECIPES) as GameDraftKind[]).flatMap(kind=>GAME_FAMILY_RECIPES[kind].flatMap(scaffoldId=>{const scaffold=SCAFFOLDS.find(item=>item.id===scaffoldId)!;return scaffold.ages.includes(ageGroup)?[{kind,scaffoldId,name:scaffold.name,scene:scaffold.visual.scene,story:scaffoldStorySummary(scaffoldId,ageGroup),...gameRecipeMetadata(scaffoldId)}]:[];}));
}
/** Creation support audit is deliberately separate from source suitability or game quality. */
export function gameRecipeCoverage(){
 return SCAFFOLD_RUNTIME.map(runtime=>{
  const scaffold=SCAFFOLDS.find(item=>item.id===runtime.scaffoldId)!,kind=runtime.activityKinds.find(candidate=>Object.hasOwn(GAME_DRAFT_SCHEMAS,candidate)) as GameDraftKind|undefined;
  const missingCapabilities=kind?scaffoldRequiredCapabilities(scaffold.id).filter(capability=>!GAME_WRITER_CAPABILITIES[kind]?.includes(capability)):[];
  const supported=runtime.engineReady&&runtime.mode==='structured'&&!!kind&&missingCapabilities.length===0;
  return{scaffoldId:scaffold.id,domain:scaffold.domain,ages:scaffold.ages,kind:kind??null,supported,missingCapabilities,reason:supported?'The bounded writer supports this runtime contract; suitability still depends on the supplied source.':missingCapabilities.length?'The runtime exists, but its specialized authoring mode is not in the bounded AI writer.':'This recipe needs a different content engine or a source/media workflow, not one of these ten writers.'};
 });
}

export function validatePreparedGameDraft(source:Source,excerpt:string,envelope:Record<string,unknown>,id:string,allowed:GameDraftKind[]):StructuredActivity{
 const raw=envelope.activity;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Expected a bounded activity.');const model=raw as Record<string,unknown>,kind=model.kind as GameDraftKind;
 if(!allowed.includes(kind)||!(kind in GAME_DRAFT_SCHEMAS))throw new Error('The activity family is not supported for this audience.');
 if(model.scaffoldIds!==undefined||model.extractedFrom!==undefined)throw new Error('Generated models cannot approve their own recipe bindings or extraction provenance.');
 for(const field of ['sourceRefs','items','nodes','tokens','slots','categories','membership','requirements','components','variables','actions','objectives','resources'])if(Array.isArray(model[field])&&model[field].length>8)throw new Error('The draft exceeds the bounded activity size.');
 for(const field of ['edges','constraints','observations','pieces'])if(Array.isArray(model[field])&&model[field].length>12)throw new Error('The draft exceeds the bounded activity size.');
 if(kind in ACTIVITY_DRAFT_SCHEMAS)return validateActivityDraft({source,excerpt,kind:kind as AssistantActivityKind,ageGroup:'supplied audience',goal:'Use the supplied evidence'},JSON.stringify({activity:model,...(envelope.solution===undefined?{}:{solution:envelope.solution})}),id);
 if(envelope.solution!==undefined||model.scenarioPresentation!==undefined||model.partner!==undefined||model.codeReview!==undefined)throw new Error('Use only the bounded supplied family contract.');
 if(kind==='child-play'&&(Number(model.maxTurns)>8||['characters','props','scenes'].some(key=>Array.isArray(model[key])&&(model[key] as Record<string,unknown>[]).some(item=>item.figure!==undefined||item.narrationSourceId!==undefined))))throw new Error('Use bounded source-scripted play without unprovided images or narration.');
 if(kind==='scenario'&&(typeof model.maxSteps!=='number'||model.maxSteps>8))throw new Error('Keep the prepared case within eight decisions.');
 if(kind==='construction'&&(!Array.isArray(model.referenceBuilds)||model.referenceBuilds.length>2))throw new Error('Supply one or two feasible reference builds.');
 if(kind==='explanation'&&(!Array.isArray(model.arguments)||model.arguments.length>3))throw new Error('Keep the explanation within three source-backed chains.');
 const checked=validateActivity({...model,id,reviewStatus:'needs-review'},[{...source,text:excerpt}]);
 if(!checked.success)throw new Error(checked.errors.slice(0,3).join(' '));
 return checked.value;
}
