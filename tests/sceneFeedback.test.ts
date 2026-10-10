import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {feedbackCuePlan} from '../src/data/reactionProfiles';
import {actionCuePlan} from '../src/lib/actionFeedback';
import {sceneFeedbackPlan} from '../src/lib/sceneFeedback';
import SceneEventEffects from '../src/components/SceneEventEffects';
import ReactionEffects from '../src/components/ReactionEffects';

describe('world mechanism feedback',()=>{
 it('covers every scaffold with a real mechanism and its own motif, using the authored sound clock',()=>{
  const mechanisms=new Set<string>(),renderings=new Set<string>();
  for(const scaffold of SCAFFOLDS){
   const age=scaffold.ages[0],plan=sceneFeedbackPlan('complete',scaffold.id,age),audio=feedbackCuePlan('complete',scaffold.id,age);
   mechanisms.add(plan.mechanism);expect(plan.profile.id).toBe(scaffold.id);
   expect(plan.duration).toBe(audio.maxDuration);expect(plan.beats).toEqual(audio.notes.map(n=>n.at));
   expect(plan.duration).toBeLessThan(2);expect(plan.reward).toBe(true);
   const html=renderToStaticMarkup(createElement(SceneEventEffects,{kind:'complete',scaffoldId:scaffold.id,ageGroup:age}));
   expect(html).toContain(`data-mechanism="${plan.mechanism}"`);expect(html).toContain('class="se-machine"');expect(html).toContain('class="se-world-mark"');
   renderings.add(html);expect(html).not.toMatch(/<image|<foreignObject|https?:\/\//);
  }
  expect(mechanisms.size).toBe(8);expect(renderings.size).toBe(75);
 });
 it('acknowledges response changes and reflection without inventing correctness or XP',()=>{
  for(const kind of ['select','place','move','connect','remove','inspect','reveal','commit','reflection','retry'] as const){
   const plan=sceneFeedbackPlan(kind,'concept-map-repair','adult');expect(plan.reward).toBe(false);
   const html=renderToStaticMarkup(createElement(SceneEventEffects,{kind,scaffoldId:'concept-map-repair'}));
   expect(html).not.toContain('XP');expect(html).toContain('aria-hidden="true"');
   if(kind!=='reflection'&&kind!=='retry')expect(html).not.toContain('class="ae-emblem"');
  }
  const action=sceneFeedbackPlan('connect','concept-map-repair','adult'),audio=actionCuePlan('connect','concept-map-repair','adult');
  expect(action.duration).toBe(audio.maxDuration);expect(action.beats).toEqual(audio.notes.map(n=>n.at));
  expect(sceneFeedbackPlan('remove').reverse).toBe(true);
 });
 it('passes restored and explicit reduced-motion state into the actual mechanism',()=>{
  const restored=renderToStaticMarkup(createElement(ReactionEffects,{outcome:'complete',scaffoldId:'concept-map-repair',animate:false}));
  expect(restored.match(/data-motion="still"/g)).toHaveLength(2);
  const reduced=renderToStaticMarkup(createElement(ReactionEffects,{outcome:'retry',reducedMotion:true}));
  expect(reduced.match(/data-motion="reduced"/g)).toHaveLength(2);
 });
});
