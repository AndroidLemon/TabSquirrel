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
  markFiled,
  isInInbox,
  toggleFavoriteTab,
  getSettings,
  DEFAULT_SETTINGS
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

const TIME_LABELS = { favorites: 'Starred', today: 'Today', yesterday: 'Yesterday', week: 'Past 7 days' };
const SIDEBAR_TAGS_VISIBLE = 8;
const SIDEBAR_DOMAINS_VISIBLE = 5;
const SIDEBAR_LIST_MAX = 50; // visible plus the "More" disclosure
const SORT_KEY = 'notebook_sort';
const DENSITY_KEY = 'sidepanel_density'; // pre-merge storage key, kept so saved preferences survive
const RECEIPT_SEEN_KEY = 'closed_today_seen'; // { day, upTo }: Closed today was shown up to this lastClosedAt
const CLOSED_TODAY_VISIBLE = 6; // more closures than this and the rest sit behind "Show all"
const REOPEN_ALL_CONFIRM_ABOVE = 5; // more still-closed notes than this and Reopen all asks first
const PERM_DISMISSED_KEY = 'perm_banner_dismissed'; // the quiet permission note was dismissed
const VIEW_LABELS = { inbox: 'Inbox', reopened: 'Reopened' };

let fadeSettings = null;
let tabsById = new Map();
let renderSeq = 0;
let selectedId = null; // the j/k-selected note, by id so a refresh that reorders the feed keeps it
let openUrls = new Set(); // addresses of the tabs open right now: decides Go to tab vs Reopen tab
let searchTimer = null;
let toastTimer = null;
let toastDuration = 2600;
let readerTab = null;
let receiptSeenUpTo = null; // newest lastClosedAt already shown today; null until read from storage
let closedTodayTabs = []; // every note closed today, shown or behind Show all: Reopen all works from these
let closedTodayExpanded = null; // full cards (true) or one line each (false); null until the first render
let closedTodayShowAll = false; // past CLOSED_TODAY_VISIBLE, Show all was pressed
let reopenFailedIds = new Set(); // notes the last Reopen all could not reopen
let readerFiled = false; // opening the reader just took its note out of the Inbox view on screen
let readerFiling = null; // the markFiled write, so the redraw on close sees it
let closedTodayCappedOut = 0; // notes closed today behind Show all, for the results count
let permMissing = false; // the all-sites permission is not granted
let permDismissed = false; // the user dismissed the quiet permission note
let noteTotal = null; // every note, whatever the view: decides how loud the permission note is; null until read

const ICONS = {
  reopen: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
  reader: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  empty: '<img class="empty-icon" src="../assets/icons/icon-48.png" alt="" width="40" height="40">'
};

// Keys that act on the j/k-selected card.
const CARD_KEYS = {
  s: (tab, card) => toggleStar(tab, card),
  o: (tab) => openReader(tab),
  Delete: (tab, card) => deleteCard(tab, card),
  Backspace: (tab, card) => deleteCard(tab, card)
};

const SKELETONS = '<div class="skeleton-card"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:75%;height:16px"></div><div class="skeleton-line" style="height:32px"></div></div>'.repeat(3);

const $ = (id) => document.getElementById(id);

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Tab Squirrel closes idle tabs in the background; refresh stats and the feed (Closed today included) when that
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
  state.view = 'inbox';
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
  await Promise.all([updateStats(), renderSidebarFilters(), renderFeed(showSkeletons)]);
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
  set('count-inbox', stats.inbox);
  set('count-reopened', stats.reopened);
  set('count-today', stats.today);
  set('count-favorites', stats.favorites || 0);
  noteTotal = stats.total;
  syncPermBanner();
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
 * which path closed it: a trusted domain, a tab that slept first and then sat idle longer
 * (hybrid mode: closeDiscardedTab stamps closedFrom 'suspended'), or plain idleness.
 */
export function closedReason(tab) {
  if (tab.closureReason === 'Closed: trusted domain') return 'On your always-close list';
  if (tab.closedFrom === 'suspended') return 'Slept first, then closed after sitting idle longer';
  return 'Sat idle, so it was closed';
}

/**
 * The reason a card in Closed today states, or '' for the common one. Sitting idle past the
 * threshold is true of every closure, so the heading says it once (closedTodayHeading).
 */
export function closedException(tab) {
  const reason = closedReason(tab);
  return reason === closedReason({}) ? '' : reason;
}

