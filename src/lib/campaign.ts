import type { LearningCard, Notebook, Progress, SourceStudyState } from '../types';
import { sourceLearningUnits, type SourceLearningUnit } from './sourceUnits';
import { canScoreRecallCard } from './utils';
import { hasCurrentActivityEvidence, isReadyLearningSource } from './scaffoldRuntime';
import {currentAILearningMission} from './aiLearningPlan';

export interface CampaignChapter {
  id: string; title: string; sourceTitle: string; unit: SourceLearningUnit;
  cardIds: string[]; activityIds: string[];
  teaching?: {activityId:string;title:string;objective:string;introduction:string};
}
export interface LearningCampaign { chapters: CampaignChapter[]; unboundActivityIds: string[]; unboundCardIds: string[] }

/** A chapter is the source's own topic/context, not an arbitrary batch of eight questions. */
export function buildCampaign(notebook: Notebook): LearningCampaign {
  const sources = notebook.sources.filter(source => isReadyLearningSource(source, notebook.sources));
  const activities = (notebook.activities ?? []).filter(activity => hasCurrentActivityEvidence(activity, notebook.sources));
  const cards = notebook.cards.filter(card => canScoreRecallCard(card, sources));
  const chapters: CampaignChapter[] = sources.flatMap(source => sourceLearningUnits(source).map(unit => ({id:unit.id,title:unit.title,sourceTitle:source.title,unit,cardIds:[],activityIds:[]})));
  const boundCards = new Set<string>(), boundActivities = new Set<string>();
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const chaptersBySource = new Map<string, CampaignChapter[]>();
  for (const chapter of chapters) {const group=chaptersBySource.get(chapter.unit.sourceId)??[];group.push(chapter);chaptersBySource.set(chapter.unit.sourceId,group);}
  // Search each exact quotation once per campaign build. Previously every
  // candidate chapter rescanned the entire document (and every repeated quote
  // occurrence), making long guides stall on the UI thread. Source units are
  // ordered, non-overlapping ranges: scan occurrences and units forward only
  // until the first overlap. Even a very short repeated quote needs no large
  // occurrence array. Keep this index local so edits cannot reuse stale ranges.
  const firstMatches = new Map<string, Map<string, CampaignChapter|undefined>>();
  const overlaps = (chapter: CampaignChapter, sourceId: string, quote: string) => {
    if (chapter.unit.sourceId !== sourceId || !quote.trim()) return false;
    const source = sourceById.get(sourceId);
    if (!source) return false;
    let sourceMatches = firstMatches.get(sourceId);
    if (!sourceMatches) {sourceMatches = new Map();firstMatches.set(sourceId,sourceMatches);}
    if (!sourceMatches.has(quote)) {
      const group=chaptersBySource.get(sourceId)??[];let index=0,match:CampaignChapter|undefined;
      for (let at=source.text.indexOf(quote);at>=0;at=source.text.indexOf(quote,at+quote.length)) {
        while(index<group.length&&group[index].unit.end<=at)index++;
        if(index===group.length)break;
        if(group[index].unit.start<at+quote.length){match=group[index];break;}
      }
      sourceMatches.set(quote,match);
    }
    return sourceMatches.get(quote)===chapter;
  };
  for (const card of cards) {
    const chapter = chapters.find(c => overlaps(c,card.sourceId,card.evidence));
    if (chapter) {chapter.cardIds.push(card.id);boundCards.add(card.id);}
  }
  for (const activity of activities) {
    // Multi-source tasks appear once, after the first source they actually use.
    const chapter = chapters.find(c => activity.sourceRefs.some(ref => overlaps(c,ref.sourceId,ref.evidence)));
    if (chapter) {chapter.activityIds.push(activity.id);boundActivities.add(activity.id);}
  }
  for(const chapter of chapters){
    for(const id of chapter.activityIds){
      const activity=activities.find(a=>a.id===id)!;
      const teaching=currentAILearningMission(notebook,activity);
      if(teaching){chapter.teaching={activityId:id,title:teaching.title,objective:teaching.objective,introduction:teaching.conceptExplanation.text};break;}
    }
  }
  return {chapters,unboundActivityIds:activities.filter(a=>!boundActivities.has(a.id)).map(a=>a.id),unboundCardIds:cards.filter(c=>!boundCards.has(c.id)).map(c=>c.id)};
}

