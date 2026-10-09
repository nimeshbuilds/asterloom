import {describe,it,expect} from 'vitest';
import {explicitSourceRelationship,extractStructuredActivities,hasAmbiguousExtractedRelationships,validateActivity,type DependencyActivity} from '../src/lib/structuredEngine';
import {hasCurrentActivityEvidence,resolveScaffoldRuntime} from '../src/lib/scaffoldRuntime';
import {createNotebook,createSource} from '../src/lib/utils';
import {bytesDigest} from '../src/lib/evidence';
import {serializePackage,parsePackage} from '../src/lib/package';
import {learnerControlWording} from '../src/lib/learnerWording';

// Fixtures preserve the exact node/edge shape written by the old extractor.
// They deliberately have source provenance but no author review.
function legacy(evidence:string,from:string,relation:string,to:string):DependencyActivity {
 return{version:1,id:'legacy-relationship',kind:'dependency',title:'Saved relationship draft',instruction:'Reconstruct the structure explicitly stated in the source.',explanation:'This answer follows the supplied source structure. Review factual accuracy before publishing.',hint:'Use the exact relationships, categories or order stated in the source.',reviewStatus:'needs-review',extractedFrom:'source-arrows',scaffoldIds:['concept-map-repair'],sourceRefs:[{sourceId:'source-arrows',evidence}],nodes:[{id:'node-1',label:from},{id:'node-2',label:to}],edges:[{from:'node-1',to:'node-2',relation}],acyclic:false};
}
const sourceFor=(text:string)=>({...createSource(text,'Source relationships'),id:'source-arrows'});
const ambiguous=[
 {line:'Discover → Explore → Transform',from:'Discover',relation:'Explore',to:'Transform'},
 {line:'Parse → Chunk → Embed',from:'Parse',relation:'Chunk',to:'Embed'},
 {line:'Inputs → split → Chunks → embed → Vectors',from:'Inputs',relation:'split',to:'Chunks → embed → Vectors'},
 {line:'Gateway → supports → Tokens. Read the next page.',from:'Gateway',relation:'supports',to:'Tokens. Read the next page.'},
 {line:'Gateway → requires → token; Client → Session',from:'Gateway',relation:'requires',to:'token; Client → Session'},
];

describe('explicit source relationships do not turn slogans and process chains into answer keys',()=>{
 it.each(ambiguous)('rejects ambiguous source notation: $line',({line})=>{
  expect(explicitSourceRelationship(line)).toBeUndefined();
  expect(extractStructuredActivities([sourceFor(line)]).activities.filter(activity=>activity.kind==='dependency')).toEqual([]);
 });
 it.each(['A -> B -> C -> D','A → requires → B → C','A → [   ] → B','A →\nrequires → B','A →\rrequires → B','A → requires\r\n→ B','A\ncontinued → requires → B'])('rejects incomplete labels and wrapped or multi-arrow strings: %s',line=>{
  expect(explicitSourceRelationship(line)).toBeUndefined();
 });
 it.each([
  ['Gateway -> requires -> Token',{from:'Gateway',relation:'requires',to:'Token'}],
  ['Token → is required by → Gateway',{from:'Token',relation:'is required by',to:'Gateway'}],
  ['Sender → [transmits signed requests to] → Receiver',{from:'Sender',relation:'transmits signed requests to',to:'Receiver'}],
  ['Request → [requires a nonempty proof] → Verification',{from:'Request',relation:'requires a nonempty proof',to:'Verification'}],
 ] as const)('retains explicit labeled relationships: %s',(line,expected)=>{
  expect(explicitSourceRelationship(line)).toEqual(expected);
  const source=sourceFor(line),activity=extractStructuredActivities([source]).activities.find(activity=>activity.kind==='dependency');
  expect(activity).toBeDefined();if(!activity||activity.kind!=='dependency')throw new Error('Expected a dependency draft');
  expect(activity.nodes.map(node=>node.label)).toEqual([expected.from,expected.to]);expect(activity.edges[0].relation).toBe(expected.relation);expect(activity.sourceRefs).toEqual([{sourceId:source.id,evidence:line}]);expect(activity.reviewStatus).toBe('needs-review');expect(hasAmbiguousExtractedRelationships(activity)).toBe(false);expect(hasCurrentActivityEvidence(activity,[source])).toBe(true);
 });
 it('retains only explicit relation lines and exact CRLF source evidence in a mixed import',()=>{
  const text='Front cover: Discover → Explore → Transform\r\n\r\nGateway → requires → Token\r\n\r\nTokens → [authorize] → Requests',source=sourceFor(text);
  const activity=extractStructuredActivities([source]).activities.find(activity=>activity.kind==='dependency');
  expect(activity?.sourceRefs.map(ref=>ref.evidence)).toEqual(['Gateway → requires → Token','Tokens → [authorize] → Requests']);expect(source.text).toBe(text);
 });
});

