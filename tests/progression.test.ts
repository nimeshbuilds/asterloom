import {describe,expect,it} from 'vitest';
import {awardIndependentActivityXp,awardPracticeXp,journeyXp,migrateIndependentActivityAwards,practiceXp,MAX_INDEPENDENT_ACTIVITY_AWARDS,MAX_PRACTICE_AWARDS} from '../src/lib/progression';
import {parsePackage,serializePackage,parseProgress,serializeProgress,validateProgress} from '../src/lib/package';
import {restoreNotebookProgress,serializeNotebookProgress} from '../src/lib/progressBackup';
import {reconcileNotebookProgress,reconcileReviewEligibility} from '../src/lib/progressRevision';
import {reviewAfterEvaluation} from '../src/lib/structuredReview';
import {bytesDigest} from '../src/lib/evidence';
import {normalizeMediaTranscript} from '../src/lib/mediaTranscript';
import {sourceLearningUnits} from '../src/lib/sourceUnits';
import {emptyProgress} from '../src/lib/storage';
import {createNotebook,createSource} from '../src/lib/utils';
import {TREE_PICTURE_BUILD,PICTURE_BUILD_EXAMPLE_SOURCE} from '../src/lib/pictureBuildExamples';
import {CLEAN_DATA_CONSTRUCTION,PLANT_EXPLANATION,COMPOSITION_EXAMPLE_SOURCE} from '../src/lib/compositionExamples';
import {puppetStoryFixture,childPlaySources} from '../src/data/childPlayFixtures';
import {initialChildPlayResponse,advanceChildPlay} from '../src/lib/childPlayEngine';
import type {LearningCard,Notebook,Progress} from '../src/types';
import type {SequenceActivity,DiagramActivity} from '../src/lib/structuredEngine';

const now=new Date('2026-10-05T12:00:00.000Z');
function fixture(){
 const source=createSource('A packet is a unit of information. First collect the packet, then send it.','Network field notes');
 const card:LearningCard={id:'packet-card',prompt:'Which unit carries information?',answer:'packet',options:['packet','router'],correctIndex:0,sourceId:source.id,evidence:'A packet is a unit of information.',explanation:'A source explanation.',concept:'Information',tags:[],questionType:'manual',reviewStatus:'reviewed'};
 const activity:SequenceActivity={version:1,id:'packet-sequence',kind:'sequence',title:'Send a packet',instruction:'Arrange the two steps.',sourceRefs:[{sourceId:source.id,evidence:'First collect the packet, then send it.'}],reviewStatus:'reviewed',explanation:'The source gives the order.',hint:'Read the two verbs.',items:[{id:'collect',label:'Collect the packet'},{id:'send',label:'Send the packet'}],constraints:[{before:'collect',after:'send'}]};
 const notebook=createNotebook({id:'practice-world',sources:[source],cards:[card],activities:[activity]});
 const progress:Progress={...emptyProgress(notebook.id),xp:70,mastery:25,streak:2,bestStreak:3,sessions:1};
 return{notebook,progress,card,activity};
}
const cardObjective=(notebook:Notebook)=>({kind:'card' as const,card:notebook.cards[0]});
const activityObjective=(notebook:Notebook)=>({kind:'activity' as const,activity:notebook.activities![0]});
function strictStoryFixture(reviewStatus:'reviewed'|'needs-review'='reviewed'){
 const activity={...puppetStoryFixture,reviewStatus},notebook=createNotebook({id:'strict-story-history',sources:[childPlaySources[0]],cards:[],activities:[activity]});
 let response=initialChildPlayResponse(activity);
 for(const action of ['ada-asks','bo-shares']){const next=advanceChildPlay(activity,response,action);if(!next.success)throw Error(next.error);response=next.response;}
 return{activity,notebook,response,progress:emptyProgress(notebook.id)};
}

