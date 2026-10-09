import type {EvidenceBlock,Notebook,Source} from '../types';
import {isCurrentEvidence} from '../lib/evidence';
import {asterContextBlocks} from '../lib/asterRetrieval';

export interface SourceReadingPage {id:string;label:string;start:number;end:number}
/** Reading pagination only. No saved source, citation, learning unit or progress ID changes. */
export function sourceReadingPages(source:Source):SourceReadingPage[]{
 const text=source.text;if(!text.trim())return[];
 const markers:[number,string][]=[];let fenced=false;
 for(const match of text.matchAll(/[^\r\n]*(?:\r?\n|$)/g)){
  const line=match[0].trim();if(/^(?:```|~~~)/.test(line)){fenced=!fenced;continue;}
  const marker=!fenced&&line.match(/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\]$/);
  if(marker)markers.push([match.index!,`${marker[1]} ${marker[2]}`]);
 }
 if(markers.length){
  if(markers[0][0]>0)markers.unshift([0,'Before the first page']);
  return markers.map(([start,label],index)=>({id:`page-${start}`,label,start,end:markers[index+1]?.[0]??text.length}));
 }
 const pages:SourceReadingPage[]=[];let start=0;
 while(start<text.length){
  let end=Math.min(start+6500,text.length);
  if(end<text.length){const paragraph=text.lastIndexOf('\n\n',end);if(paragraph>start+2000)end=paragraph+2;else{const space=text.lastIndexOf(' ',end);if(space>start)end=space+1;}}
  pages.push({id:`section-${start}`,label:pages.length===0&&end===text.length?'Whole source':`Reading section ${pages.length+1}`,start,end});start=end;
 }
 return pages;
}
export function sourceReadingBlocks(source:Source):EvidenceBlock[]{return asterContextBlocks(source);}
export function initialSourceReadingPage(source:Source,pages:SourceReadingPage[],blocks:EvidenceBlock[],notebook:Notebook):number{
 const references=notebook.aiLearningPlan?.missions.flatMap(mission=>mission.conceptExplanation.citations)??[];
 const pageAt=(start:number)=>pages.findIndex(page=>page.start<=start&&start<page.end);
 const usefulPages=new Set(blocks.map(block=>pageAt(block.start)));
 const first=references.find(ref=>ref.sourceId===source.id&&isCurrentEvidence(ref,[source])&&usefulPages.has(pageAt(ref.start)));
 const start=first?.start??blocks[0]?.start??0;
 return Math.max(0,pages.findIndex(page=>page.start<=start&&start<page.end));
}
export const sourceDisplayTitle=(title:string)=>title.replace(/[_]+/g,' ').replace(/\.(?:pdf|txt|md|docx?|pptx?|epub)$/i,'').replace(/\s+/g,' ').trim()||'Untitled source';
/** Layout hints never summarize or paraphrase source wording. */
export function sourcePassagePresentation(quote:string):{heading?:string;text:string;structured:boolean}{
 const structured=/^\s*(?:```|~~~|\||(?:\d+|[A-Z])[.)]\s|[-*•]\s)/m.test(quote)||/^(?:Field\s+(?:Description|What to understand|Meaning)|Term\s+(?:Definition|Meaning)|Service\s+(?:Purpose|Description)|(?:SDK )?Client\s+Responsibility)/i.test(quote);
 if(structured)return{text:quote,structured:true};
 const isHeading=(line:string)=>line.length<=100&&line.trim().split(/\s+/).length<=10&&!/[.!?:;]$/.test(line.trim())&&!/\b(?:is|are|was|were|must|should|can|cannot|means|requires?|contains?|provides?|uses?|returns?|supports?|prevents?|allows?)\b/i.test(line);
 if(!/[\r\n]/.test(quote)&&isHeading(quote))return{heading:quote.replace(/^#{1,6}\s+/,''),text:'',structured:false};
 const first=quote.match(/^([^\r\n]+)(\r?\n)/);
 if(first&&isHeading(first[1]))return{heading:first[1].replace(/^#{1,6}\s+/,''),text:quote.slice(first[0].length),structured:false};
 return{text:quote,structured:false};
}
