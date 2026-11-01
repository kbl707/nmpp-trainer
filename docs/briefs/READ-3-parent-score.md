# READ-3 — parent enters scored reads

Brief date: 2026-11-01 · decision #12 · Branch: `read-parent-score`
Executor: Sonnet, effort medium · Size: M
**Start only after the baseline (three sittings) has been scored on paper.** The
fields below may change after that.

Read `docs/BRIEF.md`, decision #12, SPEC §5 and §13.4, then this file. This file is
the whole task.

## Why
Saturday measures live on paper. The trend needs them in `results`. Research rank 5.

## Do
Build a new item type `parent_read`. Unknown-type fallback stays as it is (decision #3).
- Item: `{ "type": "parent_read", "prompt": "Tėvams: įrašyk skaitymo rezultatus",
  "data": { "forms": ["T01", "T02", "T03"] } }`. One row of inputs per form.
- Inputs per form: words attempted in 60 s, errors S, O, E, H, correct syllables,
  question 0 or 1. One shared note field: mood, interruptions.
- Recorded `answer`: `{ "mode": "parent", "rows": [...], "note": "..." }`, with
  `correct: null` and 0 stars.
- The screen shows no computed score, and `Toliau` shows no praise toast. The child
  may be in the room.
- Exclude `mode: parent` entries from accuracy and `tap_wpm_by_day` in `weekly_stats`.
- `SPEC.md` §5: document the item.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- A set with this item run locally: screenshot and the saved `answers` entry.
- `weekly_stats` output before and after, showing the entry has no effect.

## Not yours
Applying any migration, merging. Stop at PR-open.
