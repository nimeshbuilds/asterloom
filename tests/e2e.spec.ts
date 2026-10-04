import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';

const notes = 'Packet: a small unit of information carried across a computer network.\nRouter: a device that forwards packets between different computer networks.\nSwitch: a device that connects devices inside a local area network.\nLatency: the time it takes data to travel from one point to another.\n1. Check the physical network cable.\n2. Inspect the device network settings.\n3. Test the connection to a known host.\n4. Record the result of the connectivity test.';

async function openLibrary(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What will you discover today?' })).toBeVisible();
  await expect(page.locator('.notebook-card')).toHaveCount(3);
  const strayText = await page.evaluate(() => [...document.body.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).map(node => node.textContent?.slice(0, 100)));
  expect(strayText, 'Production HTML must not emit bundled JavaScript as page text').toEqual([]);
}
async function createNotebook(page: Page, title: string, sourceTitle = 'Networking notes') {
  await page.getByRole('button', { name: 'Create a world', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Notebook title' }).fill(title);
  await page.getByRole('button', { name: 'Paste notes', exact: true }).click();
  await page.getByLabel('Source title', { exact: true }).fill(sourceTitle);
  await page.getByLabel('Your material', { exact: true }).fill(notes);
  await page.getByRole('button', { name: 'Add material', exact: false }).click();
  await expect(page.locator('.source-main').filter({ hasText: sourceTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Build learning game', exact: false }).click();
  await expect(page.locator('.challenge-review').first()).toBeVisible();
}
async function exportDownload(page: Page, kind: 'pack' | 'html'): Promise<Download> {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.filter({ hasText: 'A world worth sharing' }).isVisible())) {
    const editorButton = page.getByRole('button', { name: 'Export', exact: true });
    if (await editorButton.isVisible()) await editorButton.click();
    else await page.getByRole('button', { name: 'Export this notebook', exact: false }).click();
  }
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: kind === 'pack' ? /Editable notebook/ : /Double-click browser game/ }).click();
  return event;
}
async function closeDialog(page: Page) { await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click(); }

test('sample play preserves the selected answer, feedback and progress across reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let aiCalls = 0; page.on('request', request => { if (request.url().includes('/api/generate')) aiCalls++; });
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  await expect(page.locator('.challenge-meta')).toContainText('CHALLENGE 1');
  const firstChoice = page.locator('.answer-option').first();
  const choiceText = await firstChoice.textContent();
  await firstChoice.click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click();
  await expect(page.locator('.answer-option.selected')).toHaveText(choiceText ?? '');
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Continue exploring', exact: false }).click();
  await expect(page.locator('.challenge-meta')).toContainText('CHALLENGE 2');
  expect(aiCalls).toBe(0); expect(errors).toEqual([]);
});

test('hiding a hint cannot restore independent recall credit after pause and reload', async ({ page }, testInfo) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  await page.getByRole('button', { name: 'A little hint', exact: false }).click();
  await page.getByRole('button', { name: 'Hide hint', exact: false }).click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click();
  await page.locator('.answer-option').filter({ hasText: /Star$/ }).click();
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(page.locator('.answer-feedback.success')).toBeVisible();
  await expect(page.locator('.xp-pill')).toHaveText('0 XP');
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await exportDownload(page, 'pack');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save my personal progress separately', exact: false }).click();
  const file = testInfo.outputPath('assisted-progress.json'); await (await event).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8')).progress;
  expect(saved.xp).toBe(0); expect(saved.completedCardIds).toEqual([]);
  expect(saved.activeSession.state).toMatchObject({ assisted: true, hint: false, independentCount: 0 });
});

