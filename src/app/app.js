/**
 * Tab Squirrel - notebook controller.
 *
 * One page serves both Chrome's side panel and the full view in a tab. Layout adapts to
 * width in app.css (narrow: single column + Filters drawer; wide: sidebar + card grid).
 * Only a few controls depend on the surface: "Save current tab" and "Open full view"
 * exist in the side panel only (in a tab, the current tab is Tab Squirrel itself).
 *
 * Importable in Node for unit tests: all DOM/chrome access is behind the document guard.
 */

import {
  getArchivedTabs,
  getAllTags,
  getAllDomains,
  getStats,
  softDeleteTab,
  restoreDeletedTab,
  markReopened,
  getTabById,
  toggleFavoriteTab,
  getSettings
} from '../storage/db.js';
import { escapeHtml, highlightSearch, faviconUrl, fadeChipHtml, fadeDateHtml } from '../shared/html.js';
import { fadeChipLabel, fadeDateLabel, fadeExplanation } from '../shared/fade.js';
import {
  exportToMarkdown,
  exportToObsidianZip,
  exportToJSON,
  formatNoteSection,
  formatStandaloneNote,
  triggerDownload
} from '../shared/export.js';

const state = {
  surface: 'tab', // 'panel' | 'tab'
  view: '', // '' (all) | 'inbox' | 'reopened'
  time: '', // '' | 'today' | 'yesterday' | 'week' | 'favorites'
  tag: '',
  domain: '',
  query: '',
  sortBy: 'newest',
  density: 'comfortable' // 'comfortable' | 'compact'
};

const TIME_LABELS = { favorites: 'Starred', today: 'Captured today', yesterday: 'Yesterday', week: 'Past 7 days' };
const SIDEBAR_TAGS_VISIBLE = 8;
const SIDEBAR_DOMAINS_VISIBLE = 5;
const SIDEBAR_LIST_MAX = 50; // visible plus the "More" disclosure
const SORT_KEY = 'notebook_sort';
const DENSITY_KEY = 'sidepanel_density'; // pre-merge storage key, kept so saved preferences survive
const RECEIPT_SEEN_KEY = 'closed_today_seen'; // { day, upTo }: today's receipt was shown up to this closedAt

let fadeSettings = null;
let tabsById = new Map();
let renderSeq = 0;
let selectedIndex = -1;
let searchTimer = null;
let toastTimer = null;
let toastDuration = 2600;
let readerTab = null;
let receiptSeenUpTo = null; // newest closedAt already shown today; null until read from storage

const ICONS = {
  reopen: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
  reader: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  empty: '<svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
};

const SKELETONS = '<div class="skeleton-card"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:75%;height:16px"></div><div class="skeleton-line" style="height:32px"></div></div>'.repeat(3);

const $ = (id) => document.getElementById(id);

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Tab Squirrel closes idle tabs in the background; refresh stats/feed/"Closed today" when that
  // happens. Must not call sendResponse or return true (no response expected here).
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'TABS_CLOSED') refresh();
  });
}

async function init() {
  // tabs.getCurrent() resolves undefined in the side panel and a Tab in a normal tab.
  let currentTab;
  try {
    currentTab = await chrome.tabs.getCurrent();
  } catch {}
  state.surface = currentTab ? 'tab' : 'panel';
  state.view = state.surface === 'panel' ? 'inbox' : '';
  document.body.dataset.surface = state.surface;
  document.querySelectorAll('.panel-only').forEach(el => { el.hidden = state.surface !== 'panel'; });

  setupEventListeners();
  syncControls();
  await loadDensity();
  await loadSort();
  checkPermissions();
  await refresh(true);
}

// ---------------------------------------------------------------------------
// Data refresh
// ---------------------------------------------------------------------------

async function refresh(showSkeletons = false) {
  await Promise.all([updateStats(), renderSidebarFilters(), renderClosedToday(), renderFeed(showSkeletons)]);
}

function currentFilters() {
  const favorites = state.time === 'favorites';
  return {
    query: state.query,
    tag: state.tag,
    domain: state.domain,
    timeRange: favorites ? '' : state.time,
    favoriteOnly: favorites,
    view: state.view
  };
}

async function updateStats() {
  const stats = await getStats();
  const set = (id, value) => { $(id).textContent = value; };
  set('count-all', stats.total);
  set('count-today', stats.today);
  set('count-favorites', stats.favorites || 0);
}

