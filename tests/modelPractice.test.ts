import {describe,it,expect} from 'vitest';
import {modelPracticeFeedback,modelPracticeReflection,modelPracticeResponse,savedModelPracticeFeedback} from '../src/lib/modelPractice';
import {evaluateActivity,type SequenceActivity,type RubricActivity} from '../src/lib/structuredEngine';
import {puppetStoryFixture} from '../src/data/childPlayFixtures';
import {initialChildPlayResponse,advanceChildPlay} from '../src/lib/childPlayEngine';
import {pictureDiscoveryFixture} from '../src/data/pictureFixtures';
import {initialPictureResponse} from '../src/lib/pictureEngine';
import {ruleSwitchFixture} from '../src/data/ruleSwitchFixtures';
import {initialRuleSwitchResponse} from '../src/lib/ruleSwitchEngine';
const activity:SequenceActivity={version:1,id:'draft-sequence',kind:'sequence',title:'Restore service',instruction:'Arrange the two steps.',sourceRefs:[{sourceId:'source',evidence:'Restore the dependency before restarting the service.'}],reviewStatus:'needs-review',explanation:'The dependency must be restored first.',hint:'Inspect the order in the source.',items:[{id:'restore',label:'Restore dependency'},{id:'restart',label:'Restart service'}],constraints:[{before:'restore',after:'restart'}]};
describe('model practice feedback stays separate from learning credit',()=>{
 it('shows rule-based progress for a valid draft without changing the learner evaluator',()=>{
  const response={order:['restore','restart']};
  expect(modelPracticeFeedback(activity,response)).toMatchObject({correct:true,score:1,maxScore:1});
  expect(evaluateActivity(activity,response)).toMatchObject({valid:false,correct:null,outcome:'draft-preview',score:0,maxScore:0});
 });
 it('gives revision feedback, then recomputes the saved result from rules, ignoring injected scores',()=>{
  expect(modelPracticeFeedback(activity,{order:['restart','restore']})).toMatchObject({correct:false,score:0,maxScore:1});
  expect(savedModelPracticeFeedback(activity,{order:['restore','restart'],_draft:{checked:true,practiceScore:100000}})).toMatchObject({score:1,maxScore:1});
  expect(savedModelPracticeFeedback(activity,{order:['restart','restore'],_draft:{checked:true,practiceScore:100000}})).toMatchObject({score:0,maxScore:1});
 });
 it('does not show unchecked or malformed responses as a saved score',()=>{
  expect(savedModelPracticeFeedback(activity,{order:['restore','restart'],_draft:{checked:false}})).toBeUndefined();
  expect(savedModelPracticeFeedback(activity,{order:['restore','restore'],_draft:{checked:true}})).toBeUndefined();
  expect(modelPracticeFeedback(activity,null)).toBeUndefined();
 });
 it('leaves reviewed work to the normal evaluator and never mutates the response',()=>{
  const response={order:['restore','restart'],_draft:{checked:true}},snapshot=JSON.stringify(response);
  expect(modelPracticeFeedback({...activity,reviewStatus:'reviewed'},response)).toBeUndefined();
  expect(savedModelPracticeFeedback(activity,response)?.correct).toBe(true);
  expect(JSON.stringify(response)).toBe(snapshot);
 });
 it('keeps strict story practice identical through saved lesson metadata without mutating it',()=>{
  const story={...puppetStoryFixture,reviewStatus:'needs-review' as const};
  let response=initialChildPlayResponse(story);
  for(const action of ['ada-asks','bo-shares']){const next=advanceChildPlay(story,response,action);if(!next.success)throw Error(next.error);response=next.response;}
  const clean=modelPracticeFeedback(story,response);expect(clean).toMatchObject({correct:true,score:3,maxScore:3});
  const persisted={...response,_draft:{checked:true,hintUsed:true,lesson:{stage:'quest'},practiceScore:100000}},snapshot=JSON.stringify(persisted);
  expect(modelPracticeFeedback(story,persisted)).toEqual(clean);
  expect(savedModelPracticeFeedback(story,persisted)).toEqual(clean);
  expect(evaluateActivity(story,response)).toMatchObject({valid:false,correct:null,outcome:'draft-preview',score:0,maxScore:0});
  expect(JSON.stringify(persisted)).toBe(snapshot);
 });
 it('does not hide unexpected story answer fields or convert inherited objects into valid answers',()=>{
  const story={...puppetStoryFixture,reviewStatus:'needs-review' as const},response=initialChildPlayResponse(story);
  expect(modelPracticeFeedback(story,{...response,_draft:{checked:true},giveFullCredit:true})).toBeUndefined();
  const inherited=Object.assign(Object.create({inherited:'unexpected'}),response,{_draft:{checked:true}});
  expect(modelPracticeFeedback(story,inherited)).toBeUndefined();
 });
 it('preserves strict picture and rule-change feedback through the saved metadata envelope',()=>{
  const picture={...pictureDiscoveryFixture,reviewStatus:'needs-review' as const};
  const pictureResponse={...initialPictureResponse(picture),phase:'play' as const,answers:Object.fromEntries(picture.rounds.map(round=>[round.id,round.correctTokenIds[0]]))};
  const sorting={...ruleSwitchFixture,reviewStatus:'needs-review' as const};
  const sortingResponse={...initialRuleSwitchResponse(sorting),phase:'second' as const,firstCommitted:true,switchAcknowledged:true,assignments:Object.fromEntries(sorting.rounds.map(round=>[round.id,Object.fromEntries(sorting.items.map(item=>[item.id,item.attributes[round.feature]]))]))};
  for(const [model,response] of [[picture,pictureResponse],[sorting,sortingResponse]] as const){
   const clean=modelPracticeFeedback(model,response);expect(clean?.correct).toBe(true);expect(clean!.score).toBe(clean!.maxScore);
   const saved={...response,_draft:{checked:true,hintUsed:true,lesson:{stage:'quest'}}},snapshot=JSON.stringify(saved);
   expect(modelPracticeFeedback(model,saved)).toEqual(clean);expect(savedModelPracticeFeedback(model,saved)).toEqual(clean);
   expect(modelPracticeFeedback(model,{...saved,unknownAnswer:true})).toBeUndefined();expect(JSON.stringify(saved)).toBe(snapshot);
  }
 });
 it('removes only own reserved metadata from plain answers',()=>{
  const untouched={order:['restore','restart']};expect(modelPracticeResponse(untouched)).toBe(untouched);
  const own=Object.assign(Object.create(null),{order:['restore','restart'],_draft:{checked:true},unexpected:true});
  expect(modelPracticeResponse(own)).toEqual({order:['restore','restart'],unexpected:true});expect(Object.hasOwn(own,'_draft')).toBe(true);
  const inherited=Object.assign(Object.create({_draft:{checked:true}}),{order:['restore','restart']});expect(modelPracticeResponse(inherited)).toBe(inherited);
  for(const value of [null,42,'answer',[]])expect(modelPracticeResponse(value)).toBe(value);
 });
});

