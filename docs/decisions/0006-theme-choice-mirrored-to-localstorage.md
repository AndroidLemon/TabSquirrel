# ADR 0006: Theme choice is stored in chrome.storage.local and mirrored to localStorage

Date: 2026-10-13
Status: accepted

## Context

ADR 0004 gave the notebook and the options page a full dark scheme, but only through
`prefers-color-scheme`. A user whose browser is light and who wants the notebook dark (or the
reverse) had no way to say so. The request was a System / Light / Dark choice, System by default.

Two constraints shape it:

- **No flash.** If the choice is read from `chrome.storage.local`, which is async, the page paints in the
  system scheme first and then switches. Extension CSP forbids inline scripts, so the usual
  "tiny script in the head" has to be a file.
- **CSS cannot share a block** between a `@media` query and an attribute selector, and the project has
  no build step to generate one.

## Decision

- **Source of truth:** `chrome.storage.local` key `theme`, one of `system`, `light`, `dark`. Every page
  follows changes through `chrome.storage.onChanged`, so the notebook and the options page stay in step
  live. `src/shared/theme.js` holds the logic.
- **Mirror:** the same choice in `localStorage` (`theme`, absent for System). `src/shared/theme-boot.js`
  is a classic script, first in `<head>` on both pages, that reads it synchronously and sets
  `<html data-theme="light|dark">` before first paint. System is the absence of the attribute.
- **CSS:** the dark tokens live under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`
  and, repeated, under `:root[data-theme="dark"]`. `color-scheme` is set per mode so native controls
  follow. A unit test (`tests/test_app_unit.js`) parses both stylesheets and fails if the two token
  copies differ.
- **UI:** one icon button in the notebook's sidebar footer cycles System, Light, Dark, and names the
  current and next state. The options page has an Appearance setting with three radios.

## Consequences

- The dark tokens are written twice in each stylesheet. The test is what keeps them honest; a new
  dark token must be added to both blocks.
- The mirror can disagree with storage (cleared storage, another profile). The page applies the stored
  value as soon as it loads, so the worst case is one flash, not a wrong theme that sticks.
- A third scheme (high contrast, sepia) would be a new `data-theme` value and a new token block, not a
  change to this mechanism.