describe('content-bound game practice points',()=>{
 it('protects already successful strict legacy practice without seeding wrong or malformed answers',async()=>{
  const{notebook,activity,response,progress}=strictStoryFixture('needs-review');
  const saved={response:{...response,_draft:{checked:true,hintUsed:true}},completed:false,score:0,maxScore:0,attempts:0,updatedAt:now.toISOString()};
  progress.structured={[activity.id]:saved};const snapshot=structuredClone(progress);
  const migrated=await awardPracticeXp(progress,notebook,{kind:'activity',activity},true,now);
  expect(progress).toEqual(snapshot);expect(migrated.practice!.xp).toBe(0);expect(Object.values(migrated.practice!.awards)).toEqual([{kind:'activity',objectiveId:activity.id,xp:0,at:now.toISOString()}]);
  expect(await awardPracticeXp(parseProgress(serializeProgress(migrated)),notebook,{kind:'activity',activity},true,now)).toEqual(migrated);
  for(const storedResponse of [{...initialChildPlayResponse(activity),_draft:{checked:true}},{...response,_draft:{checked:true},unknownAnswer:true}]){
   const unearned={...progress,structured:{[activity.id]:{...saved,response:storedResponse}}};expect((await awardPracticeXp(unearned,notebook,{kind:'activity',activity},true,now)).practice!.xp).toBe(20);
  }
 });
 it('adds card10 and activity20 in pure snapshots without changing assessed credit',async()=>{
  const{notebook,progress}=fixture(),before=structuredClone(progress);
  const card=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);
  expect(progress).toEqual(before);expect(practiceXp(progress)).toBe(0);expect(journeyXp(progress)).toBe(70);
  expect(practiceXp(card)).toBe(10);expect(journeyXp(card)).toBe(80);
  expect(card).toMatchObject({xp:70,mastery:25,streak:2,bestStreak:3,sessions:1,updatedAt:now.toISOString(),revision:progress.revision+1});
  expect(card.attempts).toBe(progress.attempts);expect(card.cards).toBe(progress.cards);expect(card.completedCardIds).toBe(progress.completedCardIds);
  const activity=await awardPracticeXp(card,notebook,activityObjective(notebook),true,now);
  expect(practiceXp(activity)).toBe(30);expect(journeyXp(activity)).toBe(100);expect(practiceXp(card)).toBe(10);
  expect(Object.values(activity.practice!.awards)).toEqual(expect.arrayContaining([{kind:'card',objectiveId:notebook.cards[0].id,xp:10,at:now.toISOString()},{kind:'activity',objectiveId:notebook.activities![0].id,xp:20,at:now.toISOString()}]));
  expect(Object.keys(activity.practice!.awards)).toHaveLength(2);for(const key of Object.keys(activity.practice!.awards))expect(key).toMatch(/^[a-f0-9]{64}$/);
 });
 it('awards once across repeats, reloads and renaming otherwise identical objectives',async()=>{
  const{notebook,progress}=fixture();const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);
  expect(await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).toBe(saved);
  const restored=parseProgress(serializeProgress(saved));expect(restored.practice).toEqual(saved.practice);
  notebook.cards[0]={...notebook.cards[0],id:'renamed-card'};
  expect(await awardPracticeXp(restored,notebook,cardObjective(notebook),true,now)).toBe(restored);
  const activitySaved=await awardPracticeXp(restored,notebook,activityObjective(notebook),true,now);
  notebook.activities![0]={...notebook.activities![0],id:'renamed-activity'};
  expect(await awardPracticeXp(activitySaved,notebook,activityObjective(notebook),true,now)).toBe(activitySaved);
 });
 it('leaves legacy absence intact when a result is ineligible',async()=>{
  const{notebook,progress}=fixture();expect(await awardPracticeXp(progress,notebook,cardObjective(notebook),false,now,true)).toBe(progress);
  expect(Object.hasOwn(progress,'practice')).toBe(false);expect(Object.hasOwn(parseProgress(serializeProgress(progress)),'practice')).toBe(false);
 });
 it('writes an old-success tombstone only for legacy absence and renews genuinely changed content',async()=>{
  const{notebook,progress}=fixture();const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now,true);
  expect(saved.practice!.xp).toBe(0);expect(Object.values(saved.practice!.awards)).toEqual([{kind:'card',objectiveId:notebook.cards[0].id,xp:0,at:now.toISOString()}]);
  expect(await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).toBe(saved);
  notebook.cards[0].prompt='Which source term is a unit of information?';
  const changed=await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now,true);expect(changed.practice!.xp).toBe(10);expect(Object.keys(changed.practice!.awards)).toHaveLength(2);
  const oldActivity=await awardPracticeXp(progress,notebook,activityObjective(notebook),true,now,true);expect(oldActivity.practice!.xp).toBe(0);expect(Object.values(oldActivity.practice!.awards)[0].xp).toBe(0);
 });
 it('migrates all old successes together so a second old objective cannot earn a reload bonus',async()=>{
  const{notebook,progress,card,activity}=fixture();const second={...card,id:'unit-card',prompt:'What is a packet?',answer:'unit',options:['unit','router']};notebook.cards.push(second);
  progress.attempts=[card,second].map((item,index)=>({id:`old-attempt-${index}`,cardId:item.id,correct:true,confidence:'confident' as const,xp:20,at:now.toISOString()}));
  progress.structured={[activity.id]:{response:{order:['collect','send'],_draft:{checked:true}},completed:true,score:2,maxScore:2,attempts:1,updatedAt:now.toISOString()}};
  const migrated=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);expect(migrated.practice!.xp).toBe(0);expect(Object.values(migrated.practice!.awards).map(award=>award.objectiveId).sort()).toEqual([card.id,second.id,activity.id].sort());
  expect(await awardPracticeXp(migrated,notebook,{kind:'card',card:second},true,now)).toBe(migrated);expect(await awardPracticeXp(migrated,notebook,activityObjective(notebook),true,now)).toBe(migrated);
 });
 it('seeds old successes before the first new award while leaving wrong and untried content awardable',async()=>{
  const{notebook,progress,card}=fixture();const wrong={...card,id:'wrong-card',prompt:'Which source unit was tried incorrectly?'},fresh={...card,id:'new-card',prompt:'Which source unit is new?'};notebook.cards.push(wrong,fresh);
  progress.attempts=[{id:'old-success',cardId:card.id,correct:true,confidence:'confident',xp:20,at:now.toISOString()},{id:'old-wrong',cardId:wrong.id,correct:false,confidence:'unsure',xp:0,at:now.toISOString()}];
  const first=await awardPracticeXp(progress,notebook,{kind:'card',card:fresh},true,now);expect(first.practice!.xp).toBe(10);expect(Object.values(first.practice!.awards).map(award=>award.objectiveId).sort()).toEqual([card.id,fresh.id].sort());
  expect(await awardPracticeXp(first,notebook,cardObjective(notebook),true,now)).toBe(first);const corrected=await awardPracticeXp(first,notebook,{kind:'card',card:wrong},true,now);expect(corrected.practice!.xp).toBe(20);
  card.prompt='A genuinely new question after migration';expect((await awardPracticeXp(corrected,notebook,cardObjective(notebook),true,now,true)).practice!.xp).toBe(30);
 });
 it('recognizes saved reflections and checked authoring-model practice during legacy migration',async()=>{
  const{notebook,progress,card,activity}=fixture();progress.journal=[{id:'old-reflection',cardId:card.id,text:'A saved reflection.',at:now.toISOString()}];activity.reviewStatus='needs-review';
  progress.structured={[activity.id]:{response:{order:['collect','send'],_draft:{checked:true}},completed:false,score:0,maxScore:0,attempts:1,updatedAt:now.toISOString()}};
  const saved=await awardPracticeXp(progress,notebook,activityObjective(notebook),true,now);expect(saved.practice!.xp).toBe(0);expect(Object.keys(saved.practice!.awards)).toHaveLength(2);
 });
 it('ignores reviews, cosmetic metadata, unrelated material and source citation labels',async()=>{
  const{notebook,progress}=fixture();let saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);saved=await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now);
  notebook.title='A renamed game';notebook.description='A different description';notebook.theme='forest';notebook.scaffoldIds=['source-check'];notebook.revision++;
  notebook.cards[0]={...notebook.cards[0],explanation:'A new explanation.',concept:'A renamed concept',tags:['new-tag'],reviewStatus:'needs-review'};
  notebook.activities![0]={...notebook.activities![0],title:'A new title',hint:'A new hint',explanation:'New feedback',scaffoldIds:['new-recipe'],extractedFrom:'different-import',reviewStatus:'needs-review',sourceRefs:notebook.activities![0].sourceRefs.map(reference=>({...reference,locator:'A renamed source locator'}))};
  notebook.sources[0].title='Renamed source';notebook.sources[0].addedAt='2026-10-04T00:00:00.000Z';notebook.sources[0].text+=' An unrelated footnote.';notebook.sources.push(createSource('Unrelated content.','Other material'));
  expect(await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).toBe(saved);expect(await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now)).toBe(saved);
 });
 it.each(['prompt','answer','evidence','questionType'] as const)('renews when card %s changes',async field=>{
  const{notebook,progress}=fixture();const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);
  if(field==='prompt')notebook.cards[0].prompt='What carries information?';
  if(field==='answer'){notebook.cards[0].answer='unit';notebook.cards[0].options=['unit','router'];}
  if(field==='evidence')notebook.cards[0].evidence='packet is a unit of information.';
  if(field==='questionType')notebook.cards[0].questionType='cloze';
  const changed=await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now);expect(changed.practice!.xp).toBe(20);expect(Object.keys(changed.practice!.awards)).toHaveLength(2);
 });
 it('renews changed activity rules while canonicalizing object property order',async()=>{
  const{notebook,progress,activity}=fixture();const saved=await awardPracticeXp(progress,notebook,activityObjective(notebook),true,now);
  notebook.activities=[{...activity,constraints:[{after:'send',before:'collect'}]}];expect(await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now)).toBe(saved);
  notebook.activities[0]={...activity,constraints:[{before:'send',after:'collect'}]};const changed=await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now);expect(changed.practice!.xp).toBe(40);
 });
 it('keeps a diagram award through presentation coordinates but renews answer mappings',async()=>{
  const{notebook,progress,activity}=fixture();const{items:_items,constraints:_constraints,...base}=activity;const diagram:DiagramActivity={...base,kind:'diagram',targets:[{id:'one',label:'First',x:10,y:10},{id:'two',label:'Second',x:60,y:10}],labels:[{id:'collect',label:'Collect'},{id:'send',label:'Send'}],mapping:[{labelId:'collect',targetId:'one'},{labelId:'send',targetId:'two'}]};notebook.activities=[diagram];
  const saved=await awardPracticeXp(progress,notebook,activityObjective(notebook),true,now);diagram.targets[0].x=30;diagram.targets[0].y=20;
  expect(await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now)).toBe(saved);
  diagram.mapping=[{labelId:'collect',targetId:'two'},{labelId:'send',targetId:'one'}];expect((await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now)).practice!.xp).toBe(40);
 });
 it('ignores construction witness layout and nested explanation feedback',async()=>{
  const{notebook,progress}=fixture();const construction=structuredClone(CLEAN_DATA_CONSTRUCTION),explanation=structuredClone(PLANT_EXPLANATION);notebook.sources.push(structuredClone(COMPOSITION_EXAMPLE_SOURCE));notebook.activities=[construction,explanation];
  let saved=await awardPracticeXp(progress,notebook,{kind:'activity',activity:construction},true,now);saved=await awardPracticeXp(saved,notebook,{kind:'activity',activity:explanation},true,now);
  construction.referenceBuilds[0].instances[0].x+=5;construction.referenceBuilds[0].instances[0].y+=5;explanation.arguments[0].alternatives[0].explanation='Updated source feedback without changed answer rules.';
  expect(await awardPracticeXp(saved,notebook,{kind:'activity',activity:construction},true,now)).toBe(saved);expect(await awardPracticeXp(saved,notebook,{kind:'activity',activity:explanation},true,now)).toBe(saved);
 });
 it('treats inline and native media bytes alike and renews replacements',async()=>{
  const{notebook,progress}=fixture();const digest=bytesDigest(new Uint8Array([0,1,2,3]));notebook.sources[0]={...notebook.sources[0],kind:'audio',mime:'audio/mpeg',asset:{id:digest,sha256:digest,name:'lesson.mp3',mime:'audio/mpeg',size:4}};
  const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);notebook.sources[0]={...notebook.sources[0],asset:undefined,dataUrl:'data:audio/mpeg;base64,AAECAw==',title:'A different recording label'};
  expect(await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).toBe(saved);
  notebook.sources[0].dataUrl='data:audio/mpeg;base64,AAECAA==';expect((await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).practice!.xp).toBe(20);
 });
 it('binds supplied pictures and narration outside the activity source quotes',async()=>{
  for(const kind of ['image','audio'] as const){
   const{notebook,progress}=fixture();const activity=structuredClone(TREE_PICTURE_BUILD);if(kind==='image')activity.parts[0].imageSourceId='supplied-media';else activity.tell.narrationSourceIds=['supplied-media'];notebook.activities=[activity];
   notebook.sources.push(structuredClone(PICTURE_BUILD_EXAMPLE_SOURCE),{id:'supplied-media',title:'Supplied media',kind,text:'',status:'ready',addedAt:now.toISOString(),dataUrl:kind==='image'?'data:image/png;base64,AAAA':'data:audio/mpeg;base64,AAAA'});
   const saved=await awardPracticeXp(progress,notebook,activityObjective(notebook),true,now);notebook.sources.at(-1)!.dataUrl=kind==='image'?'data:image/png;base64,AAAB':'data:audio/mpeg;base64,AAAB';expect((await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now)).practice!.xp).toBe(40);
  }
 });
 it('binds a retained transcript to replaced parent media',async()=>{
  const{notebook,progress}=fixture();const prepared=normalizeMediaTranscript({format:'plain',text:notebook.sources[0].text},{mediaSourceId:'recording',mediaRevision:bytesDigest(new Uint8Array([0,0,0]))});notebook.sources[0].text=prepared.text;notebook.sources[0].transcript=prepared.transcript;notebook.sources.push({id:'recording',title:'Recording',kind:'audio',text:'',status:'ready',addedAt:now.toISOString(),dataUrl:'data:audio/mpeg;base64,AAAA'});
  const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);notebook.sources[1].dataUrl='data:audio/mpeg;base64,AAAB';expect((await awardPracticeXp(saved,notebook,cardObjective(notebook),true,now)).practice!.xp).toBe(20);
 });
 it('rejects identity and media hash failures without mutating the input',async()=>{
  const{notebook,progress}=fixture();await expect(awardPracticeXp({...progress,notebookId:'other-world'},notebook,cardObjective(notebook),true,now)).rejects.toThrow(/different notebook/);
  notebook.sources[0].asset={id:'invalid',sha256:'invalid',name:'lesson.mp3',mime:'audio/mpeg',size:4};await expect(awardPracticeXp(progress,notebook,cardObjective(notebook),true,now)).rejects.toThrow(/checksum/);expect(progress.practice).toBeUndefined();
  notebook.sources[0].asset=undefined;await expect(awardPracticeXp(progress,notebook,cardObjective(notebook),true,new Date('invalid'))).rejects.toThrow();expect(progress.practice).toBeUndefined();
 });
 it('never evicts awards or awards new content after the ledger cap',async()=>{
  const{notebook,progress}=fixture();progress.practice={xp:0,awards:Object.fromEntries(Array.from({length:MAX_PRACTICE_AWARDS},(_,index)=>[index.toString(16).padStart(64,'0'),{kind:'card' as const,objectiveId:`old-card-${index}`,xp:0,at:now.toISOString()}]))};
  expect(validateProgress(progress).practice).toEqual(progress.practice);const saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);expect(saved).toBe(progress);expect(Object.keys(saved.practice!.awards)).toHaveLength(MAX_PRACTICE_AWARDS);
 });
 it('preserves historical ledgers through notebook packaging and changed-content backup restoration',async()=>{
  const{notebook,progress}=fixture();let saved=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);saved=await awardPracticeXp(saved,notebook,activityObjective(notebook),true,now);
  const exported=parsePackage(serializePackage(notebook));const backup=await serializeNotebookProgress(exported,saved);expect((await restoreNotebookProgress(exported,backup)).progress.practice).toEqual(saved.practice);
  const changed=structuredClone(exported);changed.cards[0].prompt='A genuinely changed question';changed.activities![0].instruction='A genuinely changed task';const restored=await restoreNotebookProgress(changed,backup);
  expect(restored.progress.practice).toEqual(saved.practice);expect(reconcileNotebookProgress(exported,changed,saved).practice).toEqual(saved.practice);
  const renewed=await awardPracticeXp(restored.progress,changed,cardObjective(changed),true,now);expect(renewed.practice!.xp).toBe(40);expect(Object.keys(renewed.practice!.awards)).toHaveLength(3);
 });
});