/** "closed 10:42 · idle 64 min", from what the record holds; no idle time unless both stamps are real. */
export function closedWhen(tab) {
  if (!Number.isFinite(tab.lastClosedAt)) return '';
  const time = new Date(tab.lastClosedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const idle = idleMinutes(tab);
  if (!(idle >= 1)) return `closed ${time}`;
  const hours = Math.floor(idle / 60);
  const minutes = idle % 60;
  const span = idle < 120 ? `${idle} min` : minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  return `closed ${time} · idle ${span}`;
}

/** Whole minutes between the last use and the close; NaN when lastActiveAt is missing. */
const idleMinutes = (tab) => Math.round((tab.lastClosedAt - tab.lastActiveAt) / 60000);

/**
 * The Closed today heading: "Closed 8 tabs for you today, all idle 60+ min · 2 reopened".
 * Every closure comes from the idle sweep, and a tab that slept first sat idle twice as long,
 * so "idle {timeout}+ min" holds whatever the mix of reasons. It is dropped if any record shows
 * a shorter idle time (the threshold was raised since), so the line never overstates.
 * The common reason lives here; cards state only the exceptions (closedException).
 */
export function closedTodayHeading(tabs, timeoutMinutes) {
  const n = tabs.length;
  const reopened = tabs.filter(tab => !tab.closedAt).length;
  const timeout = Number(timeoutMinutes);
  // Under a minute (or no stamp) is no idle data, as in closedWhen; only real data can contradict.
  const holds = timeout > 0 && tabs.every(tab => !(idleMinutes(tab) >= 1 && idleMinutes(tab) < timeout));
  const span = timeout >= 120 && timeout % 60 === 0 ? `${timeout / 60}+ h` : `${timeout}+ min`;
  const idle = holds ? `, ${n === 1 ? 'idle' : 'all idle'} ${span}` : '';
  return `Closed ${n} ${n === 1 ? 'tab' : 'tabs'} for you today${idle}${reopened ? ` · ${reopened} reopened` : ''}`;
}

/**
 * Closed today shows only in the plain Inbox or All notes view: any search, tag, domain or time
 * filter (Starred included) hides it, and so does Reopened, which is its own list.
 */
function showsClosedToday() {
  return !state.query && !state.tag && !state.domain && !state.time && (state.view === 'inbox' || state.view === '');
}

/**
 * Today's closures, newest first, except that any the last Reopen all could not reopen come first,
 * so a failure never hides behind Show all. [] when the section is not shown in this view.
 */
async function loadClosedToday() {
  if (!showsClosedToday()) return [];
  try {
    const tabs = await getArchivedTabs({ closedSince: startOfLocalDay(), limit: Infinity });
    const failed = (tab) => (tab.closedAt && reopenFailedIds.has(String(tab.id)) ? 1 : 0);
    return tabs.sort((a, b) => failed(b) - failed(a) || b.lastClosedAt - a.lastClosedAt);
  } catch (err) {
    console.debug('Failed to load closed-today tabs:', err);
    return [];
  }
}

/**
 * Expanded when the section holds closures not yet shown today (the first open of the day, or new
 * closures since), one line per note on later opens; the toggle switches for this page only.
 */
async function syncClosedTodaySeen(tabs) {
  if (receiptSeenUpTo === null) receiptSeenUpTo = await loadReceiptSeen();
  const newest = Math.max(0, ...tabs.map(tab => tab.lastClosedAt));
  if (tabs.length && newest > receiptSeenUpTo) {
    closedTodayExpanded = true;
    receiptSeenUpTo = newest;
    chrome.storage.local.set({ [RECEIPT_SEEN_KEY]: { day: localDayKey(), upTo: newest } })
      .catch(err => console.debug('Failed to save receipt state:', err));
  } else if (closedTodayExpanded === null) {
    closedTodayExpanded = false;
  }
}

/** The section's heading, Reopen all, list layout and Show all, from the day's records. */
function renderClosedTodayFrame(tabs, settings) {
  const section = $('closed-today');
  section.hidden = tabs.length === 0;
  closedTodayTabs = tabs;
  closedTodayCappedOut = 0;
  if (!tabs.length) {
    $('closed-today-list').innerHTML = '';
    return [];
  }
  const toggle = $('closed-today-toggle');
  toggle.textContent = closedTodayHeading(tabs, { ...DEFAULT_SETTINGS, ...settings }.timeoutMinutes);
  toggle.setAttribute('aria-expanded', String(closedTodayExpanded));
  $('closed-today-list').classList.toggle('lines', !closedTodayExpanded);
  setReopenAllConfirm(0); // also hides Reopen all when nothing is left to reopen
  const capped = tabs.length > CLOSED_TODAY_VISIBLE;
  const more = $('closed-today-more');
  more.hidden = !capped;
  more.setAttribute('aria-expanded', String(closedTodayShowAll));
  more.textContent = closedTodayShowAll ? 'Show fewer' : `Show all ${tabs.length} closed today`;
  const shown = capped && !closedTodayShowAll ? tabs.slice(0, CLOSED_TODAY_VISIBLE) : tabs;
  closedTodayCappedOut = tabs.length - shown.length;
  return shown;
}

/** What a Closed today card adds: when it closed, a reason only when unusual, and its state today. */
function closedTodayExtras(tab) {
  const failed = tab.closedAt && reopenFailedIds.has(String(tab.id));
  const reopened = !tab.closedAt && tab.status !== 'restored'; // a restored note already has the badge
  const exception = closedException(tab);
  const [time, idle] = closedWhen(tab).split(' · ');
  return {
    flags: (reopened ? '<span class="badge-status restored" title="Reopened today">Reopened</span>' : '') +
      (failed ? '<span class="badge-status failed">Could not reopen</span>' : ''),
    // The one-line view keeps the time and drops the idle span, so the two are separate spans.
    line: `<p class="card-closed"><span class="card-closed-when">${escapeHtml(time)}${idle ? `<span class="card-closed-idle"> · ${escapeHtml(idle)}</span>` : ''}</span>${exception ? `<span class="card-closed-reason">${escapeHtml(exception)}</span>` : ''}</p>`
  };
}

const stillClosedToday = () => closedTodayTabs.filter(tab => tab.closedAt);

/** Show "Reopen N tabs?" with Reopen / Cancel in place of the Reopen all button; 0 puts the button back. */
function setReopenAllConfirm(count, { focus = false } = {}) {
  const asking = count > 0;
  $('closed-today-confirm').hidden = !asking;
  $('closed-today-reopen-all').hidden = asking || !stillClosedToday().length;
  if (asking) $('closed-today-confirm-text').textContent = `Reopen ${count} tabs?`;
  if (focus) (asking ? $('closed-today-confirm-yes') : $('closed-today-reopen-all')).focus();
}

function onReopenAllClick() {
  const count = stillClosedToday().length;
  if (count > REOPEN_ALL_CONFIRM_ABOVE) setReopenAllConfirm(count, { focus: true });
  else reopenAllClosedToday();
}

/** Reopen every note closed today that is still closed (shown or behind Show all), one after another with progress in the button, then refresh once and say how it went. */
async function reopenAllClosedToday() {
  const rows = stillClosedToday().map(tab => ({ url: tab.url, id: String(tab.id) }));
  const button = $('closed-today-reopen-all');
  setReopenAllConfirm(0);
  button.hidden = false;
  button.disabled = true;
  reopenFailedIds = new Set();
  let reopened = 0;
  const removedIds = []; // notes dropped by Remove Notes When Reopened
  for (const [i, { url, id }] of rows.entries()) {
    button.textContent = `Reopening ${i + 1} of ${rows.length}…`;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RESTORE_TAB', url, recordId: id });
      if (res?.success) reopened++;
      else reopenFailedIds.add(id);
      if (res?.success && res.removed) removedIds.push(id);
    } catch (err) {
      console.error('Error reopening tab:', err);
      reopenFailedIds.add(id);
    }
  }
  button.disabled = false;
  button.textContent = 'Reopen all';
  await refresh();
  if (document.activeElement === document.body) { // the confirm that held focus is gone
    (button.checkVisibility() ? button : $('closed-today-toggle')).focus();
  }
  const failed = rows.length - reopened;
  const done = `Reopened ${reopened} ${reopened === 1 ? 'tab' : 'tabs'}.`;
  const summary = failed ? `${done} ${failed} could not be reopened.` : done;
  if (removedIds.length) showRemovedOnReopenToast(removedIds, `${summary} ${removedIds.length === 1 ? 'Its note was' : 'Their notes were'} removed.`);
  else showToast(summary, failed > 0);
}

