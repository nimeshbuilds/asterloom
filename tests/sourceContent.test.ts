import {describe,it,expect} from 'vitest';
import {sourceContentExclusions,isLearningContentRange,hasLearningContentQuote} from '../src/lib/sourceContent';
import {segmentSource,sourceLearningUnits} from '../src/lib/sourceUnits';
import {evidenceBlocks} from '../src/lib/evidence';
import {compileNotebook} from '../src/lib/compiler';
import {createNotebook,createSource} from '../src/lib/utils';
import {buildDirectorSourceInventory,directorInputRevision} from '../src/lib/gameDirectorSources';
import {emptyGameDesign,validateGameDesign} from '../src/lib/gameDesign';
import {textDigest,sourceRevision} from '../src/lib/evidence';
import {gamePlanningPrompt,gameWritingPrompt,gameCheckingPrompt} from '../src/lib/gameDirector';

const cover="The World After AI: What's Actually Coming for All of Us Part 1 of 12 4 A data-backed investigation into AI's real impact on the economy, jobs, and the future of work EVIDENCE-DRIVEN EARLY 2026 Blogs by Nimesh @ LearnIVO.ai";
const body='Task exposure is a measure of the tasks a system could perform, not a count of jobs already lost. Adoption also depends on cost and organizational choices.\n\nFor example, one role can contain both exposed tasks and tasks requiring human responsibility.';

