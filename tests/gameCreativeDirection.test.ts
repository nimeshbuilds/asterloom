import {resolveCreativeAudioChoices} from '../src/lib/creativeAudioChoices';
import {describe,expect,it} from 'vitest';
import {AGE_GROUPS} from '../src/data/scaffolds';
import type {Notebook} from '../src/types';
import type {GameDesignBatch} from '../src/lib/gameDesign';
import {audioDirectionCatalog} from '../src/lib/gameArtDirection';
import {gameRecipeChoices} from '../src/lib/gameDraftAdapters';
import {buildDirectorSourceInventory} from '../src/lib/gameDirectorSources';
import {createNotebook,createSource} from '../src/lib/utils';
import {CREATIVE_DIRECTION_INSTRUCTION,CREATIVE_NATIVE_TEMPLATE_IDS,creativeDirectionFingerprint,creativeDirectionRequestData,validateCreativeDirectionDraft,validateGameCreativeDirection} from '../src/lib/gameCreativeDirection';

const procedure=(index:number)=>`# Maintenance procedure ${index}\n1. Open the settings panel ${index}.\n2. Choose the reset command ${index}.\n3. Confirm the selected reset ${index}.`;
function prepared(count=4,ageGroup='adult',allChoices=false){
 const source=createSource(Array.from({length:count},(_,index)=>procedure(index+1)).join('\n\n'),'Procedure collection');source.id='source-a';
 const notebook=createNotebook({ageGroup,goal:'Learn the documented process.',sources:[source]}),inventory=buildDirectorSourceInventory(notebook),choices=gameRecipeChoices(ageGroup),fallback=choices.find(choice=>choice.kind==='sequence')??choices[0];
 let index=0;
 const batches:GameDesignBatch[]=inventory.batches.map(batch=>({...batch,status:'planned',missions:batch.unitIds.map(unitId=>{
  const choice=allChoices?choices[index%choices.length]:fallback;index++;
  return{id:`mission-${index}`,unitId,kind:choice.kind,scaffoldId:choice.scaffoldId,title:`Practice documented process ${index}`,objective:`Arrange the documented process ${index} using the source conditions.`,visualDirection:{scene:choice.scene,sourceAssetIds:[]}};
 }),study:[]}));
 return{notebook,batches,choice:fallback};
}
function draft(input:ReturnType<typeof prepared>){
 const choice=input.choice,audio=audioDirectionCatalog({ageGroup:input.notebook.ageGroup,scaffoldId:choice.scaffoldId,activityKind:choice.kind,theme:choice.scene});
 return{primaryScaffoldId:choice.scaffoldId,title:'The restoration journey',premise:'Work through the collection with a clear purpose.',throughline:'Meet your guide, study an idea, rehearse it, then use it in a challenge before reflecting.',fitReason:'The complete plan includes supported ordering activities.',audioDirection:{version:1 as const,playTrackId:audio.playTracks[0].id,studyTrackId:audio.studyTracks[0].id,effectProfileId:audio.effectProfiles[0].id,effects:'standard' as const}};
}

