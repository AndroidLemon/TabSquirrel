/**
 * Tab Squirrel - IndexedDB Storage & Local Settings Management
 */

// Storage depends on the closure policy, not the other way round: what counts as an AI
// summary is a closure rule, and it is enforced here only to stop a JSON import smuggling
// an unknown source past the AI-only close gate.
import { AI_SUMMARY_SOURCES } from '../shared/closure-policy.js';
import { getExpiry } from '../shared/fade.js';

const DB_NAME = 'TabSquirrelDB';
const DB_VERSION = 1;
const STORE_NAME = 'archived_tabs';
const TEXT_STORE = 'tab_text'; // { id, cleanText } kept apart so list/stat queries never deserialize page text
const MAX_TEXT_CHARS = 50000;
const DAY_MS = 24 * 60 * 60 * 1000;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // ponytail: no users yet, so no data migrations; write one when a schema change ships post-launch
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        db.createObjectStore(TEXT_STORE, { keyPath: 'id' });
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

/**
 * Validate that a URL strictly starts with http:// or https://
 */
function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Keep only the summary fields the UI renders, as strings (summaries come from LLMs / the page).
 */
function sanitizeSummary(summary) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const strings = (arr) => (Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []);
  return {
    tldr: typeof s.tldr === 'string' ? s.tldr : '',
    bullets: strings(s.bullets),
    tags: strings(s.tags).map(t => t.trim().replace(/^#+/, '')).filter(Boolean)
  };
}

/**
 * A ms timestamp if v is a positive finite number, else fallback (JSON import can hold anything).
 */
function timestamp(v, fallback) {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Local midnight `daysAgo` days back, in ms.
 */
function startOfDay(daysAgo = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

/**
 * Settle a transaction as a promise resolving to getResult() on commit.
 */
function onTxDone(tx, resolve, reject, getResult) {
  tx.oncomplete = () => resolve(getResult());
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
}

/**
 * Save an archived tab record into IndexedDB.
 * Dedupes on URL: an existing non-deleted record with the same URL is updated in place
 * (keeping its id, isFavorite and pinned).
 * @param {Object} tabData
 */
export async function saveArchivedTab(tabData) {
  const db = await getDB();

  // Scheme validation: strictly allow only http: and https: protocols
  const safeUrl = isValidHttpUrl(tabData.url) ? tabData.url.trim() : '';
  const safeFavicon = isValidHttpUrl(tabData.favIconUrl) ? tabData.favIconUrl.trim() : '';
  const cleanText = typeof tabData.cleanText === 'string' ? tabData.cleanText.slice(0, MAX_TEXT_CHARS) : '';

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TEXT_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let record = null;

    const write = (existing) => {
      record = {
        id: existing?.id || tabData.id || crypto.randomUUID(),
        url: safeUrl,
        // JSON import feeds arbitrary values here; the UI assumes these types
        title: (typeof tabData.title === 'string' && tabData.title) || 'Untitled Tab',
        domain: (typeof tabData.domain === 'string' && tabData.domain) || extractDomain(safeUrl),
        favIconUrl: safeFavicon,
        capturedAt: timestamp(tabData.capturedAt, Date.now()),
        lastActiveAt: timestamp(tabData.lastActiveAt, Date.now()),
        restoredAt: timestamp(tabData.restoredAt, undefined), // kept on JSON import; a recapture clears it
        // First read in the reader or first star: the note leaves the Inbox. Kept on JSON import;
        // a recapture clears it, like restoredAt, so a fresh capture lands in the Inbox again.
        filedAt: timestamp(tabData.filedAt, undefined),
        readingTimeMinutes: Math.max(1, Math.round(Number(tabData.readingTimeMinutes)) || 1),
        summary: sanitizeSummary(tabData.summary),
        // Unknown values (JSON import) must not pass the AI-only close gate
        summarySource: AI_SUMMARY_SOURCES.has(tabData.summarySource) ? tabData.summarySource : 'heuristic',
        closedAt: timestamp(tabData.closedAt, null), // set only while Tab Squirrel's closure of the tab stands
        // When Tab Squirrel last closed it; survives a reopen, so "Closed today" keeps its record
        // A recapture that carries neither field (the sweep suspending a reopened tab) keeps the old value
        lastClosedAt: timestamp(tabData.lastClosedAt ?? tabData.closedAt ?? existing?.lastClosedAt, null),
        wordCount: tabData.wordCount || 0,
        // 'discarded' (suspended) | 'archived' (closed) | 'restored' (reopened) |
        // 'captured' (summary saved, tab still open: manual archive or Chrome refused to close/suspend)
        status: tabData.status || 'archived',
        closureTier: tabData.closureTier || 'suspend_only',
        closureReason: tabData.closureReason || '',
        isFavorite: Boolean(tabData.isFavorite ?? existing?.isFavorite),
        pinned: Boolean(tabData.pinned ?? existing?.pinned),
        meta: tabData.meta || {}
      };
      store.put(record);
      tx.objectStore(TEXT_STORE).put({ id: record.id, cleanText });
    };

    const writeDedupedByUrl = () => {
      if (!safeUrl) return write(null); // never dedupe records without a URL together
      const req = store.index('url').getAll(safeUrl);
      req.onsuccess = () => write(req.result.find(r => !r.deletedAt));
    };

    if (tabData.id) {
      // An unknown id (e.g. JSON import) still dedupes on URL
      const req = store.get(tabData.id);
      req.onsuccess = () => (req.result ? write(req.result) : writeDedupedByUrl());
    } else {
      writeDedupedByUrl();
    }

    onTxDone(tx, resolve, reject, () => record);
  });
}

/**
 * The Inbox holds notes nobody has acted on yet: a note leaves it when it is reopened (restoredAt)
 * or filed (filedAt: read in the reader, or starred). Unstarring does not bring it back.
 */
export function isInInbox(record) {
  return !record.restoredAt && !record.filedAt;
}

/**
 * Query archived tabs with keyword search and filters.
 * Records come back without cleanText unless `includeText: true`; soft-deleted records
 * are always hidden.
 */
export async function getArchivedTabs(filters = {}) {
  const db = await getDB();
  const {
    query = '',
    tag = '',
    domain = '',
    timeRange = '',
    status = '',
    favoriteOnly = false,
    closedSince = 0, // only records Tab Squirrel last closed at/after this time (reopened ones included)
    view = '', // 'inbox' (see isInInbox) | 'reopened' | '' (all)
    includeText = false,
    sortBy = 'newest', // 'newest' | 'oldest' | 'reading-time-asc' | 'reading-time-desc' | 'title-asc' | 'domain' | 'expiring-soon'
    limit = 100,
    // Required by sortBy 'expiring-soon'. Passed in rather than read here, so this query
    // has no hidden dependency on settings.
    fadeSettings = null
  } = filters;

  const normalizedQuery = query.toLowerCase().trim();
  const needsText = Boolean(normalizedQuery) || includeText;
  const todayStart = startOfDay(0);
  const yesterdayStart = startOfDay(1);
  const weekAgo = Date.now() - 7 * DAY_MS;

  const passesFilters = (item) => {
    if (item.deletedAt) return false;
    if (favoriteOnly && !item.isFavorite) return false;
    if (status && item.status !== status) return false;
    if (closedSince && !(item.lastClosedAt >= closedSince)) return false;
    if (view === 'inbox' && !isInInbox(item)) return false;
    if (view === 'reopened' && !item.restoredAt) return false;
    if (domain && item.domain !== domain) return false;
    if (tag && !(item.summary?.tags || []).some(t => t.toLowerCase() === tag.toLowerCase())) return false;
    if (timeRange === 'today' && item.capturedAt < todayStart) return false;
    if (timeRange === 'yesterday' && (item.capturedAt < yesterdayStart || item.capturedAt >= todayStart)) return false;
    if (timeRange === 'week' && item.capturedAt < weekAgo) return false;
    return true;
  };

  const metaMatches = (item) =>
    item.title?.toLowerCase().includes(normalizedQuery) ||
    item.url?.toLowerCase().includes(normalizedQuery) ||
    item.summary?.tldr?.toLowerCase().includes(normalizedQuery) ||
    (item.summary?.bullets || []).some(b => b.toLowerCase().includes(normalizedQuery)) ||
    (item.summary?.tags || []).some(t => t.toLowerCase().includes(normalizedQuery));

  // 'newest'/'oldest' are absent: those are served by the capturedAt index cursor direction.
  const SORTS = {
    'reading-time-asc': (a, b) => (a.readingTimeMinutes || 1) - (b.readingTimeMinutes || 1),
    'reading-time-desc': (a, b) => (b.readingTimeMinutes || 1) - (a.readingTimeMinutes || 1),
    'title-asc': (a, b) => (a.title || '').localeCompare(b.title || ''),
    domain: (a, b) => (a.domain || '').localeCompare(b.domain || ''),
    'expiring-soon': (a, b) => {
      const x = getExpiry(a, fadeSettings) ?? Infinity; // never-fading notes last
      const y = getExpiry(b, fadeSettings) ?? Infinity;
      return x === y ? 0 : x - y; // Infinity - Infinity is NaN
    }
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(needsText ? [STORE_NAME, TEXT_STORE] : STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // Use native index cursor direction for temporal sorting
    const isCustomSort = Object.hasOwn(SORTS, sortBy);
    const direction = sortBy === 'oldest' ? 'next' : 'prev';
    const request = store.index('capturedAt').openCursor(null, direction);

    const matches = [];
    let results = [];

    const finish = () => {
      results = matches;
      if (isCustomSort) {
        matches.sort(SORTS[sortBy]);
        results = matches.slice(0, limit);
      }
      if (includeText) {
        const textStore = tx.objectStore(TEXT_STORE);
        for (const item of results) {
          const req = textStore.get(item.id);
          req.onsuccess = () => { item.cleanText = req.result?.cleanText || ''; };
        }
      }
    };

    const take = (item, cursor) => {
      matches.push(item);
      // Index-ordered queries stream and stop early once the page is full
      if (!isCustomSort && matches.length >= limit) {
        finish();
        return;
      }
      cursor.continue();
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        finish();
        return;
      }
      const item = cursor.value;
      if (!passesFilters(item)) {
        cursor.continue();
        return;
      }
      if (!normalizedQuery || metaMatches(item)) {
        take(item, cursor);
        return;
      }
      // Fall back to the page text only when metadata didn't match
      const textReq = tx.objectStore(TEXT_STORE).get(item.id);
      textReq.onsuccess = () => {
        if (textReq.result?.cleanText?.toLowerCase().includes(normalizedQuery)) {
          take(item, cursor);
        } else {
          cursor.continue();
        }
      };
    };

    onTxDone(tx, resolve, reject, () => results);
  });
}

