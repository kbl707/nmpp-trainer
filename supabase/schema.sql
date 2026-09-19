-- NMPP Daily Trainer — schema + RLS (see SPEC.md §4 and §6)

create extension if not exists pgcrypto;

create table if not exists task_sets (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  subject text not null check (subject in ('matematika','lietuviu','pratimai')),
  title text not null,
  items jsonb not null,          -- array of task items, see SPEC.md §5
  phase int not null default 1,  -- 1..3 (prep phases)
  created_at timestamptz default now(),
  unique (scheduled_date, subject)
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
  submitted_at timestamptz default now()
);

-- progress: single-row lifetime rewards state (see SPEC.md §7.1).
create table if not exists progress (
  id int primary key default 1,
  total_stars int not null default 0,
  streak int not null default 0,
  badges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint progress_single_row check (id = 1)
);

insert into progress (id) values (1) on conflict (id) do nothing;

alter table task_sets enable row level security;
alter table results enable row level security;
alter table progress enable row level security;

-- task_sets: anon may only read rows up to "tomorrow" (timezone slack),
-- never see far-future task sets, and can never write.
create policy "anon can read near-term task_sets"
  on task_sets for select
  to anon
  using (scheduled_date <= (current_date + 1));

-- results: anon may only insert; no read/update/delete.
create policy "anon can insert results"
  on results for insert
  to anon
  with check (true);

-- progress: anon may only read (for the header star badge). The only way
-- to change it is the record_progress() RPC below, which is security definer and
-- so bypasses RLS on progress/results internally, with its own validation.
create policy "anon can read progress"
  on progress for select
  to anon
  using (true);

-- record_progress: called once per completed set (from submitSession in
-- app.js). Recomputes everything from the saved results row: stars (clamped —
-- a correct answer is worth 1 or 2, anything else 0, whatever the client
-- wrote), the day-streak, and any newly earned badges. Guards against
-- double-crediting via results.stars_credited. See SPEC.md §7.1.
create or replace function record_progress(p_set_id uuid)
returns table(total_stars int, streak int, badges jsonb, new_badges jsonb, set_stars int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result results%rowtype;
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
    from progress p where p.id = 1;
    new_badges := '[]'::jsonb;
    set_stars := v_computed_stars;
    return next;
    return;
  end if;

  update results set stars_credited = true where id = v_result.id;

  -- streak: walk scheduled days (that actually have a task_set) backward
  -- from today, counting while each day has at least one completed set;
  -- days with no task_set at all are simply absent from this list.
  for v_day in (
    select d.scheduled_date,
      exists(
        select 1 from results r2
        join task_sets t2 on t2.id = r2.task_set_id
        where t2.scheduled_date = d.scheduled_date and r2.interrupted = false
      ) as completed
    from (select distinct scheduled_date from task_sets where scheduled_date <= v_today) d
    order by d.scheduled_date desc
  ) loop
    if v_day.completed then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
  end loop;

  select p.badges into v_existing_badges from progress p where p.id = 1;

  select count(*) into v_completed_count from results where interrupted = false;

  select count(*) into v_quickmath_fast_count
  from results r
  join task_sets t on t.id = r.task_set_id
  cross join lateral jsonb_array_elements(r.answers) ans
  join lateral jsonb_array_elements(t.items) itm on itm->>'id' = ans->>'item_id'
  where itm->>'type' = 'quick_math'
    and (ans->>'correct')::boolean is true
    and (ans->>'seconds')::numeric < 5;

  select exists(
    select 1 from results
    where interrupted = false and total_autochecked > 0 and correct_count = total_autochecked
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
    where id = 1
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
