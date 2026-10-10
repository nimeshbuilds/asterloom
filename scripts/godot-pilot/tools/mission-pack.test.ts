import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,symlink,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {convertLearnpack,listPilotActivities} from './mission-pack';
import {publicFixture} from './public-fixture';
import {isCurrentEvidence,sourceRevision} from '../../../src/lib/evidence';
import {evaluateActivityForAuthoring,validateActivity} from '../../../src/lib/structuredEngine';

const both={sequenceId:'public-sequence',dependencyId:'public-dependency'};
function edited(change:(raw:any)=>void){const raw=JSON.parse(publicFixture().text);change(raw);return JSON.stringify(raw);}
test('converts real validated .learnpack shapes without changing models, prepared explanations, citations or source text',()=>{
 const f=publicFixture(),original=f.text,pack=convertLearnpack(original,both);
 assert.deepEqual(pack.sequence,f.sequence);assert.deepEqual(pack.dependency,f.dependency);
 assert.deepEqual(pack.teaching,f.notebook.aiLearningPlan!.missions);
 assert.deepEqual(pack.sources.map(source=>source.text),f.notebook.sources.map(source=>source.text));
 assert.equal(pack.lessons.length,9);assert.equal(pack.source.id,pack.sources[0].id);
 for(const lesson of pack.lessons){assert.equal(lesson.quote,lesson.citations[0].quote);assert.ok(lesson.citations.every(ref=>isCurrentEvidence(ref,f.notebook.sources)));}
 for(const entry of pack.activityEvidence)assert.ok(entry.citations.every(ref=>isCurrentEvidence(ref,f.notebook.sources)));
 assert.deepEqual(pack.assessment,{mode:'experimental-practice',mastery:false,hostProgressWrites:false});
 assert.equal(pack.sequence!.reviewStatus,'needs-review');assert.equal(pack.provenance.packageSha256,createHash('sha256').update(original).digest('hex'));
 assert.equal(f.text,original);assert.deepEqual(convertLearnpack(original,both),pack);
 assert.equal(pack.sources[0].revision,sourceRevision(f.source));
});
test('retains UTF-16 citation positions with emoji and accents before quoted evidence',()=>{
 const f=publicFixture(),pack=convertLearnpack(f.text,{sequenceId:f.sequence.id}),ref=pack.lessons[0].citations[0];
 assert.equal(pack.offsetEncoding,'utf-16');assert.ok(f.source.text.slice(0,ref.start).includes('🧭 — café'));
 assert.equal(f.source.text.slice(ref.start,ref.end),ref.quote);
 assert.notEqual(Array.from(f.source.text).slice(ref.start,ref.end).join(''),ref.quote);
 assert.ok(pack.activityEvidence[0].citations.every(item=>f.source.text.slice(item.start,item.end)===item.quote));
});
test('rejects stale source/teaching/model, absent teaching and non-ready evidence instead of inventing a lesson',()=>{
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.sources[0].text+='\nChanged context.'),both),/changed|no longer/);
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.activities[0].instruction='Changed task.'),both),/no longer matches/);
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.aiLearningPlan.missions[0].chunks[0].citations[0].quote='Unsupported quote'),both),/evidence|quote|citation/i);
 assert.throws(()=>convertLearnpack(edited(raw=>delete raw.notebook.aiLearningPlan),both),/current prepared lesson/);
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.sources[0].status='error'),both),/source|evidence|changed/i);
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.creation.status='draft'),both),/Finish the saved game/);
});
test('requires an explicit supported activity and adult presentation without silent selection or reduction',()=>{
 const f=publicFixture();assert.throws(()=>convertLearnpack(f.text,{}),/Select an explicit/);
 assert.throws(()=>convertLearnpack(f.text,{sequenceId:f.dependency.id}),/different kind/);
 assert.throws(()=>convertLearnpack(f.text,{sequenceId:'unknown'}),/missing/);
 assert.throws(()=>convertLearnpack(f.text,{script:'res:\/\/evil.gd'} as any),/Unknown/);
 const noTeaching=JSON.parse(f.text);delete noTeaching.notebook.aiLearningPlan;noTeaching.notebook.ageGroup='9-11';
 assert.throws(()=>convertLearnpack(JSON.stringify(noTeaching),both),/for adults/);
 assert.deepEqual(listPilotActivities(f.text).map(item=>[item.id,item.kind,item.hasCurrentTeaching]),[['public-sequence','sequence',true],['public-dependency','dependency',true]]);
});
test('rejects oversized but otherwise valid runtime models; no items, rules or labels are truncated',()=>{
 const base=JSON.parse(publicFixture().text);delete base.notebook.aiLearningPlan;
 const seq=base.notebook.activities[0];for(let i=3;i<9;i++)seq.items.push({id:`extra-${i}`,label:`Extra source step ${i}`});
 assert.throws(()=>convertLearnpack(JSON.stringify(base),{sequenceId:seq.id}),/8 sequence steps/);
 const large=JSON.parse(publicFixture().text);delete large.notebook.aiLearningPlan;
 large.notebook.activities[1].nodes.push(...Array.from({length:6},(_,i)=>({id:`node-${i}`,label:`Extra node ${i}`})));
 assert.throws(()=>convertLearnpack(JSON.stringify(large),{dependencyId:'public-dependency'}),/8 dependency nodes/);
 const edges=JSON.parse(publicFixture().text);delete edges.notebook.aiLearningPlan;edges.notebook.activities[1].acyclic=false;
 edges.notebook.activities[1].edges=Array.from({length:13},(_,i)=>({from:'build',to:'send',relation:`relation-${i}`}));
 assert.throws(()=>convertLearnpack(JSON.stringify(edges),{dependencyId:'public-dependency'}),/12 edges/);
 const label=JSON.parse(publicFixture().text);delete label.notebook.aiLearningPlan;label.notebook.activities[0].items[0].label='x'.repeat(201);
 assert.throws(()=>convertLearnpack(JSON.stringify(label),{sequenceId:'public-sequence'}),/200 characters/);
});
test('data projection excludes provider credentials, progress, scripts and resource paths',()=>{
 const text=edited(raw=>{raw.notebook.apiKey='never-export-credential';raw.notebook.progress={xp:99999};raw.notebook.script='res://evil.gd';raw.notebook.sources[0].shader='res://evil.gdshader';raw.notebook.resources=['res://evil.tscn'];});
 const serialized=JSON.stringify(convertLearnpack(text,both));
 for(const key of ['never-export-credential','"progress"','evil.gd','evil.tscn','"resources"','"apiKey"'])assert.ok(!serialized.includes(key));
 assert.throws(()=>convertLearnpack(edited(raw=>raw.notebook.activities[0].script='res://evil.gd'),both),/activity\.script: unknown field/);
});
test('rejects factory-valid sequence rule lists that the native pilot cannot load, without silently simplifying them',()=>{
 const raw=JSON.parse(publicFixture().text);delete raw.notebook.aiLearningPlan;
 const sequence=raw.notebook.activities[0];
 for(let i=3;i<8;i++)sequence.items.push({id:`extra-${i}`,label:`Extra source step ${i}`});
 const ids=sequence.items.map((item:{id:string})=>item.id);
 sequence.constraints=ids.flatMap((before:string,index:number)=>ids.slice(index+1).map((after:string)=>({before,after}))).slice(0,13);
 assert.equal(validateActivity(sequence,raw.notebook.sources).success,true);
 const before=JSON.stringify(raw);
 assert.throws(()=>convertLearnpack(before,{sequenceId:sequence.id}),/at most 12 sequence constraints; no ordering rules were removed/);
 assert.equal(JSON.stringify(raw),before);
 sequence.constraints.pop();
 assert.throws(()=>convertLearnpack(JSON.stringify(raw),{sequenceId:sequence.id}),/current prepared lesson/);
 const duplicate=JSON.parse(publicFixture().text);delete duplicate.notebook.aiLearningPlan;
 duplicate.notebook.activities[0].constraints.push({...duplicate.notebook.activities[0].constraints[0]});
 assert.equal(validateActivity(duplicate.notebook.activities[0],duplicate.notebook.sources).success,true);
 assert.throws(()=>convertLearnpack(JSON.stringify(duplicate),{sequenceId:'public-sequence'}),/distinct sequence constraints; duplicate ordering rules were not removed/);
});
test('validates preserved original-file bytes without copying them or rewriting the input',()=>{
 const bytes=Buffer.from('%PDF-1.4\nOriginal synthetic teaching document.\n%%EOF\n');
 const text=edited(raw=>{raw.notebook.sources[0].originalFile={name:'public-source.pdf',mime:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),dataUrl:`data:application/pdf;base64,${bytes.toString('base64')}`};});
 const pack=convertLearnpack(text,both);assert.equal(JSON.stringify(pack).includes('data:application/pdf'),false);
 const original=JSON.parse(text).notebook.sources[0].originalFile;assert.deepEqual(Buffer.from(original.dataUrl.split(',')[1],'base64'),bytes);
 const tampered=JSON.parse(text);tampered.notebook.sources[0].originalFile.sha256='0'.repeat(64);
 assert.throws(()=>convertLearnpack(JSON.stringify(tampered),both),/checksum does not match/);
});
test('rejects complete output above its byte limit without truncating readable sources',()=>{
 const raw=JSON.parse(publicFixture().text),revisions=new Map<string,string>();
 for(const source of raw.notebook.sources){source.text+='\n'+'Bounded public filler. '.repeat(72_000);revisions.set(source.id,sourceRevision(source));}
 const update=(value:any)=>{if(!value||typeof value!=='object')return;if(value.sourceRevision&&revisions.has(value.sourceId))value.sourceRevision=revisions.get(value.sourceId);for(const child of Object.values(value))update(child);};update(raw.notebook.aiLearningPlan);
 assert.throws(()=>convertLearnpack(JSON.stringify(raw),both),/complete pilot pack exceeds 4 MiB/);
});
test('preserves every sequence ordering rule and labeled dependency edge for the existing evaluator',()=>{
 const pack=convertLearnpack(publicFixture().text,both);
 assert.equal(evaluateActivityForAuthoring(pack.sequence!,{order:['read','compare','record']}).correct,true);
 assert.equal(evaluateActivityForAuthoring(pack.sequence!,{order:['compare','read','record']}).correct,false);
 assert.equal(evaluateActivityForAuthoring(pack.dependency!,{edges:pack.dependency!.edges}).correct,true);
 assert.equal(evaluateActivityForAuthoring(pack.dependency!,{edges:pack.dependency!.edges.map(edge=>({...edge,relation:'causes'}))}).correct,false);
 const selected=convertLearnpack(publicFixture().text,{dependencyId:'public-dependency'});assert.equal(selected.sequence,undefined);assert.equal(selected.sources.length,1);assert.equal(selected.sources[0].id,'public-trace');
});
test('CLI writes one data file atomically, keeps input bytes, rejects existing files/symlinks and makes no output on invalid input',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'asterloom-pilot-bridge-'));
 try{
  const input=join(directory,'public.learnpack'),output=join(directory,'pilot.json'),f=publicFixture();await writeFile(input,f.text);
  const cli=fileURLToPath(new URL('./convert-learnpack.ts',import.meta.url));
  const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',cli,...args],{encoding:'utf8',timeout:30_000});
  let r=run(['--input',input,'--output',output,'--sequence',f.sequence.id,'--dependency',f.dependency.id]);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')),convertLearnpack(f.text,both));assert.equal(await readFile(input,'utf8'),f.text);
  const before=await readFile(output);r=run(['--input',input,'--output',output,'--sequence',f.sequence.id]);assert.notEqual(r.status,0);assert.deepEqual(await readFile(output),before);
  const alias=join(directory,'alias.json');await symlink(output,alias);r=run(['--input',input,'--output',alias,'--sequence',f.sequence.id]);assert.notEqual(r.status,0);assert.deepEqual(await readFile(output),before);
  const bad=join(directory,'bad.json');r=run(['--input',input,'--output',bad,'--sequence','absent']);assert.notEqual(r.status,0);assert.ok(!(await readdir(directory)).includes('bad.json'));
  const invalid=join(directory,'invalid-utf8.learnpack');await writeFile(invalid,Buffer.from([123,34,120,34,58,34,0xff,34,125]));r=run(['--input',invalid,'--output',bad,'--sequence',f.sequence.id]);assert.notEqual(r.status,0);assert.match(r.stderr,/not valid UTF-8/);assert.ok(!(await readdir(directory)).includes('bad.json'));
  const sourceAlias=join(directory,'alias.learnpack');await symlink(input,sourceAlias);r=run(['--input',sourceAlias,'--output',bad,'--sequence',f.sequence.id]);assert.notEqual(r.status,0);assert.ok(!(await readdir(directory)).includes('bad.json'));
  assert.ok(!(await readdir(directory)).some(name=>name.endsWith('.pending')));
 }finally{await rm(directory,{recursive:true,force:true});}
});