describe('instructional content versus publication furniture',()=>{
 it('reproduces the reported flattened cover and excludes it from learning units, retrieval, cards and AI planning',()=>{
  const source=createSource(cover,'The World After AI');
  expect(sourceContentExclusions(source.text)).toEqual([{start:0,end:cover.length,kind:'cover',reason:'Publication cover or promotional front matter.'}]);
  expect(segmentSource(source.text)).toEqual([]);expect(sourceLearningUnits(source)).toEqual([]);expect(evidenceBlocks(source)).toEqual([]);expect(compileNotebook([source]).cards).toEqual([]);
  const inventory=buildDirectorSourceInventory({sources:[source]});expect(inventory.units).toEqual([]);expect(inventory.batches).toEqual([]);expect(inventory.unavailableSources[0].reason).toContain('Only publication');
  expect(source.text).toBe(cover);
 });
 it('keeps the complete actual body and its headings with exact offsets after a multi-line PDF cover',()=>{
  const source=createSource('[Page 1]\nThe World After AI\nPart 1 of 12\nA data-backed investigation into AI and jobs\nEARLY 2026\nBlogs by Nimesh @ LearnIVO.ai\n\n[Page 2]\n# Exposure and adoption\n'+body+'\n\n© 2026 LearnIVO. All rights reserved.\nPage 2 of 12');
  const units=sourceLearningUnits(source);expect(units).toHaveLength(1);expect(units[0].title).toBe('Exposure and adoption');expect(units[0].quote).toBe(body);
  const blocks=evidenceBlocks(source);expect(blocks.every(block=>block.locator.kind==='page'&&block.locator.label.startsWith('Page 2'))).toBe(true);
  for(const item of [...units,...blocks])expect(source.text.slice(item.start,item.end)).toBe(item.quote);
  expect(blocks.map(b=>b.quote).join('\n')).not.toMatch(/LearnIVO|Part 1|Page 2 of/);
 });
 it('carves a flattened cover prefix and appended footer out without discarding an adjacent genuine finding',()=>{
  const sentence='Task exposure does not measure completed job losses.';
  const source=createSource(cover+' '+sentence+' Blogs by Nimesh @ LearnIVO.ai');
  const segments=segmentSource(source.text);expect(segments.map(s=>s.quote)).toEqual([sentence]);
  expect(source.text.slice(segments[0].start,segments[0].end)).toBe(sentence);
 });
 it('keeps a real body immediately after a multi-line cover on the same page',()=>{
  const source=createSource('[Page 1]\nThe World After AI\nPart 1 of 12\nA data-backed investigation into AI and jobs\nEARLY 2026\nBlogs by Nimesh @ LearnIVO.ai\n\n'+body);
  expect(sourceLearningUnits(source).map(u=>u.quote)).toEqual([body]);
 });
 it('does not treat headings, short facts, definitions, code examples, or spoken transcript text as junk',()=>{
  const text='# Cells\nCells divide.\n\n# Measurements\nWater freezes at 0°C.\n\n# Copyright\nCopyright: the legal right protecting a creator’s work.\nAuthor: a person who creates a written work.\n\n# Navigation concepts\nNavigation means the process of finding a route.\nBy adding water, the sample gains mass.';
  const source=createSource(text);expect(sourceContentExclusions(text)).toEqual([]);expect(sourceLearningUnits(source).map(u=>u.title)).toEqual(['Cells','Measurements','Copyright','Navigation concepts']);expect(segmentSource(text).some(p=>p.quote==='Cells divide.')).toBe(true);
  const code='```text\nCopyright 2026 Example\nHome | About | Contact\n```';expect(sourceContentExclusions('1 / 2')).toEqual([]);expect(segmentSource('1 / 2')[0].quote).toBe('1 / 2');expect(sourceContentExclusions(code)).toEqual([]);expect(segmentSource(code)[0].kind).toBe('code');
  const subtitle='WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWritten by Jane Doe\n\n00:00:05.000 --> 00:00:07.000\nThe title describes the book.';expect(sourceContentExclusions(subtitle)).toEqual([]);expect(evidenceBlocks(createSource(subtitle)).map(b=>b.quote)).toContain('Written by Jane Doe');
 });
 it('preserves substantive findings even when a sentence begins with attribution or a rights label',()=>{
  const findings=['Published by X, the report found employment increased by 12%.','Written by Jane Doe, this account explains why adoption is uneven.','© 2026 Example. The license permits noncommercial distribution.','Copyright law is the legal framework protecting original works.','Copyright: the legal right protecting a creator’s work.'];
  for(const finding of findings){expect(sourceContentExclusions(finding),finding).toEqual([]);expect(segmentSource(finding).map(p=>p.quote)).toEqual([finding]);}
  expect(sourceContentExclusions('© 2026 LearnIVO. All rights reserved.')[0].kind).toBe('publication');
  expect(sourceContentExclusions('> '+cover)).toEqual([]);
 });
 it('removes contents and navigation but keeps procedural numbering and real definitions',()=>{
  const source=createSource('Contents\n1. Introduction\n2. The evidence\nConclusion ........ 12\n\nHome | About | Contact | Privacy policy\n\n# Procedure\n1. Open the panel.\n2. Select the command.\n3. Record the result.\n\n# Concepts\n1. Seed: the plant structure containing an embryo.\n2. Root: the organ absorbing water and minerals.');
  const units=sourceLearningUnits(source);expect(units.map(u=>u.title)).toEqual(['Procedure','Concepts']);expect(units[0].kind).toBe('procedure');expect(units[1].concepts.map(c=>c.term)).toEqual(['Seed','Root']);expect(compileNotebook([source]).cards.length).toBeGreaterThan(0);
 });
 it('separates metadata gaps so exact unit quotes never silently reinsert a removed footer',()=>{
  const source=createSource(body+'\n\nWritten by Jane Doe\n\nA measured outcome is different from a forecast because one records an observation.');
  const units=sourceLearningUnits(source);expect(units).toHaveLength(2);expect(units.every(u=>!u.quote.includes('Written by'))).toBe(true);expect(units.map(u=>u.quote).join('\n')).toContain('measured outcome');
  expect(isLearningContentRange(source.text,source.text.indexOf('Written by'),source.text.indexOf('Written by')+19)).toBe(false);
  expect(isLearningContentRange(source.text,0,body.length)).toBe(true);
 });
 it('retains exact broad legacy citations only when substantive body survives the excluded layout',()=>{
  for(const statement of ['Cells divide.','Water freezes at 0°C.','Copyright: the legal right protecting a creator’s work.','1. Open the panel.\n2. Record the result.']){
   const text='[Page 1]\n'+cover+'\n\n'+statement+'\n\nPublished by LearnIVO.ai';
   expect(hasLearningContentQuote(text,text),statement).toBe(true);
   expect(segmentSource(text).map(part=>part.quote).join('\n')).toBe(statement);
   expect(hasLearningContentQuote(text,cover)).toBe(false);
   expect(hasLearningContentQuote(text,'Published by LearnIVO.ai')).toBe(false);
  }
  for(const residue of ['', '\n\n', '\n[Page 2]\n', '\n# Exposure and adoption\n', '\nDetails\n']){
   const text=cover+residue;expect(isLearningContentRange(text,0,text.length),residue).toBe(false);
  }
 });
 it('invalidates legacy AI planning caches after changed selection policy while preserving usage receipts',()=>{
  const notebook=createNotebook({sources:[createSource(cover+'\n\n'+body,'Body')]}),provider={id:'compatible',model:'test',endpointFingerprint:null};
  const fresh=emptyGameDesign(notebook,provider),sources=notebook.sources.map(source=>({id:source.id,title:source.title,revision:sourceRevision(source),status:source.status,transcript:source.transcript,visualEvidence:source.visualEvidence,asset:source.asset?.sha256})).sort((a,b)=>a.id.localeCompare(b.id));
  const oldRevision=textDigest(JSON.stringify({version:1,sources,ageGroup:notebook.ageGroup,goal:notebook.goal,provider:provider.id,model:provider.model,endpoint:null}));
  const receipt={id:'request-legacy',stage:'plan',provider:'compatible',model:'test',startedAt:'2026-10-05T00:00:00.000Z',status:'completed' as const,usage:{status:'reported' as const,inputTokens:50,outputTokens:20,cachedInputTokens:10,cacheWriteTokens:0,reasoningTokens:0,totalTokens:70}};
  const oldCoverUnit={...fresh.units[0],id:'legacy-cover-unit',title:'Investigate the source',start:0,end:cover.length};
  const legacy={...fresh,inputRevision:oldRevision,status:'ready',units:[oldCoverUnit,...fresh.units],batches:[{id:'legacy-batch',unitIds:[oldCoverUnit.id],status:'checked',missions:[],study:[{unitId:oldCoverUnit.id,reason:'Read the source.'}],drafts:[],checks:[]},...fresh.batches],receipts:[receipt]};
  expect(directorInputRevision(notebook,{provider:provider.id,model:provider.model})).not.toBe(oldRevision);
  const repaired=validateGameDesign(legacy,notebook);expect(repaired).toEqual({...fresh,receipts:[receipt]});expect(repaired.units.some(u=>u.id==='legacy-cover-unit')).toBe(false);expect(repaired.receipts[0].usage.totalTokens).toBe(70);
 });
 it('does not invalidate paid planning for unaffected body-only sources',()=>{
  const notebook=createNotebook({sources:[createSource(body)]}),provider={id:'compatible',model:'test',endpointFingerprint:null};
  const current=emptyGameDesign(notebook,provider);expect(validateGameDesign(current,notebook)).toEqual(current);
  const sources=notebook.sources.map(source=>({id:source.id,title:source.title,revision:sourceRevision(source),status:source.status,transcript:source.transcript,visualEvidence:source.visualEvidence,asset:source.asset?.sha256})).sort((a,b)=>a.id.localeCompare(b.id));
  expect(current.inputRevision).toBe(textDigest(JSON.stringify({version:1,sources,ageGroup:notebook.ageGroup,goal:notebook.goal,provider:provider.id,model:provider.model,endpoint:null})));
 });
 it('makes cover exclusion explicit to the model without replacing local evidence checks',()=>{
  const notebook=createNotebook({sources:[createSource(body)]}),design=emptyGameDesign(notebook,{id:'compatible',model:'test',endpointFingerprint:null}),units=buildDirectorSourceInventory(notebook).units;
  expect(gamePlanningPrompt(notebook,design.batches[0],units)).toContain('Cover titles');
  expect(gameWritingPrompt(notebook,{...design.batches[0],missions:[]},units)).toContain('Do not quote cover/title');
  expect(gameWritingPrompt(notebook,{...design.batches[0],missions:[]},units)).toContain('Default effects to standard');
  expect(gameCheckingPrompt({...design.batches[0],drafts:[]})).toContain('substantive source claim');
 });
});