async function renderSidebarFilters() {
  const [tags, domains] = await Promise.all([getAllTags(), getAllDomains()]);
  // The first few show; the rest sit behind a native "More" disclosure (kept open across re-renders,
  // and forced open when the applied filter is hidden inside it).
  const list = (container, items, key, visible) => {
    const wasOpen = container.querySelector('details')?.open;
    const button = ({ value, label, count }) =>
      `<button class="filter-item-btn${state[key] === value ? ' applied' : ''}" aria-pressed="${state[key] === value}" data-${key}="${escapeHtml(value)}"><span>${escapeHtml(label)}</span><span class="badge">${count}</span></button>`;
    const rest = items.slice(visible, SIDEBAR_LIST_MAX);
    const open = wasOpen || rest.some(item => item.value === state[key]);
    container.innerHTML = items.slice(0, visible).map(button).join('') || '<p class="filter-empty">None yet</p>';
    if (rest.length) {
      container.insertAdjacentHTML('beforeend',
        `<details class="filter-more"${open ? ' open' : ''}><summary>More</summary>${rest.map(button).join('')}</details>`);
    }
  };
  list($('sidebar-tags'), tags.map(({ tag, count }) => ({ value: tag, label: `#${tag}`, count })), 'tag', SIDEBAR_TAGS_VISIBLE);
  list($('sidebar-domains'), domains.map(({ domain, count }) => ({ value: domain, label: domain, count })), 'domain', SIDEBAR_DOMAINS_VISIBLE);
}

function startOfLocalDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function loadReceiptSeen() {
  try {
    const seen = (await chrome.storage.local.get(RECEIPT_SEEN_KEY))[RECEIPT_SEEN_KEY];
    return seen?.day === localDayKey() && Number.isFinite(seen.upTo) ? seen.upTo : 0;
  } catch (err) {
    console.debug('Failed to load receipt state:', err);
    return 0;
  }
}

/**
 * Plain reason a tab was closed, from what the record holds. Records in "Closed today" were all
 * closed by Tab Squirrel's idle sweep (a manual save leaves the tab open), so the reason is
 * which path closed it: a trusted domain, a tab that slept first and then sat idle twice as
 * long (hybrid mode: its suspend-time closureReason is still set), or plain idleness.
 */
export function closedReason(tab) {
  if (tab.closureReason === 'Closed: trusted domain') return 'On your always-close list';
  if (tab.closureTier === 'suspend_only' && tab.closureReason) return 'Slept first, then closed after sitting idle longer';
  return 'Sat idle, so it was closed';
}

/**
 * The receipt: what Tab Squirrel closed today. Open when it holds closures not yet shown today
 * (so first open of the day, or new closures since), collapsed on later opens, hidden when empty.
 */
async function renderClosedToday() {
  let tabs = [];
  try {
    tabs = await getArchivedTabs({ closedSince: startOfLocalDay(), limit: 50 });
  } catch (err) {
    console.debug('Failed to load closed-today tabs:', err);
  }
  if (receiptSeenUpTo === null) receiptSeenUpTo = await loadReceiptSeen();
  $('closed-today-count').textContent = tabs.length;
  $('closed-today-noun').textContent = tabs.length === 1 ? 'tab' : 'tabs';
  $('closed-today').hidden = tabs.length === 0;
  const newest = Math.max(0, ...tabs.map(tab => tab.closedAt || 0));
  if (tabs.length && newest > receiptSeenUpTo) {
    $('closed-today').open = true;
    receiptSeenUpTo = newest;
    chrome.storage.local.set({ [RECEIPT_SEEN_KEY]: { day: localDayKey(), upTo: newest } })
      .catch(err => console.debug('Failed to save receipt state:', err));
  }
  $('closed-today-list').innerHTML = tabs.map(tab => `
    <div class="closed-today-row">
      <img class="favicon" src="${escapeHtml(faviconUrl(tab.url))}" alt="">
      <div class="closed-today-info">
        <div class="closed-today-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</div>
        <div class="closed-today-meta">
          <span class="closed-today-domain">${escapeHtml(tab.domain)}</span>
          <span class="closed-today-reason">${closedReason(tab)}</span>
        </div>
        ${tab.summary?.tldr ? `<div class="closed-today-tldr">${escapeHtml(tab.summary.tldr)}</div>` : ''}
      </div>
      <button class="closed-today-reopen-btn" data-url="${escapeHtml(tab.url)}" data-id="${escapeHtml(tab.id)}">Reopen</button>
    </div>`).join('');
}

/** Reopen every row of the receipt, then refresh once and report plainly how it went. */
async function reopenAllClosedToday() {
  const rows = Array.from(document.querySelectorAll('#closed-today-list .closed-today-reopen-btn'));
  const button = $('closed-today-reopen-all');
  button.disabled = true;
  let reopened = 0;
  for (const { dataset } of rows) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RESTORE_TAB', url: dataset.url, recordId: dataset.id });
      if (res?.success) reopened++;
    } catch (err) {
      console.error('Error reopening tab:', err);
    }
  }
  button.disabled = false;
  await refresh();
  const failed = rows.length - reopened;
  const done = `Reopened ${reopened} ${reopened === 1 ? 'tab' : 'tabs'}.`;
  showToast(failed ? `${done} ${failed} could not be reopened.` : done, failed > 0);
}

