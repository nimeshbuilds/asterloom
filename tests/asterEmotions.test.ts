import {describe,expect,it} from 'vitest';
import {ASTER_EMOTIONS,isAsterEmotionForMoment,resolveAsterEmotion,type AsterIntent,type AsterMoment} from '../src/lib/asterEmotions';
import {contextualAsterTip,shouldOfferAsterTip,type AsterGuideContext} from '../src/lib/asterGuidePolicy';
import type {Notebook} from '../src/types';

const moments:AsterMoment[]=['welcome','concept','hint','retry','success','reflection'];
const intents:AsterIntent[]=['reading','evidence','compare','build','plan','predict','observe','question','explain','summarize','pause','restart','farewell','connect','record','orient'];
const notebook:Notebook={id:'emotion-notebook',title:'Aster contexts',description:'',createdAt:'2026-10-05T00:00:00.000Z',updatedAt:'2026-10-05T00:00:00.000Z',ageGroup:'adult',goal:'Understand',theme:'observatory',scaffoldIds:[],sources:[],cards:[],revision:1};

describe('contextual Aster expressions',()=>{
 it('varies between stable task contexts, never between rerenders of the same context',()=>{
  const options={moment:'concept' as const,activityKind:'construction',contextSeed:'notebook:build-1:concept'};
  const first=resolveAsterEmotion(options);
  for(let render=0;render<20;render++)expect(resolveAsterEmotion({...options})).toBe(first);
  const alternatives=new Set(Array.from({length:100},(_,n)=>resolveAsterEmotion({...options,contextSeed:`notebook:build-${n}:concept`}).id));
  expect(alternatives).toEqual(new Set(['building','puzzle-piece']));
  for(const id of alternatives)expect(isAsterEmotionForMoment(id,'concept')).toBe(true);
 });
 it('keeps moment compatibility for every task and explicit intent, including feedback',()=>{
  const kinds=['construction','completion','sequence','classification','decision','dependency','budget','rubric','diagram','scenario','data','explanation','picture-build','media','picture','rule-switch','child-play','unknown'];
  for(const moment of moments)for(const activityKind of kinds)for(const intent of [undefined,...intents]){
   const result=resolveAsterEmotion({moment,activityKind,intent,contextSeed:`lesson:${activityKind}:${intent}`});
   expect(isAsterEmotionForMoment(result.id,moment),`${moment}/${activityKind}/${intent}/${result.id}`).toBe(true);
  }
  // A task-specific pose cannot override a checked result or a retry.
  expect(resolveAsterEmotion({moment:'retry',activityKind:'construction'}).id).toBe('patient-support');
  expect(resolveAsterEmotion({moment:'success',activityKind:'construction'}).id).toBe('quiet-celebration');
 });
 it('requires actual numbered and directional context rather than inventing an interface target',()=>{
  expect(resolveAsterEmotion({moment:'concept',activityKind:'sequence'}).id).toBe('planning');
  expect(resolveAsterEmotion({moment:'concept',activityKind:'completion'}).id).toBe('puzzle-piece');
  for(const [index,id] of ['step-one','step-two','step-three'].entries()){
   expect(resolveAsterEmotion({moment:'concept',step:index+1}).id).toBe(id);
   expect(resolveAsterEmotion({moment:'hint',preferredId:id,step:index+1}).id).toBe(id);
   expect(resolveAsterEmotion({moment:'concept',preferredId:id}).id).not.toBe(id);
  }
  for(const step of [0,-1,1.5,4,NaN,Infinity])expect(resolveAsterEmotion({moment:'concept',activityKind:'sequence',step}).id).toBe('planning');
  for(const direction of ['left','right','up','down'] as const){
   expect(resolveAsterEmotion({moment:'hint',direction}).id).toBe(`pointing-${direction}`);
   expect(resolveAsterEmotion({moment:'concept',preferredId:`pointing-${direction}`}).id).toBe('focused-reading');
  }
  expect(resolveAsterEmotion({moment:'concept',preferredId:'step-three',step:2}).id).toBe('step-two');
  expect(resolveAsterEmotion({moment:'concept',preferredId:'pointing-left',direction:'right'}).id).toBe('pointing-right');
 });
 it('honors compatible authored choices, rejects mismatches, and preserves quiet successes',()=>{
  for(const moment of moments){
   const compatible=ASTER_EMOTIONS.find(item=>item.moments.includes(moment)&&!item.id.startsWith('step-')&&!item.id.startsWith('pointing-'))!;
   expect(resolveAsterEmotion({moment,preferredId:compatible.id,contextSeed:'different mission'}).id).toBe(compatible.id);
  }
  for(let n=0;n<100;n++)for(const preferredId of ['bright-celebration','achievement-star','quiet-celebration',undefined])expect(resolveAsterEmotion({moment:'success',preferredId,quiet:true,contextSeed:`success-${n}`}).id).toBe('quiet-celebration');
  expect(resolveAsterEmotion({moment:'retry',preferredId:'bright-celebration'}).id).toBe('patient-support');
  expect(resolveAsterEmotion({moment:'hint',preferredId:'javascript:alert(1)'}).assetPath).toBe('/assets/aster/emotions/gentle-hint.png');
  expect(resolveAsterEmotion({moment:'retry',preferredId:'reset-and-retry'}).id).toBe('patient-support');
  expect(resolveAsterEmotion({moment:'retry',intent:'restart'}).id).toBe('reset-and-retry');
  expect(resolveAsterEmotion({moment:'reflection',preferredId:'farewell-wave'}).id).toBe('reflective');
  expect(resolveAsterEmotion({moment:'reflection',intent:'farewell'}).id).toBe('farewell-wave');
 });
 it('provides a meaningful automatic context for all50 assets without universal mood cycling',()=>{
  const reached=new Set<string>();
  for(const moment of moments)for(const intent of [undefined,...intents])for(let n=0;n<100;n++)reached.add(resolveAsterEmotion({moment,intent,contextSeed:`source-unit-${n}`}).id);
  for(const step of [1,2,3])reached.add(resolveAsterEmotion({moment:'concept',step}).id);
  for(const direction of ['left','right','up','down'] as const)reached.add(resolveAsterEmotion({moment:'hint',direction}).id);
  expect([...ASTER_EMOTIONS.filter(item=>!reached.has(item.id)).map(item=>item.id)]).toEqual([]);
  // No neutral process message ever points to an arbitrary direction or implies a restart/goodbye.
  for(const moment of moments)for(let n=0;n<100;n++)expect(resolveAsterEmotion({moment,contextSeed:`unit-${n}`}).id).not.toMatch(/^(step-|pointing-|farewell-wave|reset-and-retry)/);
 });
});

