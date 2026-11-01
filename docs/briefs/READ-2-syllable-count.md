# READ-2 — record syllables with every tablet read

Brief date: 2026-11-01 · decision #12 · Branch: `read-syllable-count`
Executor: Sonnet, effort low · Size: S

Read `docs/BRIEF.md`, decision #12, then this file. This file is the whole task.

## Why
Longer words can look like slower reading and shorter words like progress.
Research rank 3.

## Do
1. `app.js`, `read_aloud`: count syllables from `data.syllables` (segments split on
   `-`, per word). If `data.syllables` is missing, omit the field.
2. Add `syllable_count` next to `word_count` inside the recorded `answer`.
3. Put the counter in `games.js` as a pure function and test it in
   `tests/games.test.js`, with `"Ma-ma vi-rė ko-šę."` giving 6.
4. `SPEC.md` §13.4: add the field.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- One recorded answer from a local run, showing `word_count` and `syllable_count`.

## Not yours
Merging. Stop at PR-open.
