---
name: Tab Squirrel
description: Plainsong, a quiet reading room for the tabs you let go.
colors:
  paper: "#F6F3EC"
  paper-surface: "#FDFBF7"
  paper-muted: "#EFEAE0"
  rule: "#E3DDD0"
  rule-strong: "#CFC7B6"
  rule-input: "#948B78"
  charcoal: "#1D1C19"
  charcoal-secondary: "#4A4740"
  charcoal-muted: "#6B675E"
  ink: "#2E4A7A"
  ink-deep: "#1F3458"
  ink-wash: "#E4E9F2"
  moss: "#3F6B45"
  moss-wash: "#E3ECDF"
  ochre: "#8A5A12"
  brick: "#A63D2F"
  brick-wash: "#F4E0DB"
  brick-rule: "#D9A79E"
  night-paper: "#161513"
  night-surface: "#1F1E1B"
  night-muted: "#2B2A26"
  night-rule: "#34322D"
  night-text: "#EDE9E0"
  night-text-secondary: "#B5AFA3"
  night-text-muted: "#9A9487"
  night-ink: "#9DB4DE"
  night-ink-text: "#B8C9E8"
  night-ink-wash: "#232C3F"
  night-ink-fill: "#3E5C8F"
  night-ink-fill-ink: "#EDE9E0"
  night-moss: "#8DBF93"
  night-ochre: "#D9A650"
  night-brick: "#E08A7C"
  night-brick-rule: "#6E3A32"
typography:
  page-title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "24px"
    fontWeight: 600
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  title-wide:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
  reading:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  reader-summary:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "16px"
    fontWeight: 400
  summary:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  brand:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  data:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  favicon: "2px"
  mark: "3px"
  chip: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-surface}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.charcoal-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px"
  button-icon:
    textColor: "{colors.charcoal-secondary}"
    rounded: "{rounded.sm}"
    padding: "6px"
  input-search:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.sm}"
    padding: "8px 36px 8px 32px"
    typography: "{typography.body}"
  nav-item:
    textColor: "{colors.charcoal-secondary}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.ink-wash}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.md}"
    padding: "12px"
  card-summary:
    backgroundColor: "{colors.paper-muted}"
    textColor: "{colors.charcoal-secondary}"
    rounded: "{rounded.chip}"
    padding: "6px 8px"
    typography: "{typography.summary}"
  chip-tag:
    backgroundColor: "{colors.paper-muted}"
    textColor: "{colors.charcoal-secondary}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  toast:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  dialog-reader:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.lg}"
---

# Design System: Tab Squirrel

## Overview

**Creative North Star: "The Reading Room"**

Plainsong is a calm, warm, unhurried room you come back to for the things you set aside. Warm paper, charcoal ink and a single blue-black accent. Nothing in it competes for attention, because the tabs that were closed were already competing too much. The notebook is where a summary is read, not where the interface shows off.

Two type voices split the work. Newsreader, a reading serif, carries everything that was *kept*: titles, TL;DRs, takeaways and the article itself. IBM Plex Sans carries everything you *do*: navigation, buttons, filters and settings. IBM Plex Mono marks *data*: domains, timestamps and counts. All three are bundled locally, so the extension makes no font requests.

Density follows the surface. In the side panel it is compact (13px body, one column, filters in a drawer). In a full tab it opens up (14px body, a persistent sidebar and a card grid). Both are one page with one stylesheet.

**Key Characteristics:**
- Warm off-white paper and charcoal text. Never pure white or pure black.
- One accent, ink blue, used for links, the active nav item, focus and the primary button.
- Serif for content, sans for controls, mono for data.
- Flat surfaces separated by hairline rules. Shadows only on things that float.
- Status shown by a muted hue plus a word, never by colour alone.
- A full dark scheme with every token redefined, following the system by default and switchable to Light or Dark by the user (ADR 0006).

## Colors

A paper-and-ink palette: warm neutrals do almost all the work, one ink-blue accent leads, and three muted earth hues carry status.

