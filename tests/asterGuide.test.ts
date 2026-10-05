import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Notebook} from '../src/types';
import {ASTER_EMOTIONS,asterEmotionCatalog,isAsterEmotionForMoment,resolveAsterEmotion,type AsterMoment} from '../src/lib/asterEmotions';
import {asterMissionHelp,contextualAsterTip,shouldOfferAsterTip,type AsterGuideContext} from '../src/lib/asterGuidePolicy';
import {CLEAN_DATA_CONSTRUCTION,COMPOSITION_EXAMPLE_SOURCE} from '../src/lib/compositionExamples';
import {isCurrentEvidence} from '../src/lib/evidence';
const notebook:Notebook={id:'guide-notebook',title:'A source workshop',description:'',createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z',ageGroup:'adult',goal:'Understand',theme:'observatory',scaffoldIds:['build-to-specification'],sources:[COMPOSITION_EXAMPLE_SOURCE],cards:[],activities:[CLEAN_DATA_CONSTRUCTION],revision:1};
const context:AsterGuideContext={notebook,mode:'creation'};
describe('Aster guidance policy',()=>{
 it('limits automatic guidance, respects quiet/off, and never introduces automatic source facts',()=>{
  const tip=contextualAsterTip(context);expect(tip.text).not.toContain(CLEAN_DATA_CONSTRUCTION.hint);
  expect(shouldOfferAsterTip(context,{mode:'helpful',dismissed:[]},{shown:0,lastShownAt:-Infinity},1000)).toBe(true);
  for(const mode of ['quiet','off'] as const)expect(shouldOfferAsterTip(context,{mode,dismissed:[]},{shown:0,lastShownAt:-Infinity},1000)).toBe(false);
  expect(shouldOfferAsterTip(context,{mode:'helpful',dismissed:[tip.id]},{shown:0,lastShownAt:-Infinity},1000)).toBe(false);
  expect(shouldOfferAsterTip(context,{mode:'helpful',dismissed:[]},{shown:4,lastShownAt:-Infinity},100000)).toBe(false);
  expect(shouldOfferAsterTip(context,{mode:'helpful',dismissed:[]},{shown:1,lastShownAt:99000},100000)).toBe(false);
  expect(shouldOfferAsterTip({...context,mode:'play'},{mode:'helpful',dismissed:[]},{shown:0,lastShownAt:-Infinity},100000)).toBe(false);
 });
 it('announces only explicit committed finite scores and remembers each event separately',()=>{
  const feedback={outcome:'success' as const,eventKey:'saved-1',committed:true,score:{value:3,max:4,xp:20}};
  const saved={...context,mode:'play' as const,feedback};const tip=contextualAsterTip(saved);expect(tip.text).toContain('Saved score: 3 / 4.');expect(tip.text).toContain('20 XP');
  const preferences={mode:'helpful' as const,dismissed:[tip.id]};expect(shouldOfferAsterTip(saved,preferences,{shown:0,lastShownAt:-Infinity},100000)).toBe(false);expect(shouldOfferAsterTip({...saved,feedback:{...feedback,eventKey:'saved-2'}},preferences,{shown:0,lastShownAt:-Infinity},100000)).toBe(true);
  const draft={...saved,feedback:{...feedback,committed:false}};expect(contextualAsterTip(draft).text).not.toContain('Saved score');expect(shouldOfferAsterTip(draft,{mode:'helpful',dismissed:[]},{shown:0,lastShownAt:-Infinity},100000)).toBe(false);
  for(const score of [{value:NaN},{value:-1},{value:4,max:2},{value:3,xp:-20}])expect(contextualAsterTip({...saved,feedback:{...feedback,score}}).text).not.toContain('Saved score');
 });
 it('reveals only reviewed current authored guidance with exact source references',()=>{
  const help=asterMissionHelp(notebook,CLEAN_DATA_CONSTRUCTION.id)!;expect(help.text).toBe(CLEAN_DATA_CONSTRUCTION.hint);expect(help.citations).toHaveLength(1);expect(help.citations.every(ref=>isCurrentEvidence(ref,notebook.sources))).toBe(true);expect(help.citations[0].quote).toBe(CLEAN_DATA_CONSTRUCTION.sourceRefs[0].evidence);
  expect(asterMissionHelp({...notebook,activities:[{...CLEAN_DATA_CONSTRUCTION,reviewStatus:'needs-review'}]},CLEAN_DATA_CONSTRUCTION.id)).toBeUndefined();expect(asterMissionHelp({...notebook,sources:[{...COMPOSITION_EXAMPLE_SOURCE,text:'changed'}]},CLEAN_DATA_CONSTRUCTION.id)).toBeUndefined();
 });
});
describe('curated companion poses',()=>{
 it('has50 unique bounded portrait IDs, valid moment roles and no external/executable paths',()=>{
  expect(ASTER_EMOTIONS).toHaveLength(50);expect(new Set(ASTER_EMOTIONS.map(item=>item.id)).size).toBe(50);for(const emotion of ASTER_EMOTIONS){expect(emotion.assetPath).toBe(`/assets/aster/emotions/${emotion.id}.png`);expect(emotion.pose.length).toBeGreaterThan(20);expect(emotion.moments.length).toBeGreaterThan(0);for(const moment of emotion.moments)expect(isAsterEmotionForMoment(emotion.id,moment)).toBe(true);}
  for(const moment of ['welcome','concept','hint','retry','success','reflection'] as AsterMoment[])expect(asterEmotionCatalog(moment).length).toBeGreaterThan(1);
 });
 it('honors compatible AI choices while rejecting unsafe or mismatched choices and quieter-success overrides',()=>{
  expect(resolveAsterEmotion({moment:'hint',preferredId:'source-check'}).id).toBe('source-check');expect(resolveAsterEmotion({moment:'retry',preferredId:'bright-celebration'}).id).toBe('patient-support');expect(resolveAsterEmotion({moment:'welcome',preferredId:'https://example.com/a.png'}).id).toBe('welcome-wave');expect(resolveAsterEmotion({moment:'success',preferredId:'bright-celebration',quiet:true}).id).toBe('quiet-celebration');expect(resolveAsterEmotion({moment:'concept',activityKind:'construction'}).id).toBe('building');
 });
});
beforeEach(()=>{vi.resetModules();});afterEach(()=>{vi.unstubAllGlobals();});
describe('local companion preferences',()=>{
 it('retains quiet/off and dismissal across reload, and works when storage is unavailable',async()=>{
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
  const policy=await import('../src/lib/asterGuidePolicy');policy.setAsterPreferences({mode:'quiet'});policy.dismissAsterTip(contextualAsterTip(context));vi.resetModules();const restored=await import('../src/lib/asterGuidePolicy');expect(restored.getAsterPreferences()).toMatchObject({mode:'quiet',dismissed:[contextualAsterTip(context).id]});restored.setAsterPreferences({mode:'off'});vi.resetModules();expect((await import('../src/lib/asterGuidePolicy')).getAsterPreferences().mode).toBe('off');
  vi.stubGlobal('localStorage',{getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}});vi.resetModules();const memory=await import('../src/lib/asterGuidePolicy');expect(()=>memory.setAsterPreferences({mode:'quiet'})).not.toThrow();expect(memory.getAsterPreferences().mode).toBe('quiet');
 });
});
