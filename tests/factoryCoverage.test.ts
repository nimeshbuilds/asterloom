import {describe,it,expect} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {resolveScaffoldRuntime} from '../src/lib/scaffoldRuntime';
import {prepareAutomaticLearning} from '../src/lib/automaticLearning';
import {sourceLearningUnits,segmentSource} from '../src/lib/sourceUnits';
import {validateActivity,evaluateActivity} from '../src/lib/structuredEngine';
import {validateNotebook} from '../src/lib/package';
import {pictureDiscoveryFixture,pictureWordFixture,pictureSources} from '../src/data/pictureFixtures';
import {FACTORY_CORPUS,prepareFactoryCorpus} from './fixtures/factoryCorpus';
describe('whole-source factory and all-recipe boundaries',()=>{
 it('retains every body span and cited heading, with exact answer evidence and valid portable models',()=>{
  for(const {input,notebook} of prepareFactoryCorpus()){
   expect(notebook.sources.map(s=>s.text)).toEqual(input.sources.map(s=>s.text));expect(()=>validateNotebook(notebook)).not.toThrow();
   for(const source of notebook.sources){const units=sourceLearningUnits(source);for(const unit of units)expect(source.text.slice(unit.start,unit.end)).toBe(unit.quote);for(const span of segmentSource(source.text))expect(units.some(u=>u.start<=span.start&&u.end>=span.end)).toBe(true);}
   for(const card of notebook.cards){const source=notebook.sources.find(s=>s.id===card.sourceId)!;expect(source.text.includes(card.evidence)).toBe(true);expect(card.options[card.correctIndex]).toBe(card.answer);expect(card.options.every(option=>source.text.includes(option))).toBe(true);}
   for(const activity of notebook.activities??[]){expect(validateActivity(activity,notebook.sources).success).toBe(true);expect(activity.reviewStatus).toBe('needs-review');expect(evaluateActivity(activity,{})).toMatchObject({correct:null,outcome:'draft-preview',score:0,maxScore:0});}
  }
 });
 it('uses source-supported mechanics and retains sparse/ambiguous/code prose for unscored study',()=>{
  const outputs=new Map(prepareFactoryCorpus().map(x=>[x.notebook.id,x.notebook]));
  for(const [id,kind] of [['procedure','sequence'],['categories','classification'],['relationships','dependency'],['table','data'],['conditional','decision']]as const)expect(outputs.get(`factory-${id}`)?.activities?.map(a=>a.kind)).toEqual([kind]);
  for(const id of ['numbered-facts','ambiguous','code','prose']){const n=outputs.get(`factory-${id}`)!;expect(n.cards).toEqual([]);expect(n.activities??[]).toEqual([]);expect(sourceLearningUnits(n.sources[0]).length).toBeGreaterThan(0);}
  const speech=outputs.get('factory-speech')!;expect(speech.cards).toEqual([]);expect(speech.activities?.[0]).toMatchObject({kind:'media',checkpoints:[{mode:'observation',choices:[],correctChoiceIds:[]}]});
 });
 it('does not unlock any of the 75 recipes from a name, a compatible kind or an unreviewed generated model',()=>{
  const corpus=prepareFactoryCorpus(),activities=corpus.flatMap(x=>x.notebook.activities??[]);expect(SCAFFOLDS).toHaveLength(75);
  for(const scaffold of SCAFFOLDS){const base={ageGroup:scaffold.ages[0],cards:[],activities:[],sources:corpus.flatMap(c=>c.notebook.sources)};expect(resolveScaffoldRuntime(scaffold.id,base).available).toBe(false);expect(resolveScaffoldRuntime(scaffold.id,{...base,activities:activities.map(a=>({...a,scaffoldIds:[scaffold.id]}))}).available).toBe(false);expect(resolveScaffoldRuntime(scaffold.id,{...base,activities:activities.map(a=>({...a,reviewStatus:'reviewed' as const,scaffoldIds:[]}))}).available).toBe(false);}
 });
 it('makes the existing source-picture models discoverable only through their actual recipe modes',()=>{
  for(const [activity,recipe,age] of [[pictureDiscoveryFixture,'discovery-scenes','3-5'],[pictureWordFixture,'word-and-picture-workshop','6-8']]as const){
   expect(validateActivity(activity,pictureSources).success).toBe(true);expect(activity.scaffoldIds).toEqual([recipe]);expect(resolveScaffoldRuntime(recipe,{ageGroup:age,cards:[],activities:[activity],sources:pictureSources}).activityIds).toEqual([activity.id]);
  }
 });
 it('recompiling unchanged sources yields the same task identities and no duplicate generated models',()=>{
  for(const input of FACTORY_CORPUS){const one=prepareAutomaticLearning(input).notebook,two=prepareAutomaticLearning(one).notebook;expect(two.cards).toEqual(one.cards);expect(two.activities).toEqual(one.activities);expect(new Set(two.cards.map(c=>c.id)).size).toBe(two.cards.length);expect(new Set(two.activities?.map(a=>a.id)).size).toBe(two.activities?.length??0);}
 });
});
