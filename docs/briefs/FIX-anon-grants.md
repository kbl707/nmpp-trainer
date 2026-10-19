# FIX-anon-grants — least-privilege grants for anon/authenticated

Brief date: 2026-10-18 · from sweep `docs/sweeps/2026-10-18.md` #2, #3, #7
Branch: `fix-anon-grants` · Executor: Sonnet, effort medium · Size: S

Start by reading `docs/BRIEF.md`, then this file. This file is the whole task.

## Why
Right now RLS is the only thing stopping writes. `anon` and `authenticated`
have table-level `INSERT/UPDATE/DELETE/TRUNCATE` on `task_sets`, `progress`,
`results`, `school_grades` and `weekly_reviews`; writes fail only because no
write policy exists, so one permissive policy added later would open them.
All six RPCs can also be executed by `PUBLIC` and `authenticated`, which
need no access at all.

## Scope (your files only)
- `supabase/schema.sql`: append one clearly headed block, "Least-privilege
  grants (2026-10-18)", that is safe to re-run.
- `supabase/migrations/2026-10-18-anon-grants.sql` (new): the same SQL as a
  standalone migration, so the advisor can apply it.

Do not touch `record_progress` (that is `FIX-stars-once-per-set`, which runs
after this brief), `app.js`, HTML, or any DB rows.

## What the SQL does
1. `revoke all on all tables in schema public from anon, authenticated;`
2. Re-grant exactly what the app uses:
   - `grant select on task_sets, progress to anon;`
   - the existing column-level `grant insert (task_set_id, answers,
     correct_count, total_autochecked, duration_seconds, interrupted,
     learner, submitted_at) on results to anon;`
3. Functions: `revoke execute on function add_stars(uuid,int),
   chest_ready(uuid), open_chest(uuid,int), record_progress(uuid),
   weekly_stats(text), week_status(text) from public, authenticated;` and
   keep or re-grant `execute ... to anon` on all six. Keep `add_stars`,
   because cached iPad pages may still call it.
4. `alter default privileges in schema public revoke all on tables from
   anon, authenticated;` and the same for functions, so new tables don't
   get the grants back.
5. `create index if not exists results_task_set_id_idx on results
   (task_set_id);` (sweep #7).

Find any other table that anon reads first: grep `app.js`, `h/`, `l/` and
`<old L path>/` for `.from(`. If one exists that is not listed above, stop and
report.

## Tracer bullet first
Before writing the full file, prove the method on one table. Use
`execute_sql` on project `loccjeqdokzazmjgsyxj` inside a transaction that
is rolled back:

```sql
begin;
revoke all on task_sets from anon;
grant select on task_sets to anon;
set local role anon;
select count(*) from task_sets;                    -- works
insert into task_sets(scheduled_date,subject,title,items)
  values ('2099-01-01','pratimai','TEST — bus ištrinta','[]');  -- must fail: permission denied
rollback;
```

Then widen to the full SQL, still inside `begin; … rollback;`.

## Acceptance (paste the output in the PR)
Run the full migration inside `begin; … ; rollback;` and, before the
rollback, as `set local role anon`:
- `select count(*) from task_sets` and `select * from progress` work
- `insert into results (task_set_id, answers, correct_count,
  total_autochecked, duration_seconds, learner) select id, '[]', 0, 0, 0,
  learner from task_sets limit 1` works (it is rolled back)
- `update progress set total_stars = 0`, `delete from results`,
  `insert into task_sets …`, `select * from results` and
  `select * from school_grades` all fail with "permission denied"
- `select * from weekly_stats('<old H id>')` and `select * from
  week_status('<old L id>')` work
- after `reset role; set local role authenticated;`, `select * from
  weekly_stats('<old H id>')` fails

Also paste `select grantee, table_name, string_agg(privilege_type, ',')
from information_schema.role_table_grants where grantee in
('anon','authenticated') and table_schema='public' group by 1,2;`, run
inside the transaction after the migration.

## Stop and report if
- any write the feedback-loop sessions or the school sync make would use
  `anon` or `authenticated` rather than `postgres`/`service_role` (check
  `sync_runs` for a hint, but read nothing else from those tables)
- the live schema differs from `schema.sql` in a way that touches these
  grants

## Not yours
Applying the migration to the live DB. Stop at PR-open. The advisor reviews,
applies it, checks the live site loads both trainers and the timetables,
and writes the ops-log line.
