import {describe,it,expect} from 'vitest';
import fc from 'fast-check';
import {SCAFFOLDS} from '../src/data/scaffolds';
import {LESSON_STORY_FRAMES} from '../src/lib/lessonStory';
import {buildLearningBriefing,initialLessonState,validateLessonState,lessonPracticeReady,lessonReady,completeLesson,lessonQuestSupport,LESSON_SUPPORT_WINDOW_MS,type LearningPlan,type LessonState} from '../src/lib/learningBriefing';
import {createNotebook,createSource} from '../src/lib/utils';
import {isCurrentEvidence,bytesDigest,textDigest} from '../src/lib/evidence';
import {ACTIVITY_EXAMPLES,EXAMPLE_ACTIVITY_SOURCE,type StructuredActivity} from '../src/lib/structuredEngine';
import {prepareTranscriptSource} from '../src/lib/mediaTranscript';
import type {LearningCard,Notebook} from '../src/types';

const scaffold=SCAFFOLDS.find(s=>s.id==='recall-escape-mission')!;
function fixture(text='A packet is a small unit of data in this training model. This source describes only the supplied simulation.\n\nPacket: a small unit of data that travels between the two modeled devices. The example is limited to this training system.\n\nIn this model, the sender prepares a packet before the receiver inspects it. The material does not describe every real network.'){
 const source={...createSource(text,'Network field notes'),id:'source-notes'};
 const evidence=text.includes('Packet:')?'Packet: a small unit of data that travels between the two modeled devices.':text;
 const card:LearningCard={id:'packet',prompt:'Name the unit in the supplied model.',answer:'Packet',options:['Packet','Model'],correctIndex:0,explanation:'The source supplies this term.',sourceId:source.id,evidence,concept:'Packet',tags:[],questionType:'definition',reviewStatus:'extractive'};
 return createNotebook({id:'briefing-notebook',title:'A source-bound network',sources:[source],cards:[card],ageGroup:'adult'});
}
function plan(notebook=fixture()){return buildLearningBriefing({notebook,scaffold});}
function prepared(p:LearningPlan):LessonState{
 const state=initialLessonState(p);return{...state,stage:'practice',missionAccepted:true,viewedPassageIds:p.passages.map(x=>x.id),walkthroughStep:p.walkthrough.steps.length,practice:{...state.practice,focusId:p.practice.focusOptions[0]?.id??'',explanation:'This source describes a limited training model and its stated relationship.',connection:'I would need evidence before applying this beyond the supplied model.',compared:true,order:[...p.practice.orderIds]}};
}
function done(p=plan(),now=Date.parse('2026-10-04T00:00:00.000Z')){return completeLesson(p,prepared(p),now);}

