import type {EvidenceBlock,EvidenceReference,Source} from '../types';
import {sourceRevision,textDigest} from './evidence';
import {sourceSentences,segmentSource} from './sourceUnits';
import {learningContentRanges} from './sourceContent';
import {retrievalTerms,type RetrievalHit} from './retrieval';

const PAGE=/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm;
const LEADER=/(?:\.[ \t]*){4,}/;
const PUBLICATION=/^(?:independent learning resource\b|original explanations,? diagrams\b|(?:complete |comprehensive )?(?:study guide|cram notes)\b|(?:all rights reserved|copyright|isbn|issn)\b|(?:https?:\/\/|www\.)\S+\s*$)/i;
const words=(text:string)=>text.match(/[\p{L}\p{N}]+/gu)??[];
const captions=(text:string)=>/^\uFEFF?WEBVTT\b/.test(text)||/^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(text);
const hasAnswerChoices=(text:string)=>(text.match(/(?:^|\n)\s*[A-F][.)]\s+/g)?.length??0)>=2;
/** Column labels describe the layout, not a claim. PDF extraction commonly
 * flattens their cells into one line; recognize their grammatical structure
 * rather than one document's exact header text. */
function tableHeader(text:string):boolean{
 const value=text.trim().replace(/^\|+|\|+$/g,'').replace(/[|\t]+/g,' ').replace(/\s+/g,' ').trim();
 if(value.length>180||words(value).length>26||/[.!?]$|[=:{}]/.test(value)||/\b(?:is|are|was|were|means|supports?|requires?|provides?|uses?|contains?|allows?|returns?|depends?|must|should|cannot)\b/i.test(value.replace(/\b(?:when|how) to (?:use|choose)\b/gi,'')))return false;
 return /^(?:(?:sdk|api|aws)\s+)?(?:services?|components?|fields?|parameters?|clients?|methods?|operations?|features?|terms?|concepts?|categories|category|options?|types?|resources?|tools?|metrics?|controls?|patterns?|techniques?|models?|stages?|steps?|tasks?|capabilities|capability|interfaces?|protocols?|layers?|chapters?|sections?|names?|identifiers?)\b/i.test(value)
  &&/\b(?:what (?:it |they )?(?:does|do)|what to understand|when to (?:use|choose)|description|definition|meaning|responsibility|operation|purpose|role|scenario|use case|example|clue|notes?|constraints?|limits?|benefits?|risks?|inputs?|outputs?|default|values?|units?|cost|latency|title|page)\b/i.test(value);
}
const publicationContext=(text:string)=>/^(?:this|the)\s+[^.!?\n]{0,90}\b(?:guide|edition|book|document|manual|report|publication)\b[^.!?\n]{0,70}\b(?:prepared|published|written|compiled|produced)\b/i.test(text)
 ||/^(?:the|these)\s+(?:links|references)\s+(?:below|above|listed|following)\b/i.test(text)
 ||/\b(?:PDF bookmarks|contents and numbered[^.!?\n]{0,50}clickable|chapter navigation)\b/i.test(text)
 ||/^(?:start|begin) with\b/i.test(text)&&/\bsections? \d+/.test(text)&&/\bfinish with\b/i.test(text);
/** This only rejects structural furniture, never decides whether a claim is true.
 * Short definitions, lists, code and table rows are preserved when contextualized. */
