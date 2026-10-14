---
target: the notebook
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html"
target_fingerprint: "sha256:d067818623540d9322fdb4e748c5741caa38bac4aa26515d026c88c3b641481d"
target_path: /Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html
timestamp: 2026-10-13T16-33-04Z
slug: src-app-index-html
---
Method: dual-agent (A: Opus design review · B: Sonnet detector review)

## Design Health Score: 30/40 (Good), up from 29 and 24
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Receipt, progress, counts strong; no AI-vs-heuristic summary signal; starred state in reader only via label |
| 2 | Match System / Real World | 3 | Inbox never empties (10 of 13); quiet permission note "Without it…" has no subject |
| 3 | User Control and Freedom | 3 | Undo everywhere but Reopen all (confirm >5); Delete loses keyboard position |
| 4 | Consistency and Standards | 3 | "Reopen tab" vs "Reopen"; empty-Inbox copy says star files a note (it doesn't); reopen icon on Go to tab |
| 5 | Error Prevention | 3 | First-run promise vs loud permission banner unreconciled |
| 6 | Recognition Rather Than Recall | 3 | Shortcuts beyond / only in ? legend |
| 7 | Flexibility and Efficiency | 3 | Full j/k/o/s/Del model; no multi-select |
| 8 | Aesthetic and Minimalist Design | 3 | Receipt repeats feed; "Sat idle" ×8; 5 strata before first card |
| 9 | Error Recovery | 3 | Failed rows marked; reopen error gives no cause |
| 10 | Help and Documentation | 3 | ? legend right-aligned descriptions, Backspace missing |

## Design Specificity Verdict
Receipt (real close times, idle durations, reasons), fade dates, three voices and paper/ink are product-specific; the card feed below is a generic read-later card. Detector: 1 warning, cramped-padding on reader <dialog>, false positive (header 16px 20px, body 20px 24px). Overlay unavailable (extension CSP).

## Priority Issues
- [P1] Receipt shows why, not what, and repeats the feed: no TL;DR (DESIGN.md says there is one), identical "Sat idle" reasons, closed notes appear again as cards. Fix: one-line TL;DR per row, common reason in the summary and per-row reason only for exceptions, mark or merge today's closures with the feed. NOTE: critique round 2 asked to remove the TL;DR from rows; resolve the direction before changing. (/impeccable distill, /impeccable clarify)
- [P2] Empty-Inbox copy is false (star doesn't file a note; Inbox = !restoredAt, db.js:201) and Inbox can't reach zero. Fix: correct copy, or give Inbox a real exit. (/impeccable clarify)
- [P2] Keyboard focus after Delete drops to body (next j goes to top); reader opens focused on the external source link. Fix: reselect same index after delete; focus title/close on open. (/impeccable harden)
- [P2] Quiet permission note has no subject ("Without it…"). Fix: own sentence + "Allow all sites". (/impeccable clarify)
- [P2] Side panel fails 200% reflow (222px in 190px; search "Se"; meta overflows). Fix: wrap search row, card-time, view tabs. (/impeccable adapt)

## Persona Red Flags
- Alex: Delete loses position; no multi-select; ~7 tab stops per card.
- Sam: toast Undo unreachable by keyboard within 5s; takeaways toggle 17px (<24px target); 200% reflow; reader opens on external link.
- Hoarder (8 closed): "Show fewer" sits mid-list; repeated reasons and no gist; no AI-vs-heuristic signal; wide Reopen ~900px from its title.

## Minor Observations
"saved Just now" capital J (app.js formatTimeAgo); toggleStar puts fade chip into .card-source instead of .card-flags; receipt meta lacks separator between domain and reason; reader actions equal weight (Delete not brick, Reopen not primary); ? legend right-aligned; first-run panel 5 centred lines; fragile `.closed-today summary` selector inherits into nested Show all.

## Questions to Consider
Does a worried user need why each tab closed, or what it said? If Inbox can never reach zero, is it an inbox? Should a closed tab ever appear twice on one screen?
