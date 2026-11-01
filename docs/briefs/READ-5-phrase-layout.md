# READ-5 — phrase-cued layout

Brief date: 2026-11-01 · decision #12 · Branch: `read-phrase-layout`
Executor: Sonnet, effort medium · Size: M
**Start only after the baseline.** Do not change tablet reading during it.

Read `docs/BRIEF.md`, decision #12, SPEC §13.4, then this file. This file is the
whole task.

## Why
A line break at each phrase may help a slow reader group words. The evidence is
moderate and English only, so it stays optional per item. Research rank 7.

## Do
- Optional `data.phrases`: an array of strings, each 2 to 5 words, using the same
  hyphenation as `data.syllables`, joining to exactly that text.
- `read_aloud`: if present, render one phrase per line. Word tiles and tap
  behaviour stay as they are. If absent, nothing changes.
- If the phrases do not join to `data.syllables`, ignore them and render as usual.
- Put the check in `games.js` with a test. Update SPEC §13.4.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- iPad-width screenshots with and without `phrases`.

## Not yours
Merging. Stop at PR-open.
