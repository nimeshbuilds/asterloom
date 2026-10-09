import {describe,expect,it} from 'vitest';
import {ACTIVITY_EXAMPLES,evaluateActivityForAuthoring,type ClassificationActivity,type DependencyActivity,type SequenceActivity} from '../src/lib/structuredEngine';

const classification=ACTIVITY_EXAMPLES.find(activity=>activity.kind==='classification') as ClassificationActivity;
const dependency=ACTIVITY_EXAMPLES.find(activity=>activity.kind==='dependency') as DependencyActivity;
describe('feedback names the source objects a learner can actually change',()=>{
 it('quotes complete sequence steps without broken sentence joins or changing their conditions and scores',()=>{
  const base=ACTIVITY_EXAMPLES.find(activity=>activity.kind==='sequence') as SequenceActivity;
  const activity:SequenceActivity={...base,items:[{id:'read',label:'  Read the label on the parcel.  '},{id:'compare',label:'Compare the label\nwith the delivery record.'},{id:'record',label:'Record “received” only if the label matches the U.S. record.'}],constraints:[{before:'read',after:'compare'},{before:'compare',after:'record'}]};
  const original=structuredClone(activity),messages=['Place “Read the label on the parcel.” before “Compare the label with the delivery record.”','Place “Compare the label with the delivery record.” before “Record “received” only if the label matches the U.S. record.”'];
  const retry=evaluateActivityForAuthoring(activity,{order:['compare','read','record']});
  expect(retry).toMatchObject({valid:true,correct:false,outcome:'retry',score:1,maxScore:2});
  expect(retry.details).toEqual([{id:'dependency-0',correct:false,message:messages[0]},{id:'dependency-1',correct:true,message:messages[1]}]);
  const correct=evaluateActivityForAuthoring(activity,{order:['read','compare','record']});expect(correct).toMatchObject({valid:true,correct:true,outcome:'correct',score:2,maxScore:2});expect(correct.details.map(detail=>detail.message)).toEqual(messages);
  expect(evaluateActivityForAuthoring(activity,{order:['read','compare','compare']})).toMatchObject({valid:false,correct:null,score:0,maxScore:0,details:[]});
  expect(activity).toEqual(original);
 });
 it('identifies each misplaced item and distinguishes the prepared groups from the learner’s groups',()=>{
  const result=evaluateActivityForAuthoring(classification,{assignments:{display:['interpretation'],battery:[]}});
  expect(result).toMatchObject({valid:true,correct:false,score:0,maxScore:2});
  expect(result.details[0]).toMatchObject({id:'display',correct:false,message:'“The display reads 12.” — Reviewed groups: Observation. Your groups: Interpretation.'});
  expect(result.details[1].message).toBe('“The battery may be weak.” — Reviewed groups: Interpretation. Your groups: none.');
  const draft=evaluateActivityForAuthoring({...classification,reviewStatus:'needs-review'},{assignments:{display:['observation'],battery:['interpretation']}});
  expect(draft).toMatchObject({valid:true,correct:true,score:2,maxScore:2});expect(draft.details.every(detail=>detail.message.includes('Draft groups:'))).toBe(true);
 });
 it('uses visible node labels for missing and unexpected connections without changing the edge score',()=>{
  const activity:DependencyActivity={...dependency,reviewStatus:'needs-review',nodes:[{id:'internal-01',label:'Request'},{id:'internal-02',label:'Gateway'},{id:'internal-03',label:'Authentication'}],edges:[{from:'internal-01',to:'internal-02',relation:'crosses'},{from:'internal-02',to:'internal-03',relation:'uses'}]};
  const result=evaluateActivityForAuthoring(activity,{edges:[activity.edges[0],{from:'internal-01',to:'internal-03',relation:'uses'}]});
  expect(result).toMatchObject({valid:true,correct:false,score:1,maxScore:3});
  expect(result.details.map(detail=>detail.message)).toEqual(['Connected: “Request” — crosses → “Gateway”.','Connect: “Gateway” — uses → “Authentication”.','Revise “Request” — uses → “Authentication”: this relationship is not in the draft model.']);
  expect(JSON.stringify(result.details)).not.toContain('internal-');
  const success=evaluateActivityForAuthoring({...activity,reviewStatus:'reviewed'},{edges:activity.edges});expect(success).toMatchObject({valid:true,correct:true,score:2,maxScore:2});
 });
});
