import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

// Generate static, progressively enhanced guides. Pages needs no build service.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'site');
const directory = path.join(site, 'scenarios');
const guides = JSON.parse(await readFile(path.join(root, 'scripts/site-scenarios.json'), 'utf8'));
const kits = JSON.parse(await readFile(path.join(directory, 'sources/source-manifest.json'), 'utf8'));
const base = 'https://nimeshbuilds.github.io/asterloom/';
const release = 'https://github.com/nimeshbuilds/asterloom/releases/tag/v0.7.14';
const license = await readFile(path.join(site, 'LICENSE'), 'utf8');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = index => String(index + 1).padStart(2, '0');
const controls = ['Connect AI to create', 'Connect your AI', 'Back to my game', 'Create game with AI', 'Your adventure is ready', 'Create a game', 'Paste notes', 'Source title', 'Your material', 'Your materials', 'Add material', 'Make it yours', 'Age group', 'Learning goal', 'Understand and remember', 'Follow a procedure', 'Investigate and explain', 'Explore something new', 'Learn the ideas', 'Next idea', 'Play game', 'Source materials', 'Download readable text', 'Download original file', 'Upload files', 'Connect Aster to AI', 'Enable AI for Aster', 'Ask Aster', 'Current activity & tools', 'What is happening?', 'What is next?', 'Download sources', 'Enable game sound', 'Adjust game audio', 'Follow this game', 'Keep this track', 'Play reward sound', 'Background score', 'Game & Aster sounds', 'Edit materials', 'Add sources & recreate', 'Export this notebook', 'Editable notebook', 'Your games', 'Import a notebook', 'Open game', 'Mac app · Universal', 'More options', 'Make a remix', 'Save & return', 'Saved on this device', 'Continue game'];
const controlPattern = new RegExp(controls.map(esc).sort((a, b) => b.length - a.length).map(text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const prose = text => esc(text).replace(controlPattern, label => `<strong>${label}</strong>`);
const arrow = '<span aria-hidden="true">↗</span>';
const ids = new Set(guides.map(guide => guide.id));
if (guides.length !== 10 || ids.size !== 10 || kits.length !== 10) throw new Error('Exactly ten unique guides and source kits are required.');
const allFiles = {};
const zipOptions = { level: 9, mtime: new Date('2026-11-07T12:00:00Z') };

function head(title, description, relative, url) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#10252b">
<title>${esc(title)} · Asterloom</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${base}${url}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} · Asterloom">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${base}${url}">
<meta property="og:image" content="${base}assets/social-preview.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${relative}assets/icon.svg">
<link rel="preload" href="${relative}assets/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${relative}assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${relative}styles.css"><link rel="stylesheet" href="${relative}scenarios/scenarios.css">
<script src="${relative}scenarios/scenarios.js" defer></script></head>`;
}

function header(relative) {
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="container header-inner">
<a class="wordmark" href="${relative}" aria-label="Asterloom home"><img src="${relative}assets/icon.svg" alt="" width="34" height="34"><span>asterloom</span></a>
<nav aria-label="Main navigation"><a href="${relative}#experience">The experience</a><a href="${relative}scenarios/" aria-current="${relative === '../' ? 'page' : 'false'}">Try a scenario</a><a href="https://github.com/nimeshbuilds/asterloom">GitHub ${arrow}</a></nav>
<a class="button button-small button-outline" href="${relative}#preview">Get the Mac preview ${arrow}</a>
</div></header>`;
}

function footer(relative) {
  return `<footer class="scenario-footer"><div class="container"><a class="wordmark" href="${relative}"><img src="${relative}assets/icon.svg" alt="" width="30" height="30"><span>asterloom</span></a><p>For the joy of figuring things out.</p><nav aria-label="Footer navigation"><a href="${relative}scenarios/">All ten scenarios</a><a href="${relative}LICENSE">Personal learning license</a><a href="https://github.com/nimeshbuilds">By NimeshBuilds ${arrow}</a></nav></div></footer>`;
}

