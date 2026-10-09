import type {EvidenceBlock,Source} from '../types';
import {sourceRevision,textDigest} from './evidence';
import {sourceSentences,segmentSource} from './sourceUnits';
import {learningContentRanges} from './sourceContent';
import {retrievalTerms,type RetrievalHit} from './retrieval';

const PAGE=/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm;
const LEADER=/(?:\.[ \t]*){4,}/;
const PUBLICATION=/^(?:independent learning resource\b|original explanations,? diagrams\b|(?:complete |comprehensive )?(?:study guide|cram notes)\b|(?:all rights reserved|copyright|isbn|issn)\b|(?:https?:\/\/|www\.)\S+\s*$)/i;
const TABLE_HEADER=/^(?:field\s+(?:what to understand|description|meaning)|(?:sdk )?client\s+responsibility\s+typical operation|term\s+(?:definition|meaning)|service\s+(?:purpose|description)|(?:chapter|section)\s+(?:title|page))$/i;
const words=(text:string)=>text.match(/[\p{L}\p{N}]+/gu)??[];
const captions=(text:string)=>/^\uFEFF?WEBVTT\b/.test(text)||/^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(text);
const hasAnswerChoices=(text:string)=>(text.match(/(?:^|\n)\s*[A-F][.)]\s+/g)?.length??0)>=2;
/** This only rejects structural furniture, never decides whether a claim is true.
 * Short definitions, lists, code and table rows are preserved when contextualized. */
export function isUsefulAsterPassage(text:string,includeExercises=false):boolean {
 const value=text.trim(),code=/^\s*(?:```|~~~)/m.test(value);if(value.length<18||words(value).length<3||!code&&(LEADER.test(value)||PUBLICATION.test(value)||TABLE_HEADER.test(value)||!includeExercises&&(hasAnswerChoices(value)||/^(?:M\d+|\d+\.\d+)\s+/.test(value)&&/\?/.test(value))))return false;
 if(/^\[\d+\](?:\s|$)/.test(value)||/^(?:chapter|section|part)\s+\d+(?:\s*[:.\-–—])?\s*[^.!?\n]{0,110}$/i.test(value)||/^(?:child|node)\s*\d*\s*[:：]/i.test(value))return false;
 // Avoid treating a title or a diagram's isolated node as an explanation. Keep
 // compact facts with predicates, definitions, instructions or numeric conditions.
 return /[.!?](?:\s|$)|[:：=]|\b(?:is|are|was|were|means|refers|requires?|needs?|contains?|provides?|uses?|returns?|supports?|prevents?|allows?|must|should|can|cannot|may|does|do|not|has|have|when|if|because|before|after)\b/i.test(value)
  || /^(?:\d+[.)]\s*|[-*•]\s*|(?:add|check|choose|compare|connect|create|delete|draw|explain|inspect|keep|measure|open|read|record|remove|select|set|store|use|verify|write)\s)/i.test(value)
  || /\d\s*(?:%|ms\b|seconds?\b|minutes?\b|GB\b|MB\b)/i.test(value)
  || /^(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[a-z]+-[a-z-]+)\s+\S.{15,}/.test(value)
  || words(value).length>=22;
}
interface PageRange {start:number;end:number;kind:'page'|'slide'|'sheet'|'text';label?:string}
function fencedRanges(text:string):{start:number;end:number}[]{
 const ranges:{start:number;end:number}[]=[];let opened:{start:number;mark:string}|undefined;
 for(const match of text.matchAll(/^[ \t]*(`{3,}|~{3,})[^\r\n]*$/gm)){if(!opened)opened={start:match.index!,mark:match[1][0]};else if(match[1][0]===opened.mark){ranges.push({start:opened.start,end:match.index!+match[0].length});opened=undefined;}}
 if(opened)ranges.push({start:opened.start,end:text.length});return ranges;
}
function pageRanges(text:string):PageRange[]{
 const code=fencedRanges(text),markers=[...text.matchAll(PAGE)].filter(match=>!code.some(range=>range.start<=match.index!&&range.end>match.index!)),ranges:PageRange[]=[];
 if(!markers.length)return[{start:0,end:text.length,kind:'text'}];
 if(markers[0].index!>0)ranges.push({start:0,end:markers[0].index!,kind:'text'});
 markers.forEach((marker,index)=>ranges.push({start:marker.index!+marker[0].length,end:markers[index+1]?.index??text.length,kind:marker[1].toLowerCase() as PageRange['kind'],label:`${marker[1]} ${marker[2]}`}));return ranges;
}
function coverPage(text:string):boolean{
 if(text.length>2500)return false;
 const signals=[/\b(?:complete study guide|cram notes|study sections|practice questions)\b/i,/\b(?:edition|copyright|all rights reserved)\b/i,/\b(?:github\.com|written by|published by|blogs? by)\b/i,/\bindependent learning resource\b/i,/\b(?:original explanations|original diagrams|vector visuals)\b/i];
 return signals.filter(pattern=>pattern.test(text)).length>=3&&text.split(/\n/).filter(line=>line.trim()).filter(line=>words(line).length<=12).length>=6;
}
const edgeKey=(value:string)=>value.trim().replace(/\s+\d+\s*$/,'').replace(/\s+/g,' ').toLocaleLowerCase();
function paragraphSpans(text:string,page:PageRange):{start:number;end:number;sectionKey:string;quote:string}[]{
 const result:{start:number;end:number;sectionKey:string;quote:string}[]=[];let start:number|undefined,end=0;
 const add=(a:number,b:number)=>{while(a<b&&/\s/.test(text[a]))a++;while(b>a&&/\s/.test(text[b-1]))b--;if(a<b)result.push({start:a,end:b,sectionKey:`page-${page.start}`,quote:text.slice(a,b)});};
 const flush=()=>{if(start===undefined)return;const a=start,b=end;start=undefined;if(b-a<=1200){add(a,b);return;}
  let chunkStart=a,chunkEnd=a;
  for(const sentence of sourceSentences(text.slice(a,b),a)){
   if(sentence.end-chunkStart>1200&&chunkEnd>chunkStart){add(chunkStart,chunkEnd);chunkStart=sentence.start;}
   while(sentence.end-chunkStart>1200){const upper=chunkStart+1200,space=text.lastIndexOf(' ',upper),cut=space>chunkStart+600?space:upper;add(chunkStart,cut);chunkStart=cut;while(/\s/.test(text[chunkStart]))chunkStart++;}
   chunkEnd=sentence.end;
  }add(chunkStart,chunkEnd);
 };
 for(const match of text.slice(page.start,page.end).matchAll(/[^\r\n]*(?:\r?\n|$)/g)){
  if(!match[0])continue;const value=match[0].replace(/\r?\n$/,'');if(!value.trim()){flush();continue;}start??=page.start+match.index!;end=page.start+match.index!+value.length;
 }flush();return result;
}
/** Human-readable exact spans omit only clear document furniture. Questions,
 * choices, table headings, code and figure labels remain available for reading. */
