-- NMPP Daily Trainer — schema + RLS (see SPEC.md §4, §6, §13)

create extension if not exists pgcrypto;

create table if not exists task_sets (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  subject text not null check (subject in ('matematika','lietuviu','pratimai')),
  title text not null,
  items jsonb not null,          -- array of task items, see SPEC.md §5
  phase int not null default 1,  -- 1..3 (prep phases)
  learner text not null default 'henris' check (learner in ('henris','lilija')),
  created_at timestamptz default now(),
  unique (scheduled_date, subject, learner)
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  task_set_id uuid references task_sets(id) not null,
  answers jsonb not null,        -- [{item_id, answer, correct|null, seconds, stars}]
  correct_count int not null,
  total_autochecked int not null,
  duration_seconds int not null, -- whole session
  interrupted boolean default false, -- child abandoned mid-way
  stars_credited boolean not null default false, -- guards record_progress() against double-crediting
  learner text not null default 'henris' check (learner in ('henris','lilija')),
  submitted_at timestamptz default now()
);

-- progress: one row per learner, lifetime rewards state (see SPEC.md §7.1, §13).
create table if not exists progress (
  learner text primary key check (learner in ('henris','lilija')),
  total_stars int not null default 0,
  streak int not null default 0,
  badges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into progress (learner) values ('henris'), ('lilija') on conflict (learner) do nothing;

alter table task_sets enable row level security;
alter table results enable row level security;
alter table progress enable row level security;

-- task_sets: anon may only read rows up to "tomorrow" (timezone slack),
-- never see far-future task sets, and can never write. Same policy serves
-- both learners — the page filters by `learner` itself (SPEC.md §13).
create policy "anon can read near-term task_sets"
  on task_sets for select
  to anon
  using (scheduled_date <= (current_date + 1));

-- results: anon may only insert; no read/update/delete.
create policy "anon can insert results"
  on results for insert
  to anon
  with check (true);

-- progress: anon may only read (for the header star badge, either learner).
-- The only way to change it is the record_progress() RPC below, which is
-- security definer and so bypasses RLS on progress/results internally.
create policy "anon can read progress"
  on progress for select
  to anon
  using (true);

-- record_progress: called once per completed set (from submitSession in
-- app.js). Recomputes everything from the saved results row: stars (clamped —
-- a correct answer is worth 1 or 2, anything else 0, whatever the client
-- wrote), the day-streak, and any newly earned badges — all scoped to the
-- learner that set belongs to (derived from task_sets, never trusted from
-- the client), so Henris and Lilija's progress rows are independent.
-- Guards against double-crediting via results.stars_credited. See SPEC.md §7.1, §13.
create or replace function record_progress(p_set_id uuid)
returns table(total_stars int, streak int, badges jsonb, new_badges jsonb, set_stars int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result results%rowtype;
  v_learner text;
  v_today date := (now() at time zone 'Europe/Vilnius')::date;
  v_computed_stars int;
  v_streak int := 0;
  v_day record;
  v_existing_badges jsonb;
  v_new_badges jsonb := '[]'::jsonb;
  v_completed_count int;
  v_quickmath_fast_count int;
  v_has_perfect boolean;
begin
  select * into v_result
  from results
  where task_set_id = p_set_id
  order by submitted_at desc
  limit 1;

  if v_result.id is null then
    raise exception 'no results row found for set_id %', p_set_id;
  end if;

  select t.learner into v_learner from task_sets t where t.id = v_result.task_set_id;

  -- Stars are recomputed from the stored answers and clamped: a correct
  -- answer is worth 1 or 2, anything else 0, whatever the client wrote.
  select coalesce(sum(
    case when (a->>'correct')::boolean is true
         then least(greatest(coalesce((a->>'stars')::int, 0), 0), 2)
         else 0 end
  ), 0) into v_computed_stars
  from jsonb_array_elements(v_result.answers) a;

  if v_result.stars_credited then
    -- already credited (e.g. duplicate call after a reload) — no-op
    select p.total_stars, p.streak, p.badges into total_stars, streak, badges
    from progress p where p.learner = v_learner;
    new_badges := '[]'::jsonb;
    set_stars := v_computed_stars;
    return next;
    return;
  end if;

  update results set stars_credited = true where id = v_result.id;

  -- streak: walk this learner's scheduled days (that actually have a
  -- task_set) backward from today, counting while each day has at least one
  -- completed set; days with no task_set at all are simply absent from this
  -- list.
  for v_day in (
    select d.scheduled_date,
      exists(
        select 1 from results r2
        join task_sets t2 on t2.id = r2.task_set_id
        where t2.scheduled_date = d.scheduled_date and t2.learner = v_learner and r2.interrupted = false
      ) as completed
    from (select distinct scheduled_date from task_sets where scheduled_date <= v_today and learner = v_learner) d
    order by d.scheduled_date desc
  ) loop
    if v_day.completed then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
  end loop;

  select p.badges into v_existing_badges from progress p where p.learner = v_learner;

  select count(*) into v_completed_count
  from results r join task_sets t on t.id = r.task_set_id
  where r.interrupted = false and t.learner = v_learner;

  select count(*) into v_quickmath_fast_count
  from results r
  join task_sets t on t.id = r.task_set_id
  cross join lateral jsonb_array_elements(r.answers) ans
  join lateral jsonb_array_elements(t.items) itm on itm->>'id' = ans->>'item_id'
  where t.learner = v_learner
    and itm->>'type' = 'quick_math'
    and (ans->>'correct')::boolean is true
    and (ans->>'seconds')::numeric < 5;

  select exists(
    select 1 from results r join task_sets t on t.id = r.task_set_id
    where r.interrupted = false and t.learner = v_learner
      and r.total_autochecked > 0 and r.correct_count = r.total_autochecked
  ) into v_has_perfect;

  if v_completed_count >= 5 and not (v_existing_badges @> '["pirma_savaite"]') then
    v_new_badges := v_new_badges || '["pirma_savaite"]'::jsonb;
  end if;
  if v_quickmath_fast_count >= 20 and not (v_existing_badges @> '["daugybos_meistras"]') then
    v_new_badges := v_new_badges || '["daugybos_meistras"]'::jsonb;
  end if;
  if v_has_perfect and not (v_existing_badges @> '["be_klaidu"]') then
    v_new_badges := v_new_badges || '["be_klaidu"]'::jsonb;
  end if;
  if v_streak >= 5 and not (v_existing_badges @> '["savaites_ugnis"]') then
    v_new_badges := v_new_badges || '["savaites_ugnis"]'::jsonb;
  end if;

  update progress
    set total_stars = progress.total_stars + v_computed_stars,
        streak = v_streak,
        badges = (
          select coalesce(jsonb_agg(distinct b), '[]'::jsonb)
          from jsonb_array_elements_text(progress.badges || v_new_badges) b
        ),
        updated_at = now()
    where learner = v_learner
    returning progress.total_stars, progress.streak, progress.badges
    into total_stars, streak, badges;

  new_badges := v_new_badges;
  set_stars := v_computed_stars;
  return next;
end;
$$;

grant execute on function record_progress(uuid) to anon;

-- Back-compat for clients still calling the old name; the stars argument
-- was never trusted and is now ignored entirely.
create or replace function add_stars(p_set_id uuid, p_stars int)
returns table(total_stars int, streak int, badges jsonb, new_badges jsonb)
language sql
security definer
set search_path = public
as $$
  select r.total_stars, r.streak, r.badges, r.new_badges from record_progress(p_set_id) r;
$$;

grant execute on function add_stars(uuid, int) to anon;

-- weekly_stats(learner): aggregates only for the last 7 Vilnius-local days,
-- scoped to one learner (SPEC.md §7.2, §13). Security definer so it can read
-- results, but it never returns raw answers. Defaults to 'henris' so old
-- clients calling weekly_stats() with no args keep working. The Lilija-only
-- fields (avg_wpm_by_day, syllable_build_accuracy_pct,
-- comprehension_accuracy_pct, top_error_words) are cheap to compute for
-- everyone and are simply empty/null for a learner with no such items.
create or replace function weekly_stats(p_learner text default 'henris')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Europe/Vilnius')::date as d),
  done as (
    select r.id as result_id, t.scheduled_date, r.answers, t.items
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
  stars as (
    select coalesce(sum(
      case when (a->>'correct')::boolean is true
           then least(greatest(coalesce((a->>'stars')::int, 0), 0), 2)
           else 0 end
    ), 0)::int as n
    from ans
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
  -- Lilija extras (SPEC.md §13): read_aloud answers carry words_per_minute
  -- and error_words[] inside `answer` (never scored/autochecked, so they
  -- don't appear in `scored` above).
  wpm_rows as (
    select scheduled_date, (a->'answer'->>'words_per_minute')::numeric as wpm
    from ans
    where itype = 'read_aloud' and a->'answer'->>'words_per_minute' is not null
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

grant execute on function weekly_stats(text) to anon;
