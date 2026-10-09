import {describe,expect,it,vi,afterEach} from 'vitest';
import {asterContextBlocks,asterQuery,isUsefulAsterPassage,sourceReaderContentRanges} from '../src/lib/asterRetrieval';
import {askAster} from '../src/lib/asterKnowledge';
import {askAsterAI} from '../src/lib/asterAI';
import {createNotebook,createSource} from '../src/lib/utils';
import {isCurrentEvidence} from '../src/lib/evidence';
import {SemanticEvidenceIndex} from '../src/lib/semanticRetrieval';

const header='Field Notes / STUDY GUIDE + CRAM NOTES';
const page=(n:number,text:string)=>`[Page ${n}]\n${header}\n\n${text}\n\nTraining chapter ${n}`;
const document=()=>createSource([
 '[Page 1]\nExample Studio\n\ngithub.com/example\n\nComplete Study Guide & Cram Notes\n\n21\n\nSTUDY SECTIONS\n\n100\n\nPRACTICE QUESTIONS\n\nOctober 2026 edition\n\nIndependent learning resource. Original explanations, diagrams, and questions.',
 page(2,'Your reading map\n\n. . . . . . . . . . . . 301 Retrieval and search\n\n. . . . . . . . . . . . 402 Access control'),
 page(3,'01 Retrieval and search\n\nRAG has two paths: prepare evidence, then answer.\n\nSource documents\n\nVector index\n\nIngestion prepares retrieval evidence:\nparse the document, retain its conditions, and build a searchable index. At question time, retrieve authorized passages and give them to the model with citations. New facts become searchable only after indexing completes.\n\nA search hit can be relevant while its explanation is incomplete. Keep exceptions and limiting conditions with the rule instead of returning an isolated keyword.'),
 page(4,'Field What to understand\n\nmodelId Model or supported deployment resource\n\nKeyword search finds exact identifiers. Semantic search finds related meanings. Hybrid search combines the two kinds of evidence, while reranking orders retrieved candidates. It does not grant access to a restricted document.\n\nFor example, keep an exact error-code match when a semantic search overlooks that identifier.'),
 page(5,'Control plane means configuration and lifecycle. Data plane means executing the requested workload. Creating a service changes its configuration; invoking an already configured service runs the workload.\n\n01.1 Which claim is true?\n\nA. A model always knows every document\nB. Every search result is true\nC. Search grants access to all private files\n\n01.1 — None of these claims is a guarantee.'),
 page(6,'Authorization restricts which documents can be retrieved for a user. Apply it before retrieval, using verified identity rather than a prompt supplied by the caller. A later warning cannot undo disclosure of a private document.'),
 page(7,'Versioning preserves prior document revisions. Rebuild the affected index entries after replacement, then test that old passages no longer appear. Keeping the original file does not make stale search results current.'),
].join('\n\n'),'Synthetic reference guide');
afterEach(()=>vi.unstubAllGlobals());