/**
 * The feed. In the plain Inbox or All notes view, today's closures come first as their own
 * section (each note once, as its card), then the rest of the view under a quiet heading,
 * without those notes. Any filter or search renders the plain filtered feed.
 * `keepIndex`: if the selected note left the view (read or starred out of the Inbox), select
 * the card now at its position instead of dropping the selection.
 */
async function renderFeed(showSkeletons = false, { keepIndex = false } = {}) {
  const feed = $('tabs-feed');
  const seq = ++renderSeq;
  if (showSkeletons || (feed.children.length === 0 && $('closed-today').hidden)) feed.innerHTML = SKELETONS;

  // Settings first: the 'expiring-soon' sort needs the fade windows, and passing them in
  // keeps getArchivedTabs free of a hidden settings dependency. One read per render, not two.
  const [settings] = await Promise.all([getSettings().catch(() => null), loadOpenUrls()]);
  // ponytail: newest 200 matches only (search/filters still reach older notes); fading keeps
  // most libraries under this. Add a "Load more" button if real libraries outgrow it.
  const [tabs, today] = await Promise.all([
    getArchivedTabs({ ...currentFilters(), sortBy: state.sortBy, limit: 200, fadeSettings: settings }),
    loadClosedToday()
  ]);
  if (seq !== renderSeq) return; // a newer render started while this one was loading
  if (today.length) await syncClosedTodaySeen(today);
  if (seq !== renderSeq) return;
  fadeSettings = settings;
  const todayIds = new Set(today.map(tab => String(tab.id)));
  const rest = tabs.filter(tab => !todayIds.has(String(tab.id)));
  tabsById = new Map([...today, ...rest].map(tab => [String(tab.id), tab]));
  setResultsCount(today.length + rest.length);

  // Re-rendering destroys the focused card; take focus back only if it was in the feed (or
  // nowhere), never from the search box or another control the user moved to.
  const active = document.activeElement;
  const hadFeedFocus = !active || active === document.body || inFeed(active);
  const prevIndex = liveCards().findIndex(card => card.dataset.id === selectedId);

  const shown = renderClosedTodayFrame(today, settings);
  $('closed-today-list').innerHTML = shown.map(tab => cardHtml(tab, closedTodayExtras(tab))).join('');
  const heading = $('feed-heading');
  heading.hidden = !today.length || !rest.length;
  heading.textContent = state.view === 'inbox' ? 'Rest of your Inbox' : 'Other notes';

  if (today.length === 0 && rest.length === 0) {
    const total = (await getStats().catch(() => null))?.total ?? 1; // unknown: don't claim a first run
    if (seq !== renderSeq) return;
    feed.innerHTML = emptyStateHtml(settings, total);
    clearSelection();
    return;
  }
  feed.innerHTML = rest.map(tab => cardHtml(tab)).join('');
  if (selectedId !== null) {
    const cards = liveCards();
    const index = cards.findIndex(card => card.dataset.id === selectedId);
    if (index >= 0) selectCard(index, { focus: hadFeedFocus });
    else if (keepIndex && prevIndex >= 0 && cards.length) selectCard(prevIndex, { focus: hadFeedFocus });
    else clearSelection(); // the selected note is gone
  }
}

