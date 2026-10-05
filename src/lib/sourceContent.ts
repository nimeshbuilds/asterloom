/** Structural exclusions for automatic learning, not a factual or semantic quality score.
 * Original text is never rewritten: all ranges refer to its exact UTF-16 offsets. */
export interface SourceContentExclusion {start:number;end:number;kind:'cover'|'publication'|'navigation'|'pagination'|'running-header';reason:string}
interface Line {text:string;start:number;end:number;page:number;protected:boolean}
const PAGE=/^\[(?:Page|Slide|Sheet):?\s+[^\]\n]+\]\s*$/;
const URL=/(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:com|org|net|edu|gov|ai|io)\b/iu;
const BYLINE=/\b(?:blogs?|written|prepared|published|authored|illustrated|edited)\s+by\s+/i;
const SERIES=/\b(?:part|volume|issue)\s+\d+\s+(?:of|\/)\s+\d+\b/i;
const PROMOTIONAL=/\b(?:a|an)\s+(?:data[- ]backed|evidence[- ]driven|comprehensive|practical|complete|definitive|illustrated)\s+(?:investigation|guide|report|overview|introduction)\b/i;
const DATE=/\b(?:(?:early|late|spring|summer|autumn|fall|winter)\s+20\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:\d{1,2},?\s+)?(?:19|20)\d{2})\b/i;
const NAV='(?:home|about(?: us)?|contents|table of contents|next|previous|back|menu|search|contact(?: us)?|subscribe|sign in|log in|privacy(?: policy)?|terms(?: of use)?)';
const NAV_ROW=new RegExp(`^${NAV}(?:\\s*(?:[|·›»/]|[-–—])\\s*${NAV})+\\s*$`,'i');
const cache=new Map<string,readonly SourceContentExclusion[]>();
const clean=(value:string)=>value.replace(/^#{1,6}\s+|\s*#+$/g,'').trim();
/** Complete statements, definitions, numeric findings and instructions are not disposable headers. */
function hasBodyStatement(text:string):boolean {
 const withoutURLs=text.replace(URL,'').replace(/^\s*\d+[.)]\s+/gm,'');
 return /\b(?:is|are|was|were|means|refers to|can|could|must|should|has|have|had|increased|decreased|rose|fell|because|therefore)\b/i.test(withoutURLs)
  || /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:add|check|choose|compare|connect|inspect|measure|open|record|remove|select|set|write)\b/i.test(withoutURLs)
  || /\d\s*(?:%|°|(?:kg|mg|cm|km|ms|Hz|GB)\b)/i.test(withoutURLs)
  || /[^\n:：]{2,60}[:：]\s+(?:a|an|the)\s+[^\n]{8,}/i.test(withoutURLs)
  || /[\p{L}\p{N}][.!](?:\s|$)/u.test(withoutURLs);
}
function cover(text:string):boolean {
 if(text.length>1800)return false;
 // A title or the word “AI” is never enough. Multiple independent publication signals
 // identify both flattened PDF covers and multi-line publication furniture.
 const signals=[BYLINE.test(text),SERIES.test(text),PROMOTIONAL.test(text),DATE.test(text),URL.test(text)];
 return signals.filter(Boolean).length>=3&&(BYLINE.test(text)||SERIES.test(text))&&!hasBodyStatement(text);
}
function classify(line:string):SourceContentExclusion['kind']|undefined {
 const value=clean(line);
 if(!value)return;
 if(/^(?:(?:page|slide)\s+)?\d+\s+of\s+\d+\s*$/i.test(value)||/^(?:page|slide)\s+\d+\s*\/\s*\d+\s*$/i.test(value)||/^(?:page|slide)\s+\d+\s*$/i.test(value)||/^(?:part|volume|issue)\s+\d+\s+(?:of|\/)\s+\d+(?:\s+[|·–—-]?\s*\d+)?\s*$/i.test(value))return'pagination';
 const copyright=/^(?:©\s*(?:\d{4})?|copyright\s+(?:©\s*)?\d{4}|all rights reserved\b)/i.test(value);
 const pureRights=/^(?:(?:©\s*|copyright\s+(?:©\s*)?)\d{4}(?:[-–]\d{4})?\s+[^.!?\n]{1,100}\.?\s+)?all rights reserved\.?$/i.test(value);
 const namedByline=/^(?:blogs?|written|prepared|published|authored|illustrated|edited)\s+by\s+(?:[A-Z][\p{L}.'’–-]*\s*){1,6}(?:\s*[@|·]\s*\S+)?\.?$/u.test(value);
 if(copyright&&(!hasBodyStatement(value)||pureRights)
  || /^(?:ISBN|ISSN)\s*[:：]?\s*[\dXx-]{7,}\s*$/.test(value)
  || value.length<=320&&/^(?:blogs?|written|prepared|published|authored|illustrated|edited)\s+by\s+/i.test(value)&&(!hasBodyStatement(value)||namedByline)
  || value.length<=160&&/^by\s+[A-Z][\p{L}.'’ -]{1,70}(?:\s+[@|·]\s*\S.*)?$/u.test(value)&&!hasBodyStatement(value)
  || /^(?:https?:\/\/|www\.)\S+\s*$/.test(value)
  || /^[\w.+-]+@[\w.-]+\.[a-z]{2,}\s*$/i.test(value))return'publication';
 if(/^(?:table of contents|contents)\s*[:：]?$/i.test(value)||NAV_ROW.test(value)
  || /^.{2,140}\s*\.{3,}\s*\d+\s*$/.test(value)
  || /^\[(?:next|previous|home|back|menu|subscribe|sign in|privacy policy)\]\([^)]*\)\s*$/i.test(value))return'navigation';
}
const reasons:Record<SourceContentExclusion['kind'],string>={cover:'Publication cover or promotional front matter.',publication:'Publication attribution, rights notice, or standalone contact information.',navigation:'Document contents or navigation controls.',pagination:'Page or installment numbering.', 'running-header':'Repeated noninstructional page header or footer.'};
/** Conservative, inspectable exclusions. Ambiguous text stays available; no keyword topic guesses. */
export function sourceContentExclusions(text:string):readonly SourceContentExclusion[] {
 const saved=cache.get(text);if(saved)return saved;
 // Speech captions are literal source content, not publication layout.
 if(/^\uFEFF?WEBVTT\b/.test(text)||/^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(text))return[];
 const lines:Line[]=[];let page=0,code=false;
 for(const match of text.matchAll(/[^\r\n]*(?:\r?\n|$)/g)){
  if(!match[0])continue;const value=match[0].replace(/\r?\n$/,'').trim();
  if(PAGE.test(value)&&!code){page++;continue;}
  const fence=/^(?:```|~~~)/.test(value),protectedLine=code||fence||/^>/.test(value);if(fence)code=!code;
  const start=match.index!+match[0].indexOf(value);lines.push({text:value,start,end:start+value.length,page,protected:protectedLine});
 }
 const excluded:SourceContentExclusion[]=[];
 const add=(start:number,end:number,kind:SourceContentExclusion['kind'])=>{if(end>start)excluded.push({start,end,kind,reason:reasons[kind]});};
 const pages=new Map<number,Line[]>();for(const line of lines){if(!line.text)continue;const group=pages.get(line.page)??[];group.push(line);pages.set(line.page,group);}
 for(const group of pages.values()){
  // Whole cover pages are excluded only when no actual body statement would be removed.
  const first=group[0],last=group.at(-1)!;
  if(!group.some(line=>line.protected)&&cover(text.slice(first.start,last.end))){add(first.start,last.end,'cover');continue;}
  // A page may start with a multi-line cover block and then continue with real body text.
  // Bound the prefix search; never remove later body paragraphs merely because a byline exists.
  let coverEnd=first.start;
  for(const line of group.slice(0,16)){if(line.protected||line.end-first.start>1800)break;if(cover(text.slice(first.start,line.end)))coverEnd=line.end;}
  if(coverEnd>first.start)add(first.start,coverEnd,'cover');
  let contents=false;
  for(const line of group){
   if(line.protected){contents=false;continue;}
   if(cover(line.text)){add(line.start,line.end,'cover');continue;}
   // Old PDF imports may flatten cover metadata and the first body sentence onto one line.
   const attribution=line.text.search(BYLINE);
   if(attribution>=0){const url=URL.exec(line.text.slice(attribution));if(url){const end=attribution+url.index+url[0].length;if(end<line.text.length&&cover(line.text.slice(0,end))){add(line.start,line.start+end,'cover');}}}
   // A separate footer appended after a complete body sentence is safe to carve out.
   const suffix=/(?:[.!?]\s+)((?:blogs?|written|prepared|published|authored|illustrated|edited)\s+by\s+[^\n]+)$/i.exec(line.text);
   if(suffix&&classify(suffix[1])==='publication'&&!hasBodyStatement(suffix[1]))add(line.end-suffix[1].length,line.end,'publication');
   const kind=classify(line.text);if(kind){add(line.start,line.end,kind);if(/^(?:table of contents|contents)\s*[:：]?$/i.test(clean(line.text)))contents=true;continue;}
   if(contents){
    if(line.text.length<160&&!hasBodyStatement(line.text)&&/^(?:\d+[.)]\s+|chapter\s+\d+\b|\[[^\]]+\]\(#)/i.test(line.text)){add(line.start,line.end,'navigation');continue;}
    contents=false;
   }
  }
 }
 // Require recurrence at page edges, not merely a repeated sentence in a lesson.
 if(pages.size>=3){
  const edgeLines=new Map<string,Line[]>();for(const group of pages.values())for(const line of group.length>=4?[group[0],group.at(-1)!]:[]){
   if(!/\b(?:report|journal|newsletter|edition|proceedings|volume|issue)\b/i.test(line.text)&&!URL.test(line.text))continue;
   if(line.protected||line.text.length<15||line.text.split(/\s+/).length<3||line.text.length>100||line.text.split(/\s+/).length>12||hasBodyStatement(line.text)||/[=:：]/.test(line.text))continue;
   const key=line.text.toLocaleLowerCase(),occurrences=edgeLines.get(key)??[];if(!occurrences.some(item=>item.page===line.page))occurrences.push(line);edgeLines.set(key,occurrences);
  }
  for(const occurrences of edgeLines.values())if(occurrences.length>=3)for(const line of occurrences)add(line.start,line.end,'running-header');
 }
 let coveredUntil=-1;
 const ordered=excluded.sort((a,b)=>a.start-b.start||b.end-a.end).filter(item=>{if(item.end<=coveredUntil)return false;coveredUntil=item.end;return true;});
 const result=Object.freeze(ordered.map(item=>Object.freeze(item)));
 if(cache.size>=16)cache.delete(cache.keys().next().value!);cache.set(text,result);return result;
}
/** Keep surviving exact spans rather than rewriting a saved broad citation. */
function remainingContentRanges(text:string,start:number,end:number,excluded:readonly SourceContentExclusion[]):{start:number;end:number}[] {
 const ranges:{start:number;end:number}[]=[];let cursor=start;
 for(const range of excluded){
  if(range.end<=cursor)continue;if(range.start>=end)break;
  if(range.start>cursor)ranges.push({start:cursor,end:Math.min(range.start,end)});
  cursor=Math.max(cursor,Math.min(range.end,end));
 }
 if(cursor<end)ranges.push({start:cursor,end});return ranges;
}
/** Exact nonmetadata spans for presentation; callers may still omit headings or location markers. */
export function learningContentRanges(text:string,start:number,end:number):{start:number;end:number}[] {
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length)return[];
 return remainingContentRanges(text,start,end,sourceContentExclusions(text));
}
function hasSubstantiveRemainder(text:string):boolean {
 // Layout markers and headings alone must not rescue an otherwise empty cover.
 // This is a conservative structural guard, not a test of semantic entailment.
 const body=text.split(/\r?\n/).filter(line=>!PAGE.test(line.trim())&&!/^\s*#{1,6}\s/.test(line)).join('\n').trim();
 return body.length>=10&&(body.match(/[\p{L}\p{N}]+/gu)?.length??0)>=2&&hasBodyStatement(body);
}
/** A provenance check is separate: this only prevents known document furniture from becoming teaching.
 * Old references may cover a whole page: retain them when a genuine body statement survives. */
export function isLearningContentRange(text:string,start:number,end:number):boolean {
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length||!text.slice(start,end).trim())return false;
 const excluded=sourceContentExclusions(text);
 if(!excluded.some(range=>range.start<end&&range.end>start))return true;
 return remainingContentRanges(text,start,end,excluded).some(range=>hasSubstantiveRemainder(text.slice(range.start,range.end)));
}

/** A quote may occur in both a header and the body; one exact instructional occurrence suffices. */
export function hasLearningContentQuote(text:string,quote:string,start=0,end=text.length):boolean {
 if(!quote.trim()||start<0||end>text.length||start>=end)return false;
 let position=text.indexOf(quote,start);
 while(position>=0&&position+quote.length<=end){if(isLearningContentRange(text,position,position+quote.length))return true;position=text.indexOf(quote,position+1);}return false;
}

/** Extractive answers must actually appear in a surviving part of their exact quote.
 * A body paragraph elsewhere in a broad page citation cannot rescue a cover-word cloze. */
export function hasLearningContentAnswer(text:string,quote:string,answer:string):boolean {
 if(!quote.trim()||!answer.trim())return false;
 const excluded=sourceContentExclusions(text),needle=answer.toLocaleLowerCase();let position=text.indexOf(quote);
 while(position>=0){
  const end=position+quote.length;
  if(isLearningContentRange(text,position,end)&&remainingContentRanges(text,position,end,excluded).some(range=>text.slice(range.start,range.end).toLocaleLowerCase().includes(needle)))return true;
  position=text.indexOf(quote,position+1);
 }
 return false;
}