describe('source-grounded teaching and authored mission coverage',()=>{
 it('covers all75 catalog recipes with distinct frames, age guidance and source-only subject statements',()=>{
  expect(SCAFFOLDS).toHaveLength(75);expect(Object.keys(LESSON_STORY_FRAMES).sort()).toEqual(SCAFFOLDS.map(s=>s.id).sort());
  const missions=new Set<string>();
  for(const s of SCAFFOLDS){const n=fixture();n.ageGroup=s.ages[0] as Notebook['ageGroup'];const p=buildLearningBriefing({notebook:n,scaffold:s});missions.add(p.story.mission);expect(p.story.fictional).toBe(true);expect(p.story.boundary).toContain('Subject facts');expect(p.story.domain).toBe(s.domain);for(const reference of [...p.passages.map(x=>x.reference),...p.walkthrough.steps.flatMap(x=>[x.reference,...(x.reason?[x.reason]:[])]),...p.practice.focusOptions.map(x=>x.reference)])expect(isCurrentEvidence(reference,n.sources)).toBe(true);}
  expect(missions.size).toBe(75);
 });
 it('teaches broader neighboring context, retaining the source qualifiers instead of only the answer',()=>{
  const n=fixture(),p=plan(n);expect(p.passages.length).toBe(3);expect(p.passages.map(x=>x.reference.quote).join('\n')).toContain('does not describe every real network');expect(p.passages.some(x=>x.role==='context')).toBe(true);expect(p.status).toBe('grounded');expect(p.walkthrough.kind).toBe('source-reading');expect(p.walkthrough.limitation).toContain('does not invent');expect(p.practice.prompt).toContain('condition');
 });
 it('walks a procedure only when the source explicitly labels and numbers steps',()=>{
  const n=fixture('Procedure for the training model:\n1. Read the supplied observation.\n2. Compare the observation with the rule.\n3. Record the decision and its evidence.');const p=plan(n);expect(p.walkthrough.kind).toBe('source-procedure');expect(p.walkthrough.steps.map(x=>x.reference.quote)).toEqual(['Read the supplied observation.','Compare the observation with the rule.','Record the decision and its evidence.']);expect(p.practice.orderIds).toHaveLength(3);const s=prepared(p);s.practice.order.reverse();expect(lessonPracticeReady(p,s)).toBe(false);s.practice.order.reverse();expect(lessonPracticeReady(p,s)).toBe(true);
  expect(plan(fixture('1. Read the supplied observation.\n2. Compare the observation with the rule.')).walkthrough.kind).toBe('source-reading');
 });
 it('quotes worked reasoning only when an example and reasoning are actually supplied',()=>{
  const p=plan(fixture('Example: In the supplied model, the display reads twelve. The value exceeds ten because twelve is greater than ten. This example uses only the displayed value.'));
  expect(p.walkthrough.kind).toBe('source-example');expect(p.walkthrough.steps.some(s=>s.reason?.quote.includes('because'))).toBe(true);
  expect(plan(fixture('Example: The display reads twelve. No rule or explanation is supplied here.')).walkthrough.kind).toBe('source-reading');
 });
 it('supports every structured activity primitive through exact source references without trusting author explanations as source facts',()=>{
  const source={...createSource(EXAMPLE_ACTIVITY_SOURCE.text,EXAMPLE_ACTIVITY_SOURCE.title),id:EXAMPLE_ACTIVITY_SOURCE.id};
  for(const activity of ACTIVITY_EXAMPLES){const p=buildLearningBriefing({notebook:createNotebook({id:'structured',sources:[source],cards:[]}),scaffold,activity:{...activity,explanation:'Unsupported imaginary teaching claim.'}});expect(p.status).not.toBe('blocked');expect(JSON.stringify(p.passages)).not.toContain('Unsupported imaginary');expect(p.targets).toEqual([activity.id]);}
  // Every other primitive consumes the same reviewed ActivityBase source contract; its answer fields never generate prose.
  for(const kind of ['completion','data','media','scenario','construction','explanation','picture','rule-switch','child-play','picture-build']){
   const a={...ACTIVITY_EXAMPLES[0],kind,...(kind==='media'?{mediaSourceId:source.id}:{})} as unknown as StructuredActivity;expect(buildLearningBriefing({notebook:createNotebook({sources:[source]}),scaffold,activity:a}).passages.length).toBeGreaterThan(0);
  }
 });
 it('does not fill sparse, source-free, stale or unavailable evidence with invented teaching',()=>{
  const sparse=plan(fixture('A small unit of data.')); expect(sparse.status).toBe('limited');expect(sparse.warnings.join(' ')).toContain('too brief');
  const manual=fixture();manual.cards[0]={...manual.cards[0],sourceId:'',evidence:'',questionType:'manual'};expect(plan(manual).status).toBe('blocked');expect(lessonReady(plan(manual),done(plan(manual)))).toBe(false);
  const stale=fixture();stale.sources[0].text='Source replaced.';expect(plan(stale).status).toBe('blocked');
  const unavailable=fixture();unavailable.sources[0].status='needs-transcript';expect(plan(unavailable).passages).toEqual([]);
 });
 it('accepts surrounding whitespace in an otherwise exact cited passage',()=>{const n=fixture('A source statement with its original whitespace.');n.sources[0].text='  '+n.sources[0].text+'  \n';n.cards[0].evidence=n.sources[0].text;expect(plan(n).coverage.uncoveredTargetIds).toEqual([]);expect(plan(n).status).toBe('limited');});
 it('keeps identical text from distinct source identities separately cited',()=>{
  const n=fixture();n.sources.push({...n.sources[0],id:'copy',title:'Independent copied document'});n.cards.push({...n.cards[0],id:'copy-card',sourceId:'copy'});const p=plan(n);expect(new Set(p.passages.map(x=>x.reference.sourceId))).toEqual(new Set(['source-notes','copy']));expect(new Set(p.passages.map(x=>x.id)).size).toBe(p.passages.length);
 });
 it('keeps long-source fragments substantial and exactly cited instead of making a one-word lesson',()=>{const text='source notes '.repeat(77)+'photographs.';const n=fixture(text),p=plan(n);expect(p.coverage.uncoveredTargetIds).toEqual([]);expect(p.passages.every(passage=>passage.reference.quote.length>=40&&isCurrentEvidence(passage.reference,n.sources))).toBe(true);expect(p.passages[0].reference.start).toBe(0);expect(p.passages.at(-1)!.reference.end).toBe(text.length);});
 it('retains a nonadjacent explained example within the target source unit',()=>{
  const n=fixture('# Packet model\n\nPacket: a small unit of data that travels between the two modeled devices.\n\nThis training model contains one sender and one receiver.\n\nThe description applies only to the two devices supplied in the exercise.\n\nExample: In this packet model, the receiver reads the packet after arrival. The packet can be inspected because the receiver now has the data. This example is limited to the model.\n\n# Garden notes\n\nThe garden notebook has a separate watering procedure.');const p=plan(n);expect(p.passages.some(x=>x.reference.quote.startsWith('Example:'))).toBe(true);expect(p.walkthrough.kind).toBe('source-example');expect(p.coverage.uncoveredTargetIds).toEqual([]);expect(p.passages).toHaveLength(4);expect(p.passages.every(x=>isCurrentEvidence(x.reference,n.sources))).toBe(true);expect(JSON.stringify(p)).not.toContain('separate watering');
 });
 it('reserves source context across an eight-target chapter and blocks oversized incomplete chapters',()=>{
  const n=fixture();n.sources=[];n.cards=[];
  for(let i=0;i<8;i++){const text=`Concept${i}: the source-defined meaning for training target ${i}.`;const src={...createSource(text+'\n\n'+`Example: Concept${i} is used in this specific training setting because the source establishes the matching condition.`),id:`source-${i}`};n.sources.push(src);n.cards.push({...fixture().cards[0],id:`card-${i}`,sourceId:src.id,evidence:text});}
  const p=plan(n);expect(p.passages).toHaveLength(16);expect(p.passages.filter(x=>x.role==='context')).toHaveLength(8);expect(p.coverage.coveredTargetIds).toHaveLength(8);expect(p.coverage.uncoveredTargetIds).toEqual([]);expect(p.status).toBe('grounded');
  for(let i=8;i<20;i++){const text=`Additional concept ${i} has its own independent source description.`;const src={...createSource(text),id:`source-${i}`};n.sources.push(src);n.cards.push({...fixture().cards[0],id:`card-${i}`,sourceId:src.id,evidence:text});}
  const tooLarge=plan(n);expect(tooLarge.status).toBe('blocked');expect(tooLarge.coverage.uncoveredTargetIds.length).toBeGreaterThan(0);expect(tooLarge.warnings.join(' ')).toContain('Split the deck');expect(lessonReady(tooLarge,done(tooLarge))).toBe(false);
 });
 it('keeps original picture and recording material available during teaching with portable bounded media resume',()=>{
  const n=fixture();n.sources[0].kind='image';n.sources[0].dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z5kAAAAASUVORK5CYII=';let p=plan(n);expect(p.media[0].kind).toBe('image');expect(p.media[0].url).toBe(n.sources[0].dataUrl);
  n.sources[0].kind='audio';n.sources[0].dataUrl='data:audio/wav;base64,AQID';p=plan(n);expect(p.media[0].kind).toBe('audio');const s=prepared(p);s.mediaPositions={'source-notes':12.5};expect(initialLessonState(p,JSON.parse(JSON.stringify(s))).mediaPositions).toEqual(s.mediaPositions);expect(validateLessonState({...s,mediaPositions:{'source-notes':Infinity}})).toBeUndefined();
 });
 it('includes playable parents of ready transcripts and reviewed video frames, while rejecting changed parent bytes',()=>{
  const n=fixture(),recording={...n.sources[0],id:'recording',kind:'video' as const,text:'',status:'needs-transcript' as const,dataUrl:'data:video/mp4;base64,AQID'};
  const hash=bytesDigest(new Uint8Array([1,2,3])),transcript=prepareTranscriptSource(recording,{format:'plain',text:n.sources[0].text},{mediaRevision:hash,duration:4});n.sources=[recording,transcript];n.cards[0].sourceId=transcript.id;const p=plan(n);expect(p.media.some(m=>m.sourceId==='recording')).toBe(true);expect(p.status).toBe('grounded');
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z5kAAAAASUVORK5CYII=';
  const frameHash=bytesDigest(Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0)));const frame={...n.sources[1],id:'frame',kind:'image' as const,transcript:undefined,dataUrl:png,visualEvidence:{version:1 as const,parentSourceId:'recording',parentMediaRevision:hash,capture:'video-frame' as const,requestedAt:1,at:1,timestampBasis:'decoded-frame' as const,width:1,height:1,frameSha256:frameHash,engine:'tesseract.js' as const,engineVersion:'7.0.0' as const,language:'eng' as const,confidence:90,rawText:n.sources[1].text,reviewStatus:'reviewed' as const,reviewedTextSha256:textDigest(n.sources[1].text),warnings:[]}};n.sources=[recording,frame];n.cards[0].sourceId=frame.id;const visual=plan(n);expect(visual.media.map(m=>m.sourceId)).toEqual(['recording','frame']);
  n.sources[0].dataUrl='data:video/mp4;base64,AQIE';expect(plan(n).status).toBe('blocked');expect(lessonReady(plan(n),done(visual))).toBe(false);
 });
 it('has caregiver oral participation and mature adult presentation without attributing learning styles',()=>{
  const n=fixture();n.ageGroup='3-5';const young=plan(n);expect(young.practice.spokenAllowed).toBe(true);expect(young.story.guidance).toContain('grown-up');const s=prepared(young);s.practice={...s.practice,mode:'spoken',explanation:'',connection:'',spokenConfirmed:true};expect(lessonPracticeReady(young,s)).toBe(true);
  const adult=plan();expect(adult.practice.spokenAllowed).toBe(false);expect(lessonPracticeReady(adult,{...prepared(adult),practice:{...s.practice,focusId:adult.practice.focusOptions[0].id}})).toBe(false);expect(adult.story.setting).not.toMatch(/puppet|grown-up|little|young/);
 });
});


