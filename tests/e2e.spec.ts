import { SHAPE_PICTURE_BUILD } from '../src/lib/pictureBuildExamples';
import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {parsePackage as parsePortableNotebook} from '../src/lib/package';
import {learnBeforeQuest,openBundledNotebook,seedAgedRecallLessons,seedAgedStructuredLessons} from './learningJourney.helpers';
import AxeBuilder from '@axe-core/playwright';
import { PLANT_EXPLANATION } from '../src/lib/compositionExamples';

const notes = 'Packet: a small unit of information carried across a computer network.\nRouter: a device that forwards packets between different computer networks.\nSwitch: a device that connects devices inside a local area network.\nLatency: the time it takes data to travel from one point to another.\n1. Check the physical network cable.\n2. Inspect the device network settings.\n3. Test the connection to a known host.\n4. Record the result of the connectivity test.';

async function openLibrary(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What will you discover today?' })).toBeVisible();
  await expect(page.locator('.notebook-card')).toHaveCount(3);
  const strayText = await page.evaluate(() => [...document.body.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).map(node => node.textContent?.slice(0, 100)));
  expect(strayText, 'Production HTML must not emit bundled JavaScript as page text').toEqual([]);
}
async function createNotebook(page: Page, title: string, sourceTitle = 'Networking notes', material = notes) {
  await page.getByRole('button', { name: 'Create a world', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Notebook title' }).fill(title);
  await page.getByRole('button', { name: 'Paste notes', exact: true }).click();
  await page.getByLabel('Source title', { exact: true }).fill(sourceTitle);
  await page.getByLabel('Your material', { exact: true }).fill(material);
  await page.getByRole('button', { name: 'Add material', exact: false }).click();
  await expect(page.locator('.source-main').filter({ hasText: sourceTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Build learning game', exact: false }).click();
  await expect(page.locator('.challenge-review, .activity-library article').first()).toBeVisible();
}
async function exportDownload(page: Page, kind: 'pack'): Promise<Download> {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.filter({ hasText: 'A world worth sharing' }).isVisible())) {
    const editorButton = page.getByRole('button', { name: 'Export', exact: true });
    if (await editorButton.isVisible()) await editorButton.click();
    else await page.getByRole('button', { name: 'Export this notebook', exact: false }).click();
  }
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: /Editable notebook/ }).click();
  return event;
}
async function closeDialog(page: Page) { await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click(); }
async function campaignActivities(page: Page, completed = false) {
  const more=page.getByRole('button',{name:/^Explore the next \d+ chapters$/});
  for(let i=0;i<200&&await more.isVisible();i++) await more.click();
  return page.locator(completed?'[data-activity-id].completed':'[data-activity-id]');
}


test('pasting source notes prepares a lesson immediately without optional authoring tools',async({page})=>{
 await openLibrary(page);
 await page.getByRole('button',{name:'Create a world',exact:true}).last().click();
 await page.getByRole('textbox',{name:'Notebook title',exact:true}).fill('Learn straight from my notes');
 await page.getByRole('button',{name:'Paste notes',exact:true}).click();
 await page.getByLabel('Source title',{exact:true}).fill('A short water lesson');
 await page.getByLabel('Your material',{exact:true}).fill('The water cycle describes movement of water between the surface and the air. Conditions affect how quickly each process occurs.\n\nEvaporation: Liquid water changes into vapor in the air.\nCondensation: Water vapor changes into liquid droplets.\n\nFor example, droplets on a cool glass are condensed water from the surrounding air. This observation does not show that water passed through the glass.');
 await page.getByRole('button',{name:'Add material',exact:false}).click();
 await expect(page.locator('.automatic-learning-summary')).toContainText('Your learning game is prepared');
 await expect(page.locator('.optional-evidence-tools')).not.toHaveAttribute('open','');
 await expect(page.getByRole('region',{name:'Evidence and learning objectives'})).not.toBeVisible();
 await page.getByRole('button',{name:'Start learning',exact:true}).click();
 await expect(page.getByRole('region',{name:'Learning briefing',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/^Check my (answer|work)$/})).toHaveCount(0);
 await learnBeforeQuest(page);
 await expect(page.getByRole('button',{name:'Check my answer',exact:true})).toBeVisible();
 await page.locator('.answer-option').first().click();
 await page.getByRole('button',{name:'Check my answer',exact:true}).click();
 await expect(page.locator('.answer-feedback')).toBeVisible();
 await expect(page.locator('.xp-pill')).toHaveText('0 XP');
});

test('library initialization blocks creation and imports until persisted notebooks are loaded', async ({ page }) => {
  await page.addInitScript(() => {
    // Pause the final cursor result, after iteration has finished, so the real IDB
    // transaction can close without making cursor.continue() run in an inactive one.
    const original = IDBObjectStore.prototype.openCursor;
    let firstRead = true;
    IDBObjectStore.prototype.openCursor = function (...args) {
      const request = original.apply(this, args);
      if (!firstRead || this.name !== 'records') return request;
      firstRead = false;
      Object.defineProperty(request, 'onsuccess', {
        configurable: true,
        set(callback) {
          request.addEventListener('success', event => {
            if (request.result) callback.call(request, event);
            else (window as any).releaseNotebookRead = () => callback.call(request, event);
          });
        },
      });
      return request;
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).releaseNotebookRead === 'function');
  await expect(page.getByText('Opening your worlds…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a world', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Import learning notebook', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Restore learning progress', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Create a world', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  // A synthetic file change must also be rejected by the entry-point guard.
  await page.getByLabel('Import learning notebook', { exact: true }).setInputFiles({ name: 'premature.learnpack', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Notebook title', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).releaseNotebookRead());
  await expect(page.getByRole('heading', { name: 'What will you discover today?' })).toBeVisible();
  await expect(page.locator('.notebook-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Create a world', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Notebook title', exact: true }).fill('Created after library readiness');
  await expect(page.locator('.save-state')).toContainText('Saved on this device');
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).releaseNotebookRead === 'function');
  await expect(page.getByRole('button', { name: 'Create a world', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).releaseNotebookRead());
  await expect(page.getByRole('button', { name: 'Open Created after library readiness', exact: true })).toBeVisible();
  await expect(page.locator('.notebook-card')).toHaveCount(4);
});

test('advanced laboratories create real models, resume investigations, and travel as an editable notebook', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openLibrary(page); await createNotebook(page, 'The source laboratory');
  await page.getByRole('button', { name: 'Explore advanced laboratories', exact: true }).click();
  await expect(page.locator('.activity-library article')).toHaveCount(13);
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  const choose = async (title: string) => {
    if (await page.locator('.campaign-map').count()) await (await campaignActivities(page)).filter({ hasText: title }).click();
    else await page.locator('.structured-path button').filter({ hasText: title }).click();
    await learnBeforeQuest(page);
  };
  const check = async () => { await page.getByRole('button', { name: 'Check my work', exact: true }).click(); await expect(page.locator('.structured-feedback.correct')).toBeVisible(); };
  await choose('Finish the observation record');
  if(!await page.getByText('Choose pieces directly', { exact: true }).evaluate(node => node.closest('details')?.open)) await page.getByText('Choose pieces directly', { exact: true }).click();
  await page.getByLabel('Complete position 1', { exact: true }).selectOption('observation'); await page.getByLabel('Complete position 2', { exact: true }).selectOption('interpretation'); await check();
  await choose('Continue the signal parade');
  if(!await page.getByText('Choose pieces directly', { exact: true }).evaluate(node => node.closest('details')?.open)) await page.getByText('Choose pieces directly', { exact: true }).click();
  for (const [i, value] of ['circle', 'circle', 'triangle'].entries()) await page.getByLabel(`Complete position ${i + 1}`, { exact: true }).selectOption(value);
  await check();
  await choose('Investigate the greenhouse log');
  await page.getByRole('combobox', { name: 'Explore a column', exact: true }).selectOption('zone'); await page.getByRole('textbox', { name: 'Contains', exact: true }).fill('north');
  await expect(page.locator('.data-record')).toHaveCount(3);
  await page.getByLabel('Your numerical result', { exact: true }).nth(0).fill('20'); await page.getByLabel('Your numerical result', { exact: true }).nth(1).fill('3');
  await page.getByRole('navigation', { name: 'Choose an investigation' }).getByRole('button').first().click();
  for (const name of ['Morning A', 'Morning B']) { await page.getByRole('button', { name: new RegExp('^Inspect '+name+':') }).click(); await page.getByRole('complementary', { name: 'Record inspector' }).getByRole('button', { name: 'Pin to this question', exact: true }).click(); }
  await check();
  await choose('The address works. The name does not.');
  const action = async (name: string) => { await page.getByRole('radio', { name: new RegExp(name) }).check(); await page.getByRole('button', { name: 'Take this action', exact: false }).click(); };
  await action('Test the numeric address'); await action('Inspect resolver settings');
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open The source laboratory', exact: true }).click(); await choose('The address works. The name does not.');
  await expect(page.locator('.scenario-history > ol > li')).toHaveCount(2);
  await action('Correct the resolver'); await action('Verify name lookup');
  for (const observation of ['Numeric-address test', 'Resolver inspection', 'Verification result']) await page.locator('.scenario-observation').filter({ hasText: observation }).getByRole('checkbox').check();
  await check();
  await choose('Build a clean-data route');
  for (const part of ['Record intake', 'Validator', 'Clean archive']) await page.getByRole('button', { name: `Add ${part}`, exact: true }).click();
  await page.getByRole('button', { name: /Record intake.*raw output/ }).click(); await page.getByRole('button', { name: /Validator.*raw input/ }).click();
  await page.getByRole('button', { name: /Validator.*clean output/ }).click(); await page.getByRole('button', { name: /Clean archive.*clean input/ }).click(); await check();
  await page.screenshot({ path: testInfo.outputPath('advanced-construction.png'), fullPage: true, animations: 'disabled' });
  await choose('Build an explanation that holds');
  const solution = PLANT_EXPLANATION.arguments[0].alternatives[1];
  for (const [role, id] of [['Claim', solution.claimId], ['Evidence', solution.evidenceIds[0]], ['Reasoning', solution.warrantId]]) {
    await page.locator('.composition-role-tabs button').filter({ hasText: role }).click();
    await page.locator('.composition-piece-bank button').filter({ hasText: PLANT_EXPLANATION.pieces.find(p => p.id === id)!.text }).click();
    await page.getByRole('button', { name: `Place selected ${role.toLowerCase()}`, exact: true }).click();
  }
  await check();
  await choose('Hear the two-tone signal');
  await expect.poll(() => page.locator('.media-workbench audio').evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('.media-workbench audio').evaluate((element: HTMLAudioElement) => element.play());
  await expect(page.locator('.media-workbench audio')).toHaveJSProperty('paused', true);
  await page.getByRole('radio', { name: 'The lower 220 Hz tone', exact: true }).check();
  await page.getByRole('button', { name: 'Continue recording', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Twice the frequency', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Twice the frequency', exact: true }).check(); await check();
  await expect(page.locator('.structured-feedback')).toHaveCSS('opacity', '1');
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? '')); expect(violations).toEqual([]);
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  const downloaded = await exportDownload(page, 'pack'), file = testInfo.outputPath('advanced-source-laboratory.learnpack'); await downloaded.saveAs(file);
  const context = await browser.newContext(), recipient = await context.newPage(), requests: string[] = [];
  recipient.setDefaultTimeout(15_000); recipient.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4319/')) requests.push(request.url()); });
  await openBundledNotebook(recipient, file);
  await expect((await campaignActivities(recipient))).toHaveCount(13);
  await (await campaignActivities(recipient)).filter({ hasText: 'Hear the two-tone signal' }).click(); await learnBeforeQuest(recipient);
  await expect.poll(() => recipient.locator('.media-workbench audio').evaluate((e: HTMLAudioElement) => e.readyState)).toBeGreaterThanOrEqual(1);
  await recipient.getByRole('button', { name: /2 · 0:03/ }).click(); await recipient.getByRole('radio', { name: 'Twice the frequency', exact: true }).check();
  await recipient.getByRole('button', { name: /1 · 0:01/ }).click(); await recipient.getByRole('radio', { name: 'The lower 220 Hz tone', exact: true }).check();
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click(); await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
  expect(requests).toEqual([]); expect(errors).toEqual([]); await context.close();
});

test('dialogue and prompt comparison preserve commitments through a bundled-notebook renderer', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await openLibrary(page); await createNotebook(page, 'Conversation and evidence');
  await page.getByRole('button', { name: 'Try prediction & team labs', exact: true }).click();
  await expect(page.locator('.activity-library article')).toHaveCount(10);
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  const choose = async (title: string) => {
    if (await page.locator('.campaign-map').count()) await (await campaignActivities(page)).filter({ hasText: title }).click();
    else await page.locator('.structured-path button').filter({ hasText: title }).click();
    await learnBeforeQuest(page);
  };
  await choose('A controlled prompt comparison');
  await page.getByRole('button', { name: /Variant · two bullet points Add/ }).click();
  await expect(page.getByRole('button', { name: 'Inspect baseline output', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'I expect no visible format difference in these outputs.', exact: true }).check();
  await page.getByRole('button', { name: 'Record prediction before inspection', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect baseline output', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open Conversation and evidence', exact: true }).click(); await choose('A controlled prompt comparison');
  await expect(page.locator('.scenario-output')).toHaveCount(1);
  await page.getByRole('button', { name: 'Inspect variant output', exact: true }).click();
  await page.getByRole('group', { name: 'Requested two-bullet format', exact: true }).getByRole('radio', { name: 'Variant · two bullet points', exact: true }).check();
  await page.getByRole('group', { name: 'Both input facts retained', exact: true }).getByRole('radio', { name: 'Baseline · open summary', exact: true }).check();
  await page.getByRole('radio', { name: 'This supplied pair differs against this rubric; it does not prove the change always works.', exact: true }).check();
  await page.getByRole('button', { name: 'Record comparison review', exact: true }).click();
  for (const name of ['Supplied baseline output', 'Supplied variant output']) await page.getByRole('checkbox', { name: new RegExp(name) }).check();
  await page.getByRole('button', { name: 'Check my work', exact: true }).click(); await expect(page.locator('.structured-feedback.correct')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('prompt-comparison.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  const download = await exportDownload(page, 'pack'), file = testInfo.outputPath('conversation-evidence.learnpack'); await download.saveAs(file);
  const context = await browser.newContext(), recipient = await context.newPage();
  try {
    await openBundledNotebook(recipient, file);
    await (await campaignActivities(recipient)).filter({ hasText: 'One tea, to take away' }).click(); await learnBeforeQuest(recipient);
    for (const phrase of ['Quisiera un té, por favor.', 'Para llevar, gracias.']) {
      await recipient.getByRole('radio', { name: phrase, exact: true }).check();
      await recipient.getByRole('button', { name: 'Say this response', exact: true }).click();
    }
    await recipient.getByRole('radio', { name: 'Different polite expressions can request the same tea and takeaway goal.', exact: true }).check();
    await recipient.getByRole('button', { name: 'Record conversation debrief', exact: true }).click();
    for (const name of ['Tea order recorded', 'Takeaway receipt']) await recipient.getByRole('checkbox', { name: new RegExp(name) }).check();
    await recipient.evaluate(()=>{const original=IDBObjectStore.prototype.put;(window as any).__resultWrites=[];IDBObjectStore.prototype.put=function(value,key){if(typeof key==='string'&&key.startsWith('progress:'))(window as any).__resultWrites.push(structuredClone(value));return original.call(this,value,key);};});
    await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
    await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
    const checkedWrites=await recipient.evaluate(()=>(window as any).__resultWrites.flatMap((p:any)=>Object.values(p.structured||{})).filter((entry:any)=>entry.response?._draft?.checked));
    expect(checkedWrites).toHaveLength(1);expect(checkedWrites[0]).toMatchObject({completed:true,attempts:1});
    await expect(recipient.locator('.save-state')).toContainText('Saved on this device');
    await recipient.reload();
    await (await campaignActivities(recipient)).filter({ hasText: 'One tea, to take away' }).click(); await learnBeforeQuest(recipient);
    await expect(recipient.getByRole('list', { name: 'Saved conversation transcript' })).toContainText('Quisiera un té, por favor.');
    await expect(recipient.locator('.structured-game')).toHaveCSS('opacity', '1');
    await expect(recipient.locator('.structured-feedback')).toHaveCSS('opacity', '1');
    await expect(recipient.locator('.xp-pill')).toContainText('20 discovery points');
    const violations = (await new AxeBuilder({ page: recipient }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? '')); expect(violations).toEqual([]);
  } finally { await context.close(); }
});

test('source tables, picture support and changing rules survive the full creator/player flow', async ({ page }) => {
  test.setTimeout(120_000); page.setDefaultTimeout(15_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const choose = async (title: string) => {
    if (await page.locator('.campaign-map').count()) await (await campaignActivities(page)).filter({ hasText: title }).click();
    else await page.locator('.structured-path button').filter({ hasText: title }).click();
    await learnBeforeQuest(page);
  };
  await openLibrary(page);
  await createNotebook(page, 'Small discoveries', 'Source table', 'Name,Temperature\nNorth,12\nSouth,18\nMissing,');
  await expect(page.locator('.activity-library article')).toHaveCount(1);
  await expect(page.locator('.activity-library article')).toContainText('investigate the table');
  await page.locator('.activity-library article').getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await page.getByRole('button', { name: 'Try picture worlds', exact: true }).click();
  await page.getByRole('button', { name: 'Try changing rules', exact: true }).click();
  await expect(page.locator('.activity-library article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  await choose('A little picnic discovery');
  await page.getByText('For a grown-up', { exact: true }).click();
  await page.getByRole('button', { name: 'We worked on the answers together', exact: true }).click();
  await page.getByRole('button', { name: 'Start over', exact: false }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open Small discoveries', exact: true }).click();
  await choose('A little picnic discovery');
  await page.getByRole('button', { name: 'Play with pictures', exact: true }).click();
  for (const [i, name] of ['cup', 'pear', 'apple'].entries()) {
    await page.locator('.picture-token-tray').getByRole('button', { name: `Choose ${name}`, exact: true }).click();
    if (i < 2) await page.getByRole('button', { name: 'Next clue', exact: false }).click();
  }
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(page.locator('.structured-feedback.correct')).toBeVisible();
  await expect(page.locator('.structured-review-banner')).toContainText('0 independent attempts');
  await page.locator('.structured-path button').filter({ hasText: 'Same objects, new rule' }).click(); await learnBeforeQuest(page);
  const items = ['Red circle', 'Red triangle', 'Blue circle', 'Blue triangle'];
  for (const label of items) {
    await page.locator('.switch-items button').filter({ hasText: label }).click();
    await page.getByRole('button', { name: `Place ${label} in ${label.split(' ')[0]}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save this sort and change the rule', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open Small discoveries', exact: true }).click();
  await choose('Same objects, new rule');
  await expect(page.locator('.switch-transition')).toBeVisible();
  await page.getByRole('button', { name: 'I’m ready for the new rule', exact: true }).click();
  await expect(page.locator('.switch-group li')).toHaveCount(0);
  for (const label of items) {
    await page.locator('.switch-items button').filter({ hasText: label }).click();
    const shape = label.endsWith('circle') ? 'Circle' : 'Triangle';
    await page.getByRole('button', { name: `Place ${label} in ${shape}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(page.locator('.structured-feedback.correct')).toBeVisible();
  await expect(page.locator('.structured-review-banner')).toContainText('0 independent attempts');
  await expect(page.locator('.structured-feedback')).toHaveCSS('opacity', '1');
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  expect(errors).toEqual([]);
});

test('paper puppets and prop stations preserve roles, consequences and recipient progress', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000); page.setDefaultTimeout(15_000);
  await openLibrary(page); await createNotebook(page, 'A story we can play');
  await page.getByRole('button', { name: 'Try puppet & pretend play', exact: true }).click();
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  await page.locator('[data-activity-id], .structured-path button').filter({ hasText: 'A cup for two friends' }).click(); await learnBeforeQuest(page);
  await page.getByRole('button', { name: /Bo, would you like to use the cup/ }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open A story we can play', exact: true }).click();
  await page.locator('[data-activity-id], .structured-path button').filter({ hasText: 'A cup for two friends' }).click(); await learnBeforeQuest(page);
  await expect(page.locator('.child-speech')).toContainText('Bo says:');
  await page.getByRole('button', { name: 'Play as Bo, friend', exact: true }).click();
  await page.getByRole('button', { name: /Let’s put the cup on the Table/ }).click();
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(page.locator('.structured-feedback.correct')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('puppet-story.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await expect(page.locator('.world-statbar')).toContainText('0solved independently');
  const download = await exportDownload(page, 'pack'), file = testInfo.outputPath('paper-story.learnpack'); await download.saveAs(file);
  const context = await browser.newContext(), recipient = await context.newPage();
  try {
    await openBundledNotebook(recipient, file);
    await (await campaignActivities(recipient)).filter({ hasText: 'The little shop' }).click(); await learnBeforeQuest(recipient);
    await recipient.getByRole('button', { name: 'Play as Mila, shopkeeper', exact: true }).click();
    await recipient.getByRole('button', { name: 'Choose apple at Shelf', exact: true }).click();
    await recipient.getByRole('button', { name: 'Use apple at Counter', exact: true }).click();
    await recipient.getByRole('button', { name: 'Save & return', exact: false }).click(); await recipient.reload();
    await (await campaignActivities(recipient)).filter({ hasText: 'The little shop' }).click(); await learnBeforeQuest(recipient);
    await expect(recipient.getByRole('button', { name: 'Choose apple at Counter', exact: true })).toBeVisible();
    await recipient.getByRole('button', { name: 'Play as Niko, customer', exact: true }).click();
    await recipient.getByRole('button', { name: 'Choose apple at Counter', exact: true }).click();
    await recipient.getByRole('button', { name: 'Use apple at Basket', exact: true }).click();
    await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
    await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
    await recipient.setViewportSize({ width: 390, height: 844 });
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(recipient.locator('.structured-game')).toHaveCSS('opacity', '1');
    await expect(recipient.locator('.structured-feedback')).toHaveCSS('opacity', '1');
    expect((await new AxeBuilder({ page: recipient }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  } finally { await context.close(); }
  await closeDialog(page);
  await page.getByRole('button', { name: 'Remove this notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Remove notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Your learning', exact: true }).click();
  await expect(page.locator('.insight-stats > div').filter({ hasText: 'challenges solved' }).locator('strong')).toHaveText('0');
  await expect(page.locator('.insight-stats > div').filter({ hasText: 'discovery points' }).locator('strong')).toHaveText('0');
});

test('picture building saves the actual layout and keeps caregiver review separate from mastery', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000); page.setDefaultTimeout(15_000);
  await openLibrary(page); await createNotebook(page, 'A picture with a story');
  await page.getByRole('button', { name: 'Try build & tell', exact: true }).click();
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  await page.locator('[data-activity-id], .structured-path button').filter({ hasText: SHAPE_PICTURE_BUILD.title }).click(); await learnBeforeQuest(page);
  for (const part of ['Red circle', 'Red circle', 'Blue triangle']) await page.getByRole('button', { name: `Add ${part}`, exact: true }).click();
  await page.getByRole('button', { name: 'Write my words', exact: true }).click();
  await page.getByRole('textbox', { name: 'My words (a caregiver can type for me)', exact: true }).fill('I made two circles and put the triangle to the right.');
  await page.getByRole('button', { name: 'Save & return', exact: false }).click(); await page.reload();
  await page.getByRole('button', { name: 'Open A picture with a story', exact: true }).click();
  await (await campaignActivities(page)).filter({ hasText: SHAPE_PICTURE_BUILD.title }).click(); await learnBeforeQuest(page);
  await expect(page.getByRole('textbox', { name: 'My words (a caregiver can type for me)', exact: true })).toHaveValue('I made two circles and put the triangle to the right.');
  await page.getByText('Caregiver: save the telling review', { exact: true }).click();
  for (const check of SHAPE_PICTURE_BUILD.tell.caregiverChecks) await page.getByRole('checkbox', { name: check.label, exact: true }).check();
  await page.getByRole('button', { name: 'Record caregiver review', exact: true }).click();
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(page.locator('.structured-feedback.self-reviewed')).toBeVisible();
  await expect(page.locator('.structured-feedback')).toHaveCSS('opacity', '1');
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('picture-build.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await expect((await campaignActivities(page,true))).toHaveCount(1);
  await expect(page.locator('.world-statbar')).toContainText('0solved independently');
  await expect(page.locator('.world-statbar')).toContainText('0discovery points');
  const download = await exportDownload(page, 'pack'), file = testInfo.outputPath('picture-telling.learnpack'); await download.saveAs(file);
  const context = await browser.newContext(), recipient = await context.newPage();
  try {
    await openBundledNotebook(recipient, file);
    await (await campaignActivities(recipient)).filter({ hasText: SHAPE_PICTURE_BUILD.title }).click(); await learnBeforeQuest(recipient);
    for (const part of ['Red circle', 'Red circle', 'Blue triangle']) await recipient.getByRole('button', { name: `Add ${part}`, exact: true }).click();
    await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
    await expect(recipient.locator('.structured-feedback.retry')).toContainText('caregiver');
  } finally { await context.close(); }
});

test('optional model drafting shares one excerpt, keeps keys ephemeral and requires author review', async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  await openLibrary(page); await createNotebook(page, 'A model with a little help');
  await page.getByRole('tab', { name: 'Design a laboratory', exact: true }).click();
  await page.getByRole('button', { name: 'Optional assistant', exact: true }).click();
  const excerpt = notes.slice(notes.indexOf('1. Check'));
  await page.getByLabel('Exact passage to share', { exact: true }).fill(excerpt);
  await page.getByText('Or use an API / local model', { exact: true }).click();
  await page.getByLabel('Model ID', { exact: true }).fill('test-model');
  await page.getByLabel('API key · this session only', { exact: true }).fill('never-export-this-key');
  let calls = 0;
  await page.route('**/api/generate', async route => {
    calls++; const body = route.request().postDataJSON(); expect(body.maxOutputTokens).toBe(3000);
    const data = JSON.parse(body.prompt.split('REFERENCE DATA (JSON):\n')[1]);
    expect(data.excerpt).toBe(excerpt); expect(body.prompt).not.toContain('Packet: a small');
    const activity = { version: 1, id: 'assistant-chosen-id', kind: 'sequence', title: 'Rebuild the troubleshooting process', instruction: 'Reconstruct the source process.', explanation: 'The order follows the explicit numbered source steps.', hint: 'Read the ordered source.', reviewStatus: 'reviewed', sourceRefs: [{ sourceId: data.sourceId, evidence: excerpt }], items: [{id:'cable',label:'Check the physical network cable.'},{id:'settings',label:'Inspect the device network settings.'},{id:'test',label:'Test the connection to a known host.'},{id:'record',label:'Record the result of the connectivity test.'}], constraints:[{before:'cable',after:'settings'},{before:'settings',after:'test'},{before:'test',after:'record'}] };
    await route.fulfill({ json: { text: JSON.stringify({ activity }) } });
  });
  await page.getByRole('button', { name: 'Request one activity draft', exact: true }).click();
  await expect(page.getByLabel('Activity assistant JSON reply', { exact: true })).toHaveValue(/Rebuild the troubleshooting process/);
  await page.reload();
  await page.getByRole('button', { name: 'Edit A model with a little help', exact: true }).click();
  await page.getByRole('tab', { name: 'Design a laboratory', exact: true }).click();
  await page.getByRole('button', { name: 'Optional assistant', exact: true }).click();
  await expect(page.getByLabel('Activity assistant JSON reply', { exact: true })).toHaveValue(/Rebuild the troubleshooting process/);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('never-export-this-key')))).toBe(false);
  await page.getByRole('button', { name: 'Validate and add draft', exact: true }).click();
  await expect(page.locator('.activity-library article')).toHaveCount(2);
  const draft = page.locator('.activity-library article').filter({ hasText: 'Rebuild the troubleshooting process' });
  await expect(draft).toContainText('Needs author review');
  expect(calls).toBe(1);
  await page.locator('.activity-assistant').screenshot({ path: testInfo.outputPath('assistant-author.png'), animations: 'disabled' });
  const audit = (await new AxeBuilder({ page }).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''));
  await writeFile(testInfo.outputPath('assistant-audit.json'), JSON.stringify(audit));
  expect(audit.map(v => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('sample play preserves the selected answer, feedback and progress across reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let aiCalls = 0; page.on('request', request => { if (request.url().includes('/api/generate')) aiCalls++; });
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  await expect(page.locator('.challenge-meta')).toContainText('CHALLENGE 1');
  const firstChoice = page.locator('.answer-option').first();
  const choiceText = await firstChoice.textContent();
  await firstChoice.click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click(); await learnBeforeQuest(page);
  await expect(page.locator('.answer-option.selected')).toHaveText(choiceText ?? '');
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(page.locator('.answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click(); await learnBeforeQuest(page);
  await expect(page.locator('.answer-feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Continue exploring', exact: false }).click();
  await expect(page.locator('.challenge-meta')).toContainText('CHALLENGE 2');
  expect(aiCalls).toBe(0); expect(errors).toEqual([]);
});

test('hiding a hint cannot restore independent recall credit after pause and reload', async ({ page }, testInfo) => {
  await openLibrary(page); await seedAgedRecallLessons(page,'A small guide to the cosmos');
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  await page.getByRole('button', { name: 'A little hint', exact: false }).click();
  await page.getByRole('button', { name: 'Hide hint', exact: false }).click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Continue adventure', exact: false }).click(); await learnBeforeQuest(page);
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

test('editing source material blocks stale saved answers from earning credit', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  await page.locator('.answer-option').first().click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.getByRole('button', { name: 'Open studio', exact: false }).click();
  await page.locator('.source-main').first().click();
  await page.getByRole('textbox', { name: 'Readable source text', exact: true }).fill('Comet: an icy object that travels through the solar system.');
  await page.getByRole('button', { name: 'Done', exact: false }).click();
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Investigate the source', exact: true })).toBeVisible();
  await expect(page.locator('.source-study-material')).toContainText('Comet: an icy object');
  await expect(page.getByRole('button', { name: 'Check my answer', exact: false })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Your worlds/ }).click();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await expect(page.locator('.world-statbar')).toContainText('0discovery points');
});

test('revised objectives clear current completion while keeping historical XP', async ({ page }) => {
  await openLibrary(page); await seedAgedRecallLessons(page,'A small guide to the cosmos');
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  await page.locator('.answer-option').filter({ hasText: /Star$/ }).click();
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await expect(page.locator('.world-statbar')).toContainText('1solved independently');
  await page.getByRole('button', { name: 'Open studio', exact: false }).click();
  await page.getByRole('tab', { name: /Challenges/ }).click();
  await page.getByRole('button', { name: 'Edit challenge 1', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question or situation', exact: true }).fill('Select the astronomical term that matches this definition.');
  await page.getByRole('button', { name: 'Save challenge', exact: false }).click();
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open A small guide to the cosmos', exact: true }).click();
  await expect(page.locator('.world-statbar')).toContainText('0solved independently'); await expect(page.locator('.world-statbar')).toContainText('20discovery points');
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await (await campaignActivities(page)).filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(page);
  await page.getByRole('spinbutton').nth(0).fill('2'); await page.getByRole('spinbutton').nth(1).fill('1');
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await expect((await campaignActivities(page,true))).toHaveCount(1);
  await page.getByRole('button', { name: 'Open studio', exact: false }).click();
  await page.getByRole('tab', { name: /Challenges/ }).click();
  await page.getByRole('button', { name: 'Edit Plan a small lab', exact: true }).click();
  const json = page.getByRole('textbox', { name: 'Activity JSON', exact: true });
  const activity = JSON.parse(await json.inputValue()); activity.budget = 9; activity.reviewStatus = 'needs-review';
  await json.fill(JSON.stringify(activity)); await page.getByRole('button', { name: 'Import activities', exact: true }).click();
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await expect((await campaignActivities(page,true))).toHaveCount(0); await expect(page.locator('.world-statbar')).toContainText('20discovery points');
  await (await campaignActivities(page)).filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(page);
  await expect(page.getByRole('spinbutton').nth(0)).toHaveValue('0'); await expect(page.locator('.structured-feedback')).toHaveCount(0);
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
  await closeDialog(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Your worlds/ }).click();
  await page.getByRole('button', { name: 'Open Assistant wording exchange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recall escape mission', exact: false })).toHaveCount(0);
  await expect(page.locator('.answer-option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open studio', exact: false }).click();
  await page.getByRole('tab', { name: /Challenges/ }).click();
  await page.locator('.challenge-review').first().getByRole('button', { name: 'Mark as reviewed', exact: false }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Your worlds/ }).click();
  await page.getByRole('button', { name: 'Open Assistant wording exchange', exact: true }).click();
  await page.locator('.campaign-modes > summary').click(); await page.getByRole('button', { name: 'Recall escape mission', exact: false }).click(); await learnBeforeQuest(page);
  await expect(page.getByRole('progressbar', { name: 'Challenge 1 of 1', exact: true })).toHaveAttribute('aria-valuemax', '1');
  await page.locator('.answer-option').filter({ hasText: cards[0].answer }).click();
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await expect(page.locator('.world-statbar')).toContainText('0solved independently');

});

test('delayed wording refinement preserves newer title edits and rejects newer source edits', async ({ page }, testInfo) => {
  let release: (() => void) | undefined; let requestNumber = 0;
  await page.route('**/api/generate', async route => {
    const number = ++requestNumber;
    const cards = JSON.parse(route.request().postDataJSON().prompt.split('REFERENCE DATA:\n')[1]);
    cards[0].prompt = `Wording draft ${number}`;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { text: JSON.stringify({ cards }) } });
  });
  await openLibrary(page); await createNotebook(page, 'Before the slow request');
  const start = async () => {
    release = undefined;
    await page.getByRole('button', { name: 'Refine with optional AI', exact: false }).click();
    await page.getByRole('combobox', { name: 'AI provider', exact: true }).selectOption('compatible');
    await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill('local-test-model');
    await page.getByRole('button', { name: 'Refine wording', exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true); await closeDialog(page);
  };
  await start();
  await page.getByRole('textbox', { name: 'Notebook title', exact: true }).fill('My newer title');
  release!();
  await expect(page.locator('.challenge-review').first()).toContainText('Wording draft 1');
  await expect(page.getByRole('textbox', { name: 'Notebook title', exact: true })).toHaveValue('My newer title');
  await start();
  await page.getByRole('tab', { name: /Materials/ }).click(); await page.locator('.source-main').first().click();
  await page.getByRole('textbox', { name: 'Readable source text', exact: true }).fill(notes + '\nA newly added observation must be preserved.');
  await page.getByRole('button', { name: 'Done', exact: false }).click(); release!();
  await expect(page.getByRole('dialog')).toContainText('Your latest edits were kept.');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  const exported = await exportDownload(page, 'pack'); const path = testInfo.outputPath('intervening-edits.learnpack'); await exported.saveAs(path);
  const notebook = JSON.parse(await readFile(path, 'utf8')).notebook;
  expect(notebook.title).toBe('My newer title'); expect(notebook.sources[0].text).toContain('A newly added observation');
  expect(notebook.cards[0].prompt).toBe('Wording draft 1'); expect(notebook.cards.every((card: any) => card.reviewStatus === 'needs-review')).toBe(true);
});

test('rebuilding changed source structure replaces obsolete derived game models', async ({ page }, testInfo) => {
  await openLibrary(page); await createNotebook(page, 'Changing categories');
  const rebuild = async (text: string) => {
    await page.getByRole('tab', { name: /Materials/ }).click(); await page.locator('.source-main').first().click();
    await page.getByRole('textbox', { name: 'Readable source text', exact: true }).fill(text);
    await page.getByRole('button', { name: 'Done', exact: false }).click();
    await page.getByRole('button', { name: 'Build learning game', exact: false }).click();
  };
  await rebuild('Warm > A\nCool > B');
  const firstExport = await exportDownload(page, 'pack'); const firstPath = testInfo.outputPath('categories-before.learnpack'); await firstExport.saveAs(firstPath);
  const before = JSON.parse(await readFile(firstPath, 'utf8')).notebook;
  expect(before.activities).toHaveLength(1); expect(before.activities[0].kind).toBe('classification'); await closeDialog(page);
  await rebuild('Warm > A\nCool > B\nWarm > C');
  const nextExport = await exportDownload(page, 'pack'); const nextPath = testInfo.outputPath('categories-after.learnpack'); await nextExport.saveAs(nextPath);
  const after = JSON.parse(await readFile(nextPath, 'utf8')).notebook;
  expect(after.activities).toHaveLength(1); expect(after.activities[0].id).not.toBe(before.activities[0].id);
  expect(after.activities[0].items).toHaveLength(3); expect(after.activities[0].extractedFrom).toBe(after.sources[0].id);
});

test('an editable notebook preserves one world, player progress and a recipient remix', async ({ page, browser }, testInfo) => {
  await openLibrary(page);
  await createNotebook(page, 'The portable network world');
  const exported = await exportDownload(page, 'pack');
  const path = testInfo.outputPath('portable-world.learnpack'); await exported.saveAs(path);
  const packageText = await readFile(path, 'utf8');
  expect(JSON.parse(packageText).format).toBe('learnpack'); expect(packageText).toContain('The portable network world');
  const context = await browser.newContext({ acceptDownloads: true });
  const offline = await context.newPage(); const errors: string[] = []; const external: string[] = [];
  offline.on('pageerror', error => errors.push(error.message));
  offline.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4319/')) external.push(request.url()); });
  await openBundledNotebook(offline, path);
  await expect(offline.getByRole('heading', { name: 'The portable network world', exact: true })).toBeVisible();
  await offline.locator('.campaign-modes > summary').click(); await offline.getByRole('button', { name: 'Recall escape mission', exact: false }).click(); await learnBeforeQuest(offline);
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
  const remixDownload = await exportDownload(offline, 'pack');
  const remixPath = testInfo.outputPath('remixed-world.learnpack'); await remixDownload.saveAs(remixPath);
  const second = await browser.newContext(); const recipient = await second.newPage();
  await openBundledNotebook(recipient, remixPath);
  await expect(recipient.getByRole('heading', { name: 'Offline learner remix', exact: true })).toBeVisible();
  await recipient.getByRole('button', { name: 'Open studio', exact: false }).click();
  await expect(recipient.locator('.source-main').filter({ hasText: 'New offline ideas' })).toBeVisible();
  expect(external).toEqual([]); expect(errors).toEqual([]);
  await second.close(); await context.close();
});

test('optional artwork remains a reviewed source-bound presentation asset through a portable remix', async ({ page, browser }, testInfo) => {
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
  await page.getByLabel('API key · this session only', { exact: true }).fill('private-image-key');
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
  await page.locator('.visual-gallery summary').click();
  const visualAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await writeFile('.qa/accessibility-visual-studio.json', JSON.stringify(visualAudit.violations, null, 2));
  expect.soft(visualAudit.violations.filter(issue => issue.impact === 'serious' || issue.impact === 'critical').map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
  await page.locator('.visual-studio').screenshot({ path: '.qa/visual-studio-desktop.png', animations: 'disabled' });
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 391)).toBe(true);
  await page.locator('.visual-studio').screenshot({ path: '.qa/visual-studio-mobile.png', animations: 'disabled' });
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Visual learning world', exact: true }).click();
  await expect(page.locator('.learning-figures img')).toHaveCount(1);
  await page.locator('.learning-figures summary').click();
  await page.screenshot({ path: '.qa/visual-provenance.png', fullPage: true, animations: 'disabled' });
  await page.locator('.campaign-modes > summary').click(); await page.getByRole('button', { name: 'Recall escape mission', exact: false }).click(); await learnBeforeQuest(page);
  await page.getByRole('button', { name: 'View learning figures', exact: true }).click();
  await expect(page.locator('.learning-figures img')).toBeVisible();
  await page.getByRole('button', { name: 'Hide learning figures', exact: true }).click();
  await page.locator('.answer-option').filter({ hasText: /Packet$/ }).click();
  await page.getByRole('button', { name: 'Check my answer', exact: false }).click();
  await expect(page.locator('.answer-feedback.success')).toBeVisible(); await expect(page.locator('.xp-pill')).toHaveText('0 XP');
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  const htmlDownload = await exportDownload(page, 'pack'); const htmlPath = testInfo.outputPath('visual.learnpack'); await htmlDownload.saveAs(htmlPath);
  const context = await browser.newContext(); const learner = await context.newPage();
  await openBundledNotebook(learner, htmlPath);
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
  await closeDialog(learner);
  await learner.getByRole('tab', { name: /Materials/ }).click(); await learner.locator('.source-main').first().click();
  await learner.getByRole('textbox', { name: 'Readable source text', exact: true }).fill('The original source passage has been removed by the author.');
  await learner.getByRole('button', { name: 'Done', exact: false }).click();
  await learner.getByRole('tab', { name: /Game design/ }).click();
  await expect(learner.locator('.visual-gallery .status-pill').filter({ hasText: 'Citation needs repair' })).toHaveCount(2);
  const reviewButtons = learner.getByRole('button', { name: 'I checked this visual against the source', exact: false });
  await expect(reviewButtons).toHaveCount(2); await expect(reviewButtons.nth(0)).toBeDisabled(); await expect(reviewButtons.nth(1)).toBeDisabled();
  await learner.getByRole('tab', { name: /Challenges/ }).click();
  const reviewStatuses = await learner.locator('.challenge-review .status-pill').allTextContents();
  expect(reviewStatuses.length).toBeGreaterThan(0); expect(reviewStatuses.every(status => status === 'Needs review')).toBe(true);
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
  // The visible chooser is disabled while a batch imports. setInputFiles bypasses
  // that button, so wait for the same readiness a person sees before reusing it.
  await expect(page.locator('.source-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Upload files', exact: true })).toBeEnabled();
  // Files may arrive without MIME metadata on desktop operating systems.
  await page.getByLabel('Upload source files', { exact: true }).setInputFiles({ name: 'tiny-diagram.png', mimeType: '', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT5sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.locator('.source-row')).toHaveCount(4);
  await expect(page.locator('.source-row .status-pill.ready')).toHaveCount(3);
  await page.getByText('Advanced editing · focus a lesson on selected passages',{exact:true}).click();
  await page.getByRole('textbox', { name: 'Search source materials' }).fill('Router');
  await expect(page.locator('.evidence-passages article').first()).toContainText('forwards packets');
  await page.getByRole('textbox', { name: 'Search source materials' }).fill('Repeated practice');
  await expect(page.locator('.evidence-passages article').first()).toContainText('00:00:01.000');
  await page.locator('.source-main').filter({ hasText: 'short-lecture.vtt' }).click();
  await expect(page.getByRole('textbox', { name: 'Readable source text', exact: true })).toHaveValue('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nRepeated practice gives learners more opportunities to recall information from memory.');
  await page.getByRole('button', { name: 'Done', exact: false }).click();
  await page.getByRole('button', { name: 'Build learning game', exact: false }).click();
  expect(await page.locator('.challenge-review').count()).toBeGreaterThan(8);
  const pack = await exportDownload(page, 'pack'); const target = testInfo.outputPath('mixed-sources.learnpack'); await pack.saveAs(target);
  const image = JSON.parse(await readFile(target, 'utf8')).notebook.sources.find((source: { title: string }) => source.title === 'tiny-diagram.png');
  expect(image).toMatchObject({ kind: 'image', mime: 'image/png', status: 'needs-transcript' });
  expect(image.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(aiCalls).toBe(0);
});

test('all seven structured systems evaluate, preserve unfinished work, and travel with editable notebook exports', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await expect((await campaignActivities(page))).toHaveCount(8);
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Move Define the question up', exact: true }).click();
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
  await expect(page.locator('.structured-sequence li').first()).toContainText('Define the question');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Move Collect observations up', exact: true }).click();
  await page.getByRole('button', { name: 'Move Analyze observations up', exact: true }).click();
  const check = async () => {
    await page.getByRole('button', { name: 'Check my work', exact: true }).click();
    await expect(page.locator('.structured-feedback.correct')).toContainText('Your work holds together.');
  };
  const choose = async (title: string) => { await page.locator('.structured-path button').filter({ hasText: title }).click(); await learnBeforeQuest(page); };
  await check();
  await choose('Observation or interpretation?');
  await page.locator('.sort-source-item').filter({ hasText: 'The display reads 12.' }).click();
  await page.getByRole('region', { name: 'Observation', exact: true }).getByRole('button', { name: 'Place The display reads 12. here', exact: true }).click();
  await page.locator('.sort-source-item').filter({ hasText: 'The battery may be weak.' }).click();
  await page.getByRole('region', { name: 'Interpretation', exact: true }).getByRole('button', { name: 'Place The battery may be weak. here', exact: true }).click();
  await check();
  await choose('An explicit access policy');
  await page.getByRole('radio', { name: /Allow the request/ }).check();
  await check();
  await choose('Follow a message');
  for (const [from, to] of [['Build request', 'Send request'], ['Send request', 'Receive response']]) {
    await page.locator('.connection-draft > button').first().click();
    await page.getByRole('button', { name: 'Select concept '+from, exact: true }).click();
    await page.getByRole('radio', { name: 'precedes', exact: true }).check();
    await page.getByRole('button', { name: 'Select concept '+to, exact: true }).click();
    await page.getByRole('button', { name: 'Connect concepts', exact: true }).click();
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
  await expect((await campaignActivities(page,true))).toHaveCount(8);
  await expect(page.locator('.world-statbar')).toContainText('160');
  const packDownload = await exportDownload(page, 'pack'); const packPath = testInfo.outputPath('structured.learnpack'); await packDownload.saveAs(packPath);
  const exported = JSON.parse(await readFile(packPath, 'utf8')); expect(exported.notebook.activities).toHaveLength(8);
  const progressEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save my personal progress separately', exact: false }).click();
  const progressFile = testInfo.outputPath('structured.progress.json'); await (await progressEvent).saveAs(progressFile);
  const backup = JSON.parse(await readFile(progressFile, 'utf8')); expect(Object.values(backup.progress.structured).every((entry: any) => entry.completed)).toBe(true);
  expect(backup.progress.structured['example-budget'].response).toMatchObject({ quantities: { small: 2, large: 1 } });
  const htmlDownload = await exportDownload(page, 'pack'); const htmlPath = testInfo.outputPath('structured.learnpack'); await htmlDownload.saveAs(htmlPath);
  const context = await browser.newContext(); const recipient = await context.newPage();
  await openBundledNotebook(recipient, htmlPath);
  await expect((await campaignActivities(recipient))).toHaveCount(8);
  await (await campaignActivities(recipient)).filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(recipient);
  await expect(recipient.getByRole('spinbutton').nth(0)).toHaveValue('0');
  await recipient.getByRole('spinbutton').nth(0).fill('2'); await recipient.getByRole('spinbutton').nth(1).fill('1');
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
  await recipient.getByRole('button', { name: 'Save & return', exact: false }).click();
  await recipient.getByRole('button', { name: 'Studio settings', exact: true }).click();
  await recipient.getByLabel('Restore learning progress', { exact: true }).setInputFiles(progressFile);
  await expect(recipient.getByText('Your learning progress is restored.', { exact: true })).toBeVisible();
  await recipient.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Your worlds/ }).click();
  await recipient.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await expect((await campaignActivities(recipient,true))).toHaveCount(8);
  await expect(recipient.locator('.world-statbar')).toContainText('160discovery points');
  await context.close();
});

test('all ten recorded music tracks decode locally and can be stopped', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio; (window as any).__testMusic = [];
    window.Audio = class extends NativeAudio { constructor(src?: string) { super(src); if (src) (window as any).__testMusic.push(this); } } as typeof Audio;
  });
  await openLibrary(page);
  await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
  await expect(page.locator('.music-library-count')).toContainText('100 soundtracks');
  await expect(page.locator('.track-button')).toHaveCount(12);
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
  await page.getByRole('tab', { name: /Game design/ }).click(); await audit('design');
  await page.getByRole('button', { name: 'Play game', exact: false }).click(); await audit('briefing'); await learnBeforeQuest(page); await audit('game');
  await page.getByRole('button', { name: 'Save & exit', exact: false }).click();
  await page.getByRole('button', { name: 'Your worlds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await (await campaignActivities(page)).first().click(); await learnBeforeQuest(page);
  for (let index = 0; index < 7; index++) {
    await page.locator('.structured-path button').nth(index).click(); await learnBeforeQuest(page);
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
  await page.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(page);
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
  await first.getByRole('button', { name: 'Begin adventure', exact: false }).click(); await learnBeforeQuest(first);
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
  await expect(second.getByRole('row').filter({hasText:'Nova'}).getByRole('cell').nth(2)).toHaveText('0');
  await firstContext.close(); await secondContext.close();
});


test('structured activity scores synchronize between two invited learners', async ({ browser }) => {
  const hostContext = await browser.newContext(); const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  for (const page of [host, guest]) {
    await openLibrary(page);
    if(page===host)await seedAgedStructuredLessons(page,'Inside the connected world');
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
  await (await campaignActivities(host)).filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(host);
  await host.getByRole('spinbutton').nth(0).fill('2'); await host.getByRole('spinbutton').nth(1).fill('1');
  await host.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(host.locator('.structured-feedback.correct')).toBeVisible();
  await host.getByRole('button', { name: 'Save & return', exact: false }).click();
  // Complete a second mission while the room dialog remains closed.
  await (await campaignActivities(host)).filter({ hasText: 'An explicit access policy' }).click(); await learnBeforeQuest(host);
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

test('unreviewed models stay unscored through save and notebook export until the author approves them', async ({ page, browser }, testInfo) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Open Inside the connected world', exact: true }).click();
  await page.getByRole('button', { name: 'Open studio', exact: false }).click();
  await page.getByRole('tab', { name: /Challenges/ }).click();
  await page.getByRole('button', { name: 'Edit Plan a small lab', exact: true }).click();
  const json = page.getByRole('textbox', { name: 'Activity JSON', exact: true });
  const activity = JSON.parse(await json.inputValue()); activity.reviewStatus = 'needs-review';
  await json.fill(JSON.stringify(activity));
  await page.getByRole('button', { name: 'Import activities', exact: true }).click();
  await page.getByRole('button', { name: 'Play game', exact: false }).click();
  await page.locator('.structured-path button').filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(page);
  await page.getByRole('spinbutton').nth(0).fill('2'); await page.getByRole('spinbutton').nth(1).fill('1');
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(page.locator('.structured-feedback.draft-preview')).toContainText('author review needed');
  await expect(page.locator('.structured-game-header .xp-pill')).toContainText('0 discovery points');
  await expect(page.locator('.structured-next')).toContainText('Your exploration is saved');
  await expect(page.locator('.gameplay-hud')).toHaveAttribute('data-mode', 'draft');
  await page.getByRole('button', { name: 'Save & return', exact: false }).click();
  await expect((await campaignActivities(page,true))).toHaveCount(0);
  const download = await exportDownload(page, 'pack'), file = testInfo.outputPath('unreviewed-game.learnpack'); await download.saveAs(file);
  const context = await browser.newContext(), recipient = await context.newPage();
  await openBundledNotebook(recipient, file);
  await (await campaignActivities(recipient)).filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(recipient);
  await recipient.getByRole('spinbutton').nth(0).fill('2'); await recipient.getByRole('spinbutton').nth(1).fill('1');
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(recipient.locator('.structured-feedback.draft-preview')).toBeVisible();
  await recipient.getByRole('button', { name: 'Save & return', exact: false }).click();
  await recipient.reload();
  await expect((await campaignActivities(recipient,true))).toHaveCount(0);
  await expect(recipient.locator('.world-statbar')).toContainText('0solved independently');
  await recipient.getByRole('button', { name: 'Open studio', exact: false }).click();
  await recipient.getByRole('tab', { name: /Challenges/ }).click();
  await recipient.locator('.activity-library article').filter({ hasText: 'Plan a small lab' }).getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await recipient.getByRole('button', { name: 'Play game', exact: false }).click();
  await recipient.locator('.structured-path button').filter({ hasText: 'Plan a small lab' }).click(); await learnBeforeQuest(recipient);
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(recipient.locator('.structured-feedback.correct')).toBeVisible();
  await expect(recipient.locator('.structured-game-header .xp-pill')).toContainText('20 discovery points');
  await expect(recipient.locator('.structured-review-banner')).toContainText('0 independent attempts');
  await recipient.clock.install({ time: Date.now() + 2 * 24 * 60 * 60 * 1000 });
  await recipient.getByRole('button', { name: 'Start a fresh attempt', exact: true }).click();
  await recipient.getByRole('spinbutton').nth(0).fill('2'); await recipient.getByRole('spinbutton').nth(1).fill('1');
  await recipient.getByRole('button', { name: 'Check my work', exact: true }).click();
  await expect(recipient.locator('.structured-review-banner')).toContainText('1 independent attempt');
  await context.close();
});

test('provider catalogs are dynamic, credentials are ephemeral, originals travel with exports', async ({page},testInfo)=>{
 await page.route('**/api/models',async route=>{const body=route.request().postDataJSON();expect(body.provider).toBe('openai');expect(body.apiKey).toBe('private-discovery-key');await route.fulfill({json:{models:[{id:'account-model-a',name:'My available model'},{id:'new-model-b',name:'New model B'}]}});});
 await openLibrary(page);
 await page.getByRole('button',{name:'Studio settings',exact:true}).click();
 await page.getByLabel('API key · this session only',{exact:true}).fill('private-discovery-key');
 await page.getByRole('button',{name:'Refresh available models',exact:true}).click();
 await page.getByRole('combobox',{name:'Available models',exact:true}).selectOption('new-model-b');
 await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('new-model-b');
 expect(await page.evaluate(()=>Object.values(localStorage).join('\n'))).not.toContain('private-discovery-key');
 await expect(page.locator('.subscription-connections')).toHaveAttribute('open','');
 await expect(page.getByRole('button',{name:'Install Codex & sign in',exact:true})).toBeDisabled();
 await expect(page.locator('.subscription-grid')).toContainText('Commercial or hosted distributions require an approved Sign in with ChatGPT integration.');
 await page.getByRole('button',{name:/^Your worlds/}).first().click();
 await createNotebook(page,'An archive for a friend');
 await page.getByRole('tab',{name:/Materials/}).click();
 const original=Buffer.from('# Original field notes\n\nA router forwards packets between networks.\n');
 await page.getByLabel('Upload source files',{exact:true}).setInputFiles({name:'field-notes.md',mimeType:'text/markdown',buffer:original});
 await expect(page.locator('.source-main').filter({hasText:'field-notes.md'})).toBeVisible();
 const exported=await exportDownload(page,'pack');const filename=testInfo.outputPath('with-original.learnpack');await exported.saveAs(filename);
 const text=await readFile(filename,'utf8'),notebook=parsePortableNotebook(text);const file=notebook.sources.find(s=>s.title==='field-notes.md')!.originalFile!;
 expect(Buffer.from(file.dataUrl.split(',')[1],'base64')).toEqual(original);expect(text).not.toContain('private-discovery-key');
 await closeDialog(page);await page.reload();await page.getByRole('button',{name:'Studio settings',exact:true}).click();await expect(page.getByLabel('API key · this session only',{exact:true})).toHaveValue('');
});


test('URL imports preserve source snapshots and partial-import warnings through portable export', async ({page},testInfo)=>{
 const snapshot=Buffer.from('<html><script>window.untrustedImportedScript=true</script><main><h1>Networking field guide</h1><p>'+notes+'</p></main></html>');
 const originalFile={name:'guide-snapshot.html',mime:'text/html',dataUrl:'data:text/html;base64,'+snapshot.toString('base64'),size:snapshot.length,sha256:createHash('sha256').update(snapshot).digest('hex')};
 const warning='Only the public excerpt was returned. Review it before building.';
 await page.route('**/api/import-url',async route=>{
  const url=route.request().postDataJSON().url;
  await route.fulfill({json:url.endsWith('/private')?{needsAssistance:true,kind:'website',url,instructions:'This page requires sign-in. Paste accessible learning material.'}:{source:{title:'Networking field guide',content:notes,originalFile,metadata:{url:'https://example.org/guide/final',requestedUrl:url,retrievedAt:'2026-10-04T12:00:00.000Z',extractor:'mozilla-readability',contentStatus:'partial'}},warnings:[warning]}});
 });
 await openLibrary(page);await page.getByRole('button',{name:'Create a world',exact:true}).last().click();
 await page.getByLabel('Notebook title',{exact:true}).fill('A portable web lesson');
 const add=async(url:string)=>{await page.getByRole('button',{name:'Add a link',exact:true}).click();await page.getByLabel('Source URL',{exact:true}).fill(url);await page.getByRole('button',{name:'Add source',exact:true}).click();};
 await add('https://example.org/guide');await page.locator('.source-main').filter({hasText:'Networking field guide'}).click();
 await expect(page.getByRole('link',{name:'Open original',exact:false})).toHaveAttribute('href','https://example.org/guide/final');
 await expect(page.getByRole('region',{name:'Website import record'})).toContainText(warning);
 const originalDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download preserved original',exact:true}).click();const originalPath=testInfo.outputPath('preserved.learnpack');await (await originalDownload).saveAs(originalPath);expect(await readFile(originalPath)).toEqual(snapshot);
 expect(await page.evaluate(()=>Boolean((window as any).untrustedImportedScript))).toBe(false);
 await page.getByRole('button',{name:'Done',exact:false}).click();await add('https://example.org/private');
 await expect(page.getByLabel('Readable source text',{exact:true})).toHaveValue('');
 await expect(page.getByRole('region',{name:'Website import record'})).toContainText('Manual material required');await page.getByRole('button',{name:'Done',exact:false}).click();
 await page.getByRole('button',{name:'Build learning game',exact:false}).click();expect(await page.locator('.challenge-review').count()).toBeGreaterThan(0);
 const downloaded=await exportDownload(page,'pack'),filename=testInfo.outputPath('portable-web.learnpack');await downloaded.saveAs(filename);const notebook=parsePortableNotebook(await readFile(filename,'utf8'));
 expect(notebook.sources[0].webImport).toMatchObject({contentStatus:'partial',warnings:[warning],requestedUrl:'https://example.org/guide'});expect(notebook.sources[0].originalFile?.sha256).toBe(originalFile.sha256);
 expect(notebook.sources[1]).toMatchObject({status:'needs-transcript',text:'',webImport:{contentStatus:'needs-assistance'}});
 expect(notebook.cards.every(card=>card.sourceId===notebook.sources[0].id)).toBe(true);
});


test('a failed structured result stays in the game and retries without duplicate credit',async({page})=>{
 await openLibrary(page);await page.getByRole('button',{name:'Open Inside the connected world',exact:true}).click();await (await campaignActivities(page)).filter({hasText:'An explicit access policy'}).click(); await learnBeforeQuest(page);
 await page.getByRole('radio',{name:/Allow the request/}).check();await expect(page.locator('.save-state')).toContainText('Saved on this device');
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;(window as any).__failResult=true;(window as any).__checkedAttempts=[];IDBObjectStore.prototype.put=function(value,key){const checked=Object.values(value.structured||{}).find((entry:any)=>entry.response?._draft?.checked) as any;if(typeof key==='string'&&key.startsWith('progress:')&&checked){(window as any).__checkedAttempts.push(checked.attempts);if((window as any).__failResult)throw new DOMException('Test storage failure','QuotaExceededError');}return original.call(this,value,key);};});
 await page.getByRole('button',{name:'Check my work',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Test storage failure');await page.getByRole('button',{name:'Got it',exact:true}).click();
 await expect(page.locator('.structured-save-error')).toBeVisible();await expect(page.locator('.structured-feedback')).toHaveCount(0);await expect(page.locator('.structured-next')).toHaveCount(0);await expect(page.locator('.save-state')).toContainText('Save needs attention');
 await page.getByRole('button',{name:'Save & return',exact:false}).click();await expect(page.getByRole('dialog')).toContainText('still needs a successful save');await page.getByRole('button',{name:'Got it',exact:true}).click();await expect(page.locator('.structured-board')).toBeVisible();
 await page.evaluate(()=>{(window as any).__failResult=false;});await page.getByRole('button',{name:'Retry saving result',exact:true}).click();await expect(page.locator('.structured-feedback.correct')).toBeVisible();await expect(page.locator('.structured-next')).toBeVisible();expect(await page.evaluate(()=>(window as any).__checkedAttempts)).toEqual([1,1]);
 await page.reload();await page.getByRole('button',{name:'Open Inside the connected world',exact:true}).click();await expect(page.locator('.world-statbar')).toContainText('20discovery points');
});