async function renderFeed(showSkeletons = false) {
  const feed = $('tabs-feed');
  const seq = ++renderSeq;
  if (showSkeletons || feed.children.length === 0) feed.innerHTML = SKELETONS;

  // Settings first: the 'expiring-soon' sort needs the fade windows, and passing them in
  // keeps getArchivedTabs free of a hidden settings dependency. One read per render, not two.
  const settings = await getSettings().catch(() => null);
  // ponytail: newest 200 matches only (search/filters still reach older notes); fading keeps
  // most libraries under this. Add a "Load more" button if real libraries outgrow it.
  const tabs = await getArchivedTabs({
    ...currentFilters(), sortBy: state.sortBy, limit: 200, fadeSettings: settings
  });
  if (seq !== renderSeq) return; // a newer render started while this one was loading
  fadeSettings = settings;
  tabsById = new Map(tabs.map(tab => [String(tab.id), tab]));
  setResultsCount(tabs.length);
  const fadeNote = fadeExplanation(settings);
  $('fade-note').textContent = fadeNote;
  $('fade-note').hidden = !fadeNote || tabs.length === 0;

  if (tabs.length === 0) {
    feed.innerHTML = emptyStateHtml();
    return;
  }
  feed.innerHTML = tabs.map(cardHtml).join('');
  if (selectedIndex >= 0) selectCard(selectedIndex);
}

function setResultsCount(n) {
  $('results-count').textContent = `${n} ${n === 1 ? 'note' : 'notes'}`;
}

