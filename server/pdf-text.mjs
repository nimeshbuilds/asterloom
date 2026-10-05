/** Keep the PDF's supplied text order and visible line/paragraph boundaries.
 * This deliberately does not guess column order, rewrite words, or infer prose
 * from charts. Those require inspection of the original document.
 */
export function pdfPageText(items) {
  const lines=[];
  let line='',previous,first,lastLine;
  const geometry=item=>{
    const t=item.transform;
    if(!Array.isArray(t)||t.length<6||!t.every(Number.isFinite))return;
    return {x:t[4],y:t[5],height:Math.max(Math.abs(item.height||0),Math.hypot(t[2],t[3]),1),width:Number.isFinite(item.width)?item.width:undefined};
  };
  const flush=()=>{
    const text=line.trim();
    if(text){
      const gap=first&&lastLine?Math.abs(first.y-lastLine.y):0;
      const height=first&&lastLine?Math.max(first.height,lastLine.height):0;
      const fontChange=first&&lastLine?Math.max(first.height,lastLine.height)/Math.min(first.height,lastLine.height):1;
      if(lines.length&&((height&&gap>height*1.65)||fontChange>=1.3))lines.push('');
      lines.push(text);lastLine=previous??first;
    }
    line='';previous=undefined;first=undefined;
  };
  for(const item of items){
    if(typeof item?.str!=='string')continue;
    const g=geometry(item);
    if(line&&previous&&g&&Math.abs(g.y-previous.y)>Math.max(g.height,previous.height)*.45)flush();
    if(item.str){
      let separator='';
      if(line&&!/\s$/.test(line)&&!/^\s|^[,.;:!?)}\]]/.test(item.str)){
        const gap=previous&&g&&previous.width!==undefined?g.x-(previous.x+previous.width):undefined;
        // PDF.js may split one word over adjacent styled text items. Preserve
        // adjacency when geometry is available; otherwise separate text runs.
        if(gap===undefined||gap>Math.max(g?.height??0,previous?.height??0)*.12)separator=' ';
      }
      line+=separator+item.str;first??=g;previous=g;
    }
    if(item.hasEOL)flush();
  }
  flush();return lines.join('\n');
}