describe('source-study game points',()=>{
 it('awards5 once for eligible completion and ignores partial notes',async()=>{
  const{notebook,progress}=fixture(),unit=sourceLearningUnits(notebook.sources[0])[0];
  expect(await awardPracticeXp(progress,notebook,{kind:'study',unit},false,now)).toBe(progress);expect(progress.practice).toBeUndefined();
  const saved=await awardPracticeXp(progress,notebook,{kind:'study',unit},true,now);expect(practiceXp(saved)).toBe(5);expect(journeyXp(saved)).toBe(75);expect(Object.values(saved.practice!.awards)).toEqual([{kind:'study',objectiveId:unit.id,xp:5,at:now.toISOString()}]);
  expect(await awardPracticeXp(parseProgress(serializeProgress(saved)),notebook,{kind:'study',unit},true,now)).toEqual(saved);
 });
 it('ignores note edits, unit naming, headings and source offset shifts but renews a changed quote',async()=>{
  const{notebook,progress}=fixture();let unit=sourceLearningUnits(notebook.sources[0])[0];const saved=await awardPracticeXp(progress,notebook,{kind:'study',unit},true,now);
  const edited={...saved,studies:{[unit.id]:{unitId:unit.id,sourceId:unit.sourceId,quote:unit.quote,note:'Updated field note.',question:'Updated question.',completed:true,updatedAt:now.toISOString()}}};
  notebook.sources[0].text='\n\n'+notebook.sources[0].text;notebook.sources[0].title='A different source title';unit={...sourceLearningUnits(notebook.sources[0])[0],title:'A different unit title',headingPath:['A cosmetic heading'],sectionKey:'another-section'};
  expect(await awardPracticeXp(edited,notebook,{kind:'study',unit},true,now)).toBe(edited);
  notebook.sources[0].text+=' Another source detail.';unit=sourceLearningUnits(notebook.sources[0])[0];expect((await awardPracticeXp(edited,notebook,{kind:'study',unit},true,now)).practice!.xp).toBe(10);
 });
 it('renews study points when its cited recording changes',async()=>{
  const{notebook,progress}=fixture();notebook.sources[0]={...notebook.sources[0],kind:'audio',dataUrl:'data:audio/mpeg;base64,AAAA'};const unit=sourceLearningUnits(notebook.sources[0])[0];const saved=await awardPracticeXp(progress,notebook,{kind:'study',unit},true,now);
  notebook.sources[0].dataUrl='data:audio/mpeg;base64,AAAB';expect((await awardPracticeXp(saved,notebook,{kind:'study',unit},true,now)).practice!.xp).toBe(10);
 });
 it('seeds every completed legacy field note before a new study award, without seeding partial notes',async()=>{
  const{notebook,progress}=fixture();notebook.sources.push(createSource('A router forwards packets.','Router notes'),createSource('An address identifies a destination.','Address notes'));
  const units=notebook.sources.map(source=>sourceLearningUnits(source)[0]);progress.studies=Object.fromEntries(units.map((unit,index)=>[unit.id,{unitId:unit.id,sourceId:unit.sourceId,quote:unit.quote,note:'Saved notes',question:'Saved question',completed:index<2,updatedAt:now.toISOString()}]));
  const first=await awardPracticeXp(progress,notebook,{kind:'study',unit:units[2]},true,now);expect(first.practice!.xp).toBe(5);expect(Object.keys(first.practice!.awards)).toHaveLength(3);expect(Object.values(first.practice!.awards).filter(award=>award.xp===0)).toHaveLength(2);
  expect(await awardPracticeXp(first,notebook,{kind:'study',unit:units[1]},true,now)).toBe(first);
  const cardFirst=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);expect(cardFirst.practice!.xp).toBe(10);expect(Object.values(cardFirst.practice!.awards).filter(award=>award.kind==='study')).toHaveLength(2);
 });
 it('migrates a completed pinned subset after unit offsets change and never seeds empty or partial notes',async()=>{
  const{notebook,progress}=fixture();const old=sourceLearningUnits(notebook.sources[0])[0];notebook.sources.push(createSource('A router forwards packets.','Other source'));const partial=sourceLearningUnits(notebook.sources[1])[0];
  progress.studies={[old.id]:{unitId:old.id,sourceId:old.sourceId,quote:'A packet is a unit of information.',note:'A completed pinned note.',question:'What carries information?',completed:true,updatedAt:now.toISOString()},[partial.id]:{unitId:partial.id,sourceId:partial.sourceId,quote:partial.quote,note:'An unfinished note.',question:'',completed:false,updatedAt:now.toISOString()},empty:{unitId:'empty',sourceId:partial.sourceId,quote:'',note:'',question:'',completed:true,updatedAt:now.toISOString()}};
  notebook.sources[0].text='\n\n'+notebook.sources[0].text;const shifted=sourceLearningUnits(notebook.sources[0])[0];expect(shifted.id).not.toBe(old.id);
  const first=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now);const studyAwards=Object.values(first.practice!.awards).filter(award=>award.kind==='study');expect(studyAwards).toEqual([{kind:'study',objectiveId:shifted.id,xp:0,at:now.toISOString()}]);
  expect(await awardPracticeXp(first,notebook,{kind:'study',unit:shifted},true,now)).toBe(first);expect((await awardPracticeXp(first,notebook,{kind:'study',unit:partial},true,now)).practice!.xp).toBe(15);
 });
 it('caps legacy unit seeding and supplemental tombstones without evicting any content key',async()=>{
  const{notebook,progress}=fixture(),quote='Shared evidence supports this complete source lesson.';
  const source=createSource(Array.from({length:MAX_PRACTICE_AWARDS+10},(_,index)=>`# Source lesson ${index}\n\n${quote} Lesson number ${index} has a distinct detail.`).join('\n\n'),'Many current units');notebook.sources.push(source);
  progress.studies={old:{unitId:'old',sourceId:source.id,quote,note:'A completed pinned note.',question:'',completed:true,updatedAt:now.toISOString()}};
  const units=sourceLearningUnits(source);expect(units.length).toBeGreaterThan(MAX_PRACTICE_AWARDS);
  const migrated=await awardPracticeXp(progress,notebook,cardObjective(notebook),true,now,true);expect(migrated.practice!.xp).toBe(0);expect(Object.keys(migrated.practice!.awards)).toHaveLength(MAX_PRACTICE_AWARDS);expect(Object.values(migrated.practice!.awards).every(award=>award.kind==='study'&&award.xp===0)).toBe(true);
  expect(validateProgress(migrated).practice).toEqual(migrated.practice);expect(await awardPracticeXp(migrated,notebook,cardObjective(notebook),true,now)).toBe(migrated);
 });
});