export function sourceReaderContentRanges(source:Source):{start:number;end:number}[]{
 if(source.status!=='ready'||!source.text.trim())return[];
 if(captions(source.text))return[{start:0,end:source.text.length}];
 const text=source.text,pages=pageRanges(text),code=fencedRanges(text);
 const edgeOccurrences=new Map<string,Set<number>>();
 pages.forEach((page,index)=>{const rows=text.slice(page.start,page.end).split(/\r?\n/).filter(row=>row.trim());for(const row of [...rows.slice(0,2),...rows.slice(-2)]){if(row.length>140||/[.!?]$/.test(row.trim())||isUsefulAsterPassage(row)||!(/\b(?:study guide|cram notes|chapter|section|edition|report|manual|handbook|journal|newsletter|volume)\b|(?:www\.|github\.)|\s\d+\s*$/i.test(row)))continue;const key=edgeKey(row);if(!key||words(key).length<2)continue;const seen=edgeOccurrences.get(key)??new Set<number>();seen.add(index);edgeOccurrences.set(key,seen);}});
 const repeated=new Set([...edgeOccurrences].filter(([,positions])=>positions.size>=3).map(([key])=>key));
 const excluded=pages.filter((page,index)=>index===0&&!code.some(range=>range.start<page.end&&range.end>page.start)&&coverPage(text.slice(page.start,page.end)));
 const ignored=(value:string)=>LEADER.test(value)||PUBLICATION.test(value.trim())||repeated.has(edgeKey(value));
 const allowed=learningContentRanges(text,0,text.length);let allowedIndex=0;
 const segments=pages.flatMap(page=>paragraphSpans(text,page)).flatMap(segment=>{
  while(allowedIndex<allowed.length&&allowed[allowedIndex].end<=segment.start)allowedIndex++;
  const spans:typeof segment[]=[];for(let i=allowedIndex;i<allowed.length&&allowed[i].start<segment.end;i++){const start=Math.max(segment.start,allowed[i].start),end=Math.min(segment.end,allowed[i].end);if(end>start)spans.push({...segment,start,end,quote:text.slice(start,end)});}return spans;
 }).flatMap(segment=>{
  if(excluded.some(page=>segment.start>=page.start&&segment.end<=page.end))return[];
  // Remove whole furniture lines, splitting around them. Never splice a quote.
  const spans:{start:number;end:number}[]=[];let start:number|undefined,end=0;
  for(const line of text.slice(segment.start,segment.end).matchAll(/[^\r\n]+/g)){
   const a=segment.start+line.index!,b=a+line[0].length;
   if(!code.some(range=>a>=range.start&&a<range.end)&&ignored(line[0])){if(start!==undefined)spans.push({start,end});start=undefined;continue;}
   start??=a;end=b;
  }if(start!==undefined)spans.push({start,end});
  return spans.map(span=>({...segment,...span,quote:text.slice(span.start,span.end)}));
 });
 return segments.map(({start,end})=>({start,end}));
}
/** Aster's index is derived, disposable and separate from saved mission inventories.
 * Every context window remains one exact contiguous span of the original source. */
