import {describe,expect,it} from 'vitest';
import {createSource} from '../src/lib/utils';
import {buildGameDraftCitationCatalog,resolveGameDraftCitationReply,type GameDraftCitationContext} from '../src/lib/gameDraftCitations';
import {codeAuthoringFixture,recallAuthoringFixture} from './gameDraftAuthoring.fixture';
import {validatePreparedGameDraft} from '../src/lib/gameDraftAdapters';
const context=(source:ReturnType<typeof createSource>):GameDraftCitationContext=>({source,primaryWindow:{sourceId:source.id,start:0,end:source.text.length},teachingWindow:{sourceId:source.id,start:0,end:source.text.length}});
const idRef=(c:GameDraftCitationContext,evidence:string)=>{const entry=buildGameDraftCitationCatalog(c.source,c.primaryWindow,c.teachingWindow).entries.find(e=>e.evidence===evidence);expect(entry,evidence).toBeDefined();return{sourceId:c.source.id,evidenceId:entry!.evidenceId};};
const reply=(ref:unknown)=>({missions:[{activity:{sourceRefs:[ref]},teaching:{conceptExplanation:{citations:[ref]},chunks:[{citations:[ref]}],workedExample:{sourceEvidence:ref,steps:[{citations:[ref]}]}}}]});
describe('trusted writer citation IDs',()=>{
 it('restores exact Unicode and contiguous source bytes at every supported citation field without mutating the reply',()=>{
  const source=createSource('The display reads “12”. The battery may be weak.\n\nA second observation remains separate.','Display notes'),c=context(source),quote='The display reads “12”.',ref=idRef(c,quote),input=reply(ref),saved=structuredClone(input);
  const actual=resolveGameDraftCitationReply(input,c) as any,literal={sourceId:source.id,evidence:quote};
  expect(actual).toEqual(reply(literal));expect(input).toEqual(saved);
  const catalog=buildGameDraftCitationCatalog(source,c.primaryWindow,c.teachingWindow);
  for(const entry of catalog.entries)expect(entry.evidence).toBe(source.text.slice(entry.start,entry.end));
  expect(catalog.entries.length).toBeLessThanOrEqual(64);
 });
 it('rejects forged IDs, foreign source IDs, stale source revisions, changed windows and mixed ID/literal objects',()=>{
  const source=createSource('First supported observation.\n\nSecond supported observation.','Observations'),c=context(source),ref=idRef(c,'First supported observation.');
  for(const invalid of [{...ref,evidenceId:ref.evidenceId+'forged'},{...ref,sourceId:'foreign'},{...ref,evidence:'First supported observation.'},{...ref,start:0}])expect(()=>resolveGameDraftCitationReply(reply(invalid),c)).toThrow(/citation ID/i);
  const changed=context({...source,text:source.text.replace('Second','Newest')});expect(()=>resolveGameDraftCitationReply(reply(ref),changed)).toThrow(/stale/);
  for(const altered of [{...c,primaryWindow:{...c.primaryWindow,end:28}},{...c,primaryWindow:{...c.primaryWindow,end:28},teachingWindow:{...c.teachingWindow,end:28}}])expect(()=>resolveGameDraftCitationReply(reply(ref),altered)).toThrow(/stale/);
 });
 it('allows adjacent disclosed teaching evidence only in teaching fields and code observations only in activity fields',()=>{
  const source=createSource('First supported observation.\n\nSecond supported observation.','Observations'),c=context(source);c.primaryWindow.end=source.text.indexOf('\n');
  const ref=idRef(c,'Second supported observation.');
  expect(()=>resolveGameDraftCitationReply({missions:[{teaching:{chunks:[{citations:[ref]}]}}]},c)).not.toThrow();
  expect(()=>resolveGameDraftCitationReply({missions:[{activity:{sourceRefs:[ref]}}]},c)).toThrow(/outside/);
  const fixture=codeAuthoringFixture(),cc=context(fixture.source),code=fixture.activity.sourceRefs[0].evidence,codeRef=idRef(cc,code);
  expect(()=>resolveGameDraftCitationReply({missions:[{activity:{sourceRefs:[codeRef]}}]},cc)).not.toThrow();
  expect(()=>resolveGameDraftCitationReply({missions:[{teaching:{chunks:[{citations:[codeRef]}]}}]},cc)).toThrow(/outside/);
  // A window starting inside a code fence cannot disguise code as explanatory prose.
  const start=fixture.source.text.indexOf(code),inside={...cc,primaryWindow:{...cc.primaryWindow,start,end:start+code.length},teachingWindow:{...cc.teachingWindow,start,end:start+code.length}};
  expect(buildGameDraftCitationCatalog(fixture.source,inside.primaryWindow,inside.teachingWindow).entries.every(e=>!e.teaching)).toBe(true);
 });
 it('preserves literal fallback, code, asset IDs, exact answers and arbitrary nested fields for their ordinary validators',()=>{
  const fixture=recallAuthoringFixture(),c=context(fixture.source),ref=idRef(c,fixture.prose),input:any={missions:[{activity:{...fixture.activity,sourceRefs:[ref]},teaching:{conceptExplanation:{text:fixture.lesson,citations:[ref]}}}]};
  input.missions[0].activity.extra={code:ref.evidenceId,mediaSourceId:ref.evidenceId,answer:ref.evidenceId,citations:[ref]};
  const decoded=resolveGameDraftCitationReply(input,c) as any;expect(decoded.missions[0].activity.extra).toEqual(input.missions[0].activity.extra);delete decoded.missions[0].activity.extra;
  expect(()=>validatePreparedGameDraft(fixture.source,fixture.source.text,{activity:decoded.missions[0].activity},'citation-recall',['recall'])).not.toThrow();
  const wrong={sourceId:fixture.source.id,evidence:'A queue secretly runs every job.'},literal=resolveGameDraftCitationReply({missions:[{activity:{...fixture.activity,sourceRefs:[wrong]}}]},c) as any;
  expect(literal.missions[0].activity.sourceRefs).toEqual([wrong]);expect(()=>validatePreparedGameDraft(fixture.source,fixture.source.text,{activity:literal.missions[0].activity},'citation-recall',['recall'])).toThrow(/exact/);
 });
 it('keeps long quotations out of teaching, bounds the catalog and rejects invalid windows',()=>{
  const source=createSource(Array.from({length:100},(_,i)=>`Observation ${i} contains a documented comparison.`).join('\n\n'),'Observations'),c=context(source),catalog=buildGameDraftCitationCatalog(source,c.primaryWindow,c.teachingWindow);
  expect(catalog.entries).toHaveLength(64);expect(catalog.entries[0].activity).toBe(true);expect(catalog.entries[0].teaching).toBe(false);
  expect(()=>resolveGameDraftCitationReply({missions:[{teaching:{chunks:[{citations:[{sourceId:source.id,evidenceId:catalog.entries[0].evidenceId}]}]}}]},c)).toThrow(/outside/);
  for(const window of [{...c.primaryWindow,start:-1},{...c.primaryWindow,end:NaN},{...c.primaryWindow,sourceId:'other'},{...c.primaryWindow,end:source.text.length+1}])expect(()=>buildGameDraftCitationCatalog(source,window,c.teachingWindow)).toThrow(/windows/);
 });
});
