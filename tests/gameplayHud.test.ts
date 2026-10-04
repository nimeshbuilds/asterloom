import {describe,it,expect} from 'vitest';
import {boundedHudValue,recallSessionTotals} from '../src/lib/gameplayHud';
import type {Attempt} from '../src/types';
const attempt=(id:string,cardId:string,at:string,xp:number):Attempt=>({id,cardId,at,xp,correct:true,confidence:'unsure'});
const session={cardIds:['a','b'],startedAt:'2026-10-04T10:00:00.000Z'};
describe('committed gameplay presentation',()=>{
 it('scopes session XP and the last result to the saved start and mission cards',()=>{
  const attempts=[attempt('old','a','2026-10-03T10:00:00.000Z',20),attempt('a1','a','2026-10-04T10:01:00.000Z',20),attempt('outside','c','2026-10-04T10:02:00.000Z',50),attempt('b1','b','2026-10-04T10:03:00.000Z',0)];
  expect(recallSessionTotals({attempts},session,'a')).toEqual({xp:20,lastAttempt:attempts[1]});expect(recallSessionTotals({attempts},session,'b')).toEqual({xp:20,lastAttempt:attempts[3]});expect(recallSessionTotals({attempts},session,'unseen')).toEqual({xp:20});
 });
 it('is stable across resume and an idempotent retry and does not infer rewards from correctness',()=>{
  const correct=attempt('saved','a','2026-10-04T10:01:00.000Z',20),practice=attempt('practice','b','2026-10-04T10:02:00.000Z',0);
  expect(recallSessionTotals({attempts:[correct,practice]},session).xp).toBe(20);expect(recallSessionTotals({attempts:[correct,practice,correct]},session).xp).toBe(20);
  expect(recallSessionTotals(JSON.parse(JSON.stringify({attempts:[correct,practice]})),session)).toEqual({xp:20,lastAttempt:practice});
 });
 it('keeps zero values explicit and bounds malformed display input without manufacturing points',()=>{
  expect(recallSessionTotals({attempts:[]},session)).toEqual({xp:0});expect(recallSessionTotals({attempts:[attempt('x','a','invalid',20)]},session)).toEqual({xp:0});expect(recallSessionTotals({attempts:[]},{...session,startedAt:'invalid'})).toEqual({xp:0});
  expect([boundedHudValue(NaN),boundedHudValue(Infinity),boundedHudValue(-2),boundedHudValue(12,8)]).toEqual([0,0,0,8]);
 });
});
