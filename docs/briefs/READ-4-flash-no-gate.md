# READ-4 — letter_flash stops passing or failing

Brief date: 2026-11-01 · decision #12 · Branch: `read-flash-no-gate`
Executor: Sonnet, effort low · Size: S

Read `docs/BRIEF.md`, decision #12, then this file. This file is the whole task.

## Why
Today 90% of trials decides correct or wrong, so an 8-trial set can only score 100%
to pass. Reviews have read this as weakness. Research rank 9.

## Do
1. `games.js` `flashOutcome`: keep `trials` and `accuracy`. Return `correct: null`.
2. `app.js` `letter_flash`: replace the pass or fail message with a neutral one
   („Atlikta“). No star, no retry.
3. Update `tests/games.test.js`.
4. `SPEC.md` §5: accuracy is recorded, and nothing passes. Exclude this type from
   first-attempt accuracy in `weekly_stats` if `correct: null` does not already.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- Past rows are untouched: state how old `correct: true/false` entries still read.
- Screenshot of the end of a flash item.

## Not yours
Merging. Stop at PR-open.