describe('Aster message and portrait agreement',()=>{
 it('labels each automatic process tip with the moment actually described',()=>{
  const source={id:'source',title:'Notes',kind:'text' as const,text:'Grounded source content.',status:'ready' as const,addedAt:notebook.createdAt};
  const cases:Array<[AsterGuideContext,AsterMoment]>=[
   [{mode:'library'},'welcome'],
   [{mode:'creation',notebook},'welcome'],
   [{mode:'creation',notebook:{...notebook,sources:[source]},creationRunning:true},'concept'],
   [{mode:'creation',notebook:{...notebook,sources:[{...source,status:'needs-transcript'}]}},'concept'],
   [{mode:'creation',notebook:{...notebook,sources:[source]}},'concept'],
   [{mode:'world',notebook},'welcome'],
   [{mode:'study',notebook},'reflection'],
   [{mode:'play',notebook},'concept'],
   [{mode:'play',notebook,feedback:{outcome:'retry',eventKey:'saved-retry',committed:true}},'retry'],
   [{mode:'play',notebook,feedback:{outcome:'success',eventKey:'saved-success',committed:true}},'success'],
  ];
  for(const [context,moment] of cases)expect(contextualAsterTip(context).moment).toBe(moment);
 });
 it('never celebrates an uncommitted result or automatically shows quiet-mode feedback',()=>{
  for(const outcome of ['success','retry'] as const){
   const context:AsterGuideContext={mode:'play',notebook,feedback:{outcome,eventKey:'pending',committed:false,score:{value:2,max:2,xp:20}}};
   expect(contextualAsterTip(context).moment).toBe('concept');
   expect(contextualAsterTip(context).text).not.toContain('Saved score');
   expect(shouldOfferAsterTip(context,{mode:'helpful',dismissed:[]},{shown:0,lastShownAt:-Infinity},100000)).toBe(false);
   const committed={...context,feedback:{...context.feedback!,committed:true}};
   expect(contextualAsterTip(committed).moment).toBe(outcome);
   expect(shouldOfferAsterTip(committed,{mode:'quiet',dismissed:[]},{shown:0,lastShownAt:-Infinity},100000)).toBe(false);
  }
 });
});
