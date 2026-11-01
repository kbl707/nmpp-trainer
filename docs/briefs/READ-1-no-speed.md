# READ-1 — the tablet stops reporting read_aloud as speed

Brief date: 2026-11-01 · decision #12 · Branch: `read-no-speed`
Executor: Sonnet, effort medium · Size: S

Read `docs/BRIEF.md`, decision #12, then this file. This file is the whole task.

## Why
A tap is not a spoken word. The parent's timed read is the only speed measure.
Research rank 1 (`docs/inbox/2026-11-01-l-reading-research.md`).

## Already true, leave it
- `read_aloud` earns no star: `app.js` calls `finalizeItem(..., null, ...)`, so `stars` is 0.
- The child never sees a wpm figure. `weekly_stats` returns `avg_wpm_by_day`, and
  nothing in `app.js` renders it.
- Keep recording `word_times`, `slow_words`, `rushed` and `words_per_minute`. The
  tap-versus-oral comparison and the tap-through check read them.

## Do
1. `app.js`, `read_aloud` review: show the dotted `slow` underline only while the
   „Tėvai: pažymėti klaidas“ toggle is on. A child should not see which words were slow.
2. New migration in `supabase/migrations/`: rename `avg_wpm_by_day` to
   `tap_wpm_by_day` in `weekly_stats`, keeping the `rushed` exclusion. Update
   `supabase/schema.sql` to match. Keep the `grant execute … to anon`.
3. `SPEC.md` §13.4 and the `weekly_stats` table: say this figure is tap rate and
   is never reading speed. Point to decision #12.

## Acceptance (paste in the PR)
- `node --test tests/*.test.js` output, CI green.
- `git grep -n avg_wpm -- app.js supabase/schema.sql SPEC.md` returns nothing.
- Screenshots of the review screen with the toggle off (no underline) and on.

## Not yours
Applying the migration, merging. Stop at PR-open and name the migration file.
