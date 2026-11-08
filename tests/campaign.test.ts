import {describe,expect,it,vi} from 'vitest';
import {activityExplored,buildCampaign,expeditionInvitation,chapterProgress,nextCampaignActivity,restoreSourceStudy,saveSourceStudy,selectExpeditionCards,resumableRecallSession} from '../src/lib/campaign';
import {createNotebook,createSource} from '../src/lib/utils';
import {ACTIVITY_EXAMPLES,EXAMPLE_ACTIVITY_SOURCE} from '../src/lib/structuredEngine';
import {emptyProgress} from '../src/lib/storage';
import {parseProgress,serializeProgress} from '../src/lib/package';
import type {LearningCard,Notebook,Source} from '../src/types';
import {campaignTeachingFixture,coverMetadata} from './campaignTeaching.fixture';
import type {RubricActivity} from '../src/lib/structuredEngine';
const at='2026-10-04T12:00:00.000Z';
const source:Source={id:'source-network',title:'Network notebook',kind:'text',status:'ready',addedAt:at,text:'# Names\nDNS: Resolves a domain name to a network address.\n\nThis lookup keeps a memorable name separate from its destination address.\n\n# Paths\nRouter: Forwards packets between different networks.\n\nA route determines the next hop for the packet.'};
const card=(id:string,answer:string,evidence:string):LearningCard=>({id,prompt:'Which term fits this description?',answer,options:['DNS','Router'],correctIndex:answer==='DNS'?0:1,explanation:evidence,evidence,sourceId:source.id,concept:answer,tags:['source-recall'],questionType:'definition',reviewStatus:'extractive'});
const notebook=():Notebook=>createNotebook({id:'campaign-notebook',title:'Network expedition',sources:[source],cards:[card('dns','DNS','DNS: Resolves a domain name to a network address.'),card('router','Router','Router: Forwards packets between different networks.')],activities:[],ageGroup:'adult'});
describe('source-shaped learning campaign',()=>{
 it('resumes the exact unfinished recall quest ahead of due questions, prepared missions and optional notes',()=>{
  const n=notebook(),campaign=buildCampaign(n),p=emptyProgress(n.id),chapter=campaign.chapters[1];
  p.activeSession={scaffoldId:'recall-escape-mission',chapterId:chapter.id,cardIds:['router'],index:0,seed:42,startedAt:at,state:{selection:'DNS',hint:true}};
  p.cards.dns={cardId:'dns',attempts:1,correct:1,successfulReviews:1,intervalDays:1,dueAt:at,lastAttemptAt:at,lastCorrect:true};
  const before=serializeProgress(p);
  expect(resumableRecallSession(n,campaign,p)).toBe(p.activeSession);
  expect(expeditionInvitation(n,campaign,p,Date.parse(at)+1)).toMatchObject({kind:'recall',resume:true,chapter:{id:chapter.id},title:'Paths',label:'Continue this recall quest'});
  n.sources.push({...createSource(EXAMPLE_ACTIVITY_SOURCE.text),id:EXAMPLE_ACTIVITY_SOURCE.id});
  n.activities=[{...structuredClone(ACTIVITY_EXAMPLES.find(a=>a.kind==='sequence')!),id:'another-mission'}];
  expect(expeditionInvitation(n,buildCampaign(n),p)).toMatchObject({kind:'recall',resume:true});
  expect(serializeProgress(p)).toBe(before);
 });
 it('resumes an unscoped saved recall session without inventing a chapter',()=>{
  const n=notebook(),p=emptyProgress(n.id);
  p.activeSession={scaffoldId:'recall-escape-mission',cardIds:['dns','router'],index:1,seed:42,startedAt:at};
  expect(expeditionInvitation(n,buildCampaign(n),p)).toMatchObject({kind:'recall',resume:true,title:'Your saved recall quest',chapter:undefined});
 });
 it('falls back without changing stale, mismatched, finished or incompatible saved sessions',()=>{
  const n=notebook(),campaign=buildCampaign(n),base={scaffoldId:'recall-escape-mission',chapterId:campaign.chapters[0].id,cardIds:['dns'],index:0,seed:42,startedAt:at};
  for(const session of [
   {...base,index:1},{...base,index:-1},{...base,index:0.5},
   {...base,cardIds:[]},{...base,cardIds:['dns','dns']},{...base,cardIds:['deleted-card']},
   {...base,chapterId:'deleted-chapter'},{...base,chapterId:campaign.chapters[1].id},
   {...base,scaffoldId:'unknown-recipe'},{...base,scaffoldId:'process-reconstruction'},
  ]){
   const p={...emptyProgress(n.id),activeSession:session},before=JSON.stringify(p);
   expect(resumableRecallSession(n,campaign,p)).toBeUndefined();
   expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'recall',label:'Start a recall expedition'});
   expect(expeditionInvitation(n,campaign,p)).not.toHaveProperty('resume');
   expect(JSON.stringify(p)).toBe(before);
  }
  const p={...emptyProgress(n.id),activeSession:{...base,chapterId:undefined,cardIds:['dns','router'],index:1}};
  const stale={...n,sources:[{...n.sources[0],text:n.sources[0].text.replace('DNS: Resolves','DNS: No longer resolves')}]};
  // A stale already-answered card invalidates the saved session too; it must not
  // preserve an old success merely because the remaining question still exists.
  expect(resumableRecallSession(stale,buildCampaign(stale),p)).toBeUndefined();
  expect(expeditionInvitation(stale,buildCampaign(stale),p)).not.toHaveProperty('resume');
 });
 it('keeps prepared recall ahead of optional field notes even after every card was practised',()=>{
  const n=notebook(),p=emptyProgress(n.id),campaign=buildCampaign(n);
  p.attempts=n.cards.map(card=>({id:`attempt-${card.id}`,cardId:card.id,correct:true,at,confidence:'unsure' as const,xp:0}));
  const before=serializeProgress(p);
  expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'recall',label:'Revisit a recall expedition'});
  expect(serializeProgress(p)).toBe(before);
  const sourceOnly={...n,cards:[]};expect(expeditionInvitation(sourceOnly,buildCampaign(sourceOnly),p)?.kind).toBe('study');
 });
 it('routes a generated game into its actual teaching before optional source notes',()=>{
  const n=campaignTeachingFixture(),campaign=buildCampaign(n),p=emptyProgress(n.id);
  const taught=campaign.chapters.find(c=>c.teaching);
  expect(taught?.teaching).toMatchObject({activityId:'task-review-mission',title:'Understand tasks before choosing a tool'});
  expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'activity',activityId:'task-review-mission',label:'Learn & play this mission'});
  expect(campaign.chapters.every(c=>!c.unit.quote.includes(coverMetadata))).toBe(true);
  expect(n.sources[0].text).toContain(coverMetadata);
  const stale={...n,sources:[{...n.sources[0],text:n.sources[0].text+'\n\nA later note adds context.'}]};
  const revised=buildCampaign(stale);expect(revised.chapters.every(c=>!c.teaching)).toBe(true);
  expect(expeditionInvitation(stale,revised,p)).toMatchObject({kind:'activity',activityId:'task-review-mission',label:'Start the next mission'});
 });
 it('opens a source-linked prepared mission before optional early chapters without marking notes or teaching read',()=>{
  const n=campaignTeachingFixture(),activity=n.activities![0],evidence=activity.sourceRefs[0].evidence;
  n.aiLearningPlan=undefined;
  n.sources=[{...n.sources[0],text:`# Background observations\n\nThe notebook records observations for later reflection. This background has no prepared activity.\n\n# Task-review procedure\n\n${evidence}`}];
  const campaign=buildCampaign(n),p=emptyProgress(n.id),before=serializeProgress(p);
  expect(campaign.chapters[0].activityIds).toEqual([]);
  expect(campaign.chapters.findIndex(chapter=>chapter.activityIds.includes(activity.id))).toBeGreaterThan(0);
  expect(campaign.chapters.flatMap(chapter=>chapter.activityIds)).toEqual([activity.id]);
  expect(campaign.chapters.every(chapter=>!chapter.teaching)).toBe(true);
  expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'activity',activityId:activity.id,label:'Start the next mission'});
  expect(serializeProgress(p)).toBe(before);
  const changed={...n,sources:[{...n.sources[0],text:n.sources[0].text.replace('Read the task description.','Inspect the revised task description.')} ]};
  expect(expeditionInvitation(changed,buildCampaign(changed),p)?.kind).toBe('study');
  expect(serializeProgress(p)).toBe(before);
 });
 it('revisits saved finished work before optional notes without resetting its response or earned progress',()=>{
  const n=campaignTeachingFixture(),activity=n.activities![0],p=emptyProgress(n.id);
  n.aiLearningPlan=undefined;
  p.structured={[activity.id]:{response:{order:['read','compare','record'],_draft:{checked:true,hintUsed:true}},completed:true,score:2,maxScore:2,attempts:1,updatedAt:at}};
  p.xp=20;
  const before=serializeProgress(p),campaign=buildCampaign(n);
  expect(campaign.chapters.some(chapter=>!chapterProgress(chapter,p).explored)).toBe(true);
  expect(nextCampaignActivity(campaign,p)).toBeUndefined();
  expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'activity',activityId:activity.id,fresh:false,label:'Revisit this mission'});
  expect(serializeProgress(p)).toBe(before);
  expect(p.structured[activity.id].review).toBeUndefined();
 });
 it('keeps explanations with the right heading and maps challenges to their actual evidence',()=>{const plan=buildCampaign(notebook());expect(plan.chapters).toHaveLength(2);expect(plan.chapters.map(c=>c.title)).toEqual(['Names','Paths']);expect(plan.chapters[0].unit.quote).toContain('memorable name');expect(plan.chapters[0].unit.quote).not.toContain('next hop');expect(plan.chapters.map(c=>c.cardIds)).toEqual([['dns'],['router']]);});
 it('binds a late chapter without rescanning the whole document for every earlier chapter',()=>{
  const paragraphs=Array.from({length:500},(_,index)=>`# Chapter ${index+1}\n\nThe source explains observation ${index+1} and its documented conditions. A learner compares that evidence before making a claim.`);
  const text=paragraphs.join('\n\n'),evidence='The source explains observation 500 and its documented conditions.';
  const n=createNotebook({sources:[{...source,text}],cards:[{...card('late','DNS',evidence),questionType:'manual',reviewStatus:'reviewed'}]});
  const original=String.prototype.indexOf;let sourceScans=0;
  const spy=vi.spyOn(String.prototype,'indexOf').mockImplementation(function(this:string,search:string,from?:number){if(String(this)===text&&search===evidence)sourceScans++;return original.call(this,search,from);});
  try{const campaign=buildCampaign(n);expect(campaign.chapters).toHaveLength(500);expect(campaign.chapters.at(-1)?.cardIds).toEqual(['late']);expect(campaign.chapters.slice(0,-1).every(chapter=>chapter.cardIds.length===0)).toBe(true);expect(sourceScans).toBeLessThan(10);}finally{spy.mockRestore();}
 });
 it('keeps repeated quotation binding at the first matching chapter and invalidates positions after edits',()=>{
  const repeated='A source statement can appear more than once without changing its meaning.';
  const n=createNotebook({sources:[{...source,text:`# First\n\n${repeated}\n\n# Second\n\n${repeated}`}],cards:[{...card('repeat','DNS',repeated),questionType:'manual',reviewStatus:'reviewed'}]});
  expect(buildCampaign(n).chapters.map(chapter=>chapter.cardIds)).toEqual([['repeat'],[]]);
  n.sources=[{...n.sources[0],text:`# First\n\nThis chapter now contains a different documented observation.\n\n# Second\n\n${repeated}`}];
  expect(buildCampaign(n).chapters.map(chapter=>chapter.cardIds)).toEqual([[],['repeat']]);
 });
 it('stops scanning a frequently repeated quote once its first chapter is found',()=>{
  const evidence='the source condition',text='# First\n\n'+('Check the source condition before using this example. '.repeat(2000));
  const n=createNotebook({sources:[{...source,text}],cards:[{...card('frequent','DNS',evidence),questionType:'manual',reviewStatus:'reviewed'}]});
  const original=String.prototype.indexOf;let sourceScans=0;
  const spy=vi.spyOn(String.prototype,'indexOf').mockImplementation(function(this:string,search:string,from?:number){if(String(this)===text&&search===evidence)sourceScans++;return original.call(this,search,from);});
  try{const campaign=buildCampaign(n);expect(campaign.chapters[0].cardIds).toEqual(['frequent']);expect(sourceScans).toBeLessThan(10);}finally{spy.mockRestore();}
 });
 it('keeps source identity and boundary-overlapping quotations when indexing chapter evidence',()=>{
  const first='# Alpha\n\nA documented condition begins here.\n\n# Beta\n\nThe observation continues under the next heading.',second={...source,id:'other',text:first};
  const spanning='A documented condition begins here.\n\n# Beta\n\nThe observation continues';
  const n=createNotebook({sources:[{...source,text:first},second],cards:[{...card('cross','DNS',spanning),sourceId:'other',questionType:'manual',reviewStatus:'reviewed'}]});
  const campaign=buildCampaign(n);expect(campaign.chapters.map(chapter=>chapter.cardIds)).toEqual([[],[],['cross'],[]]);
 });
 it('keeps unsupported prose discoverable without claiming it has a scored model',()=>{const plan=buildCampaign(createNotebook({sources:[{...source,text:'# Observations\nThe river changed after the rain. The observer recorded several possibilities and left the cause unresolved.'}],cards:[]}));expect(plan.chapters).toHaveLength(1);expect(plan.chapters[0].cardIds).toEqual([]);expect(plan.chapters[0].unit.quote).toContain('unresolved');});
 it('preserves unsupported authored work in the notebook without proposing it as a mission',()=>{const n=notebook();n.activities=[{version:1,id:'authored-task',kind:'rubric',mode:'self-assessment',title:'Explain a boundary',instruction:'Review your explanation.',sample:'An authored sample',criteria:[{id:'scope',label:'Scope',levels:['Needs context','Has context']}],sourceRefs:[],reviewStatus:'reviewed',hint:'Keep scope clear.',explanation:'Review the explicit criterion.'}];const plan=buildCampaign(n);expect(plan.unboundActivityIds).toEqual([]);expect(nextCampaignActivity(plan,emptyProgress(n.id))).toBeUndefined();expect(n.activities[0].id).toBe('authored-task');});
 it('records a grounded field note without XP, completion credit, or altered review schedules',()=>{const n=notebook(),chapter=buildCampaign(n).chapters[0],before=emptyProgress(n.id),fresh=restoreSourceStudy(chapter);const next=saveSourceStudy(before,chapter,{...fresh,quote:chapter.unit.passages[0].quote,note:'DNS helps resolve the destination while keeping names memorable.',completed:true});expect(next.studies?.[chapter.id].completed).toBe(true);expect(next.xp).toBe(0);expect(next.completedCardIds).toEqual([]);expect(next.cards).toEqual({});expect(chapterProgress(chapter,next).explored).toBe(true);expect(chapterProgress(chapter,next).independent).toBe(0);});
 it('rejects forged evidence and unfinished discoveries',()=>{const n=notebook(),chapter=buildCampaign(n).chapters[0],p=emptyProgress(n.id),s=restoreSourceStudy(chapter);expect(()=>saveSourceStudy(p,chapter,{...s,quote:'A claim the source never made',note:'Something learned',completed:true})).toThrow('source changed');expect(()=>saveSourceStudy(p,chapter,{...s,quote:chapter.unit.quote,completed:true})).toThrow('observation');});
 it('invalidates current chapter progress when its actual source wording changes',()=>{const n=notebook(),chapter=buildCampaign(n).chapters[0],s={...restoreSourceStudy(chapter),quote:chapter.unit.quote,note:'Names resolve to addresses.',completed:true};n.sources=[{...source,text:source.text.replace('network address','service endpoint')}];const revised=buildCampaign(n).chapters[0];expect(revised.id).not.toBe(chapter.id);expect(restoreSourceStudy(revised,s).completed).toBe(false);});
 it('retains field notes and chapter identity in portable progress backups',()=>{const n=notebook(),chapter=buildCampaign(n).chapters[0];let p=saveSourceStudy(emptyProgress(n.id),chapter,{...restoreSourceStudy(chapter),quote:chapter.unit.passages[0].quote,note:'Names help us find addresses.',completed:true});p.activeSession={scaffoldId:'recall-escape-mission',chapterId:chapter.id,cardIds:['dns'],index:0,seed:2,startedAt:at};const restored=parseProgress(serializeProgress(p));expect(restored.studies).toEqual(p.studies);expect(restored.activeSession?.chapterId).toBe(chapter.id);});
 it('advances beyond successful supported cards instead of looping the first eight forever',()=>{const n=notebook(),p=emptyProgress(n.id);p.attempts=[{id:'a',cardId:'dns',correct:true,confidence:'guessing',xp:0,at}];p.cards.dns={cardId:'dns',attempts:1,correct:0,successfulReviews:0,intervalDays:0,dueAt:at,lastAttemptAt:at,lastCorrect:false};expect(selectExpeditionCards(n.cards,p,1)[0].id).toBe('router');const state=chapterProgress(buildCampaign(n).chapters[0],p);expect(state.practiced).toBe(1);expect(state.independent).toBe(0);});
 it('prioritizes genuinely due independent reviews without dropping unseen work',()=>{const n=notebook(),p=emptyProgress(n.id);p.cards.dns={cardId:'dns',attempts:1,correct:1,successfulReviews:1,intervalDays:1,dueAt:at,lastAttemptAt:at,lastCorrect:true};expect(selectExpeditionCards(n.cards,p,2,Date.parse(at)+1).map(c=>c.id)).toEqual(['dns','router']);});
});

