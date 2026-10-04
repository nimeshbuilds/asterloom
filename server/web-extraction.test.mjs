import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWebPage} from './web-extraction.mjs';
const prose='Retrieval practice asks a learner to recall an idea before looking at the answer. Feedback then helps the learner correct a misconception and try again. Spacing these attempts across several days can support later recall. ';
const page=(body,head='<title>A learning source</title>')=>`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

test('article detection removes navigation noise and keeps attributed metadata and final URL',()=>{
 const html=page(`<header>Site shopping offers</header><nav>${'<a href="/ads">Unrelated promotion</a>'.repeat(20)}</nav><article><h1>Learning through recall</h1><p>${prose.repeat(5)}</p><h2>Practice</h2><p>${prose.repeat(3)}</p></article><footer>Legal footer noise</footer>`, '<title>Learning through recall | Example</title><meta name="author" content="A. Educator"><meta property="article:published_time" content="2026-01-02"><meta property="og:site_name" content="Example"><link rel="canonical" href="/claimed-canonical">');
 const result=extractWebPage(html,{url:'https://example.test/final-page'});
 assert.equal(result.needsAssistance,false);assert.equal(result.metadata.extractor,'mozilla-readability');
 assert.match(result.text,/Retrieval practice/);assert.doesNotMatch(result.text,/Unrelated promotion|shopping offers|Legal footer/);
 assert.equal(result.metadata.byline,'A. Educator');assert.equal(result.metadata.publishedTime,'2026-01-02');assert.equal(result.metadata.siteName,'Example');
 assert.equal(result.metadata.url,'https://example.test/final-page');assert.equal(result.metadata.declaredCanonicalUrl,'https://example.test/claimed-canonical');assert.equal(result.metadata.language,'en');
 assert.ok(result.metadata.headings.some(heading=>heading.level===2&&heading.text==='Practice'));
});

test('source structure retains heading levels, list values, code indentation and ordered table cells',()=>{
 const result=extractWebPage(page(`<main><h1>Technical notes</h1><p>${prose}</p><h3>Procedure</h3><ol start="3"><li>Observe</li><li>Explain</li></ol><ul><li>Review</li></ul><pre><code>if (ready) {\n  return "a  b";\n}\n\n\n// keep this gap</code></pre><table><caption>Results</caption><tr><th>Trial</th><th>Outcome</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table></main>`));
 assert.match(result.text,/# Technical notes/);assert.match(result.text,/### Procedure/);assert.match(result.text,/3\. Observe/);assert.match(result.text,/4\. Explain/);assert.match(result.text,/- Review/);
 assert.ok(result.text.includes('if (ready) {\n  return "a  b";\n}\n\n\n// keep this gap'));
 assert.match(result.text,/Results\n\| Trial \| Outcome \|\n\| --- \| --- \|\n\| A \| 10 \|\n\| B \| 20 \|/);
 assert.equal(result.metadata.declaredCanonicalUrl,undefined);
});

test('short public fragments have a useful deterministic fallback without inventing content',()=>{
 const result=extractWebPage('<h1>Definition</h1><p>A triangle has three sides.</p>');
 assert.match(result.text,/triangle has three sides/);assert.equal(result.needsAssistance,false);assert.match(result.warnings.join(' '),/small amount/);assert.equal(result.metadata.url,undefined);
});

test('login, subscription and browser challenge pages are not accepted as complete learning material',()=>{
 const login=extractWebPage(page('<main><h1>Sign in to continue</h1><form><input type="password"><button>Sign in</button></form></main>'));
 assert.equal(login.needsAssistance,true);assert.equal(login.metadata.contentStatus,'needs-assistance');assert.match(login.warnings.join(' '),/protected learning material was not retrieved/);
 const paywall=extractWebPage(page('<main><h1>Public preview</h1><p>A brief public excerpt.</p><div class="paywall">Subscribe to continue reading</div></main>'));
 assert.equal(paywall.needsAssistance,true);assert.match(paywall.warnings.join(' '),/subscription/);
 const partial=extractWebPage(page(`<article><h1>Visible excerpt</h1><p>${prose.repeat(5)}</p></article>`,'<title>Visible excerpt</title><script type="application/ld+json">{"isAccessibleForFree":false,"articleBody":"UNAVAILABLE FULL ARTICLE"}</script>'));
 assert.equal(partial.needsAssistance,false);assert.equal(partial.metadata.contentStatus,'partial');assert.doesNotMatch(partial.text,/UNAVAILABLE FULL/);assert.match(partial.warnings.join(' '),/full material may be missing/);
 const challenge=extractWebPage(page('<main><h1>Verify you are human</h1><p>Checking your browser. CAPTCHA required.</p></main>'));
 assert.equal(challenge.needsAssistance,true);assert.match(challenge.warnings.join(' '),/challenge/);
});

