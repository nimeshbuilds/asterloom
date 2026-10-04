import {describe,it,expect} from 'vitest';
import {ACTIVITY_EXAMPLES,type ClassificationActivity,type DependencyActivity} from '../src/lib/structuredEngine';
import {placeClassification,addModelConnection,modelNodePositions} from '../src/lib/modelWorkspace';
const sorting=ACTIVITY_EXAMPLES.find(a=>a.kind==='classification') as ClassificationActivity;
const graph=ACTIVITY_EXAMPLES.find(a=>a.kind==='dependency') as DependencyActivity;
describe('Source-model workspace decisions',()=>{
 it('places one item in multiple groups and removes exactly one placement without reading the answer key',()=>{
  const r={assignments:Object.fromEntries(sorting.items.map(item=>[item.id,[]]))},id=sorting.items[0].id;
  let next=placeClassification(sorting,r,id,sorting.categories[0].id);next=placeClassification(sorting,next,id,sorting.categories[1].id);
  expect(next.assignments[id]).toEqual(sorting.categories.slice(0,2).map(c=>c.id));expect(r.assignments[id]).toEqual([]);
  expect(placeClassification({...sorting,membership:[]},r,id,sorting.categories[0].id)).toEqual(placeClassification(sorting,r,id,sorting.categories[0].id));
  next=placeClassification(sorting,next,id,sorting.categories[0].id,true);expect(next.assignments[id]).toEqual([sorting.categories[1].id]);
 });
 it('treats repeated drops as idempotent placement, and refuses foreign item/category IDs',()=>{
  const r={assignments:Object.fromEntries(sorting.items.map(item=>[item.id,[]]))},id=sorting.items[0].id,c=sorting.categories[0].id;
  const next=placeClassification(sorting,r,id,c);expect(placeClassification(sorting,next,id,c)).toBe(next);
  expect(placeClassification(sorting,r,'forged',c)).toBe(r);expect(placeClassification(sorting,r,id,'forged')).toBe(r);
 });
 it('creates the learner’s directed connection, including a wrong hypothesis, without revealing expected endpoints',()=>{
  const relation=graph.edges[0].relation,draft={from:graph.nodes[1].id,to:graph.nodes[0].id,relation},r={edges:[]};
  const result=addModelConnection(graph,r,draft);expect(result.added).toBe(true);expect(result.response.edges).toEqual([draft]);expect(r.edges).toEqual([]);
  expect(addModelConnection({...graph,edges:[{...graph.edges[0],from:'SECRET',to:'SECRET'}]},r,draft)).toEqual(result);
 });
 it('requires authored vocabulary, valid endpoints and distinct bounded connections',()=>{
  const edge=graph.edges[0],r={edges:[edge]};expect(addModelConnection(graph,r,edge).added).toBe(false);
  expect(addModelConnection(graph,{edges:[]},{...edge,relation:'invented causal link'}).added).toBe(false);
  expect(addModelConnection(graph,{edges:[]},{...edge,to:'forged'}).added).toBe(false);
  const full={edges:Array.from({length:120},()=>({...edge}))};expect(addModelConnection(graph,full,{...edge,from:graph.nodes[1].id}).added).toBe(false);
 });
 it('lays out source concepts independently of hidden expected edges',()=>{
  const before=modelNodePositions(graph);expect(modelNodePositions({...graph,edges:[]} as DependencyActivity)).toEqual(before);
  expect(before.nodes.map(n=>n.id)).toEqual(graph.nodes.map(n=>n.id));expect(new Set(before.nodes.map(n=>`${n.x},${n.y}`)).size).toBe(graph.nodes.length);
 });
});
