import {describe,it,expect} from 'vitest';
import {buildDirectorSourceInventory,teachingContextWindow,type DirectorSourceUnit,type DirectorTeachingWindow} from '../src/lib/gameDirectorSources';
import {compactTeachingContextWindow,LINKED_TEACHING_CONTEXT_INSTRUCTION,compactAudioDirectionCatalog,LINKED_AUDIO_CATALOG_INSTRUCTION,type PromptTeachingContextWindow} from '../src/lib/gamePromptContext';
import {createNotebook,createSource} from '../src/lib/utils';
import {audioDirectionCatalog} from '../src/lib/gameArtDirection';
import {SCAFFOLDS} from '../src/data/scaffolds';

function decode(unit:DirectorSourceUnit,context:PromptTeachingContextWindow):DirectorTeachingWindow {
 if('excerpt'in context)return context;
 expect(context.primaryUnitId).toBe(unit.id);expect(context.sourceId).toBe(unit.sourceId);
 return{sourceId:context.sourceId,start:context.start,end:context.end,excerpt:context.beforeUnit+unit.excerpt+context.afterUnit};
}
function fixture(){
 const repeated='A matching label is necessary but is not sufficient without the receiving record.';
 const source={...createSource('# Definition\n'+repeated+'\n\n# Procedure\n1. Read the label 🧭.\n2. Compare it with the receiving record.\n3. Record receipt only when the label matches.\n\n'+repeated+'\n\n# Exception\nDo not record a parcel when the record is absent.\nKeep literal \\n characters separate from real line breaks.','Receiving guide'),id:'receiving-source'};
 const notebook=createNotebook({sources:[source]}),inventory=buildDirectorSourceInventory(notebook),unit=inventory.units.find(item=>item.excerpt.includes('1. Read'))!;
 return{notebook,inventory,unit,window:teachingContextWindow(unit,inventory.units,notebook)};
}
describe('lossless prompt source context',()=>{
 it('discloses the full primary unit once, keeping exact neighboring definitions, conditions and source boundaries',()=>{
  const f=fixture(),before=JSON.stringify(f),context=compactTeachingContextWindow(f.unit,f.window);
  expect('primaryUnitId'in context).toBe(true);expect(decode(f.unit,context)).toEqual(f.window);
  expect(decode(f.unit,JSON.parse(JSON.stringify(context)))).toEqual(f.window);
  expect(f.window.excerpt).toBe(f.notebook.sources[0].text.slice(f.window.start,f.window.end));
  expect(JSON.stringify(f)).toBe(before);expect(JSON.stringify(context).length).toBeLessThan(JSON.stringify(f.window).length);
  expect(LINKED_TEACHING_CONTEXT_INSTRUCTION).toContain('beforeUnit + unit.excerpt + afterUnit');expect(LINKED_TEACHING_CONTEXT_INSTRUCTION).toContain('without added separators');expect(LINKED_TEACHING_CONTEXT_INSTRUCTION).toContain('only activity/scoring evidence');
 });
 it('uses the primary unit offsets, not the first matching wording in a neighboring unit',()=>{
  const f=fixture(),excerpt='The same complete rule is repeated for a separate source location. '.repeat(5),before=excerpt+'\r\n\r\n',after='\r\nThe second occurrence has this qualification.';
  const unit={...f.unit,start:before.length,end:before.length+excerpt.length,excerpt},window={sourceId:unit.sourceId,start:0,end:before.length+excerpt.length+after.length,excerpt:before+excerpt+after},context=compactTeachingContextWindow(unit,window);
  expect(context).toMatchObject({beforeUnit:before,afterUnit:after});expect(decode(unit,context)).toEqual(window);
 });
 it('keeps a very short window literal when the reference would add overhead',()=>{
  const f=fixture(),unit={...f.unit,start:0,end:4,excerpt:'Rule'},window={sourceId:unit.sourceId,start:0,end:4,excerpt:unit.excerpt};
  const context=compactTeachingContextWindow(unit,window);expect(context).toEqual(window);expect(context).not.toBe(window);
 });
 it('rejects cross-source, shifted, incomplete and changed primary context instead of silently widening it',()=>{
  const f=fixture();
  for(const unit of [{...f.unit,sourceId:'another-source'},{...f.unit,start:f.unit.start-1},{...f.unit,excerpt:f.unit.excerpt.replace('Read','Guess')},{...f.unit,end:f.window.end+1},{...f.unit,start:NaN}])expect(()=>compactTeachingContextWindow(unit,f.window)).toThrow('complete exact primary');
  for(const window of [{...f.window,end:f.window.end+1},{...f.window,excerpt:f.window.excerpt.slice(1)},{...f.window,start:-1}])expect(()=>compactTeachingContextWindow(f.unit,window)).toThrow('complete exact primary');
 });
 it('keeps a 193-section inventory and every source byte intact while reducing duplicated disclosure',()=>{
  const source={...createSource(Array.from({length:193},(_,i)=>`# Receiving procedure ${i+1}\n1. Read the label for parcel ${i+1}.\n2. Compare it with the corresponding record.\n3. Record receipt only when the label matches.\n\n${'A readable label alone is insufficient; an absent or different record must be corrected before receipt is recorded. '.repeat(7)}`).join('\n\n'),'Receiving handbook'),id:'benchmark-source'},notebook=createNotebook({sources:[source]}),inventory=buildDirectorSourceInventory(notebook),before=JSON.stringify({notebook,inventory});
  expect(inventory.units).toHaveLength(193);expect(inventory.batches).toHaveLength(65);
  let originalBytes=0,compactBytes=0;const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
  for(const unit of inventory.units){const window=teachingContextWindow(unit,inventory.units,notebook),compact=compactTeachingContextWindow(unit,window);expect(decode(unit,compact)).toEqual(window);originalBytes+=bytes({unit,window});compactBytes+=bytes({unit,window:compact});}
  expect(compactBytes).toBeLessThan(originalBytes*0.85);expect(JSON.stringify({notebook,inventory})).toBe(before);expect(buildDirectorSourceInventory(notebook)).toEqual(inventory);
 });
});