### Primary
- **Ink Blue** (`ink`): links, the active nav item, search focus, the primary button fill and takeaway bullets. In dark mode it lightens to `night-ink` for text and links, and filled buttons switch to the quieter `night-ink-fill` with light `night-ink-fill-ink` text, so a filled button never glows and still clears AA (5.5:1).
- **Deep Ink** (`ink-deep`): hover state of filled ink controls.
- **Ink Wash** (`ink-wash`): the background of the active nav or filter item, info banners and tag hover.

### Secondary
- **Moss** (`moss`, `moss-wash`): Reopened and success states.
- **Ochre** (`ochre`): Saved status, the "Fading soon · Nd left" chip and the star.
- **Brick** (`brick`, `brick-wash`): destructive actions and error toasts.

### Neutral
- **Paper** (`paper`): page background. **Paper Surface** (`paper-surface`): cards, sidebar, inputs and dialogs. **Paper Muted** (`paper-muted`): the TL;DR panel, tags and quiet badges.
- **Rule** (`rule`): hairline borders and dividers. **Rule Strong** (`rule-strong`): card border on hover. **Rule Input** (`rule-input`): input borders, kept at 3:1 or better against the surface.
- **Charcoal** (`charcoal`): primary text. **Charcoal Secondary**: summaries and controls at rest. **Charcoal Muted**: meta text, placeholders and section labels.
- The `night-*` tokens are the dark-scheme counterparts of all of the above.

### Named Rules
**The One Ink Rule.** Ink blue is the only accent. Moss, ochre and brick appear only as status, never as decoration.

**The Closed Is Quiet Rule.** Closed is the default state, so it gets no badge at all. Badges and colour are reserved for states that need attention: Saved, Sleeping, Reopened.

**The Fixed Toast Rule.** Toasts use their own fixed-colour tokens in both schemes, so the contrast of the Undo button never depends on page tokens.

## Typography

**Display Font:** Newsreader (with Georgia, Times New Roman)
**Body Font:** IBM Plex Sans (with system UI sans)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace)

**Character:** a literary serif for what was kept, beside an engineering sans and mono for what you operate. The pairing reads as "book in a well-made tool".

### Hierarchy
- **Headline** (600, 22px, 1.3): the reader dialog's title.
- **Title** (600, 15px, 1.35; 17px at 720px and wider): card titles, in serif. On hover they turn ink and underline.
- **Reading** (400, 18px, 1.6, max 68ch): article text in the reader view. The summary box matches it so the measures line up.
- **Summary** (400, 14px; 15px at 720px and wider): the TL;DR and takeaways, in serif.
- **Body** (400, 13px, 1.4; 14px at 720px and wider): all UI text.
- **Label** (600, 12px, 0.05em, uppercase): sidebar section headings. Badges use 600 at 12px with 0.02em tracking.
- **Data** (400, 12px, mono): domains, timestamps and count badges.

### Named Rules
**The Three Voices Rule.** Serif means content, sans means controls, mono means data. A new element picks its font by what it *is*, not by how it should look.

**The No Faux Bold Rule.** Only the bundled weights exist: Newsreader 400, 400 italic and 600; Plex Sans 400 and 600; Plex Mono 400. Emphasis in mono comes from colour, not weight.

## Layout

One page, two layouts, with a breakpoint at 720px.

- **Narrow (under 720px: side panel or a narrow tab):** a single column with 12px main padding and a 10px gap between cards. The sidebar becomes a fixed drawer that slides in from the left (320ms). A takeaways toggle shows and hides card bullets.
- **Wide (720px and up):** a sticky 264px sidebar plus main padding of 20px by 28px. Cards sit in an auto-fill grid with a 320px minimum and a 16px gap, and every card in a row is the same height. Compact density switches to 420px-minimum rows with an 8px gap. Takeaways always show. Search is capped at 680px.
- **Spacing rhythm:** 4, 8, 12, 16, 20 and 28px. Inside a card, gaps run 6–10px.
- **Anchored menus:** the export dropdown uses CSS anchor positioning.

## Elevation & Depth

Flat by default. Depth comes from tonal layering: paper, then paper surface, then paper muted, with hairline rules between them. Resting surfaces such as cards, inputs and the sidebar have no shadow (`--shadow-sm: none`).

