import type { LearningCard, Notebook, Progress, SourceStudyState } from '../types';
import { sourceLearningUnits, type SourceLearningUnit } from './sourceUnits';
import { canScoreRecallCard } from './utils';

export interface CampaignChapter {
  id: string; title: string; sourceTitle: string; unit: SourceLearningUnit;
  cardIds: string[]; activityIds: string[];
}
export interface LearningCampaign { chapters: CampaignChapter[]; unboundActivityIds: string[]; unboundCardIds: string[] }

/** A chapter is the source's own topic/context, not an arbitrary batch of eight questions. */
export function buildCampaign(notebook: Notebook): LearningCampaign {
  const chapters: CampaignChapter[] = notebook.sources.flatMap(source => sourceLearningUnits(source).map(unit => ({id:unit.id,title:unit.title,sourceTitle:source.title,unit,cardIds:[],activityIds:[]})));
  const boundCards = new Set<string>(), boundActivities = new Set<string>();
  const overlaps = (chapter: CampaignChapter, sourceId: string, quote: string) => {
    if (chapter.unit.sourceId !== sourceId || !quote.trim()) return false;
    const source = notebook.sources.find(s => s.id === sourceId);
    if (!source) return false;
    let at = source.text.indexOf(quote);
    while (at >= 0) {
      if (at < chapter.unit.end && at + quote.length > chapter.unit.start) return true;
      at = source.text.indexOf(quote,at + Math.max(1,quote.length));
    }
    return false;
  };
  for (const card of notebook.cards.filter(card => canScoreRecallCard(card,notebook.sources))) {
    const chapter = chapters.find(c => overlaps(c,card.sourceId,card.evidence));
    if (chapter) {chapter.cardIds.push(card.id);boundCards.add(card.id);}
  }
  for (const activity of notebook.activities ?? []) {
    // Multi-source tasks appear once, after the first source they actually use.
    const chapter = chapters.find(c => activity.sourceRefs.some(ref => overlaps(c,ref.sourceId,ref.evidence)));
    if (chapter) {chapter.activityIds.push(activity.id);boundActivities.add(activity.id);}
  }
  return {chapters,unboundActivityIds:(notebook.activities??[]).filter(a=>!boundActivities.has(a.id)).map(a=>a.id),unboundCardIds:notebook.cards.filter(c=>canScoreRecallCard(c,notebook.sources)&&!boundCards.has(c.id)).map(c=>c.id)};
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
 const activities=notebook.activities??[],dueActivity=activities.find(a=>a.reviewStatus==='reviewed'&&progress.structured?.[a.id]?.review?.independentSuccesses&&Date.parse(progress.structured[a.id].review!.dueAt)<=now);
 if(dueActivity){const prior=progress.structured![dueActivity.id],fresh=!prior.reviewStartedAt||Date.parse(prior.reviewStartedAt)<=Date.parse(prior.review!.lastReviewedAt??'1970-01-01');return{kind:'activity',activityId:dueActivity.id,fresh,title:dueActivity.title,reason:fresh?'Some time has passed since your independent attempt. Rebuild this model and see what stayed with you.':'Your review attempt is in progress. Continue from your saved model.',label:fresh?'Rebuild from a fresh attempt':'Continue this review'};}
 const dueCard=notebook.cards.find(c=>canScoreRecallCard(c,notebook.sources)&&progress.cards[c.id]?.successfulReviews>0&&Date.parse(progress.cards[c.id].dueAt)<=now);
 if(dueCard)return{kind:'recall',chapter:campaign.chapters.find(c=>c.cardIds.includes(dueCard.id)),title:'Bring an idea back into focus',reason:'A previously learned idea is ready for another retrieval attempt. You can open the source whenever you need it.',label:'Start a review expedition'};
 const started=activities.filter(a=>!progress.structured?.[a.id]?.completed&&!activityExplored(progress,a.id)&&progress.structured?.[a.id]?.response).sort((a,b)=>Date.parse(progress.structured![b.id].updatedAt)-Date.parse(progress.structured![a.id].updatedAt))[0];
 if(started)return{kind:'activity',activityId:started.id,title:started.title,reason:'Your unfinished model and lesson are saved. Pick up the next decision where you left off.',label:'Continue this mission'};
 const chapter=campaign.chapters.find(c=>!chapterProgress(c,progress).explored);
 if(chapter)return{kind:'study',chapter,title:chapter.title,reason:'Explore a new part of your own material, collect an observation, and put it to work.',label:'Explore the next chapter'};
 const nextId=nextCampaignActivity(campaign,progress),next=activities.find(a=>a.id===nextId);
 if(next)return{kind:'activity',activityId:next.id,title:next.title,reason:'Put the source material to work in your next hands-on mission.',label:'Start the next mission'};
 const unpracticed=notebook.cards.find(c=>canScoreRecallCard(c,notebook.sources)&&!progress.attempts.some(a=>a.cardId===c.id));
 if(unpracticed)return{kind:'recall',chapter:campaign.chapters.find(c=>c.cardIds.includes(unpracticed.id)),title:'Try the ideas you explored',reason:'These source-backed ideas have not appeared in a retrieval quest yet.',label:'Start a recall expedition'};
 return undefined;
}
