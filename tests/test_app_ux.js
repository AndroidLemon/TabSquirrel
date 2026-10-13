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

    // --- First run: an empty notebook says what will happen, never "Inbox zero" ---
    console.log('--- Test 0: First-run empty state ---');
    await page.waitForSelector('#tabs-feed .empty-state');
    const firstRunTab = await page.textContent('#tabs-feed .empty-state');
    assert.match(firstRunTab, /Tabs left idle for 60 minutes are closed/, 'First run states the real idle threshold');
    assert.match(firstRunTab, /short note of each is kept here/, 'First run says a note is kept');
    assert.match(firstRunTab, /reopens in one click/, 'First run says closed tabs reopen in one click');
    assert.ok(!/Save current tab/.test(firstRunTab), 'The full tab does not offer Save current tab');
    assert.strictEqual(await page.locator('#perm-banner').isVisible(), true, 'An empty notebook without the permission shows the permission note');
    assert.strictEqual(await page.locator('#perm-banner').evaluate(el => el.classList.contains('quiet')), false, 'It is not quiet before the first note');
    assert.strictEqual(await page.locator('#perm-dismiss-btn').isHidden(), true, 'It cannot be dismissed before the first note');
    assert.strictEqual(await page.locator('#fade-note').count(), 1, 'The fade sentence shows in the empty state');
    const firstRunPanel = await context.newPage();
    await firstRunPanel.addInitScript(() => { chrome.tabs.getCurrent = () => Promise.resolve(undefined); });
    await firstRunPanel.setViewportSize(NARROW);
    await firstRunPanel.goto(APP_URL);
    await firstRunPanel.waitForSelector('body[data-surface="panel"] #tabs-feed .empty-state');
    assert.strictEqual(await firstRunPanel.locator('#view-inbox').getAttribute('aria-current'), 'page', 'The panel opens on the Inbox');
    const firstRunText = await firstRunPanel.textContent('#tabs-feed .empty-state');
    assert.ok(!/Inbox zero/.test(firstRunText), 'First run in the panel never says Inbox zero');
    assert.match(firstRunText, /Tabs left idle for 60 minutes/, 'The panel states the idle threshold');
    assert.match(firstRunText, /Save current tab/, 'The panel names Save current tab');
    assert.strictEqual(await firstRunPanel.locator('#tabs-feed .empty-icon').getAttribute('src'), '../assets/icons/icon-48.png', 'The empty state uses the acorn icon');
    await firstRunPanel.close();
    console.log('✓ First run explains what will happen, with the real threshold, and names Save current tab only in the panel\n');

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
    assert.strictEqual(await page.locator('#view-inbox').getAttribute('aria-current'), 'page', 'Full view opens on the Inbox, like the panel');
    assert.strictEqual(await page.locator('#view-all').getAttribute('aria-pressed'), null, 'View switch uses aria-current, not aria-pressed');
    assert.strictEqual(await page.locator('#sidebar').isHidden(), true, 'Narrow layout hides the sidebar behind the Filters drawer');
    assert.strictEqual(await page.locator('#filters-btn').isVisible(), true, 'Narrow layout shows the Filters button');
    assert.strictEqual(await page.locator('#view-tabs').isVisible(), true, 'Inbox/Reopened/All control stays visible above the feed');
    const rowGap = await page.evaluate(() => {
      const mid = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top + r.height / 2; };
      return Math.max(Math.abs(mid('view-tabs') - mid('results-count')), Math.abs(mid('view-tabs') - mid('view-options')));
    });
    assert.ok(rowGap < 20, `The count and Sort and view share the view tabs row (centres ${rowGap}px apart)`);
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

    // j / k move real focus onto the card itself (screen readers announce it by its title)
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('j');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.classList.contains('tab-card')), true, 'j focuses the selected card');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.dataset.id), 'test-tab-2', 'The focused card is the selected one');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Modern Web APIs and Ergonomics', 'The card is named by its title');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.getAttribute('tabindex')), '-1', 'Cards take focus from j/k but are not tab stops');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'A selected card shows its halo outline');
    assert.strictEqual(await page.locator('.tab-card[data-id="test-tab-2"] .card-title-btn').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'The title button adds no second outline while the card is focused');
    await page.evaluate(() => document.activeElement?.blur());
    console.log('✓ j / k move focus to the card\n');

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
    assert.strictEqual(await page.getAttribute('.tab-card[data-id="test-tab-1"] .reader-btn', 'aria-label'), 'Read note', 'The reader button is labelled Read note');
    assert.strictEqual(await page.getAttribute('.tab-card[data-id="test-tab-1"] .reader-btn', 'title'), 'Read note', 'Its tooltip says Read note too');
    await page.click('.tab-card[data-id="test-tab-1"] .reader-btn');
    await page.waitForFunction(() => document.getElementById('modal-text-content').textContent.includes('full article text'));
    assert.strictEqual(await page.textContent('#modal-title'), 'Deep Learning and Neural Networks');
    assert.ok(await page.locator('#modal-text-content h2').count() === 1, 'Article text is formatted (headings)');
    // Layout size (offsetWidth/Height ignore the scale() entry animation)
    const dialogBox = await page.locator('#reader-dialog').evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
    assert.ok(dialogBox.width >= NARROW.width - 1 && dialogBox.height >= NARROW.height - 1, `Reader should fill the panel, got ${dialogBox.width}x${dialogBox.height}`);
    // Header: the title keeps its width, the actions stack beneath it, the close button stays top-right
    const readerHeader = () => page.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      const dialog = box('reader-dialog');
      const title = box('modal-title');
      const actions = document.querySelector('.modal-header-actions').getBoundingClientRect();
      const close = box('modal-close-btn');
      const link = document.getElementById('modal-source-link');
      return {
        dialogWidth: dialog.width, titleWidth: title.width, titleBottom: title.bottom, actionsTop: actions.top,
        closeTop: close.top, closeRightGap: dialog.right - close.right, overflow: document.getElementById('reader-dialog').scrollWidth - document.getElementById('reader-dialog').clientWidth,
        linkText: link.textContent, linkHref: link.href, linkHeight: link.getBoundingClientRect().height
      };
    });
    let header = await readerHeader();
    assert.ok(header.titleWidth > header.dialogWidth * 0.6, `Reader title keeps its width at 380px: ${header.titleWidth} of ${header.dialogWidth}`);
    assert.ok(header.actionsTop >= header.titleBottom, 'The actions sit on their own row beneath the title');
    assert.ok(header.closeTop < header.titleBottom && header.closeRightGap < 30, 'The close button stays top-right');
    assert.strictEqual(header.linkText, 'example.com', 'The header shows the domain, not the address');
    assert.strictEqual(header.linkHref, 'https://example.com/deep-learning', 'The link still goes to the full URL');
    assert.ok(header.linkHeight < 20, 'The source link stays on one line');
    // 200% zoom on a 1280px window is a 640px viewport
    await page.setViewportSize({ width: 640, height: 400 });
    header = await readerHeader();
    assert.ok(header.titleWidth > header.dialogWidth * 0.6, `Reader title keeps its width at 200% zoom: ${header.titleWidth} of ${header.dialogWidth}`);
    assert.strictEqual(header.overflow, 0, 'The reader does not scroll sideways at 200% zoom');
    await page.setViewportSize(WIDE);
    header = await readerHeader();
    assert.ok(header.actionsTop < header.titleBottom, 'On a wide window the actions share the title row');
    await page.setViewportSize(NARROW);
    // Body: the takeaways show, under a summary with no "Note overview" heading
    const readerSummary = await page.textContent('#modal-summary-box');
    assert.ok(!/Note overview/.test(readerSummary), 'The reader has no "Note overview" heading');
    assert.match(readerSummary, /extensive overview of modern deep learning/, 'The reader shows the TL;DR');
    assert.strictEqual(await page.locator('#modal-summary-box .modal-bullets li').count(), 3, 'The reader shows the takeaways');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.getElementById('reader-dialog').open), false, 'Escape closes the reader');
    console.log('✓ Reader loads full text via getTabById, fills the panel, keeps its header readable at 380px and 200% zoom, shows takeaways, closes on Escape\n');

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
    await page.click('#view-reopened'); // the restored note is Reopened, so it is not in the Inbox the page opens on
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
    assert.ok(!/respects active filters/i.test(await exportMenu.textContent()), 'The export menu does not repeat "respects active filters"');
    assert.strictEqual(await exportMenu.locator('[data-format="json"] .option-title').textContent(), 'JSON backup (.json)', 'Export titles are sentence case');
    assert.match(await exportMenu.locator('[data-format="json"] .option-desc').textContent(), /ignoring filters/, 'JSON says it ignores filters');
    assert.match(await exportMenu.locator('[data-format="markdown"] .option-desc').textContent(), /you are viewing/, 'Markdown says it follows the current view');
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
      await markClosedByTabSquirrel(n.id, n.closedFrom ? { closedFrom: n.closedFrom } : undefined);
    }, note);
    const tellClosed = () => background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    assert.strictEqual(await receiptOpen(), true, 'Receipt is open by default when it holds closures not yet seen');
    assert.match(await page.textContent('#closed-today > summary'), /Closed 1 tab for you today/, 'Receipt opens with one plain sentence');
    await closeNote({ id: 'closed-slept', url: 'https://closed.example/slept', title: 'Slept First', closedFrom: 'suspended', closureTier: 'suspend_only', closureReason: 'Contains form or interactive input controls' });
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

    // Reopen all reopens every row; the rows stay, marked Reopened, and Reopen all has nothing left to do.
    const pagesBefore = new Set(context.pages());
    await page.click('#closed-today-reopen-all');
    await page.waitForFunction(() => document.getElementById('closed-today-reopened').textContent.includes('4 reopened'), null, { timeout: 15000 });
    const afterReopenAll = await page.evaluate(async () => {
      const { getTabById } = await import('/src/storage/db.js');
      return Promise.all(['closed-note', 'closed-slept', 'closed-trusted', 'closed-later'].map(async id => (await getTabById(id))?.status));
    });
    assert.deepStrictEqual(afterReopenAll, ['restored', 'restored', 'restored', 'restored'], 'Reopen all reopened every row');
    assert.match(await page.textContent('#toast-message'), /Reopened 4 tabs\./, 'Reopen all reports what it did');
    assert.match(await page.textContent('#closed-today > summary'), /Closed 4 tabs for you today · 4 reopened/, 'The headline keeps the day\'s count and says how many were reopened');
    assert.strictEqual(await page.locator('#closed-today-list .closed-today-state.reopened, #closed-today-more-list .closed-today-state.reopened').count(), 4, 'Every reopened row stays, marked Reopened');
    assert.strictEqual(await page.locator('#closed-today .closed-today-row .closed-today-reopen-btn').count(), 0, 'A reopened row has no Reopen button');
    assert.strictEqual(await page.locator('#closed-today-reopen-all').isHidden(), true, 'Reopen all is hidden when no row is still closed');
    // Close the four tabs Reopen all opened; wait for all of them to register first so none
    // lingers (a late one would be picked up by Test 11's waitForEvent('page')).
    for (let i = 0; i < 50 && context.pages().filter(p => !pagesBefore.has(p)).length < 4; i++) await new Promise(r => setTimeout(r, 100));
    for (const extra of context.pages()) if (!pagesBefore.has(extra)) await extra.close();
    await page.evaluate(async () => { // later tests expect the original seed data
      const { softDeleteTab, purgeDeletedTabs } = await import('/src/storage/db.js');
      for (const id of ['closed-note', 'closed-slept', 'closed-trusted', 'closed-later']) await softDeleteTab(id);
      await purgeDeletedTabs(0);
    });
    console.log('✓ Receipt: open with a reason per row, collapses once seen, reopens on new closures, Reopen all keeps its rows marked Reopened\n');

    // Reopen all with Remove Notes When Reopened on: one Undo toast brings every note back.
    // RESTORE_TAB is stubbed to do what the worker does (soft-delete, removed: true) without opening tabs.
    await page.evaluate(async () => {
      const { saveSettings, DEFAULT_SETTINGS } = await import('/src/storage/db.js');
      await saveSettings({ ...DEFAULT_SETTINGS, removeOnReopen: true });
    });
    await closeNote({ id: 'removed-a', url: 'https://closed.example/a', title: 'Removed A' });
    await closeNote({ id: 'removed-b', url: 'https://closed.example/b', title: 'Removed B' });
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-count').textContent === '2');
    await page.evaluate(() => {
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => {
        if (msg?.type !== 'RESTORE_TAB') return window.__realSend.call(chrome.runtime, msg);
        const { softDeleteTab } = await import('/src/storage/db.js');
        await softDeleteTab(msg.recordId);
        return { success: true, removed: true };
      };
    });
    await page.click('#closed-today-reopen-all');
    await page.locator('#toast-undo-btn').waitFor({ state: 'visible', timeout: 5000 });
    assert.match(await page.textContent('#toast-message'), /Reopened 2 tabs\. Their notes were removed\./, 'Reopen all says the notes were removed');
    await page.click('#toast-undo-btn');
    await page.waitForFunction(() => document.getElementById('toast-message').textContent === 'Notes restored');
    const removedAfterUndo = await page.evaluate(async () => {
      const { getTabById } = await import('/src/storage/db.js');
      return Promise.all(['removed-a', 'removed-b'].map(async id => { const t = await getTabById(id); return { present: Boolean(t), deleted: Boolean(t?.deletedAt), status: t?.status }; }));
    });
    assert.deepStrictEqual(removedAfterUndo, Array(2).fill({ present: true, deleted: false, status: 'restored' }), 'Undo restores every note Reopen all removed');
    await page.evaluate(async () => {
      chrome.runtime.sendMessage = window.__realSend;
      const { softDeleteTab, purgeDeletedTabs } = await import('/src/storage/db.js');
      for (const id of ['removed-a', 'removed-b']) await softDeleteTab(id);
      await purgeDeletedTabs(0);
    });
    console.log('✓ Reopen all with removed notes offers one Undo that restores them all\n');

    await page.evaluate(async () => {
      const { saveSettings, DEFAULT_SETTINGS } = await import('/src/storage/db.js');
      await saveSettings(DEFAULT_SETTINGS);
    });

    // --- TEST 10c: the receipt scales (3 rows, Show all), confirms big batches, shows progress and failures ---
    console.log('--- Test 10c: Receipt cap, title opens reader, confirm, progress, failures ---');
    const ids7 = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
    for (const id of ids7) {
      await closeNote({ id, url: `https://closed.example/${id}`, title: `Receipt ${id}`, lastActiveAt: Date.now() - 70 * 60000 });
    }
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-count').textContent === '7');
    const rowsIn = (list) => page.locator(`${list} .closed-today-row`).count();
    assert.strictEqual(await rowsIn('#closed-today-list'), 3, 'Only three receipt rows show at first');
    assert.strictEqual(await rowsIn('#closed-today-more-list'), 4, 'The rest wait behind Show all');
    assert.strictEqual(await page.locator('#closed-today-more').evaluate(el => el.open), false, 'Show all starts closed');
    assert.strictEqual(await page.locator('#closed-today-more .more-closed').innerText(), 'Show all 7', 'The disclosure says how many there are');
    assert.strictEqual(await page.locator('#closed-today-more-list .closed-today-title').first().isVisible(), false, 'Rows past the cap are hidden');
    await page.click('#closed-today-more > summary');
    assert.strictEqual(await page.locator('#closed-today-more-list .closed-today-title').first().isVisible(), true, 'Show all reveals the rest');
    await page.click('#closed-today-more > summary');
    assert.strictEqual(await page.locator('.closed-today-tldr').count(), 0, 'Rows no longer repeat the TL;DR');
    assert.match(await page.locator('#closed-today-list .closed-today-when').first().textContent(), /^closed .*\d.* · idle 7\d min$/, 'A row says when it closed and how long it sat idle');
    assert.strictEqual(await page.locator('#closed-today-list .closed-today-reason').first().isVisible(), true, 'and keeps its reason');

    // The row title is a real button that opens the reader
    const firstRowTitle = page.locator('#closed-today-list .closed-today-title').first();
    assert.strictEqual(await firstRowTitle.evaluate(el => el.tagName), 'BUTTON', 'The row title is a button');
    const firstRowName = await firstRowTitle.textContent();
    await firstRowTitle.click();
    await page.waitForFunction(() => document.getElementById('reader-dialog').open);
    assert.strictEqual(await page.textContent('#modal-title'), firstRowName, 'Clicking a row title opens that note in the reader');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.getElementById('reader-dialog').open), false);

    // Confirm above 5 still-closed rows, not at or below. Reopens are stubbed (r1 always fails, each takes a beat).
    const markReopenedNow = (id) => page.evaluate(async (i) => (await import('/src/storage/db.js')).markReopened(i), id);
    await page.evaluate(() => {
      window.__realSend = chrome.runtime.sendMessage;
      window.__restoreCalls = 0;
      chrome.runtime.sendMessage = async (msg) => {
        if (msg?.type !== 'RESTORE_TAB') return window.__realSend.call(chrome.runtime, msg);
        window.__restoreCalls++;
        await new Promise(r => setTimeout(r, 150));
        if (msg.recordId === 'r1') return { success: false, error: 'stubbed failure' };
        await (await import('/src/storage/db.js')).markReopened(msg.recordId);
        return { success: true };
      };
    });
    const confirmShown = () => page.locator('#closed-today-confirm').isVisible();
    await page.click('#closed-today-reopen-all');
    assert.strictEqual(await confirmShown(), true, 'Seven still-closed rows ask before reopening');
    assert.strictEqual((await page.textContent('#closed-today-confirm-text')).trim(), 'Reopen 7 tabs?');
    assert.strictEqual(await page.locator('#closed-today-reopen-all').isHidden(), true, 'The confirmation replaces the Reopen all button');
    assert.strictEqual(await page.evaluate(() => window.__restoreCalls), 0, 'Nothing reopens before the user confirms');
    await page.click('#closed-today-confirm-no');
    assert.strictEqual(await confirmShown(), false, 'Cancel dismisses the confirmation');
    assert.strictEqual(await page.locator('#closed-today-reopen-all').isVisible(), true, 'and brings Reopen all back');
    assert.strictEqual(await page.evaluate(() => window.__restoreCalls), 0, 'Cancel reopens nothing');

    await markReopenedNow('r7');
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-reopened').textContent.includes('1 reopened'));
    assert.match(await page.textContent('#closed-today > summary'), /Closed 7 tabs for you today · 1 reopened/, 'The headline counts the reopened row');
    await page.click('#closed-today-reopen-all');
    assert.strictEqual(await confirmShown(), true, 'Six still-closed rows still ask');
    assert.strictEqual((await page.textContent('#closed-today-confirm-text')).trim(), 'Reopen 6 tabs?');
    await page.click('#closed-today-confirm-no');

    await markReopenedNow('r6');
    await tellClosed();
    await page.waitForFunction(() => document.getElementById('closed-today-reopened').textContent.includes('2 reopened'));
    await page.click('#closed-today-reopen-all'); // five still closed: no question, and progress shows in the button
    assert.strictEqual(await confirmShown(), false, 'Five still-closed rows reopen without asking');
    await page.waitForFunction(() => /^Reopening \d of 5…$/.test(document.getElementById('closed-today-reopen-all').textContent));
    await page.waitForFunction(() => document.getElementById('closed-today-reopened').textContent.includes('6 reopened'), null, { timeout: 15000 });
    assert.strictEqual(await page.evaluate(() => window.__restoreCalls), 5, 'Reopen all only tried the rows that were still closed');
    assert.strictEqual((await page.textContent('#closed-today-reopen-all')).trim(), 'Reopen all', 'The button returns to its label');
    assert.match(await page.textContent('#toast-message'), /Reopened 4 tabs\. 1 could not be reopened\./);
    const failedRows = page.locator('#closed-today .closed-today-row', { has: page.locator('.closed-today-state.failed') });
    assert.strictEqual(await failedRows.count(), 1, 'Exactly one row is marked as failed');
    assert.match(await failedRows.textContent(), /Receipt r1[\s\S]*Could not reopen/, 'The failed row is named and says so');
    assert.strictEqual(await failedRows.locator('.closed-today-reopen-btn').count(), 1, 'and can be retried');
    assert.match(await page.textContent('#closed-today > summary'), /Closed 7 tabs for you today · 6 reopened/);
    assert.strictEqual(await page.locator('#closed-today-reopen-all').isVisible(), true, 'Reopen all stays while a row is still closed');
    await page.evaluate(async (ids) => {
      chrome.runtime.sendMessage = window.__realSend;
      const { softDeleteTab, purgeDeletedTabs } = await import('/src/storage/db.js');
      for (const id of ids) await softDeleteTab(id);
      await purgeDeletedTabs(0);
    }, ids7);
    console.log('✓ Receipt: three rows and Show all, title opens the reader, confirm above five, progress, named failures\n');

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
    const saveBtn = sortPage.locator('.topbar #archive-current-btn');
    assert.strictEqual(await saveBtn.count(), 1, 'Save current tab is an icon button in the topbar');
    assert.strictEqual(await saveBtn.getAttribute('aria-label'), 'Save current tab', 'It is named for assistive tech');
    assert.strictEqual(await saveBtn.getAttribute('title'), 'Save current tab', 'It has a tooltip');
    await sortPage.evaluate(() => {
      window.__sent = null;
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => { window.__sent = msg; return { success: true }; };
    });
    await saveBtn.click();
    await sortPage.waitForFunction(() => /Saved a note/.test(document.getElementById('toast-message').textContent));
    assert.strictEqual(await sortPage.evaluate(() => window.__sent.type), 'ARCHIVE_ACTIVE_TAB', 'It still saves the active tab');
    await sortPage.waitForFunction(() => !document.getElementById('archive-current-btn').disabled && !document.getElementById('archive-current-btn').hasAttribute('aria-busy')); // usable again after saving
    await sortPage.evaluate(() => { chrome.runtime.sendMessage = window.__realSend; });
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
    const viewCounts = await hub.evaluate(async () => {
      const { getArchivedTabs } = await import('/src/storage/db.js');
      return {
        inbox: String((await getArchivedTabs({ view: 'inbox', limit: Infinity })).length),
        reopened: String((await getArchivedTabs({ view: 'reopened', limit: Infinity })).length)
      };
    });
    assert.strictEqual(await hub.textContent('#count-inbox'), viewCounts.inbox, 'Inbox has a count badge');
    assert.strictEqual(await hub.textContent('#count-reopened'), viewCounts.reopened, 'Reopened has a count badge');
    assert.notStrictEqual(viewCounts.reopened, '0', 'The fixture has a reopened note, so the badge is not trivially zero');

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

    // --- TEST 13: Fade explanation, fade dates, reader actions, shortcuts legend, search keys ---
    console.log('--- Test 13: Onboarding Copy, Reader Actions, Legend & Search Keys ---');
    await hub.selectOption('#sort-select', 'newest');
    await hub.waitForFunction(() => document.querySelector('#sort-select').value === 'newest'
      && ![...document.querySelectorAll('.fade-chip')].some(c => c.textContent.startsWith('Fades in')));
    assert.strictEqual(await hub.locator('#fade-note').count(), 0, 'The fade sentence is not above the feed');
    const dateOf = (id) => hub.locator(`.tab-card[data-id="${id}"] .fade-date`);
    assert.strictEqual(await dateOf('inbox-note').count(), 0, 'A note 29 days from fading shows no date');
    assert.match(await dateOf('reopened-note').textContent(), /fades [A-Z][a-z]{2} \d{1,2}/, 'A reopened note (7 days left) shows its fade date');
    // 5 days out is inside the 7-day window and outside the 3-day chip: the date shows, the chip does not
    await hub.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      await saveArchivedTab({ id: 'near-note', url: 'https://notes.example/near-note', title: 'near-note', capturedAt: Date.now() - 25 * 24 * 60 * 60 * 1000,
        status: 'archived', summary: { tldr: 'near-note summary', bullets: [], tags: [] } });
    });
    await background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    await hub.waitForSelector('.tab-card[data-id="near-note"]');
    assert.match(await dateOf('near-note').textContent(), /fades [A-Z][a-z]{2} \d{1,2}/, 'A note 5 days from fading shows its date');
    assert.strictEqual(await hub.locator('.tab-card[data-id="near-note"] .fade-chip').count(), 0, 'It is outside the 3-day chip window');
    await hub.evaluate(async () => (await import('/src/storage/db.js')).softDeleteTab('near-note'));
    await background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="near-note"]'));
    assert.strictEqual(await dateOf('fading-note').count(), 0, 'A starred note shows no fade date');
    assert.strictEqual(await hub.locator('.tab-card[data-id="fading-note"] .fade-chip').count(), 0, 'A starred note shows no chip either');
    assert.match(await hub.getAttribute('.tab-card[data-id="inbox-note"] .star-btn', 'aria-label'), /^Star: keep this note; it won't fade$/, 'Star says what it does');
    // Unstarring brings the fade back inside the 3-day window as the chip, never both
    await hub.click('.tab-card[data-id="fading-note"] .star-btn');
    await hub.waitForSelector('.tab-card[data-id="fading-note"] .fade-chip');
    assert.strictEqual(await dateOf('fading-note').count(), 0, 'Inside the warning window the chip replaces the date');
    await hub.click('.tab-card[data-id="fading-note"] .star-btn'); // re-star
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="fading-note"] .fade-chip'));
    console.log('✓ Per-card fade date (only within 7 days; none when starred, chip takes over in the last 3), star label');

    // Reader: fade line plus Reopen / Star / Delete
    await hub.click('.tab-card[data-id="inbox-note"] .reader-btn');
    await hub.waitForSelector('#reader-dialog[open]');
    assert.match(await hub.textContent('#modal-fade'), /fades [A-Z][a-z]{2} \d{1,2}/, 'Reader shows the fade date');
    await hub.click('#modal-star-btn');
    await hub.waitForSelector('.tab-card[data-id="inbox-note"] .star-btn.active');
    assert.strictEqual(await hub.evaluate(() => document.getElementById('reader-dialog').open && document.getElementById('toast').matches(':popover-open')), true, 'Toast is in the top layer, visible above the open reader dialog');
    assert.strictEqual(await hub.locator('#toast').isVisible(), true, 'Toast is visible while the reader is open');
    assert.strictEqual((await hub.textContent('#modal-star-btn')).trim(), 'Unstar', 'Reader Star button follows the star');
    assert.strictEqual(await hub.textContent('#modal-fade'), '', 'A starred note has no fade line in the reader');
    await hub.click('#modal-star-btn');
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="inbox-note"] .star-btn.active'));
    assert.strictEqual((await hub.textContent('#modal-star-btn')).trim(), 'Star');
    await hub.evaluate(() => {
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => { window.__sent = msg; return { success: true }; };
    });
    await hub.click('#modal-reopen-btn');
    await hub.waitForFunction(() => window.__sent);
    const readerSent = await hub.evaluate(() => { chrome.runtime.sendMessage = window.__realSend; return window.__sent; });
    assert.strictEqual(readerSent.type, 'RESTORE_TAB');
    assert.strictEqual(readerSent.recordId, 'inbox-note', 'Reader Reopen reopens this note');
    assert.strictEqual(await hub.evaluate(() => document.getElementById('reader-dialog').open), false, 'Reopen closes the reader');
    await hub.click('.tab-card[data-id="inbox-note"] .reader-btn');
    await hub.waitForSelector('#reader-dialog[open]');
    await hub.click('#modal-delete-btn');
    assert.strictEqual(await hub.evaluate(() => document.getElementById('reader-dialog').open), false, 'Delete closes the reader');
    await hub.locator('#toast-undo-btn').waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await hub.textContent('#toast-message'), /Note deleted/, 'Reader Delete offers the same Undo toast');
    await hub.click('#toast-undo-btn');
    await hub.waitForSelector('.tab-card[data-id="inbox-note"]:not(.removing)');
    console.log('✓ Reader Reopen, Star and Delete (with Undo) verified');

    // Reader actions keep working after the card leaves the feed (Unstar in Starred drops it)
    await hub.click('.nav-item[data-time="favorites"]');
    await hub.waitForSelector('.tab-card[data-id="fading-note"]');
    await hub.click('.tab-card[data-id="fading-note"] .reader-btn');
    await hub.waitForSelector('#reader-dialog[open]');
    await hub.click('#modal-star-btn'); // Unstar
    await hub.waitForFunction(() => !document.querySelector('.tab-card[data-id="fading-note"]'));
    assert.strictEqual((await hub.textContent('#modal-star-btn')).trim(), 'Star', 'Reader offers Star once unstarred');
    await hub.click('#modal-star-btn'); // Star again, with no card in the feed
    await hub.waitForFunction(() => document.getElementById('modal-star-btn').textContent.trim() === 'Unstar');
    assert.match(await hub.textContent('#toast-message'), /^Starred/, 'Starring from the reader still toasts');
    const restarred = await hub.evaluate(async () => (await (await import('/src/storage/db.js')).getTabById('fading-note')).isFavorite);
    assert.strictEqual(restarred, true, 'The note ends up starred');
    await hub.waitForSelector('.tab-card[data-id="fading-note"]');
    await hub.keyboard.press('Escape');
    await hub.click('.nav-item[data-view=""]');
    await hub.waitForSelector('.tab-card[data-id="inbox-note"]');
    console.log('✓ Reader Star works after the card left the feed');

    // A background refresh must not pull focus out of the search box
    await hub.focus('.tab-card[data-id="inbox-note"]');
    await hub.keyboard.press('j');
    await hub.focus('#search-input');
    await hub.evaluate(() => { document.querySelector('#tabs-feed .tab-card').dataset.stale = '1'; });
    await background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    await hub.waitForFunction(() => !document.querySelector('#tabs-feed .tab-card[data-stale]'));
    assert.strictEqual(await hub.evaluate(() => document.activeElement.id), 'search-input', 'Refresh leaves focus in the search box');
    assert.strictEqual(await hub.locator('#tabs-feed .keyboard-selected').count(), 1, 'Refresh keeps the selection highlight');
    console.log('✓ Background refresh keeps focus in search');

    // Shortcuts legend: ? opens, Escape closes, focus returns
    await hub.focus('.tab-card[data-id="inbox-note"]');
    await hub.keyboard.press('?');
    await hub.waitForSelector('#shortcuts-dialog[open]');
    assert.match(await hub.textContent('#shortcuts-dialog'), /Keyboard shortcuts[\s\S]*Reopen[\s\S]*Search/, 'Legend lists the shortcuts');
    assert.match(await hub.textContent('#shortcuts-fade-note'), /^Notes fade after \d+ days.*unless you star them\.$/, 'The legend carries the one-line fade explanation');
    for (const key of ['o', 's', 'Del']) {
      assert.ok((await hub.locator('#shortcuts-dialog kbd').allTextContents()).includes(key), `The legend lists ${key}`);
    }
    await hub.keyboard.press('Escape');
    assert.strictEqual(await hub.evaluate(() => document.getElementById('shortcuts-dialog').open), false, 'Escape closes the legend');
    assert.strictEqual(await hub.evaluate(() => document.activeElement.matches('.tab-card[data-id="inbox-note"]')), true, 'Focus returns to where it was');
    console.log('✓ ? opens the legend; Escape closes it and focus returns');

    // Enter in search focuses the first result without reopening it
    await hub.evaluate(() => {
      window.__sent = null;
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => { window.__sent = msg; return { success: true }; };
    });
    await hub.keyboard.press('/');
    await hub.fill('#search-input', 'summary');
    await hub.keyboard.press('Enter');
    await hub.waitForFunction(() => document.activeElement?.matches('.tab-card'));
    const firstId = await hub.evaluate(() => document.querySelector('#tabs-feed .tab-card').dataset.id);
    assert.strictEqual(await hub.evaluate(() => document.activeElement.closest('.tab-card').dataset.id), firstId, 'Enter focuses the first result');
    assert.strictEqual(await hub.evaluate(() => window.__sent), null, 'Enter in search does not reopen anything');
    // Escape: first leaves the search and keeps the query, second clears it
    await hub.keyboard.press('/');
    await hub.keyboard.press('Escape');
    assert.strictEqual(await hub.inputValue('#search-input'), 'summary', 'First Escape keeps the query');
    assert.strictEqual(await hub.evaluate(() => document.activeElement.id !== 'search-input'), true, 'First Escape blurs the search');
    await hub.keyboard.press('Escape');
    await hub.waitForFunction(() => document.getElementById('search-input').value === '');
    await hub.evaluate(() => { chrome.runtime.sendMessage = window.__realSend; });
    console.log('✓ Enter in search focuses the first result; Escape keeps the query, a second one clears it\n');

    // --- TEST 14: title button, Go to tab, card keys, scoped search, permission note ---
    console.log('--- Test 14: Title Button, Go to Tab, Card Keys, Scoped Search, Permission Note ---');
    const refreshHub = async () => background.evaluate(() => chrome.runtime.sendMessage({ type: 'TABS_CLOSED' }).catch(() => {}));
    await hub.evaluate(async () => {
      const { saveArchivedTab } = await import('/src/storage/db.js');
      const note = (id, status) => saveArchivedTab({
        id, url: `https://live.example/${id}`, title: id, capturedAt: Date.now(), status,
        summary: { tldr: `${id} gist`, bullets: [], tags: [] }
      });
      await note('saved-note', 'captured');
      await note('sleeping-note', 'discarded');
    });
    await refreshHub();
    await hub.waitForSelector('.tab-card[data-id="sleeping-note"]');
    const primary = (id) => hub.locator(`.tab-card[data-id="${id}"] .restore-btn`).textContent().then(t => t.trim());
    assert.strictEqual(await primary('saved-note'), 'Go to tab', 'A Saved note (tab still open) says Go to tab');
    assert.strictEqual(await primary('sleeping-note'), 'Go to tab', 'A Sleeping note says Go to tab');
    assert.strictEqual(await primary('inbox-note'), 'Reopen tab', 'A closed note says Reopen tab');
    await hub.click('.tab-card[data-id="saved-note"] .reader-btn');
    assert.strictEqual((await hub.textContent('#modal-reopen-btn')).trim(), 'Go to tab', 'The reader says the same');
    await hub.keyboard.press('Escape');
    console.log('✓ Saved and Sleeping notes say Go to tab; closed notes say Reopen tab');

    // The title is a real button that opens the reader; it does not reopen anything
    await hub.evaluate(() => {
      window.__sent = null;
      window.__realSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (msg) => { window.__sent = msg; return { success: true }; };
    });
    const titleBtn = hub.locator('.tab-card[data-id="inbox-note"] h3.card-title > button.card-title-btn');
    assert.strictEqual(await titleBtn.getAttribute('aria-label'), 'Read note: inbox-note', 'The title button is named "Read note: {title}"');
    await titleBtn.click();
    await hub.waitForSelector('#reader-dialog[open]');
    assert.strictEqual(await hub.textContent('#modal-title'), 'inbox-note', 'Clicking the title opens that note in the reader');
    assert.strictEqual(await hub.evaluate(() => window.__sent), null, 'Clicking the title does not reopen the tab');
    await hub.keyboard.press('Escape');
    await titleBtn.focus();
    await hub.keyboard.press('Enter');
    await hub.waitForSelector('#reader-dialog[open]');
    await hub.keyboard.press('Escape');
    await titleBtn.focus();
    await hub.keyboard.press('Space');
    await hub.waitForSelector('#reader-dialog[open]');
    await hub.keyboard.press('Escape');
    assert.strictEqual(await hub.evaluate(() => window.__sent), null, 'Enter and Space on the title open the reader, not the tab');
    assert.strictEqual(await hub.evaluate(() => document.activeElement.matches('.tab-card[data-id="inbox-note"] .card-title-btn')), true, 'Closing the reader returns focus to the title button');
    await hub.evaluate(() => { chrome.runtime.sendMessage = window.__realSend; });
    console.log('✓ The title is a button that opens the reader (click, Enter, Space)');

    // s / o / Delete act on the j/k-selected card, and are ignored while typing or in a dialog
    await hub.evaluate(() => document.activeElement?.blur());
    await hub.keyboard.press('j');
    const selectedId = await hub.evaluate(() => document.activeElement.dataset.id);
    const starred = () => hub.locator(`.tab-card[data-id="${selectedId}"] .star-btn`).evaluate(el => el.classList.contains('active'));
    const wasStarred = await starred();
    await hub.keyboard.press('s');
    await hub.waitForFunction(([id, was]) => document.querySelector(`.tab-card[data-id="${id}"] .star-btn`).classList.contains('active') !== was, [selectedId, wasStarred]);
    await hub.keyboard.press('s');
    await hub.waitForFunction(([id, was]) => document.querySelector(`.tab-card[data-id="${id}"] .star-btn`).classList.contains('active') === was, [selectedId, wasStarred]);
    await hub.keyboard.press('o');
    await hub.waitForSelector('#reader-dialog[open]');
    assert.strictEqual(await hub.textContent('#modal-title'), selectedId, 'o opens the selected note in the reader');
    await hub.keyboard.press('s'); // the reader is a dialog: keys do not reach the feed
    assert.strictEqual(await starred(), wasStarred, 's is ignored while the reader is open');
    await hub.keyboard.press('Escape');
    await hub.focus('#search-input');
    await hub.keyboard.press('o');
    await hub.keyboard.press('s');
    assert.strictEqual(await hub.evaluate(() => document.getElementById('reader-dialog').open), false, 'o is typed, not run, while searching');
    assert.strictEqual(await starred(), wasStarred, 's is typed, not run, while searching');
    await hub.fill('#search-input', '');
    await hub.waitForFunction(() => document.getElementById('search-input').value === '' && document.querySelectorAll('#tabs-feed .tab-card').length > 3);
    await hub.keyboard.press('Escape');
    for (const key of ['Delete', 'Backspace']) {
      await hub.evaluate(() => document.activeElement?.blur());
      await hub.keyboard.press('j');
      const doomed = await hub.evaluate(() => document.activeElement.dataset.id);
      await hub.keyboard.press(key);
      await hub.locator('#toast-undo-btn').waitFor({ state: 'visible', timeout: 2000 });
      assert.match(await hub.textContent('#toast-message'), /Note deleted/, `${key} deletes the selected note with an Undo toast`);
      assert.strictEqual(await hub.evaluate(async (id) => !(await (await import('/src/storage/db.js')).getArchivedTabs({ limit: Infinity })).some(t => t.id === id), doomed), true, `${key} deleted ${doomed}`);
      await hub.click('#toast-undo-btn');
      await hub.waitForSelector(`.tab-card[data-id="${doomed}"]:not(.removing)`);
      await hub.keyboard.press('Escape');
    }
    console.log('✓ s, o, Delete and Backspace act on the selected card; typing and dialogs are left alone');

    // A scoped search that finds nothing names the view and offers All notes, keeping the query
    await hub.click('.nav-item[data-view="inbox"]');
    await hub.fill('#search-input', 'reopened-note');
    await hub.waitForSelector('#tabs-feed .empty-state');
    const scopedText = await hub.textContent('#tabs-feed .empty-state');
    assert.match(scopedText, /Inbox/, 'The empty search says it searched the Inbox');
    assert.match(scopedText, /reopened-note/, 'It repeats the query');
    await hub.click('#tabs-feed .empty-action-btn');
    await hub.waitForSelector('.tab-card[data-id="reopened-note"]');
    assert.strictEqual(await hub.locator('.nav-item[data-view=""]').getAttribute('aria-current'), 'page', 'Search all notes switches to All notes');
    assert.strictEqual(await hub.inputValue('#search-input'), 'reopened-note', 'It keeps the query');
    await hub.click('.nav-item[data-time="favorites"]');
    await hub.fill('#search-input', 'no-such-note');
    await hub.waitForSelector('#tabs-feed .empty-state');
    assert.match(await hub.textContent('#tabs-feed .empty-state'), /Starred/, 'A Starred search names Starred');
    await hub.click('.nav-item[data-view=""]');
    await hub.waitForFunction(() => /No matching notes/.test(document.querySelector('#tabs-feed .empty-state')?.textContent || ''));
    assert.strictEqual(await hub.locator('#tabs-feed .empty-action-btn').count(), 0, 'A search that already covers every note offers no wider search');
    await hub.fill('#search-input', '');
    await hub.waitForSelector('.tab-card[data-id="inbox-note"]');
    console.log('✓ Scoped no-results names the view and Search all notes keeps the query');

    // Once notes exist the permission note is a quiet, dismissible hairline; dismissing sticks
    const permBanner = hub.locator('#perm-banner');
    assert.strictEqual(await permBanner.isVisible(), true, 'The permission note shows while permission is missing');
    assert.strictEqual(await permBanner.evaluate(el => el.classList.contains('quiet')), true, 'With notes it is quiet');
    assert.strictEqual(await permBanner.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'Quiet means no ink-wash fill');
    assert.match(await permBanner.textContent(), /stay open and get no note/, 'It says what happens without the permission');
    await hub.click('#perm-dismiss-btn');
    assert.strictEqual(await permBanner.isHidden(), true, 'Dismiss hides the note');
    assert.strictEqual(await hub.evaluate(async () => (await chrome.storage.local.get('perm_banner_dismissed')).perm_banner_dismissed), true, 'The dismissal is stored');
    await hub.reload();
    await hub.waitForSelector('.tab-card');
    assert.strictEqual(await hub.locator('#perm-banner').isHidden(), true, 'The dismissal survives a reload');
    await hub.evaluate(() => chrome.storage.local.remove('perm_banner_dismissed'));
    console.log('✓ Permission note is quiet with notes, dismissible, and the dismissal persists\n');
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
