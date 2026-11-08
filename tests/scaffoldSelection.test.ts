import {describe,expect,it} from 'vitest';
import {sourceSupportedScaffoldIds} from '../src/lib/scaffoldSelection';
import {resolveScaffoldRuntime} from '../src/lib/scaffoldRuntime';
import {recallAuthoringFixture} from './gameDraftAuthoring.fixture';
import {prepareAutomaticLearning} from '../src/lib/automaticLearning';
import {createNotebook,createSource} from '../src/lib/utils';
import {ACTIVITY_EXAMPLES,EXAMPLE_ACTIVITY_SOURCE} from '../src/lib/structuredEngine';
import {buildCampaign,expeditionInvitation} from '../src/lib/campaign';
import {emptyProgress} from '../src/lib/storage';

describe('source-first activity selection',()=>{
 it('never treats a title, chosen theme, age or learning intention as learning evidence',()=>{
  for(const ageGroup of ['adult','3-5','6-7','8-10']){
   const n=createNotebook({title:'Cybersecurity Minecraft cloud lab',goal:'Prepare for a certification',ageGroup,scaffoldIds:['incident-response-command','cloud-architecture-builder']});
   expect(sourceSupportedScaffoldIds(n)).toEqual([]);
   expect(prepareAutomaticLearning(n).notebook.scaffoldIds).toEqual([]);
  }
 });
 it('picks the actual source structure and does not turn a numbered glossary into a procedure',()=>{
  const glossary=createSource('# Plant glossary\n1. Seed: Contains an embryo from which a new plant can grow.\n2. Leaf: Supports photosynthesis in the plant.\n3. Root: Absorbs water and minerals from the soil.');
  const prepared=prepareAutomaticLearning(createNotebook({sources:[glossary]})).notebook;
  expect(prepared.activities?.some(a=>a.kind==='sequence')).toBe(false);
  expect(prepared.scaffoldIds).not.toContain('process-reconstruction');
  const source=createSource('# Safe reset procedure\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.');
  const n=prepareAutomaticLearning(createNotebook({sources:[source]})).notebook;
  expect(n.activities?.some(a=>a.kind==='sequence')).toBe(true);
  expect(n.scaffoldIds).toContain('process-reconstruction');
  expect(n.scaffoldIds).not.toContain('incident-response-command');
  expect(n.scaffoldIds).not.toContain('cloud-architecture-builder');
 });
 it('requires the bound model, its specific contract and current material even for draft suggestions',()=>{
  const source={...createSource(EXAMPLE_ACTIVITY_SOURCE.text),id:EXAMPLE_ACTIVITY_SOURCE.id};
  const activity={...structuredClone(ACTIVITY_EXAMPLES.find(a=>a.kind==='sequence')!),scaffoldIds:['process-reconstruction'],reviewStatus:'needs-review' as const};
  const n=createNotebook({sources:[source],activities:[activity]});
  expect(sourceSupportedScaffoldIds(n)).toEqual(['process-reconstruction']);
  expect(sourceSupportedScaffoldIds({...n,activities:[{...activity,scaffoldIds:['cloud-architecture-builder']}]})).toEqual([]);
  expect(sourceSupportedScaffoldIds({...n,sources:[{...source,status:'needs-transcript'}]})).toEqual([]);
  expect(sourceSupportedScaffoldIds({...n,sources:[{...source,text:'Unrelated replacement content.'}]})).toEqual([]);
  expect(sourceSupportedScaffoldIds({...n,sources:[]})).toEqual([]);
  expect(n.activities?.[0].reviewStatus).toBe('needs-review');
 });
 it('preserves reviewed legacy recall cards and does not use them to bypass a bound recall model',()=>{
  const s=createSource('Queue: A list of jobs waiting for a worker to run.\nWorker: A process that runs queued jobs.','Queue glossary');
  const prepared=prepareAutomaticLearning(createNotebook({sources:[s]})).notebook;
  const reviewed={...prepared,cards:prepared.cards.map(card=>({...card,reviewStatus:'reviewed' as const}))};
  expect(reviewed.cards.length).toBeGreaterThan(0);expect(sourceSupportedScaffoldIds(reviewed)).toContain('recall-escape-mission');
  expect(resolveScaffoldRuntime('recall-escape-mission',reviewed)).toMatchObject({available:true,mode:'source-practice'});
  const again=prepareAutomaticLearning(reviewed).notebook;expect(again.cards).toEqual(reviewed.cards);
  const fixture=recallAuthoringFixture(),bound={...fixture.activity,scaffoldIds:['recall-escape-mission']};
  const missingSource={...reviewed,activities:[bound]};expect(sourceSupportedScaffoldIds(missingSource)).not.toContain('recall-escape-mission');expect(resolveScaffoldRuntime('recall-escape-mission',missingSource)).toMatchObject({available:false,mode:'structured'});
 });
 it('does not invite a learner back to a stale or missing-source activity',()=>{
  const activity={...structuredClone(ACTIVITY_EXAMPLES.find(a=>a.kind==='sequence')!),scaffoldIds:['process-reconstruction'],reviewStatus:'reviewed' as const};
  const n=createNotebook({activities:[activity]});const progress=emptyProgress(n.id);
  progress.structured={[activity.id]:{response:{order:[]},attempts:0,completed:false,score:0,maxScore:0,updatedAt:new Date().toISOString()}};
  const campaign=buildCampaign(n);
  expect(campaign.unboundActivityIds).toEqual([]);
  expect(expeditionInvitation(n,campaign,progress)).toBeUndefined();
 });
});