export function isUsefulAsterPassage(text:string,includeExercises=false):boolean {
 const value=text.trim(),code=/^\s*(?:```|~~~)/m.test(value);if(value.length<18||words(value).length<3||!code&&(LEADER.test(value)||PUBLICATION.test(value)||publicationContext(value)||tableHeader(value)||!includeExercises&&(hasAnswerChoices(value)||/^(?:M\d+|\d+\.\d+)\s+/.test(value)&&/\?/.test(value))))return false;
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
interface ContextRange {start:number;end:number}
interface AsterEvidenceBlock extends EvidenceBlock {contextReferences?:EvidenceReference[]}
export function asterPassageContext(block:EvidenceBlock):EvidenceReference[]{return (block as AsterEvidenceBlock).contextReferences??[];}
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
/** Search focused explanations before attaching their surrounding context. Mixing
 * unrelated adjacent paragraphs dilutes both semantic and lexical relevance.
 * These disposable spans never change saved mission inventories or source text. */
export function asterContextBlocks(source:Source,options:{includeExercises?:boolean;overview?:boolean}={}):EvidenceBlock[]{
 if(source.status!=='ready'||!source.text.trim())return[];
 const text=source.text,isCaption=captions(text),pages:PageRange[]=isCaption?[{start:0,end:text.length,kind:'text'}]:pageRanges(text),revision=sourceRevision(source);
 let segments=isCaption?segmentSource(text,1200):sourceReaderContentRanges(source).map(({start,end})=>({start,end,quote:text.slice(start,end),sectionKey:`page-${pages.find(page=>start>=page.start&&start<page.end)?.start??0}`}));
 const tableContexts=new Map<number,ContextRange>();
 // Markdown/TSV tables often have no blank lines. Split their physical rows
 // without rewriting cells; a flattened PDF table keeps its wrapped row spans.
 if(!isCaption)segments=segments.flatMap(segment=>{
  const lines=[...segment.quote.matchAll(/[^\r\n]+/g)].map(match=>({start:segment.start+match.index!,end:segment.start+match.index!+match[0].length,quote:match[0],sectionKey:segment.sectionKey}));
  if(lines.length<2||!tableHeader(lines[0].quote))return[segment];
  const body=lines.slice(1).filter(line=>!/^\s*\|?[\s|:\-]+\|?\s*$/.test(line.quote)&&words(line.quote).length>0);
  if(!body.length)return[lines[0]];
  if(body.every(line=>(line.quote.match(/\||\t/g)?.length??0)>=2)){
   const rows=body.filter(row=>row.quote.split(/[|\t]/).filter(cell=>cell.trim()).length>=2&&words(row.quote).length>=2&&!tableHeader(row.quote));
   for(const row of rows)tableContexts.set(row.start,{start:lines[0].start,end:lines[0].end});
   return[lines[0],...rows];
  }
  // With flattened cells there is no reliable per-line row boundary. Retain
  // the complete factual body rather than inventing cell/row associations.
  const row={...segment,start:body[0].start,end:body.at(-1)!.end,quote:text.slice(body[0].start,body.at(-1)!.end)};
  if(words(row.quote).length>=8)tableContexts.set(row.start,{start:lines[0].start,end:lines[0].end});
  return[lines[0],row];
 });
 if(!isCaption)for(let i=0;i<segments.length;i++){
  const header=segments[i];if(!tableHeader(header.quote))continue;
  const rows:typeof segments=[];let previous=header;
  for(let j=i+1;j<segments.length;j++){
   const row=segments[j],value=row.quote.trim(),count=words(value).length;
   if(row.sectionKey!==header.sectionKey||text.slice(previous.end,row.start).trim()||tableHeader(value)||count<5||count>90||value.length>1000||/^\s*(?:```|~~~|[-*•]|\d+[.)]\s)/.test(value))break;
   // Flattened PDF rows usually omit terminal punctuation. A sentence with a
   // full stop may be prose introducing a new section, so don't infer columns.
   if(!/[|\t]/.test(value)&&/[.!?]$/.test(value))break;
   rows.push(row);previous=row;
  }
  if(rows.length>=2)for(const row of rows)tableContexts.set(row.start,{start:header.start,end:header.end});
 }
 const sectionContexts=new Map<number,ContextRange>();
 for(const header of new Map([...tableContexts.values()].map(range=>[range.start,range])).values()){
  const at=segments.findIndex(segment=>segment.start===header.start);if(at<0)continue;
  for(let i=at-1;i>=0&&segments[i].sectionKey===segments[at].sectionKey;i--){
   const segment=segments[i],value=segment.quote.trim();
   if(value.length<=180&&words(value).length<=18&&!/[.!?:]$/.test(value)&&!isUsefulAsterPassage(value)){
    if(value.length<=140&&/^(?:#{1,6}\s+|\d{1,3}(?:\.\d+)*[.)]?\s+)[\p{L}]/u.test(value))sectionContexts.set(header.start,{start:segment.start,end:segment.end});
    break; // Never search past a closer heading whose structure is uncertain.
   }
  }
 }
 const ranges:typeof segments=[];
 for(const segment of segments){
  if(!tableContexts.has(segment.start)&&!isUsefulAsterPassage(segment.quote,options.includeExercises))continue;
  const previous=ranges.at(-1);
  // An explicit overview samples broad context, rather than scoring a query
  // against these combined topics. Preserve that document-wide coverage.
  if(options.overview&&previous&&previous.sectionKey===segment.sectionKey&&segment.end-previous.start<=1200&&!text.slice(previous.end,segment.start).trim())ranges[ranges.length-1]={...previous,end:segment.end,quote:text.slice(previous.start,segment.end)};
  else ranges.push(segment);
 }
 const lineStarts=[0,...[...text.matchAll(/\n/g)].map(match=>match.index!+1)],cues=[...text.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)];let cueIndex=-1;
 const lineAt=(position:number)=>{let low=0,high=lineStarts.length;while(low<high){const mid=(low+high)>>>1;if(lineStarts[mid]<=position)low=mid+1;else high=mid;}return low;};
 const blockFor=({start,end}:ContextRange):EvidenceBlock=>{const page=pages.find(item=>start>=item.start&&start<item.end)!;const lineStart=lineAt(start),lineEnd=lineAt(end-1);while(cueIndex+1<cues.length&&cues[cueIndex+1].index!<=start)cueIndex++;const timestamp=cues[cueIndex]?.[1];
  return{id:`aster-${textDigest(source.id).slice(0,16)}-${revision.slice(0,20)}-${start}-${end}`,sourceId:source.id,sourceTitle:source.title,sourceRevision:revision,start,end,quote:text.slice(start,end),locator:page.kind!=='text'?{kind:page.kind,label:`${page.label} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:timestamp?{kind:'timestamp',label:`${timestamp} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}:{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd}};
 };
 return ranges.map(range=>{const block:AsterEvidenceBlock=blockFor(range),context=tableContexts.get(range.start);if(context){const section=sectionContexts.get(context.start);block.contextReferences=[...(section?[blockFor(section)]:[]),blockFor(context)];}return block;});
}
/** A relevant paragraph can depend on a preceding referent, following condition,
 * list or exercise choices. Add only those connected neighbors AFTER ranking;
 * never use the larger quote as a semantic search target or cross omitted text. */