describe('legacy relationship filtering preserves saved work and provenance',()=>{
 it.each(ambiguous)('keeps the old model bytes but excludes its invented relation from evidence-ready play: $line',({line,from,relation,to})=>{
  const activity=legacy(line,from,relation,to),source=sourceFor(line),before=JSON.stringify({activity,source});
  expect(validateActivity(activity,[source]).success).toBe(true);expect(hasAmbiguousExtractedRelationships(activity)).toBe(true);expect(hasCurrentActivityEvidence(activity,[source])).toBe(false);
  expect(resolveScaffoldRuntime('concept-map-repair',{ageGroup:'adult',activities:[activity],cards:[],sources:[source]})).toMatchObject({available:false,activityIds:[]});expect(JSON.stringify({activity,source})).toBe(before);
 });
 it('rejects a CR-wrapped legacy extraction even when the old parser stripped the boundary beside an arrow',()=>{
  const line='Gateway →\rrequires → Token',activity=legacy(line,'Gateway','requires','Token');
  expect(hasAmbiguousExtractedRelationships(activity)).toBe(true);expect(hasCurrentActivityEvidence(activity,[sourceFor(line)])).toBe(false);
 });
 it('preserves author-reviewed legacy relationships and continues to require current evidence',()=>{
  const line='Parse → Chunk → Embed',activity={...legacy(line,'Parse','Chunk','Embed'),reviewStatus:'reviewed' as const},source=sourceFor(line);
  expect(hasAmbiguousExtractedRelationships(activity)).toBe(false);expect(hasCurrentActivityEvidence(activity,[source])).toBe(true);
  expect(resolveScaffoldRuntime('concept-map-repair',{ageGroup:'adult',activities:[activity],cards:[],sources:[source]})).toMatchObject({available:true,activityIds:[activity.id]});
  expect(hasCurrentActivityEvidence(activity,[{...source,text:'The cited relationship was removed.'}])).toBe(false);
 });
 it('does not classify an edited answer model or an authored model as an untouched legacy extraction',()=>{
  const line='Parse → Chunk → Embed',activity=legacy(line,'Parse','Chunk','Embed'),source=sourceFor(line);
  const edited={...activity,edges:[{...activity.edges[0],relation:'precedes'}]},authored={...activity,extractedFrom:undefined};
  for(const model of [edited,authored]){expect(hasAmbiguousExtractedRelationships(model)).toBe(false);expect(hasCurrentActivityEvidence(model,[source])).toBe(true);expect(resolveScaffoldRuntime('concept-map-repair',{ageGroup:'adult',activities:[model],cards:[],sources:[source]}).available).toBe(false);}
 });
 it('keeps genuine legacy relations, including formerly literal bracket labels',()=>{
  for(const [line,relation] of [['Gateway → requires → Token','requires'],['Gateway → [requires] → Token','[requires]']]){
   const activity=legacy(line,'Gateway',relation,'Token');expect(hasAmbiguousExtractedRelationships(activity)).toBe(false);expect(hasCurrentActivityEvidence(activity,[sourceFor(line)])).toBe(true);
  }
 });
 it('does not promote an explicit relation from publication cover furniture into learning evidence',()=>{
  const line='Ideas → supports → Progress',source=sourceFor('A comprehensive guide\nPart 1 of 12\nEarly 2026\nWritten by Example Author\n'+line),activity=legacy(line,'Ideas','supports','Progress');
  expect(hasAmbiguousExtractedRelationships(activity)).toBe(false);expect(hasCurrentActivityEvidence(activity,[source])).toBe(false);
 });
 it('round-trips rejected drafts and original uploaded bytes without rewriting or silently deleting them',()=>{
  const line='Parse → Chunk → Embed',source=sourceFor(line),bytes=new TextEncoder().encode('\uFEFF'+line+'\r\n');
  source.originalFile={name:'original.md',mime:'text/markdown',size:bytes.length,sha256:bytesDigest(bytes),dataUrl:'data:text/markdown;base64,'+btoa(String.fromCharCode(...bytes))};
  const activity=legacy(line,'Parse','Chunk','Embed'),notebook=createNotebook({sources:[source],activities:[activity]}),original=JSON.stringify(notebook),serialized=serializePackage(notebook);
  expect(hasCurrentActivityEvidence(activity,[source])).toBe(false);expect(JSON.stringify(notebook)).toBe(original);
  const restored=parsePackage(serialized);expect(restored.sources[0]).toEqual(source);expect(restored.activities).toEqual([activity]);expect(restored.sources[0].originalFile?.dataUrl).toBe(source.originalFile.dataUrl);
 });
});

describe('control wording never revises quoted source material or subject meaning',()=>{
 it.each([
  'Describe each reviewed pairing and its clinical outcome.',
  'Compare each reviewed pairing with the published genetic pairing records.',
  'The source says “Compare each reviewed pairing.” Explain the review method.',
  'Read "Inspect the reviewed membership feedback." as the reviewer’s own words.',
  'The literal command is `Attach a reviewed relation label.` in the source document.',
  'The source says "First line.\nInspect the reviewed membership feedback.\nFinal line." Explain the review method.',
  "The source says 'First line.\nAttach a reviewed relation label.\nFinal line.' Explain the review method.",
  "Read 'Inspect the reviewed membership feedback.' as the reviewer’s own words.",
 ])('leaves source quotations and subject instructions intact: %s',text=>expect(learnerControlWording(text,false)).toBe(text));
});