function emptyStateHtml() {
  const hasFilter = Boolean(state.query || state.tag || state.domain || state.time);
  let title = 'Your notebook is ready';
  let desc = 'Tabs you leave idle will be closed and kept here as notes' +
    (state.surface === 'panel' ? ', or click "Save current tab" to keep this page now.' : '.');
  if (state.view === 'inbox' && !hasFilter) {
    title = 'Inbox zero — nothing waiting.';
    desc = 'New captures land here until you reopen, star, or delete them.';
  } else if (hasFilter || state.view) {
    title = 'No matching notes';
    desc = 'Try adjusting your search terms or filters.';
  }
  return `<div class="empty-state">${ICONS.empty}<div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * Status badge for a record: sleeping (discarded), reopened (restored), saved (captured:
 * summary saved but the tab is still open). Closed is the default state, so it gets no badge
 * (empty string). Tooltip = closureReason.
 * @param {Object} tab
 * @returns {string}
 */
export function getStatusBadge(tab) {
  const entry = {
    discarded: ['sleeping', 'Sleeping', 'Sleeping tab (RAM suspended)'],
    restored: ['restored', 'Reopened', 'Tab was reopened'],
    captured: ['captured', 'Saved', 'Note saved; tab left open']
  }[tab.status];
  if (!entry) return '';
  const [cls, label, fallback] = entry;
  return `<span class="badge-status ${cls}" title="${escapeHtml(tab.closureReason || fallback)}">${label}</span>`;
}

function starLabel(isFavorite) {
  return isFavorite ? 'Unstar: let this note fade again' : 'Star: keep this note; it won\'t fade';
}

function cardHtml(tab) {
  const q = state.query;
  const bullets = toSafeStringArray(tab.summary?.bullets);
  const tags = toSafeStringArray(tab.summary?.tags).map(t => t.replace(/^#/, ''));
  const star = starLabel(tab.isFavorite);
  return `
    <article class="tab-card" data-id="${escapeHtml(tab.id)}">
      <div class="card-header">
        <div class="card-source">
          <img class="favicon" src="${escapeHtml(faviconUrl(tab.url))}" alt="">
          <span class="card-domain">${highlightSearch(tab.domain, q)}</span>
          ${getStatusBadge(tab)}
          ${fadeChipHtml(tab, fadeSettings, state.sortBy)}
        </div>
        <span class="card-time" title="Saved ${escapeHtml(new Date(tab.capturedAt).toLocaleString())}">${tab.readingTimeMinutes || 1} min read · saved ${formatTimeAgo(tab.capturedAt)}${fadeDateHtml(tab, fadeSettings, state.sortBy)}</span>
      </div>
      <h3 class="card-title" tabindex="0" title="${escapeHtml(tab.title)}">${highlightSearch(tab.title, q)}</h3>
      ${tab.summary?.tldr ? `<div class="card-tldr">${highlightSearch(tab.summary.tldr, q)}</div>` : '<div class="card-tldr card-tldr-empty">No AI note for this tab</div>'}
      ${bullets.length ? `
        <button class="takeaways-toggle" type="button" aria-expanded="false"><span class="takeaways-chevron">▶</span> Key Takeaways (${bullets.length})</button>
        <ul class="card-bullets collapsed">${bullets.map(b => `<li>${highlightSearch(b, q)}</li>`).join('')}</ul>` : ''}
      ${tags.length ? `<div class="card-tags">${tags.map(t => `<button type="button" class="card-tag" data-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${highlightSearch(t, q)}</button>`).join('')}</div>` : ''}
      <div class="card-footer">
        <button class="restore-btn">${ICONS.reopen} Reopen Tab</button>
        <div class="card-actions">
          <button class="action-icon-btn star-btn${tab.isFavorite ? ' active' : ''}" title="${star}" aria-label="${star}">${ICONS.star}</button>
          <button class="action-icon-btn reader-btn" title="Reader view (full text)" aria-label="Reader view">${ICONS.reader}</button>
          <button class="action-icon-btn copy-btn" title="Copy note (Markdown)" aria-label="Copy note">${ICONS.copy}</button>
          <button class="action-icon-btn delete-btn" title="Delete note" aria-label="Delete note">${ICONS.trash}</button>
        </div>
      </div>
    </article>`;
}

async function onFeedClick(e) {
  const card = e.target.closest('.tab-card');
  const target = e.target.closest('button, .card-title');
  const tab = card && tabsById.get(card.dataset.id);
  if (!tab || !target || card.classList.contains('removing')) return;

  if (target.matches('.restore-btn, .card-title')) {
    await reopenTab(tab.url, tab.id);
  } else if (target.matches('.takeaways-toggle')) {
    const open = target.classList.toggle('open');
    target.setAttribute('aria-expanded', String(open));
    card.querySelector('.card-bullets')?.classList.toggle('collapsed', !open);
  } else if (target.matches('.star-btn')) {
    await toggleStar(tab, card, target);
  } else if (target.matches('.reader-btn')) {
    await openReader(tab);
  } else if (target.matches('.copy-btn')) {
    await copyText(formatNoteSection(tab), 'Copied the note as Markdown.', target);
  } else if (target.matches('.delete-btn')) {
    await deleteCard(tab, card);
  } else if (target.matches('.card-tag')) {
    await applyFilters({ tag: target.dataset.tag, domain: '' });
  }
}

async function reopenTab(url, recordId) {
  if (!url) {
    showToast('This note has no web address to reopen', true);
    return;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'RESTORE_TAB', url, recordId });
    if (!res?.success) throw new Error(res?.error || 'no response');
    showToast(res.restoredInPlace ? 'Switched to the sleeping tab.' : 'Tab reopened.');
    await refresh(); // status, inbox/reopened membership and Closed today all changed
    if (res.removed) showRemovedOnReopenToast(recordId);
  } catch (err) {
    console.error('Error reopening tab:', err);
    showToast('Could not reopen that tab. Please try again.', true);
  }
}

async function toggleStar(tab, card, btn) {
  try {
    const updated = await toggleFavoriteTab(tab.id);
    tab.isFavorite = updated ? updated.isFavorite : !tab.isFavorite;
  } catch (err) {
    console.error('Error toggling favorite:', err);
    showToast('Could not update the star', true);
    return;
  }
  btn.classList.toggle('active', tab.isFavorite);
  btn.title = starLabel(tab.isFavorite);
  btn.setAttribute('aria-label', btn.title);
  showToast(tab.isFavorite ? 'Starred. This note will not fade.' : 'Unstarred');
  updateStats();
  if (state.time === 'favorites' && !tab.isFavorite) {
    await renderFeed();
    return;
  }
  // The fade chip and date depend on isFavorite; refresh them without a full re-render.
  card.querySelector('.fade-chip')?.remove();
  card.querySelector('.fade-date')?.remove();
  card.querySelector('.card-source').insertAdjacentHTML('beforeend', fadeChipHtml(tab, fadeSettings, state.sortBy));
  card.querySelector('.card-time').insertAdjacentHTML('beforeend', fadeDateHtml(tab, fadeSettings, state.sortBy));
}

async function copyText(text, message, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Clipboard write failed:', err);
    showToast('Could not copy to clipboard', true);
    return;
  }
  showToast(message);
  btn.classList.add('copied');
  const label = btn.querySelector('.btn-label');
  const original = label?.textContent;
  if (label) label.textContent = '✓ Copied';
  setTimeout(() => {
    btn.classList.remove('copied');
    if (label) label.textContent = original;
  }, 1500);
}

/**
 * Delete is durable immediately (tombstone via softDeleteTab), with a 5-second Undo toast
 * that calls restoreDeletedTab.
 */
async function deleteCard(tab, card) {
  // Animate synchronously for instant feedback, before the IndexedDB write lands.
  card.classList.add('removing');
  try {
    await softDeleteTab(tab.id);
  } catch (err) {
    console.error('Error deleting tab:', err);
    card.classList.remove('removing');
    showToast('Could not delete that note.', true);
    return;
  }
  clearSelection();
  setResultsCount($('tabs-feed').querySelectorAll('.tab-card:not(.removing)').length);
  updateStats();
  renderSidebarFilters();
  setTimeout(() => {
    card.remove();
    if (!$('tabs-feed').querySelector('.tab-card')) renderFeed();
  }, 260);

  showUndoToast('Note deleted', tab.id, () => restoreDeletedTab(tab.id));
}

/**
 * Undo toast for a note removed because it was reopened (Remove Notes When Reopened). Undo restores it
 * the way it would have been with the setting off: back in the list, marked Reopened.
 */
function showRemovedOnReopenToast(recordId) {
  showUndoToast('Note removed (reopened)', recordId, async () => {
    const restored = await restoreDeletedTab(recordId);
    if (!restored) return null;
    return markReopened(recordId);
  });
}

/** 5-second toast whose Undo runs `restore`, then refreshes and highlights the returned card. */
function showUndoToast(message, id, restore) {
  showToast(message, false, async () => {
    hideToast();
    let restoredOk = false;
    try {
      restoredOk = Boolean(await restore());
    } catch (err) {
      console.error('Error restoring tab:', err);
    }
    await refresh();
    const restored = $('tabs-feed').querySelector(`.tab-card[data-id="${CSS.escape(String(id))}"]`);
    if (restored) {
      restored.classList.add('undo-restored');
      restored.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => restored.classList.remove('undo-restored'), 1200);
    }
    if (restoredOk) showToast('Note restored');
    else showToast('Could not restore that note. It may already be gone.', true);
  }, 5000);
}

// ---------------------------------------------------------------------------
// Filters, search, view state
// ---------------------------------------------------------------------------

async function applyFilters(patch) {
  Object.assign(state, patch);
  clearSelection();
  closeDrawer();
  syncControls();
  await renderFeed();
}

/** Reflect `state` in every control (view switch, tag/domain lists, banner, sort). */
function syncControls() {
  // The sidebar's Views/When items and the narrow view switch share one rule: the current page.
  document.querySelectorAll('.nav-item, .view-tab-btn').forEach(item => {
    const current = item.dataset.time
      ? item.dataset.time === state.time
      : !state.time && item.dataset.view === state.view;
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  // Tag and domain are applied filters on top of the current view, styled quieter than it.
  document.querySelectorAll('#sidebar-tags [data-tag]').forEach(b => {
    const on = b.dataset.tag === state.tag;
    b.classList.toggle('applied', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('#sidebar-domains [data-domain]').forEach(b => {
    const on = b.dataset.domain === state.domain;
    b.classList.toggle('applied', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const label = state.tag ? `Filtered by topic: #${state.tag}`
    : state.domain ? `Filtered by domain: ${state.domain}`
    : TIME_LABELS[state.time] ? `Filtered by: ${TIME_LABELS[state.time]}` : '';
  $('filter-banner').hidden = !label;
  $('filter-label').textContent = label;
  $('filters-btn').classList.toggle('has-filter', Boolean(label));
  $('sort-select').value = state.sortBy;
}