export function contextualizeAsterHits(hits:RetrievalHit[],blocks:EvidenceBlock[],sources:readonly Source[]):RetrievalHit[]{
 const bySource=new Map<string,EvidenceBlock[]>(),sourceById=new Map(sources.map(source=>[source.id,source])),relevant=new Set(hits.map(hit=>hit.block.id));
 for(const block of blocks){const list=bySource.get(block.sourceId)??[];list.push(block);bySource.set(block.sourceId,list);}
 const positions=new Map<string,number>();for(const list of bySource.values())list.forEach((block,index)=>positions.set(block.id,index));
 const sharedTopic=(a:string,b:string)=>{const terms=new Set(asterQuery(a).terms);return asterQuery(b).terms.some(term=>terms.has(term));};
 const connected=(before:EvidenceBlock,after:EvidenceBlock,text:string)=>!(asterPassageContext(before).length&&asterPassageContext(after).length)&&before.sourceRevision===after.sourceRevision&&before.locator.kind!=='timestamp'&&after.locator.kind!=='timestamp'&&after.start>=before.end&&!text.slice(before.end,after.start).trim()&&(
  /:\s*$/.test(before.quote)||/^(?:it|its|they|their|this|that|these|those|such|otherwise)\b/i.test(after.quote)
  ||/^(?:when|if|unless|except|only|however|instead|for example|for instance|in contrast|by contrast)\b/i.test(after.quote)&&sharedTopic(before.quote,after.quote)
  ||/\?\s*$/.test(before.quote)&&hasAnswerChoices(after.quote)
  // Two adjacent paragraphs that independently matched the question may form
  // one answer context. This cannot rescue a below-threshold semantic match.
  ||relevant.has(before.id)&&relevant.has(after.id)&&sharedTopic(before.quote,after.quote)
 );
 return hits.map(hit=>{
  const source=sourceById.get(hit.block.sourceId),list=bySource.get(hit.block.sourceId),position=positions.get(hit.block.id);if(!source||!list||position===undefined)return hit;
  let first=position,last=position;
  while(first>0&&list[last].end-list[first-1].start<=1200&&connected(list[first-1],list[first],source.text))first--;
  while(last+1<list.length&&list[last+1].end-list[first].start<=1200&&connected(list[last],list[last+1],source.text))last++;
  if(first===last)return hit;
  const start=list[first].start,end=list[last].end,lineStart=list[first].locator.lineStart!,lineEnd=list[last].locator.lineEnd!,base=list[first];
  const contextReferences=[...new Map(list.slice(first,last+1).flatMap(asterPassageContext).map(ref=>[`${ref.sourceId}:${ref.start}:${ref.end}`,ref])).values()].filter(ref=>ref.start<start||ref.end>end).reduce<EvidenceReference[]>((refs,ref)=>refs.reduce((size,item)=>size+item.quote.length,0)+ref.quote.length<=600?[...refs,ref]:refs,[]);
  return {...hit,block:{...base,contextReferences,id:`aster-${textDigest(source.id).slice(0,16)}-${base.sourceRevision.slice(0,20)}-${start}-${end}`,start,end,quote:source.text.slice(start,end),locator:{...base.locator,lineStart,lineEnd,label:base.locator.kind==='text'?`Lines ${lineStart}–${lineEnd}`:base.locator.label.replace(/lines \d+–\d+$/,`lines ${lineStart}–${lineEnd}`)}}};
 });
}
const NEUTRAL=new Set('what which why who when where how can could would should do does did please tell explain describe about me my you your say said mean means meaning know want give get show help understand learn learning source sources document documents file files material materials notebook book guide study uploaded upload provided attached content contains covered cover overview summary summarize summarise main key topics ideas points takeaways this that these those it i we us our teach teaches teaching pdf pdfs epub slides recording recordings text texts all whole overall everything here thanks difference differences between versus vs work works more simply simpler clearly slowly fully again detail them they'.split(' '));
export function asterQuery(question:string):{terms:string[];overview:boolean}{
 const terms=[...new Set(retrievalTerms(question.replace(/\bbig picture\b/gi,'')).filter(term=>!NEUTRAL.has(term)))];
 const overview=/\b(?:overview|big picture|summary|summariz[es]?|summaris[es]?|main (?:ideas|topics|points)|key (?:ideas|topics|points|takeaways)|what.*(?:about|cover|learn|teach|know|contain|inside|in this|in the)|(?:explain|describe|tell me about|help me understand) (?:this|the|these|those|my|our) (?:sources?|documents?|files?|materials?|books?|guides?|notebooks?))\b/i.test(question)&&terms.length===0;
 return{terms,overview};
}
export function asterQuestionNeedsExercise(question:string):boolean{return /\b(?:question|exercise|practice|quiz|assessment|answer|option|choice)s?\b|\b(?:M\d+|\d+\.\d+)\b/i.test(question);}
/** Only unambiguous short follow-ups borrow the preceding topic. A new subject
 * always starts a fresh search, and prior generated answers are never evidence. */
