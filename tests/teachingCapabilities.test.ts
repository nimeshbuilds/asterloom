import {describe,it,expect} from 'vitest';
import {hasExplicitWorkedExampleSource,workedExampleSourceCapability} from '../src/lib/aiLearningPlan';

const source=(text:string)=>({id:'source',text});
const capability=(text:string,start=0,end=text.length)=>workedExampleSourceCapability(source(text),{sourceId:'source',start,end}).workedExample;

describe('conservative worked-example authoring capability',()=>{
 it('omits examples for the actual source-only comparison and completion benchmark inputs',()=>{
  const passages=[
   'Pickup and delivery both move a parcel to a recipient. Only pickup requires collection at the desk; only delivery assigns a courier. A courier assignment alone is not shared.\nPrepared memberships:\nShared > Moves a parcel to a recipient\nPickup only > Collection at the desk\nDelivery only > Assigned courier',
   'An observation records a measurement. An interpretation proposes an explanation. The display reading 12 is a measurement; a weak battery is a proposed explanation.',
  ];
  for(const text of passages){expect(hasExplicitWorkedExampleSource(text)).toBe(false);expect(capability(text)).toBe('omit');}
 });
 it('does not omit any admissible substring when declaring an entire small source ineligible',()=>{
  const text='A reading records a value. A theory proposes a cause.';
  expect(capability(text)).toBe('omit');
  for(let start=0;start<text.length;start++)for(let end=start+1;end<=text.length;end++)expect(hasExplicitWorkedExampleSource(text,start,end)).toBe(false);
 });
 it('retains explicit examples and existing complete procedures labeled outside the citation window',()=>{
  for(const text of ['For example, the display reads 12.','Worked example: read the supplied value.','Example: read the supplied value.','Procedure:\nRead the supplied value.'])expect(capability(text)).toBe('optional-source-only');
  const steps='1. Read the supplied value.\n2. Record the supplied value.';
  for(const prefix of ['# Procedure for a reading\n','Follow these steps to record the supplied value.\n']){
   const text=prefix+steps;
   expect(hasExplicitWorkedExampleSource(text,prefix.length,text.length)).toBe(true);
   expect(capability(text,prefix.length)).toBe('optional-source-only');
  }
  expect(capability('# Observations\n'+steps,'# Observations\n'.length)).toBe('omit');
 });
 it('keeps ambiguous substring boundaries optional without admitting them as complete examples',()=>{
  for(const text of ['This procedure: read a value.','xworked exampletail','A description mentions the method without teaching it.']){
   expect(hasExplicitWorkedExampleSource(text)).toBe(false);
   expect(capability(text)).toBe('optional-source-only');
  }
  const text='xworked exampletail',quote='worked example',start=text.indexOf(quote);
  expect(hasExplicitWorkedExampleSource(text,start,start+quote.length)).toBe(true);
 });
 it('does not widen the window to import an unrelated example elsewhere in the source',()=>{
  const window='A reading records a value.',text=window+'\n\nFor example, a later chapter describes a red signal.';
  expect(hasExplicitWorkedExampleSource(text)).toBe(true);
  expect(capability(text,0,window.length)).toBe('omit');
 });
 it('does not impose omission when source/window identity or bounds are unavailable',()=>{
  const s=source('A reading records a value.');
  for(const window of [{sourceId:'other',start:0,end:s.text.length},{sourceId:s.id,start:-1,end:s.text.length},{sourceId:s.id,start:0,end:s.text.length+1},{sourceId:s.id,start:0,end:0},{sourceId:s.id,start:0.5,end:s.text.length}])expect(workedExampleSourceCapability(s,window).workedExample).toBe('optional-source-only');
 });
});