describe('old AI teaching repair without erasing nearby source lessons',()=>{
 it('rejects cover citations on create/read but retains valid body citations in the same broad source window',async()=>{
  const {validateAILearningMissionDraft,currentAILearningMission,validateImportedAILearningPlan,reconcileAILearningPlan,aiLearningActivityFingerprint}=await import('../src/lib/aiLearningPlan');
  const source=createSource(cover+'\n\n'+body,'Mixed publication'),activity={version:1 as const,id:'body-activity',kind:'sequence' as const,title:'Follow the source comparison',instruction:'Arrange the documented comparison.',explanation:'Use the stated evidence.',hint:'Read the source.',reviewStatus:'needs-review' as const,sourceRefs:[{sourceId:source.id,evidence:body}],items:[{id:'read',label:'Read'},{id:'compare',label:'Compare'}],constraints:[{before:'read',after:'compare'}]};
  const citation={sourceId:source.id,evidence:body.split('\n')[0]},draft={title:'Exposure and measured outcomes',objective:'Distinguish exposure from observed job loss.',conceptExplanation:{text:'The material distinguishes potential task capability from observed job loss.',citations:[citation]},chunks:[{id:'scope',title:'Keep the measure’s scope',text:'Exposure concerns what a system could perform.',citations:[citation]},{id:'limits',title:'Keep the conditions',text:'Adoption depends on costs and choices too.',citations:[citation]}],guidedApplication:{prompt:'Compare the stated distinction.',steps:['Read the cited conditions.']}};
  const context={activity,ageGroup:'adult',sources:[source],sourceWindow:{sourceId:source.id,start:0,end:source.text.length}},good=validateAILearningMissionDraft(draft,context);
  expect(good.sourceWindows[0].quote).toContain(cover);expect(good.conceptExplanation.citations[0].quote).not.toContain(cover);
  expect(()=>validateAILearningMissionDraft({...draft,conceptExplanation:{text:'Read the cover’s publication details.',citations:[{sourceId:source.id,evidence:cover}]}},context)).toThrow(/instructional body/);
  const coverRef={sourceId:source.id,sourceRevision:sourceRevision(source),start:0,end:cover.length,quote:cover,locator:{kind:'text' as const,label:'Lines 1–1',lineStart:1,lineEnd:1}};
  const badActivity={...activity,id:'old-cover-activity',sourceRefs:[{sourceId:source.id,evidence:cover}]},bad={...good,activityId:badActivity.id,activityFingerprint:aiLearningActivityFingerprint(badActivity),conceptExplanation:{text:'Read the publication details.',citations:[coverRef]},guidedApplication:{...good.guidedApplication,activityId:badActivity.id}};
  const notebook=createNotebook({sources:[source],activities:[activity,badActivity],aiLearningPlan:{version:1,missions:[good,bad]}});
  expect(currentAILearningMission(notebook,activity)).toEqual(good);expect(currentAILearningMission(notebook,badActivity)).toBeUndefined();
  expect(validateImportedAILearningPlan(notebook.aiLearningPlan,notebook)).toEqual({version:1,missions:[good]});expect(reconcileAILearningPlan(notebook.aiLearningPlan,notebook)).toEqual({version:1,missions:[good]});
  const corrupt=structuredClone(good);corrupt.chunks[0].citations[0].quote='Invented citation';expect(()=>validateImportedAILearningPlan({version:1,missions:[bad,corrupt]},notebook)).toThrow(/evidence changed/);
  expect(notebook.sources[0].text).toBe(cover+'\n\n'+body);expect(notebook.activities).toHaveLength(2);
  // A legacy whole-page rectangle can include publication furniture without
  // making its genuine body lesson obsolete or rewriting the original quote.
  const broadActivity={...activity,sourceRefs:[{sourceId:source.id,evidence:source.text}]},broadCitation={sourceId:source.id,evidence:source.text};
  const broad=validateAILearningMissionDraft({...draft,conceptExplanation:{...draft.conceptExplanation,citations:[broadCitation]},chunks:draft.chunks.map(chunk=>({...chunk,citations:[broadCitation]}))},{...context,activity:broadActivity});
  const broadNotebook=createNotebook({sources:[source],activities:[broadActivity],aiLearningPlan:{version:1,missions:[broad]}});
  expect(currentAILearningMission(broadNotebook,broadActivity)).toEqual(broad);expect(validateImportedAILearningPlan(broadNotebook.aiLearningPlan,broadNotebook)).toEqual(broadNotebook.aiLearningPlan);expect(broad.conceptExplanation.citations[0].quote).toBe(source.text);
 });
});