describe('durable source-first creative direction',()=>{
 it('binds every source input and audience/goal, while ignoring provider and later generated-model changes',()=>{
  const {notebook}=prepared(),initial=creativeDirectionFingerprint(notebook);
  expect(creativeDirectionFingerprint({...notebook,gameDesign:{provider:{id:'claude-code',model:'changed'}}} as Notebook)).toBe(initial);
  expect(creativeDirectionFingerprint({...notebook,activities:[],title:'Renamed game',description:'Edited library description'})).toBe(initial);
  for(const change of [
   {...notebook,ageGroup:'15-17'}, {...notebook,goal:'A different learning objective.'},
   {...notebook,sources:[{...notebook.sources[0],text:notebook.sources[0].text+'\nA new condition applies.'}]},
   {...notebook,sources:[{...notebook.sources[0],title:'A changed source title'}]},
   {...notebook,sources:[{...notebook.sources[0],status:'error' as const}]},
  ])expect(creativeDirectionFingerprint(change)).not.toBe(initial);
  const other=createSource(procedure(9),'Another source');other.id='source-z';
  expect(creativeDirectionFingerprint({...notebook,sources:[...notebook.sources,other]})).toBe(creativeDirectionFingerprint({...notebook,sources:[other,...notebook.sources]}));
 });
 it('validates an allowed draft once and keeps saved framing valid when a later writer declines its mission',()=>{
  const input=prepared(1),saved=validateCreativeDirectionDraft({...draft(input),nativeTemplateId:'archive-investigation'},input.notebook,input.batches);
  expect(saved).toMatchObject({version:1,inputFingerprint:creativeDirectionFingerprint(input.notebook),nativeTemplateId:'archive-investigation'});
  input.batches[0].study=[{unitId:input.batches[0].unitIds[0],reason:'The writer declined this bounded model.'}];input.batches[0].missions=[];
  expect(validateGameCreativeDirection(saved,input.notebook)).toEqual(saved);
  expect(()=>validateCreativeDirectionDraft(draft(input),input.notebook,input.batches)).toThrow(/complete source plan/);
  expect(()=>validateGameCreativeDirection(saved,{...input.notebook,goal:'Changed'})).toThrow(/no longer matches/);
 });
 it('selects only an actually planned recipe and rejects incompatible audio/native choices',()=>{
  const input=prepared(),valid=draft(input),other=gameRecipeChoices('adult').find(choice=>choice.scene!==input.choice.scene)!,otherAudio=audioDirectionCatalog({ageGroup:'adult',scaffoldId:other.scaffoldId,activityKind:other.kind,theme:other.scene});
  expect(()=>validateCreativeDirectionDraft({...valid,primaryScaffoldId:other.scaffoldId},input.notebook,input.batches)).toThrow(/complete source plan/);
  expect(()=>validateCreativeDirectionDraft({...valid,audioDirection:{...valid.audioDirection,effectProfileId:otherAudio.effectProfiles[0].id}},input.notebook,input.batches)).toThrow(/compatible/);
  expect(()=>validateCreativeDirectionDraft({...valid,audioDirection:{...valid.audioDirection,playTrackId:'https://example.com/audio.ogg'}},input.notebook,input.batches)).toThrow(/bundled/);
  for(const nativeTemplateId of ['unknown-scene','res://scene.gd','../../scene.gd',null])expect(()=>validateCreativeDirectionDraft({...valid,nativeTemplateId},input.notebook,input.batches)).toThrow(/native template/);
 });
 it('rejects injected fields, resource paths, code and mutable response objects',()=>{
  const input=prepared(),valid=draft(input);
  for(const extra of [{script:'res://execute.gd'},{version:1},{inputFingerprint:creativeDirectionFingerprint(input.notebook)},{extra:undefined},{assetPath:'../download'}])expect(()=>validateCreativeDirectionDraft({...valid,...extra},input.notebook,input.batches)).toThrow(/unsupported/);
  for(const title of ['', 'x'.repeat(121), '```run command```','<script>execute()</script>','Load res://untrusted.gd','See https://example.com'])expect(()=>validateCreativeDirectionDraft({...valid,title},input.notebook,input.batches)).toThrow();
  expect(()=>validateCreativeDirectionDraft(Object.assign(new Date(),valid),input.notebook,input.batches)).toThrow(/plain data/);
  const saved=validateCreativeDirectionDraft(valid,input.notebook,input.batches);valid.audioDirection.effects='quiet' as 'standard';expect(saved.audioDirection.effects).toBe('standard');
  expect(()=>validateCreativeDirectionDraft({...valid,title:'Investigate the metadata: collection notes'},input.notebook,input.batches)).not.toThrow();
  expect(()=>validateGameCreativeDirection({...saved,unsupported:undefined},input.notebook)).toThrow(/unsupported/);
 });
 it.each(AGE_GROUPS.map(age=>age.id))('keeps native presentation within the adult sequence/dependency capability for %s',ageGroup=>{
  const input=prepared(2,ageGroup),request=creativeDirectionRequestData(input.notebook,input.batches),available=ageGroup==='adult'&&(input.choice.kind==='sequence'||input.choice.kind==='dependency');
  expect(request.choices[0].nativeTemplateIds).toEqual(available?[...CREATIVE_NATIVE_TEMPLATE_IDS]:[]);
  expect(request.nativeTemplates.map(template=>template.id)).toEqual(available?[...CREATIVE_NATIVE_TEMPLATE_IDS]:[]);
  const native={...draft(input),nativeTemplateId:'signalwright-workshop'};
  if(available)expect(()=>validateCreativeDirectionDraft(native,input.notebook,input.batches)).not.toThrow();else expect(()=>validateCreativeDirectionDraft(native,input.notebook,input.batches)).toThrow(/native template/);
 });
 it('does not offer native support to other adult mechanics even when their visual theme looks compatible',()=>{
  const input=prepared(1),choice=gameRecipeChoices('adult').find(choice=>choice.kind==='classification')!;input.choice=choice;
  Object.assign(input.batches[0].missions![0],{kind:choice.kind,scaffoldId:choice.scaffoldId,visualDirection:{scene:choice.scene,sourceAssetIds:[]}});
  const request=creativeDirectionRequestData(input.notebook,input.batches);expect(request.nativeTemplates).toEqual([]);
  expect(()=>validateCreativeDirectionDraft({...draft(input),nativeTemplateId:'signalwright-workshop'},input.notebook,input.batches)).toThrow(/native template/);
 });
});