describe('Aster meaningful exact context',()=>{
 it('omits PDF cover, spaced contents leaders, running headers and isolated table labels from source answers',async()=>{
  const source=document(),before=JSON.stringify(source),blocks=asterContextBlocks(source);
  expect(blocks.length).toBeGreaterThan(4);expect(blocks.every(block=>isCurrentEvidence(block,[source]))).toBe(true);
  for(const block of blocks){expect(block.quote).not.toMatch(/Independent learning resource|\. \. \.|STUDY GUIDE|Field What to understand/);expect(block.quote).not.toMatch(/A\. A model always/);expect(block.locator.kind).toBe('page');}
  expect(JSON.stringify(source)).toBe(before);
 });
 it('preserves opening sentences ending with a colon, adjacent qualifications and real page citations',async()=>{
  const source=document(),n=createNotebook({sources:[source]}),r=await askAster(n,'Explain retrieval evidence',{semantic:false});
  expect(r.status).toBe('found');expect(r.passages[0].reference.quote).toContain('Ingestion prepares retrieval evidence:\nparse the document');expect(r.passages[0].reference.quote).toContain('only after indexing completes');expect(r.passages[0].reference.locator.label).toContain('Page 3');
 });
 it('retrieves actual explanation before a short diagram slogan, and both sides of a comparison',async()=>{
  const n=createNotebook({sources:[document()]});
  const rag=await askAster(n,'How does retrieval work?',{semantic:false});expect(rag.passages[0].reference.quote).toContain('Ingestion prepares retrieval evidence');
  const hybrid=await askAster(n,'Explain hybrid search',{semantic:false});expect(hybrid.passages[0].reference.quote).toContain('Hybrid search combines');expect(hybrid.passages[0].reference.quote).toContain('does not grant access');
  const comparison=await askAster(n,'What is the difference between control plane and data plane?',{semantic:false});expect(comparison.passages[0].reference.quote).toContain('Control plane means');expect(comparison.passages[0].reference.quote).toContain('Data plane means');
 });
 it('routes broad questions to representative material across the whole source instead of searching for the word source',async()=>{
  const n=createNotebook({sources:[document()]}),r=await askAster(n,'What do you know about these sources?',{semantic:false,limit:6});
  expect(r.status).toBe('found');expect(r.coverage).toMatchObject({sources:1,overview:true});expect(r.passages.length).toBeGreaterThanOrEqual(4);expect(r.passages.some(p=>p.reference.locator.label.startsWith('Page 7'))).toBe(true);expect(r.passages.every(p=>!p.reference.locator.label.startsWith('Page 1')&&!p.reference.locator.label.startsWith('Page 2'))).toBe(true);expect(r.message).toContain('does not cover every section');
  expect(asterQuery('What is it?')).toEqual({terms:[],overview:false});expect(asterQuery('Explain hybrid search').overview).toBe(false);
 });
 it('retains tables, choices and figure labels in the human reader even when they are unsuitable standalone answer evidence',()=>{
  const source=document(),reader=sourceReaderContentRanges(source).map(range=>source.text.slice(range.start,range.end)).join('\n');
  expect(reader).toContain('Field What to understand');expect(reader).toContain('A. A model always knows every document');expect(reader).toContain('Vector index');expect(reader).toContain('modelId Model');expect(reader).not.toContain('Independent learning resource');expect(reader).not.toContain('. . . . . .');
 });
 it('can retrieve source question stems and their choices when the learner explicitly asks about a practice question',async()=>{
  const source=document(),n=createNotebook({sources:[source]}),r=await askAster(n,'Explain question 01.1 and its options',{semantic:false,limit:6});
  expect(r.status).toBe('found');expect(r.passages.some(p=>p.reference.quote.includes('01.1 Which claim is true?'))).toBe(true);expect(r.passages.some(p=>p.reference.quote.includes('A. A model always knows every document'))).toBe(true);expect(r.passages.every(p=>isCurrentEvidence(p.reference,n.sources))).toBe(true);
 });
 it('keeps concise definitions, code, list conditions and exact field names without fabricated prose',async()=>{
  const source=createSource('Packet: a small unit of data.\n\nmodelId Model or supported deployment resource\n\n1. Verify the user.\n2. Retrieve only their allowed documents.\n\nconst allowed = records.filter(record => record.owner === user.id);','Reference'),blocks=asterContextBlocks(source),n=createNotebook({sources:[source]});
  expect(blocks.map(block=>block.quote).join('\n')).toContain('record.owner === user.id');expect((await askAster(n,'modelId',{semantic:false})).passages[0].reference.quote).toContain('modelId Model');expect((await askAster(n,'Packet',{semantic:false})).status).toBe('found');expect(blocks.every(block=>source.text.slice(block.start,block.end)===block.quote)).toBe(true);
 });
 it('preserves page-looking markers and punctuation inside fenced code in both reader spans and evidence',()=>{
  const source=createSource('[Page 1]\nA literal marker is part of this code sample.\n\n```text\n[Page 2]\nField What to understand\n. . . . . . 42\nconst label = "example";\n```\n\n[Page 3]\nThe next real page explains another supported condition.','Code document');
  const reader=sourceReaderContentRanges(source).map(range=>source.text.slice(range.start,range.end)).join('\n');expect(reader).toContain('[Page 2]');expect(reader).toContain('. . . . . . 42');const blocks=asterContextBlocks(source);expect(blocks.find(block=>block.quote.includes('const label'))?.quote).toContain('[Page 2]');expect(blocks.find(block=>block.quote.includes('literal marker'))?.locator.label).toContain('Page 1');expect(blocks.at(-1)?.locator.label).toContain('Page 3');expect(blocks.every(block=>isCurrentEvidence(block,[source]))).toBe(true);
 });
 it('keeps identical definitions on distinct pages and updates references after source edits',async()=>{
  const source=createSource('[Page 1]\nA packet carries one portion of a message.\n\n[Page 2]\nA packet carries one portion of a message.','Notes'),blocks=asterContextBlocks(source);
  expect(blocks).toHaveLength(2);expect(blocks[0].start).not.toBe(blocks[1].start);const n=createNotebook({sources:[source]});const old=await askAster(n,'packet',{semantic:false});const changed={...n,sources:[{...source,text:'A star is a source of light in this example.'}]};expect((await askAster(changed,'packet',{semantic:false})).status).toBe('not-found');expect(isCurrentEvidence(old.passages[0].reference,changed.sources)).toBe(false);
 });
 it('preserves repeated real statements at page edges and the correct individual subtitle cue',()=>{
  const source=createSource([1,2,3].map(i=>`[Page ${i}]\nA seed needs water\n\nDifferent chapter ${i} explains another detail.\n\nA seed needs water`).join('\n\n'),'Repeated fact');expect(sourceReaderContentRanges(source).map(r=>source.text.slice(r.start,r.end)).join('\n')).toContain('A seed needs water');
  const transcript=createSource('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nA seed needs water.\n\n00:00:05.000 --> 00:00:08.000\nRoots absorb moisture.','Captions'),blocks=asterContextBlocks(transcript);expect(blocks.map(block=>block.quote)).toEqual(['A seed needs water.','Roots absorb moisture.']);expect(blocks.map(block=>block.locator.label)).toEqual([expect.stringContaining('00:00:01.000'),expect.stringContaining('00:00:05.000')]);
 });
 it('resolves short follow-ups from the last topic while keeping a new subject and invalid history separate',async()=>{
  const n=createNotebook({sources:[document()]});const first=await askAster(n,'Explain hybrid search',{semantic:false}),follow=await askAster(n,'Why?',{semantic:false,previousQuestion:first.topicQuestion});expect(follow.status).toBe('found');expect(follow.question).toBe('Why?');expect(follow.topicQuestion).toContain('Explain hybrid search');expect(follow.passages[0].reference.quote).toContain('Hybrid search combines');
  const changed=await askAster(n,'Explain authorization',{semantic:false,previousQuestion:first.topicQuestion});expect(changed.topicQuestion).toBe('Explain authorization');expect(changed.passages[0].reference.quote).toContain('Authorization restricts');expect((await askAster(n,'Why?',{semantic:false,previousQuestion:'x'.repeat(501)})).status).toBe('invalid-question');expect((await askAster(n,'Why?',{semantic:false})).status).toBe('invalid-question');
 });
 it('sends previousQuestion only for a bounded follow-up, never as cited evidence or for a fresh topic',async()=>{
  const prompts:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{prompts.push(JSON.parse(JSON.parse(init.body as string).prompt.split('REFERENCE DATA (JSON):\n')[1]));return new Response(JSON.stringify({text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'The supplied source describes the supported distinction.',passageIds:['passage-1']}],actions:[]})}));}));const n=createNotebook({sources:[document()]}),config={provider:'compatible' as const,model:'mock',apiKey:'synthetic'};
  await askAsterAI({notebook:n,question:'Give me an example',previousQuestion:'Explain hybrid search',config});await askAsterAI({notebook:n,question:'Explain authorization',previousQuestion:'Explain hybrid search',config});expect(prompts[0].previousQuestion).toBe('Explain hybrid search');expect(prompts[0].question).toBe('Give me an example');expect(prompts[1]).not.toHaveProperty('previousQuestion');expect(prompts[0].passages.every((p:any)=>n.sources[0].text.includes(p.text))).toBe(true);
 });
 it('does not send a paid request for furniture-only material and does not synthesize unsupported facts',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);const n=createNotebook({sources:[createSource('[Page 1]\nField What to understand\n\n. . . . . . 12 Retrieval','Only furniture')]});
  expect((await askAster(n,'retrieval',{semantic:false})).status).toBe('not-found');const r=await askAsterAI({notebook:n,question:'retrieval',config:{provider:'compatible',model:'mock',apiKey:'synthetic'}});expect(r.status).toBe('not-supported');expect(request).not.toHaveBeenCalled();
 });
 it('gives AI meaningful bounded contexts and an overview instruction, keeping citations bound to exact source spans',async()=>{
  const request=vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(init.body as string),data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);expect(body.prompt.length).toBeLessThan(14000);expect(body.prompt).toContain('answer that supported part');expect(data.coverage.overview).toBe(true);expect(data.passages.length).toBeGreaterThan(3);expect(data.passages.every((p:{text:string})=>p.text.length<=1200&&!/Independent learning resource|\. \. \.|Field What/.test(p.text))).toBe(true);return new Response(JSON.stringify({text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'The selected material explains retrieval, access control, and updating source indexes.',passageIds:['passage-1']}],actions:[]})}));});vi.stubGlobal('fetch',request);
  const n=createNotebook({sources:[document()]}),r=await askAsterAI({notebook:n,question:'Summarize these sources',config:{provider:'compatible',model:'mock',apiKey:'synthetic'}});expect(request).toHaveBeenCalledTimes(1);expect(r.status).toBe('answered');expect(r.citations.every(ref=>isCurrentEvidence(ref,n.sources))).toBe(true);
 });
 it('fits long source names and UI context by dropping whole lower-ranked passages without damaging citations',async()=>{
  const source=createSource(Array.from({length:12},(_,i)=>`[Page ${i+1}]\nToken ${i} is explained by this paragraph. ${'The source preserves its stated conditions and the supported distinction. '.repeat(15)}`).join('\n\n'),'"'.repeat(180)),n=createNotebook({title:'"'.repeat(180),sources:[source]});
  let sent=0;vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(init.body as string);expect(body.prompt.length).toBeLessThanOrEqual(14000);const data=JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);sent=data.passages.length;for(const passage of data.passages)expect(source.text).toContain(passage.text);return new Response(JSON.stringify({text:JSON.stringify({insufficientEvidence:false,paragraphs:[{text:'The source explains its stated conditions.',passageIds:['passage-1']}],actions:[]})}));}));
  const r=await askAsterAI({notebook:n,question:'Explain token',learningState:{title:'"'.repeat(180),phase:'lesson',lessonStage:'context',nextAction:'"'.repeat(600)},config:{provider:'compatible',model:'mock',apiKey:'synthetic'}});expect(sent).toBeGreaterThan(0);expect(r.citations.every(ref=>isCurrentEvidence(ref,n.sources))).toBe(true);
 });
 it.each(['Field What to understand','Child 2: search hit','[30] Return of control','Chapter 3 Retrieval','The source . . . . . 45'])('does not mistake standalone document furniture for teaching: %s',text=>{expect(isUsefulAsterPassage(text)).toBe(false);});
});

