-- Migration: apply with the advisor session (not applied by the executor).
-- Least-privilege grants (2026-10-18)
-- RLS alone was blocking writes; take the table-level privileges away too.
-- Safe to re-run. Sweep 2026-10-18 #2, #3, #7.

-- 1. Nothing by default for the public-facing roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 2. Re-grant exactly what the app uses.
grant select on task_sets, progress to anon;
grant insert (task_set_id, answers, correct_count, total_autochecked,
              duration_seconds, interrupted, learner, submitted_at)
  on results to anon;

-- 3. Functions: the anon key may call the app's RPCs; nobody else needs to.
--    add_stars is kept because cached iPad pages may still call it.
--    chest_roll is internal (called from open_chest) and was granted to
--    authenticated only.
revoke execute on function add_stars(uuid, int), chest_ready(uuid),
  open_chest(uuid, int), record_progress(uuid), weekly_stats(text),
  week_status(text), chest_roll(uuid, int) from public, authenticated;
grant execute on function add_stars(uuid, int), chest_ready(uuid),
  open_chest(uuid, int), record_progress(uuid), weekly_stats(text),
  week_status(text) to anon;

-- 4. New tables/functions created later don't get these grants back.
alter default privileges in schema public revoke all on tables
  from anon, authenticated;
alter default privileges in schema public revoke all on functions
  from anon, authenticated;
-- Postgres gives PUBLIC execute on every new function; the schema-scoped revoke
-- above cannot remove that, so revoke it for objects created by postgres.
-- Future RPCs must `grant execute ... to anon` explicitly (as above).
alter default privileges for role postgres revoke execute on functions
  from public;
alter default privileges in schema public revoke all on sequences
  from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
-- Not changed: supabase_admin's default ACL in public (postgres cannot alter it).

-- 5. FK lookups on results (sweep #7).
create index if not exists results_task_set_id_idx on results (task_set_id);
