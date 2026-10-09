import type {EvidenceReference,Notebook} from '../types';
import {EvidenceIndex,hybridRanks} from './retrieval';
import {evidenceReference,isCurrentEvidence,sourceRevision,textDigest} from './evidence';
import {hasCurrentActivityEvidence,isReadyLearningSource} from './scaffoldRuntime';
import type {SemanticEvidenceIndex,SemanticStatus} from './semanticRetrieval';
import {asterContextBlocks,asterPassageContext,asterOverview,asterQuery,asterSearchTerms,asterTableContextHits,asterQuestionNeedsExercise,asterTopicQuestion,contextualizeAsterHits,diverseAsterHits,rankAsterLexical} from './asterRetrieval';

export interface AsterKnowledgePassage {reference:EvidenceReference;sourceTitle:string;contextReferences?:EvidenceReference[]}
export interface AsterKnowledgeResult {
  status:'found'|'not-found'|'invalid-question'|'unavailable';question:string;
  passages:AsterKnowledgePassage[];message:string;method:'semantic'|'lexical'|'none';
  coverage?:{sources:number;passages:number;semanticIndexed:number;overview:boolean;semanticStatus?:SemanticStatus['phase'];semanticComplete?:boolean};
  topicQuestion?:string;
}
export interface AskAsterOptions {limit?:number;activityId?:string;semantic?:boolean;signal?:AbortSignal;previousQuestion?:string}
// A retrieval heuristic for this pinned local model, not a calibrated probability
// or proof that a passage answers a question. Exact excerpts remain visible to check.
const MIN_SEMANTIC_SIMILARITY=0.35;
interface LocalSemanticTask {index:SemanticEvidenceIndex;done:Promise<void>;phase:SemanticStatus['phase']}
const semanticIndexes=new Map<string,Promise<LocalSemanticTask|undefined>>();
async function localSemanticIndex(notebookId:string,sources:Notebook['sources'],index:EvidenceIndex):Promise<LocalSemanticTask|undefined>{
  const key=textDigest(JSON.stringify([notebookId,sources.map(source=>[source.id,source.title,sourceRevision(source)]),index.blocks.map(block=>block.id)]));
  const existing=semanticIndexes.get(key);if(existing)return existing;
  const pending=(async()=>{
    try{
      const [{SemanticEvidenceIndex,browserVectorCache},{localEmbedder}]=await Promise.all([import('./semanticRetrieval'),import('./localEmbeddings')]);
      const semantic=new SemanticEvidenceIndex(localEmbedder,browserVectorCache(),{maxBlocks:20000,spreadAcrossDocument:true});
      // A canceled question does not poison a shared, disposable source index.
      const task:LocalSemanticTask={index:semantic,done:Promise.resolve(),phase:'loading'};const evict=()=>{if(semanticIndexes.get(key)===pending)semanticIndexes.delete(key);};task.done=semantic.update(index.blocks,status=>{task.phase=status.phase;}).then(()=>{if(!semantic.indexedCount)evict();}).catch(evict);return task;
    }catch{return undefined;}
  })();
  if(semanticIndexes.size>=4)semanticIndexes.delete(semanticIndexes.keys().next().value!);
  semanticIndexes.set(key,pending);const result=await pending;if(!result&&semanticIndexes.get(key)===pending)semanticIndexes.delete(key);return result;
}
/** Waiting is bounded and cancelable; a partial index is never reported as a
 * completed negative search. Background indexing can still finish for the next ask. */
async function within<T>(promise:Promise<T>,milliseconds:number,signal?:AbortSignal):Promise<T|undefined>{
 if(signal?.aborted)return undefined;
 return new Promise<T|undefined>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;const stop=()=>finish(undefined);
  const finish=(value:T|undefined,error?:unknown)=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);if(error)reject(error);else resolve(value);};
  timer=setTimeout(stop,Math.max(0,milliseconds));signal?.addEventListener('abort',stop,{once:true});promise.then(value=>finish(value),error=>finish(undefined,error));
 });
}
/** Offline passage finding, not generated answering. Optional meaning matching uses the
 * already bundled local embedding model; it never contacts a remote model/provider. */
