import {describe,it,expect} from 'vitest';
import {questDirections} from '../src/components/questDirections';
import {campaignTeachingFixture} from './campaignTeaching.fixture';
import type {StructuredActivity} from '../src/lib/structuredEngine';
const sequence=campaignTeachingFixture().activities![0];
describe('quest instructions follow the current visible workspace',()=>{
 it('keeps the source objective and replaces obsolete generated steps with real primary controls',()=>{
  const draft={...sequence,instruction:'Read the teaching first. Then drag each tile to a numbered slot.'};const before=JSON.stringify(draft);const directions=questDirections(draft,'Apply the documented review order while preserving its conditions.');expect(directions.goal).toBe('Apply the documented review order while preserving its conditions.');expect(directions.action).toContain('Move earlier or Move later');expect(directions.detailCollapsed).toBe(true);expect(directions.detail).toBe('drag each tile to a numbered slot.');expect(directions.action).not.toContain('drag each tile');expect(JSON.stringify(draft)).toBe(before);
 });
 it('uses the existing placement control for a large sequence and retains author constraints',()=>{
  const large={...sequence,kind:'sequence',reviewStatus:'reviewed',instruction:'Keep the inspection before the release step.',items:Array.from({length:25},(_,i)=>({id:String(i),label:String(i)}))} as StructuredActivity;const directions=questDirections(large,'Rebuild the route.');expect(directions.action).toContain('Place here');expect(directions.action).not.toContain('Move earlier');expect(directions.detail).toBe(large.instruction);
 });
 it('tells the exact concept/relation/target/commit order without claiming a correct relationship',()=>{
  const dependency={...sequence,kind:'dependency',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{from:'a',to:'b',relation:'needs'}],instruction:'Read the teaching first. Then choose both nodes and attach the relation label.'} as StructuredActivity;const directions=questDirections(dependency,'Connect the source-defined needs.');expect(directions.action).toBe('Choose a starting concept on the map, choose a relationship, then choose the target concept. Use Connect concepts to add the link.');expect(directions.goal).toBe('Connect the source-defined needs.');expect(directions.action).not.toContain('choose both nodes');expect(directions.detail).toBe('choose both nodes and attach the relation label.');expect(directions.detailCollapsed).toBe(true);expect(directions.finish).toContain('arrow goes from');
 });
 it('makes multiple category membership explicit while retaining non-simple task-specific instructions',()=>{
  const classification={...sequence,kind:'classification',categories:[{id:'a',label:'A'}]} as StructuredActivity;expect(questDirections(classification,'Classify the statements.').finish).toContain('more than one group');
  const budget={...sequence,kind:'budget',instruction:'Keep total cost below 20 credits and provide two units of capacity.'} as StructuredActivity;expect(questDirections(budget,'Allocate the resources.').detail).toBe(budget.instruction);
 });
 it('keeps the existing task when no prepared objective is present, without sending the learner back to teaching',()=>{expect(questDirections({...sequence,instruction:'Read the teaching first. Then arrange these three steps.'}).goal).toBe('arrange these three steps.');});
});