function savedActivity(activity:SequenceActivity,hintUsed=false):NonNullable<Progress['structured']>[string]{
 return{response:{order:['collect','send'],_draft:{checked:true,hintUsed}},completed:true,score:2,maxScore:2,attempts:1,updatedAt:now.toISOString(),review:reviewAfterEvaluation(activity.id,undefined,{valid:true,correct:true,hintUsed,score:2,maxScore:2,outcome:'correct',feedback:'Ordered',details:[]},now.toISOString())};
}
describe('independent activity milestone entitlements',()=>{
 it('protects reliable strict legacy independent answers while preserving explicitly supported entitlements',async()=>{
  const{notebook,activity,response,progress}=strictStoryFixture();
  const review=reviewAfterEvaluation(activity.id,undefined,{valid:true,correct:true,hintUsed:true,score:3,maxScore:3,outcome:'correct',feedback:'Goal reached',details:[]},now.toISOString());
  const saved={response:{...response,_draft:{checked:true,hintUsed:false}},completed:true,score:3,maxScore:3,attempts:1,updatedAt:now.toISOString(),review};
  progress.xp=50;progress.structured={[activity.id]:saved};const snapshot=structuredClone(progress);
  const migrated=await awardIndependentActivityXp(progress,notebook,activity,true,now);expect(migrated.xp).toBe(50);expect(Object.values(migrated.independentActivityAwards!)).toEqual([{objectiveId:activity.id,at:now.toISOString()}]);expect(progress).toEqual(snapshot);
  expect(await awardIndependentActivityXp(parseProgress(serializeProgress(migrated)),notebook,activity,true,now)).toEqual(migrated);
  const supported={...progress,structured:{[activity.id]:{...saved,response:{...response,_draft:{checked:true,hintUsed:true}}}}};
  expect((await awardIndependentActivityXp(supported,notebook,activity,true,now)).xp).toBe(100);
  const malformed={...progress,structured:{[activity.id]:{...saved,response:{...response,_draft:{checked:true,hintUsed:false},unknownAnswer:true}}}};
  expect((await awardIndependentActivityXp(malformed,notebook,activity,true,now)).xp).toBe(100);
 });
 it('awards supported practice first and leaves the independent 50 available exactly once',async()=>{
  const{notebook,progress,activity}=fixture();const original=structuredClone(progress);
  expect(await awardIndependentActivityXp(progress,notebook,activity,false,now)).toBe(progress);
  const supported=await awardPracticeXp(progress,notebook,{kind:'activity',activity},true,now);
  supported.structured={[activity.id]:savedActivity(activity,true)};expect(supported.structured[activity.id].review!.independentSuccesses).toBe(0);
  const independent=await awardIndependentActivityXp(supported,notebook,activity,true,now);
  expect(progress).toEqual(original);expect(independent.xp).toBe(120);expect(practiceXp(independent)).toBe(20);expect(journeyXp(independent)).toBe(140);
  expect(independent.structured).toBe(supported.structured);expect(independent.attempts).toBe(progress.attempts);expect(independent.mastery).toBe(progress.mastery);
  expect(Object.values(independent.independentActivityAwards!)).toEqual([{objectiveId:activity.id,at:now.toISOString()}]);
  expect(await awardIndependentActivityXp(independent,notebook,activity,true,now)).toBe(independent);
  const reload=parseProgress(serializeProgress(independent));expect(await awardIndependentActivityXp(reload,notebook,activity,true,now)).toBe(reload);
 });
 it('seeds all reliable old milestones before a new award but excludes supported reviews',async()=>{
  const{notebook,progress,activity}=fixture();const completed={...activity,id:'old-completed',instruction:'Arrange these prior steps.'},supported={...activity,id:'old-supported',instruction:'Arrange these supported steps.'},fresh={...activity,id:'fresh-task',instruction:'Arrange these fresh steps.'};notebook.activities=[activity,completed,supported,fresh];
  progress.structured={[activity.id]:{...savedActivity(activity),completed:false},[completed.id]:{...savedActivity(completed),review:undefined},[supported.id]:savedActivity(supported,true)};
  const migrated=migrateIndependentActivityAwards(progress,notebook,now);expect(migrated.xp).toBe(70);expect(Object.values(migrated.independentActivityAwards!).map(award=>award.objectiveId).sort()).toEqual([activity.id,completed.id].sort());
  const first=await awardIndependentActivityXp(progress,notebook,fresh,true,now);expect(first.xp).toBe(120);expect(Object.keys(first.independentActivityAwards!)).toHaveLength(3);
  expect(await awardIndependentActivityXp(first,notebook,activity,true,now)).toBe(first);expect(await awardIndependentActivityXp(first,notebook,completed,true,now)).toBe(first);
  expect((await awardIndependentActivityXp(first,notebook,supported,true,now)).xp).toBe(170);
 });
 it('uses a supplemental legacy receipt only before the ledger exists',async()=>{
  const{notebook,progress,activity}=fixture();const migrated=await awardIndependentActivityXp(progress,notebook,activity,true,now,true);expect(migrated.xp).toBe(70);expect(Object.keys(migrated.independentActivityAwards!)).toHaveLength(1);
  const changed={...activity,instruction:'A genuinely different instruction.'};expect((await awardIndependentActivityXp(migrated,notebook,changed,true,now,true)).xp).toBe(120);
 });
 it('consumes a paid legacy checked answer with a zero spacing counter and ambiguous old completion',async()=>{
  const{notebook,progress,activity}=fixture();const saved=savedActivity(activity);saved.review={...saved.review!,independentSuccesses:0};progress.structured={[activity.id]:saved};
  const checked=await awardIndependentActivityXp(progress,notebook,activity,true,now);expect(checked.xp).toBe(70);expect(Object.keys(checked.independentActivityAwards!)).toHaveLength(1);
  const ambiguous={...progress,structured:{[activity.id]:{...saved,response:{order:['collect','send']}}}};expect((await awardIndependentActivityXp(ambiguous,notebook,activity,true,now)).xp).toBe(70);
  const assisted={...progress,structured:{[activity.id]:{...saved,response:{order:['collect','send'],_draft:{checked:true,hintUsed:true}}}}};expect((await awardIndependentActivityXp(assisted,notebook,activity,true,now)).xp).toBe(120);
  const changedAnswer={...progress,structured:{[activity.id]:{...saved,response:{order:['send','collect'],_draft:{checked:true,hintUsed:false}}}}};expect((await awardIndependentActivityXp(changedAnswer,notebook,activity,true,now)).xp).toBe(120);
 });
 it('keeps earned receipts through review downgrade, reupgrade and real model changes',async()=>{
  const{notebook,progress,activity}=fixture();progress.structured={[activity.id]:savedActivity(activity)};
  const draft=structuredClone(notebook);draft.activities![0].reviewStatus='needs-review';const downgraded=reconcileNotebookProgress(notebook,draft,progress);
  expect(downgraded.structured).toEqual({});expect(downgraded.xp).toBe(70);expect(Object.keys(downgraded.independentActivityAwards!)).toHaveLength(1);
  const upgraded=reconcileNotebookProgress(draft,notebook,downgraded);expect(await awardIndependentActivityXp(upgraded,notebook,activity,true,now)).toBe(upgraded);
  const changed=structuredClone(notebook);(changed.activities![0] as SequenceActivity).constraints=[{before:'send',after:'collect'}];const revised=reconcileNotebookProgress(notebook,changed,progress);
  expect(revised.structured).toEqual({});expect(Object.keys(revised.independentActivityAwards!)).toHaveLength(1);expect((await awardIndependentActivityXp(revised,changed,changed.activities![0],true,now)).xp).toBe(120);
 });
 it('captures old independent history before eligibility cleanup without consuming supported milestones',async()=>{
  const{notebook,progress,activity}=fixture();activity.reviewStatus='needs-review';progress.structured={[activity.id]:savedActivity(activity)};
  const cleaned=reconcileReviewEligibility(notebook,progress);expect(cleaned.structured![activity.id].review).toBeUndefined();expect(cleaned.structured![activity.id].completed).toBe(false);expect(Object.keys(cleaned.independentActivityAwards!)).toHaveLength(1);expect(cleaned.xp).toBe(70);
  const supported={...progress,structured:{[activity.id]:savedActivity(activity,true)}};const cleanedSupported=reconcileReviewEligibility(notebook,supported);expect(cleanedSupported.independentActivityAwards).toBeUndefined();
  activity.reviewStatus='reviewed';expect((await awardIndependentActivityXp(cleanedSupported,notebook,activity,true,now)).xp).toBe(120);
 });
 it('ignores cosmetics and ID changes but renews cited media and source quote content',async()=>{
  const{notebook,progress,activity}=fixture();notebook.sources[0].kind='audio';notebook.sources[0].dataUrl='data:audio/mpeg;base64,AAAA';const saved=await awardIndependentActivityXp(progress,notebook,activity,true,now);
  const cosmetic={...activity,id:'renamed-task',title:'Another title',reviewStatus:'needs-review' as const,hint:'Another hint',explanation:'Another explanation'};
  expect(await awardIndependentActivityXp(saved,notebook,cosmetic,true,now)).toBe(saved);
  notebook.sources[0].dataUrl='data:audio/mpeg;base64,AAAB';const media=await awardIndependentActivityXp(saved,notebook,cosmetic,true,now);expect(media.xp).toBe(170);
  const evidence={...cosmetic,sourceRefs:[{sourceId:notebook.sources[0].id,evidence:'A packet is a unit of information.'}]};expect((await awardIndependentActivityXp(media,notebook,evidence,true,now)).xp).toBe(220);
 });
 it('stops at the bounded ledger without evicting historical receipts',async()=>{
  const{notebook,progress,activity}=fixture();progress.independentActivityAwards=Object.fromEntries(Array.from({length:MAX_INDEPENDENT_ACTIVITY_AWARDS},(_,index)=>[index.toString(16).padStart(64,'0'),{objectiveId:`old-activity-${index}`,at:now.toISOString()}]));
  expect(validateProgress(progress).independentActivityAwards).toEqual(progress.independentActivityAwards);expect(await awardIndependentActivityXp(progress,notebook,activity,true,now,true)).toBe(progress);expect(migrateIndependentActivityAwards(progress,notebook,now)).toBe(progress);
 });
 it('rejects model hashing, notebook and date failures before producing an XP snapshot',async()=>{
  const{notebook,progress,activity}=fixture();await expect(awardIndependentActivityXp({...progress,notebookId:'other'},notebook,activity,true,now)).rejects.toThrow(/different notebook/);
  notebook.sources[0].asset={id:'broken',sha256:'broken',name:'broken.mp3',mime:'audio/mpeg',size:4};await expect(awardIndependentActivityXp(progress,notebook,activity,true,now)).rejects.toThrow(/checksum/);expect(progress.xp).toBe(70);expect(progress.independentActivityAwards).toBeUndefined();
  notebook.sources[0].asset=undefined;await expect(awardIndependentActivityXp(progress,notebook,activity,true,new Date('invalid'))).rejects.toThrow();expect(progress.independentActivityAwards).toBeUndefined();
 });
});

