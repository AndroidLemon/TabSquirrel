/**
 * Tab Squirrel - Shared HTML helpers for extension pages (side panel, wiki, options).
 */

import { fadeChipLabel, fadeDateLabel, FADE_DATE_DAYS } from './fade.js';

/** "Fading soon" chip, or nothing when this note should not show one. */
export function fadeChipHtml(tab, settings, sortBy) {
  const label = fadeChipLabel(tab, settings, sortBy);
  return label ? `<span class="fade-chip">${label}</span>` : '';
}

/** Quiet "fades Oct 30" text; nothing for starred notes, when the "Fading soon" chip already says it, or beyond FADE_DATE_DAYS. */
export function fadeDateHtml(tab, settings, sortBy) {
  if (fadeChipLabel(tab, settings, sortBy)) return '';
  const label = fadeDateLabel(tab, settings, Date.now(), FADE_DATE_DAYS);
  return label ? `<span class="fade-date"> · ${label}</span>` : '';
}

/** True when the offline heuristic wrote this note's summary rather than an AI model. */
export const isOfflineSummary = (tab) => tab?.summarySource === 'heuristic';

/** Quiet "offline summary" text for a card's meta line; nothing for AI-written summaries. */
export function offlineSummaryHtml(tab) {
  return isOfflineSummary(tab) ? '<span class="offline-summary"> · offline summary</span>' : '';
}

// Tooltip text per internal closure reason. The reason strings are written by closure-policy.js and
// service-worker.js and compared elsewhere, so they stay as they are; this is only how they read.
const SLEEP_REASONS = {
  'Contains form or interactive input controls': 'Put to sleep: the page has a form or app controls.',
  'Stateful URL path or client-side hash route': 'Put to sleep: the address looks like an app page, such as a checkout or editor.',
  'Complex search/filter query state': 'Put to sleep: the address holds a search or filter.',
  'Media-dominated page with little prose': 'Put to sleep: mostly video or images, little text.',
  'Short or low-confidence content': 'Put to sleep: too little text to summarize with confidence.',
  'Suspended instead of closed: no AI summary available': 'Put to sleep, not closed: only the offline summary was available.',
  'Chrome refused to close this tab; it stays suspended': 'Chrome wouldn\'t close this tab, so it stays asleep.',
  // A reading page only sleeps when the mode is Sleep only (discard); any other cause rewrites the reason.
  'Pure stateless reading article': 'Put to sleep: Sleep only mode was on.'
};
const SAVED_REASONS = {
  'You switched to this tab while it was being archived; summary saved, tab left open': 'You came back to this tab while its note was being written, so it stayed open.',
  'Chrome refused to close this tab; summary saved, tab left open': 'Chrome wouldn\'t close this tab. Its note is saved and the tab is still open.',
  'Chrome refused to suspend this tab; summary saved, tab left open': 'Chrome wouldn\'t put this tab to sleep. Its note is saved and the tab is still open.',
  'Saved manually; tab left open': 'You saved this tab. It stays open.'
};
const CLOSED_REASONS = {
  'Pure stateless reading article': 'A reading page, so it was closed.',
  'Closed: trusted domain': 'On your always-close list, so it was closed.'
};
const REASON_FALLBACKS = {
  discarded: 'Asleep in the tab strip to save memory',
  restored: 'You reopened this tab',
  captured: 'Its note is saved and the tab is still open.'
};

/**
 * Plain tooltip for a record's status badge, from the record's status and its internal closureReason.
 * A reopened record always gets its own text: its closureReason describes the earlier closure.
 * An unknown reason falls back to a generic line rather than showing internal wording.
 */
export function reasonLabel(record) {
  const { status, closureReason } = record || {};
  if (status === 'restored') return REASON_FALLBACKS.restored;
  const byStatus = status === 'discarded' ? SLEEP_REASONS : status === 'captured' ? SAVED_REASONS : CLOSED_REASONS;
  return byStatus[closureReason] || REASON_FALLBACKS[status] || '';
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// String-based on purpose: the textContent->innerHTML trick does not escape quotes,
// which matters because we interpolate page-controlled titles into attributes.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/**
 * Escapes text and wraps case-insensitive matches of query in <mark class="search-highlight">.
 */
export function highlightSearch(text, query) {
  if (text === null || text === undefined || text === '') return '';
  if (!query || typeof query !== 'string' || !query.trim()) return escapeHtml(text);
  const trimmed = query.trim();
  const regex = new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).split(regex).map(part =>
    part.toLowerCase() === trimmed.toLowerCase()
      ? `<mark class="search-highlight">${escapeHtml(part)}</mark>`
      : escapeHtml(part)
  ).join('');
}

/**
 * Favicon served from Chrome's local favicon cache (requires the "favicon" permission).
 * No network request to the site or to a third-party favicon service.
 */
export function faviconUrl(pageUrl, size = 32) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl || '')}&size=${size}`);
}
