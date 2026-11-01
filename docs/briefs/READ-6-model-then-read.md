# READ-6 — hear a phrase, then read it

Brief date: 2026-11-01 · decision #12 · Branch: `read-model-then-read`
Executor: Sonnet, effort medium · Size: M
**Hold.** It needs an operator decision on the voice, after READ-5 and the baseline.

Read `docs/BRIEF.md`, decision #12, SPEC §13.4, then this file. This file is the
whole task.

## Why
Hearing a model before reading has moderate evidence. Research rank 6.

## Decide first (operator)
Whose voice: a parent's recordings, or the iPad's Lithuanian voice. Check that the
voice exists on her iPad first. No child audio is recorded or uploaded.

## Do
- Optional `data.model_audio`: one audio URL per phrase in `data.phrases`, served
  from this repo's static files. Add the listen step before the first tap.
- L listens to a phrase, the audio stops, then she reads and taps as usual. No sync
  per word.
- Record `model_plays` in the answer. No star, no speed figure.
- If audio fails to load, go straight to reading.
- Update SPEC §13.4.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- Run on an iPad-width preview, with one failed audio URL shown to fall back.

## Not yours
Recording audio, merging. Stop at PR-open.