export function chapterProgress(chapter: CampaignChapter, progress: Progress) {
  const study = restoreSourceStudy(chapter,progress.studies?.[chapter.id]);
  const practiced = chapter.cardIds.filter(id => progress.attempts.some(a => a.cardId === id && a.correct)).length;
  const completedActivities = chapter.activityIds.filter(id => progress.structured?.[id]?.completed).length;
  const independent = chapter.cardIds.filter(id=>progress.completedCardIds.includes(id)).length;
  return {study,practiced,completedActivities,independent,explored:study.completed,hasPractice:chapter.cardIds.length+chapter.activityIds.length>0};
}

/** An explored draft is participation, not a completed/independently assessed model. */
export function activityExplored(progress:Progress,id:string):boolean {
  const response=progress.structured?.[id]?.response;
  if(!response||typeof response!=='object'||Array.isArray(response))return false;
  const draft=(response as Record<string,unknown>)._draft;
  return !!draft&&typeof draft==='object'&&!Array.isArray(draft)&&(draft as Record<string,unknown>).checked===true;
}

export function restoreSourceStudy(chapter: CampaignChapter, saved?: SourceStudyState): SourceStudyState {
  const fresh:SourceStudyState={unitId:chapter.id,sourceId:chapter.unit.sourceId,quote:'',note:'',question:'',completed:false,updatedAt:new Date().toISOString()};
  if (!saved || saved.unitId!==chapter.id || saved.sourceId!==chapter.unit.sourceId || saved.quote && !chapter.unit.quote.includes(saved.quote)) return fresh;
  return {...fresh,...saved};
}

export function saveSourceStudy(progress:Progress,chapter:CampaignChapter,state:SourceStudyState):Progress {
  if(state.unitId!==chapter.id||state.sourceId!==chapter.unit.sourceId||state.quote&&!chapter.unit.quote.includes(state.quote))throw new Error('The source changed. Reopen this chapter before saving a discovery.');
  if(state.completed&&(!state.quote||state.note.trim().length<8))throw new Error('Pin a source passage and add an observation before saving this discovery.');
  const studies={...progress.studies,[chapter.id]:{...state,updatedAt:new Date().toISOString()}};
  const bounded=Object.fromEntries(Object.entries(studies).slice(-2000));
  // Reading/reflecting can advance the journey without awarding recall XP or scheduling mastery.
  return {...progress,studies:bounded,updatedAt:new Date().toISOString(),revision:progress.revision+1};
}

export function nextCampaignActivity(campaign:LearningCampaign,progress:Progress,currentId?:string):string|undefined {
  const ids=[...campaign.chapters.flatMap(c=>c.activityIds),...campaign.unboundActivityIds];
  const after=currentId?ids.indexOf(currentId)+1:0;
  return [...ids.slice(after),...ids.slice(0,after)].find(id=>id!==currentId&&!progress.structured?.[id]?.completed&&!activityExplored(progress,id));
}

/** First-day supported success must not trap the learner in the same first eight cards. */
export function selectExpeditionCards(cards:LearningCard[],progress:Progress,limit=8,now=Date.now()):LearningCard[]{
  const latest=new Map<string,Progress['attempts'][number]>();
  for(const attempt of progress.attempts)latest.set(attempt.cardId,attempt);
  const priority=(card:LearningCard)=>{
    const review=progress.cards[card.id],attempt=latest.get(card.id);
    if(review?.successfulReviews>0&&Date.parse(review.dueAt)<=now)return 0;
    if(!attempt)return 1;
    if(!attempt.correct)return 2;
    if(!review?.successfulReviews)return 3;
    return 4;
  };
  return cards.map((card,index)=>({card,index})).sort((a,b)=>priority(a.card)-priority(b.card)||a.index-b.index).slice(0,Math.max(0,limit)).map(x=>x.card);
}