function setup(relative) {
  return `<details class="setup-details"><summary>First time here? Set up Asterloom <span aria-hidden="true">+</span></summary><div class="setup-content">
<ol><li><strong>Install the Mac preview.</strong> Download the ZIP from the <a href="${release}">v0.7.14 release</a>, expand it, and open Asterloom. It supports macOS 13 or later on Apple silicon and Intel. There is no Windows installer in this release.</li>
<li><strong>Connect AI for creation.</strong> In a new game, choose <strong>Connect AI to create</strong>. In <strong>Connect your AI</strong>, select an available provider, complete its connection flow, select an available model, then choose <strong>Back to my game</strong>. Provider charges or usage limits may apply.</li>
<li><strong>Keep this guide beside the desktop app.</strong> Download the sample source below, or expand its preview to copy it. The website provides instructions and materials; create and play inside Asterloom.</li></ol>
<p>Finished games play without a live AI connection. AI chat with Aster is a separate, optional connection. These guides use the published preview’s controls; its gameplay is older than the development screenshot on the homepage.</p>
<p>AI creation time and the chosen activity vary with the provider and source. The sample checks help you inspect the result; they are not a guarantee of a particular game or learning outcome. The samples are original fictional material for personal and family learning under the <a href="${relative}LICENSE">Asterloom license</a>.</p>
</div></details>`;
}

function card(guide, index, relative = '../', prefix = './') {
  return `<article class="scenario-card" data-category="${guide.category}"><a class="scenario-card-link" href="${prefix}${guide.id}/">
<div class="scenario-card-art"><img src="${relative}assets/${guide.art}" width="960" height="540" alt="" loading="lazy"><span class="scenario-number">${number(index)}</span><span class="scenario-category">${esc(guide.categoryLabel)}</span></div>
<div class="scenario-card-copy"><h3>${esc(guide.title)}</h3><p>${esc(guide.outcome)}</p><span class="scenario-card-bottom">${guide.steps.length} steps · Source included <span aria-hidden="true">↗</span></span></div>
</a></article>`;
}

