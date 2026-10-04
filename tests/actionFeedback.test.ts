import {describe,it,expect} from 'vitest';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {actionCuePlan,activityActionCue,lessonActionCue,type GameActionCue} from '../src/lib/actionFeedback';
describe('action sound design',()=>{
 it('prepares distinct world identities and short, quiet gestures for every scaffold',()=>{
  const identities=new Set<string>();
  for(const scaffold of SCAFFOLDS){
   const plans=(['select','place','move','connect','remove','inspect','reveal','commit'] as GameActionCue[]).map(k=>actionCuePlan(k,scaffold.id,'adult'));
   identities.add(JSON.stringify(plans.map(p=>({instrument:p.instrument,notes:p.notes}))));
   expect(new Set(plans.map(p=>JSON.stringify(p.notes))).size).toBe(8);
   for(const p of plans){expect(p.maxDuration).toBeLessThan(.4);for(const n of p.notes){expect(n.velocity).toBeLessThan(.2);expect(n.midi).toBeGreaterThan(40);expect(n.midi).toBeLessThan(95);}}
   expect(actionCuePlan('place',scaffold.id,'3-5').notes[0].velocity).toBeLessThan(plans[1].notes[0].velocity);
  }
  expect(identities.size).toBe(SCAFFOLDS.length);
 });
 it.each([
  [{order:['a','b']},{order:['b','a']},'move'],
  [{edges:[]},{edges:[{from:'a',to:'b'}]},'connect'],
  [{edges:[{from:'a',to:'b'}]},{edges:[]},'remove'],
  [{instances:[]},{instances:[{id:'a',x:10}]},'place'],
  [{instances:[{id:'a',x:10}]},{instances:[{id:'a',x:20}]},'move'],
  [{slotTokens:{a:''}},{slotTokens:{a:'token'}},'place'],
  [{assignments:{a:['b']}},{assignments:{a:[]}},'remove'],
  [{evidenceRows:{a:[]}},{evidenceRows:{a:['row']}},'place'],
  [{view:{inspectedRowId:''}},{view:{inspectedRowId:'row'}},'inspect'],
  [{actions:[]},{actions:['route']},'commit'],
  [{hint:false},{hint:true},'reveal'],
  [{choiceId:''},{choiceId:'a'},'select'],
 ])('acknowledges meaningful action %#',(a,b,expected)=>expect(activityActionCue(a,b)).toBe(expected));
 it('never sounds on typing, playback, unchanged responses or restoring snapshots',()=>{
  expect(activityActionCue({input:'a'},{input:'answer'})).toBeNull();
  expect(activityActionCue({evidenceRows:{},answers:{q:'1'}},{evidenceRows:{},answers:{q:'123'}})).toBeNull();
  expect(activityActionCue({activeCheckpointId:'q',answers:{q:'one'}},{activeCheckpointId:'q',answers:{q:'one note'}})).toBeNull();
  expect(activityActionCue({activeCheckpointId:'q',answers:{q:[]}},{activeCheckpointId:'q',answers:{q:['choice']}})).toBe('select');
  expect(activityActionCue({mediaPositions:{a:1}},{mediaPositions:{a:2}})).toBeNull();
  expect(activityActionCue({order:['a']},{order:['a']})).toBeNull();
  expect(lessonActionCue({practice:{explanation:'a'}},{practice:{explanation:'answer'}})).toBeNull();
  expect(lessonActionCue({mediaPositions:{a:1}},{mediaPositions:{a:2}})).toBeNull();
  expect(lessonActionCue({rehearsal:{answers:{slot:''}}},{rehearsal:{answers:{slot:'tile'}}})).toBe('place');
 });
});