export function asterContextBlocks(source:Source,options:{includeExercises?:boolean}={}):EvidenceBlock[]{
 if(source.status!=='ready'||!source.text.trim())return[];
 const text=source.text,isCaption=captions(text),pages:PageRange[]=isCaption?[{start:0,end:text.length,kind:'text'}]:pageRanges(text),revision=sourceRevision(source);
 const segments=isCaption?segmentSource(text,1200):sourceReaderContentRanges(source).map(({start,end})=>({start,end,quote:text.slice(start,end),sectionKey:`page-${pages.find(page=>start>=page.start&&start<page.end)?.start??0}`}));
 const ranges:{start:number;end:number;sectionKey:string}[]=[];
 let pending:{start:number;end:number;sectionKey:string}|undefined;
 const flush=()=>{if(pending&&isUsefulAsterPassage(text.slice(pending.start,pending.end),options.includeExercises))ranges.push(pending);pending=undefined;};
 for(const segment of segments){
  const useful=isUsefulAsterPassage(segment.quote,options.includeExercises);
  if(!useful){flush();continue;}
  // Two adjacent explanations usually provide enough referents and conditions.
  // Do not merge separated topics, omitted furniture, pages or subtitle cues.
  if(pending&&pending.sectionKey===segment.sectionKey&&segment.end-pending.start<=1200&&!text.slice(pending.end,segment.start).replace(/\[\d+\]/g,'').trim())pending.end=segment.end;
  else{flush();pending={start:segment.start,end:segment.end,sectionKey:segment.sectionKey};}
 }flush();
 const lineStarts=[0,...[...text.matchAll(/\n/g)].map(match=>match.index!+1)],cues=[...text.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)];let cueIndex=-1;
 const lineAt=(position:number)=>{let low=0,high=lineStarts.length;while(low<high){const mid=(low+high)>>>1;if(lineStarts[mid]<=position)low=mid+1;else high=mid;}return low;};
 return ranges.map(({start,end})=>{const page=pages.find(item=>start>=item.start&&start<item.end)!;const lineStart=lineAt(start),lineEnd=lineAt(end-1);while(cueIndex+1<cues.length&&cues[cueIndex+1].index!<=start)cueIndex++;const timestamp=cues[cueIndex]?.[1];
  return{id:`aster-${textDigest(source.id).slice(0,16)}-${revision.slice(0,20)}-${start}-${end}`,sourceId:source.id,sourceTitle:source.title,sourceRevision:revision,start,end,quote:text.slice(start,end),locator:page.kind!=='text'?{kind:page.kind,label:`${page.label} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:timestamp?{kind:'timestamp',label:`${timestamp} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}};
 });
}
const NEUTRAL=new Set('what which why who when where how can could would should do does did please tell explain describe about me my you your say said mean means meaning know want give get show help understand learn learning source sources document documents file files material materials notebook book guide uploaded upload provided attached content contains covered cover overview summary summarize summarise main key topics ideas points takeaways this that these those it i we us our teach teaches teaching pdf pdfs epub slides recording recordings text texts all whole overall everything here thanks difference differences between versus vs work works'.split(' '));
export function asterQuery(question:string):{terms:string[];overview:boolean}{
 const terms=[...new Set(retrievalTerms(question).filter(term=>!NEUTRAL.has(term)))];
 const overview=/\b(?:overview|summary|summariz[es]?|summaris[es]?|main (?:ideas|topics|points)|key (?:ideas|topics|points|takeaways)|what.*(?:about|cover|learn|teach|know|contain|inside|in this|in the)|(?:explain|describe|tell me about|help me understand) (?:this|the) (?:source|document|file|material|book|guide|notebook))\b/i.test(question)&&terms.length===0;
 return{terms,overview};
}
export function asterQuestionNeedsExercise(question:string):boolean{return /\b(?:question|exercise|practice|quiz|assessment|answer|option|choice)s?\b|\b(?:M\d+|\d+\.\d+)\b/i.test(question);}
/** Only unambiguous short follow-ups borrow the preceding topic. A new subject
 * always starts a fresh search, and prior generated answers are never evidence. */