for (const [index, guide] of guides.entries()) {
  if (!/^[a-z0-9-]+$/.test(guide.id) || !ids.has(guide.next)) throw new Error(`Invalid guide ID or next guide: ${guide.id}`);
  if (!['create', 'learn', 'extend'].includes(guide.category)) throw new Error(`Invalid category: ${guide.id}`);
  if (!['world-studio.webp', 'world-observatory.webp', 'world-expedition.webp', 'hero-outpost-small.webp'].includes(guide.art)) throw new Error('Invalid guide art');
  if (!Array.isArray(guide.steps) || guide.steps.length < 5 || guide.steps.length > 8) throw new Error(`Expected 5–8 steps: ${guide.id}`);
  const kit = kits.find(kit => kit.id === guide.id);
  if (!kit?.files?.length) throw new Error(`Missing source kit: ${guide.id}`);
  const files = await Promise.all(kit.files.map(async file => {
    if (!/^[a-z0-9-]+\.(txt|md|vtt|srt)$/.test(file.name)) throw new Error(`Invalid source file: ${file.name}`);
    const content = await readFile(path.join(directory, 'sources', file.name), 'utf8');
    return {...file, content};
  }));
  const checks = guide.checks?.length ? guide.checks : kit.expectedEvidenceChecks;
  if (!checks?.length) throw new Error(`Missing source checks: ${guide.id}`);
  const next = guides.find(item => item.id === guide.next);
  const readme = `${guide.title}\n${'='.repeat(guide.title.length)}\n\n${guide.intro}\n\nFollow the illustrated guide: ${base}scenarios/${guide.id}/\n\nThese are ORIGINAL FICTIONAL LEARNING SOURCES, not a prebuilt game or installer.\nUse Asterloom's desktop Mac preview (${release}). AI is required for game creation; completed games can play offline.\n\nSOURCE FILES\n${files.map(f => `${f.name}: ${f.description}`).join('\n')}\n\nSETTINGS\nAge: ${guide.age}\nLearning goal: ${guide.goal}\n\nWALKTHROUGH\n${guide.steps.map((step, i) => `${i + 1}. ${step.title}\n${step.body}\nCheck: ${step.check}`).join('\n\n')}\n\nCHECK YOUR LEARNING\n${checks.map(c => `Q: ${c.question}\nA: ${c.answer}`).join('\n\n')}\n\n${guide.caveat}\n\nAI creation time, wording, and selected activities vary. Review facts against the supplied sources. These instructions were checked against v0.7.14 code, not a fresh AI generation benchmark.\n\nOriginal sample material by NimeshBuilds, 2026.\nPersonal and family learning; see LICENSE.txt for terms.\n`;
  const archive = Object.fromEntries(files.map(file => [file.name, strToU8(file.content)]));
  archive['START-HERE.txt'] = strToU8(readme);
  archive['LICENSE.txt'] = strToU8(license);
  for (const [name, content] of Object.entries(archive)) allFiles[`${guide.id}/${name}`] = content;
  await mkdir(path.join(directory, 'downloads'), {recursive: true});
  await writeFile(path.join(directory, 'downloads', `${guide.id}.zip`), zipSync(archive, zipOptions));
  const html = `${head(guide.title, guide.subtitle + ' ' + guide.outcome, '../../', `scenarios/${guide.id}/`)}
<body class="scenario-page" data-scenario="${guide.id}">${header('../../')}
<main id="main">
<section class="guide-hero"><div class="container guide-hero-grid"><div>
<a class="guide-back" href="../">← All ten scenarios</a><p class="eyebrow">Field guide ${number(index)} / 10 · ${esc(guide.categoryLabel)}</p>
<h1>${esc(guide.title)}</h1><p class="guide-intro">${esc(guide.intro)}</p><a class="button button-gold" href="#walkthrough">Start the walkthrough <span aria-hidden="true">↓</span></a>
</div><figure class="guide-illustration"><img src="../../assets/${guide.art}" width="960" height="540" alt="" fetchpriority="high"><figcaption>World artwork · Your generated game will vary.</figcaption><span class="guide-illustration-index" aria-hidden="true">${number(index)}</span></figure></div></section>
<div class="container guide-content">
<div class="guide-value-strip"><div><span>What you’ll try</span><strong>${esc(guide.subtitle)}</strong></div><div><span>What to look for</span><p>${esc(guide.outcome)}</p></div></div>
${setup('../../')}
<div class="guide-layout"><aside class="guide-sidebar" aria-label="Your scenario kit">
<section class="kit-panel"><p class="eyebrow">Everything to begin</p><h2>Your source kit</h2><p>${files.length} original text ${files.length === 1 ? 'file' : 'files'} + this walkthrough.</p><a class="button button-ink" href="../downloads/${guide.id}.zip" download>Download the kit <span aria-hidden="true">↓</span></a><p class="kit-note">Expand the ZIP. Upload only the named source TXT files. START-HERE.txt is your guide; LICENSE.txt contains the terms. Neither belongs in your learning materials.</p><dl class="guide-settings"><div><dt>Age group</dt><dd>${esc(guide.age)}</dd></div><div><dt>Learning goal</dt><dd>${esc(guide.goal)}</dd></div></dl><a class="text-link" href="#source-material">Preview or copy the sources ↓</a></section>
<section class="guide-progress js-only" hidden aria-labelledby="progress-title"><h2 id="progress-title">Your walkthrough</h2><p data-progress-text>0 of ${guide.steps.length} steps checked</p><progress data-progress max="${guide.steps.length}" value="0" aria-label="Walkthrough steps checked"></progress><p class="progress-note" data-storage-note>Saved in this browser. Separate from your game’s progress and XP.</p><button class="quiet-button" type="button" data-reset>Reset these checkmarks</button></section>
<div class="aster-note"><img src="../../assets/aster-welcome.webp" width="120" height="120" alt="Aster, your learning guide" loading="lazy"><p>“Read the idea. Try it. Then explain why it works.”<span>A good rhythm for any adventure.</span></p></div>
</aside>
<div class="guide-main"><section id="walkthrough" aria-labelledby="walkthrough-title"><p class="eyebrow">One step at a time</p><h2 id="walkthrough-title">Let’s try it.</h2><p class="section-intro">Follow these steps in the desktop app. Mark them here as you go.</p>
<noscript><p class="no-script-note">The complete guide and downloads work without JavaScript. Checkmarks and copy buttons need JavaScript.</p></noscript>
<ol class="walkthrough-list">${guide.steps.map((step, i) => `<li id="step-${i + 1}"><div class="step-heading"><span class="guide-step-number" aria-hidden="true">${number(i)}</span><h3>${esc(step.title)}</h3></div><p>${prose(step.body)}</p><div class="step-check"><strong>You’re ready when</strong><p>${prose(step.check)}</p></div><label class="step-checkbox js-only" hidden><input type="checkbox" data-step="${i}" autocomplete="off"><span>Step ${i + 1} complete</span></label></li>`).join('')}</ol>
</section>
<section class="guide-success" aria-labelledby="success-title"><p class="eyebrow">The payoff</p><h2 id="success-title">What a good result looks like.</h2><ul>${guide.success.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p class="guide-caveat">${esc(guide.caveat)}</p></section>
<section class="source-checks" aria-labelledby="checks-title"><p class="eyebrow">Make the learning visible</p><h2 id="checks-title">Can you explain it?</h2><p>Try answering from memory, then open the source-based answer to compare.</p>${checks.map(item => `<details><summary>${esc(item.question)}</summary><div><p>${esc(item.answer)}</p></div></details>`).join('')}</section>
<section id="source-material" class="source-material" aria-labelledby="source-title"><p class="eyebrow">Know what goes into your game</p><h2 id="source-title">The source material.</h2><p>Original fictional samples by NimeshBuilds. Use the file downloads, or copy the text into <strong>Paste notes</strong>. ${guide.id === 'two-sources' ? 'Keep the update file separate until its step.' : ''}</p>
${files.map((file, i) => `<article class="source-file"><div class="source-file-heading"><div><h3>${esc(file.title)}</h3><p>${esc(file.description)}</p></div><a href="../sources/${file.name}" download>Download ${path.extname(file.name).slice(1).toUpperCase()} ↓</a></div><details><summary>Read or copy this source</summary><div class="source-preview"><button type="button" class="copy-button js-only" hidden data-copy="source-${i}">Copy source text</button><pre id="source-${i}" tabindex="0" aria-label="${esc(file.title)} source text">${esc(file.content)}</pre></div></details></article>`).join('')}
</section>
<section class="guide-help" aria-labelledby="help-title"><h2 id="help-title">If you get stuck.</h2>${guide.troubleshooting.map(item => `<details><summary>${esc(item.question)}</summary><div><p>${esc(item.answer)}</p></div></details>`).join('')}<p class="verification-note">Instructions checked against the v0.7.14 release code. These walkthroughs are not ten prebuilt games or a benchmark of generated output. Your model’s wording, story and activities may differ.</p></section>
<nav class="next-scenario" aria-label="Next scenario"><div><p class="eyebrow">Try another side of Asterloom</p><h2>${esc(next.title)}</h2><p>${esc(next.subtitle)}</p></div><a class="button button-ink" href="../${next.id}/">Next field guide ${arrow}</a></nav>
</div></div></div></main><div class="guide-status" role="status" aria-live="polite" aria-atomic="true" data-status></div>${footer('../../')}</body></html>`;
  await mkdir(path.join(directory, guide.id), {recursive: true});
  await writeFile(path.join(directory, guide.id, 'index.html'), html);
}

