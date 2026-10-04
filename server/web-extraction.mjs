import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';

const MAX_HTML_BYTES=8*1024*1024;
const MAX_ELEMENTS=50_000;
const DEFAULT_CHARACTERS=1_000_000;
const compact=value=>String(value||'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim();
const bound=(value,max=500)=>compact(value).slice(0,max);
const children=node=>Array.from(node.childNodes||[]);
const name=node=>node.nodeName?.toLowerCase();
const excluded='head,script,style,noscript,template,iframe,object,embed,svg,canvas,form,input,button,select,textarea,nav,footer,[role="navigation"],[role="banner"],[role="contentinfo"],[hidden],[aria-hidden="true"],[inert]';
const paragraphTags=new Set(['p','div','section','article','main','header','aside','figure','figcaption','address','dl','dt','dd','details','summary']);

function safeUrl(value,base){if(typeof value!=='string'||!value.trim())return undefined;try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
function metadataValue(document,selectors){for(const selector of selectors){const element=document.querySelector(selector);const value=element?.getAttribute('content')||element?.getAttribute('datetime')||element?.textContent;if(compact(value))return bound(value);}return undefined;}
function cleanHidden(document){
 document.querySelectorAll('[hidden],[aria-hidden="true"],[inert]').forEach(node=>node.remove());
 document.querySelectorAll('[style]').forEach(node=>{if(/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(node.getAttribute('style')||''))node.remove();});
 }
function cleanDocument(document){
 document.querySelectorAll(excluded).forEach(node=>node.remove());
 cleanHidden(document);
 // Site headers are noise; article headers can contain the title and author.
 document.querySelectorAll('body > header').forEach(node=>node.remove());
}

/** Serialize only text. This is not HTML and must never be assigned to innerHTML. */
function readableText(root,maxCharacters,headingLevels=new Map()){
 let visited=0,structureLimited=false;const codeBlocks=[],tableWarnings=[];
 const walk=(node,depth=0)=>{
  if(depth>256||++visited>150_000){structureLimited=true;return '';}
  if(node.nodeType===3)return String(node.textContent||'').replace(/\u0000/g,'').replace(/\s+/g,' ');
  if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return '';
  const tag=name(node);
  if(tag==='pre'){
   const code=String(node.textContent||'').replace(/\u0000/g,'').replace(/\r\n?/g,'\n').replace(/^\n|\n$/g,'');
   const fence='`'.repeat(Math.max(3,...(code.match(/`+/g)||[]).map(value=>value.length+1)));
   const marker=`\u0000PRE_${codeBlocks.length}\u0000`;codeBlocks.push(`${fence}\n${code}\n${fence}`);return `\n\n${marker}\n\n`;
  }
  if(tag==='br')return '\n';
  if(tag==='hr')return '\n\n';
  if(tag==='img')return ''; // An image description is not evidence inferred from pixels.
  if(tag==='table'){
   const caption=node.querySelector('caption');const lines=[];
   if(caption)lines.push(compact(caption.textContent));
   const rows=Array.from(node.querySelectorAll('tr')).filter(row=>row.closest('table')===node);
   const grid=rows.map(row=>Array.from(row.children).filter(cell=>['th','td'].includes(name(cell))));
   const cells=grid.map(row=>row.map(cell=>compact(cell.textContent)));
   const headerRows=rows.filter(row=>name(row.parentElement)==='thead');
   const hasSpans=grid.flat().some(cell=>['colspan','rowspan'].some(attribute=>cell.hasAttribute(attribute)&&cell.getAttribute(attribute)!=='1'));
   const nested=!!node.querySelector('table');
   const irregular=hasSpans||nested||headerRows.length>1||grid.some(row=>row.length!==(grid[0]?.length||0));
   const explicitHeader=grid[0]?.length>0&&(grid[0].every(cell=>name(cell)==='th'&&cell.getAttribute('scope')!=='row')||name(rows[0]?.parentElement)==='thead');
   if(irregular){
    tableWarnings.push('A table has merged cells, multiple header rows, nested content, or uneven rows. Its cells are shown in source order; no rectangular dataset or column alignment was inferred.');
    cells.forEach((row,index)=>lines.push(`Row ${index+1}: ${row.map((value,column)=>`[${column+1}] ${value}`).join(' ; ')}`));
    // Blank lines separate irregular rows so automatic CSV/Markdown extraction
    // cannot mistake this readable account of the cells for a regular dataset.
    return '\n\n'+lines.join('\n\n')+'\n\n';
   }
   cells.forEach((row,index)=>{
    if(row.length)lines.push('| '+row.map(value=>value.replace(/\|/g,'\\|')).join(' | ')+' |');
    if(index===0&&explicitHeader)lines.push('| '+row.map(()=> '---').join(' | ')+' |');
   });
   return '\n\n'+lines.join('\n')+'\n\n';
  }
  const inner=children(node).map(child=>walk(child,depth+1)).join('');
  if(/^h[1-6]$/.test(tag))return `\n\n${'#'.repeat(headingLevels.get(compact(inner))||Number(tag[1]))} ${compact(inner)}\n\n`;
  if(tag==='li'){
   const list=node.parentElement;let prefix='- ';
   if(name(list)==='ol'){const start=Number.parseInt(list.getAttribute('start')||'1',10);const index=Array.from(list.children).filter(item=>name(item)==='li').indexOf(node);prefix=`${Number.isFinite(start)?start+index:index+1}. `;}
   return '\n'+prefix+inner.trim()+'\n';
  }
  if(tag==='ul'||tag==='ol'||tag==='blockquote')return '\n\n'+inner.trim()+'\n\n';
  return paragraphTags.has(tag)?'\n\n'+inner.trim()+'\n\n':inner;
 };
 // Do not collapse spaces inside preformatted blocks: source code indentation matters.
 const full=walk(root).replace(/\n[ \t]+\n/g,'\n\n').replace(/\n{3,}/g,'\n\n').trim().replace(/\u0000PRE_(\d+)\u0000/g,(_match,index)=>codeBlocks[Number(index)]);
 return {text:full.slice(0,maxCharacters),truncated:full.length>maxCharacters||structureLimited,structureLimited,tableWarnings};
}

/** Extract one already-fetched page. Never executes scripts or requests assets/links.
 * `url` is the final validated fetch URL; canonical metadata cannot replace it.
 */
export function extractWebPage(html,{url,maxCharacters=DEFAULT_CHARACTERS}={}){
 if(typeof html!=='string')throw new TypeError('Web extraction requires an HTML string.');
 if(Buffer.byteLength(html)>MAX_HTML_BYTES)throw Object.assign(new Error('The web page exceeds the 8 MiB extraction limit.'),{status:413,code:'WEB_PAGE_TOO_LARGE'});
 maxCharacters=Math.min(DEFAULT_CHARACTERS,Math.max(1,Number.isFinite(maxCharacters)?Math.floor(maxCharacters):DEFAULT_CHARACTERS));
 // Linkedom parses data only; it does not load resources or execute scripts.
 const {document}=parseHTML(html);
 if(url){Object.defineProperty(document,'documentURI',{value:safeUrl(url)||'about:blank',configurable:true});Object.defineProperty(document,'baseURI',{value:safeUrl(url)||'about:blank',configurable:true});}
 const title=metadataValue(document,['meta[property="og:title"]','title','h1'])||'Web source';
 const byline=metadataValue(document,['meta[name="author"]','[rel="author"]']);
 const publishedTime=metadataValue(document,['meta[property="article:published_time"]','meta[name="date"]','time[datetime]']);
 const siteName=metadataValue(document,['meta[property="og:site_name"]']);
 const language=bound(document.documentElement?.getAttribute('lang'),100);
 const canonicalUrl=safeUrl(document.querySelector('link[rel="canonical"]')?.getAttribute('href'),url);
 const headingLevels=new Map();for(const node of document.querySelectorAll('h1,h2,h3,h4,h5,h6')){const text=compact(node.textContent);if(text&&!headingLevels.has(text))headingLevels.set(text,Number(name(node)[1]));}
 const scriptCount=Array.from(document.querySelectorAll('script')).filter(node=>!['application/ld+json','application/json'].includes((node.getAttribute('type')||'').toLowerCase())).length;
 const passwordInput=!!document.querySelector('input[type="password"]');
 const restrictedMetadata=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(node=>/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(node.textContent||''));
 const paywallElement=!!document.querySelector('[data-paywall],.paywall,#paywall,[class~="subscription-wall"],[id="subscription-wall"]');
 const noScriptText=compact(Array.from(document.querySelectorAll('noscript')).map(node=>node.textContent).join(' '));
 const warnings=[];
 const tooManyElements=document.querySelectorAll('*').length>MAX_ELEMENTS;
 let article;
 if(!tooManyElements){
  const copy=document.cloneNode(true);
  if(url){Object.defineProperty(copy,'documentURI',{value:safeUrl(url)||'about:blank',configurable:true});Object.defineProperty(copy,'baseURI',{value:safeUrl(url)||'about:blank',configurable:true});}
  // Keep JSON-LD only for metadata until Readability has inspected it. It never
  // becomes source content. Hidden data and scripting are removed afterward.
  cleanHidden(copy);
  try{article=new Readability(copy,{maxElemsToParse:MAX_ELEMENTS,charThreshold:100,serializer:element=>element}).parse();}catch{warnings.push('Article detection was unavailable for this page; the visible-text fallback was used.');}
 }else warnings.push('This page has a very large document structure. A bounded visible-text fallback was used.');
 cleanDocument(document);
 const semantic=document.querySelector('main,[role="main"],article');
 const fallbackRoot=semantic||(compact(document.body?.textContent)?document.body:document);
 const fallback=readableText(fallbackRoot,maxCharacters,headingLevels);
 let root=fallbackRoot,selected=fallback,extractor='visible-text';
 if(article?.content){
  // Readability is an article detector, not an HTML sanitizer. We return only
  // serialized text after removing executable, hidden and navigation nodes.
  cleanDocument(article.content);
  const candidate=readableText(article.content,maxCharacters,headingLevels);
  if(candidate.text&&!fallback.tableWarnings.length&&(!semantic||candidate.text.length>=fallback.text.length*0.7)){
   root=article.content;selected=candidate;extractor='mozilla-readability';
  }
 }
 warnings.push(...new Set(selected.tableWarnings));
 const text=selected.text;
 const visible=compact(fallback.text);
 const passwordWall=passwordInput&&visible.length<1200;
 const loginPhrase=/\b(?:sign[ -]?in|log[ -]?in) (?:is required|to (?:continue|read|view|access))\b/i.test(visible);
 const paywallPhrase=/\b(?:subscribe|subscription required|members only|subscriber.only)\b.{0,60}\b(?:continue reading|read (?:the full|this)|access (?:this|the full)|unlock)\b/i.test(visible);
 const paywall=restrictedMetadata||paywallElement||paywallPhrase;
 const challenge=/\b(?:verify (?:that )?you are (?:a )?human|checking your browser|enable cookies to continue|access denied|captcha)\b/i.test(visible)&&visible.length<1500;
 const thin=text.length<120;
 // An analytics or presentation script does not make a short static lesson a shell.
 const hasStaticContent=Array.from(root.querySelectorAll('p,li,pre,td,th')).some(node=>{const value=compact(node.textContent);return value.length>0&&!/^(?:loading(?:[ .…]|$)|please wait|(?:please )?enable javascript|javascript (?:is )?required)/i.test(value);});
 const javascriptNeeded=!hasStaticContent&&((scriptCount>0&&thin)||(/enable|requires?/i.test(noScriptText)&&/javascript/i.test(noScriptText)&&text.length<300));
 const loginWall=passwordWall||(loginPhrase&&text.length<800);
 const needsAssistance=!text||loginWall||challenge||(javascriptNeeded&&thin)||(paywall&&text.length<350);
 if(!text)warnings.push('No readable page content was delivered. Provide an accessible document or paste the source text.');
 if(paywall)warnings.push('This page signals a subscription or access restriction. Only the text delivered publicly was extracted; the full material may be missing.');
 if(loginWall)warnings.push('This looks like a sign-in page. The protected learning material was not retrieved.');
 if(challenge)warnings.push('This page appears to contain a browser or anti-bot challenge instead of the requested material.');
 if(javascriptNeeded)warnings.push('This page contains little readable text and may require JavaScript. Scripts were not run.');
 if(thin&&!needsAssistance)warnings.push('Only a small amount of readable text was found. Check that the intended material is present.');
 if(selected.structureLimited)warnings.push('Some unusually deep or large page structure was omitted. Upload smaller sections and review the text.');
 else if(selected.truncated)warnings.push(`The extracted text was limited to ${maxCharacters.toLocaleString('en-US')} characters. Split a long source into sections.`);
 const headings=Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0,100).map(node=>({level:headingLevels.get(compact(node.textContent))||Number(name(node)[1]),text:bound(node.textContent,500)})).filter(item=>item.text);
 const metadata={...(safeUrl(url)?{url:safeUrl(url)}:{}),extractor,contentStatus:needsAssistance?'needs-assistance':paywall||selected.truncated?'partial':'extracted',headings,
  ...(bound(article?.byline||byline)?{byline:bound(article?.byline||byline)}:{}),...(bound(article?.publishedTime||publishedTime)?{publishedTime:bound(article?.publishedTime||publishedTime)}:{}),...(bound(article?.siteName||siteName)?{siteName:bound(article?.siteName||siteName)}:{}),...(language?{language}:{}),...(canonicalUrl?{declaredCanonicalUrl:canonicalUrl}:{}),truncated:selected.truncated};
 return {title:bound(article?.title||title),text,metadata,warnings,needsAssistance,...(needsAssistance?{instructions:'Open the source in your browser. If you can access it and may reuse it, copy its readable text or upload a downloaded document, transcript, or saved HTML file. Login, subscription and browser-verification pages cannot supply the missing learning content.'}:{})};
}
