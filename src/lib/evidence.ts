import type { EvidenceBlock, EvidenceLocator, EvidenceReference, LearningObjective, Source } from '../types';

const revisionCache = new Map<string, { text: string; revision: string }>();
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotate = (x: number, n: number) => x >>> n | x << 32 - n;
/** Synchronous SHA-256 lets portable import validation verify the same exact text without a server. */
export function textDigest(text: string): string { return bytesDigest(new TextEncoder().encode(text)); }
export function bytesDigest(input: Uint8Array): string {
  const length = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(length); bytes.set(input); bytes[input.length] = 128;
  const view = new DataView(bytes.buffer); view.setUint32(length - 8, Math.floor(input.length / 0x20000000)); view.setUint32(length - 4, input.length * 8 >>> 0);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  for (let offset = 0; offset < length; offset += 64) {
    for (let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(rotate(a,7)^rotate(a,18)^a>>>3)+w[i-16]+(rotate(b,17)^rotate(b,19)^b>>>10)+w[i-7];}
    let [a,b,c,d,e,f,g,j]=h;
    for(let i=0;i<64;i++){const t=(j+(rotate(e,6)^rotate(e,11)^rotate(e,25))+(e&f^~e&g)+K[i]+w[i])>>>0;const u=((rotate(a,2)^rotate(a,13)^rotate(a,22))+(a&b^a&c^b&c))>>>0;j=g;g=f;f=e;e=d+t>>>0;d=c;c=b;b=a;a=t+u>>>0;}
    [a,b,c,d,e,f,g,j].forEach((value,i)=>h[i]=h[i]+value>>>0);
  }
  return Array.from(h, x=>x.toString(16).padStart(8,'0')).join('');
}
export function sourceRevision(source: Pick<Source,'id'|'text'>): string {
  const cached=revisionCache.get(source.id); if(cached?.text===source.text)return cached.revision;
  const revision=textDigest(source.text); if(revisionCache.size>=100)revisionCache.delete(revisionCache.keys().next().value!);
  revisionCache.set(source.id,{text:source.text,revision}); return revision;
}
function locatorAt(text:string,start:number,end:number):EvidenceLocator {
  const before=text.slice(0,start), lineStart=before.split('\n').length, lineEnd=lineStart+(text.slice(start,end).match(/\n/g)?.length??0);
  const markers=[...before.matchAll(/^\[(Page|Slide|Sheet):?\s+([^\]\n]+)\][ \t]*$/gm)];
  const marker=markers.at(-1); if(marker)return {kind:marker[1].toLowerCase() as 'page'|'slide'|'sheet',label:`${marker[1]} ${marker[2]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
  const time=[...before.matchAll(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/gm)].at(-1);
  if(time)return{kind:'timestamp',label:`${time[1]} · lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
  return{kind:'text',label:`Lines ${lineStart}–${lineEnd}`,lineStart,lineEnd};
}
/** Contiguous passages only: never normalize, splice, infer page numbers, or drop an interior character. */
export function evidenceBlocks(source:Source,maxLength=640):EvidenceBlock[] {
  if(source.status!=='ready'||!source.text.trim())return[];
  const text=source.text,revision=sourceRevision(source),blocks:EvidenceBlock[]=[];
  const bound=Math.max(120,Math.min(1200,Math.floor(maxLength)||640));
  let start=0;
  while(start<text.length&&blocks.length<10000){
    while(start<text.length&&/\s/.test(text[start]))start++;
    if(start>=text.length)break;
    const subtitleHeader=/^(?:WEBVTT[^\n]*\r?\n|\d+\r?\n(?=(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->)|(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->[^\n]*\r?\n)/.exec(text.slice(start));
    if(subtitleHeader){start+=subtitleHeader[0].length;continue;}
    const heading=/^\[(?:Page|Slide|Sheet):?\s+[^\]\n]+\][ \t]*\r?\n/.exec(text.slice(start));
    if(heading){start+=heading[0].length;continue;}
    let end=Math.min(text.length,start+bound);
    const marker=/^\[(?:Page|Slide|Sheet):?\s+[^\]\n]+\][ \t]*$/m.exec(text.slice(start,end));
    if(marker&&marker.index>0)end=start+marker.index;
    const paragraph=/\r?\n[ \t]*\r?\n/.exec(text.slice(start,end));
    if(paragraph&&paragraph.index>0)end=start+paragraph.index;
    if(end<text.length){
      const candidate=text.slice(start,end), paragraphs=[...candidate.matchAll(/\n\s*\n/g)], last=paragraphs.at(-1);
      if(last&&last.index!>40)end=start+last.index!;
      else {const breaks=[...candidate.matchAll(/[.!?]\s+|\n|\s+/g)].filter(m=>m.index!>bound/2);const b=breaks.at(-1);if(b)end=start+b.index!+(/[.!?]/.test(b[0][0])?1:0);}
    }
    // Never split a UTF-16 surrogate pair.
    if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
    while(end>start&&/\s/.test(text[end-1]))end--;
    if(end<=start){start++;continue;}
    const quote=text.slice(start,end),locator=locatorAt(text,start,end);
    blocks.push({id:`e-${textDigest(source.id).slice(0,16)}-${revision.slice(0,20)}-${start}-${end}`,sourceId:source.id,sourceRevision:revision,start,end,quote,locator,sourceTitle:source.title});start=end;
  }
  return blocks;
}
export function evidenceReference(block:EvidenceReference):EvidenceReference {
  return {sourceId:block.sourceId,sourceRevision:block.sourceRevision,start:block.start,end:block.end,quote:block.quote,locator:{...block.locator}};
}
export function isCurrentEvidence(ref:EvidenceReference,sources:readonly Source[]):boolean {
  const source=sources.find(s=>s.id===ref.sourceId);
  return !!source&&source.status==='ready'&&Number.isSafeInteger(ref.start)&&Number.isSafeInteger(ref.end)&&ref.start>=0&&ref.end>ref.start&&ref.end<=source.text.length&&ref.quote.trim().length>0&&sourceRevision(source)===ref.sourceRevision&&source.text.slice(ref.start,ref.end)===ref.quote;
}
export function reconcileObjectives(objectives:readonly LearningObjective[]|undefined,sources:readonly Source[]):LearningObjective[]|undefined {
  return objectives?.filter(objective=>objective.evidence.length>0&&objective.evidence.every(ref=>isCurrentEvidence(ref,sources)));
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&[null,Object.prototype].includes(Object.getPrototypeOf(value));}
function exactKeys(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Learning evidence contains an unsupported field.');}
/** Portable objective plans have exact citations, never cached model outputs or provider settings. */
export function validateLearningObjectives(value:unknown,sources:Source[]):LearningObjective[]{
  if(!Array.isArray(value)||value.length>100)throw new Error('Use at most 100 learning objectives.');
  const ids=new Set<string>();
  return value.map(raw=>{
    if(!record(raw))throw new Error('Invalid learning objective.');exactKeys(raw,['id','title','operation','reviewStatus','evidence']);
    if(typeof raw.id!=='string'||!/^objective-[a-zA-Z0-9_-]{1,90}$/.test(raw.id)||ids.has(raw.id))throw new Error('Invalid or duplicate objective ID.');ids.add(raw.id);
    if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>300||!['recall','sequence','classification','explanation'].includes(String(raw.operation))||!['needs-review','reviewed'].includes(String(raw.reviewStatus)))throw new Error('Invalid learning objective description.');
    if(!Array.isArray(raw.evidence)||!raw.evidence.length||raw.evidence.length>8)throw new Error('Each objective needs 1–8 exact source passages.');
    const evidence=raw.evidence.map(input=>{
      if(!record(input))throw new Error('Invalid evidence reference.');exactKeys(input,['sourceId','sourceRevision','start','end','quote','locator']);
      if(typeof input.sourceId!=='string'||typeof input.sourceRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceRevision)||typeof input.quote!=='string'||input.quote.length>1200||!record(input.locator))throw new Error('Invalid evidence reference.');
      exactKeys(input.locator,['kind','label','lineStart','lineEnd']);
      const ref=input as unknown as EvidenceReference;if(!isCurrentEvidence(ref,sources))throw new Error('Learning objective evidence changed. Choose its passages again.');
      const expected=locatorAt(sources.find(s=>s.id===ref.sourceId)!.text,ref.start,ref.end);
      if(JSON.stringify(ref.locator)!==JSON.stringify(expected)&&(['kind','label','lineStart','lineEnd'] as const).some(key=>ref.locator[key]!==expected[key]))throw new Error('The evidence locator does not match its exact source position.');
      return evidenceReference({...ref,locator:expected});
    });
    return{id:raw.id,title:raw.title,operation:raw.operation as LearningObjective['operation'],reviewStatus:raw.reviewStatus as LearningObjective['reviewStatus'],evidence};
  });
}
