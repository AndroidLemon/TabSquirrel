# ADR 0005: Closed today is a section of the feed, and reading or starring files a note out of the Inbox

Date: 2026-10-13
Status: accepted

## Context

The 2026-10-13 critique of the notebook (`.impeccable/critique/2026-10-13T16-33-04Z__src-app-index-html.md`)
raised two problems.

**A closed tab appeared twice.** A separate "Closed today" receipt, a `<details>` block above the
search row, listed the day's closures as rows: title, domain, a reason and a Reopen button. The
same notes then appeared again as cards in the feed below. Every row gave the same "Sat idle"
reason, so a day of eight closures repeated it eight times, and the rows did not say what the
pages held. An earlier critique round had asked to take the TL;DR off the rows, and this one
asked to put it back. Both directions duplicated the cards.

**The Inbox could never empty.** Inbox membership was `!restoredAt` (`src/storage/db.js`), so
only reopening a tab took its note out. Reading the note in the reader or starring it did not.
The empty-Inbox copy also claimed that starring files a note, which it did not.

`PRODUCT.md` says the notebook should stay small and that a short Inbox is part of that
(principle 4). It also says to show results where the user is already looking (principle 5).

## Decision

**Closed today becomes the top of the feed.** In the plain Inbox or All notes view, with no
search, tag, domain or time filter (Starred counts as a filter), the feed opens with a Closed
today section. The Reopened view and any filtered view render the plain feed.

- **Heading.** One quiet row reads "Closed 8 tabs for you today, all idle 60+ min · 2 reopened",
  next to Reopen all. Reopen all keeps its behaviour: it asks first above 5, shows progress,
  marks failures and offers Undo when notes are removed on reopen.
- **Idle claim.** Every closure comes from the idle sweep, and a tab that slept first sat idle
  twice as long. So "idle {timeout}+ min", using the real timeout setting, is true whatever the
  mix of reasons. The phrase is dropped if any record's real idle time is shorter than the
  timeout, which can happen if the threshold was raised during the day.
- **Cards.** Today's notes follow as the normal cards, each shown once. The rest of the view
  continues under "Rest of your Inbox" or "Other notes" and leaves those notes out. A card in
  the section adds when it closed (and its idle time, when real data exists), a reason only for
  the exceptions (always-close list, slept first), and a Reopened marker. Reopened notes stay in
  the section as the day's record, and in the Inbox view the section still shows today's
  closures that have since left the Inbox.
- **Cap.** More than 6 notes show 6 plus "Show all N closed today". A note that Reopen all
  could not reopen is listed first, so it is never hidden.
- **Collapse.** The `closed_today_seen` behaviour stays. A later open on the same day keeps the
  section but collapses its cards to one line each (title, closed time, Reopen). The heading
  expands them, and new closures expand them again.
- **Keyboard.** j/k, Enter, o, s and Delete treat both parts as one list.

**A note leaves the Inbox when it is reopened, read or starred.** A new `filedAt` field is
stamped the first time the reader opens a note or the note is starred.

- **Rule.** `isInInbox(record)` is `!restoredAt && !filedAt`. The Inbox view and the Inbox
  count both use it.
- **Unstarring** leaves `filedAt` set, so the note does not come back to the Inbox.
- **Recapture.** A recapture of the same page clears `filedAt`, as it already cleared
  `restoredAt`, so a fresh capture lands in the Inbox. JSON import keeps `filedAt`.
- **Reopened view.** It still means `restoredAt`. A read or starred note that was never
  reopened is in All notes only.
- **On screen.** In the Inbox view, a starred card leaves at once, and a read card leaves when
  the reader closes. Keyboard selection moves to the card that takes its place.
- **Empty state.** It now reads "Nothing new in your Inbox. Notes leave it when you read, star
  or reopen them."

No data migration: there are no users yet.

### Alternatives rejected

- **Receipt rows with a TL;DR.** This answers "what did it say" but duplicates the note, now
  with its gist, directly above the same card.
- **Keep receipt rows reason-only.** This removes the gist duplication but still lists every
  closed tab twice, and repeats the same reason on most rows.
- **Fix only the Inbox copy.** The copy would be true, but the Inbox still could not reach zero.
  An inbox that only empties by reopening tabs fights the product thesis of letting tabs go.
- **Remove the Inbox.** This loses the one view of "what has not been looked at yet", which the
  side panel opens on. A real exit rule keeps the view and makes it finite.

## Consequences

- **One render path.** The feed now renders two lists, `#closed-today-list` and `#tabs-feed`,
  that act as one for selection, focus and card keys. Anything that looks up a card goes
  through `liveCards()`, `cardById()` or `inFeed()` in `src/app/app.js`.
- **Section reasons.** The receipt row markup and CSS are gone. `closedReason` still names the
  path that closed a tab; cards show it only through `closedException`.
- **Section visibility.** The section is tied to the plain view. A search for something closed
  today shows it once in the filtered feed, with no section.
- **Opening the reader changes data.** Opening the reader is no longer read-only: it writes
  `filedAt`. Previewing a note in the Inbox files it.
- **Stars and the Inbox.** Starring, then unstarring, files a note for good. Only a recapture
  brings it back to the Inbox.
- **Reopened view.** Notes that were read or starred but never reopened are in neither Inbox
  nor Reopened, only in All notes. The Reopened view keeps its meaning.