function setResultsCount(n) {
  $('results-count').textContent = `${n} ${n === 1 ? 'note' : 'notes'}`;
}

/**
 * What the notebook says before it holds any note: what will happen, with the user's own
 * threshold. "Save current tab" exists only in the side panel, so only the panel names it.
 */
export function firstRunCopy(settings, surface) {
  const { timeoutMinutes, archiveMode } = { ...DEFAULT_SETTINGS, ...settings };
  const idle = `${timeoutMinutes} ${timeoutMinutes === 1 ? 'minute' : 'minutes'}`;
  const asleep = archiveMode === 'discard';
  const lines = [
    asleep ? `Tabs left idle for ${idle} are put to sleep.`
      : archiveMode === 'close' ? `Tabs left idle for ${idle} are closed.`
      : `Tabs left idle for ${idle} are closed, or put to sleep if they might hold unsaved work.`,
    'A short note of each is kept here.',
    asleep ? 'Any note reopens its tab in one click.' : 'Anything closed reopens in one click.'
  ];
  if (surface === 'panel') lines.push('To keep a page now, use Save current tab.');
  return { title: 'Nothing here yet', lines };
}

/** The view a search is limited to, named for the user; '' for All notes and the date ranges. */
function searchScope() {
  return state.time === 'favorites' ? 'Starred' : state.time ? '' : VIEW_LABELS[state.view] || '';
}