export async function askAster(notebook:Notebook,question:unknown,options:AskAsterOptions={}):Promise<AsterKnowledgeResult>{
  const clean=typeof question==='string'?question.trim():'';
  const result=(status:AsterKnowledgeResult['status'],message:string,passages:AsterKnowledgePassage[]=[],method:AsterKnowledgeResult['method']='none'):AsterKnowledgeResult=>({status,question:clean.slice(0,500),passages,message,method});
  if(!clean||clean.length>500)return result('invalid-question','Ask a short question about your material, using at most 500 characters.');
  const {topicQuestion}=asterTopicQuestion(clean,options.previousQuestion),{terms,overview}=asterQuery(topicQuestion);
  if(!terms.length&&!overview)return result('invalid-question','Include the concept or subject you want to find in your material.');
  const activity=options.activityId?(notebook.activities??[]).find(item=>item.id===options.activityId):undefined;
  if(options.activityId&&(!activity||!hasCurrentActivityEvidence(activity,notebook.sources)))return result('unavailable','This mission needs current source evidence before Aster can find learning passages.');
  const relevant=activity?new Set(activity.sourceRefs.map(ref=>ref.sourceId)):undefined;
  const sources=notebook.sources.filter(source=>isReadyLearningSource(source,notebook.sources));
  if(!sources.length)return result('unavailable','No readable, current source material is available for this question.');
  const includeExercises=asterQuestionNeedsExercise(topicQuestion),index=new EvidenceIndex(source=>asterContextBlocks(source,{includeExercises,overview}));index.update(sources);
  const limit=Number.isFinite(options.limit)?Math.max(1,Math.min(6,Math.trunc(options.limit!))):3;
  const bodyHits=overview?[]:index.search(asterSearchTerms(terms).join(' '),100);
  const exact=overview?asterOverview(index.blocks,limit):rankAsterLexical([...bodyHits,...asterTableContextHits(index.blocks,terms,bodyHits)].map(hit=>relevant?.has(hit.block.sourceId)?{...hit,score:hit.score*1.08}:hit),terms);
  let hits=exact,method:AsterKnowledgeResult['method']='lexical',semanticIndexed=0,semanticStatus:SemanticStatus['phase']|undefined,semanticComplete=false;
  const useSemantic=options.semantic!==false&&index.blocks.length>0&&typeof document!=='undefined'&&typeof location!=='undefined'&&location.protocol!=='file:';
  if(useSemantic&&!overview&&!options.signal?.aborted){
    try{
      const task=await localSemanticIndex(notebook.id,sources,index);
      if(task){
       // Exact-word search already covers every source. When it has no strong
       // target, give cold meaning search a bounded recovery window rather than
       // forwarding one weak hit as though the complete index was consulted.
       const strongestExact=exact.find(hit=>{const tokens=new Set(asterSearchTerms(asterQuery(hit.block.quote).terms));return terms.length>0&&terms.filter(term=>asterSearchTerms([term]).some(value=>tokens.has(value))).length/terms.length>=0.6;});
       const strongExact=!!strongestExact;
       const deadline=Date.now()+(strongExact?3000:6500);
       await within(task.done,strongExact?1500:4500,options.signal);
       semanticIndexed=task.index.indexedCount;
       if(semanticIndexed&&!options.signal?.aborted){
        const meanings=await within(task.index.search(topicQuestion,60),Math.max(0,deadline-Date.now()),options.signal);
        const relevantMeanings=meanings?.filter(hit=>hit.score>=MIN_SEMANTIC_SIMILARITY)??[];
        if(relevantMeanings.length){
         hits=hybridRanks(exact,relevantMeanings,60);method='semantic';
         // Partial indexing must not disadvantage an exact answer merely because
         // its document position has not received an embedding yet. Keep the
         // strongest direct match; meaning hits still supply diverse alternatives.
         if(task.phase!=='ready'&&strongestExact)hits=[strongestExact,...hits.filter(hit=>hit.block.id!==strongestExact.block.id)];
        }
        semanticComplete=meanings!==undefined&&task.phase==='ready';
       }
       semanticStatus=task.phase;semanticIndexed=task.index.indexedCount;
      }else semanticStatus='unavailable';
    }catch{semanticStatus='unavailable';/* Missing local assets keep exact search available. */}
  }
  if(options.signal?.aborted)return result('unavailable','Question search stopped. Your source material is still available.');
  hits=diverseAsterHits(contextualizeAsterHits(hits.filter(hit=>isCurrentEvidence(hit.block,notebook.sources)),index.blocks,sources),limit);
  const coverage={sources:sources.length,passages:index.blocks.length,semanticIndexed,overview,...(semanticStatus?{semanticStatus,semanticComplete}:{})};
  const warming=semanticStatus!==undefined&&semanticStatus!=='unavailable'&&!semanticComplete;
  if(!hits.length)return{...result(warming?'unavailable':'not-found',warming?'I have searched the exact words, but local meaning search is still preparing your material. Please try this question again shortly, or use a term from the source.':'I could not find a matching passage in the available material. Try a term used in the source, or ask the author for more context.'),topicQuestion,coverage};
  return{...result('found',overview?'Here are selected explanations from across your material. This selection does not cover every section.':warming?'These matching passages from your material may help. Local meaning search is still preparing, so it has not checked every passage yet.':'These passages from your material may help answer your question.',hits.map(hit=>{
   const contextReferences=asterPassageContext(hit.block).filter(ref=>isCurrentEvidence(ref,notebook.sources)).map(ref=>evidenceReference(ref));
   return{reference:evidenceReference(hit.block),sourceTitle:hit.block.sourceTitle,...(contextReferences.length?{contextReferences}:{})};
  }),method),topicQuestion,coverage};
}
