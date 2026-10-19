# FIX-ci-check — nothing deploys without a check

Brief date: 2026-10-18 · from sweep `docs/sweeps/2026-10-18.md` #5
Branch: `fix-ci-check` · Executor: Sonnet, effort medium · Size: M
Can run in parallel with `FIX-anon-grants` and `FIX-pin-supabase-js`
(different files).

Start by reading `docs/BRIEF.md`, then this file. This file is the whole task.

## Why
`.github/workflows/deploy.yml` deploys every push to `master` straight to
the children's page. There is no syntax check and no test. `games.js` holds
pure scorers, and `svg.js` sanitises SVG that comes from DB content.

## Scope (your files only)
- `.github/workflows/deploy.yml`: add a `check` job and `needs: check` on
  `deploy`
- `tests/` (new): `games.test.js` and, if feasible, `svg.test.js`
- `README.md`: a short "Checks" paragraph on how to run them locally

No app code changes. If a test reveals a bug, don't fix it: mark the test
`skip` with a comment and report it in the PR.

## Tracer bullet first
1. Add the `check` job with only `node --check app.js games.js svg.js`
   and `python3 -m py_compile scripts/stamp-version.py`, plus `deploy:
   needs: check`. Use Node 20 via `actions/setup-node@v4`.
2. Push the branch and open a draft PR. The workflow runs only on
   `master`, so add `pull_request:` to `on:` and gate the deploy job with
   `if: github.event_name != 'pull_request'`. Confirm the check job runs
   green on the PR and that deploy is skipped there.

Then widen.

## Widen
- `tests/games.test.js` with `node:test` + `node:assert`. Load `games.js`
  the way the sweep did, with a stubbed `window` (read how `games.js`
  exports). Cover `scoreEyeTrack`, `flashOutcome` and `huntOutcome`, plus
  the `line_find` and `trace` scorers if present. Include the sweep's
  values: `scoreEyeTrack([1000,5000],[1200,9000],1200,350)` →
  `{hits:1,misses:1,false_taps:1,rt_ms:[200]}`; empty inputs → zeros, no
  throw.
- `tests/svg.test.js` only if `svg.js` runs in node without a DOM. If it
  needs `DOMParser`, skip it and say so in the PR; don't add a dependency.
  If it runs: `<script>`, `on*=` attributes, `javascript:` hrefs and
  over-4 KB input are rejected or stripped, and a plain clock face passes.
- Add `node --test tests/` to the check job.
- No `package.json` or npm dependencies (decision #4, no build step).

## Acceptance (paste in the PR)
- A link to the green PR check run, and the deploy job shown as skipped on
  the PR
- `node --test tests/` output, run locally
- a deliberately broken commit on the branch (e.g. a syntax error in
  `games.js`) showing the check fails, then reverted

## Stop and report if
- adding `pull_request` would deploy from a PR in any way
- `games.js` can't be loaded in node without changing it

## Not yours
Merging. The advisor reviews and merges, and the first master run after
the merge (check, then deploy) is the live verification.