describe('target-scoped teaching selection',()=>{
 const seed='Seed: The plant structure that contains an embryo and can grow into a new plant.';
 const root='Root: The plant organ that absorbs water and dissolved minerals.';
 const reset='This procedure resets an account.\n1. Open the settings screen.\n2. Choose reset.\n3. Confirm the reset.';
 function targeted(text:string,evidence=seed){const n=fixture(text);n.cards[0]={...n.cards[0],id:'seed',answer:'Seed',concept:'Seed',evidence};return n;}
 function references(p:LearningPlan){return[...p.passages.map(x=>x.reference),...p.walkthrough.steps.flatMap(x=>[x.reference,...(x.reason?[x.reason]:[])]),...p.practice.focusOptions.map(x=>x.reference),...(p.rehearsal?.tiles.map(x=>x.reference)??[]),...(p.rehearsal?.slots.map(x=>x.reference)??[])];}
 it('does not teach an account-reset procedure before a seed target in the next section',()=>{
  const n=targeted('# Reset procedure\n\n'+reset+'\n\n# Plant glossary\n\n'+seed+'\n'+root),p=plan(n);
  expect(p.status).toBe('grounded');expect(p.coverage.coveredTargetIds).toEqual(['seed']);expect(p.walkthrough.kind).toBe('source-reading');expect(p.practice.orderIds).toEqual([]);expect(p.rehearsal?.kind).toBe('reference-kit');expect(p.rehearsal?.tiles.map(x=>x.label)).toEqual(['Seed','Root']);
  expect(references(p).every(ref=>ref.start>=n.sources[0].text.indexOf(seed)&&isCurrentEvidence(ref,n.sources))).toBe(true);expect(JSON.stringify(p)).not.toContain('settings screen');
 });
 it('does not select an unrelated example just because its words match the target',()=>{
  const n=targeted('# Seed glossary\n\n'+seed+'\n\n'+root+'\n\n# Account simulation\n\nExample: The seed account resets after confirmation because this training model requires the seed account confirmation.');const p=plan(n);
  expect(p.walkthrough.kind).toBe('source-reading');expect(references(p).every(ref=>!ref.quote.includes('account'))).toBe(true);expect(p.passages).toHaveLength(2);
 });
 it('does not turn contextual procedures into the target rehearsal, even inside the same bounded unit',()=>{
  const n=targeted('# Plant glossary\n\n'+seed+'\n\nThis procedure is supplied as background, not the selected definition.\n1. Read the provided observation.\n2. Record the observation.');const p=plan(n);
  expect(p.passages.some(x=>x.role==='context'&&x.reference.quote.includes('procedure'))).toBe(true);expect(p.walkthrough.kind).toBe('source-reading');expect(p.rehearsal).toBeUndefined();expect(p.practice.orderIds).toEqual([]);
 });
 it('retains multiple source units when the activity explicitly cites them and excludes uncited neighbors',()=>{
  const flower='Flower: The reproductive structure described in this training source.';
  const n=targeted('# Plant glossary\n\n'+seed+'\n\n'+root+'\n\n# Account reset\n\n'+reset+'\n\n# Flower glossary\n\n'+flower+'\n\nThis source describes flower structure only within the supplied training model.');
  const activity={...ACTIVITY_EXAMPLES[0],sourceRefs:[{sourceId:n.sources[0].id,evidence:seed},{sourceId:n.sources[0].id,evidence:flower}]};
  const p=buildLearningBriefing({notebook:n,scaffold,activity});expect(p.coverage.coveredTargetIds).toEqual([activity.id]);expect(p.passages).toHaveLength(4);expect(p.passages.some(x=>x.reference.quote===root)).toBe(true);expect(p.passages.some(x=>x.reference.quote.includes('flower structure'))).toBe(true);expect(references(p).every(ref=>isCurrentEvidence(ref,n.sources)&&!ref.quote.includes('reset'))).toBe(true);
 });
 it.each([
  ['section','# Plant note\n\nSeed grows.\n\n# Reset procedure\n\n'+reset],
  ['page','[Page 1]\nSeed grows.\n\n[Page 2]\n'+reset],
  ['subtitle cue','WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSeed grows.\n\n00:00:02.000 --> 00:00:04.000\n'+reset],
 ])('does not merge a short target across a %s boundary',(_kind,text)=>{
  const n=targeted(text,'Seed grows.'),p=plan(n);expect(p.status).toBe('limited');expect(p.passages.map(x=>x.reference.quote)).toEqual(['Seed grows.']);expect(references(p).every(ref=>isCurrentEvidence(ref,n.sources)&&ref.quote==='Seed grows.')).toBe(true);expect(p.rehearsal).toBeUndefined();
 });
});

