import type {EvidenceReference,Notebook} from '../types';
import {EvidenceIndex,hybridRanks,retrievalTerms} from './retrieval';
import {evidenceReference,isCurrentEvidence,sourceRevision,textDigest} from './evidence';
import {hasCurrentActivityEvidence,isReadyLearningSource} from './scaffoldRuntime';
import type {SemanticEvidenceIndex} from './semanticRetrieval';

export interface AsterKnowledgePassage {reference:EvidenceReference;sourceTitle:string}
export interface AsterKnowledgeResult {
  status:'found'|'not-found'|'invalid-question'|'unavailable';question:string;
  passages:AsterKnowledgePassage[];message:string;method:'semantic'|'lexical'|'none';
}
export interface AskAsterOptions {limit?:number;activityId?:string;semantic?:boolean;signal?:AbortSignal}
const QUESTION_WORDS=new Set('what which why who when where how can could would should do does did please tell explain describe about me my you your say said mean means meaning know want'.split(' '));
// A retrieval heuristic for this pinned local model, not a calibrated probability
// or proof that a passage answers a question. Exact excerpts remain visible to check.
const MIN_SEMANTIC_SIMILARITY=0.35;
const semanticIndexes=new Map<string,Promise<SemanticEvidenceIndex|undefined>>();
async function localSemanticIndex(notebookId:string,sources:Notebook['sources'],index:EvidenceIndex,signal?:AbortSignal):Promise<SemanticEvidenceIndex|undefined>{
  const key=textDigest(JSON.stringify([notebookId,sources.map(source=>[source.id,source.title,sourceRevision(source)])]));
  const existing=semanticIndexes.get(key);if(existing)return existing;
  const pending=(async()=>{
    try{
      const [{SemanticEvidenceIndex,browserVectorCache},{localEmbedder}]=await Promise.all([import('./semanticRetrieval'),import('./localEmbeddings')]);
      const semantic=new SemanticEvidenceIndex(localEmbedder,browserVectorCache());let ready=false;
      await semantic.update(index.blocks,status=>{ready=status.phase==='ready';},signal);
      return ready&&!signal?.aborted?semantic:undefined;
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
  const terms=[...new Set(retrievalTerms(clean).filter(term=>!QUESTION_WORDS.has(term)))];
  if(!terms.length)return result('invalid-question','Include the concept or subject you want to find in your material.');
  const activity=options.activityId?(notebook.activities??[]).find(item=>item.id===options.activityId):undefined;
  if(options.activityId&&(!activity||!hasCurrentActivityEvidence(activity,notebook.sources)))return result('unavailable','This mission needs current source evidence before Aster can find learning passages.');
  const relevant=activity?new Set(activity.sourceRefs.map(ref=>ref.sourceId)):undefined;
  const sources=notebook.sources.filter(source=>(!relevant||relevant.has(source.id))&&isReadyLearningSource(source,notebook.sources));
  if(!sources.length)return result('unavailable','No readable, current source material is available for this question.');
  const index=new EvidenceIndex();index.update(sources);
  const limit=Number.isFinite(options.limit)?Math.max(1,Math.min(4,Math.trunc(options.limit!))):3;
  const exact=index.search(terms.join(' '),30);let hits=exact,method:AsterKnowledgeResult['method']='lexical';
  const useSemantic=options.semantic!==false&&typeof document!=='undefined'&&typeof location!=='undefined'&&location.protocol!=='file:';
  if(useSemantic&&!options.signal?.aborted){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      // Meaning search can warm locally in the background. A missing/slow model never
      // prevents access to exact-word matches. 8 seconds is a product responsiveness limit.
      const semantic=await Promise.race([localSemanticIndex(notebook.id,sources,index,options.signal),new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),8000);})]);
      if(semantic&&!options.signal?.aborted){const meanings=await semantic.search(clean,30);const relevantMeanings=meanings.filter(hit=>hit.score>=MIN_SEMANTIC_SIMILARITY);if(relevantMeanings.length){hits=hybridRanks(exact,relevantMeanings,limit);method='semantic';}}
    }catch{/* Missing assets, unsupported inference or storage failures keep lexical search available. */}
    finally{if(timer)clearTimeout(timer);}
  }
  if(options.signal?.aborted)return result('unavailable','Question search stopped. Your source material is still available.');
  hits=hits.filter(hit=>isCurrentEvidence(hit.block,notebook.sources)).slice(0,limit);
  if(!hits.length)return result('not-found','I could not find a matching passage in the available material. Try a term used in the source, or ask the author for more context.');
  return result('found','These exact source passages match your question. They may not fully answer it; Aster has not generated an explanation or verified the source’s claims.',hits.map(hit=>({reference:evidenceReference(hit.block),sourceTitle:hit.block.sourceTitle})),method);
}
