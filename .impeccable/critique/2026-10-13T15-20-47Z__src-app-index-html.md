---
target: the notebook
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html"
target_fingerprint: "sha256:affd3b09aa9df05f64552621aa814ea6db8365313be3138fbd4d6c9785920672"
target_path: /Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html
timestamp: 2026-10-13T15-20-47Z
slug: src-app-index-html
---
Method: dual-agent (A: Opus design review · B: Sonnet detector review)

## Design Health Score: 29/40 (Good), up from 24
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Receipt + toasts strong; Inbox has no count; Reopen all shows no progress; reopened receipt row vanishes |
| 2 | Match System / Real World | 3 | "No snapshot text saved", "Note overview"; "Reopen tab" on still-open Saved/Sleeping notes; first-run "Inbox zero" |
| 3 | User Control and Freedom | 3 | Delete Undo pauses; Escape chain good; Reopen all has no confirm/undo (removeOnReopen fix in flight) |
| 4 | Consistency and Standards | 3 | Default view differs by surface; "Reopen" vs "Reopen tab"; "JSON Backup" title case |
| 5 | Error Prevention | 3 | Bulk Reopen all (up to 50) unguarded |
| 6 | Recognition Rather Than Recall | 3 | Icon-only card actions (book = reader ambiguous); title-click reopen undiscoverable |
| 7 | Flexibility and Efficiency | 3 | j/k/Enter/?/ work; no star/delete/read keys; tab order visits every tag chip |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, on-brief both schemes; 7 strata before first note in panel; repeated "fades Nov 12" |
| 9 | Error Recovery | 2 | Generic messages; "N could not be reopened" doesn't say which; no-results doesn't offer All notes |
| 10 | Help and Documentation | 3 | ? legend, fade line, reasons; first-run panel explains nothing |

## Design Specificity Verdict
Frame is authored (receipt with reasons, fade dates, three-voice type, paper/ink in both schemes); the card is a stock read-later card and the wide grid reads dashboard. Detector: 1 warning, cramped-padding on reader <dialog>, false positive (padding carried by .modal-header/.modal-body; padding:0 + overflow:hidden clips the radius). Prior blockquote side-tab no longer flagged (runtime HTML). Overlay unavailable: extension CSP script-src 'self' blocked detect.js.

## Priority Issues
- [P1] Reader header collapses in the side panel: title one word per line, URL breaks per character (.modal-header-actions flex-shrink:0, app.css ~1302-1340). Fix: stack header under 720px, domain only, overflow-wrap anywhere. (/impeccable adapt)
- [P1] First-run panel says "Inbox zero — nothing waiting." (emptyStateHtml checks view before total count, app.js ~282-294). Fix: branch on zero notes first; say what will happen (threshold, summary kept, one-click reopen). (/impeccable onboard)
- [P1] Receipt doesn't scale or keep its record: 9 closures push first note to 1024px; rows duplicate card TL;DRs; reopening deletes the row and rewrites the headline; row title not actionable. Fix: cap 3 + Show all, keep reopened rows marked, "Closed 9 today · 1 reopened", title opens reader, show closed time/idle instead of TL;DR, confirm Reopen all above ~5. (/impeccable distill, /impeccable harden)
- [P2] Card title is a hidden, mis-announced Reopen (h3 tabindex=0); "Reopen tab" on open tabs. Fix: real button/link "Reopen: {title}" or open reader; "Go to tab" for Saved/Sleeping. (/impeccable harden, /impeccable clarify)
- [P2] Too many strata before the first note in the panel. Fix: count into view-tabs row, Save current tab to topbar icon, quieter/dismissible permission banner once notes exist, fade sentence only in empty state + legend. (/impeccable layout)

## Persona Red Flags
- Alex: no star/delete/read keys; no multi-select; per-card takeaways toggles; ~7 tab stops per card; double outline on selected card (app.css ~972).
- Sam: h3 title acts as button; reader header unusable at 380px / 200% zoom; receipt titles not focusable.
- Tab hoarder (8 closed): 8 identical "Sat idle" reasons with no time/idle duration; notes below the fold, TL;DRs repeated; Reopen all undoes everything with one click; reopened row vanishes; permission banner under receipt raises "how did it summarize then?".

## Minor Observations
Inbox/Reopened lack counts; full view silently defaults to All notes; reader omits takeaways and says "snapshot"; "Inbox zero" quip off-register; generic empty icon (acorn opportunity); wide count/sort row detached from search; export menu repeats "(respects active filters)", "JSON Backup" title case; fade date on every card is noise beyond ~7 days; Reopen all has no progress.

## Questions to Consider
Should Closed today be an immutable ledger with reopen as a state? Could the Inbox go, leaving fading + star as the one mechanism? Should the narrow notebook be the dense receipt-style list, with the full card only in the reader?