describe('lossless prompt music choices',()=>{
 it('keeps every compatible choice and preferred order for all scaffolds and ages',()=>{
  let beforeBytes=0,afterBytes=0;
  for(const scaffold of SCAFFOLDS)for(const ageGroup of scaffold.ages){
   const catalog=audioDirectionCatalog({scaffoldId:scaffold.id,ageGroup}),before=JSON.stringify(catalog),compact=compactAudioDirectionCatalog(catalog);
   const decoded={...compact,studyTracks:compact.studyTracks.map(track=>'name'in track?track:compact.playTracks.find(play=>play.id===track.id))};
   expect(decoded,`${scaffold.id}/${ageGroup}`).toEqual(catalog);expect(compact.studyTracks.map(track=>track.id)).toEqual(catalog.studyTracks.map(track=>track.id));expect(compact.playTracks[0]?.id).toBe(catalog.playTracks[0]?.id);expect(compact.effectProfiles).toEqual(catalog.effectProfiles);expect(JSON.stringify(catalog)).toBe(before);
   beforeBytes+=new TextEncoder().encode(before).length;afterBytes+=new TextEncoder().encode(JSON.stringify(compact)+LINKED_AUDIO_CATALOG_INSTRUCTION).length;
  }
  expect(afterBytes).toBeLessThan(beforeBytes*0.85);expect(LINKED_AUDIO_CATALOG_INSTRUCTION).toContain('COMPLETE descriptor');
 });
 it('retains a full study descriptor when no identical play descriptor exists',()=>{
  const catalog=audioDirectionCatalog({scaffoldId:'process-reconstruction',ageGroup:'adult'}),study=catalog.studyTracks[0];
  const absent={...catalog,playTracks:catalog.playTracks.filter(track=>track.id!==study.id)},different={...catalog,playTracks:catalog.playTracks.map(track=>track.id===study.id?{...track,mood:'Different saved metadata'}:track)};
  expect(compactAudioDirectionCatalog(absent).studyTracks[0]).toEqual(study);expect(compactAudioDirectionCatalog(different).studyTracks[0]).toEqual(study);
  expect(compactAudioDirectionCatalog({playTracks:[],studyTracks:[],effectProfiles:[]})).toEqual({playTracks:[],studyTracks:[],effectProfiles:[]});
 });
});
