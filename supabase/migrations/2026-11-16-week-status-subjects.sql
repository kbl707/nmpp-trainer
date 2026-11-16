-- week_status: add a per-subject breakdown so the timetables can show a
-- two-subject day's sets separately (one done in green, the other a link).
-- Same signature and return type; the existing per-day fields are unchanged.
create or replace function week_status(p_learner text default 'h')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Europe/Vilnius')::date as d),
  per_set as (
    select t.scheduled_date, t.subject,
      (r.id is not null) as done,
      coalesce(r.correct_count, 0) as correct,
      coalesce(r.total_autochecked, 0) as scored
    from task_sets t
    cross join today
    left join lateral (
      select x.id, x.correct_count, x.total_autochecked
      from results x
      where x.task_set_id = t.id and x.interrupted = false
      order by x.submitted_at
      limit 1
    ) r on true
    where t.learner = p_learner
      and t.scheduled_date between today.d - 14 and today.d + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', s.scheduled_date, 'total', s.total, 'done', s.done,
      'correct', s.correct, 'scored', s.scored, 'subjects', s.subjects)
      order by s.scheduled_date), '[]'::jsonb)
  from (
    select scheduled_date,
      count(*)::int as total,
      (count(*) filter (where done))::int as done,
      sum(correct)::int as correct,
      sum(scored)::int as scored,
      jsonb_agg(jsonb_build_object('subject', subject, 'done', done,
        'correct', correct, 'scored', scored) order by subject) as subjects
    from per_set
    group by scheduled_date
  ) s;
$$;
