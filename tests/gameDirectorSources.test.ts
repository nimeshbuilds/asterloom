import {describe,it,expect} from 'vitest';
import {buildDirectorSourceInventory,directorInputRevision,assertDirectorProseEvidence,MIXED_CODE_PROSE_LIMITATION} from '../src/lib/gameDirectorSources';
import {createNotebook,createSource} from '../src/lib/utils';
import {compileNotebook} from '../src/lib/compiler';
import {sourceLearningUnits} from '../src/lib/sourceUnits';

const profile={provider:'compatible',model:'test-model',baseUrl:'http://127.0.0.1:11434/v1'};
describe('complete bounded director source inventory',()=>{
 it('includes late chapters and later sources exactly once, without a first-six disclosure cap',()=>{
  const sources=Array.from({length:3},(_,source)=>createSource(Array.from({length:7},(_,section)=>`# Source ${source} chapter ${section}\nThe documented observation in this chapter records a distinct example numbered ${section}. Its limitations remain part of this passage.`).join('\n\n'),`Source ${source}`));
  const inventory=buildDirectorSourceInventory({sources}),covered=inventory.batches.flatMap(b=>b.unitIds);
  expect(inventory.units).toHaveLength(21);expect(new Set(covered).size).toBe(21);expect(covered).toEqual(inventory.units.map(u=>u.id));
  expect(inventory.units.at(-1)?.title).toContain('chapter 6');
  for(const batch of inventory.batches){const units=batch.unitIds.map(id=>inventory.units.find(u=>u.id===id)!);expect(units.length).toBeLessThanOrEqual(3);expect(units.reduce((sum,u)=>sum+u.excerpt.length,0)).toBeLessThanOrEqual(12000);}
  for(const u of inventory.units)expect(sources.find(s=>s.id===u.sourceId)!.text.slice(u.start,u.end)).toBe(u.excerpt);
 });
 it('retains exact coverage when grouping healthy pieces and labels unsafe units for study',()=>{
  const source=createSource('# Notes\n'+Array.from({length:50},(_,i)=>`Observation ${i} preserves a source condition with enough explanation to understand its scope.`).join('\n\n')+'\n\n# Source code\n```js\nconst answer = 42;\n```\n\n# Label\nShort label.','Mixed source');
  const inventory=buildDirectorSourceInventory({sources:[source]});
  for(const original of sourceLearningUnits(source))expect(inventory.units.some(unit=>unit.sourceId===source.id&&unit.start<=original.start&&unit.end>=original.end)).toBe(true);
  expect(inventory.units.filter(u=>!u.missionEligible).map(u=>u.limitation).join(' ')).toContain('code');
  expect(inventory.units.find(u=>u.excerpt==='Short label.')?.missionEligible).toBe(false);
 });
 it('keeps mixed technical units whole while allowing citations to useful prose and keeping code inert',()=>{
  const before='Publisher: A component that sends messages to a named topic.',after='Subscriber: A component that receives messages from a subscribed topic.';
  const source=createSource('# Events\n'+before+'\n\n```js\npublish("weather", reading);\n```\n\n'+after,'Event guide');
  const [unit]=buildDirectorSourceInventory({sources:[source]}).units,[original]=sourceLearningUnits(source);
  expect(unit).toMatchObject({id:original.id,start:original.start,end:original.end,missionEligible:true,limitation:MIXED_CODE_PROSE_LIMITATION});
  expect(unit.excerpt).toBe(source.text.slice(unit.start,unit.end));expect(unit.excerpt).toContain('publish("weather", reading);');expect(unit.excerpt).toContain(after);
  expect(()=>assertDirectorProseEvidence(unit,[source],[{sourceId:source.id,evidence:before},{sourceId:source.id,evidence:after}])).not.toThrow();
  for(const evidence of ['publish("weather", reading);',unit.excerpt,before+'\n\n```js'])expect(()=>assertDirectorProseEvidence(unit,[source],[{sourceId:source.id,evidence}])).toThrow(/non-code/);
  expect(buildDirectorSourceInventory({sources:[createSource('# Code\n```js\npublish("weather", reading);\n```')]}).units[0].missionEligible).toBe(false);
 });
 it('requires a teaching citation’s actual location to be prose even when identical words also occur outside code',()=>{
  const statement='A publisher sends messages to a named topic.';
  const source=createSource('# Events\n```text\n'+statement+'\n```\n\n'+statement),[unit]=buildDirectorSourceInventory({sources:[source]}).units;
  const code=source.text.indexOf(statement),prose=source.text.lastIndexOf(statement);
  expect(()=>assertDirectorProseEvidence(unit,[source],[{sourceId:source.id,evidence:statement,start:code,end:code+statement.length}])).toThrow(/non-code/);
  expect(()=>assertDirectorProseEvidence(unit,[source],[{sourceId:source.id,evidence:statement,start:prose,end:prose+statement.length}])).not.toThrow();
  expect(()=>assertDirectorProseEvidence(unit,[source],[{sourceId:source.id,evidence:statement,start:prose,end:prose+statement.length+1}])).toThrow(/non-code/);
 });
 it('does not treat unreviewed transcript media or failed imports as ready source evidence',()=>{
  const ready=createSource('A usable source passage preserves the exact observation and the stated condition.','Ready');
  const pending={...createSource('This unreviewed text must not enter a generated mission.','Pending'),status:'needs-transcript' as const};
  const failed={...createSource('A failed import cannot justify a generated mission.','Failed'),status:'error' as const};
  const inventory=buildDirectorSourceInventory({sources:[ready,pending,failed]});
  expect(inventory.units.every(u=>u.sourceId===ready.id)).toBe(true);expect(inventory.unavailableSources.map(s=>s.sourceId).sort()).toEqual([pending.id,failed.id].sort());
 });
 it('does not produce duplicate recall IDs for a procedure repeated across headings',()=>{
  const source=createSource('# Procedure A\n1. Open the panel.\n2. Select the command.\n3. Confirm the command.\n\n# Procedure B\n1. Open the panel.\n2. Select the command.\n3. Confirm the command.','Repeated procedure');
  const result=compileNotebook([source]);expect(result.cards).toHaveLength(2);expect(new Set(result.cards.map(c=>c.id)).size).toBe(2);expect(buildDirectorSourceInventory({sources:[source]}).units).toHaveLength(2);
 });
 it('invalidates cached planning for source/audience/goal/model changes but never stores a key or endpoint',()=>{
  const notebook=createNotebook({sources:[createSource('A complete observation belongs to the source and retains its explanatory condition.','Notes')]});
  const revision=directorInputRevision(notebook,profile);expect(revision).toMatch(/^[a-f0-9]{64}$/);
  expect(directorInputRevision({...notebook,sources:[{...notebook.sources[0],text:notebook.sources[0].text+' Revised.'}]},profile)).not.toBe(revision);
  expect(directorInputRevision({...notebook,ageGroup:'9-11'},profile)).not.toBe(revision);
  expect(directorInputRevision({...notebook,goal:'A different purpose'},profile)).not.toBe(revision);
  expect(directorInputRevision(notebook,{...profile,model:'another-model'})).not.toBe(revision);
  expect(directorInputRevision(notebook,{...profile,apiKey:'secret'} as typeof profile)).toBe(revision);
  expect(directorInputRevision({...notebook,sources:[...notebook.sources].reverse()},profile)).toBe(revision);
 });
});