function emptyStateHtml(settings, total) {
  const hasFilter = Boolean(state.query || state.tag || state.domain || state.time);
  const scope = searchScope();
  let title;
  let lines;
  let action = '';
  if (total === 0 && !hasFilter) {
    ({ title, lines } = firstRunCopy(settings, state.surface));
  } else if (state.view === 'inbox' && !hasFilter) {
    title = 'Nothing new in your Inbox';
    lines = ['Notes leave it when you read, star or reopen them.'];
  } else if (state.query && scope) {
    title = `No matches in ${scope}`;
    lines = [`Searched ${scope} only for “${escapeHtml(state.query)}”.`];
    action = '<button class="empty-action-btn" type="button" data-action="search-all">Search all notes</button>';
  } else {
    title = 'No matching notes';
    lines = ['Try adjusting your search terms or filters.'];
  }
  // Fading is explained where the notebook is empty and in the shortcuts list, not above every feed.
  const fade = !hasFilter && fadeExplanation(settings);
  if (fade) lines.push(`<span id="fade-note" class="fade-note">${escapeHtml(fade)}</span>`);
  return `<div class="empty-state">${ICONS.empty}<div class="empty-title">${title}</div><div class="empty-desc">${lines.map(line => `<p>${line}</p>`).join('')}</div>${action}</div>`;
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

/**
 * Read the addresses of every open tab. RESTORE_TAB switches to a tab whose url or pendingUrl equals the
 * note's address exactly, so the labels use the same match. Without tab addresses nothing counts as open.
 */
async function loadOpenUrls() {
  try {
    const tabs = await chrome.tabs.query({});
    openUrls = new Set(tabs.flatMap(t => [t.url, t.pendingUrl]).filter(Boolean));
  } catch (err) {
    console.debug('Failed to read open tabs:', err);
    openUrls = new Set();
  }
}

/** A note has a tab to switch to only while its address is open; otherwise Reopen tab opens a new one. */
const hasLiveTab = (tab) => openUrls.has(tab.url);

/** One note's card. `extras` (Closed today only) adds flags and a line saying when and why it closed. */
function cardHtml(tab, extras = null) {
  const q = state.query;
  const bullets = toSafeStringArray(tab.summary?.bullets);
  const tags = toSafeStringArray(tab.summary?.tags).map(t => t.replace(/^#/, ''));
  const star = starLabel(tab.isFavorite);
  const flags = (extras?.flags || '') + getStatusBadge(tab) + fadeChipHtml(tab, fadeSettings, state.sortBy);
  return `
    <article class="tab-card" data-id="${escapeHtml(tab.id)}" tabindex="-1" aria-label="${escapeHtml(tab.title)}">
      <div class="card-header">
        <div class="card-source">
          <img class="favicon" src="${escapeHtml(faviconUrl(tab.url))}" alt="">
          <span class="card-domain">${highlightSearch(tab.domain, q)}</span>
        </div>
        <span class="card-time" title="Saved ${escapeHtml(new Date(tab.capturedAt).toLocaleString())}">${tab.readingTimeMinutes || 1} min read · saved ${formatTimeAgo(tab.capturedAt)}${fadeDateHtml(tab, fadeSettings, state.sortBy)}</span>
        ${flags ? `<div class="card-flags">${flags}</div>` : ''}
      </div>
      ${extras?.line || ''}
      <h3 class="card-title"><button class="card-title-btn" type="button" title="${escapeHtml(tab.title)}" aria-label="Read note: ${escapeHtml(tab.title)}">${highlightSearch(tab.title, q)}</button></h3>
      ${tab.summary?.tldr ? `<div class="card-tldr">${highlightSearch(tab.summary.tldr, q)}</div>` : '<div class="card-tldr card-tldr-empty">No AI note for this tab</div>'}
      ${bullets.length ? `
        <button class="takeaways-toggle" type="button" aria-expanded="false"><span class="takeaways-chevron">▶</span> Key takeaways (${bullets.length})</button>
        <ul class="card-bullets collapsed">${bullets.map(b => `<li>${highlightSearch(b, q)}</li>`).join('')}</ul>` : ''}
      ${tags.length ? `<div class="card-tags">${tags.map(t => `<button type="button" class="card-tag" data-tag="${escapeHtml(t)}" title="Filter by #${escapeHtml(t)}">#${highlightSearch(t, q)}</button>`).join('')}</div>` : ''}
      <div class="card-footer">
        <button class="restore-btn">${ICONS.reopen} ${hasLiveTab(tab) ? 'Go to tab' : 'Reopen tab'}</button>
        <div class="card-actions">
          <button class="action-icon-btn star-btn${tab.isFavorite ? ' active' : ''}" title="${star}" aria-label="${star}">${ICONS.star}</button>
          <button class="action-icon-btn reader-btn" title="Read note" aria-label="Read note">${ICONS.reader}</button>
          <button class="action-icon-btn copy-btn" title="Copy note (Markdown)" aria-label="Copy note">${ICONS.copy}</button>
          <button class="action-icon-btn delete-btn" title="Delete note" aria-label="Delete note">${ICONS.trash}</button>
        </div>
      </div>
    </article>`;
}

async function onFeedClick(e) {
  if (e.target.closest('[data-action="search-all"]')) {
    await applyFilters({ view: '', time: '', tag: '', domain: '' }); // the query stays
    return;
  }
  const card = e.target.closest('.tab-card');
  const target = e.target.closest('button');
  const tab = card && tabsById.get(card.dataset.id);
  if (!tab || !target || card.classList.contains('removing')) return;

  if (target.matches('.restore-btn')) {
    await reopenTab(tab.url, tab.id);
  } else if (target.matches('.card-title-btn, .reader-btn')) {
    await openReader(tab);
  } else if (target.matches('.takeaways-toggle')) {
    const open = target.classList.toggle('open');
    target.setAttribute('aria-expanded', String(open));
    card.querySelector('.card-bullets')?.classList.toggle('collapsed', !open);
  } else if (target.matches('.star-btn')) {
    await toggleStar(tab, card);
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
    reopenFailedIds.delete(String(recordId));
    showToast(res.restoredInPlace ? 'Switched to that tab.' : 'Tab reopened.');
    await refresh(); // status, inbox/reopened membership and Closed today all changed
    if (res.removed) showRemovedOnReopenToast(recordId);
  } catch (err) {
    console.error('Error reopening tab:', err);
    showToast('Could not reopen that tab. Please try again.', true);
  }
}

async function toggleStar(tab, card) {
  const wasInInbox = isInInbox(tab);
  try {
    const updated = await toggleFavoriteTab(tab.id);
    tab.isFavorite = updated ? updated.isFavorite : !tab.isFavorite;
    if (updated) tab.filedAt = updated.filedAt;
  } catch (err) {
    console.error('Error toggling favorite:', err);
    showToast('Could not update the star', true);
    return;
  }
  const btn = card?.querySelector('.star-btn');
  if (btn) {
    btn.classList.toggle('active', tab.isFavorite);
    btn.title = starLabel(tab.isFavorite);
    btn.setAttribute('aria-label', btn.title);
  }
  const leftInbox = wasInInbox && !isInInbox(tab); // starring files a note; unstarring never puts it back
  showToast(tab.isFavorite ? `Starred. This note will not fade.${leftInbox ? ' It left your Inbox.' : ''}` : 'Unstarred');
  updateStats();
  // No card (the reader outlived it) in Starred means the note has to come back, or go, with the feed.
  if (state.time === 'favorites' && (!tab.isFavorite || !card)) {
    await renderFeed();
    return;
  }
  // Starred out of the Inbox: the card goes, and the selection stays at its place in the list.
  if (leftInbox && state.view === 'inbox') {
    await renderFeed(false, { keepIndex: true });
    return;
  }
  if (!card) return;
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
async function deleteCard(tab, card = null) {
  // Closed today's heading counts its notes, so a delete there redraws the section. Read before any
  // await: a refresh landing meanwhile replaces the card element.
  const fromClosedToday = Boolean(card?.closest('#closed-today'));
  // Animate synchronously for instant feedback, before the IndexedDB write lands.
  card?.classList.add('removing');
  clearSelection(); // before the write lands, so a fast second Delete cannot reach the next card
  try {
    await softDeleteTab(tab.id);
  } catch (err) {
    console.error('Error deleting tab:', err);
    card?.classList.remove('removing');
    showToast('Could not delete that note.', true);
    return;
  }
  setResultsCount(liveCards().length + closedTodayCappedOut);
  updateStats();
  renderSidebarFilters();
  setTimeout(() => {
    const stale = card && !card.isConnected; // a refresh drew the list again before the delete landed
    card?.remove();
    if (fromClosedToday || stale || !$('tabs-feed').querySelector('.tab-card')) renderFeed();
  }, 260);

  showUndoToast('Note deleted', tab.id, () => restoreDeletedTab(tab.id));
}

/**
 * Undo toast for a note removed because it was reopened (Remove Notes When Reopened). Undo restores it
 * the way it would have been with the setting off: back in the list, marked Reopened.
 */
function showRemovedOnReopenToast(recordIds, message = 'Note removed (reopened)') {
  const ids = [].concat(recordIds);
  showUndoToast(message, ids[0], async () => {
    let failed = 0;
    for (const id of ids) {
      try {
        const restored = await restoreDeletedTab(id);
        if (!restored || !await markReopened(id)) failed++;
      } catch (err) {
        console.error('Error restoring tab:', err);
        failed++;
      }
    }
    if (ids.length === 1) return failed === 0;
    return failed ? `Could not restore ${failed} of ${ids.length} notes. They may already be gone.` : true;
  }, ids.length === 1 ? 'Note restored' : 'Notes restored');
}

/**
 * 5-second toast whose Undo runs `restore`, then refreshes and highlights the returned card.
 * `restore` resolves truthy on success, falsy on failure, or a string to fail with that message.
 */
function showUndoToast(message, id, restore, restoredMessage = 'Note restored') {
  showToast(message, false, async () => {
    hideToast();
    let restoredOk = false;
    let failMessage = 'Could not restore that note. It may already be gone.';
    try {
      const result = await restore();
      restoredOk = Boolean(result) && typeof result !== 'string';
      if (typeof result === 'string') failMessage = result;
    } catch (err) {
      console.error('Error restoring tab:', err);
    }
    await refresh();
    const restored = cardById(id);
    if (restored) {
      restored.classList.add('undo-restored');
      restored.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => restored.classList.remove('undo-restored'), 1200);
    }
    if (restoredOk) showToast(restoredMessage);
    else showToast(failMessage, true);
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

/** Every card on screen, Closed today first, as one list for j/k and the card keys. */
function liveCards() {
  return Array.from(document.querySelectorAll('#closed-today-list .tab-card:not(.removing), #tabs-feed .tab-card:not(.removing)'));
}

/** Whether an element sits in one of the two card lists (Closed today or the feed). */
function inFeed(el) {
  return $('tabs-feed').contains(el) || $('closed-today-list').contains(el);
}

function cardById(id) {
  const sel = `.tab-card[data-id="${CSS.escape(String(id))}"]`;
  return document.querySelector(`#closed-today-list ${sel}, #tabs-feed ${sel}`);
}

function selectCard(index, { focus = true } = {}) {
  const cards = liveCards();
  if (cards.length === 0) {
    selectedId = null;
    return;
  }
  const selected = cards[Math.max(0, Math.min(index, cards.length - 1))];
  selectedId = selected.dataset.id;
  cards.forEach(card => card.classList.toggle('keyboard-selected', card === selected));
  selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // Real focus on the card so screen readers announce the selected note by its title.
  if (focus) selected.focus({ preventScroll: true });
}

/** The card a key acts on: the one holding focus (a Tab-ed to star button counts), else the j/k selection. */
function keyCard() {
  const focused = document.activeElement?.closest?.('.tab-card:not(.removing)');
  return (focused && inFeed(focused) ? focused : null) || liveCards().find(card => card.dataset.id === selectedId) || null;
}

function clearSelection() {
  selectedId = null;
  document.querySelectorAll('.tab-card.keyboard-selected').forEach(c => c.classList.remove('keyboard-selected'));
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
  // Reading files the note: it leaves the Inbox. In the Inbox view its card goes when the reader closes.
  if (isInInbox(tab)) {
    tab.filedAt = Date.now();
    readerFiled = state.view === 'inbox';
    readerFiling = markFiled(tab.id)
      .then(() => updateStats())
      .catch(err => console.error('Failed to file the note:', err));
  }
  const dialog = $('reader-dialog');
  $('modal-title').textContent = tab.title || 'Untitled tab';
  const link = $('modal-source-link');
  link.textContent = tab.domain || tab.url || ''; // the domain reads at any width; href and title keep the full address
  link.title = tab.url || '';
  if (/^https?:\/\//i.test(tab.url)) link.href = tab.url; // only http(s) links are clickable
  else link.removeAttribute('href');
  updateReaderActions();
  const bullets = toSafeStringArray(tab.summary?.bullets);
  $('modal-summary-box').innerHTML = (tab.summary?.tldr || bullets.length)
    ? (tab.summary?.tldr ? `<p>${escapeHtml(tab.summary.tldr)}</p>` : '') +
      (bullets.length ? `<ul class="modal-bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '')
    : '<p>No overview available</p>';
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
  const reopen = hasLiveTab(readerTab) ? 'Go to tab' : 'Reopen';
  $('modal-reopen-btn').querySelector('.btn-label').textContent = reopen;
  $('modal-reopen-btn').title = hasLiveTab(readerTab) ? 'Switch to this tab' : 'Reopen this tab';
  $('modal-reopen-btn').setAttribute('aria-label', reopen === 'Reopen' ? 'Reopen tab' : reopen);
  const star = starLabel(readerTab.isFavorite);
  const btn = $('modal-star-btn');
  btn.title = star;
  btn.setAttribute('aria-label', star);
  btn.querySelector('.btn-label').textContent = readerTab.isFavorite ? 'Unstar' : 'Star';
}

/**
 * Reader Reopen / Star / Delete reuse the card handlers, working from the note itself: the card
 * may be gone (a re-render after Unstar in Starred drops it) and its actions must still work.
 */
async function onReaderAction(action) {
  if (!readerTab) return;
  const tab = tabsById.get(String(readerTab.id)) || readerTab;
  const card = cardById(tab.id);
  if (card?.classList.contains('removing')) return;
  if (action === 'star') {
    await toggleStar(tab, card);
    readerTab.isFavorite = tab.isFavorite;
    updateReaderActions();
    return;
  }
  readerFiled = false; // reopen and delete update the feed themselves
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
    return '<p class="empty-article-text">Only the summary was kept for this page.</p>';
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
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
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
    btn.removeAttribute('aria-busy');
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
  $('closed-today-list').classList.toggle('compact', compact);
  const btn = $('density-toggle-btn');
  btn.classList.toggle('active', compact);
  btn.setAttribute('aria-pressed', String(compact));
  btn.title = compact ? 'Switch to comfortable view' : 'Switch to compact view';
}

async function checkPermissions() {
  try {
    permDismissed = Boolean((await chrome.storage.local.get(PERM_DISMISSED_KEY))[PERM_DISMISSED_KEY]);
  } catch (err) {
    console.debug('Failed to load permission note state:', err);
  }
  try {
    permMissing = !(await chrome.permissions.contains({ origins: ['<all_urls>'] }));
  } catch (err) {
    console.debug('Permission check error:', err);
  }
  syncPermBanner();
}

/**
 * The permission note is loud while the notebook is empty (nothing works without it), then a quiet
 * hairline note once any note exists, which the user can dismiss for good.
 */
function syncPermBanner() {
  if (noteTotal === null) return; // the note count decides loud or quiet; stay hidden until it is known
  const quiet = noteTotal > 0;
  const banner = $('perm-banner');
  banner.classList.toggle('quiet', quiet);
  $('perm-dismiss-btn').hidden = !quiet;
  banner.hidden = !permMissing || (quiet && permDismissed);
}

async function dismissPermBanner() {
  permDismissed = true;
  syncPermBanner();
  try {
    await chrome.storage.local.set({ [PERM_DISMISSED_KEY]: true });
  } catch (err) {
    console.debug('Failed to save permission note state:', err);
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
  // Top layer: re-showing moves it above any modal dialog that opened since.
  if (toast.matches(':popover-open')) toast.hidePopover();
  toast.showPopover();
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
  const toast = $('toast');
  toast.classList.add('hidden');
  toast.classList.remove('paused');
  // Let the fade-out finish before leaving the top layer.
  setTimeout(() => {
    if (toast.classList.contains('hidden') && toast.matches(':popover-open')) toast.hidePopover();
  }, 220);
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

  // Closed today's cards and the feed's are one list: same clicks, same focus model.
  for (const list of [feed, $('closed-today-list')]) {
    list.addEventListener('click', onFeedClick);
    // Focus moving into a card (Tab to its star button, a click) makes it the selected one.
    list.addEventListener('focusin', (e) => {
      const card = e.target.closest('.tab-card:not(.removing)');
      if (!card || card.dataset.id === selectedId) return;
      selectedId = card.dataset.id;
      liveCards().forEach(c => c.classList.toggle('keyboard-selected', c === card));
    });
  }
  const toastEl = $('toast');
  toastEl.addEventListener('mouseenter', () => setToastPaused(true));
  toastEl.addEventListener('mouseleave', () => setToastPaused(false));
  toastEl.addEventListener('focusin', () => setToastPaused(true));
  toastEl.addEventListener('focusout', () => setToastPaused(false));
  $('closed-today-reopen-all').addEventListener('click', onReopenAllClick);
  $('closed-today-confirm-yes').addEventListener('click', reopenAllClosedToday);
  $('closed-today-confirm-no').addEventListener('click', () => setReopenAllConfirm(0, { focus: true }));
  $('closed-today-confirm').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setReopenAllConfirm(0, { focus: true });
  });
  $('closed-today-toggle').addEventListener('click', () => {
    closedTodayExpanded = !closedTodayExpanded;
    $('closed-today-toggle').setAttribute('aria-expanded', String(closedTodayExpanded));
    $('closed-today-list').classList.toggle('lines', !closedTodayExpanded);
  });
  $('closed-today-more').addEventListener('click', () => {
    closedTodayShowAll = !closedTodayShowAll;
    renderFeed();
  });

  // Surface-specific actions
  $('archive-current-btn').addEventListener('click', (e) => archiveCurrentTab(e.currentTarget));
  $('open-full-btn').addEventListener('click', async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') });
    await closeSidePanel();
  });
  $('settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('perm-dismiss-btn').addEventListener('click', dismissPermBanner);
  $('enable-perm-btn').addEventListener('click', async () => {
    try {
      if (await chrome.permissions.request({ origins: ['<all_urls>'] })) {
        permMissing = false;
        syncPermBanner();
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
  dialog.addEventListener('close', async () => {
    if (!readerFiled) return;
    readerFiled = false;
    await readerFiling;
    await renderFeed(false, { keepIndex: true }); // the note left the Inbox; the selection keeps its place
  });
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
  const openLegend = () => {
    closeDrawer();
    $('shortcuts-fade-note').textContent = fadeExplanation(fadeSettings);
    legend.showModal();
  };
  $('shortcuts-btn').addEventListener('click', openLegend);
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
      if (inFeed(el)) el.blur(); // focus in a card would keep it the target of s / o / Delete
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
      openLegend();
      return;
    }
    if (typing || drawerOpen) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectCard(liveCards().indexOf(keyCard()) + 1);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectCard(liveCards().indexOf(keyCard()) - 1);
    } else if (e.key === 'Enter' && keyCard() && !el?.closest('button, a, summary')) {
      e.preventDefault();
      keyCard().querySelector('.restore-btn')?.click();
    } else if (Object.hasOwn(CARD_KEYS, e.key) && keyCard() && !e.ctrlKey && !e.metaKey && !e.altKey &&
        (!el || el === document.body || inFeed(el))) {
      // Act on the focused or selected card, but never on a key pressed in the sidebar or another control.
      const card = keyCard();
      const tab = card && tabsById.get(card.dataset.id);
      if (!tab) return;
      e.preventDefault();
      await CARD_KEYS[e.key](tab, card);
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