it('keeps actionable rule feedback for generated games without granting reviewed mastery',()=>{
 const failed=modelPracticeFeedback(activity,{order:['restart','restore']});
 expect(failed?.correct).toBe(false);
 expect(failed?.details.some(detail=>detail.correct===false&&detail.message.length>0)).toBe(true);
 const solved=modelPracticeFeedback(activity,{order:['restore','restart']});
 expect(solved?.details.every(detail=>detail.correct!==false)).toBe(true);
 expect(evaluateActivity(activity,{order:['restore','restart']}).outcome).toBe('draft-preview');
});


it('acknowledges a completed source reflection without pretending it was automatically correct',()=>{
 const reflection:RubricActivity={version:1,id:'reflection',kind:'rubric',mode:'self-assessment',title:'Reflect on the decision',instruction:'Review your source observation.',sample:'How did the conditions shape your decision?',criteria:[{id:'conditions',label:'I considered the stated conditions',levels:['I need another look','I can explain the conditions']}],sourceRefs:activity.sourceRefs,reviewStatus:'needs-review',explanation:'Compare your reflection with the source.',hint:'Keep the conditions with the decision.'};
 expect(modelPracticeReflection(reflection,{ratings:{conditions:-1}})).toBe(false);
 expect(modelPracticeReflection(reflection,{ratings:{conditions:1}})).toBe(true);
 expect(modelPracticeFeedback(reflection,{ratings:{conditions:1}})).toBeUndefined();
 expect(evaluateActivity(reflection,{ratings:{conditions:1}})).toMatchObject({valid:false,correct:null,score:0,outcome:'draft-preview'});
});