describe('bounded durable lesson progression and later independent retrieval',()=>{
 it('serializes partial notes and exact progress without storing source facts or provider configuration',()=>{
  const p=plan(),s=prepared(p);s.practice.compared=false;const restored=initialLessonState(p,JSON.parse(JSON.stringify(s)));expect(restored).toEqual(s);expect(JSON.stringify(restored).length).toBeLessThan(4000);expect(lessonReady(p,restored)).toBe(false);
 });
 it('requires the walkthrough and active source comparison before any ready state',()=>{
  const p=plan(),s=prepared(p);expect(lessonReady(p,done(p))).toBe(true);
  for(const bad of [{...s,missionAccepted:false},{...s,viewedPassageIds:[]},{...s,walkthroughStep:0},{...s,practice:{...s.practice,focusId:'unknown'}},{...s,practice:{...s.practice,explanation:'yes'}},{...s,practice:{...s.practice,connection:''}},{...s,practice:{...s.practice,compared:false}}]){expect(lessonReady(p,{...bad,stage:'ready',completedAt:'2026-10-04T00:00:00.000Z'})).toBe(false);expect(completeLesson(p,bad).completedAt).toBeUndefined();}
 });
 it('separates immediate supported practice from later independent retrieval and keeps drafts uncredited',()=>{
  const p=plan(),at=Date.parse('2026-10-04T00:00:00.000Z'),s=done(p,at);expect(lessonQuestSupport(p,s,at).assisted).toBe(true);expect(lessonQuestSupport(p,s,at+LESSON_SUPPORT_WINDOW_MS-1).assisted).toBe(true);expect(lessonQuestSupport(p,s,at+LESSON_SUPPORT_WINDOW_MS).assisted).toBe(false);expect(lessonQuestSupport(p,s,at-1).assisted).toBe(true);
  const n=fixture();n.cards[0].reviewStatus='needs-review';const draft=plan(n);expect(lessonQuestSupport(draft,done(draft,at),at+3*LESSON_SUPPORT_WINDOW_MS).assisted).toBe(true);
 });
 it('uses stable keys across cosmetic edits, canonical object order and shuffled selected-card IDs',()=>{
  const n=fixture(),p=plan(n);const cosmetic={...n,title:'Renamed notebook',theme:'ocean' as Notebook['theme'],revision:100};cosmetic.sources=n.sources.map(s=>({...s,title:'Renamed source'}));expect(plan(cosmetic).id).toBe(p.id);
  const reordered={...n,cards:n.cards.map(c=>Object.fromEntries(Object.entries(c).reverse()) as unknown as LearningCard)};expect(plan(reordered).id).toBe(p.id);
 });
 it('invalidates source edits, answer edits, review changes, audience changes and changed recording bytes',()=>{
  const n=fixture(),p=plan(n),saved=done(p);
  const changed=[{...n,sources:n.sources.map(s=>({...s,text:s.text+' Additional source context.'}))},{...n,cards:n.cards.map(c=>({...c,answer:'Different'}))},{...n,cards:n.cards.map(c=>({...c,reviewStatus:'needs-review' as const}))},{...n,ageGroup:'6-8' as Notebook['ageGroup']}];
  for(const value of changed){const next=plan(value);expect(next.id).not.toBe(p.id);expect(initialLessonState(next,saved).stage).toBe('mission');expect(lessonReady(next,saved)).toBe(false);}
  const inline={...n,sources:n.sources.map(s=>({...s,dataUrl:'data:audio/wav;base64,AQID'}))},a=plan(inline);inline.sources[0].dataUrl='data:audio/wav;base64,AQIE';expect(plan(inline).id).not.toBe(a.id);
 });
 it('migrates absent, old, malformed and oversized states conservatively',()=>{
  const p=plan(),s=done(p);for(const bad of [undefined,{completed:true},{...s,version:0},{...s,planKey:'other'},{...s,apiKey:'private'},{...s,completedAt:'not a date'},{...s,viewedPassageIds:Array(100).fill('x')},{...s,practice:{...s.practice,explanation:'x'.repeat(1201)}}])expect(initialLessonState(p,bad)).toEqual(initialLessonState(p));expect(validateLessonState({...s,prototype:{bad:true}})).toBeUndefined();expect(validateLessonState(JSON.parse('{"__proto__":{},"version":1}'))).toBeUndefined();
 });
 it('property: arbitrary state mutations never make incomplete teaching independently eligible',()=>{
  const p=plan(),at=Date.parse('2026-10-04T00:00:00.000Z');
  fc.assert(fc.property(fc.array(fc.constantFrom('mission','context','walkthrough','focus','explain','connect','compare','complete','revisit'),{maxLength:50}),actions=>{
   let s=initialLessonState(p);for(const a of actions){switch(a){case'mission':s={...s,missionAccepted:true,stage:'context'};break;case'context':s={...s,viewedPassageIds:p.passages.map(x=>x.id),stage:'walkthrough'};break;case'walkthrough':s={...s,walkthroughStep:p.walkthrough.steps.length,stage:'practice'};break;case'focus':s={...s,practice:{...s.practice,focusId:p.practice.focusOptions[0].id}};break;case'explain':s={...s,practice:{...s.practice,explanation:'I can explain the source relationship.'}};break;case'connect':s={...s,practice:{...s.practice,connection:'A question for later.'}};break;case'compare':s={...s,practice:{...s.practice,compared:true}};break;case'complete':s=completeLesson(p,s,at);break;case'revisit':s=initialLessonState(p);break;}s=initialLessonState(p,JSON.parse(JSON.stringify(s)));if(!lessonQuestSupport(p,s,at+2*LESSON_SUPPORT_WINDOW_MS).assisted){expect(s.missionAccepted).toBe(true);expect(s.viewedPassageIds).toHaveLength(p.passages.length);expect(s.walkthroughStep).toBe(p.walkthrough.steps.length);expect(lessonPracticeReady(p,s)).toBe(true);expect(s.completedAt).toBeDefined();}expect(lessonQuestSupport(p,s,at).assisted).toBe(true);}
  }),{numRuns:100});
 });
});