it('invites a return to due independent learning before unexplored material without inventing a streak reward',()=>{const n=notebook(),p=emptyProgress(n.id),campaign=buildCampaign(n);expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'recall',label:'Start a recall expedition'});p.cards.dns={cardId:'dns',attempts:1,correct:1,successfulReviews:1,intervalDays:1,dueAt:at,lastAttemptAt:at,lastCorrect:true};const invitation=expeditionInvitation(n,campaign,p,Date.parse(at)+1);expect(invitation?.kind).toBe('recall');if(invitation?.kind==='recall')expect(invitation.chapter?.cardIds).toContain('dns');expect(p.xp).toBe(0);p.cards.dns.successfulReviews=0;expect(expeditionInvitation(n,campaign,p,Date.parse(at)+1)).toMatchObject({kind:'recall',label:'Start a recall expedition'});});

it('a due model starts fresh once, then offers its in-progress review without resetting it',()=>{const n=notebook(),p=emptyProgress(n.id);n.sources.push({...createSource(EXAMPLE_ACTIVITY_SOURCE.text),id:EXAMPLE_ACTIVITY_SOURCE.id});n.activities=[{...structuredClone(ACTIVITY_EXAMPLES.find(a=>a.kind==='sequence')!),id:'model'}];p.structured={model:{response:{_draft:{checked:true}},completed:true,score:1,maxScore:1,attempts:1,updatedAt:at,review:{id:'model',dueAt:at,lastReviewedAt:at,independentSuccesses:1} as any}};const campaign=buildCampaign(n),now=Date.parse(at)+1000;const fresh=expeditionInvitation(n,campaign,p,now);expect(fresh).toMatchObject({kind:'activity',activityId:'model',fresh:true});p.structured.model.reviewStartedAt=new Date(now).toISOString();p.structured.model.response={order:['unfinished']};expect(expeditionInvitation(n,campaign,p,now)).toMatchObject({kind:'activity',activityId:'model',fresh:false});expect(p.structured.model.response).toEqual({order:['unfinished']});});