describe('portable independent milestone validation',()=>{
 const valid=()=>({...fixture().progress,independentActivityAwards:{['a'.repeat(64)]:{objectiveId:'packet-sequence',at:now.toISOString()}}});
 it('preserves optional absence, empty ledgers and receipt history without guessing an XP sum',()=>{
  const legacy=fixture().progress;expect(Object.hasOwn(parseProgress(serializeProgress(legacy)),'independentActivityAwards')).toBe(false);
  const progress=valid();expect(parseProgress(serializeProgress(progress))).toEqual(progress);progress.independentActivityAwards={};expect(validateProgress(progress).independentActivityAwards).toEqual({});
 });
 it.each([
  ['extra field',(p:any)=>p.independentActivityAwards['a'.repeat(64)].xp=50],['missing field',(p:any)=>delete p.independentActivityAwards['a'.repeat(64)].objectiveId],
  ['invalid key',(p:any)=>p.independentActivityAwards={wrong:Object.values(p.independentActivityAwards)[0]}],['uppercase hash',(p:any)=>p.independentActivityAwards={['A'.repeat(64)]:Object.values(p.independentActivityAwards)[0]}],
  ['unsafe id',(p:any)=>p.independentActivityAwards['a'.repeat(64)].objectiveId='__proto__'],['empty id',(p:any)=>p.independentActivityAwards['a'.repeat(64)].objectiveId=''],
  ['invalid timestamp',(p:any)=>p.independentActivityAwards['a'.repeat(64)].at='yesterday'],['noncanonical timestamp',(p:any)=>p.independentActivityAwards['a'.repeat(64)].at='2026-10-05T12:00:00Z'],
  ['normalized bad date',(p:any)=>p.independentActivityAwards['a'.repeat(64)].at='2026-02-30T00:00:00.000Z'],['null ledger',(p:any)=>p.independentActivityAwards=null],['array ledger',(p:any)=>p.independentActivityAwards=[]],
  ['excessive ledger',(p:any)=>p.independentActivityAwards=Object.fromEntries(Array.from({length:MAX_INDEPENDENT_ACTIVITY_AWARDS+1},(_,i)=>[i.toString(16).padStart(64,'0'),{objectiveId:'old-activity',at:now.toISOString()}]))],
 ] as const)('rejects %s',(_label,change)=>{const progress=valid();change(progress);expect(()=>validateProgress(progress)).toThrow();});
 it('rejects inherited ledger and nonplain receipt objects',()=>{
  const progress=valid();Object.setPrototypeOf(progress.independentActivityAwards,{extra:'inherited'});expect(()=>validateProgress(progress)).toThrow(/plain/);
  const receipt=valid();Object.setPrototypeOf(receipt.independentActivityAwards['a'.repeat(64)],{extra:'inherited'});expect(()=>validateProgress(receipt)).toThrow(/plain/);
 });
});

