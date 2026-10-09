import type { EvidenceBlock, Source } from '../types';
import { evidenceBlocks, sourceRevision } from './evidence';

const STOP=new Set('a an and are as at be by for from has have in is it of on or that the this to was were will with'.split(' '));
export function retrievalTerms(text:string):string[]{return (text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:[-.][\p{L}\p{N}]+)*/gu)||[]).filter(t=>!STOP.has(t));}
export interface RetrievalHit { block:EvidenceBlock; score:number; lexicalScore:number; semanticScore?:number; method:'lexical'|'hybrid'|'semantic' }
interface Posting { block:EvidenceBlock; terms:Map<string,number>; length:number }
/** Per-source immutable postings are reused between keystrokes and notebook title changes. */
export class EvidenceIndex {
  private cache=new Map<string,{revision:string;title:string;postings:Posting[]}>();
  private postings:Posting[]=[];private frequencies=new Map<string,number>();private average=1;
  readonly stats={rebuiltSources:0,queries:0};
  constructor(private readonly passages:(source:Source)=>EvidenceBlock[]=evidenceBlocks){}
  update(sources:readonly Source[]):void {
    const next=new Map<string,{revision:string;title:string;postings:Posting[]}>();
    for(const source of sources){if(source.status!=='ready')continue;const revision=sourceRevision(source),old=this.cache.get(source.id);
      if(old?.revision===revision){next.set(source.id,old.title===source.title?old:{...old,title:source.title,postings:old.postings.map(p=>({...p,block:{...p.block,sourceTitle:source.title}}))});continue;}
      const postings=this.passages(source).map(block=>{const terms=new Map<string,number>();const tokens=retrievalTerms(block.quote);for(const term of tokens)terms.set(term,(terms.get(term)||0)+1);return{block,terms,length:tokens.length};});
      next.set(source.id,{revision,title:source.title,postings});this.stats.rebuiltSources++;
    }
    this.cache=next;this.postings=[...next.values()].flatMap(x=>x.postings).slice(0,20000);this.frequencies=new Map();
    for(const p of this.postings)for(const term of p.terms.keys())this.frequencies.set(term,(this.frequencies.get(term)||0)+1);
    this.average=this.postings.reduce((n,p)=>n+p.length,0)/this.postings.length||1;
  }
  get blocks():EvidenceBlock[]{return this.postings.map(p=>p.block);}
  search(query:string,limit=12):RetrievalHit[]{
    this.stats.queries++;const terms=[...new Set(retrievalTerms(query))];if(!terms.length)return[];const count=this.postings.length;
    return this.postings.map(p=>{let score=0;for(const term of terms){const tf=p.terms.get(term)||0;if(!tf)continue;const df=this.frequencies.get(term)||0;const idf=Math.log(1+(count-df+0.5)/(df+0.5));score+=idf*tf*2.2/(tf+1.2*(0.25+0.75*p.length/this.average));}return{block:p.block,score,lexicalScore:score,method:'lexical' as const};}).filter(h=>h.score>0).sort((a,b)=>b.score-a.score||a.block.sourceId.localeCompare(b.block.sourceId)||a.block.start-b.block.start).slice(0,Math.max(1,Math.min(100,limit)));
  }
}
/** RRF combines rank positions, not incomparable cosine and BM25 scales. */
export function hybridRanks(lexical:RetrievalHit[],semantic:{block:EvidenceBlock;score:number}[],limit=12):RetrievalHit[]{
  const hits=new Map<string,RetrievalHit>();const key=(b:EvidenceBlock)=>`${b.sourceId}:${b.id}`;
  lexical.forEach((h,i)=>hits.set(key(h.block),{...h,score:1/(60+i+1)}));
  semantic.filter(h=>Number.isFinite(h.score)&&h.score>=0.2).forEach((h,i)=>{const old=hits.get(key(h.block));hits.set(key(h.block),{block:h.block,score:(old?.score||0)+1/(60+i+1),lexicalScore:old?.lexicalScore||0,semanticScore:h.score,method:old?'hybrid':'semantic'});});
  return[...hits.values()].sort((a,b)=>b.score-a.score||b.lexicalScore-a.lexicalScore||a.block.sourceId.localeCompare(b.block.sourceId)||a.block.start-b.block.start).slice(0,limit);
}
export function cosine(a:readonly number[],b:readonly number[]):number {
  if(!a.length||a.length!==b.length)return 0;let dot=0,an=0,bn=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))return 0;dot+=a[i]*b[i];an+=a[i]*a[i];bn+=b[i]*b[i];}return an&&bn?dot/Math.sqrt(an*bn):0;
}
