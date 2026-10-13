/**
 * Tab Squirrel - Knowledge Hub UX Verification (Playwright)
 *
 * src/app/index.html is one page loaded both in Chrome's side panel and in a full tab.
 * This suite drives the narrow layout (side-panel width) and the wide layout (full tab),
 * plus the panel-only controls with chrome.tabs.getCurrent() stubbed to mimic the panel.
 */

import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { chromium } from '@playwright/test';

import { buildTestExtension, extensionLaunchOptions, waitForServiceWorker } from './helpers/test-extension.js';

const EXTENSION_PATH = buildTestExtension();
const USER_DATA_DIR = path.resolve('./tests/.playwright_user_data_ux');
const NARROW = { width: 380, height: 800 };
const WIDE = { width: 1280, height: 800 };

async function runAppUXTests() {
  console.log('🧪 Starting Tab Squirrel Knowledge Hub UX Verification Test Suite...\n');

  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(USER_DATA_DIR,
      extensionLaunchOptions(EXTENSION_PATH, ['--no-first-run']));

    const background = await waitForServiceWorker(context);
    const extensionId = background.url().split('/')[2];
    const APP_URL = `chrome-extension://${extensionId}/src/app/index.html`;
    console.log(`✓ Extension loaded with ID: ${extensionId}\n`);

    const page = await context.newPage();
    await page.setViewportSize(NARROW);
    await page.goto(APP_URL);
    await page.waitForLoadState('domcontentloaded');

    // Seed test data in IndexedDB
    await page.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      await saveArchivedTab({
        id: 'test-tab-1',
        url: 'https://example.com/deep-learning',
        title: 'Deep Learning and Neural Networks',
        domain: 'example.com',
        capturedAt: Date.now() - 60000,
        readingTimeMinutes: 5,
        cleanText: '# Deep Learning\n\nThe full article text about neural networks lives here.',
        summary: {
          tldr: 'An extensive overview of modern deep learning architectures.',
          bullets: [
            'Convolutional networks excel at visual patterns.',
            'Transformers dominate NLP and multimodal tasks.',
            'Optimization requires careful learning rate scheduling.'
          ],
          tags: ['ai', 'machine-learning', 'research']
        },
        status: 'archived'
      });
      await saveArchivedTab({
        id: 'test-tab-2',
        url: 'https://developer.mozilla.org/web-apis',
        title: 'Modern Web APIs and Ergonomics',
        domain: 'developer.mozilla.org',
        capturedAt: Date.now() - 120000,
        readingTimeMinutes: 3,
        summary: {
          tldr: 'Exploring progressive disclosure and web performance APIs.',
          bullets: ['Backdrop filters and CSS view transitions.', 'Tactile micro-interactions improve satisfaction.'],
          tags: ['web', 'frontend', 'design']
        },
        status: 'discarded'
      });
      await saveArchivedTab({
        id: 'test-tab-3',
        url: 'https://docs.example.org/manual-save',
        title: 'Manually Saved Reference Page',
        domain: 'docs.example.org',
        capturedAt: Date.now() - 180000,
        readingTimeMinutes: 2,
        summary: { tldr: 'A page saved while the tab stays open.', bullets: ['Still open in the browser.'], tags: ['web'] },
        status: 'captured',
        closureReason: 'Saved manually; tab left open'
      });
    });

    await page.reload();
    await page.waitForSelector('.tab-card', { timeout: 5000 });
    const cardIds = (p = page) => p.$$eval('#tabs-feed .tab-card', cards => cards.map(c => c.dataset.id));
    console.log('✓ Knowledge Hub loaded with 3 seeded cards\n');

    // --- TEST 1: Surface detection & narrow layout ---
    console.log('--- Test 1: Surface Detection (tab) & Narrow Layout (380px) ---');
    assert.strictEqual(await page.evaluate(() => document.body.dataset.surface), 'tab', 'Opened as a tab, surface must be "tab"');
    assert.strictEqual(await page.locator('#archive-current-btn').isHidden(), true, '"Archive Current Tab" must be hidden when opened as a tab');
    assert.strictEqual(await page.locator('#open-full-btn').isHidden(), true, '"Open full view" must be hidden when opened as a tab');
    assert.strictEqual(await page.locator('#view-all').getAttribute('aria-current'), 'page', 'Full view opens on All');
    assert.strictEqual(await page.locator('#view-all').getAttribute('aria-pressed'), null, 'View switch uses aria-current, not aria-pressed');
    assert.strictEqual(await page.locator('#sidebar').isHidden(), true, 'Narrow layout hides the sidebar behind the Filters drawer');
    assert.strictEqual(await page.locator('#filters-btn').isVisible(), true, 'Narrow layout shows the Filters button');
    assert.strictEqual(await page.locator('#view-tabs').isVisible(), true, 'Inbox/Reopened/All control stays visible above the feed');
    assert.strictEqual(await page.locator('.stats-banner').count(), 0, 'The stats strip is gone');
    assert.strictEqual(await page.locator('#sort-select').isHidden(), true, 'Sort and density live in the collapsed drawer');
    assert.strictEqual(await page.locator('#density-toggle-btn').isHidden(), true, 'Density toggle lives in the collapsed drawer');
    console.log('✓ Tab surface hides panel-only controls; narrow layout uses the drawer\n');

    // --- TEST 2: Search clear button, keyboard hint & highlighting ---
    console.log('--- Test 2: Search Clear Button, Keyboard Hint & Highlighting ---');
    const kbdHint = page.locator('#search-kbd-hint');
    const clearBtn = page.locator('#search-clear-btn');
    const searchInput = page.locator('#search-input');
    assert.strictEqual(await clearBtn.isHidden(), true, 'Clear button should be hidden when search is empty');
    assert.strictEqual(await kbdHint.isVisible(), true, 'Keyboard hint / should be visible when search is empty');

    await searchInput.fill('Deep');
    await page.waitForTimeout(350);
    assert.strictEqual(await clearBtn.isVisible(), true, 'Clear button should be visible when input has text');
    assert.strictEqual(await kbdHint.isHidden(), true, 'Keyboard hint should be hidden when input has text');
    const highlight = page.locator('mark.search-highlight');
    assert.ok(await highlight.count() >= 1, 'Should highlight matching term "Deep"');
    assert.strictEqual((await highlight.first().textContent()).toLowerCase(), 'deep');
    assert.deepStrictEqual(await cardIds(), ['test-tab-1'], 'Search filters the feed');
    console.log('✓ Search highlighting verified');

    await clearBtn.click();
    await page.waitForTimeout(300);
    assert.strictEqual(await searchInput.inputValue(), '', 'Search input should be cleared');
    assert.strictEqual(await clearBtn.isHidden(), true, 'Clear button should be hidden after clearing');
    assert.strictEqual(await kbdHint.isVisible(), true, 'Keyboard hint should be visible after clearing');
    assert.strictEqual((await cardIds()).length, 3, 'Clearing search restores the full feed');
    console.log('✓ Clear button and keyboard hint behavior verified\n');

    // --- TEST 3: Progressive disclosure of takeaways (narrow layout) ---
    console.log('--- Test 3: Progressive Disclosure of Takeaways ---');
    const firstCard = page.locator('.tab-card[data-id="test-tab-1"]');
    const takeawaysBtn = firstCard.locator('.takeaways-toggle');
    const bulletsList = firstCard.locator('.card-bullets');
    assert.strictEqual(await takeawaysBtn.isVisible(), true, 'Takeaways toggle button should be visible');
    assert.strictEqual(await bulletsList.isHidden(), true, 'Bullets list should be collapsed by default');
    await takeawaysBtn.click();
    assert.strictEqual(await bulletsList.isVisible(), true, 'Bullets list should be expanded after click');
    assert.strictEqual(await takeawaysBtn.getAttribute('aria-expanded'), 'true', 'Toggle button should report aria-expanded="true"');
    await takeawaysBtn.click();
    assert.strictEqual(await bulletsList.isHidden(), true, 'Bullets list should collapse again');
    console.log('✓ Progressive disclosure of takeaways verified\n');

    // --- TEST 4: Density toggle (comfortable / compact) ---
    console.log('--- Test 4: Density Toggle (Comfortable / Compact) ---');
    const densityBtn = page.locator('#density-toggle-btn');
    const feedIsCompact = () => page.locator('#tabs-feed').evaluate(el => el.classList.contains('compact'));
    assert.strictEqual(await densityBtn.getAttribute('aria-pressed'), 'false', 'Density button should not be active initially');
    await page.click('#view-options > summary');
    await densityBtn.click();
    assert.strictEqual(await densityBtn.evaluate(el => el.classList.contains('active')), true, 'Density button should have .active in compact mode');
    assert.strictEqual(await feedIsCompact(), true, 'Feed should switch to compact cards');
    assert.strictEqual(await firstCard.locator('.card-tldr').isHidden(), true, 'Compact cards hide the TL;DR');
    const storedDensity = await page.evaluate(async () => (await chrome.storage.local.get('sidepanel_density')).sidepanel_density);
    assert.strictEqual(storedDensity, 'compact', 'Compact density should be stored in chrome.storage.local');
    await page.reload();
    await page.waitForSelector('.tab-card');
    assert.strictEqual(await feedIsCompact(), true, 'Compact density persists across reloads');
    await page.click('#view-options > summary');
    await densityBtn.click();
    assert.strictEqual(await feedIsCompact(), false, 'Cards should revert to comfortable');
    console.log('✓ Density toggle and storage persistence verified\n');

    // --- TEST 5: Keyboard navigation (j / k / Enter) ---
    console.log('--- Test 5: Keyboard Navigation (j / k / Enter) ---');
    await page.evaluate(() => document.activeElement?.blur());
    const isSelected = (id) => page.locator(`.tab-card[data-id="${id}"]`).evaluate(el => el.classList.contains('keyboard-selected'));
    await page.keyboard.press('j');
    assert.strictEqual(await isSelected('test-tab-1'), true, 'First card should have .keyboard-selected after pressing j');
    await page.keyboard.press('j');
    assert.strictEqual(await isSelected('test-tab-2'), true, 'Second card should have .keyboard-selected after pressing j again');
    await page.keyboard.press('k');
    assert.strictEqual(await isSelected('test-tab-1'), true, 'First card should have .keyboard-selected after pressing k');

    // Enter reopens the selected card (capture the RESTORE_TAB message instead of opening a tab)
    await page.evaluate(() => {
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => { window.__sent = msg; return { success: true, restoredInPlace: false }; };
    });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__sent);
    const sent = await page.evaluate(() => {
      chrome.runtime.sendMessage = window.__realSend;
      return window.__sent;
    });
    assert.strictEqual(sent.type, 'RESTORE_TAB', 'Enter on a selected card sends RESTORE_TAB');
    assert.strictEqual(sent.recordId, 'test-tab-1', 'Enter reopens the selected card');
    assert.match(await page.textContent('#toast-message'), /Tab reopened/, 'Reopen confirms with a toast');
    console.log('✓ j / k selection and Enter-to-reopen verified\n');

    // j / k move real focus onto the card title (screen readers announce it)
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('j');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.className), 'card-title', 'j focuses the selected card title');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.closest('.tab-card')?.dataset.id), 'test-tab-2', 'Focused title belongs to the selected card');
    await page.evaluate(() => document.activeElement?.blur());
    console.log('✓ j / k move focus to the card title\n');

    // --- Toast: hover pauses the Undo timer; hidden toast leaves the tab order; failed Undo is honest ---
    console.log('--- Toast: pause, tab order, honest Undo ---');
    await page.locator('.tab-card[data-id="test-tab-3"] .delete-btn').click();
    await page.waitForSelector('#toast-undo-btn:visible');
    await page.hover('#toast');
    await page.waitForTimeout(5500); // longer than the 5s Undo window
    assert.strictEqual(await page.locator('#toast').evaluate(el => el.classList.contains('hidden')), false, 'Hovered Undo toast does not auto-dismiss');
    await page.locator('#toast-undo-btn').click();
    await page.waitForFunction(() => /Note restored/.test(document.getElementById('toast-message').textContent));
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.getElementById('toast').classList.contains('hidden'), null, { timeout: 8000 });
    await page.waitForTimeout(400); // fade-out finishes, then visibility flips
    assert.strictEqual(await page.locator('#toast-undo-btn').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Hidden toast Undo is out of the tab order');
    assert.strictEqual(await page.locator('.tab-card[data-id="test-tab-3"]').count(), 1, 'Undo brought the card back');

    // A failed restore (record purged before Undo) must not claim success.
    await page.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      await saveArchivedTab({ id: 'tmp-undo', url: 'https://example.com/tmp', title: 'Temp', domain: 'example.com', capturedAt: Date.now(), summary: { tldr: 't', bullets: [], tags: [] }, status: 'archived' });
    });
    await page.reload();
    await page.waitForSelector('.tab-card[data-id="tmp-undo"]');
    await page.locator('.tab-card[data-id="tmp-undo"] .delete-btn').click();
    await page.waitForSelector('#toast-undo-btn:visible');
    await page.evaluate(async () => {
      const { purgeDeletedTabs } = await import('/src/storage/db.js');
      await purgeDeletedTabs(0);
    });
    await page.locator('#toast-undo-btn').click();
    await page.waitForFunction(() => /Could not restore/.test(document.getElementById('toast-message').textContent));
    assert.ok(!/Note restored/.test(await page.textContent('#toast-message')), 'Failed Undo does not claim success');
    assert.strictEqual(await page.locator('#toast').evaluate(el => el.classList.contains('error')), true, 'Failed Undo shows the error style');
    console.log('✓ Toast pause, visibility and honest Undo verified\n');

    // --- TEST 6: Filters drawer (narrow layout) ---
    console.log('--- Test 6: Filters Drawer (narrow layout) ---');
    await page.click('#filters-btn');
    await page.locator('#sidebar').waitFor({ state: 'visible' });
    assert.strictEqual(await page.getAttribute('#filters-btn', 'aria-expanded'), 'true', 'Filters button reports the open drawer');
    for (const selector of ['.nav-item[data-view="inbox"]', '.nav-item[data-time="today"]', '.nav-item[data-time="favorites"]', '#sidebar-tags [data-tag="ai"]', '#sidebar-domains [data-domain="example.com"]', '#export-dropdown-btn', '#settings-btn']) {
      assert.strictEqual(await page.locator(selector).isVisible(), true, `Drawer must contain ${selector}`);
    }
    assert.match(await page.textContent('#sidebar-tags [data-tag="web"] .badge'), /^2$/, 'Tag list shows counts');

    // Export dropdown lives in the drawer too; same open / visible / Escape-closes check as the wide layout
    const drawerExportMenu = page.locator('#export-dropdown-menu');
    await page.click('#export-dropdown-btn');
    assert.strictEqual(await drawerExportMenu.isVisible(), true, 'Export menu opens from the drawer');
    assert.strictEqual(await drawerExportMenu.locator('.export-option-btn').count(), 3, 'Export offers Markdown, Obsidian and JSON');
    const [drawerExportBtnBox, drawerExportMenuBox] = await Promise.all([
      page.locator('#export-dropdown-btn').boundingBox(),
      drawerExportMenu.boundingBox()
    ]);
    const overlapsOrAdjacent = drawerExportMenuBox.x < drawerExportBtnBox.x + drawerExportBtnBox.width + 24 &&
      drawerExportMenuBox.x + drawerExportMenuBox.width > drawerExportBtnBox.x - 24 &&
      drawerExportMenuBox.y < drawerExportBtnBox.y + drawerExportBtnBox.height + 24 &&
      drawerExportMenuBox.y + drawerExportMenuBox.height > drawerExportBtnBox.y - 24;
    assert.ok(overlapsOrAdjacent, `Export menu should render near its button, not at the viewport origin (btn=${JSON.stringify(drawerExportBtnBox)}, menu=${JSON.stringify(drawerExportMenuBox)})`);
    await page.keyboard.press('Escape');
    assert.strictEqual(await drawerExportMenu.isHidden(), true, 'Escape closes the export menu in the drawer');

    await page.keyboard.press('Escape');
    await page.locator('#sidebar').waitFor({ state: 'hidden' });
    console.log('✓ Drawer opens with views, time filters, favorites, tags, domains, export & settings; Escape closes it');

    await page.click('#filters-btn');
    await page.locator('#sidebar').waitFor({ state: 'visible' });
    await page.click('#sidebar-tags [data-tag="ai"]');
    await page.locator('#sidebar').waitFor({ state: 'hidden' });
    assert.deepStrictEqual(await cardIds(), ['test-tab-1'], 'Tag filter narrows the feed');
    assert.match(await page.textContent('#filter-label'), /#ai/, 'Filter banner names the active tag');
    assert.strictEqual(await page.locator('#filters-btn').evaluate(el => el.classList.contains('has-filter')), true, 'Filters button flags an active filter');
    await page.click('#clear-filter-btn');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 3);
    assert.strictEqual(await page.locator('#filter-banner').isHidden(), true, 'Clearing hides the filter banner');
    console.log('✓ Picking a tag closes the drawer, filters the feed and shows a clearable banner\n');

    // --- TEST 7: Reader view fills the panel ---
    console.log('--- Test 7: Reader View (narrow) ---');
    await page.click('.tab-card[data-id="test-tab-1"] .reader-btn');
    await page.waitForFunction(() => document.getElementById('modal-text-content').textContent.includes('full article text'));
    assert.strictEqual(await page.textContent('#modal-title'), 'Deep Learning and Neural Networks');
    assert.ok(await page.locator('#modal-text-content h2').count() === 1, 'Article text is formatted (headings)');
    // Layout size (offsetWidth/Height ignore the scale() entry animation)
    const dialogBox = await page.locator('#reader-dialog').evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
    assert.ok(dialogBox.width >= NARROW.width - 1 && dialogBox.height >= NARROW.height - 1, `Reader should fill the panel, got ${dialogBox.width}x${dialogBox.height}`);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.getElementById('reader-dialog').open), false, 'Escape closes the reader');
    console.log('✓ Reader loads full text via getTabById, fills the panel, closes on Escape\n');

    // --- TEST 8: Durable delete with 5-second Undo toast ---
    console.log('--- Test 8: Durable Delete & Interactive Undo Toast ---');
    await firstCard.locator('.delete-btn').click();
    assert.strictEqual(await firstCard.evaluate(el => el.classList.contains('removing')), true, 'Card should receive .removing class on delete');
    const toastUndoBtn = page.locator('#toast-undo-btn');
    await toastUndoBtn.waitFor({ state: 'visible', timeout: 2000 }); // shown once softDeleteTab resolves
    assert.strictEqual(await page.locator('#toast').isVisible(), true, 'Toast should be visible');
    assert.strictEqual(await toastUndoBtn.isVisible(), true, 'Undo button in toast should be visible');
    const deletedNow = await page.evaluate(async () => {
      const { getArchivedTabs } = await import('/src/storage/db.js');
      return !(await getArchivedTabs({})).some(t => t.id === 'test-tab-1');
    });
    assert.strictEqual(deletedNow, true, 'Delete is durable immediately (softDeleteTab)');
    await toastUndoBtn.click();
    await page.waitForSelector('.tab-card[data-id="test-tab-1"]:not(.removing)');
    assert.strictEqual(await page.locator('.tab-card[data-id="test-tab-1"]').isVisible(), true, 'Card should be restored in feed after clicking Undo');
    console.log('✓ Delete and Undo restoration verified');

    console.log('Testing deletion permanence after 5.2 seconds...');
    await page.locator('.tab-card[data-id="test-tab-2"] .delete-btn').click();
    await page.waitForTimeout(5300);
    const tab2ExistsInDb = await page.evaluate(async () => {
      const { getArchivedTabs } = await import('/src/storage/db.js');
      return (await getArchivedTabs({})).some(t => t.id === 'test-tab-2');
    });
    assert.strictEqual(tab2ExistsInDb, false, 'Card should stay deleted from DB after the 5s undo window');
    assert.strictEqual(await page.locator('.tab-card[data-id="test-tab-2"]').count(), 0, 'Deleted card is gone from the feed');
    console.log('✓ Permanent deletion verified after 5s timeout\n');

    // --- TEST 8b: Reopen with Remove Notes When Reopened offers Undo ---
    console.log('--- Test 8b: Reopen Removes the Note, Undo Brings It Back as Reopened ---');
    // Own record, so later tests' fixtures keep their status; it is tombstoned again at the end.
    await page.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      await saveArchivedTab({
        id: 'remove-on-reopen', url: 'https://example.com/remove-on-reopen', title: 'Remove on reopen',
        domain: 'example.com', capturedAt: Date.now() - 30000, readingTimeMinutes: 1, cleanText: 'x',
        summary: { tldr: 'Reopen removal fixture.', bullets: ['a'], tags: [] }, status: 'archived'
      });
    });
    await page.reload();
    const removeCardSel = '.tab-card[data-id="remove-on-reopen"]';
    await page.waitForSelector(removeCardSel);
    // Stand in for the service worker with the setting on: soft-delete the note and answer removed: true.
    await page.evaluate(() => {
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => {
        const { softDeleteTab } = await import('/src/storage/db.js');
        await softDeleteTab(msg.recordId);
        return { success: true, restoredInPlace: false, removed: true };
      };
    });
    await page.locator(`${removeCardSel} .restore-btn`).click();
    await page.waitForFunction(() => /Note removed/.test(document.querySelector('#toast-message')?.textContent || ''));
    await page.locator('#toast-undo-btn').waitFor({ state: 'visible', timeout: 2000 });
    await page.waitForFunction((sel) => !document.querySelector(sel), removeCardSel);
    await page.evaluate(() => { chrome.runtime.sendMessage = window.__realSend; });
    await page.locator('#toast-undo-btn').click();
    await page.waitForSelector(removeCardSel);
    const afterUndo = await page.evaluate(async () => {
      const { getTabById } = await import('/src/storage/db.js');
      return getTabById('remove-on-reopen');
    });
    assert.ok(!afterUndo.deletedAt, 'Undo clears the tombstone');
    assert.strictEqual(afterUndo.status, 'restored', 'Undo leaves the note Reopened, as with the setting off');
    await page.waitForSelector(`${removeCardSel}:not(.undo-restored)`); // let the highlight animation finish
    await page.evaluate(async () => {
      const { softDeleteTab } = await import('/src/storage/db.js');
      await softDeleteTab('remove-on-reopen');
    });
    await page.reload();
    await page.waitForSelector('.tab-card');
    console.log('✓ Removed-on-reopen note is hidden, then restored as Reopened by Undo\n');

    // --- TEST 9: Wide layout (full view) ---
    console.log('--- Test 9: Wide Layout (1280px): Sidebar, Grid, Filters, Export ---');
    await page.setViewportSize(WIDE);
    assert.strictEqual(await page.locator('#sidebar').isVisible(), true, 'Wide layout shows the persistent sidebar');
    assert.strictEqual(await page.locator('#filters-btn').isHidden(), true, 'Wide layout hides the Filters button');
    const [boxA, boxB] = await Promise.all([
      page.locator('.tab-card[data-id="test-tab-1"]').boundingBox(),
      page.locator('.tab-card[data-id="test-tab-3"]').boundingBox()
    ]);
    assert.ok(Math.abs(boxA.y - boxB.y) < 2 && boxB.x > boxA.x, 'Wide layout lays cards out in a multi-column grid');
    assert.strictEqual(await page.locator('.tab-card[data-id="test-tab-1"] .card-bullets').isVisible(), true, 'Wide cards show takeaways');
    assert.strictEqual(await page.textContent('#results-count'), '2 notes', 'Results count reflects the feed');

    const savedBadge = page.locator('.tab-card[data-id="test-tab-3"] .badge-status');
    assert.strictEqual((await savedBadge.textContent()).trim(), 'Saved', 'captured status renders the Saved badge');
    assert.strictEqual(await savedBadge.getAttribute('title'), 'Saved manually; tab left open', 'Saved badge tooltip is the closureReason');
    console.log('✓ Sidebar + multi-column grid; Saved badge with closureReason tooltip');

    // Favorites
    await page.click('.tab-card[data-id="test-tab-3"] .star-btn');
    await page.waitForFunction(() => document.getElementById('count-favorites').textContent === '1');
    await page.click('.nav-item[data-time="favorites"]');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 1);
    assert.deepStrictEqual(await cardIds(), ['test-tab-3'], 'Favorites lists starred notes');
    assert.match(await page.textContent('#filter-label'), /Starred/, 'Banner names the Starred filter');
    await page.click('.tab-card[data-id="test-tab-3"] .star-btn');
    await page.waitForFunction(() => !document.querySelector('.tab-card[data-id="test-tab-3"]'));
    console.log('✓ Star + Favorites filter (unstarring drops the card from Favorites)');

    // Domain filter
    await page.click('.nav-item[data-view=""]');
    await page.click('#sidebar-domains [data-domain="example.com"]');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 1);
    assert.deepStrictEqual(await cardIds(), ['test-tab-1'], 'Domain filter narrows the feed');
    assert.match(await page.textContent('#filter-label'), /domain: example\.com/);
    await page.click('#clear-filter-btn');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 2);

    // Tag pill on a card
    await page.click('.tab-card[data-id="test-tab-1"] .card-tag[data-tag="research"]');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 1);
    assert.match(await page.textContent('#filter-label'), /#research/, 'Tag pill click filters by that tag');
    assert.strictEqual(await page.locator('#sidebar-tags [data-tag="research"]').evaluate(el => el.classList.contains('applied')), true, 'Sidebar marks the applied tag');
    assert.strictEqual(await page.locator('#sidebar .nav-item[aria-current="page"]').count(), 1, 'A tag filter leaves exactly one current view');
    assert.strictEqual(await page.locator('#sidebar .nav-item[aria-current="page"]').getAttribute('data-view'), '', 'The current view is still All notes');
    assert.strictEqual(await page.locator('#sidebar .filter-item-btn.applied').count(), 1, 'Exactly one applied filter is marked');
    assert.strictEqual(await page.locator('#sidebar-tags [data-tag="research"]').getAttribute('aria-current'), null, 'An applied tag is not a current view');
    await page.click('#clear-filter-btn');
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 2);
    assert.deepStrictEqual(await page.locator('#sidebar .nav-section-title').allTextContents(), ['Views', 'When', 'Tags', 'Domains'], 'Sidebar sections run Views / When / Tags / Domains');
    assert.strictEqual(await page.locator('#sidebar .nav-item[data-time="favorites"]').evaluate((el) => {
      let node = el;
      while (node && !node.classList.contains('nav-section-title')) node = node.previousElementSibling;
      return node?.textContent;
    }), 'Views', 'Starred sits under Views');

    // Domains: top 5 visible, the rest behind "More"
    await page.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      for (let i = 1; i <= 4; i++) {
        await saveArchivedTab({ id: `extra-domain-${i}`, url: `https://site${i}.test/a`, title: `Extra ${i}`, domain: `site${i}.test`,
          capturedAt: Date.now() - 1000 * i, summary: { tldr: 'x', bullets: [], tags: [] }, status: 'archived' });
      }
    });
    await page.reload();
    await page.waitForSelector('.tab-card');
    assert.strictEqual(await page.locator('#sidebar-domains > .filter-item-btn').count(), 5, 'Domains list shows the top 5');
    const domainsMore = page.locator('#sidebar-domains details.filter-more');
    const allDomains = await page.evaluate(async () => (await (await import('/src/storage/db.js')).getAllDomains()).length);
    assert.ok(allDomains > 5, 'Seeded more than 5 domains');
    assert.strictEqual(await domainsMore.locator('.filter-item-btn').count(), allDomains - 5, 'Every other domain sits under More');
    assert.strictEqual(await domainsMore.locator('.filter-item-btn').first().isHidden(), true, 'More starts collapsed');
    await domainsMore.locator('summary').click();
    assert.strictEqual(await domainsMore.locator('.filter-item-btn').first().isVisible(), true, 'More reveals the rest');
    assert.strictEqual(await page.locator('#sidebar-tags details.filter-more').count(), 0, 'A short tag list has no More');
    await page.evaluate(async () => {
      const { softDeleteTab } = await import('/src/storage/db.js');
      for (let i = 1; i <= 4; i++) await softDeleteTab(`extra-domain-${i}`);
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#tabs-feed .tab-card').length === 2);
    console.log('✓ Domain filter, card tag-pill filter and banner clear verified');

    // Export dropdown
    const exportMenu = page.locator('#export-dropdown-menu');
    await page.click('#export-dropdown-btn');
    assert.strictEqual(await exportMenu.isVisible(), true, 'Export menu opens');
    assert.strictEqual(await exportMenu.locator('.export-option-btn').count(), 3, 'Export offers Markdown, Obsidian and JSON');
    await page.keyboard.press('Escape');
    assert.strictEqual(await exportMenu.isHidden(), true, 'Escape closes the export menu');
    await page.click('#export-dropdown-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.click('.export-option-btn[data-format="obsidian"]')
    ]);
    assert.match(download.suggestedFilename(), /^tab-squirrel-obsidian-vault-\d+\.zip$/, 'Obsidian export downloads a .zip vault');
    console.log(`✓ Export dropdown verified (downloaded ${download.suggestedFilename()})\n`);

    // --- TEST 10: Live refresh on TABS_CLOSED ---
    console.log('--- Test 10: "Closed today" refreshes live on TABS_CLOSED ---');
    assert.strictEqual(await page.locator('#closed-today').isHidden(), true, 'Closed today hidden when nothing was closed');
    await page.evaluate(async () => {
      const { saveArchivedTab, markClosedByTabSquirrel } = await import('/src/storage/db.js');
      await saveArchivedTab({
        id: 'closed-note', url: 'https://closed.example/article', title: 'Closed In Background', domain: 'closed.example',
        status: 'archived', summary: { tldr: 'Closed by the sweep', bullets: [], tags: [] }
      });
      await markClosedByTabSquirrel('closed-note');
    });
    await background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    await page.waitForSelector('#closed-today:not([hidden])', { timeout: 5000 });
    const [receiptBox, searchBox] = await Promise.all([page.locator('#closed-today').boundingBox(), page.locator('#search-input').boundingBox()]);
    assert.ok(receiptBox.y < searchBox.y, 'The receipt sits above the search row');
    assert.strictEqual(await page.textContent('#closed-today-count'), '1', 'Closed today counts the newly closed tab');
    await page.waitForSelector('.tab-card[data-id="closed-note"]', { timeout: 5000 });
    console.log('✓ TABS_CLOSED refreshes "Closed today" and the feed without a reload\n');

    // --- TEST 10b: the receipt (open first, a reason per row, collapse once seen, Reopen all) ---
    console.log('--- Test 10b: "Closed today" receipt ---');
    const receiptOpen = () => page.locator('#closed-today').evaluate(el => el.open);
    const closeNote = (note) => page.evaluate(async (n) => {
      const { saveArchivedTab, markClosedByTabSquirrel } = await import('/src/storage/db.js');
      await saveArchivedTab({ ...n, domain: 'closed.example', status: 'archived', summary: { tldr: `${n.id} gist`, bullets: [], tags: [] } });
      await markClosedByTabSquirrel(n.id);
    }, note);
    const tellClosed = () => background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    assert.strictEqual(await receiptOpen(), true, 'Receipt is open by default when it holds closures not yet seen');
    assert.match(await page.textContent('#closed-today > summary'), /Closed 1 tab for you today/, 'Receipt opens with one plain sentence');
    await closeNote({ id: 'closed-slept', url: 'https://closed.example/slept', title: 'Slept First', closureTier: 'suspend_only', closureReason: 'Contains form or interactive input controls' });
    await closeNote({ id: 'closed-trusted', url: 'https://closed.example/trusted', title: 'Trusted', closureTier: 'suspend_only', closureReason: 'Closed: trusted domain' });
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-count').textContent === '3');
    assert.match(await page.textContent('#closed-today > summary'), /Closed 3 tabs for you today/, 'Receipt pluralises');
    const reasons = await page.locator('#closed-today-list .closed-today-row .closed-today-reason').allTextContents();
    assert.strictEqual(reasons.length, 3, 'Every row has a reason');
    assert.ok(reasons.every(r => r.trim().length > 0), 'No row has an empty reason');
    assert.ok(reasons.some(r => /Slept first/.test(r)) && reasons.some(r => /always-close list/.test(r)) && reasons.some(r => /idle/.test(r)), 'Reasons follow how each tab was closed');

    // Seen once: a later open the same day starts collapsed, until something new is closed.
    await page.reload();
    await page.waitForSelector('#closed-today:not([hidden])');
    await page.waitForSelector('.tab-card');
    assert.strictEqual(await receiptOpen(), false, 'Receipt starts collapsed on a later open the same day');
    await closeNote({ id: 'closed-later', url: 'https://closed.example/later', title: 'Later', closureTier: 'safe_to_close', closureReason: 'Pure stateless reading article' });
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-count').textContent === '4');
    assert.strictEqual(await receiptOpen(), true, 'New closures since the last look open the receipt again');

    // Reopen all reopens every row, then the receipt hides itself (nothing closed today any more).
    const pagesBefore = new Set(context.pages());
    await page.click('#closed-today-reopen-all');
    await page.waitForSelector('#closed-today', { state: 'hidden', timeout: 15000 });
    const afterReopenAll = await page.evaluate(async () => {
      const { getTabById } = await import('/src/storage/db.js');
      return Promise.all(['closed-note', 'closed-slept', 'closed-trusted', 'closed-later'].map(async id => (await getTabById(id))?.status));
    });
    assert.deepStrictEqual(afterReopenAll, ['restored', 'restored', 'restored', 'restored'], 'Reopen all reopened every row');
    assert.match(await page.textContent('#toast-message'), /Reopened 4 tabs\./, 'Reopen all reports what it did');
    assert.strictEqual(await page.locator('#closed-today').isHidden(), true, 'Receipt is hidden when nothing was closed today');
    // Close the four tabs Reopen all opened; wait for all of them to register first so none
    // lingers (a late one would be picked up by Test 11's waitForEvent('page')).
    for (let i = 0; i < 50 && context.pages().filter(p => !pagesBefore.has(p)).length < 4; i++) await new Promise(r => setTimeout(r, 100));
    for (const extra of context.pages()) if (!pagesBefore.has(extra)) await extra.close();
    await page.evaluate(async () => { // later tests expect the original seed data
      const { softDeleteTab, purgeDeletedTabs } = await import('/src/storage/db.js');
      for (const id of ['closed-note', 'closed-slept', 'closed-trusted', 'closed-later']) await softDeleteTab(id);
      await purgeDeletedTabs(0);
    });
    console.log('✓ Receipt: open with a reason per row, collapses once seen, reopens on new closures, Reopen all, hidden when empty\n');

    await page.evaluate(async () => {
      const { saveSettings, DEFAULT_SETTINGS } = await import('/src/storage/db.js');
      await saveSettings(DEFAULT_SETTINGS);
    });

    // --- TEST 11: Side panel surface ---
    console.log('--- Test 11: Side Panel Surface (panel-only controls, Open full view) ---');
    const panel = await context.newPage();
    // In the real side panel chrome.tabs.getCurrent() resolves undefined; Playwright pages are tabs.
    await panel.addInitScript(() => { chrome.tabs.getCurrent = () => Promise.resolve(undefined); });
    await panel.setViewportSize(NARROW);
    await panel.goto(APP_URL);
    await panel.waitForSelector('body[data-surface="panel"]', { timeout: 5000 });
    assert.strictEqual(await panel.locator('#archive-current-btn').isVisible(), true, '"Archive Current Tab" is shown in the side panel');
    assert.strictEqual(await panel.locator('#open-full-btn').isVisible(), true, '"Open full view" is shown in the side panel');
    assert.strictEqual(await panel.locator('#view-inbox').getAttribute('aria-current'), 'page', 'Side panel opens on the Inbox');
    console.log('✓ Panel surface shows Archive Current Tab + Open full view and opens on Inbox');

    const [fullPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }),
      panel.click('#open-full-btn')
    ]);
    await fullPage.waitForLoadState('domcontentloaded');
    assert.ok(fullPage.url().endsWith('/src/app/index.html'), 'Open full view opens src/app/index.html in a tab: ' + fullPage.url());
    await fullPage.waitForSelector('body[data-surface="tab"]');
    assert.strictEqual(await fullPage.locator('#archive-current-btn').isHidden(), true, 'The full view tab hides Archive Current Tab');
    await new Promise(r => setTimeout(r, 400));
    assert.strictEqual(panel.isClosed(), true, 'Side panel should close itself after opening the full view');
    console.log('✓ Open full view opens a tab and closes the side panel\n');
    await fullPage.close();

    // The sort choice survives a reload (stored in chrome.storage.local)
    const sortPage = await context.newPage();
    await sortPage.addInitScript(() => { chrome.tabs.getCurrent = () => Promise.resolve(undefined); });
    await sortPage.setViewportSize(NARROW);
    await sortPage.goto(APP_URL);
    await sortPage.waitForSelector('body[data-surface="panel"]');
    await sortPage.click('#view-options > summary');
    await sortPage.selectOption('#sort-select', 'oldest');
    await sortPage.waitForFunction(async () => (await chrome.storage.local.get('notebook_sort')).notebook_sort === 'oldest');
    await sortPage.reload();
    await sortPage.waitForSelector('body[data-surface="panel"]');
    assert.strictEqual(await sortPage.locator('#sort-select').inputValue(), 'oldest', 'Sort choice persists across reload');
    await sortPage.evaluate(() => chrome.storage.local.remove('notebook_sort'));
    await sortPage.close();
    console.log('✓ Sort choice persists across reload\n');

    // --- TEST 12: Inbox / Reopened views, fade chip, star, expiring-soon sort ---
    console.log('--- Test 12: Inbox Views, Fading & Expiring-Soon Sort ---');
    const hub = await context.newPage();
    await hub.goto(APP_URL);
    await hub.evaluate(async () => {
      const { saveArchivedTab, markReopened } = await import('/src/storage/db.js');
      const DAY = 24 * 60 * 60 * 1000;
      const note = (id, capturedAt) => saveArchivedTab({
        id, url: `https://notes.example/${id}`, title: id, capturedAt, status: 'archived',
        summary: { tldr: `${id} summary`, bullets: [], tags: [] }
      });
      await note('inbox-note', Date.now() - DAY);
      await note('fading-note', Date.now() - 29 * DAY); // 30-day window -> fades in ~1 day
      await note('reopened-note', Date.now() - 2 * DAY);
      await markReopened('reopened-note');
    });
    await hub.reload();
    await hub.waitForSelector('.tab-card[data-id="inbox-note"]', { timeout: 5000 });
    await hub.click('.nav-item[data-view="inbox"]');
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="reopened-note"]'));

    let ids = await cardIds(hub);
    assert.ok(ids.includes('fading-note') && !ids.includes('reopened-note'), `Inbox must hide reopened notes, got ${ids}`);
    const chip = await hub.textContent('.tab-card[data-id="fading-note"] .fade-chip');
    assert.match(chip, /Fading soon · (1d left|today)/, 'Note near its fade date shows a chip');
    console.log(`✓ Inbox hides reopened notes; fading note shows "${chip}"`);

    await hub.click('.nav-item[data-view="reopened"]');
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="inbox-note"]'));
    const reopenedBadge = await hub.textContent('.tab-card[data-id="reopened-note"] .badge-status');
    assert.deepStrictEqual(await cardIds(hub), ['reopened-note'], 'Reopened view lists only reopened notes');
    assert.strictEqual(reopenedBadge.trim(), 'Reopened', 'Reopened notes carry the Reopened badge');
    console.log('✓ Reopened view lists only reopened notes');

    await hub.click('.nav-item[data-view=""]');
    await hub.waitForSelector('.tab-card[data-id="fading-note"]');
    await hub.click('.tab-card[data-id="fading-note"] .star-btn');
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="fading-note"] .fade-chip'));
    console.log('✓ Starring removes the fade chip');

    await hub.click('#view-options > summary');
    await hub.selectOption('#sort-select', 'expiring-soon');
    await hub.waitForFunction(() => document.querySelector('#tabs-feed .tab-card')?.dataset.id === 'reopened-note');
    ids = await cardIds(hub);
    assert.strictEqual(ids[0], 'reopened-note', 'Soonest-fading note first (reopened: 7-day window)');
    assert.strictEqual(ids[ids.length - 1], 'fading-note', 'Starred note never fades, so it sorts last');
    console.log('✓ Expiring-soon sort orders by fade date, starred last\n');
    await hub.close();

    console.log('========================================================');
    console.log('🎉 ALL KNOWLEDGE HUB UX TESTS PASSED (NARROW + WIDE LAYOUTS, PANEL + TAB SURFACES)! 🎉');
    console.log('========================================================\n');
  } finally {
    if (context) await context.close();
  }
}

runAppUXTests().catch(err => {
  console.error('❌ Knowledge Hub UX Test Failure:', err);
  process.exit(1);
});