### Shadow Vocabulary
- **Raised** (`0 2px 8px rgb(29 28 25 / 0.08), 0 1px 2px rgb(29 28 25 / 0.06)`): menus and popovers.
- **Overlay** (`0 12px 32px rgb(29 28 25 / 0.14), 0 2px 6px rgb(29 28 25 / 0.08)`): dialogs and toasts. The reader dialog adds a 50% charcoal scrim with a 4px blur.
- **Focus** (`0 0 0 3px` ink at 22% opacity; 30% in dark mode): the focus ring, shown as a halo rather than an elevation.

### Named Rules
**The Only Floating Things Cast Shadows Rule.** If an element sits in the page flow, it gets a rule, not a shadow.

## Shapes

Soft but not bubbly. There are four radii, each tied to a scale of element:

- **Chip** (4px): tags, badges, the TL;DR panel and the toast's Undo button.
- **Small** (8px): controls such as buttons, nav items, inputs and banners.
- **Medium** (12px): cards, and the search box when it widens at 720px and up.
- **Large** (20px): sheets and the reader dialog.

Borders are always 1px hairlines. Favicons get a 2px radius. Bullets are ink-coloured "•" glyphs rather than list markers.

## Components

### Buttons
Ruled and restrained.
- **Shape:** gently rounded (8px).
- **Primary:** ink fill with paper text, 600 weight at 12px, padding 8px by 12px. Hover deepens to deep ink. There is no shadow.
- **Secondary (footer and copy buttons):** paper surface with a 1px rule border and secondary text. On hover the text turns charcoal and the border turns ink.
- **Icon / ghost:** transparent with 6px padding. Hover fills it with paper muted and the text turns charcoal.
- **Press:** buttons scale down slightly when pressed, except under reduced motion.

### Chips
- **Tag:** paper-muted fill, secondary text, sans 12px, 4px radius. On hover it takes an ink wash and ink text. Clicking a tag filters by it.
- **Status badge and fade chip:** the badge's hue at 12% opacity for the fill, the hue for the text and a 25% border. Sleeping is ink, Reopened is moss, Saved is ochre, and "Fading soon · Nd left" is ochre. Closed has no badge. Each badge pairs its colour with a word; none carries an icon or emoji. Badge and chip sit on their own row under the domain and meta.
- **Count badge:** mono 12px on a rule-coloured fill.

### Cards / Containers
- **Corner style:** 12px.
- **Background:** paper surface on a paper page.
- **Shadow strategy:** none. A hairline rule border turns to rule strong on hover.
- **Internal padding:** 12px in the side panel and 16px in the grid, with a 6–10px gap between rows.
- **Anatomy:** a header with favicon and mono domain, the meta line (read time, saved time, quiet "fades Nov 12" date) and, when needed, a status badge or fade chip on its own row (narrow widths put the meta on its own line under the domain); a serif title; the TL;DR on a paper-muted panel; serif takeaways with ink bullets; tags; and a footer, separated by a rule, holding the actions.

### Notebook parts
- **Closed today:** the top of the feed in the plain Inbox or All notes view (any search, filter or the Reopened view skips it). A quiet sans heading row, "Closed 8 tabs for you today, all idle 60+ min · 2 reopened", states the shared idle reason once with the real timeout, beside Reopen all (asks first above 5, shows progress, marks failures). Today's notes follow as the normal cards, each shown once and never repeated below; a card adds a mono "closed 10:42 · idle 64 min" line, a reason only when it is an exception (always-close list, slept first), a moss Reopened badge once reopened and a brick "Could not reopen" badge after a failed Reopen all. More than 6 show 6 plus "Show all N closed today". Once seen, later opens the same day collapse the cards to one ruled line each (title, closed time, Reopen); the heading toggles them, and new closures expand them again. ADR 0005.
- **Feed heading:** below Closed today the rest of the view continues under the same quiet heading style, "Rest of your Inbox" or "Other notes". With nothing closed today there is no section and no heading.
- **Quiet fade line:** one muted sentence explaining when notes fade, shown when an Inbox empties (not on the first run) and in the shortcuts list, not above the feed. A card carries its own quiet "fades Nov 12" date only in the last 7 days (the chip takes over for the last 3).

### Inputs / Fields
- **Style:** paper surface with a 1px border in the input-rule colour and an 8px radius. The search icon is inset on the left and the `/` hint on the right.
- **Focus:** the border turns ink and a 3px ink halo appears (120ms).