describe('whole-document local meaning search',()=>{
 const vector=(index:number)=>Array.from({length:384},(_,i)=>i===index?1:0);
 it('indexes meaningful passages beyond512 and warms diverse document positions before finishing',async()=>{
  const source=createSource(Array.from({length:600},(_,i)=>`[Page ${i+1}]\n${i===599?'Last-page metamorphosis explains the final change.':`Topic ${i} is a separate supported definition for this source.`}`).join('\n\n'),'Long source'),blocks=asterContextBlocks(source),batches:string[][]=[];
  const index=new SemanticEvidenceIndex({ready:async()=>'wasm',embed:async texts=>{batches.push(texts);return texts.map(text=>vector(/metamorphosis|final change/.test(text)?1:0));}},{get:async()=>undefined,set:async()=>{}},{maxBlocks:20000,spreadAcrossDocument:true});
  await index.update(blocks,()=>{});expect(index.indexedCount).toBe(600);expect(batches[0].some(text=>/Topic 450/.test(text))).toBe(true);const hits=await index.search('final change',1);expect(hits[0].block.locator.label).toContain('Page 600');expect(isCurrentEvidence(hits[0].block,[source])).toBe(true);
 });
 it('clears an aborted partial index and prevents an old update from overwriting newer material',async()=>{
  let release!:(vectors:number[][])=>void;let calls=0;const index=new SemanticEvidenceIndex({ready:async()=>'wasm',embed:async texts=>{if(++calls===2)return new Promise<number[][]>(resolve=>release=resolve);return texts.map(()=>vector(0));}},{get:async()=>undefined,set:async()=>{}});
  const old=createSource(Array.from({length:10},(_,i)=>`[Page ${i+1}]\nOld topic ${i} is a supported definition.`).join('\n\n'),'Old'),controller=new AbortController(),pending=index.update(asterContextBlocks(old),()=>{},controller.signal);
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));expect(index.indexedCount).toBe(8);controller.abort();release([vector(0),vector(0)]);await pending;expect(index.indexedCount).toBe(0);
  const fresh=createSource('New material describes a current source revision.','New');await index.update(asterContextBlocks(fresh),()=>{});expect((await index.search('new'))[0].block.sourceId).toBe(fresh.id);
 });
});