export async function getTabById(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TEXT_STORE], 'readonly');
    const recordReq = tx.objectStore(STORE_NAME).get(id);
    const textReq = tx.objectStore(TEXT_STORE).get(id);
    onTxDone(tx, resolve, reject, () => (
      recordReq.result ? { ...recordReq.result, cleanText: textReq.result?.cleanText || '' } : null
    ));
  });
}

/**
 * Read-modify-write one record. Resolves the updated record or null if missing.
 */
async function updateRecord(id, mutate) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let record = null;
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      record = req.result;
      mutate(record);
      store.put(record);
    };
    onTxDone(tx, resolve, reject, () => record);
  });
}

/**
 * Record lifecycle.
 *
 * `status`, `closedAt`, `lastClosedAt` and `restoredAt` are one state machine with one invariant, so nothing
 * outside this block writes them except `saveArchivedTab`, which sets them directly for JSON
 * import: callers name the transition that happened and the timestamps are derived here. The
 * states:
 *
 *   captured   summary saved, tab still fully open (manual archive, or Chrome refused)
 *   discarded  tab suspended by Tab Squirrel, still in the tab strip
 *   archived   the tab is gone. `closedAt` is set only when Tab Squirrel itself closed it
 *   restored   the user reopened it. `closedAt` clears, but `lastClosedAt` stays: "Closed today"
 *              counts every note whose last closure was today and marks the reopened ones
 *
 * `lastClosedAt` is cleared only when a closure turns out not to hold (Chrome refused to close or
 * suspend the tab: markLeftOpen, markStaysSuspended). A recapture of the same URL that carries
 * neither `lastClosedAt` nor `closedAt` (e.g. the sweep suspending a reopened tab) keeps it; one
 * that carries `closedAt` replaces it. A row whose note is no longer closed shows as Reopened.
 */

