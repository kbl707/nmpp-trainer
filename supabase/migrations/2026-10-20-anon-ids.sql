-- Migration: apply with the advisor session (not applied by the executor).
-- Decision #8: the long learner ids become 'h'/'l' in every table,
-- column defaults and the two RPC parameter defaults follow. Ids only; no
-- other data changes. Run in the evening cut-over together with the site PR
-- (the old site stops finding sets the moment this commits).
begin;

do $$
declare
  t text;
begin
  foreach t in array array['task_sets', 'results', 'progress', 'school_focus',
      'school_grades', 'school_topics', 'sync_runs', 'weekly_reviews'] loop
    if exists (select 1 from pg_constraint
               where conrelid = format('public.%I', t)::regclass
                 and conname = t || '_learner_check') then
      execute format('alter table public.%I drop constraint %I', t, t || '_learner_check');
    end if;

    -- the two long ids start with 'h' and 'l'; no other value exists
    execute format('update public.%I set learner = left(learner, 1) where length(learner) > 1', t);

    -- re-add only where a check existed (sync_runs never had one)
    if t <> 'sync_runs' then
      execute format('alter table public.%I add constraint %I check (learner in (''h'',''l''))',
        t, t || '_learner_check');
    end if;
  end loop;
end $$;

alter table task_sets alter column learner set default 'h';
alter table results   alter column learner set default 'h';

-- Parameter defaults can only change through drop + create. Bodies are the
-- ones in supabase/schema.sql, unchanged apart from the default.
drop function weekly_stats(text);
drop function week_status(text);

create or replace function weekly_stats(p_learner text default 'h')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Europe/Vilnius')::date as d),
  done as (
    select r.id as result_id, t.scheduled_date, r.answers, t.items,
      r.stars_multiplier,
      coalesce((r.chest_reward->'reward'->>'stars')::int, 0) as chest_stars
    from results r
    join task_sets t on t.id = r.task_set_id
    cross join today
    where r.interrupted = false
      and t.learner = p_learner
      and t.scheduled_date between today.d - 6 and today.d
  ),
  ans as (
    select d.result_id, d.scheduled_date, a.value as a,
      (select i->>'type' from jsonb_array_elements(d.items) i
        where i->>'id' = a.value->>'item_id' limit 1) as itype
    from done d
    cross join lateral jsonb_array_elements(d.answers) a
  ),
  scored as (
    select scheduled_date, itype,
      (a->>'correct')::boolean as ok,
      coalesce((a->>'seconds')::numeric, 0) as secs
    from ans
    where jsonb_typeof(a->'correct') = 'boolean'
  ),
  -- answer stars x the day's multiplier (Dviguba diena), plus chest stars (§7.4)
  stars as (
    select (
      coalesce((select sum(
        case when (ans.a->>'correct')::boolean is true
             then least(greatest(coalesce((ans.a->>'stars')::int, 0), 0), 2)
             else 0 end * d.stars_multiplier
      ) from ans join done d on d.result_id = ans.result_id), 0)
      + coalesce((select sum(chest_stars) from done), 0)
    )::int as n
  ),
  by_day as (
    select scheduled_date,
      extract(isodow from scheduled_date)::int as dow,
      count(*)::int as total,
      (count(*) filter (where ok))::int as correct,
      round(100.0 * count(*) filter (where ok) / count(*))::int as accuracy_pct,
      round(avg(secs), 1) as avg_seconds
    from scored
    group by scheduled_date
  ),
  by_type as (
    select itype as type,
      count(*)::int as total,
      (count(*) filter (where ok))::int as correct,
      round(100.0 * count(*) filter (where ok) / count(*))::int as accuracy_pct
    from scored
    where itype is not null
    group by itype
  ),
  -- L extras (SPEC.md §13): read_aloud answers carry words_per_minute
  -- and error_words[] inside `answer` (never scored/autochecked, so they
  -- don't appear in `scored` above).
  wpm_rows as (
    select scheduled_date, (a->'answer'->>'words_per_minute')::numeric as wpm
    from ans
    where itype = 'read_aloud' and a->'answer'->>'words_per_minute' is not null
      and coalesce((a->>'rushed')::boolean, false) = false  -- tap-through reads (§13.4)
  ),
  wpm_by_day as (
    select scheduled_date, extract(isodow from scheduled_date)::int as dow,
      round(avg(wpm), 1) as avg_wpm
    from wpm_rows
    group by scheduled_date
  ),
  error_words as (
    select trim(both '"' from w::text) as word
    from ans
    cross join lateral jsonb_array_elements(coalesce(a->'answer'->'error_words', '[]'::jsonb)) w
    where itype = 'read_aloud'
  ),
  top_errors as (
    select word, count(*)::int as n
    from error_words
    where word <> ''
    group by word
    order by n desc, word
    limit 10
  )
  select jsonb_build_object(
    'sets_completed', (select count(*) from done),
    'total_items', (select count(*) from scored),
    'correct_items', (select count(*) from scored where ok),
    'accuracy_pct', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0))::int from scored),
    'avg_seconds_per_item', (select round(avg(secs), 1) from scored),
    'stars_earned', (select n from stars),
    'best_day', (select to_jsonb(b) from (
        select scheduled_date as date, dow, accuracy_pct, total
        from by_day order by accuracy_pct desc, total desc limit 1) b),
    'fastest_day', (select to_jsonb(f) from (
        select scheduled_date as date, dow, avg_seconds
        from by_day order by (total >= 5) desc, avg_seconds asc limit 1) f),
    'by_type', coalesce((select jsonb_agg(to_jsonb(t) order by t.total desc) from by_type t), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object(
        'date', scheduled_date, 'dow', dow, 'total', total, 'correct', correct,
        'accuracy_pct', accuracy_pct, 'avg_seconds', avg_seconds) order by scheduled_date) from by_day), '[]'::jsonb),
    'avg_wpm_by_day', coalesce((select jsonb_agg(jsonb_build_object(
        'date', scheduled_date, 'dow', dow, 'avg_wpm', avg_wpm) order by scheduled_date) from wpm_by_day), '[]'::jsonb),
    'syllable_build_accuracy_pct', (select accuracy_pct from by_type where type = 'syllable_build' limit 1),
    'comprehension_accuracy_pct', (select accuracy_pct from by_type where type = 'choice' limit 1),
    'top_error_words', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'count', n)) from top_errors), '[]'::jsonb)
  );
$$;


create or replace function week_status(p_learner text default 'h')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Europe/Vilnius')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', s.scheduled_date, 'total', s.total, 'done', s.done,
      'correct', s.correct, 'scored', s.scored) order by s.scheduled_date), '[]'::jsonb)
  from (
    select t.scheduled_date,
      count(*)::int as total,
      (count(r.id))::int as done,
      coalesce(sum(r.correct_count), 0)::int as correct,
      coalesce(sum(r.total_autochecked), 0)::int as scored
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
    group by t.scheduled_date
  ) s;
$$;


revoke execute on function weekly_stats(text), week_status(text) from public, authenticated;
grant execute on function weekly_stats(text), week_status(text) to anon;

commit;