describe('campaign attempts and finished practice are different states',()=>{
 const fixture=()=>{
  const n=campaignTeachingFixture(),activity=n.activities![0];
  if(activity.kind!=='sequence')throw Error('This regression needs the source-backed sequence.');
  n.activities!.push({...structuredClone(activity),id:'next-mission'});
  const p=emptyProgress(n.id);
  p.structured={[activity.id]:{response:{order:['record','compare','read'],_draft:{checked:true,practiceScore:999}},completed:false,score:999,maxScore:999,attempts:1,updatedAt:at}};
  return{n,activity,p};
 };
 it('keeps a wrong checked draft as the next and resumable mission, even with a forged stored score',()=>{
  const {n,activity,p}=fixture(),campaign=buildCampaign(n),before=serializeProgress(p);
  expect(activityExplored(p,activity.id,activity)).toBe(false);
  expect(nextCampaignActivity(campaign,p)).toBe(activity.id);
  expect(expeditionInvitation(n,campaign,p)).toMatchObject({kind:'activity',activityId:activity.id,label:'Continue this mission'});
  expect(serializeProgress(p)).toBe(before);
 });
 it('does not finish an invalid response or an unchecked correct answer',()=>{
  const {n,activity,p}=fixture();
  for(const response of [{order:['read','read','record'],_draft:{checked:true}},{order:['read','compare','record'],_draft:{checked:false}},{order:['read','compare','record']}]){
   p.structured![activity.id].response=response;
   expect(activityExplored(p,activity.id,activity)).toBe(false);
   expect(nextCampaignActivity(buildCampaign(n),p)).toBe(activity.id);
  }
 });
 it('advances after correct draft or supported reviewed practice without changing awards or independent completion',()=>{
  for(const reviewStatus of ['needs-review','reviewed'] as const){
   const {n,activity,p}=fixture();activity.reviewStatus=reviewStatus;
   p.structured![activity.id].response={order:['read','compare','record'],_draft:{checked:true,hintUsed:true}};
   const before=serializeProgress(p);
   expect(activityExplored(p,activity.id,activity)).toBe(true);
   expect(nextCampaignActivity(buildCampaign(n),p)).toBe('next-mission');
   expect(serializeProgress(p)).toBe(before);
   expect(p.structured![activity.id].completed).toBe(false);
   expect(p.structured![activity.id].review).toBeUndefined();
   expect(p.xp).toBe(0);expect(p.completedCardIds).toEqual([]);
  }
 });
 it('rechecks the current model and never trusts a checked flag without a matching activity',()=>{
  const {activity,p}=fixture();p.structured![activity.id].response={order:['read','compare','record'],_draft:{checked:true}};
  expect(activityExplored(p,activity.id,activity)).toBe(true);
  expect(activityExplored(p,activity.id)).toBe(false);
  expect(activityExplored(p,activity.id,{...activity,id:'other'})).toBe(false);
  expect(activityExplored(p,activity.id,{...activity,constraints:[{before:'record',after:'read'}]})).toBe(false);
 });
 it('finishes a checked valid reflection without turning self-review into a correctness or mastery award',()=>{
  const {n,activity,p}=fixture();
  const reflection:RubricActivity={version:1,id:activity.id,kind:'rubric',mode:'self-assessment',title:'Reflect on the decision',instruction:'Review your source observation.',sample:'How did the conditions shape your decision?',criteria:[{id:'conditions',label:'I considered the stated conditions',levels:['I need another look','I can explain the conditions']}],sourceRefs:activity.sourceRefs,reviewStatus:'needs-review',explanation:'Compare your reflection with the source.',hint:'Keep the conditions with the decision.'};
  n.activities![0]=reflection;
  p.structured![activity.id].response={ratings:{conditions:-1},_draft:{checked:true}};
  expect(activityExplored(p,activity.id,reflection)).toBe(false);
  p.structured![activity.id].response={ratings:{conditions:1},_draft:{checked:false}};
  expect(activityExplored(p,activity.id,reflection)).toBe(false);
  p.structured![activity.id].response={ratings:{conditions:1},_draft:{checked:true}};
  const before=serializeProgress(p);
  expect(activityExplored(p,activity.id,reflection)).toBe(true);
  expect(nextCampaignActivity(buildCampaign(n),p)).toBe('next-mission');
  expect(serializeProgress(p)).toBe(before);expect(p.structured![activity.id].completed).toBe(false);expect(p.xp).toBe(0);
 });
});
