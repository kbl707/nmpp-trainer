# FIX-stars-once-per-set — a replayed set earns no stars

Brief date: 2026-10-18 · decision #6 · sweep `docs/sweeps/2026-10-18.md` #1
Branch: `fix-stars-once-per-set` · Executor: Sonnet, effort medium · Size: S
**Starts only after `FIX-anon-grants` is merged**, because both edit
`supabase/schema.sql`. Branch from `master` after that merge.

Start by reading `docs/BRIEF.md`, SPEC §7.1 and §7.4, then this file. This
file is the whole task.

## Why
`record_progress(set_id)` guards against double credit per **result row**
(`results.stars_credited`), not per **set**. When a finished set is replayed
it gets a new row, and that row is credited again. Live example: set
`0f7e7fb5-…` has two rows four minutes apart, both credited. The chest is
already once per set; stars must be too (decision #6).

## Rule
- A set earns stars once: from the first non-interrupted result row of that
  set that `record_progress` credits.
- A later row of the same set is a replay. It is marked `stars_credited =
  true` (so reloads stay no-ops), adds 0 to `progress.total_stars`, gets no
  chest (as today) and no "Dviguba diena" multiplier. Streak and badges are
  recomputed as normal; nothing about them changes.
- A missed day opened with `?date=` (catch-up, SPEC §8) is a first
  completion, not a replay, and earns stars as today.
- Stars already credited by past replays stay. No clawback.

## Scope (your files only)
- `supabase/schema.sql`, `record_progress` only:
  - pick the latest **non-interrupted** row (today it takes the latest of
    any kind)
  - detect a replay with `exists (select 1 from results r where
    r.task_set_id = v_result.task_set_id and r.id <> v_result.id and
    r.stars_credited and not r.interrupted)`
  - return a new column `replay boolean`. The return type changes, so keep
    the existing `drop function if exists` pattern and re-grant `execute` to
    `anon` only, matching `FIX-anon-grants`
  - the already-credited branch must also return `set_stars = 0, replay =
    true` for a replay row, so a reload doesn't show "+n"
- `supabase/migrations/2026-10-XX-stars-once-per-set.sql` (new), with the
  same function.
- `app.js` end screen (around `shownStars`, ~line 2283): when
  `reward.replay`, show `⭐ Šio rinkinio žvaigždutės jau įskaitytos` in
  place of `⭐ +N`, with no confetti. Keep the gentle tone (SPEC §7: no
  harsh feedback). Old clients ignore the extra column.
- SPEC §7.1: one sentence stating the rule. README "Rewards": the same
  sentence.

## Tracer bullet first
In one `begin; … rollback;` on project `loccjeqdokzazmjgsyxj` (decision
#5: never commit test rows):
1. Create the new function.
2. Insert a test set (title `TEST — bus ištrinta`, date `2099-01-01`,
   learner `<old H id>`) with one auto-checked item, plus one results row with
   a correct answer.
3. Call `record_progress` and note `total_stars`.
4. Insert a second row for the same set and call it again: `set_stars = 0`,
   `replay = true`, `total_stars` unchanged.
5. Roll back.

Then do the UI.

## Acceptance (paste in the PR)
- The output of the transaction above, plus: calling `record_progress` a
  third time on the replay row (a reload) still returns `set_stars = 0,
  replay = true`.
- An interrupted row first, then a completed row, for a new test set: the
  completed row earns stars (not a replay).
- A screenshot from the local preview (`python3 -m http.server 8123`) of
  the end screen with `replay = true`. Stub the RPC response if needed;
  don't write to the live DB to get it.
- `node --check app.js`.

## Stop and report if
- `open_chest` or `chest_ready` relies on the row that `record_progress`
  picks in a way the "latest non-interrupted" change breaks
- there is any other path that adds to `progress.total_stars`

## Not yours
Applying the migration to the live DB, and the deploy. Stop at PR-open. The
advisor applies the migration, verifies on the live site, and writes the
ops-log line.