export function asterTopicQuestion(question:string,previousQuestion?:string):{topicQuestion:string;previousQuestion?:string}{
 const current=question.trim(),previous=typeof previousQuestion==='string'?previousQuestion.trim():'';
 const followUp=/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:why|how|why is that|how so|what does (?:that|it) mean|what do you mean(?: by (?:that|it|this))?|(?:give|show)(?: me)? (?:an?|one|another) example|(?:explain|describe|simplify)(?: that| it| them| this)(?: more(?: simply| clearly| slowly| fully)?| again| simply| in simpler terms| in more detail| step by step)?|(?:explain|describe|simplify)(?: more(?: simply| clearly| slowly| fully)?| again| simply| in simpler terms| in more detail)|simplify|more|tell me more|(?:teach|show)(?: me)? (?:that|it|this) step by step|(?:make|say) (?:that|it) simpler|(?:how|why) are (?:they|these|those|the two) different|what is the difference (?:between them|between the two)|which (?:one|of them) should I (?:use|choose|pick)|what about (?:the )?(?:first one|second one|third one|other one|limits|limitations|exceptions|conditions|risks|examples))(?:\s+please)?[.!?]*$/i.test(current);
 if(!followUp||!previous||previous.length>500||current.length>120)return{topicQuestion:current};
 const topicQuestion=`${previous.slice(0,Math.max(0,497-current.length))}\n${current}`;
 return{topicQuestion,previousQuestion:previous};
}
const similarity=(a:string,b:string)=>{const left=new Set(retrievalTerms(a)),right=new Set(retrievalTerms(b));let common=0;for(const word of left)if(right.has(word))common++;return common/Math.max(1,Math.min(left.size,right.size));};
/** Prefer distinct explanations over repeats of the same header/example. */
export function diverseAsterHits(hits:RetrievalHit[],limit:number):RetrievalHit[]{
 const selected:RetrievalHit[]=[];
 for(const hit of hits){if(selected.some(other=>{
  if(other.block.sourceId!==hit.block.sourceId)return false;
  if(other.block.start<hit.block.end&&hit.block.start<other.block.end)return true;
  const tableContext=asterPassageContext(hit.block),otherContext=asterPassageContext(other.block);
  // Near-identical rows may differ in the one value the learner is comparing.
  // Deduplicate a table only when its text AND column/section meanings agree.
  if(tableContext.length||otherContext.length)return hit.block.quote===other.block.quote&&JSON.stringify(tableContext.map(ref=>ref.quote))===JSON.stringify(otherContext.map(ref=>ref.quote));
  return similarity(other.block.quote,hit.block.quote)>0.8;
 }))continue;selected.push(hit);if(selected.length===limit)break;}return selected;
}
const termRoot=(term:string)=>term.length>4&&term.endsWith('ies')?`${term.slice(0,-3)}y`:term.length>3&&term.endsWith('s')&&!term.endsWith('ss')?term.slice(0,-1):term;
export function asterSearchTerms(terms:string[]):string[]{return [...new Set(terms.flatMap(term=>[term,termRoot(term)]))];}
/** Column labels can locate factual rows, but never become answer candidates.
 * Their weight is deliberately below direct matches in the row's own text. */
