import type {EvidenceReference,Notebook} from '../types';
import {EvidenceIndex,hybridRanks} from './retrieval';
import {evidenceReference,isCurrentEvidence,sourceRevision,textDigest} from './evidence';
import {hasCurrentActivityEvidence,isReadyLearningSource} from './scaffoldRuntime';
import type {SemanticEvidenceIndex} from './semanticRetrieval';
import {asterContextBlocks,asterOverview,asterQuery,asterQuestionNeedsExercise,asterTopicQuestion,diverseAsterHits,rankAsterLexical} from './asterRetrieval';

export interface AsterKnowledgePassage {reference:EvidenceReference;sourceTitle:string}
export interface AsterKnowledgeResult {
  status:'found'|'not-found'|'invalid-question'|'unavailable';question:string;
  passages:AsterKnowledgePassage[];message:string;method:'semantic'|'lexical'|'none';
  coverage?:{sources:number;passages:number;semanticIndexed:number;overview:boolean};
  topicQuestion?:string;
}
export interface AskAsterOptions {limit?:number;activityId?:string;semantic?:boolean;signal?:AbortSignal;previousQuestion?:string}
// A retrieval heuristic for this pinned local model, not a calibrated probability
// or proof that a passage answers a question. Exact excerpts remain visible to check.
const MIN_SEMANTIC_SIMILARITY=0.35;
interface LocalSemanticTask {index:SemanticEvidenceIndex;done:Promise<void>}
const semanticIndexes=new Map<string,Promise<LocalSemanticTask|undefined>>();
async function localSemanticIndex(notebookId:string,sources:Notebook['sources'],index:EvidenceIndex):Promise<LocalSemanticTask|undefined>{
  const key=textDigest(JSON.stringify([notebookId,sources.map(source=>[source.id,source.title,sourceRevision(source)]),index.blocks.map(block=>block.id)]));
  const existing=semanticIndexes.get(key);if(existing)return existing;
  const pending=(async()=>{
    try{
      const [{SemanticEvidenceIndex,browserVectorCache},{localEmbedder}]=await Promise.all([import('./semanticRetrieval'),import('./localEmbeddings')]);
      const semantic=new SemanticEvidenceIndex(localEmbedder,browserVectorCache(),{maxBlocks:20000,spreadAcrossDocument:true});
      // A canceled question does not poison a shared, disposable source index.
      const task={index:semantic,done:Promise.resolve()};const evict=()=>{if(semanticIndexes.get(key)===pending)semanticIndexes.delete(key);};task.done=semantic.update(index.blocks,()=>{}).then(()=>{if(!semantic.indexedCount)evict();}).catch(evict);return task;
    }catch{return undefined;}
  })();
  if(semanticIndexes.size>=4)semanticIndexes.delete(semanticIndexes.keys().next().value!);
  semanticIndexes.set(key,pending);const result=await pending;if(!result&&semanticIndexes.get(key)===pending)semanticIndexes.delete(key);return result;
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
  const includeExercises=asterQuestionNeedsExercise(topicQuestion),index=new EvidenceIndex(source=>asterContextBlocks(source,{includeExercises}));index.update(sources);
  const limit=Number.isFinite(options.limit)?Math.max(1,Math.min(6,Math.trunc(options.limit!))):3;
  const exact=overview?asterOverview(index.blocks,limit):rankAsterLexical(index.search(terms.join(' '),100).map(hit=>relevant?.has(hit.block.sourceId)?{...hit,score:hit.score*1.08}:hit),terms);let hits=exact,method:AsterKnowledgeResult['method']='lexical',semanticIndexed=0;
  const useSemantic=options.semantic!==false&&typeof document!=='undefined'&&typeof location!=='undefined'&&location.protocol!=='file:';
  if(useSemantic&&!overview&&!options.signal?.aborted){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      // Exact search is always complete. Meaning search warms across the whole
      // document, with a bounded wait; a slow model never blocks the question.
      const task=await localSemanticIndex(notebook.id,sources,index);
      if(task){
       await Promise.race([task.done,new Promise<void>(resolve=>{timer=setTimeout(resolve,1500);})]);if(timer)clearTimeout(timer);
       semanticIndexed=task.index.indexedCount;if(semanticIndexed&&!options.signal?.aborted){
        const meanings=await Promise.race([task.index.search(topicQuestion,60),new Promise<[]>(resolve=>{timer=setTimeout(()=>resolve([]),1500);})]);
        const relevantMeanings=meanings.filter(hit=>hit.score>=MIN_SEMANTIC_SIMILARITY);if(relevantMeanings.length){hits=hybridRanks(exact,relevantMeanings,60);method='semantic';}
       }
      }
    }catch{/* Missing assets, unsupported inference or storage failures keep lexical search available. */}
    finally{if(timer)clearTimeout(timer);}
  }
  if(options.signal?.aborted)return result('unavailable','Question search stopped. Your source material is still available.');
  hits=diverseAsterHits(hits.filter(hit=>isCurrentEvidence(hit.block,notebook.sources)),limit);
  if(!hits.length)return result('not-found','I could not find a matching passage in the available material. Try a term used in the source, or ask the author for more context.');
  return{...result('found',overview?'Here are selected explanations from across your material. This selection does not cover every section.':'These passages from your material may help answer your question.',hits.map(hit=>({reference:evidenceReference(hit.block),sourceTitle:hit.block.sourceTitle})),method),topicQuestion,coverage:{sources:sources.length,passages:index.blocks.length,semanticIndexed,overview}};
}