/**
 * Tab Squirrel closed the tab itself. Feeds "Closed today". `closedFrom: 'suspended'` records
 * that the tab had been suspended first (hybrid mode), which "Closed today" explains to the user.
 */
export async function markClosedByTabSquirrel(id, { closedFrom } = {}) {
  return updateRecord(id, (record) => {
    record.status = 'archived';
    record.closedAt = record.lastClosedAt = Date.now();
    if (closedFrom) record.closedFrom = closedFrom;
  });
}

/** The tab is gone but Tab Squirrel did not close it, so it must not count as closed today. */
export async function markTabGone(id) {
  return updateRecord(id, (record) => {
    record.status = 'archived';
  });
}

/** The user reopened the tab. */
export async function markReopened(id) {
  return updateRecord(id, (record) => {
    record.status = 'restored';
    record.restoredAt = Date.now();
    record.closedAt = null;
  });
}

/** The user read the note in the reader: it leaves the Inbox. The first read is kept. */
export async function markFiled(id) {
  return updateRecord(id, (record) => {
    if (!record.filedAt) record.filedAt = Date.now();
  });
}

/** Chrome refused to close or suspend the tab, so it is still fully open. */
export async function markLeftOpen(id, reason) {
  return updateRecord(id, (record) => {
    record.status = 'captured';
    record.closedAt = record.lastClosedAt = null;
    if (reason) record.closureReason = reason;
  });
}