export type ExpeditionInvitation={kind:'activity';activityId:string;fresh?:boolean;title:string;reason:string;label:string}|{kind:'recall';chapter?:CampaignChapter;title:string;reason:string;label:string}|{kind:'study';chapter:CampaignChapter;title:string;reason:string;label:string};
/** A useful return invitation follows saved work and spaced review, without streak pressure or invented rewards. */
export function expeditionInvitation(notebook:Notebook,campaign:LearningCampaign,progress:Progress,now=Date.now()):ExpeditionInvitation|undefined{
 const sources=notebook.sources.filter(source=>isReadyLearningSource(source,notebook.sources)),activities=(notebook.activities??[]).filter(activity=>hasCurrentActivityEvidence(activity,notebook.sources)),dueActivity=activities.find(a=>a.reviewStatus==='reviewed'&&progress.structured?.[a.id]?.review?.independentSuccesses&&Date.parse(progress.structured[a.id].review!.dueAt)<=now);
 if(dueActivity){const prior=progress.structured![dueActivity.id],fresh=!prior.reviewStartedAt||Date.parse(prior.reviewStartedAt)<=Date.parse(prior.review!.lastReviewedAt??'1970-01-01');return{kind:'activity',activityId:dueActivity.id,fresh,title:dueActivity.title,reason:fresh?'Some time has passed since your independent attempt. Rebuild this model and see what stayed with you.':'Your review attempt is in progress. Continue from your saved model.',label:fresh?'Rebuild from a fresh attempt':'Continue this review'};}
 const dueCard=notebook.cards.find(c=>canScoreRecallCard(c,sources)&&progress.cards[c.id]?.successfulReviews>0&&Date.parse(progress.cards[c.id].dueAt)<=now);
 if(dueCard)return{kind:'recall',chapter:campaign.chapters.find(c=>c.cardIds.includes(dueCard.id)),title:'Bring an idea back into focus',reason:'A previously learned idea is ready for another retrieval attempt. You can open the source whenever you need it.',label:'Start a review expedition'};
 const started=activities.filter(a=>!progress.structured?.[a.id]?.completed&&!activityExplored(progress,a.id)&&progress.structured?.[a.id]?.response).sort((a,b)=>Date.parse(progress.structured![b.id].updatedAt)-Date.parse(progress.structured![a.id].updatedAt))[0];
 if(started)return{kind:'activity',activityId:started.id,title:started.title,reason:'Your unfinished model and lesson are saved. Pick up the next decision where you left off.',label:'Continue this mission'};
 // Generated teaching is the main journey. Source notes remain an optional
 // reference, rather than an extra compulsory reading task before that lesson.
 const taught=activities.find(a=>!progress.structured?.[a.id]?.completed&&!activityExplored(progress,a.id)&&currentAILearningMission(notebook,a));
 if(taught){const teaching=currentAILearningMission(notebook,taught)!;return{kind:'activity',activityId:taught.id,title:teaching.title,reason:teaching.objective,label:'Learn & play this mission'};}
 const chapter=campaign.chapters.find(c=>!chapterProgress(c,progress).explored);
 if(chapter)return{kind:'study',chapter,title:chapter.title,reason:'Explore a new part of your own material, collect an observation, and put it to work.',label:'Explore the next chapter'};
 const nextId=nextCampaignActivity(campaign,progress),next=activities.find(a=>a.id===nextId);
 if(next)return{kind:'activity',activityId:next.id,title:next.title,reason:'Put the source material to work in your next hands-on mission.',label:'Start the next mission'};
 const unpracticed=notebook.cards.find(c=>canScoreRecallCard(c,sources)&&!progress.attempts.some(a=>a.cardId===c.id));
 if(unpracticed)return{kind:'recall',chapter:campaign.chapters.find(c=>c.cardIds.includes(unpracticed.id)),title:'Try the ideas you explored',reason:'These source-backed ideas have not appeared in a retrieval quest yet.',label:'Start a recall expedition'};
 return undefined;
}
