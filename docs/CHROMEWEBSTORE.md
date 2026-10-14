# Chrome Web Store Listing: Tab Squirrel

**Last Updated**: 2026-10-13  
**Extension Name**: Tab Squirrel: Close idle tabs, keep the gist  
**Version**: 1.0.0  
**Category**: Productivity / Tools  
**Minimum Chrome**: 141 (side panel close API; the on-device model needs a recent Chrome too)  
**Homepage**: https://github.com/AndroidLemon/TabSquirrel  

Everything the dashboard asks for, in the order it asks. Sections 2 and 3 are
pasted verbatim into the permission-justification and privacy-practices tabs.

---

## 1. Store Listing Copy

### Short Description (max 132 chars)
Closes tabs you leave idle and keeps a short summary of each, so you can let them go. Reopen any tab in one click.

### Detailed Description
**Close the tabs you were never going to read, and keep what was in them.**

We open dozens of tabs intending to read them, but the tab bar quickly becomes a burden. Closing a tab feels like deleting a thought, so we hoard them. Tab suspenders free the memory but leave the clutter, and neither they nor Chrome's memory saver keep any record of what you had open.

**Tab Squirrel** watches your background tabs. When one has sat untouched for an hour, it reads the article, writes a short summary, saves it to a searchable notebook in your browser, and then closes the tab or puts it to sleep. Anything it closes can be reopened with one click.

### Key Features
- **Real inactivity, not wall-clock time**: time you spend idle, locked, or asleep does not count toward the threshold.
- **Safety checks before touching anything**: unsaved form input, rich text editors (Google Docs, Notion-style editors, VS Code Web), playing audio or video, and pinned tabs are all left alone. A default never-touch list protects Gmail, Google Docs, GitHub, Slack, YouTube and similar sites, and you can add your own from Settings or by right-clicking a tab.
- **Close or sleep**: plain reading pages are closed once summarized; interactive pages are put to sleep in place to free memory and closed later if you still have not returned. By default a tab is closed only when an AI model wrote its summary; otherwise it is put to sleep, so it stays in the tab strip. Sleep only and Close all modes are also available.
- **Summaries on your terms**: a one-sentence TL;DR, three to five bullet takeaways, and topic tags. Written by Chrome's built-in on-device model when it is available, or by a local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) or Gemini with your own key. With none of those, an offline heuristic still saves the opening of the article, but by default the tab is then put to sleep rather than closed.
- **A notebook, not a list**: full-text search across titles, summaries, tags and saved page text; filters by tag, domain, starred and date; an Inbox for captures you have not dealt with yet; a reader view of the saved text. Available as a side panel or a full page.
- **Closed today**: today's closed tabs head the notebook, each once, with Reopen all. No per-tab notifications.
- **Notes that fade**: unstarred notes delete themselves after 30 days (7 days after a reopen). Star anything to keep it. Both timers are configurable.
- **Light and dark themes**: follow your system, or pick one.
- **Export**: Markdown, an Obsidian vault `.zip` with frontmatter, or a full JSON backup that can be re-imported.
- **Keyboard first**: `Ctrl/Cmd+Shift+S` opens the side panel, `Ctrl/Cmd+Shift+E` summarizes the current tab, and `j`/`k`/`Enter`/`/` navigate the notebook. `o` reads, `s` stars, `u` undoes, and `?` lists them all.
- **Local by default**: with the default provider, Tab Squirrel makes no network requests at all. Nothing is synced or sent anywhere unless you configure a summarizer.

### Single Purpose
Tab Squirrel closes inactive browser tabs or puts them to sleep. Before it does either, it summarizes the tab and saves the summary locally as a note. Every permission below serves that one purpose.

---

## 2. Permissions Justification

One entry per dashboard text box.

| Permission | Technical Need | Plain-English Reason for Store Review |
| :--- | :--- | :--- |
| `tabs` | `chrome.tabs.query`, `chrome.tabs.discard`, `chrome.tabs.remove`, `chrome.tabs.create`, `chrome.tabs.update` | Needed to detect inactive tabs, read tab URLs and titles for summarization, put eligible tabs to sleep or close them, and reopen or switch to a tab from the notebook. |
| `storage` | `chrome.storage.local`, `chrome.storage.session` | Needed to store user preferences (thresholds, domain lists, provider settings) and ephemeral per-tab activity timestamps. |
| `alarms` | `chrome.alarms.create` | Needed to schedule periodic inactivity sweeps without keeping the background service worker constantly awake. |
| `idle` | `chrome.idle.queryState` | Needed so that time away from the computer does not count toward a tab's inactivity, and tabs are never closed or put to sleep while the user is away. |
| `scripting` | `chrome.scripting.executeScript` | Needed to inject the article extractor into an eligible background tab to read its text and check for unsaved input before the tab is closed or put to sleep. |
| `sidePanel` | `chrome.sidePanel` | Needed to show the notebook alongside browsing and to close the panel when the user opens the full-page view. |
| `unlimitedStorage` | IndexedDB persistent quota | Needed to keep saved page text and summaries in the user's browser without quota eviction. |
| `notifications` | `chrome.notifications.create` | Needed for confirmations that otherwise give no feedback: a manual save triggered by the keyboard shortcut (including when it fails), and adding a site to a domain list from the tab context menu. Automatic closing never notifies. |
| `favicon` | The extension's `_favicon` API | Needed to show site icons in the notebook from Chrome's local favicon cache, with no request to the site or to any third-party favicon service. |
| `contextMenus` | `chrome.contextMenus.create` on the tab strip | Needed for the right-click menu on a tab that adds its site to "Never touch this site" or "Always close this site" without opening Options. |
| `optional_host_permissions: ["<all_urls>"]` | `chrome.permissions.request` | Requested with a click during onboarding, not at install. Needed to read article text from whichever site an inactive tab happens to be on; the extension cannot know in advance which sites the user will leave open. A user-configured local summarization server's origin is requested the same way. |

