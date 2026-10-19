# FIX-streak-today — an unfinished today doesn't break the streak

Brief date: 2026-10-19 · found in the review of PR #4 (BRIEF open item)
Branch: `fix-streak-today` · Executor: Sonnet, effort medium · Size: S

Start by reading `docs/BRIEF.md`, SPEC §7.1 and §8 (catch-up `?date=`), then
this file. This file is the whole task.

## Why
`record_progress` (`supabase/schema.sql`, the streak loop) walks the
learner's scheduled days backwards from **today** and stops at the first day
with no completed set. If today has a set that isn't done yet, the loop stops
straight away and writes `streak = 0`. That is exactly what happens when the
child finishes a missed day through `?date=` (catch-up) before doing today's
set. The end screen then shows no 🔥, and `progress.streak` drops to 0 even
though no day was missed. The same happens when the RPC is called early in
the day for any reason.

## Rule
Today counts only once it is done. While today's set is unfinished, start
counting from the most recent earlier scheduled day. A past scheduled day with
no completed set still breaks the streak, as today. Days without a
`task_set` are skipped, as today.

## Scope (your files only)
- `supabase/schema.sql`: the streak loop inside `record_progress` only. Skip
  `v_today` when it is not completed; nothing else changes. The rest of the
  function is what PR #4 shipped (set-row lock, replay, interrupted-only
  rules), so keep it byte-identical apart from the loop.
- `supabase/migrations/2026-10-19-streak-today.sql` (new). Use `create or
  replace function` (the return type is unchanged), and keep `execute`
  anon-only: re-run `revoke … from public, authenticated; grant … to anon`.
- SPEC §7.1: one sentence stating the rule.

Don't touch `app.js`, `week_status`, `weekly_stats`, or any other function.
If `week_status` or the badge `savaites_ugnis` counts streaks differently,
note it in the PR and don't change it.

## Tracer bullet first
Run this in one `begin; … rollback;` on project `loccjeqdokzazmjgsyxj` (use
the Supabase MCP `execute_sql`; never commit; test rows titled
`TEST — bus ištrinta`; decision #5):
1. Create the new function.
2. For a test learner context, use `<old H id>` but only TEST sets dated in the
   past, plus one dated `current_date` in Vilnius time. Arrange it so that
   yesterday and the day before are completed and today is not, then
   complete a catch-up set for an earlier missed day.
3. Call `record_progress` as `set local role anon` and show that `streak`
   is not 0 and counts yesterday backwards.
4. Roll back, then confirm 0 TEST rows and `progress` unchanged.

TEST sets dated in the past mix with H's real days. If that makes the
expected number hard to state, compute the expected streak with a query
first and compare against it; don't hard-code it.

## Acceptance (paste in the PR)
- the transaction output for three cases: (a) today unfinished plus a
  catch-up → streak counts from yesterday; (b) today finished → today is
  included; (c) a missed past day → the streak stops there
- a diff showing only the loop changed between `schema.sql`'s
  `record_progress` and the migration, compared with master
- the ACL after the function is created inside the transaction: anon only
- CI `check` green on the PR

## Stop and report if
- the live `record_progress` differs from `schema.sql` on master (other
  than whitespace)
- fixing it needs a change outside the loop

## Not yours
Applying the migration, merging, deploy. Stop at PR-open. The advisor
reviews, applies, live-verifies and writes the ops-log line.