### Navigation
- **Sidebar nav items:** transparent, secondary text, 13px, padding 7px by 10px. Hover fills with paper muted. Active gets an ink wash, ink text and 600 weight. Section labels are uppercase, 12px, muted, with 0.05em tracking.
- **Narrow layout:** the same sidebar becomes a left drawer behind a Filters button.

### Theme toggle
One icon button in the sidebar footer, beside the shortcuts `?` and Settings, in the footer button style (paper surface, 1px rule, secondary text). Each press cycles System, Light, Dark, and the icon shows the current choice: a monitor, a sun or a moon. Its aria-label and tooltip name both states ("Theme: System. Switch to Light."). In the narrow layout it lives in the Filters drawer. The options page offers the same choice as an Appearance setting with three radios, and the two stay in sync live. System is the default and writes no `data-theme` attribute; Light and Dark set `data-theme` on `<html>` and `color-scheme` to match, so native controls follow. A classic script in `<head>` applies the stored choice before first paint (ADR 0006).

### Toast (signature)
A fixed charcoal bar in both schemes, shown as a manual popover so it stays above the open reader dialog. It sits at bottom centre in the narrow layout and bottom right in the wide one. The Undo button is a pale-ink pill labelled "Undo (U)", and pressing `u` (when not typing) activates it. A 2px ink progress bar counts down the 5-second Undo window. The error variant switches to a brick fill. The toast is display:none while hidden, so a separate visually hidden live region announces each message, with "Press U to undo" when there is an Undo.

### Reader Dialog (signature)
A native `<dialog>`: 20px radius, up to 820px wide and 85vh tall, with the overlay shadow and a blurred scrim. On open it fades and scales up from 96% (200ms). The header holds a 22px serif title and the ink source link; focus starts on the title (a heading with tabindex -1), not the link, so Enter cannot leave the notebook. The actions follow the button rules by weight: Reopen tab / Go to tab is the ink primary, Delete is a secondary in brick text, and Star and Copy are quiet (no fill, no border until hover). The body is an 18px Newsreader column, 68ch wide, with line height 1.6.

### Motion
One easing curve, `cubic-bezier(.2, .7, .2, 1)`. Durations: 120ms for colour and border changes, 200ms for entrances, chevrons and toasts, and 320ms for the drawer. Under `prefers-reduced-motion`, transforms and loops drop out and only opacity fades remain.

## Do's and Don'ts

### Do:
- **Do** take every colour from the tokens on `:root` and define its dark counterpart twice: under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` for System, and under `:root[data-theme="dark"]` for an explicit Dark choice. The two blocks must stay identical (a unit test compares them), and `color-scheme` follows the chosen mode.
- **Do** set content in Newsreader, controls in Plex Sans and data in Plex Mono (the Three Voices Rule).
- **Do** separate surfaces with 1px rules and tonal steps. Reserve shadows for menus, dialogs and toasts.
- **Do** pair every status hue with a word, and leave Closed unbadged.
- **Do** keep filled ink buttons at `night-ink-fill` in dark mode, not the bright `night-ink`, and set their text in `--accent-fill-ink` (dark text on the quiet fill is only 2.7:1).
- **Do** keep a visible focus halo and AA contrast in both schemes, and respect reduced motion.
- **Do** keep every control at least 24px in both directions (card icon buttons are 28px), and let the layout reflow at 190 CSS px wide (200% zoom in the side panel) with no sideways scroll.

### Don't:
- **Don't** add a second accent colour, or use moss, ochre or brick decoratively.
- **Don't** use pure white (#FFFFFF) or pure black (#000000) surfaces.
- **Don't** put shadows on resting cards, inputs or the sidebar.
- **Don't** use font weights that aren't bundled, or load fonts from a CDN.
- **Don't** fork token names between pages. `src/app/app.css` and `src/options/options.css` define the same tokens under the same names, and a value changed in one changes in the other.
- **Don't** add a dark token to only one of the two dark blocks, or style a scheme with `prefers-color-scheme` alone: the user's Light/Dark choice sets `data-theme`, and a rule that ignores it breaks the toggle.