export function asterTopicQuestion(question:string,previousQuestion?:string):{topicQuestion:string;previousQuestion?:string}{
 const current=question.trim(),previous=typeof previousQuestion==='string'?previousQuestion.trim():'';
 const followUp=/^(?:please\s+)?(?:why|how|why is that|how so|what does (?:that|it) mean|(?:can you\s+)?(?:give|show)(?: me)? (?:an?|one|another) example|(?:explain|describe)(?: that| it)?(?: more| again| simply| in simpler terms)|tell me more|(?:make|say) (?:that|it) simpler|what about (?:the )?(?:limits|limitations|exceptions|conditions|risks|examples))(?:\s+please)?[.!?]*$/i.test(current);
 if(!followUp||!previous||previous.length>500||current.length>120)return{topicQuestion:current};
 const topicQuestion=`${previous.slice(0,Math.max(0,497-current.length))}\n${current}`;
 return{topicQuestion,previousQuestion:previous};
}
const similarity=(a:string,b:string)=>{const left=new Set(retrievalTerms(a)),right=new Set(retrievalTerms(b));let common=0;for(const word of left)if(right.has(word))common++;return common/Math.max(1,Math.min(left.size,right.size));};
/** Prefer distinct explanations over repeats of the same header/example. */
export function diverseAsterHits(hits:RetrievalHit[],limit:number):RetrievalHit[]{
 const selected:RetrievalHit[]=[];
 for(const hit of hits){if(selected.some(other=>other.block.sourceId===hit.block.sourceId&&(other.block.start<hit.block.end&&hit.block.start<other.block.end||similarity(other.block.quote,hit.block.quote)>0.8)))continue;selected.push(hit);if(selected.length===limit)break;}return selected;
}
/** Rerank by question coverage and useful surrounding explanation. A short label
 * must not outrank a paragraph that explains both sides of a comparison. */
export function rankAsterLexical(hits:RetrievalHit[],terms:string[]):RetrievalHit[]{
 return hits.map(hit=>{const text=hit.block.quote.toLocaleLowerCase(),tokens=new Set(retrievalTerms(text)),matched=terms.filter(term=>tokens.has(term)).length;
  const body=hit.block.quote.length,context=body<80?0.35:body<160?0.65:Math.min(1.35,0.85+body/1600);
  const coverage=matched/Math.max(1,terms.length);let pairs=0;for(let i=0;i<terms.length-1;i++)if(text.includes(`${terms[i]} ${terms[i+1]}`))pairs++;
  const opening=sourceSentences(hit.block.quote)[0]?.quote.toLocaleLowerCase()??'',openingTerms=new Set(retrievalTerms(opening));
  const lead=terms.some(term=>openingTerms.has(term))?1.4:1;
  const explanation=/\b(?:is|are|means|turns|prepares|combines|finds|compares|requires?|needs?|contains?|provides?|uses?|returns?|supports?|prevents?|allows?|must|should|can|cannot|may|does|do|not|has|have|when|if|because)\b[^.!?]*[.!?](?:\s|$)/i.test(hit.block.quote)?1.4:0.7;
  const score=hit.score*context*(0.4+coverage*1.8+pairs*0.35)*lead*explanation;return{...hit,score,lexicalScore:score};
 }).sort((a,b)=>b.score-a.score||a.block.sourceId.localeCompare(b.block.sourceId)||a.block.start-b.block.start);
}
/** An overview is a coverage sample, not a keyword search for the word "source".
 * Stratify across all readable sources and all their content, including the end. */
export function asterOverview(blocks:EvidenceBlock[],limit:number):RetrievalHit[]{
 const bySource=new Map<string,EvidenceBlock[]>();for(const block of blocks){if(block.quote.length<100||/choose before reading|select one answer|(?:^|\n)\s*(?:M\d+|\d+\.\d+)\s*[—–-]|(?:^|\n)\s*\d+\.\d+\s+[^\n]*\?/i.test(block.quote))continue;const group=bySource.get(block.sourceId)??[];group.push(block);bySource.set(block.sourceId,group);}
 if(!bySource.size)for(const block of blocks){const group=bySource.get(block.sourceId)??[];group.push(block);bySource.set(block.sourceId,group);}
 const groups=[...bySource.values()],selected:EvidenceBlock[]=[];
 for(let round=0;selected.length<limit&&round<limit;round++)for(const group of groups){if(selected.length>=limit)break;const slots=Math.max(1,Math.ceil(limit/groups.length)),start=Math.floor(round*group.length/slots),end=Math.max(start+1,Math.floor((round+1)*group.length/slots));if(start>=group.length)continue;
  const candidates=group.slice(start,end);const best=candidates.sort((a,b)=>Math.min(b.quote.length,700)-Math.min(a.quote.length,700)||a.start-b.start).find(block=>!selected.includes(block)&&!selected.some(previous=>similarity(previous.quote,block.quote)>0.8));if(best)selected.push(best);
 }
 return selected.map(block=>({block,score:1,lexicalScore:0,method:'lexical'}));
}
