# ADR 0007: A recapture of a starred note keeps it filed

Date: 2026-10-13
Status: accepted

Supersedes the "Recapture" rule of ADR-0005 for starred notes only.

## Context

ADR-0005 has a recapture of the same page clear `filedAt`, so a fresh capture lands in the Inbox.
A recapture keeps `isFavorite`, so a starred note came back to the Inbox still starred, although
starring is one of the ways a note leaves it.

## Decision

A recapture keeps `filedAt` when the existing record is starred. For an unstarred note nothing
changes: `filedAt` is cleared and the note returns to the Inbox. JSON import is unchanged.

## Consequences

- A starred note never returns to the Inbox by being recaptured. A starred note that was never
  filed (older data) is not filed by this rule.
- Unstarring afterwards still leaves it filed, as ADR-0005 says.
