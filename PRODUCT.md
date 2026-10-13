# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Knowledge workers who hoard tabs: researchers, developers, students and writers who open dozens of tabs "to read later" in long desktop Chrome sessions. Each open tab is a thought they haven't finished, so closing one feels like losing it, and the tab strip fills with favicon slivers. Their job is to get the tab strip back without giving up what those tabs held.

## Product Purpose

A Chrome extension that watches background tabs. When a tab has sat untouched past a threshold (default 60 minutes, not counting idle or locked time), it extracts the article, summarizes it (a TL;DR, 3–5 takeaways and tags), saves that to a searchable local notebook, and then closes or suspends the tab. Anything it closes reopens in one click.

Success: the user lets tabs go without anxiety, because the gist is reliably kept, and the notebook gets used to find and reopen things rather than becoming a second hoard.

## Positioning

Tab suspenders free memory but leave the clutter and keep no record. Read-later apps need the user to act on every page. Tab Squirrel closes tabs for the user and keeps a summary of each one, so closing stops being a loss. Automatic closing is the core of the product, not an optional extra. Work on it should make closing more trustworthy (summary-quality gates, safety checks, reversibility), not make it rarer.

## Operating Context

- Lives in desktop Chrome (minimum version 141, Manifest V3). The notebook is one page that runs in the side panel (narrow, single column) and as a full tab (sidebar plus grid). Options open in their own tab.
- Shortcuts: Cmd/Ctrl+Shift+S opens the panel and Cmd/Ctrl+Shift+E archives the active tab. In the notebook: j/k or the arrow keys move between cards, Enter reopens, `/` searches, the first Escape leaves search and keeps the query, a second clears it, and Escape closes dialogs. `?` lists shortcuts.
- Note lifecycle: notes start in the Inbox, then Reopened, and fade unless starred (30 days if never reopened, 7 days after the last reopen; both configurable, 0 means never). Closed tabs collect in a "Closed today" list. There are no per-tab notifications.
- Exports to Obsidian (zip of .md files), Markdown and JSON. JSON can be re-imported.

## Capabilities and Constraints

- Archival modes: Smart Hybrid (the default: closes plain reading pages, suspends interactive ones, and closes suspended tabs at twice the threshold), Soft Suspend All, and Auto-Close All.
- Safety: tabs with unsaved input, rich-text editors, audio, pinned tabs or whitelisted domains are never closed. Trusted domains may be closed even where a check would only suspend them. Everything is re-checked at the last moment before acting.
- By default a tab is closed only when an AI tier wrote its summary. With only the heuristic fallback available, it is suspended instead.
- Summarizer tiers: offline heuristic, Chrome's on-device Prompt API, Gemini with the user's own key, or any OpenAI-compatible local server.
- Local-first: data stays in IndexedDB and chrome.storage. Nothing leaves the machine unless the user configures a cloud or remote summarizer (see PRIVACY.md).
- Plain JS, HTML and CSS with no framework and no build step for the extension itself.
- Terminology: note, Inbox, Reopened, Sleeping (suspended), Saved (summary kept, tab still open), Closed (tab closed, note kept), fade, star.

## Brand Commitments

- Name: **Tab Squirrel** (committed 2026-10-12). The rename landed 2026-10-13, including the GitHub repository (AndroidLemon/TabSquirrel). Icon: an acorn whose cap is a browser-tab shape (src/assets/icons/icon.svg).
- Icon: an acorn whose cap is a browser-tab shape. This is provisional, not final.
- Voice: plain, specific and honest about limits. For example, the README says "No heuristic is infallible", and the UI says there is no Undo when there isn't one.

## Evidence on Hand

- README.md, PRIVACY.md and docs/CHROMEWEBSTORE.md hold the current product copy, under the legacy name.
- Store screenshots and GIFs from PR #10 are out of date once the rename and re-theme land.
- There are no users, testimonials, reviews, usage numbers or store listing yet. Do not invent any.

## Product Principles

1. Closing must be safe to trust. Never lose user input or a tab's gist, and when in doubt, suspend rather than close.
2. Every action can be undone or recovered. Where it can't, say so plainly.
3. Local-first and private by default. Anything sent to the cloud is opt-in and stated.
4. The notebook should stay small. Fading and a short Inbox keep the archive from becoming a second hoard.
5. Stay quiet. Work in the background with no per-tab notifications, and show results where the user is already looking.

## Accessibility & Inclusion

WCAG 2.2 AA: AA contrast in both light and dark, full keyboard operation of the notebook and options (keeping the existing shortcuts), visible focus, and `prefers-reduced-motion` respected.
