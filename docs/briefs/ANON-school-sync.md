# ANON-school-sync — school-sync uses learner ids `h` / `l`

Brief date: 2026-10-19 · decision #8 · Repo: **`kbl707/school-sync`**
(private, source `~/Documents/python/school-sync`) · Branch: `anon-ids`
Executor: Sonnet, effort medium · Size: S
Runs in parallel with `ANON-ids-site`, which owns the DB migration for all
tables. This brief changes school-sync's code only.

Read nmpp-trainer's `docs/BRIEF.md` and decision #8, school-sync's README
and SPEC, then this file. This file is the whole task. The repo is private,
so its docs may keep names; the change here is the **ids** written to the
shared DB.

## Goal
After the nmpp-trainer migration renames learner ids to `h` / `l`,
school-sync writes and reads `h` / `l`. The Keychain items keep their
current names (`EDUKA_USER_<H suffix>`, …): don't rename secrets. Map the id to
the Keychain suffix in one place.

## Scope
- `sync/lib/supabase.mjs`: `ALL_LEARNERS = ['h', 'l']`, plus wherever ids
  turn into Keychain names, env names or digest labels. Add an explicit map,
  e.g. `{ h: '<H suffix>', l: '<L suffix>' }`, for the Keychain and env names only.
- `supabase/school.sql`: the checks become `learner in ('h','l')`, matching
  the live DB after the migration. This file is documentation; school-sync
  doesn't apply it.
- `test/`: update the fixtures to `h` / `l`. All tests pass.
- The digest e-mail is private (it goes to the parents), so it may show
  names. If labels come from the ids, map `h` → H's name in the digest only,
  or show H / L. Choose the smaller change and say which in the PR.

## Tracer bullet first
Run `node --test` with ids switched in one module, then widen. Do not run
the real sync against the live DB before the cut-over: the live DB still
says `<old H id>` / `<old L id>` until the advisor applies the migration.

## Acceptance (paste in the PR)
- `node --test` output, all green
- `git grep -n -E "['\"](h[e]nris|l[i]lija)['\"]" -- sync test supabase` →
  nothing except the Keychain/env map
- the dry-run, if the code has one, or a description of how the advisor
  should verify the first real run after the cut-over

## Not yours
Merging, `scripts/install-local.sh`, and the live run. The advisor does them
at the cut-over, together with nmpp-trainer's `ANON-ids-site`. Stop at
PR-open.