test('a script-only shell is assisted import and scripts, frames, hidden payloads never run or enter text',()=>{
 const shell=extractWebPage(page('<div id="app"></div><script>globalThis.__asterloomImportExecuted=true</script><noscript>Enable JavaScript to load this content</noscript>'));
 assert.equal(shell.needsAssistance,true);assert.equal(shell.text,'');assert.match(shell.warnings.join(' '),/JavaScript/);assert.equal(globalThis.__asterloomImportExecuted,undefined);
 const result=extractWebPage(page(`<main><h1>Safe text</h1><p>${prose.repeat(2)}</p><script>EXECUTABLE_PAYLOAD()</script><style>.bad {content:"STYLE_PAYLOAD"}</style><iframe src="http://127.0.0.1/private">FRAME_PAYLOAD</iframe><span hidden>HIDDEN_PAYLOAD</span><span aria-hidden="true">ARIA_PAYLOAD</span><span style="display: none">STYLE_HIDDEN_PAYLOAD</span><img src="http://127.0.0.1/private" onerror="ATTACK()"><a href="javascript:ATTACK()">Visible link label</a></main>`));
 assert.doesNotMatch(result.text,/PAYLOAD|ATTACK|127\.0\.0\.1/);assert.match(result.text,/Visible link label/);assert.equal(result.needsAssistance,false);
});

test('login terms inside a real article do not turn it into a sign-in wall',()=>{
 const result=extractWebPage(page(`<nav><a href="/login">Sign in</a></nav><article><h1>Authentication design</h1><p>${prose.repeat(5)}</p><p>Explain what a login form does.</p></article>`));
 assert.equal(result.needsAssistance,false);assert.equal(result.metadata.contentStatus,'extracted');
});

test('extraction applies bounds and never trusts a canonical URL as fetch provenance',()=>{
 const result=extractWebPage(page(`<main><p>${prose.repeat(10)}</p></main>`,'<title>Long</title><link rel="canonical" href="javascript:alert(1)">'),{url:'https://example.test/actual',maxCharacters:80});
 assert.equal(result.text.length,80);assert.equal(result.metadata.truncated,true);assert.equal(result.metadata.url,'https://example.test/actual');assert.equal(result.metadata.declaredCanonicalUrl,undefined);assert.match(result.warnings.join(' '),/80 characters/);
 assert.throws(()=>extractWebPage('x'.repeat(8*1024*1024+1)),error=>error.status===413&&error.code==='WEB_PAGE_TOO_LARGE');
});


test('metadata scripts alone do not label a short public page as a JavaScript shell',()=>{
 const result=extractWebPage(page('<main><h1>Triangle</h1><p>A triangle has three sides.</p></main>','<title>Triangle</title><script type="application/ld+json">{"@type":"Article","headline":"Triangle"}</script>'));
 assert.equal(result.needsAssistance,false);assert.doesNotMatch(result.warnings.join(' '),/JavaScript/);
});


test('short static learning content remains importable when unrelated scripts are present',()=>{
 const result=extractWebPage(page('<nav>Account menu</nav><main><h1>Water</h1><p>Rain is precipitation.</p></main>','<title>Rain</title><script>stealSecrets()</script>'));
 assert.equal(result.needsAssistance,false);assert.match(result.text,/Rain is precipitation/);assert.doesNotMatch(result.text,/stealSecrets|Account menu/);assert.doesNotMatch(result.warnings.join(' '),/JavaScript/);
 const loader=extractWebPage(page('<main><p>Loading article…</p></main><script src="/app.js"></script>'));
 assert.equal(loader.needsAssistance,true);assert.match(loader.warnings.join(' '),/JavaScript/);
});


test('only explicit column headers produce a compilable numeric Markdown table',()=>{
 const values='<tr><td>A</td><td>4</td></tr><tr><td>B</td><td>8</td></tr>';
 for(const header of ['<tr><th>Site</th><th>Reading</th></tr>','<thead><tr><td>Site</td><td>Reading</td></tr></thead>']){
  const result=extractWebPage(page(`<main><h1>Observed readings</h1><table>${header}<tbody>${values}</tbody></table></main>`));
  assert.ok(result.text.includes('| Site | Reading |\n| --- | --- |\n| A | 4 |\n| B | 8 |'));assert.equal(result.needsAssistance,false);
 }
 const unmarked=extractWebPage(page(`<main><table><tr><td>Site</td><td>Reading</td></tr>${values}</table></main>`));
 assert.doesNotMatch(unmarked.text,/---/);assert.match(unmarked.text,/Site/);
 const rowHeaders=extractWebPage(page('<main><table><tr><th scope="row">A</th><td>4</td></tr><tr><th scope="row">B</th><td>8</td></tr></table></main>'));
 assert.doesNotMatch(rowHeaders.text,/---/);
});

test('merged or uneven table cells stay readable without a guessed rectangular dataset',()=>{
 for(const body of [
  '<tr><th>Site</th><th>Reading</th></tr><tr><td colspan="2">Combined observation</td></tr><tr><td>B</td><td>8</td></tr>',
  '<tr><th>Site</th><th>Reading</th></tr><tr><td rowspan="2">A</td><td>4</td></tr><tr><td>8</td></tr>',
  '<tr><th>Site</th><th>Reading</th></tr><tr><td>A</td><td>4</td><td>Extra note</td></tr><tr><td>B</td><td>8</td></tr>'
 ]){
  const result=extractWebPage(page(`<main><h1>Irregular observations</h1><table>${body}</table></main>`));
  assert.match(result.warnings.join(' '),/no rectangular dataset/);assert.match(result.text,/Row 1: \[1\] Site ; \[2\] Reading/);assert.match(result.text,/8/);assert.doesNotMatch(result.text,/---|^\|/m);assert.ok(result.text.includes('\n\nRow 2:'));
 }
});
