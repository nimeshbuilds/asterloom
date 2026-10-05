import {describe,it,expect} from 'vitest';
import {modelPracticeFeedback,savedModelPracticeFeedback} from '../src/lib/modelPractice';
import {evaluateActivity,type SequenceActivity} from '../src/lib/structuredEngine';
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
});