/** Chrome refused to close a tab Tab Squirrel had suspended, so it stays suspended. */
export async function markStaysSuspended(id, reason) {
  return updateRecord(id, (record) => {
    record.status = 'discarded';
    record.closedAt = record.lastClosedAt = null;
    if (reason) record.closureReason = reason;
  });
}

const CAPTURE_STATUS = { closed: 'archived', suspended: 'discarded', 'left-open': 'captured' };

/**
 * Save a freshly captured tab. The disposition decides `status` and `closedAt` together, so a
 * caller cannot pair them wrongly. `saveArchivedTab` still takes a raw record because JSON
 * import has to be able to restore any state from a backup.
 */
export async function recordCapture(payload, disposition) {
  const status = CAPTURE_STATUS[disposition];
  if (!status) throw new Error(`recordCapture: unknown disposition '${disposition}'`);
  return saveArchivedTab({
    ...payload,
    status,
    closedAt: disposition === 'closed' ? Date.now() : null
  });
}

/**
 * Soft-delete (tombstone) a tab. Hidden from queries until restored or purged.
 */
export async function softDeleteTab(id) {
  return updateRecord(id, (record) => {
    record.deletedAt = Date.now();
  });
}

export async function restoreDeletedTab(id) {
  return updateRecord(id, (record) => {
    delete record.deletedAt;
  });
}

/**
 * Tombstone notes past their fade date. Skips keepIds (records of tabs Tab Squirrel suspended that
 * are still open): hybrid mode's second tier needs that record to close the tab.
 */
export async function fadeExpiredTabs(settings, keepIds = new Set()) {
  const db = await getDB();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    let fadedCount = 0;
    tx.objectStore(STORE_NAME).openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const expiry = getExpiry(cursor.value, settings);
      // Tombstone, never hard-delete: purgeDeletedTabs clears it an hour later, so a faded
      // note is restorable in between. Already-tombstoned records are left to that purge.
      if (expiry !== null && expiry <= now && !keepIds.has(cursor.key) && !cursor.value.deletedAt) {
        cursor.update({ ...cursor.value, deletedAt: now });
        fadedCount++;
      }
      cursor.continue();
    };
    onTxDone(tx, resolve, reject, () => ({ fadedCount }));
  });
}

/**
 * Hard-delete tombstones older than the cutoff.
 */
export async function purgeDeletedTabs(olderThanMs = 60 * 60 * 1000) {
  const db = await getDB();
  const cutoff = Date.now() - olderThanMs;
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TEXT_STORE], 'readwrite');
    const textStore = tx.objectStore(TEXT_STORE);
    let purgedCount = 0;
    tx.objectStore(STORE_NAME).openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const item = cursor.value;
      if (item.deletedAt && item.deletedAt <= cutoff) {
        cursor.delete();
        textStore.delete(item.id);
        purgedCount++;
      }
      cursor.continue();
    };
    onTxDone(tx, resolve, reject, () => ({ purgedCount }));
  });
}

/**
 * Facet counts over the archive: `[{ [key]: value, count }]`, most frequent first.
 * `valuesOf` returns the values one tab contributes.
 */
async function countBy(valuesOf, key) {
  const tabs = await getArchivedTabs({ limit: 1000 });
  const counts = {};
  for (const tab of tabs) {
    for (const value of valuesOf(tab)) counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ [key]: value, count }))
    .sort((a, b) => b.count - a.count);
}