export function asterTableContextHits(blocks:EvidenceBlock[],terms:string[],existing:RetrievalHit[]):RetrievalHit[]{
 const found=new Set(existing.map(hit=>hit.block.id)),wanted=[...new Set(terms.map(termRoot))];
 return blocks.flatMap(block=>{
  if(found.has(block.id))return[];
  const labels=new Set(asterPassageContext(block).flatMap(ref=>retrievalTerms(ref.quote)).map(termRoot)),matched=wanted.filter(term=>labels.has(term)).length;
  if(!matched)return[];const score=0.8*matched/Math.max(1,wanted.length);
  return[{block,score,lexicalScore:score,method:'lexical' as const}];
 });
}
/** Rerank by question coverage and useful surrounding explanation. A short label
 * must not outrank a paragraph that explains both sides of a comparison. */
export function rankAsterLexical(hits:RetrievalHit[],terms:string[]):RetrievalHit[]{
 return hits.map(hit=>{const text=hit.block.quote.toLocaleLowerCase(),tokens=new Set([...retrievalTerms(text),...asterPassageContext(hit.block).flatMap(ref=>retrievalTerms(ref.quote))].map(termRoot)),matched=terms.filter(term=>tokens.has(termRoot(term))).length;
  const body=hit.block.quote.length,context=body<80?0.35:body<160?0.65:Math.min(1.35,0.85+body/1600);
  const coverage=matched/Math.max(1,terms.length);let pairs=0;for(let i=0;i<terms.length-1;i++)if(text.includes(`${terms[i]} ${terms[i+1]}`))pairs++;
  const opening=sourceSentences(hit.block.quote)[0]?.quote.toLocaleLowerCase()??'',openingTerms=new Set(retrievalTerms(opening));
  const lead=terms.some(term=>openingTerms.has(term))?1.4:1;
  const explanation=asterPassageContext(hit.block).length||/\b(?:is|are|means|turns|prepares|combines|finds|compares|requires?|needs?|contains?|provides?|uses?|returns?|supports?|prevents?|allows?|must|should|can|cannot|may|does|do|not|has|have|when|if|because)\b[^.!?]*[.!?](?:\s|$)/i.test(hit.block.quote)?1.4:0.7;
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