describe('portable practice ledger validation',()=>{
 const valid=()=>({...fixture().progress,practice:{xp:10,awards:{['a'.repeat(64)]:{kind:'card',objectiveId:'packet-card',xp:10,at:now.toISOString()}}}});
 it('roundtrips paid awards and zero tombstones without adding legacy fields',()=>{
  const progress=valid();progress.practice.awards['b'.repeat(64)]={kind:'card',objectiveId:'old-card',xp:0,at:now.toISOString()};expect(parseProgress(serializeProgress(progress))).toEqual(progress);
 });
 it('validates the fixed study amount separately from cards and activities',()=>{
  const progress=valid();progress.practice.awards['a'.repeat(64)]={kind:'study',objectiveId:'unit-old',xp:5,at:now.toISOString()};progress.practice.xp=5;expect(validateProgress(progress).practice).toEqual(progress.practice);
  progress.practice.awards['a'.repeat(64)].xp=10;progress.practice.xp=10;expect(()=>validateProgress(progress)).toThrow();
 });
 it.each([
  ['unknown ledger field',(p:any)=>p.practice.token='private'],['unknown award field',(p:any)=>p.practice.awards['a'.repeat(64)].bonus=true],
  ['missing award field',(p:any)=>delete p.practice.awards['a'.repeat(64)].objectiveId],['invalid hash',(p:any)=>p.practice.awards={wrong:Object.values(p.practice.awards)[0]}],
  ['uppercase hash',(p:any)=>p.practice.awards={['A'.repeat(64)]:Object.values(p.practice.awards)[0]}],['invalid kind',(p:any)=>p.practice.awards['a'.repeat(64)].kind='lesson'],
  ['unsafe id',(p:any)=>p.practice.awards['a'.repeat(64)].objectiveId='__proto__'],['empty id',(p:any)=>p.practice.awards['a'.repeat(64)].objectiveId=''],
  ['invalid timestamp',(p:any)=>p.practice.awards['a'.repeat(64)].at='yesterday'],['normalized invalid date',(p:any)=>p.practice.awards['a'.repeat(64)].at='2026-02-30T00:00:00.000Z'],
  ['unfixed amount',(p:any)=>{p.practice.xp=9;p.practice.awards['a'.repeat(64)].xp=9;}],['fractional amount',(p:any)=>p.practice.awards['a'.repeat(64)].xp=10.5],
  ['wrong amount for kind',(p:any)=>p.practice.awards['a'.repeat(64)].kind='activity'],['wrong sum',(p:any)=>p.practice.xp=20],
  ['negative total',(p:any)=>p.practice.xp=-1],['null ledger',(p:any)=>p.practice=null],['array awards',(p:any)=>p.practice.awards=[]],
  ['excessive awards',(p:any)=>{p.practice.xp=0;p.practice.awards=Object.fromEntries(Array.from({length:MAX_PRACTICE_AWARDS+1},(_,i)=>[i.toString(16).padStart(64,'0'),{kind:'card',objectiveId:'old-card',xp:0,at:now.toISOString()}]));}],
 ] as const)('rejects %s',(_label,change)=>{const progress=valid();change(progress);expect(()=>validateProgress(progress)).toThrow();});
 it('rejects nonplain direct objects rather than silently dropping their data',()=>{
  const progress=valid();Object.setPrototypeOf(progress.practice.awards,{extra:'inherited'});expect(()=>validateProgress(progress)).toThrow(/plain/);
 });
});