---

## 3. Privacy Practices

### Single purpose
See section 1.

### Data collected
For the dashboard's data-use checkboxes:

- **Website content**: article text is read from eligible tabs to summarize it. Stored locally.
- **Web history**: the URL, title and capture time of each tab Tab Squirrel saves as a note are stored locally so the tab can be reopened and the notebook searched.
- **Nothing else.** No personal identifiers, health, financial, authentication, personal communication, location, or user-activity data.

### Certifications
- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending.

### Disclosure text
- **Host permissions**: Tab Squirrel requests `<all_urls>` as an optional permission during onboarding so it can extract article text from tabs eligible to be closed or put to sleep. Until granted, Tab Squirrel leaves tabs on that site alone.
- **Favicons**: site icons come from Chrome's local favicon cache via the `favicon` permission, never from the live site or a third-party favicon service. No extra request, no leak.
- **Storage**: content parsing, summarization by the default provider, and storage all happen on the user's device, in the browser's IndexedDB and `chrome.storage.local`. Nothing is synced.
- **Network**: with the default provider, Tab Squirrel makes no network requests. The only exceptions are summarization providers the user configures:
  - **Google Gemini** with the user's own API key: the extracted text of a tab is sent to Google's Gemini API. Governed by Google's terms for that key.
  - **An OpenAI-compatible server** at a user-supplied URL, typically a local model on the user's own machine: the extracted text is sent to that URL. Access to the server's origin is granted through an explicit permission prompt.
- **Keys**: API keys and server addresses are stored in `chrome.storage.local`, unencrypted like all extension storage, never synced, and sent only to the provider they belong to.
- **No analytics, no telemetry, no remote code.**

### Privacy policy URL
https://github.com/AndroidLemon/TabSquirrel/blob/main/PRIVACY.md

---

## 4. Assets Checklist

- [x] Icon 128×128 PNG (`src/assets/icons/icon-128.png`)
- [x] Screenshots, 1280×800, five (the store's maximum). Regenerate with `npm run assets:store` (see `tests/store_assets.js`); the seed notes are written so the shots read the same on any day:
  - `docs/store/01-notebook.png`: the full-tab notebook in the light theme, Closed today open at the top ("Closed 4 tabs for you today, all idle 60+ min · 1 reopened") with its note cards, one starred and one reopened.
  - `docs/store/02-card-expanded.png`: a summarized note open in the reader (summary box, then the saved text, with Reopen tab, Star, Delete and Copy), in the dark theme.
  - `docs/store/03-search-filter.png`: the `#frontend` tag filter narrowing the notebook to three notes, with the filter banner and Clear.
  - `docs/store/04-side-panel.png`: the side panel beside an article, showing Closed today and its cards.
  - `docs/store/05-options.png`: Options, "What happens to an idle tab" (Close or sleep, Sleep only, Close all) and the settings under it.
- [x] Small promo tile, 440×280 (`docs/store/promo-440x280.png`): the icon, "Tab Squirrel" and "Close idle tabs, keep the gist."
- [x] Privacy policy URL (`PRIVACY.md`, see section 3)
- [x] Upload zip: `npm run package` → `dist/tab-squirrel-<version>.zip` (manifest, `src/`, `LICENSE` only)
- Demo GIFs (not a dashboard requirement, but useful for the listing copy or a README; about 5 to 6 MB each at 880px wide):
  - `docs/store/demo-notebook.gif`: opening on Closed today, searching, filtering by tag, reading a note, folding Closed today to one line per note, starring, scrolling on to the rest of the Inbox (a sleeping tab, an offline summary), then switching the theme with the footer button.
  - `docs/store/demo-keyboard.gif`: the keyboard flow: `j`/`k` to move, `o` to read, `s` to star, Delete, then `u` to undo from the toast.
- Toast crops (`docs/store/06-toast.png`, `06-toast-undo-hover.png`, `06-toast-error.png`, `06-toast-error-undo.png`): the bottom-right toast with "Undo (U)", with Undo hovered, as an error, and as an error with Undo. Not required by the dashboard; for docs.

---

## 5. Version History

- **v1.0.0** (2026-09-16): Initial release.
  - Inactivity tracking with `chrome.storage.session` and alarm sweeps; idle, locked and sleep time excluded.
  - Close or sleep mode: close plain pages at the threshold, put interactive ones to sleep, close sleeping tabs at twice the threshold; Sleep only and Close all modes.
  - Closing gated on an AI-written summary; heuristic-only summaries put the tab to sleep instead.
  - In-tab article extraction with shadow DOM, rich-editor and dirty-form guards; last-moment re-check before closing or sleeping the tab.
  - Four summarization tiers: offline heuristic, Chrome's on-device model, local OpenAI-compatible server (streamed), Gemini with the user's key.
  - Never-touch and always-close site lists, editable from Settings or a tab context menu.
  - IndexedDB notebook with full-text search, Inbox / Reopened / All, starred, tags, domains, timeline, reader view, undo, and note fading.
  - Closed-today list for one-click reopening; in-place restore when the URL is already open.
  - Side panel and full-page view from one page.
  - Markdown, Obsidian vault `.zip`, and JSON export; JSON import.
