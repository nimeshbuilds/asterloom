import {describe,expect,it,vi,afterEach} from 'vitest';
import {asterContextBlocks,asterPassageContext,asterTopicQuestion,isUsefulAsterPassage} from '../src/lib/asterRetrieval';
import {askAster} from '../src/lib/asterKnowledge';
import {createNotebook,createSource} from '../src/lib/utils';
import {isCurrentEvidence} from '../src/lib/evidence';

const columnLabels='Service What it does Scenario clue';
const rows=['LakeQuery Serverless SQL over stored data\nAd hoc analysis of application logs','FlowBus Durable stream with replay\nLow-latency delivery to multiple consumers','BoardView Business intelligence and dashboards\nCompare quality, cost, and adoption'];
const table=()=>createSource(`[Page 4]\nAnalytics reference\n\n${columnLabels}\n\n${rows.join('\n\n')}\n\n[Page 5]\nA separate instruction describes revision handling.\n\nService What it does Scenario clue`,'Synthetic service reference');
afterEach(()=>vi.unstubAllGlobals());

describe('Aster table evidence keeps facts and column context distinct',()=>{
 it.each(['Service What it does GenAI scenario clue','Component Responsibility Example','Metric Description Unit','Field What to understand','API Operation Purpose Example','Service When to use Example'])('never treats a column heading as a fact: %s',header=>expect(isUsefulAsterPassage(header)).toBe(false));
 it('does not rank publication and navigation notes as subject explanations, while retaining full reader data',()=>{
  const source=createSource('This independent reference edition was prepared from learning notes and product documentation.\n\nThe links below are the primary reading references.\n\nThe contents and numbered references are clickable. PDF bookmarks provide chapter navigation.\n\nA catalog describes tables so a query engine can discover data.','Publication');
  expect(asterContextBlocks(source).map(block=>block.quote)).toEqual(['A catalog describes tables so a query engine can discover data.']);expect(source.text).toContain('PDF bookmarks');
 });
 it('retains compact wrapped factual rows even without verbs, with exact current header references',()=>{
  const source=table(),before=JSON.stringify(source),blocks=asterContextBlocks(source);
  for(const row of rows){const block=blocks.find(block=>block.quote===row)!;expect(block).toBeDefined();expect(isCurrentEvidence(block,[source])).toBe(true);const context=asterPassageContext(block);expect(context.map(ref=>ref.quote)).toEqual([columnLabels]);expect(context.every(ref=>isCurrentEvidence(ref,[source]))).toBe(true);expect(context[0].locator.label).toContain('Page 4');}
  expect(blocks.some(block=>block.quote===columnLabels)).toBe(false);expect(JSON.stringify(source)).toBe(before);
 });
 it('finds the named row, never a lone header, and uses column terms only to locate real rows',async()=>{
  const source=table(),notebook=createNotebook({sources:[source]});
  const named=await askAster(notebook,'What does FlowBus do?',{semantic:false});expect(named.status).toBe('found');expect(named.passages[0].reference.quote).toContain(rows[1]);expect(named.passages[0].contextReferences?.[0].quote).toBe(columnLabels);
  const general=await askAster(notebook,'Explain the services',{semantic:false});expect(general.status).toBe('found');expect(general.passages.length).toBeGreaterThan(0);expect(general.passages.every(p=>rows.some(row=>p.reference.quote.includes(row)))).toBe(true);
  expect(general.passages.every(p=>p.contextReferences?.every(ref=>isCurrentEvidence(ref,[source])))).toBe(true);
 });
 it('attaches an exact numbered section heading only to factual table rows, never as an answer',async()=>{
  const source=createSource('[Page 8]\n12 Transfer services\n\nService Purpose Example\n\nQueue Ordered delivery for background workers\n\nStream Replayable events for independent consumers','Section table'),blocks=asterContextBlocks(source);
  expect(blocks).toHaveLength(2);expect(asterPassageContext(blocks[0]).map(ref=>ref.quote)).toEqual(['12 Transfer services','Service Purpose Example']);
  const result=await askAster(createNotebook({sources:[source]}),'Explain transfer services',{semantic:false});expect(result.status).toBe('found');expect(result.passages.every(p=>!p.reference.quote.startsWith('12 Transfer'))).toBe(true);expect(result.passages.every(p=>p.contextReferences?.reduce((total,ref)=>total+ref.quote.length,0)!<=600)).toBe(true);
 });
 it.each(['2.1 Security','Security rules'])('does not attach an older section title across a closer heading: %s',heading=>{
  const source=createSource(`[Page 8]\n1 Storage\n\nStored items remain available.\n\n${heading}\n\nComponent Purpose Example\n\nIdentity Verified caller identity for requests\n\nPolicy Access conditions for resource requests`,'Sections'),blocks=asterContextBlocks(source),row=blocks.find(block=>block.quote.startsWith('Identity'))!;
  expect(asterPassageContext(row).map(ref=>ref.quote)).not.toContain('1 Storage');expect(asterPassageContext(row).map(ref=>ref.quote)).toContain('Component Purpose Example');
 });
 it.each(['What is this study guide about?','Tell me about these materials','What will I learn here?','Give me the big picture'])('recognizes natural whole-source overview wording: %s',async question=>{
  const source=table(),result=await askAster(createNotebook({sources:[source]}),question,{semantic:false});expect(result.status).toBe('found');expect(result.coverage?.overview).toBe(true);expect(result.passages.every(p=>isCurrentEvidence(p.reference,[source]))).toBe(true);
 });
 it('keeps an explicit subject in a study-guide question instead of broadening it to every topic',async()=>{
  const n=createNotebook({sources:[table()]}),result=await askAster(n,'Explain FlowBus study guide',{semantic:false});expect(result.coverage?.overview).toBe(false);expect(result.passages[0].reference.quote).toBe(rows[1]);
 });
 it('keeps both comparison rows and exact citations without inserting or reordering cells',async()=>{
  const source=table(),n=createNotebook({sources:[source]}),result=await askAster(n,'What is the difference between LakeQuery and FlowBus?',{semantic:false,limit:6});
  expect(result.status).toBe('found');expect(result.passages.map(p=>p.reference.quote).join('\n')).toContain(rows[0]);expect(result.passages.map(p=>p.reference.quote).join('\n')).toContain(rows[1]);expect(result.passages.every(p=>source.text.slice(p.reference.start,p.reference.end)===p.reference.quote)).toBe(true);
 });
 it('preserves similar table rows whose small value differences are the point of the comparison',async()=>{
  const rows=['BlueQueue Durable event delivery with replay Store recent application records securely for five days','GoldQueue Durable event delivery with replay Store recent application records securely for ten days'];
  const source=createSource(`Service Purpose Example\n\n${rows.join('\n\n')}`,'Tier reference'),result=await askAster(createNotebook({sources:[source]}),'Compare BlueQueue and GoldQueue',{semantic:false});
  expect(result.passages.map(p=>p.reference.quote)).toEqual(rows);expect(result.passages.every(p=>isCurrentEvidence(p.reference,[source]))).toBe(true);
 });
 it('splits Markdown table rows without including separator syntax in evidence or losing header context',async()=>{
  const source=createSource('| Metric | Description | Unit |\n| --- | --- | --- |\n| Latency | Time to complete a request | ms |\n| Throughput | Completed requests per interval | requests/s |','Table'),blocks=asterContextBlocks(source);
  expect(blocks).toHaveLength(2);expect(blocks.every(block=>block.quote.startsWith('| Latency')||block.quote.startsWith('| Throughput'))).toBe(true);expect(blocks.every(block=>isCurrentEvidence(block,[source]))).toBe(true);expect(asterPassageContext(blocks[0])[0].quote).toBe('| Metric | Description | Unit |');
  const r=await askAster(createNotebook({sources:[source]}),'What unit measures Latency?',{semantic:false});expect(r.passages[0].reference.quote).toContain('ms');expect(r.passages[0].contextReferences?.[0].quote).toContain('Unit');
 });
 it('does not promote empty cells, repeated labels or an unfilled row name to factual evidence',()=>{
  const source=createSource('| Metric | Description | Unit |\n| --- | --- | --- |\n| | | |\n| Pending | | |\n| Metric | Description | Unit |\n| Latency | Time to complete a request | ms |','Sparse table'),blocks=asterContextBlocks(source);
  expect(blocks.map(block=>block.quote)).toEqual(['| Latency | Time to complete a request | ms |']);expect(asterPassageContext(blocks[0])[0].quote).toBe('| Metric | Description | Unit |');
 });
 it('keeps a flattened contiguous table body intact when line wrapping obscures row boundaries',()=>{
  const source=createSource('Component Purpose Example\nCache Temporary retained values for fast lookup\nBuffer Temporary ordered values before delivery','Flat table'),blocks=asterContextBlocks(source);
  expect(blocks).toHaveLength(1);expect(blocks[0].quote).toBe('Cache Temporary retained values for fast lookup\nBuffer Temporary ordered values before delivery');expect(asterPassageContext(blocks[0])[0].quote).toBe('Component Purpose Example');expect(isCurrentEvidence(blocks[0],[source])).toBe(true);
 });
 it('does not infer table context across pages, omitted furniture, headings or a new prose section',()=>{
  const source=createSource('[Page 1]\nComponent Purpose Example\n\n[Page 2]\nCache Temporary retained values for fast lookup\n\nBuffer Temporary ordered values before delivery\n\nService What it does Scenario clue\n\nA new section explains storage rules.\n\nQueue Durable ordered delivery for workers\n\nStore Retained data for future use','Separated');
  expect(asterContextBlocks(source).every(block=>asterPassageContext(block).length===0)).toBe(true);
 });
 it('does not return column headings or unsupported subjects when material has no matching facts',async()=>{
  const headings=createNotebook({sources:[createSource('Service What it does Scenario clue\n\nComponent Responsibility Example','Labels only')]});expect((await askAster(headings,'Explain the services',{semantic:false})).status).toBe('not-found');
  expect((await askAster(createNotebook({sources:[table()]}),'quantum superconductivity',{semantic:false})).status).toBe('not-found');
 });
 it('rebuilds both row and header references on replacement, keeping source and receipts untouched',async()=>{
  const source=table(),n=createNotebook({sources:[source]}),before=JSON.stringify(n),r=await askAster(n,'FlowBus',{semantic:false});expect(JSON.stringify(n)).toBe(before);
  const changed={...source,text:source.text.replace('Scenario clue','Example constraint')};expect(isCurrentEvidence(r.passages[0].reference,[changed])).toBe(false);expect(r.passages[0].contextReferences?.every(ref=>!isCurrentEvidence(ref,[changed]))).toBe(true);
  const fresh=await askAster({...n,sources:[changed]},'FlowBus',{semantic:false});expect(fresh.passages[0].contextReferences?.[0].quote).toContain('Example constraint');
 });
 it.each(['Explain that more simply.','Can you explain that more simply?','How are they different?','Which one should I use?','What about the second one?','Could you describe it in more detail?'])('resolves only an explicit deictic follow-up: %s',question=>{
  expect(asterTopicQuestion(question,'Compare LakeQuery and FlowBus')).toEqual({topicQuestion:`Compare LakeQuery and FlowBus\n${question}`,previousQuestion:'Compare LakeQuery and FlowBus'});
 });
 it.each(['Explain quantum physics more simply','How are neurons different?','Which database should I use?','What about Kubernetes?'])('does not contaminate a new topic with previous conversation: %s',question=>expect(asterTopicQuestion(question,'Compare LakeQuery and FlowBus')).toEqual({topicQuestion:question}));
});