describe('saved metadata-only learning is retained without current credit',()=>{
 it('teaches the body of a legacy whole-page reference without restoring its cover, page markers or footer',async()=>{
  const {buildLearningBriefing}=await import('../src/lib/learningBriefing');const {scaffoldById}=await import('../src/data/scaffolds');
  const procedure='Procedure for a safe reset:\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.';
  const source=createSource('[Page 1]\n'+cover+'\n\n[Page 2]\n'+procedure+'\n\nPublished by LearnIVO.ai');
  const activity={version:1 as const,id:'legacy-page-lesson',kind:'sequence' as const,title:'Reset safely',instruction:'Arrange the documented steps.',reviewStatus:'reviewed' as const,sourceRefs:[{sourceId:source.id,evidence:source.text}],items:[{id:'open',label:'Open the settings panel.'},{id:'choose',label:'Choose the reset command.'},{id:'confirm',label:'Confirm the selected reset.'}],constraints:[{before:'open',after:'choose'},{before:'choose',after:'confirm'}],hint:'Read the source.',explanation:'Use the documented order.'};
  const notebook=createNotebook({sources:[source],activities:[activity]}),plan=buildLearningBriefing({notebook,activity,scaffold:scaffoldById('process-reconstruction')!});
  expect(plan.status).not.toBe('blocked');expect(plan.coverage.uncoveredTargetIds).toEqual([]);expect(plan.mission.evidence[0].quote).toBe(procedure);expect(plan.walkthrough.kind).toBe('source-procedure');expect(plan.walkthrough.steps.map(step=>step.reference.quote)).toEqual(activity.items.map(item=>item.label));
  const mandatory=[...plan.mission.evidence,...plan.passages.map(p=>p.reference),...plan.practice.focusOptions.map(p=>p.reference),...plan.walkthrough.steps.map(step=>step.reference)];
  for(const ref of mandatory){expect(ref.quote).not.toMatch(/World After AI|LearnIVO|\[Page/);expect(source.text.slice(ref.start,ref.end)).toBe(ref.quote);}
  expect(activity.sourceRefs[0].evidence).toBe(source.text);
  const coverOnly={...activity,sourceRefs:[{sourceId:source.id,evidence:cover}]},blocked=buildLearningBriefing({notebook,activity:coverOnly,scaffold:scaffoldById('process-reconstruction')!});expect(blocked.status).toBe('blocked');expect(blocked.passages).toEqual([]);expect(blocked.mission.evidence).toEqual([]);
 });
 it('blocks launch/recall and clears current completion and scheduling while keeping historical effort and valid body work',async()=>{
  const {hasCurrentActivityEvidence}=await import('../src/lib/scaffoldRuntime');const {canScoreRecallCard}=await import('../src/lib/utils');const {emptyProgress}=await import('../src/lib/storage');const {reconcileNotebookProgress}=await import('../src/lib/progressRevision');
  const source=createSource(cover+'\n\n'+body),base={version:1 as const,kind:'sequence' as const,title:'Source model',instruction:'Arrange the supplied steps.',explanation:'Read the source.',hint:'Read carefully.',reviewStatus:'reviewed' as const,items:[{id:'one',label:'First'},{id:'two',label:'Second'}],constraints:[{before:'one',after:'two'}]};
  const bad={...base,id:'old-cover',sourceRefs:[{sourceId:source.id,evidence:cover}]},good={...base,id:'body-model',sourceRefs:[{sourceId:source.id,evidence:body}]};
  const card={id:'old-cover-card',prompt:'Who published this cover?',answer:'Nimesh',options:['Nimesh','Someone else'],correctIndex:0,explanation:'Read the cover.',sourceId:source.id,evidence:cover,concept:'Publisher',questionType:'manual' as const,reviewStatus:'reviewed' as const,tags:[]};
  const notebook=createNotebook({sources:[source],activities:[bad,good],cards:[card]});expect(hasCurrentActivityEvidence(bad,[source])).toBe(false);expect(hasCurrentActivityEvidence(good,[source])).toBe(true);expect(canScoreRecallCard(card,[source])).toBe(false);
  const at='2026-10-05T00:00:00.000Z',response={order:['one','two'],_draft:{checked:true}},entry={response,completed:true,score:1,maxScore:1,attempts:2,updatedAt:at,review:{activityId:bad.id,successfulReviews:1,attempts:1,lastCorrect:true,lastAttemptAt:at,dueAt:at,intervalDays:1}};
  const progress={...emptyProgress(notebook.id),xp:70,journal:[{id:'note',text:'My earlier reflection.',at}],completedCardIds:[card.id],cards:{[card.id]:{cardId:card.id,attempts:1,correct:1,successfulReviews:1,intervalDays:1,dueAt:at,lastAttemptAt:at,lastCorrect:true}},structured:{[bad.id]:entry,[good.id]:{...entry,review:{...entry.review,activityId:good.id}}}};
  const result=reconcileNotebookProgress(notebook,notebook,progress);expect(result.xp).toBe(70);expect(result.journal).toEqual(progress.journal);expect(result.completedCardIds).toEqual([]);expect(result.cards).toEqual({});expect(result.structured![bad.id]).toMatchObject({response,completed:false,score:0,maxScore:0,attempts:2});expect(result.structured![bad.id].review).toBeUndefined();expect(result.structured![good.id]).toEqual(progress.structured[good.id]);expect(notebook.activities).toHaveLength(2);
 });
 it('keeps an old whole-page model and its current credit when the body is intact alongside a footer',async()=>{
  const {hasCurrentActivityEvidence}=await import('../src/lib/scaffoldRuntime');const {canScoreRecallCard}=await import('../src/lib/utils');const {emptyProgress}=await import('../src/lib/storage');const {reconcileNotebookProgress}=await import('../src/lib/progressRevision');
  const source=createSource('Procedure for a safe reset:\n1. Open the settings panel.\n2. Choose the reset command.\n3. Confirm the selected reset.\n\nPublished by LearnIVO.ai');
  const activity={version:1 as const,id:'legacy-page',kind:'sequence' as const,title:'Reset safely',instruction:'Arrange the documented steps.',reviewStatus:'reviewed' as const,sourceRefs:[{sourceId:source.id,evidence:source.text}],items:[{id:'open',label:'Open the settings panel.'},{id:'choose',label:'Choose the reset command.'},{id:'confirm',label:'Confirm the selected reset.'}],constraints:[{before:'open',after:'choose'},{before:'choose',after:'confirm'}],hint:'Read the source.',explanation:'Use the documented order.'};
  const card={id:'legacy-card',prompt:'Which panel comes first?',answer:'settings',options:['settings','reset'],correctIndex:0,explanation:'Read the procedure.',sourceId:source.id,evidence:source.text,concept:'Safe reset',questionType:'cloze' as const,reviewStatus:'reviewed' as const,tags:[]};
  const notebook=createNotebook({sources:[source],activities:[activity],cards:[card]}),at='2026-10-05T00:00:00.000Z';
  const progress={...emptyProgress(notebook.id),xp:70,completedCardIds:[card.id],cards:{[card.id]:{cardId:card.id,attempts:1,correct:1,successfulReviews:1,intervalDays:1,dueAt:at,lastAttemptAt:at,lastCorrect:true}},structured:{[activity.id]:{response:{order:['open','choose','confirm'],_draft:{checked:true}},completed:true,score:2,maxScore:2,attempts:1,updatedAt:at}}};
  expect(hasCurrentActivityEvidence(activity,[source])).toBe(true);expect(canScoreRecallCard(card,[source])).toBe(true);expect(reconcileNotebookProgress(notebook,notebook,progress)).toBe(progress);expect(activity.sourceRefs[0].evidence).toBe(source.text);
  const coverWordCard={...card,id:'footer-word',answer:'LearnIVO',options:['LearnIVO','settings']};
  expect(canScoreRecallCard(coverWordCard,[source])).toBe(false);
  // Manual questions may use paraphrased answers; the body reference remains
  // current, while its semantic relationship is still the author's review.
  expect(canScoreRecallCard({...card,questionType:'manual',answer:'First find the control screen',options:['First find the control screen','Skip the first step']},[source])).toBe(true);
 });
});