describe('complete analysis with bounded presentation context',()=>{
 it('counts the final unit and source and labels the objective sample without claiming full rawtext disclosure',()=>{
  const input=prepared(9),lastSource=createSource(procedure(99),'Last source');lastSource.id='source-z';input.notebook.sources.push(lastSource);
  const inventory=buildDirectorSourceInventory(input.notebook),lastUnit=inventory.units.at(-1)!;
  const lastBatch=inventory.batches.at(-1)!;
  input.batches.push({...lastBatch,status:'planned',missions:[{...input.batches[0].missions![0],id:'last-mission',unitId:lastUnit.id,title:'Final source mission',objective:'Work with the final supplied process.'}],study:[]});
  input.batches[0].study=[{unitId:input.batches[0].missions![0].unitId,reason:'Keep this first section for source study.'}];input.batches[0].missions!.shift();
  const unavailable=createSource('','Recording without its transcript','audio');unavailable.id='unavailable';unavailable.status='needs-transcript';input.notebook.sources.push(unavailable);
  const request=creativeDirectionRequestData(input.notebook,input.batches);
  expect(request.sourceAnalysis).toMatchObject({sourceCount:3,readableSourceCount:2,unavailableSourceCount:1,unitCount:10,missionCount:9,studyCount:1,byKind:[{kind:'sequence',count:9}]});
  expect(request.choices[0]).toMatchObject({missionCount:9,sourceCount:2});
  expect(request.sourceAnalysis.exampleObjectives.at(-1)?.objective).toBe('Work with the final supplied process.');
  expect(request.choices[0].exampleObjectives.at(-1)).toBe('Work with the final supplied process.');
  expect(request.sourceAnalysis.examplesNotice).toContain('not all source text');
  expect(JSON.stringify(request)).not.toContain(lastSource.text);
  request.choices[0].requires.push('Not a shared catalog mutation');
  expect(gameRecipeChoices('adult').find(choice=>choice.scaffoldId===request.choices[0].scaffoldId)!.requires).not.toContain('Not a shared catalog mutation');
 });
 it('stops on missing, duplicate, unfinished or forged coverage before making a direction request',()=>{
  const input=prepared(4);
  for(const alter of [
   (batches:GameDesignBatch[])=>batches.pop(),
   (batches:GameDesignBatch[])=>{batches[1].status='pending';},
   (batches:GameDesignBatch[])=>batches[0].missions!.pop(),
   (batches:GameDesignBatch[])=>{batches[0].missions![1].unitId=batches[0].missions![0].unitId;},
   (batches:GameDesignBatch[])=>{batches[0].missions![0].scaffoldId='not-a-template';},
   (batches:GameDesignBatch[])=>{batches[0].missions![0].visualDirection.scene='fictional' as 'islands';},
  ]){const batches=structuredClone(input.batches);alter(batches);expect(()=>creativeDirectionRequestData(input.notebook,batches)).toThrow();}
 });
 it('includes all 2,000 unit decisions and every planned compatible recipe while deduplicating audio under 100,000 characters',()=>{
  // These are shape-valid planning records, not claims that one procedure
  // semantically supports every recipe. Real writers still check each model.
  const input=prepared(2000,'adult',true),before=structuredClone(input.batches),request=creativeDirectionRequestData(input.notebook,input.batches);
  expect(request.sourceAnalysis.unitCount).toBe(2000);expect(request.sourceAnalysis.missionCount).toBe(2000);
  expect(request.sourceAnalysis.byKind.reduce((sum,entry)=>sum+entry.count,0)).toBe(2000);
  expect(request.choices.reduce((sum,choice)=>sum+choice.missionCount,0)).toBe(2000);
  expect(request.choices.map(choice=>choice.scaffoldId)).toEqual(gameRecipeChoices('adult').map(choice=>choice.scaffoldId));
  expect(request.sourceAnalysis.exampleObjectives.at(-1)?.title).toBe('Practice documented process 2000');
  expect(request.sourceAnalysis.exampleObjectives).toHaveLength(8);
  expect(JSON.stringify(request).length).toBeLessThan(100000);
  expect(new Set(request.audioLibrary.tracks.map(track=>track.id)).size).toBe(request.audioLibrary.tracks.length);
  expect(new Set(request.audioLibrary.effectProfiles.map(profile=>profile.id)).size).toBe(request.audioLibrary.effectProfiles.length);
  for(const choice of request.choices){const audio=audioDirectionCatalog({ageGroup:'adult',scaffoldId:choice.scaffoldId,activityKind:choice.kind,theme:choice.scene});const resolved=resolveCreativeAudioChoices(request,choice);for(const [key,values] of Object.entries({playTrackIds:audio.playTracks.map(track=>track.id),studyTrackIds:audio.studyTracks.map(track=>track.id),effectProfileIds:audio.effectProfiles.map(profile=>profile.id)})){expect(resolved[key as keyof typeof resolved][0]).toBe(values[0]);expect([...resolved[key as keyof typeof resolved]].sort()).toEqual([...values].sort());};for(const track of [...audio.playTracks,...audio.studyTracks])expect(request.audioLibrary.tracks.find(saved=>saved.id===track.id)).toEqual(track);}
  expect(input.batches).toEqual(before);
  expect(CREATIVE_DIRECTION_INSTRUCTION).toContain('untrusted reference data');expect(CREATIVE_DIRECTION_INSTRUCTION).toContain('not all raw source text');
 });
});