test('create, edit, export exactly one notebook, import, and keep the other notebook private', async ({ page }, testInfo) => {
  await openLibrary(page);
  await createNotebook(page, 'Networks for explorers');
  await page.getByRole('button', { name: 'Edit challenge 1', exact: true }).click();
  await page.getByLabel('Question or situation').fill('Which network term describes this source definition?');
  await page.getByRole('button', { name: 'Save challenge', exact: false }).click();
  await expect(page.locator('.challenge-review').first()).toContainText('Which network term describes this source definition?');
  await page.getByRole('button', { name: 'Rebuild from sources', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Which network term describes this source definition?', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await createNotebook(page, 'Private second notebook', 'Do not share these notes');
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Networks for explorers', exact: true }).click();
  const download = await exportDownload(page, 'pack');
  const target = testInfo.outputPath('networks.learnpack'); await download.saveAs(target);
  const text = await readFile(target, 'utf8'); const pack = JSON.parse(text);
  expect(pack.format).toBe('learnpack'); expect(pack.notebook.title).toBe('Networks for explorers');
  expect(pack.notebook.sources).toHaveLength(1); expect(pack.notebook.cards.length).toBeGreaterThan(5);
  expect(text).not.toContain('Private second notebook'); expect(text).not.toContain('Do not share these notes');
  expect(pack.notebook.cards.find((card: { prompt: string }) => card.prompt === 'Which network term describes this source definition?').reviewStatus).toBe('reviewed');
  expect(new Set(pack.notebook.cards.map((card: { id: string }) => card.id)).size).toBe(pack.notebook.cards.length);
  await closeDialog(page);
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByLabel('Import learning notebook').setInputFiles(target);
  await expect(page.getByRole('heading', { name: 'Networks for explorers · imported copy', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Networks for explorers · imported copy', exact: true })).toBeVisible();
});

test('an existing assistant can refine wording through a checked local JSON exchange', async ({ page }, testInfo) => {
  await openLibrary(page); let aiCalls = 0;
  page.on('request', request => { if (request.url().includes('/api/generate')) aiCalls++; });
  await createNotebook(page, 'Assistant wording exchange');
  await page.getByRole('button', { name: 'Refine with optional AI', exact: false }).click();
  await page.getByText('Use an assistant subscription you already have', { exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save prompt', exact: false }).click();
  const file = testInfo.outputPath('prepared-prompt.txt'); await (await event).saveAs(file);
  const prompt = await readFile(file, 'utf8'); const cards = JSON.parse(prompt.split('REFERENCE DATA:\n')[1]);
  expect(cards.length).toBeLessThanOrEqual(12);
  cards[0].prompt = 'Choose the term that matches this source definition.';
  await page.getByRole('textbox', { name: 'Paste the assistant’s JSON reply', exact: true }).fill(JSON.stringify({ cards }));
  await page.getByRole('button', { name: 'Validate and apply draft', exact: false }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.challenge-review').first()).toContainText(cards[0].prompt);
  const exported = await exportDownload(page, 'pack'); const packFile = testInfo.outputPath('refined.learnpack'); await exported.saveAs(packFile);
  const notebook = JSON.parse(await readFile(packFile, 'utf8')).notebook;
  expect(notebook.cards[0]).toMatchObject({ prompt: cards[0].prompt, answer: cards[0].answer, evidence: cards[0].evidence, reviewStatus: 'needs-review' });
  expect(aiCalls).toBe(0);
});

test('a full HTML export plays and creates a new remixed game entirely offline', async ({ page, browser }, testInfo) => {
  await openLibrary(page);
  await createNotebook(page, 'The portable network world');
  const exported = await exportDownload(page, 'html');
  const path = testInfo.outputPath('portable-world.html'); await exported.saveAs(path);
  const html = await readFile(path, 'utf8');
  expect(html).toContain('__ASTERLOOM_NOTEBOOK__'); expect(html).toContain('The portable network world');
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  const offline = await context.newPage(); const errors: string[] = []; const external: string[] = [];
  offline.on('pageerror', error => errors.push(error.message));
  offline.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await offline.goto(pathToFileURL(path).href);
  await expect(offline.getByRole('heading', { name: 'The portable network world', exact: true })).toBeVisible();
  await offline.locator('.mission-card').filter({ has: offline.getByRole('heading', { name: 'Recall escape mission', exact: true }) }).click();
  await expect(offline.locator('.answer-option').first()).toBeVisible();
  await offline.locator('.answer-option').first().click();
  await offline.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(offline.locator('.answer-feedback')).toBeVisible();
  await offline.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await offline.getByRole('button', { name: 'Make a remix', exact: false }).click();
  await offline.getByRole('textbox', { name: 'Notebook title' }).fill('Offline learner remix');
  await offline.getByRole('button', { name: 'Paste notes', exact: true }).click();
  await offline.getByLabel('Source title', { exact: true }).fill('New offline ideas');
  await offline.getByLabel('Your material', { exact: true }).fill('Protocol: agreed rules that devices follow when they communicate with each other.\nAddress: a value that identifies a device or interface on a network.');
  await offline.getByRole('button', { name: 'Add material', exact: false }).click();
  await offline.getByRole('button', { name: 'Build learning game', exact: false }).click();
  const remixDownload = await exportDownload(offline, 'html');
  const remixPath = testInfo.outputPath('remixed-world.html'); await remixDownload.saveAs(remixPath);
  const second = await browser.newContext({ offline: true }); const recipient = await second.newPage();
  await recipient.goto(pathToFileURL(remixPath).href);
  await expect(recipient.getByRole('heading', { name: 'Offline learner remix', exact: true })).toBeVisible();
  await recipient.getByRole('button', { name: 'Open studio', exact: false }).click();
  await expect(recipient.locator('.source-main').filter({ hasText: 'New offline ideas' })).toBeVisible();
  expect(external).toEqual([]); expect(errors).toEqual([]);
  await second.close(); await context.close();
});

test('optional artwork remains a reviewed source-bound presentation asset through offline remix', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT5sAAAAASUVORK5CYII=';
  let imageCalls = 0; let sent: any;
  await page.route('**/api/generate-image', route => { imageCalls++; sent = route.request().postDataJSON(); return route.fulfill({ json: { dataUrl: pixel } }); });
  await openLibrary(page); await createNotebook(page, 'Visual learning world');
  await page.getByRole('tab', { name: /Game design/ }).click();
  await page.getByRole('textbox', { name: 'Visual title', exact: true }).fill('A packet illustration');
  await page.getByRole('textbox', { name: 'Exact source passage', exact: true }).fill(notes.split('\n')[0]);
  await page.getByRole('combobox', { name: 'Role in the game', exact: true }).selectOption('instructional');
  await page.getByText('Optional AI illustration', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Image provider', exact: true }).selectOption('compatible');
  await page.getByRole('textbox', { name: 'Image model ID', exact: true }).fill('test-image-model');
  await page.getByLabel('API key', { exact: true }).fill('private-image-key');
  await page.getByRole('textbox', { name: 'Endpoint base URL', exact: true }).fill('https://image-provider.example/v1');
  await page.getByRole('button', { name: /Generate one draft/ }).click();
  await expect(page.locator('.visual-gallery')).toContainText('Draft · review required');
  expect(sent.prompt).toContain(notes.split('\n')[0]); expect(sent.prompt).not.toContain(notes.split('\n')[1]);
  const draftDownload = await exportDownload(page, 'pack'); const draftPath = testInfo.outputPath('draft-visual.learnpack'); await draftDownload.saveAs(draftPath);
  const draftText = await readFile(draftPath, 'utf8'); const draft = JSON.parse(draftText).notebook;
  expect(draft.artwork).toHaveLength(1); expect(draft.artwork[0].reviewStatus).toBe('draft'); expect(draft.sources).toHaveLength(1);
  expect(draftText).not.toContain('private-image-key'); expect(draftText).not.toContain('image-provider.example');
  await closeDialog(page);
  await page.getByRole('button', { name: 'I checked this visual against the source', exact: false }).click();
  await expect(page.locator('.visual-gallery')).toContainText('Reviewed visual');
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Visual learning world', exact: true }).click();
  await expect(page.locator('.learning-figures img')).toHaveCount(1);
  await page.locator('.mission-card').filter({ has: page.getByRole('heading', { name: 'Recall escape mission', exact: true }) }).click();
  await page.getByRole('button', { name: 'View learning figures', exact: true }).click();
  await expect(page.locator('.learning-figures img')).toBeVisible();
  await page.getByRole('button', { name: 'Hide learning figures', exact: true }).click();
  await page.locator('.answer-option').filter({ hasText: /Packet$/ }).click();
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(page.locator('.answer-feedback.success')).toBeVisible(); await expect(page.locator('.xp-pill')).toHaveText('0 XP');
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  const htmlDownload = await exportDownload(page, 'html'); const htmlPath = testInfo.outputPath('visual.html'); await htmlDownload.saveAs(htmlPath);
  const context = await browser.newContext({ offline: true }); const learner = await context.newPage();
  await learner.goto(pathToFileURL(htmlPath).href);
  await expect(learner.locator('.learning-figures img')).toHaveCount(1);
  await learner.getByRole('button', { name: 'Make a remix', exact: false }).click();
  await learner.getByRole('tab', { name: /Game design/ }).click();
  await expect(learner.locator('.visual-gallery')).toContainText('Reviewed visual');
  await learner.getByRole('textbox', { name: 'Exact source passage', exact: true }).fill(notes.split('\n')[0]);
  await learner.getByLabel('Upload source-grounded visual', { exact: true }).setInputFiles({ name: 'my-visual.png', mimeType: '', buffer: Buffer.from(pixel.split(',')[1], 'base64') });
  await expect(learner.locator('.visual-gallery article')).toHaveCount(2);
  const remixed = await exportDownload(learner, 'pack'); const remixPath = testInfo.outputPath('visual-remix.learnpack'); await remixed.saveAs(remixPath);
  const remix = JSON.parse(await readFile(remixPath, 'utf8')).notebook;
  expect(remix.artwork.map((asset: any) => asset.reviewStatus)).toEqual(['reviewed', 'draft']); expect(remix.sources).toHaveLength(1);
  expect(imageCalls).toBe(1); await context.close();
});

test('the catalog exposes all 75 recipes and source requirements with working filters', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Game library', exact: true }).click();
  await expect(page.locator('.scaffold-card')).toHaveCount(75);
  await page.getByRole('combobox', { name: 'Filter game mechanic' }).selectOption('sequence');
  const count = await page.locator('.scaffold-card').count(); expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(75);
  await page.locator('.scaffold-card').first().click();
  await expect(page.getByRole('heading', { name: 'Prepare these materials' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create with this recipe', exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filter game mechanic' }).selectOption('all');
  await page.getByRole('button', { name: 'Ages 3–5', exact: true }).click();
  await expect(page.locator('.scaffold-card')).toHaveCount(5);
});

test('TXT, Markdown and subtitle files import locally and searchable evidence builds without AI', async ({ page }, testInfo) => {
  await openLibrary(page);
  let aiCalls = 0; page.on('request', request => { if (request.url().includes('/api/generate')) aiCalls++; });
  await page.getByRole('button', { name: 'Create a world', exact: true }).last().click();
  await page.getByLabel('Notebook title', { exact: true }).fill('A mixed source collection');
  await page.getByLabel('Upload source files', { exact: true }).setInputFiles([
    { name: 'network-notes.txt', mimeType: 'text/plain', buffer: Buffer.from(notes) },
    { name: 'ocean-notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Ocean notes\nCurrent: water moving in a consistent direction through the ocean.\nTide: a periodic change in sea level caused largely by gravitational forces.') },
    { name: 'short-lecture.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nRepeated practice gives learners more opportunities to recall information from memory.') },
  ]);
  // Files may arrive without MIME metadata on desktop operating systems.
  await page.getByLabel('Upload source files', { exact: true }).setInputFiles({ name: 'tiny-diagram.png', mimeType: '', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT5sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.locator('.source-row')).toHaveCount(4);
  await expect(page.locator('.source-row .status-pill.ready')).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Search source materials' }).fill('Router');
  await expect(page.locator('.search-hit').first()).toContainText('forwards packets');
  await page.locator('.source-main').filter({ hasText: 'short-lecture.vtt' }).click();
  await expect(page.getByRole('textbox', { name: 'Readable source text', exact: true })).toHaveValue('Repeated practice gives learners more opportunities to recall information from memory.');
  await page.getByRole('button', { name: 'Done', exact: false }).click();
  await page.getByRole('button', { name: 'Build learning game', exact: false }).click();
  expect(await page.locator('.challenge-review').count()).toBeGreaterThan(8);
  const pack = await exportDownload(page, 'pack'); const target = testInfo.outputPath('mixed-sources.learnpack'); await pack.saveAs(target);
  const image = JSON.parse(await readFile(target, 'utf8')).notebook.sources.find((source: { title: string }) => source.title === 'tiny-diagram.png');
  expect(image).toMatchObject({ kind: 'image', mime: 'image/png', status: 'needs-transcript' });
  expect(image.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(aiCalls).toBe(0);
});

test('all seven structured systems evaluate, preserve unfinished work, and travel with offline exports', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await expect(page.locator('.system-mission')).toHaveCount(8);
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Move Define the question up', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  await expect(page.locator('.structured-sequence li').first()).toContainText('Define the question');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Move Collect observations up', exact: true }).click();
  await page.getByRole('button', { name: 'Move Analyze observations up', exact: true }).click();
  const check = async () => {
    await page.getByRole('button', { name: 'Check my work', exact: true }).click();
    await expect(page.locator('.structured-feedback.correct')).toContainText('Your work holds together.');
  };
  const choose = async (title: string) => { await page.locator('.structured-path button').filter({ hasText: title }).click(); };
  await check();
  await choose('Observation or interpretation?');
  await page.locator('.structured-classification fieldset').nth(0).getByRole('checkbox', { name: 'Observation', exact: true }).check();
  await page.locator('.structured-classification fieldset').nth(1).getByRole('checkbox', { name: 'Interpretation', exact: true }).check();
  await check();
  await choose('An explicit access policy');
  await page.getByRole('radio', { name: /Allow the request/ }).check();
  await check();
  await choose('Follow a message');
  for (const [from, to] of [['build', 'send'], ['send', 'receive']]) {
    await page.getByRole('combobox', { name: 'From', exact: true }).selectOption(from);
    await page.getByRole('combobox', { name: 'Relationship', exact: true }).selectOption('precedes');
    await page.getByRole('combobox', { name: 'To', exact: true }).selectOption(to);
    await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  }
  await check();
  await choose('Plan a small lab');
  await page.getByRole('spinbutton').nth(0).fill('2');
  await page.getByRole('spinbutton').nth(1).fill('1');
  await check();
  await choose('Review an explanation');
  await page.getByRole('radio', { name: /A specific observation supports the claim/ }).check();
  await check();
  await choose('Label a transformation');
  await page.getByText('Use the text placement controls', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Place Input', exact: true }).selectOption('left');
  await page.getByRole('combobox', { name: 'Place Transformation', exact: true }).selectOption('center');
  await page.getByRole('combobox', { name: 'Place Output', exact: true }).selectOption('right');
  await check();
  await choose('An agent permission boundary');
  await page.getByRole('radio', { name: /Ask for explicit approval/ }).check();
  await check();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await expect(page.locator('.system-mission.completed')).toHaveCount(8);
  await expect(page.locator('.world-statbar')).toContainText('400');
  const packDownload = await exportDownload(page, 'pack'); const packPath = testInfo.outputPath('structured.learnpack'); await packDownload.saveAs(packPath);
  const exported = JSON.parse(await readFile(packPath, 'utf8')); expect(exported.notebook.activities).toHaveLength(8);
  const progressEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save my personal progress separately', exact: false }).click();
  const progressFile = testInfo.outputPath('structured.progress.json'); await (await progressEvent).saveAs(progressFile);
  const backup = JSON.parse(await readFile(progressFile, 'utf8')); expect(Object.values(backup.progress.structured).every((entry: any) => entry.completed)).toBe(true);
  expect(backup.progress.structured['example-budget'].response).toMatchObject({ quantities: { small: 2, large: 1 } });
  const htmlDownload = await exportDownload(page, 'html'); const htmlPath = testInfo.outputPath('structured.html'); await htmlDownload.saveAs(htmlPath);
  const context = await browser.newContext({ offline: true }); const recipient = await context.newPage();
  await recipient.goto(pathToFileURL(htmlPath).href);
  await expect(recipient.locator('.system-mission')).toHaveCount(8);
  await recipient.locator('.system-mission').filter({ hasText: 'Plan a small lab' }).click();
  await expect(recipient.getByRole('spinbutton').nth(0)).toHaveValue('0');
  await recipient.getByRole('spinbutton').nth(0).fill('2'); await recipient.getByRole('spinbutton').nth(1).fill('1');
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
  await context.close();
});

test('all ten recorded music tracks decode locally and can be stopped', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio; (window as any).__testMusic = [];
    window.Audio = class extends NativeAudio { constructor(src?: string) { super(src); if (src) (window as any).__testMusic.push(this); } } as typeof Audio;
  });
  await openLibrary(page);
  await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
  await expect(page.locator('.track-button')).toHaveCount(10);
  for (let index = 0; index < 10; index++) {
    await page.locator('.track-button').nth(index).click();
    await expect.poll(() => page.evaluate(() => {
      const audio = (window as any).__testMusic.at(-1) as HTMLAudioElement | undefined;
      return !!audio && audio.readyState >= 2 && Number.isFinite(audio.duration) && audio.duration > 1 && audio.error === null;
    })).toBe(true);
  }
  await page.getByRole('button', { name: 'Stop music', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__testMusic.every((audio: HTMLAudioElement) => audio.paused))).toBe(true);
});

test('library, creator, recall game and all structured boards pass serious accessibility checks', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLibrary(page);
  const audit = async (screen: string) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await testInfo.attach(`accessibility-${screen}`, { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
    await writeFile(`.qa/accessibility-${screen}.json`, JSON.stringify(result.violations, null, 2));
    expect.soft(result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious').map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), screen).toEqual([]);
  };
  await audit('library');
  await page.getByRole('button', { name: 'Edit A small guide to the cosmos', exact: true }).click(); await audit('creator');
  await page.getByRole('button', { name: 'Play game', exact: false }).click(); await audit('game');
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await page.locator('.system-mission').first().click();
  for (let index = 0; index < 7; index++) {
    await page.locator('.structured-path button').nth(index).click();
    await audit(`structured-${index}`);
  }
});

test('mobile library, studio, dialog, and player fit a narrow screen and support keyboard use', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary(page);
  const noOverflow = async () => { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); };
  await noOverflow();
  await page.getByRole('button', { name: 'Create a world', exact: true }).last().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toBeVisible();
  await noOverflow();
  await page.getByRole('button', { name: 'Paste notes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await noOverflow();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  await noOverflow();
  await page.locator('.answer-option').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.answer-option.selected')).toBeVisible();
  await page.screenshot({ path: '.qa/mobile-player.png', fullPage: true });
});

test('two separate learners can join a private asynchronous room', async ({ browser }) => {
  test.setTimeout(90_000);
  const firstContext = await browser.newContext(); const secondContext = await browser.newContext();
  const first = await firstContext.newPage(); const second = await secondContext.newPage();
  for (const page of [first, second]) {
    await openLibrary(page);
    await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
    await page.getByRole('button', { name: 'Open challenge room', exact: false }).click();
  }
  await first.getByLabel('Your player name', { exact: true }).fill('Nova');
  await first.getByRole('button', { name: 'Create private room', exact: false }).click();
  await expect(first.getByRole('table', { name: 'Room standings' })).toBeVisible();
  const invite = await first.getByRole('textbox', { name: 'Your room invitation' }).inputValue(); expect(invite.length).toBeGreaterThan(10);
  await second.getByLabel('Your player name', { exact: true }).fill('River');
  await second.getByLabel('Invitation code', { exact: true }).fill(invite);
  await second.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(second.getByRole('table', { name: 'Room standings' })).toContainText('Nova');
  await expect(second.getByRole('table', { name: 'Room standings' })).toContainText('River');
  await first.getByRole('button', { name: 'Refresh standings', exact: true }).click();
  await expect(first.getByRole('table', { name: 'Room standings' })).toContainText('River');
  await closeDialog(first);
  await first.getByRole('button', { name: 'Begin adventure', exact: false }).click();
  for (let index = 0; index < 8; index++) {
    await first.locator('.answer-option').first().click();
    await first.getByRole('button', { name: 'Check my answer', exact: false }).click();
    await first.getByRole('button', { name: index === 7 ? 'Complete this chapter' : 'Continue exploring', exact: false }).click();
  }
  await expect(first.getByRole('heading', { name: 'Your next chapter is taking shape.' })).toBeVisible();
  await first.getByRole('button', { name: 'Return to my notebook', exact: false }).click();
  await firstContext.setOffline(true);
  await first.getByRole('button', { name: 'Open challenge room', exact: false }).click();
  await expect(first.getByText('1 result queued', { exact: true })).toBeVisible();
  await firstContext.setOffline(false);
  await first.getByRole('button', { name: 'Refresh standings', exact: true }).click();
  await expect(first.getByRole('row').filter({ hasText: 'Nova' }).getByRole('cell').nth(1)).toHaveText('1');
  await second.getByRole('button', { name: 'Refresh standings', exact: true }).click();
  await expect(second.getByRole('row').filter({ hasText: 'Nova' }).getByRole('cell').nth(1)).toHaveText('1');
  await firstContext.close(); await secondContext.close();
});


test('structured activity scores synchronize between two invited learners', async ({ browser }) => {
  const hostContext = await browser.newContext(); const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  for (const page of [host, guest]) {
    await openLibrary(page);
    await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
    await page.getByRole('button', { name: 'Open challenge room', exact: false }).click();
  }
  await host.getByLabel('Your player name', { exact: true }).fill('Sage');
  await host.getByRole('button', { name: 'Create private room', exact: false }).click();
  await expect(host.getByRole('table', { name: 'Room standings' })).toBeVisible();
  const invite = await host.getByRole('textbox', { name: 'Your room invitation' }).inputValue();
  await guest.getByLabel('Your player name', { exact: true }).fill('Linden');
  await guest.getByLabel('Invitation code', { exact: true }).fill(invite);
  await guest.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(guest.getByRole('table', { name: 'Room standings' })).toContainText('Sage');
  await closeDialog(host);
  await host.locator('.system-mission').filter({ hasText: 'Plan a small lab' }).click();
  await host.getByRole('spinbutton').nth(0).fill('2'); await host.getByRole('spinbutton').nth(1).fill('1');
  await host.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(host.locator('.structured-feedback.correct')).toBeVisible();
  await host.getByRole('button', { name: 'Save & return', exact: false }).click();
  // Complete a second mission while the room dialog remains closed.
  await host.locator('.system-mission').filter({ hasText: 'An explicit access policy' }).click();
  await host.getByRole('radio', { name: /Allow the request/ }).check();
  await host.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(host.locator('.structured-feedback.correct')).toBeVisible();
  await host.getByRole('button', { name: 'Save & return', exact: false }).click();
  await host.getByRole('button', { name: 'Open challenge room', exact: false }).click();
  await expect(host.getByRole('row').filter({ hasText: 'Sage' }).getByRole('cell').nth(1)).toHaveText('2');
  await guest.getByRole('button', { name: 'Refresh standings', exact: true }).click();
  await expect(guest.getByRole('row').filter({ hasText: 'Sage' }).getByRole('cell').nth(2)).toHaveText('2,000');
  await hostContext.close(); await guestContext.close();
});