export function getAllTags() {
  return countBy(tab => (tab.summary?.tags || []).map(t => t.trim().replace(/^#/, '')).filter(Boolean), 'tag');
}

export function getAllDomains() {
  return countBy(tab => (tab.domain ? [tab.domain] : []), 'domain');
}

/**
 * Get dashboard stats (excluding soft-deleted tabs).
 * "today" means since local midnight.
 */
export async function getStats() {
  const tabs = await getArchivedTabs({ limit: Infinity });
  const todayStart = startOfDay(0);
  return {
    total: tabs.length,
    today: tabs.filter(t => t.capturedAt >= todayStart).length,
    favorites: tabs.filter(t => t.isFavorite).length,
    inbox: tabs.filter(isInInbox).length, // same rule as getArchivedTabs' 'inbox' view
    reopened: tabs.filter(t => t.restoredAt).length,
    totalReadingMinutes: tabs.reduce((acc, t) => acc + (t.readingTimeMinutes || 2), 0)
  };
}

/**
 * Settings Management using chrome.storage.local
 */
export const DEFAULT_SETTINGS = {
  timeoutMinutes: 60,
  archiveMode: 'hybrid', // 'hybrid' (smart adaptive) | 'discard' (soft suspension) | 'close' (auto-close)
  ignorePinnedTabs: true, // Never archive or suspend pinned tabs unless explicitly allowed
  aiProvider: 'auto',     // 'auto' | 'prompt-api' | 'heuristic' | 'gemini-api' | 'openai-compatible'
  geminiApiKey: '',
  openaiBaseUrl: 'http://localhost:11434/v1', // any OpenAI-compatible server; Ollama's default shown
  openaiModel: '',
  openaiApiKey: '', // optional; most local servers ignore it
  excludedDomains: [
    'mail.google.com',
    'docs.google.com',
    'drive.google.com',
    'calendar.google.com',
    'github.com',
    'gitlab.com',
    'slack.com',
    'teams.microsoft.com',
    'youtube.com',
    'spotify.com',
    'netflix.com'
  ],
  alwaysCloseDomains: [],
  closeRequiresAiSummary: true, // without an AI-written summary, suspend instead of closing
  fadeUnopenedDays: 30, // unstarred, never-reopened notes are deleted this long after capture (0 = never)
  fadeReopenedDays: 7, // unstarred reopened notes are deleted this long after the last reopen (0 = never)
  removeOnReopen: false // true: reopening a note removes it from the list (soft-deleted) instead of moving it to Reopened
};

export async function getSettings() {
  const res = await chrome.storage.local.get('tab_squirrel_settings');
  return Object.assign({}, DEFAULT_SETTINGS, res.tab_squirrel_settings || {});
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const updated = Object.assign({}, current, settings);
  await chrome.storage.local.set({ tab_squirrel_settings: updated });
  return updated;
}

// Put domain on one list and take it off the other; the two are mutually exclusive.
// ponytail: read-modify-write like saveSettings; two writers inside one storage round trip would need a queue.
export async function setDomainList(domain, listKey) {
  const other = listKey === 'excludedDomains' ? 'alwaysCloseDomains' : 'excludedDomains';
  const s = await getSettings();
  return saveSettings({
    [listKey]: [...new Set([...(s[listKey] || []), domain])],
    [other]: (s[other] || []).filter((d) => d !== domain)
  });
}

export function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Starring also files the note (it leaves the Inbox); unstarring leaves filedAt alone. */
export async function toggleFavoriteTab(id) {
  return updateRecord(id, (record) => {
    record.isFavorite = !record.isFavorite;
    if (record.isFavorite && !record.filedAt) record.filedAt = Date.now();
  });
}

export async function getStorageEstimate() {
  const db = await getDB();
  const encoder = new TextEncoder();
  const sizeOf = (value) => encoder.encode(JSON.stringify(value)).length;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TEXT_STORE], 'readonly');
    const liveIds = new Set();
    let byteEstimate = 0;

    tx.objectStore(STORE_NAME).openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        if (!item.deletedAt) {
          liveIds.add(item.id);
          byteEstimate += sizeOf(item);
        }
        cursor.continue();
        return;
      }
      tx.objectStore(TEXT_STORE).openCursor().onsuccess = (textEvent) => {
        const textCursor = textEvent.target.result;
        if (!textCursor) return;
        if (liveIds.has(textCursor.key)) {
          byteEstimate += sizeOf(textCursor.value);
        }
        textCursor.continue();
      };
    };

    onTxDone(tx, resolve, reject, () => ({ itemCount: liveIds.size, byteEstimate }));
  });
}

export async function clearAllHistory() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, TEXT_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(TEXT_STORE).clear();
    onTxDone(tx, resolve, reject, () => true);
  });
}

