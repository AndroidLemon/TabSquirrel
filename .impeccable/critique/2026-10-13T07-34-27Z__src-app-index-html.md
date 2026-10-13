---
target: the notebook
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html"
target_fingerprint: "sha256:c535ab0e2b38f9c171f10ee0cf5e0562a81467af44ad30c48529f5040e66936d"
target_path: /Users/albertjackson/Desktop/Projects/TabSum/src/app/index.html
timestamp: 2026-10-13T07-34-27Z
slug: src-app-index-html
---
Method: dual-agent (A: Opus design review · B: Sonnet detector review)

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Closed-today buried (collapsed, 4th row); "Today" stat counts captures not closures |
| 2 | Match System / Real World | 2 | Vocabulary drift: note/summary/Knowledge Hub/wiki; Archived vs closed; Favorites/star/Keep |
| 3 | User Control and Freedom | 3 | Delete Undo good; reader view lacks Reopen/Star/Delete; Escape wipes search |
| 4 | Consistency and Standards | 2 | Inbox/Reopened/All duplicated (sidebar + tabs) with different labels; mixed focus rings |
| 5 | Error Prevention | 3 | Enter in search reopens top hit; trash adjacent to Copy |
| 6 | Recognition Rather Than Recall | 2 | Icon-only card actions; j/k/Enter undiscoverable |
| 7 | Flexibility and Efficiency | 3 | Good keyboard model; no Reopen all / batch; sort not persisted |
| 8 | Aesthetic and Minimalist Design | 3 | Calm visuals; structural noise (stats strip, Archived badge everywhere, duplicate nav) |
| 9 | Error Recovery | 2 | Raw err.message toasts; failed Undo still says "Summary restored" (app.js:399-409) |
| 10 | Help and Documentation | 1 | No in-UI explanation of auto-close, Inbox, fading; no shortcut legend |

## Design Specificity Verdict
Skin authored (Plainsong type voices, palette, reader view); skeleton category-default (KPI strip, icon sidebar, segmented control, 4-icon card footer). Product-specific elements (Closed today, fading) are hidden. Detector: 2 findings, both false positives (blockquote side-tab app.css:1338; reader dialog padding carried by children). Overlay unavailable (DevTools profile locked; chrome-extension:// target).

## Priority Issues
- [P1] Closed today buried; it is the trust surface. Fix: open-first receipt sentence, per-row reason, Reopen all, collapse once seen. (/impeccable clarify + layout)
- [P1] Side panel hierarchy inverted: filled Archive Current Tab loudest, stats on top, 10 controls before first note (~345px). Fix: demote archive-current, drop/condense stats, sort+density into Filters drawer. (/impeccable distill)
- [P1] Keyboard/timing gaps + false success: j/k no focus/announce; title not focusable; 5s Undo unpausable (WCAG 2.2.1); hidden toast Undo focusable (opacity only, app.css:1383); failed restore reports success. (/impeccable harden)
- [P2] Duplicated nav + vocabulary drift. Fix: sidebar sections Views/When/Tags/Domains, single view switch, PRODUCT.md terms. (/impeccable clarify)
- [P2] Fading invisible. Fix: one-line explanation, quiet fade date on card + reader, visible star meaning. (/impeccable onboard)

## Persona Red Flags
- Morgan (tab hoarder, 8 tabs gone): "2 TODAY" mismatch; collapsed Closed today; "Archived" with no reason; 8 clicks to restore all; fading unannounced.
- Alex: no batch actions; no star/reader/delete keys; Enter-in-search reopens; Escape clears query; sort resets.
- Sam: selection not announced; title not focusable; timed Undo; focusable invisible Undo; aria-pressed not aria-current; 24px icons at the limit.

## Minor Observations
Knowledge Hub naming off-voice/inconsistent; exclamation toasts; Archived badge on every card; DESIGN.md says emoji+word, code renders word only; placeholder truncates in panel; double active state with tag filter; "6m · 1h ago" ambiguous; silent permission failure; JSON export ignores filters silently.

## Questions to Consider
Open on "what I closed for you" instead of a grid? Does "90m Reading Backlog" recreate the guilt? Show each note's lifespan like yellowing paper?