allFiles['START-HERE.txt'] = strToU8(`TEN WAYS INTO ASTERLOOM\n\nStart here: ${base}scenarios/\n\nEach folder contains original fictional learning sources, a step-by-step guide, and the personal learning license. These are source kits, not generated games or installers. AI is required to create a game in the desktop Mac preview; finished games can play offline.\n\n${guides.map((guide, i) => `${i + 1}. ${guide.title} — ${guide.subtitle}\n   ${base}scenarios/${guide.id}/`).join('\n\n')}\n\nBy NimeshBuilds, 2026.\n`);
await writeFile(path.join(directory, 'downloads', 'asterloom-ten-scenario-kits.zip'), zipSync(allFiles, zipOptions));

const hub = `${head('Ten ways into Asterloom', 'Ten guided scenarios, original sample sources, and step-by-step walkthroughs. Try creating, learning, asking Aster, saving offline, and sharing a learning game.', '../', 'scenarios/')}
<body class="scenario-page scenario-hub">${header('../')}<main id="main">
<section class="scenario-hub-hero"><div class="container hub-hero-grid"><div><p class="eyebrow">The Asterloom field guides</p><h1>One small source.<br>A new way to <em>learn.</em></h1><p>Ten different ways to try Asterloom. Pick a guide, take its source material, and follow it all the way to a learning adventure of your own.</p><div class="hub-actions"><a class="button button-gold" href="./first-adventure/">Start your first adventure ${arrow}</a><a class="text-link" href="#all-scenarios">Explore all ten ↓</a></div><p class="hub-platform-note">For the desktop Mac preview · AI for creation · Offline play</p></div><a class="hub-feature" href="./first-adventure/"><img src="../assets/hero-outpost-small.webp" alt="" width="960" height="540" fetchpriority="high"><span class="hub-feature-copy"><span class="eyebrow">New here? Start with 01</span><strong>${esc(guides[0].title)}</strong><span>Your first source → your first mission ${arrow}</span></span><span class="art-caption">Illustrative world artwork</span></a></div></section>
<div class="container"><div class="scenario-promise"><div><span>01</span><p><strong>The materials are ready.</strong>Original, short sources you can download or copy.</p></div><div><span>02</span><p><strong>The next step is clear.</strong>Exact controls and a checklist to keep your place.</p></div><div><span>03</span><p><strong>The learning is checkable.</strong>Specific outcomes and answers grounded in the source.</p></div></div>${setup('../')}</div>
<section class="scenario-catalog section" id="all-scenarios" aria-labelledby="catalog-title"><div class="container"><div class="catalog-heading"><div><p class="eyebrow">Choose your next discovery</p><h2 id="catalog-title">Ten guides.<br><em>Ten different possibilities.</em></h2></div><div><p>Start small, then explore a different part of the product. Each guide includes its own material; you can also reuse a finished game where indicated.</p><a class="text-link" href="./downloads/asterloom-ten-scenario-kits.zip" download>Download all ten source kits ↓</a></div></div>
<div class="scenario-filter-bar js-only" hidden><div class="scenario-filters" role="group" aria-label="Filter scenarios"><button type="button" data-filter="all" aria-pressed="true">All ten <span>10</span></button><button type="button" data-filter="create" aria-pressed="false">Create & adapt <span>${guides.filter(g => g.category === 'create').length}</span></button><button type="button" data-filter="learn" aria-pressed="false">Learn & explore <span>${guides.filter(g => g.category === 'learn').length}</span></button><button type="button" data-filter="extend" aria-pressed="false">Keep & share <span>${guides.filter(g => g.category === 'extend').length}</span></button></div><p data-filter-count role="status" aria-live="polite">10 guides</p></div>
<div class="scenario-grid">${guides.map((guide, i) => card(guide, i)).join('')}</div><p class="catalog-note">The illustrations set the mood; they are not screenshots of generated games. All ten kits contain original fictional material. These guides use the published v0.7.14 controls, with generated results that vary by model.</p></div></section>
<section class="scenario-closing"><div class="container"><p class="eyebrow">Then make it yours</p><h2>Bring something<br>you’ve always wanted to learn.</h2><p>After a sample, try a short chapter or a few pages of your own notes. Keep the first source focused, inspect the teaching, and build from there.</p><a class="button button-gold" href="../#preview">Explore the Mac preview ${arrow}</a></div></section>
</main>${footer('../')}</body></html>`;
await writeFile(path.join(directory, 'index.html'), hub);
const featured = [guides[0], guides.find(g => g.id === 'evidence-desk'), guides.find(g => g.id === 'pass-it-on')];
const homeSection = `<section class="scenario-home section" id="try-it" aria-labelledby="try-it-heading"><div class="container"><div class="catalog-heading"><div><p class="eyebrow">Ready when you are</p><h2 id="try-it-heading">Don’t start with<br><em>a blank page.</em></h2></div><div><p>Follow one of ten field guides, each with original sample material, clear steps, and something different to discover about Asterloom.</p><a class="text-link" href="./scenarios/">Explore all ten scenarios ${arrow}</a></div></div><div class="scenario-grid">${featured.map(guide => card(guide, guides.indexOf(guide), './', './scenarios/')).join('')}</div><p class="catalog-note">Guided walkthroughs for the Mac desktop preview. AI is required to create a game; finished games play offline.</p></div></section>`;
const homePath = path.join(site, 'index.html');
let home = await readFile(homePath, 'utf8');
if (!home.includes('<!-- SCENARIOS:START -->')) throw new Error('Missing homepage scenario markers.');
home = home.replace(/<!-- SCENARIOS:START -->[\s\S]*?<!-- SCENARIOS:END -->/, `<!-- SCENARIOS:START -->\n${homeSection}\n<!-- SCENARIOS:END -->`);
await writeFile(homePath, home);
await writeFile(path.join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'scenarios/', ...guides.map(g => `scenarios/${g.id}/`)].map(url => `  <url><loc>${base}${url}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Built ${guides.length} scenario guides, source ZIPs, hub, homepage cards and sitemap.`);
