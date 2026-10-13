# ADR 0004: Adopt the Plainsong theme

Date: 2026-10-13
Status: accepted

## Context

Until now the notebook and the options page used a stock look: Tailwind's slate
neutrals, an indigo accent (`#4f46e5`), system fonts, and a soft shadow on every
card. It was interchangeable with any other dashboard. One token also failed
WCAG AA: muted text `#94a3b8` on white is about 2.6:1.

The product was being renamed to Tab Squirrel at the same time (see
`PRODUCT.md`). The owner wanted the rename, the new icon and the theme to land
together, so the store screenshots would be regenerated once.

A few things constrain the look:

- The extension makes no network requests except to a summarizer the user chose
  (`PRIVACY.md`).
- The notebook is mostly reading: a serif TL;DR, takeaways and the article text.
- Everything must meet WCAG 2.2 AA in light and dark (`PRODUCT.md`).

Plainsong was designed for this on a Design canvas
(https://claude.ai/artifact/JzscmtYdVAqfDJbxWWyTNG), trialled on the
`plainsong-trial` branch, and checked with an Impeccable audit. That audit
scored 15/20 before fixes and 18/20 after (`201032e`).

## Decision

Adopt Plainsong as Tab Squirrel's visual system. It is documented in
`DESIGN.md` ("The Reading Room") and `.impeccable/design.json`.

- **Palette:** warm paper and charcoal, with one ink-blue accent
  (`#2E4A7A`). Moss, ochre and brick appear only as status colours. Dark mode
  redefines every token.
- **Type:** three voices. Newsreader for content, IBM Plex Sans for controls,
  IBM Plex Mono for data. The fonts are bundled under `src/fonts/` (about
  170 KB of woff2, only the weights actually used) rather than loaded from a
  font CDN.
- **Surfaces:** flat by default, separated by hairline rules. Shadows appear
  only on menus, dialogs and toasts.
- **Token names:** `src/app/app.css` and `src/options/options.css` use the
  same names.
- **Icon:** the acorn-tab icon, drawn in the same ink-blue on paper colours
  (`src/assets/icons/icon.svg`).

## Consequences

- **Package size:** grows by about 170 KB of fonts. In exchange the extension
  makes no font requests and renders the same on every machine.
- **No more weights:** adding a font weight means bundling another file. The
  No Faux Bold Rule in `DESIGN.md` rules out synthesised bold.
- **New UI follows DESIGN.md:** a second accent colour, shadows on resting
  surfaces, and decorative use of the status colours are ruled out. Changing
  any of these needs a new ADR that supersedes this one.
- **Dark-mode filled buttons:** they keep the quieter ink fill (`#3E5C8F`)
  with light text (`--accent-fill-ink`), at 5.5:1. They never use dark text,
  which was 2.7:1.
- **Store screenshots:** `docs/store/` is regenerated with the new look via
  `tests/store_assets.js`. Any later visual change makes those images stale
  until it is run again.
