import {describe,expect,it} from 'vitest';
import {parseProgress,serializeProgress} from '../src/lib/package';
import {emptyProgress} from '../src/lib/storage';
import {CLEAN_DATA_CONSTRUCTION,GARDEN_CONSTRUCTION} from '../src/lib/compositionExamples';
import {evaluateComposition,initialCompositionResponse} from '../src/lib/compositionEngine';
import type {ConstructionActivity,ConstructionResponse} from '../src/lib/compositionEngine';
import {advanceConstructionTrace,constructionConnectionFault,inspectConstructionTrace,restoreConstructionTrace} from '../src/lib/constructionTrace';
const model = () => structuredClone(CLEAN_DATA_CONSTRUCTION.referenceBuilds[0]);
describe('source-defined construction route inspection',()=>{
 it('follows the learner graph and restores an unfinished trace without changing its score',()=>{
  const build=model(), before=evaluateComposition(CLEAN_DATA_CONSTRUCTION,build);
  let trace={startId:build.instances[0].id,edges:[] as typeof build.edges};
  expect(inspectConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace).status).toBe('ready');
  trace=advanceConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace,build.edges[0]);
  const response=initialCompositionResponse(CLEAN_DATA_CONSTRUCTION,{...build,draft:{trace}}) as ConstructionResponse;
  expect(response.draft.trace).toEqual(trace);expect(inspectConstructionTrace(CLEAN_DATA_CONSTRUCTION,response,trace).currentId).toBe('process');
  trace=advanceConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace,build.edges[1]);
  expect(inspectConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace)).toMatchObject({status:'end',currentId:'finish',visitedIds:['start','process','finish']});
  expect(evaluateComposition(CLEAN_DATA_CONSTRUCTION,{...response,draft:{...response.draft,trace}})).toEqual(before);
 });
 it('roundtrips a route inspection in the actual progress backup without awarding credit',()=>{
  const build=model(),response=initialCompositionResponse(CLEAN_DATA_CONSTRUCTION,{...build,draft:{trace:{startId:'start',edges:[build.edges[0]]}}});
  const progress=emptyProgress('trace-notebook');progress.structured={[CLEAN_DATA_CONSTRUCTION.id]:{response,completed:false,score:0,maxScore:0,attempts:0,updatedAt:progress.updatedAt}};
  const restored=parseProgress(serializeProgress(progress));expect(restored.xp).toBe(0);expect(restored.structured?.[CLEAN_DATA_CONSTRUCTION.id].response).toEqual(response);
  expect(initialCompositionResponse(CLEAN_DATA_CONSTRUCTION,restored.structured?.[CLEAN_DATA_CONSTRUCTION.id].response)).toEqual(response);
 });
 it('blocks a type mismatch and cannot continue after the failed connection',()=>{
  const build=model();build.edges=[{from:'start',fromPort:'out',to:'finish',toPort:'in'},build.edges[1]];
  const trace=advanceConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{startId:'start',edges:[]},build.edges[0]);
  const result=inspectConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace);
  expect(result).toMatchObject({status:'blocked',currentId:'start',traversedEdges:[]});expect(result.message).toContain('sends raw');expect(result.message).toContain('accepts clean');
  expect(advanceConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,trace,build.edges[1])).toEqual(trace);
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{...trace,edges:[...trace.edges,build.edges[1]]})).toBeUndefined();
 });
 it('checks actual source port capacity before following a wire',()=>{
  const build=model();build.instances.push({id:'second',componentId:'scrubber',x:50,y:75});build.edges.push({from:'start',fromPort:'out',to:'second',toPort:'in'});
  expect(constructionConnectionFault(CLEAN_DATA_CONSTRUCTION,build,build.edges[0])).toContain('has 2 connections; the source allows 1');
 });
 it('never reads answer witnesses, complete requirements, or prepared completion explanations',()=>{
  const activity={...CLEAN_DATA_CONSTRUCTION};
  for(const key of ['referenceBuilds','requirements','explanation'])Object.defineProperty(activity,key,{get(){throw new Error('Hidden answer read: '+key);}});
  const build=model();expect(inspectConstructionTrace(activity,build,{startId:'start',edges:build.edges}).status).toBe('end');
 });
 it('drops stale/forged routes, strips extra fields, and bounds inspection length',()=>{
  const build=model(),trace={startId:'start',edges:[build.edges[0]]};
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,{...build,edges:[]},trace)).toBeUndefined();
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{startId:'not-there',edges:[]})).toBeUndefined();
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{startId:'start',edges:[null]})).toBeUndefined();
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{startId:'start',edges:Array(33).fill(build.edges[0])})).toBeUndefined();
  expect(restoreConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{...trace,secret:'discard',edges:[{...build.edges[0],secret:'discard'}]})).toEqual(trace);
  expect(advanceConstructionTrace(CLEAN_DATA_CONSTRUCTION,build,{startId:'start',edges:[]},build.edges[1])).toEqual({startId:'start',edges:[]});
 });
 it('stops a loop without asserting that every authored cycle is forbidden',()=>{
  const activity=structuredClone(CLEAN_DATA_CONSTRUCTION) as ConstructionActivity,build=model();
  activity.components.find(part=>part.id==='scrubber')!.ports.find(port=>port.direction==='out')!.type='raw';
  build.instances=[{id:'a',componentId:'scrubber',x:20,y:30},{id:'b',componentId:'scrubber',x:60,y:30}];build.edges=[{from:'a',fromPort:'out',to:'b',toPort:'in'},{from:'b',fromPort:'out',to:'a',toPort:'in'}];activity.allowCycles=true;
  expect(inspectConstructionTrace(activity,build,{startId:'a',edges:build.edges})).toMatchObject({status:'loop',currentId:'a',visitedIds:['a','b','a']});
 });
 it('supports branching learner routes rather than silently choosing a destination',()=>{
  const activity=GARDEN_CONSTRUCTION,build=structuredClone(activity.referenceBuilds[0]);
  const branch=build.instances.find(part=>part.componentId==='branching-pump') ?? build.instances.find(part=>build.edges.filter(edge=>edge.from===part.id).length>1)!;
  const outgoing=build.edges.filter(edge=>edge.from===branch.id);expect(outgoing).toHaveLength(2);
  const destinations=outgoing.map(edge=>inspectConstructionTrace(activity,build,advanceConstructionTrace(activity,build,{startId:branch.id,edges:[]},edge)).currentId);
  expect(new Set(destinations).size).toBe(2);
 });
});
