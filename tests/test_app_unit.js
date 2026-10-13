/**
 * Unit & static checks for the Knowledge Hub page (src/app/): shared HTML helpers, reader-view
 * article formatting, status badges, and markup/CSS regression guards. Runs in Node, so
 * src/app/app.js must stay importable without a DOM or chrome.* APIs.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { highlightSearch, escapeHtml } from '../src/shared/html.js';
import { formatExtractedArticle, getStatusBadge, closedReason, closedWhen, firstRunCopy } from '../src/app/app.js';

console.log('--- Running Knowledge Hub Unit & Markup Verification Tests ---');

// Test 1: highlightSearch with standard queries
console.log('Testing highlightSearch basic and case-insensitive matching...');
const text1 = 'Vector databases power high-dimensional semantic search in modern RAG systems.';
const highlighted1 = highlightSearch(text1, 'vector');
assert.ok(highlighted1.includes('<mark class="search-highlight">Vector</mark>'), 'Should highlight "Vector" preserving original case');
assert.ok(!highlighted1.includes('<mark class="search-highlight">vector</mark>'), 'Should preserve title case "Vector"');

// Test 2: highlightSearch with special regex characters
console.log('Testing highlightSearch with special regex characters...');
const text2 = 'C++ and Rust (v1.80) are fast.';
assert.ok(highlightSearch(text2, 'C++').includes('<mark class="search-highlight">C++</mark>'), 'Should safely handle ++ in regex query');
assert.ok(highlightSearch(text2, '(v1.80)').includes('<mark class="search-highlight">(v1.80)</mark>'), 'Should safely handle parentheses and dots in regex query');

// Test 3: highlightSearch XSS safety
console.log('Testing highlightSearch XSS escaping...');
const safeHighlighted = highlightSearch('<img src=x onerror=alert(1)> and &special "chars"', 'special');
assert.ok(!safeHighlighted.includes('<img'), 'Should escape HTML tags');
assert.ok(safeHighlighted.includes('&lt;img'), 'Should have &lt;img');
assert.ok(safeHighlighted.includes('<mark class="search-highlight">special</mark>'), 'Should highlight matching term');

// Test 4: highlightSearch with empty query
console.log('Testing highlightSearch empty query fallback...');
assert.strictEqual(highlightSearch('Simple text', ''), 'Simple text', 'Empty query should return plain escaped string');

// Test 5: escapeHtml escapes quotes (regression guard for attribute injection via data-tag="...")
console.log('Testing escapeHtml escapes quotes for safe attribute interpolation...');
assert.strictEqual(escapeHtml(`"><script>x</script>`), '&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
assert.strictEqual(escapeHtml(`it's a "test"`), 'it&#39;s a &quot;test&quot;');
assert.ok(!escapeHtml(`evil" onmouseover="alert(1)`).includes('"'), 'Escaped attribute value must not contain a raw double quote');
console.log('✓ escapeHtml quote-escaping verified (prevents data-tag="..." attribute injection)');

// Test 6: formatExtractedArticle paragraphs and headings
console.log('Testing formatExtractedArticle typography formatting...');
const articleRaw = `# Introduction to Antigravity

Antigravity is an advanced agentic framework.
It enables scalable autonomous workflows.

## Architecture & Design

> Autonomous agents operate with tool use and persistence.

### Key Capabilities

#### Details

Here is another paragraph describing the system in detail.`;

const formattedArticle = formatExtractedArticle(articleRaw);
assert.ok(formattedArticle.includes('<h2>Introduction to Antigravity</h2>'), 'Heading 1 should map to <h2>');
assert.ok(formattedArticle.includes('<h3>Architecture &amp; Design</h3>'), 'Heading 2 should map to <h3>');
assert.ok(formattedArticle.includes('<h4>Key Capabilities</h4>'), 'Heading 3 should map to <h4>');
assert.ok(formattedArticle.includes('<h5>Details</h5>'), 'Heading 4 should map to <h5>');
assert.ok(formattedArticle.includes('<blockquote>Autonomous agents operate with tool use and persistence.</blockquote>'), 'Blockquote should be formatted');
assert.ok(formattedArticle.includes('<p>Antigravity is an advanced agentic framework.<br>It enables scalable autonomous workflows.</p>'), 'Paragraphs should preserve line breaks');
assert.ok(formatExtractedArticle('<script>alert(1)</script>').includes('&lt;script&gt;'), 'Article text must be escaped');

// Test 7: formatExtractedArticle empty text fallback
console.log('Testing formatExtractedArticle empty fallback...');
assert.ok(formatExtractedArticle('').includes('empty-article-text'), 'Empty article should render empty-article-text paragraph');

// Test 8: Status badges, including the "captured" (saved, tab still open) status
console.log('Testing status badges for every record status...');
const badge = (status, closureReason) => getStatusBadge({ status, closureReason });
assert.ok(badge('discarded').includes('class="badge-status sleeping"') && badge('discarded').includes('>Sleeping</span>'), 'discarded -> Sleeping');
assert.ok(badge('restored').includes('class="badge-status restored"') && badge('restored').includes('>Reopened</span>'), 'restored -> Reopened');
assert.ok(badge('captured').includes('class="badge-status captured"') && badge('captured').includes('>Saved</span>'), 'captured -> Saved');
assert.strictEqual(badge('archived'), '', 'archived (the default state) renders no badge');
assert.strictEqual(badge(undefined), '', 'Unknown status renders no badge');
assert.ok(badge('captured', 'Chrome refused to close this tab; summary saved, tab left open').includes('title="Chrome refused to close this tab; summary saved, tab left open"'), 'Badge tooltip is the closureReason');
assert.ok(!badge('captured', '"><img src=x>').includes('<img'), 'closureReason tooltip must be escaped');
console.log('✓ Status badges verified (Sleeping, Reopened, Saved, Closed)');

// Receipt reasons are derived from the record, never invented
assert.match(closedReason({ closureTier: 'safe_to_close', closureReason: 'Pure stateless reading article' }), /idle/, 'a plain reading page closed after sitting idle');
assert.match(closedReason({ closureTier: 'suspend_only', closureReason: 'Contains form or interactive input controls', closedFrom: 'suspended' }), /Slept first/, 'a tab that slept before closing says so');
assert.match(closedReason({ closureTier: 'suspend_only', closureReason: 'Contains form or interactive input controls' }), /Sat idle/, 'a suspend_only page closed directly (close mode) never slept');
assert.match(closedReason({ closureTier: 'suspend_only', closureReason: 'Closed: trusted domain' }), /always-close list/, 'a trusted-domain close names the list');
assert.match(closedReason({}), /idle/, 'a record with no closure data still gets an honest idle reason');
console.log('✓ Closed-today reasons derived from closureTier / closureReason');

// Receipt row timing: idle time only when both stamps are real
const closedAtMs = new Date(2026, 9, 13, 10, 42).getTime();
assert.match(closedWhen({ lastClosedAt: closedAtMs, lastActiveAt: closedAtMs - 64 * 60000 }), /^closed .*42.* · idle 64 min$/, 'closed time plus idle minutes');
assert.match(closedWhen({ lastClosedAt: closedAtMs, lastActiveAt: closedAtMs - 125 * 60000 }), / · idle 2 h 5 min$/, 'idle from two hours up reads in hours');
assert.match(closedWhen({ lastClosedAt: closedAtMs, lastActiveAt: closedAtMs - 120 * 60000 }), / · idle 2 h$/, 'whole hours drop the minutes');
assert.ok(!closedWhen({ lastClosedAt: closedAtMs }).includes('idle'), 'no lastActiveAt, no idle claim');
assert.ok(!closedWhen({ lastClosedAt: closedAtMs, lastActiveAt: closedAtMs + 60000 }).includes('idle'), 'a stamp from after the close is not idle time');
assert.ok(!closedWhen({ lastClosedAt: closedAtMs, lastActiveAt: closedAtMs - 20000 }).includes('idle'), 'under a minute is not worth stating');
assert.strictEqual(closedWhen({}), '', 'a record with no closure says nothing');
console.log('✓ Receipt closed time and idle time derived from the record');

// First-run copy uses the real threshold and names Save current tab only in the panel
const firstRunPanel = firstRunCopy({ timeoutMinutes: 45, archiveMode: 'hybrid' }, 'panel');
assert.ok(firstRunPanel.lines.join(' ').includes('45 minutes'), 'first run states the user\'s idle threshold');
assert.ok(firstRunPanel.lines.some(l => /Save current tab/.test(l)), 'the panel names Save current tab');
assert.ok(!firstRunCopy({ timeoutMinutes: 45 }, 'tab').lines.some(l => /Save current tab/.test(l)), 'the full tab does not');
assert.match(firstRunCopy({ timeoutMinutes: 1, archiveMode: 'close' }, 'tab').lines[0], /^Tabs left idle for 1 minute are closed\.$/, 'singular minute, close mode');
assert.match(firstRunCopy({ timeoutMinutes: 30, archiveMode: 'discard' }, 'tab').lines[0], /put to sleep/, 'suspend-only mode does not promise closing');
console.log('✓ First-run copy verified');

// Test 9: Verify src/app/index.html markup (element ids the Playwright tests rely on)
console.log('Verifying src/app/index.html markup...');
const htmlContent = fs.readFileSync(path.resolve('src/app/index.html'), 'utf-8');
assert.ok(htmlContent.includes('<dialog id="reader-dialog" class="reader-dialog" aria-labelledby="modal-title">'), 'index.html must include semantic HTML5 <dialog id="reader-dialog">');
for (const id of [
  'search-input', 'search-clear-btn', 'search-kbd-hint', 'modal-copy-btn', 'modal-close-btn', 'perm-banner',
  'enable-perm-btn', 'view-inbox', 'view-reopened', 'view-all', 'sort-select', 'density-toggle-btn',
  'closed-today', 'closed-today-reopen-all', 'closed-today-list', 'tabs-feed', 'toast-undo-btn', 'toast-progress', 'filters-btn', 'sidebar', 'sidebar-tags',
  'sidebar-domains', 'filter-banner', 'clear-filter-btn', 'results-count', 'export-dropdown-btn', 'settings-btn',
  'view-options', 'archive-current-btn', 'open-full-btn'
]) {
  assert.ok(htmlContent.includes(`id="${id}"`), `index.html must include #${id}`);
}
for (const time of ['favorites', 'today', 'yesterday', 'week']) {
  assert.ok(htmlContent.includes(`data-time="${time}"`), `index.html should include the ${time} time filter`);
}
for (const sort of ['newest', 'oldest', 'reading-time-asc', 'reading-time-desc', 'title-asc', 'domain', 'expiring-soon']) {
  assert.ok(htmlContent.includes(`<option value="${sort}">`), `Sort select must offer "${sort}"`);
}
assert.ok(!htmlContent.includes('stats-banner') && !htmlContent.includes('id="stat-'), 'The stats strip is gone');
assert.ok(/id="archive-current-btn" class="[^"]*panel-only[^"]*" hidden/.test(htmlContent), 'Archive Current Tab must be panel-only and hidden until the surface is known');
assert.ok(/id="open-full-btn" class="[^"]*panel-only[^"]*"/.test(htmlContent), 'Open full view must be panel-only');
assert.ok(!/\son[a-z]+\s*=/.test(htmlContent), 'index.html must not use inline event handlers (blocked by MV3 CSP)');

// Test 10: Verify src/app/app.css rules
console.log('Verifying src/app/app.css styling rules...');
const cssContent = fs.readFileSync(path.resolve('src/app/app.css'), 'utf-8');
for (const rule of [
  'dialog.reader-dialog', 'dialog.reader-dialog::backdrop', '@starting-style', '.modal-text-content', 'max-width: 68ch;',
  '.search-highlight', '.tab-card.removing', '.star-btn', '.toast-undo-btn', '.toast-progress', '@keyframes toastCountdown',
  '.badge-status.restored', '.badge-status.captured', '.badge-status.sleeping', '.fade-chip', '.compact .tab-card',
  '@media (max-width: 719.98px)', '@media (min-width: 720px)', 'prefers-color-scheme: dark'
]) {
  assert.ok(cssContent.includes(rule), `app.css must include ${rule}`);
}

// Test 11: Verify src/options/index.html toggles and JSON import control
console.log('Verifying src/options/index.html markup for new settings...');
const optionsHtml = fs.readFileSync(path.resolve('src/options/index.html'), 'utf-8');
assert.ok(optionsHtml.includes('id="import-json-btn"'), 'options/index.html must include an import-json-btn control');
assert.ok(optionsHtml.includes('id="import-json-input"'), 'options/index.html must include a hidden JSON file input for import');

// Test 12: Verify src/options/options.js handlers
console.log('Verifying src/options/options.js logic for new settings...');
const optionsJs = fs.readFileSync(path.resolve('src/options/options.js'), 'utf-8');
assert.ok(!optionsJs.includes("from '../storage/db.js'") || !optionsJs.includes('exportTabs'), 'options.js must not import the removed db.exportTabs');
assert.ok(optionsJs.includes('saveArchivedTab'), 'options.js must call saveArchivedTab to restore an imported backup');
assert.ok(optionsJs.includes("getURL('src/app/index.html')"), 'options.js "Open Wiki" must open the merged src/app/index.html page');

// Test 13: Regression guards for fixed bugs (CSP inline handler, third-party favicon leak)
// and for the one-page merge (surface detection, no references to the removed pages)
console.log('Verifying app.js regression guards...');
const appJs = fs.readFileSync(path.resolve('src/app/app.js'), 'utf-8');
assert.ok(!/onerror\s*=\s*"/.test(appJs), 'app.js must not use inline onerror= attributes (blocked by MV3 CSP)');
assert.ok(!appJs.includes('s2/favicons'), 'app.js must not fall back to a third-party favicon service');
assert.ok(!appJs.includes('exportTabs'), 'app.js must not import the removed db.exportTabs');
assert.ok(appJs.includes('faviconUrl'), 'app.js must use the shared faviconUrl() helper');
assert.ok(appJs.includes('softDeleteTab') && appJs.includes('restoreDeletedTab'), 'app.js must use tombstone-based deletion (softDeleteTab/restoreDeletedTab)');
assert.ok(appJs.includes('chrome.tabs.getCurrent()'), 'app.js must detect the surface via chrome.tabs.getCurrent()');
const manifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf-8'));
assert.strictEqual(manifest.side_panel.default_path, 'src/app/index.html', 'Side panel must load the merged page');
assert.ok(!fs.existsSync(path.resolve('src/sidepanel')) && !fs.existsSync(path.resolve('src/wiki')), 'The pre-merge src/sidepanel/ and src/wiki/ pages must be gone');

console.log('--- All Knowledge Hub Unit & Markup Verification Tests Passed Successfully! ---');