function updateSearchUI() {
  const hasText = $('search-input').value.length > 0;
  $('search-clear-btn').hidden = !hasText;
  $('search-kbd-hint').hidden = hasText;
}

async function clearSearch() {
  clearTimeout(searchTimer);
  const hadQuery = Boolean($('search-input').value || state.query);
  $('search-input').value = '';
  updateSearchUI();
  if (hadQuery) await applyFilters({ query: '' });
}

// ---------------------------------------------------------------------------
// Keyboard selection
// ---------------------------------------------------------------------------

function liveCards() {
  return Array.from(document.querySelectorAll('#tabs-feed .tab-card:not(.removing)'));
}

function selectCard(index) {
  const cards = liveCards();
  if (cards.length === 0) {
    selectedIndex = -1;
    return;
  }
  selectedIndex = Math.max(0, Math.min(index, cards.length - 1));
  cards.forEach((card, i) => card.classList.toggle('keyboard-selected', i === selectedIndex));
  cards[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // Real focus on the title so screen readers announce the selected note.
  cards[selectedIndex].querySelector('.card-title')?.focus({ preventScroll: true });
}

function clearSelection() {
  selectedIndex = -1;
  document.querySelectorAll('#tabs-feed .keyboard-selected').forEach(c => c.classList.remove('keyboard-selected'));
}

// ---------------------------------------------------------------------------
// Drawer (narrow layout) and export menu
// ---------------------------------------------------------------------------

function openDrawer() {
  document.body.classList.add('drawer-open');
  $('filters-btn').setAttribute('aria-expanded', 'true');
  document.querySelector('#sidebar .nav-item[aria-current], #sidebar .nav-item')?.focus();
}

function closeDrawer() {
  if (!document.body.classList.contains('drawer-open')) return;
  document.body.classList.remove('drawer-open');
  $('filters-btn').setAttribute('aria-expanded', 'false');
  if ($('sidebar').contains(document.activeElement)) $('filters-btn').focus();
}

function toggleExportMenu(open) {
  $('export-dropdown-menu').togglePopover(open);
}

/**
 * Export in the chosen format. Markdown / Obsidian respect the active search, view, tag,
 * domain and time filters; JSON is always a full backup of every note (the control says so). Formatting lives in shared/export.js.
 * @param {'markdown'|'obsidian'|'json'} format
 */
export async function performExport(format = 'markdown') {
  const tabs = format === 'json'
    ? await getArchivedTabs({ limit: Infinity, includeText: true })
    : await getArchivedTabs({ ...currentFilters(), limit: 10000 });

  if (!tabs.length) {
    const filtered = Boolean(state.query || state.tag || state.domain || state.time || state.view);
    showToast(filtered && format !== 'json' ? 'No notes match the active filter to export.' : 'No notes to export yet.');
    return;
  }
  const stamp = Date.now();
  if (format === 'json') {
    triggerDownload(exportToJSON(tabs), `tab-squirrel-wiki-export-${stamp}.json`, 'application/json;charset=utf-8');
    showToast('Exported a JSON backup.');
  } else if (format === 'obsidian') {
    triggerDownload(exportToObsidianZip(tabs), `tab-squirrel-obsidian-vault-${stamp}.zip`, 'application/zip');
    showToast('Exported an Obsidian vault.');
  } else {
    triggerDownload(exportToMarkdown(tabs), `tab-squirrel-wiki-export-${stamp}.md`, 'text/markdown;charset=utf-8');
    showToast('Exported notes as Markdown.');
  }
}

// ---------------------------------------------------------------------------
// Reader view
// ---------------------------------------------------------------------------

async function openReader(tab) {
  readerTab = tab;
  const dialog = $('reader-dialog');
  $('modal-title').textContent = tab.title || 'Untitled Tab';
  const link = $('modal-source-link');
  link.textContent = tab.url || '';
  if (/^https?:\/\//i.test(tab.url)) link.href = tab.url; // only http(s) links are clickable
  else link.removeAttribute('href');
  updateReaderActions();
  $('modal-summary-box').innerHTML = `<strong>Note overview</strong><p>${escapeHtml(tab.summary?.tldr || 'No overview available')}</p>`;
  $('modal-text-content').innerHTML = '<p class="empty-article-text">Loading article text…</p>';
  dialog.showModal();

  // List results omit cleanText; fetch the full record for the article body.
  try {
    const full = await getTabById(tab.id);
    if (readerTab !== tab) return; // another card was opened while this one loaded
    readerTab = { ...tab, cleanText: full?.cleanText || '' };
    $('modal-text-content').innerHTML = formatExtractedArticle(readerTab.cleanText);
  } catch (err) {
    console.error('Failed to load full article text:', err);
    if (readerTab === tab) $('modal-text-content').innerHTML = formatExtractedArticle('');
  }
}

/** Reader header: the fade line and the Star button's label follow the note's current star state. */
function updateReaderActions() {
  if (!readerTab) return;
  $('modal-fade').textContent = fadeChipLabel(readerTab, fadeSettings, state.sortBy) || fadeDateLabel(readerTab, fadeSettings);
  const star = starLabel(readerTab.isFavorite);
  const btn = $('modal-star-btn');
  btn.title = star;
  btn.setAttribute('aria-label', star);
  btn.querySelector('.btn-label').textContent = readerTab.isFavorite ? 'Unstar' : 'Star';
}

/** Reader Reopen / Star / Delete reuse the card's handlers on the note's card in the feed. */
async function onReaderAction(action) {
  const tab = readerTab && tabsById.get(String(readerTab.id));
  const card = tab && document.querySelector(`#tabs-feed .tab-card[data-id="${CSS.escape(String(tab.id))}"]`);
  if (!tab || !card || card.classList.contains('removing')) return;
  if (action === 'star') {
    await toggleStar(tab, card, card.querySelector('.star-btn'));
    readerTab.isFavorite = tab.isFavorite;
    updateReaderActions();
    return;
  }
  $('reader-dialog').close();
  if (action === 'reopen') await reopenTab(tab.url, tab.id);
  else await deleteCard(tab, card);
}

/**
 * Format raw article snapshot text into readable semantic HTML paragraphs and headings.
 * @param {string} text
 * @returns {string} HTML string
 */
export function formatExtractedArticle(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return '<p class="empty-article-text">No snapshot text saved for this article.</p>';
  }
  return text.split(/\n\s*\n+/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length + 1; // # -> h2 ... #### -> h5
      return `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
    }
    if (/^>\s*(.+)$/s.test(trimmed)) {
      return `<blockquote>${escapeHtml(trimmed.replace(/^>\s*/gm, ''))}</blockquote>`;
    }
    return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Surface-level actions, density, permissions
// ---------------------------------------------------------------------------

async function closeSidePanel() {
  try {
    const win = await chrome.windows.getCurrent();
    if (chrome.sidePanel?.close && win?.id) await chrome.sidePanel.close({ windowId: win.id });
  } catch (err) {
    console.debug('chrome.sidePanel.close error:', err);
  }
  try {
    await chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL' });
  } catch {}
  try {
    window.close();
  } catch {}
}

async function archiveCurrentTab(btn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ARCHIVE_ACTIVE_TAB' });
    if (response?.success) {
      showToast('Saved a note. The tab is still open.');
      await refresh();
    } else {
      console.error('Archive failed:', response?.error);
      showToast('Could not save this tab. Please try again.', true);
    }
  } catch (err) {
    console.error('Error archiving tab:', err);
    showToast('Could not save this tab. Please try again.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

async function loadDensity() {
  try {
    const data = await chrome.storage.local.get(DENSITY_KEY);
    if (data[DENSITY_KEY] === 'compact' || data[DENSITY_KEY] === 'comfortable') state.density = data[DENSITY_KEY];
  } catch (err) {
    console.debug('Failed to load density preference:', err);
  }
  applyDensity();
}

async function loadSort() {
  try {
    const data = await chrome.storage.local.get(SORT_KEY);
    const saved = data[SORT_KEY];
    if ([...$('sort-select').options].some(o => o.value === saved)) {
      state.sortBy = saved;
      syncControls();
    }
  } catch (err) {
    console.debug('Failed to load sort preference:', err);
  }
}

function applyDensity() {
  const compact = state.density === 'compact';
  $('tabs-feed').classList.toggle('compact', compact);
  const btn = $('density-toggle-btn');
  btn.classList.toggle('active', compact);
  btn.setAttribute('aria-pressed', String(compact));
  btn.title = compact ? 'Switch to Comfortable View' : 'Switch to Compact View';
}

async function checkPermissions() {
  try {
    $('perm-banner').hidden = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch (err) {
    console.debug('Permission check error:', err);
  }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function showToast(message, isError = false, onUndo = null, duration = 2600) {
  const toast = $('toast');
  const undoBtn = $('toast-undo-btn');
  const progress = $('toast-progress');
  clearTimeout(toastTimer);
  $('toast-message').textContent = message;
  toast.classList.toggle('error', isError);
  undoBtn.hidden = !onUndo;
  undoBtn.onclick = onUndo ? (e) => { e.stopPropagation(); onUndo(); } : null;
  // Restart the countdown bar animation (force reflow between resets).
  progress.style.animation = 'none';
  void progress.offsetWidth;
  progress.style.animation = onUndo ? `toastCountdown ${duration}ms linear forwards` : 'none';
  toast.classList.remove('hidden', 'paused');
  toastDuration = duration;
  toastTimer = setTimeout(hideToast, duration);
}

/** Hold the auto-dismiss while the toast is hovered or focused (WCAG 2.2.1); restart it on leave. */
function setToastPaused(paused) {
  const toast = $('toast');
  if (toast.classList.contains('hidden')) return;
  clearTimeout(toastTimer);
  toast.classList.toggle('paused', paused);
  if (paused) $('toast-progress').style.animation = 'none';
  if (paused || toast.matches(':hover, :focus-within')) return;
  // Leaving restarts the full countdown, bar included, so the two stay in step.
  const progress = $('toast-progress');
  if (!$('toast-undo-btn').hidden) {
    progress.style.animation = 'none';
    void progress.offsetWidth;
    progress.style.animation = `toastCountdown ${toastDuration}ms linear forwards`;
  }
  toastTimer = setTimeout(hideToast, toastDuration);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').classList.add('hidden');
  $('toast').classList.remove('paused');
  $('toast-progress').style.animation = 'none';
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function setupEventListeners() {
  const searchInput = $('search-input');
  const feed = $('tabs-feed');

  // CSP forbids inline onerror handlers; hide broken favicons via one capturing listener.
  document.addEventListener('error', (e) => {
    if (e.target instanceof HTMLImageElement && e.target.classList.contains('favicon')) e.target.hidden = true;
  }, true);

  feed.addEventListener('click', onFeedClick);
  const toastEl = $('toast');
  toastEl.addEventListener('mouseenter', () => setToastPaused(true));
  toastEl.addEventListener('mouseleave', () => setToastPaused(false));
  toastEl.addEventListener('focusin', () => setToastPaused(true));
  toastEl.addEventListener('focusout', () => setToastPaused(false));
  $('closed-today-reopen-all').addEventListener('click', reopenAllClosedToday);
  $('closed-today-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.closed-today-reopen-btn');
    if (btn) reopenTab(btn.dataset.url, btn.dataset.id);
  });

  // Surface-specific actions
  $('archive-current-btn').addEventListener('click', (e) => archiveCurrentTab(e.currentTarget));
  $('open-full-btn').addEventListener('click', async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') });
    await closeSidePanel();
  });
  $('settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('enable-perm-btn').addEventListener('click', async () => {
    try {
      if (await chrome.permissions.request({ origins: ['<all_urls>'] })) {
        $('perm-banner').hidden = true;
        showToast('Permission granted.');
      } else {
        showToast('Permission was not granted, so page text can\'t be read yet.', true);
      }
    } catch (err) {
      console.error('Permission request failed:', err);
      showToast('Could not ask for permission. Please try again.', true);
    }
  });

  // Drawer
  $('filters-btn').addEventListener('click', openDrawer);
  $('drawer-close-btn').addEventListener('click', closeDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);

  // Filters
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => applyFilters({
    time: item.dataset.time || '',
    view: item.dataset.time ? '' : item.dataset.view,
    tag: '',
    domain: ''
  })));
  document.querySelectorAll('.view-tab-btn').forEach(btn => btn.addEventListener('click', () => applyFilters({ view: btn.dataset.view, time: '' })));
  $('sidebar-tags').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (btn) applyFilters({ tag: state.tag === btn.dataset.tag ? '' : btn.dataset.tag, domain: '' });
  });
  $('sidebar-domains').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-domain]');
    if (btn) applyFilters({ domain: state.domain === btn.dataset.domain ? '' : btn.dataset.domain, tag: '' });
  });
  $('clear-filter-btn').addEventListener('click', () => applyFilters({ tag: '', domain: '', time: '' }));
  $('sort-select').addEventListener('change', async (e) => {
    applyFilters({ sortBy: e.target.value });
    try {
      await chrome.storage.local.set({ [SORT_KEY]: state.sortBy });
    } catch (err) {
      console.debug('Failed to save sort preference:', err);
    }
  });

  $('density-toggle-btn').addEventListener('click', async () => {
    state.density = state.density === 'compact' ? 'comfortable' : 'compact';
    applyDensity();
    try {
      await chrome.storage.local.set({ [DENSITY_KEY]: state.density });
    } catch (err) {
      console.debug('Failed to save density preference:', err);
    }
  });

  // Search (200ms debounce)
  searchInput.addEventListener('input', () => {
    updateSearchUI();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilters({ query: searchInput.value }), 200);
  });
  $('search-clear-btn').addEventListener('click', async () => {
    await clearSearch();
    searchInput.focus();
  });
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      // Jump to the first result; reopening stays a deliberate second step
      e.preventDefault();
      clearTimeout(searchTimer);
      await applyFilters({ query: searchInput.value });
      searchInput.blur();
      selectCard(0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      searchInput.blur();
      selectCard(0);
    }
  });

  // Export dropdown (popover attribute + popovertarget handle opening, light-dismiss and Escape)
  const exportBtn = $('export-dropdown-btn');
  const exportMenu = $('export-dropdown-menu');
  exportBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      toggleExportMenu(true);
    }
  });
  exportMenu.addEventListener('beforetoggle', (e) => {
    exportBtn.setAttribute('aria-expanded', String(e.newState === 'open'));
  });
  exportMenu.addEventListener('toggle', (e) => {
    if (e.newState === 'open') exportMenu.querySelector('.export-option-btn')?.focus();
  });
  exportMenu.addEventListener('keydown', (e) => {
    const options = Array.from(exportMenu.querySelectorAll('.export-option-btn'));
    const i = options.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      options[(i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
    } else if (e.key === 'Tab') {
      toggleExportMenu(false);
    }
  });
  exportMenu.querySelectorAll('.export-option-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    toggleExportMenu(false);
    await performExport(btn.dataset.format);
  }));

  // Reader dialog: close button, light-dismiss on backdrop, copy full note
  const dialog = $('reader-dialog');
  $('modal-close-btn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
    if (!inside) dialog.close();
  });
  $('modal-reopen-btn').addEventListener('click', () => onReaderAction('reopen'));
  $('modal-star-btn').addEventListener('click', () => onReaderAction('star'));
  $('modal-delete-btn').addEventListener('click', () => onReaderAction('delete'));
  $('modal-copy-btn').addEventListener('click', (e) => {
    if (readerTab) copyText(formatStandaloneNote(readerTab), 'Copied the note as Markdown.', e.currentTarget);
  });

  // Shortcuts legend: native <dialog>, so Escape closes it and focus returns to the opener
  const legend = $('shortcuts-dialog');
  $('shortcuts-btn').addEventListener('click', () => { closeDrawer(); legend.showModal(); });
  $('shortcuts-close-btn').addEventListener('click', () => legend.close());
  legend.addEventListener('click', (e) => { if (e.target === legend) legend.close(); });

  // Global keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    if (dialog.open || legend.open) return; // a <dialog> closes itself on Escape
    const el = document.activeElement;
    const typing = el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
    const drawerOpen = document.body.classList.contains('drawer-open');

    if (e.key === 'Escape') {
      if (exportMenu.matches(':popover-open')) return; // the popover closes itself on Escape
      if (drawerOpen) return closeDrawer();
      // First Escape in the search box only leaves it (the query stays); the next one clears it.
      if (el === searchInput) {
        searchInput.blur();
        return;
      }
      clearSelection();
      await clearSearch();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!typing) {
        e.preventDefault();
        clearSelection();
        closeDrawer();
        searchInput.focus();
        searchInput.select();
      }
      return;
    }
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      closeDrawer();
      legend.showModal();
      return;
    }
    if (typing || drawerOpen) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectCard(selectedIndex + 1);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectCard(selectedIndex - 1);
    } else if (e.key === 'Enter' && el?.matches('.card-title')) {
      e.preventDefault();
      el.click();
    } else if (e.key === 'Enter' && selectedIndex >= 0 && !el?.closest('button, a, summary')) {
      e.preventDefault();
      liveCards()[selectedIndex]?.querySelector('.restore-btn')?.click();
    }
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Legacy/imported bullets or tags may contain non-strings or null entries.
function toSafeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item !== null && item !== undefined)
    .map(item => String(item).trim())
    .filter(Boolean);
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { style: 'narrow' });

function formatTimeAgo(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return relativeTimeFormatter.format(-mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return relativeTimeFormatter.format(-hours, 'hour');
  return relativeTimeFormatter.format(-Math.floor(hours / 24), 'day');
}
