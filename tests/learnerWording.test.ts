import {describe,it,expect} from 'vitest';
import {learnerControlWording} from '../src/lib/learnerWording';

describe('truthful wording for prepared game controls',()=>{
 it('does not grant human review to generated feedback or relation controls',()=>{
  expect(learnerControlWording('Inspect the reviewed membership feedback. Attach a reviewed relation label. Compare each reviewed pairing with the condition still visible on its item.',false)).toBe('Inspect the prepared membership feedback. Attach a prepared relation label. Compare each prepared pairing with the condition still visible on its item.');
 });
 it('retains real review status and subject statements about peer-reviewed evidence',()=>{
  const text='Inspect the reviewed membership feedback.';
  expect(learnerControlWording(text,true)).toBe(text);
  const subject='The peer-reviewed study reviewed pairing behavior and reports its conditions.';
  expect(learnerControlWording(subject,false)).toBe(subject);
 });
});
