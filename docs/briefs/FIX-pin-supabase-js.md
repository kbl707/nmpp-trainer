# FIX-pin-supabase-js — pin the one external script

Brief date: 2026-10-18 · from sweep `docs/sweeps/2026-10-18.md` #6
Branch: `fix-pin-supabase-js` · Executor: Sonnet, effort medium · Size: S
Can run in parallel with `FIX-anon-grants` and `FIX-ci-check`
(different files).

Start by reading `docs/BRIEF.md`, then this file. This file is the whole task.

## Why
`index.html:37` and `<old L path>/index.html:39` load
`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js`
with a floating major version and no `integrity`. Any new 2.x release, a
compromised one, or a CDN problem changes both trainers with no commit here.

## Scope (your files only)
`index.html` and `<old L path>/index.html`, the supabase-js `<script>` tag only.
Check whether `h/index.html` and `l/index.html` load supabase-js too. If
they do, leave them alone: those files come from an external generator, so
list them in the PR for the operator.

## Do
1. Find the exact version jsDelivr serves now for `@2`, e.g. `curl -sI` the
   URL above and read the resolved version, or `npm view
   @supabase/supabase-js version`. Use the version **currently served**, so
   that behaviour doesn't change.
2. Replace `@2` with `@<exact>` in both files and add
   `integrity="sha384-…" crossorigin="anonymous"`. Compute the hash from
   the exact file: `curl -s <url> | openssl dgst -sha384 -binary | openssl
   base64 -A`.
3. Check that `scripts/stamp-version.py` leaves the external tag alone and
   still passes: `python3 scripts/stamp-version.py abc1234` (it needs a 7-hex-char sha) on a scratch
   copy of the repo, not the working tree.

## Tracer bullet first
Do `index.html` only, then serve it locally (`python3 -m http.server
8123`). Confirm today's set loads, there are no console errors, and the
network tab shows the pinned URL with a 200. Then do `<old L path>/index.html`.

## Acceptance (paste in the PR)
- the exact version and the hash command output
- for both `/` and `/<old L path>/` in the local preview: a console with no SRI
  or other errors, and today's set rendering (screenshot)
- the `stamp-version.py` scratch run output

## Not yours
Merging and deploy. After deploy the advisor checks both live pages load,
the footer shows the new sha, and the console is clean.
