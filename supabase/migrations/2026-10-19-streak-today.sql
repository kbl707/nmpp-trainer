-- Migration: apply with the advisor session (not applied by the executor).
-- An unfinished today no longer breaks the streak (FIX-streak-today). Only the
-- streak loop changes; return type is unchanged. execute stays anon-only.
begin;

create or replace function record_progress(p_set_id uuid)
returns table(total_stars int, streak int, badges jsonb, new_badges jsonb, set_stars int,
              chest_ready boolean, doubled boolean, replay boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result results%rowtype;
  v_learner text;
  v_set_date date;
  v_today date := (now() at time zone 'Europe/Vilnius')::date;
  v_computed_stars int;
  v_mult int := 1;
  v_replay boolean;
  v_chest jsonb;
  v_streak int := 0;
  v_day record;
  v_existing_badges jsonb;
  v_new_badges jsonb := '[]'::jsonb;
  v_completed_count int;
  v_quickmath_fast_count int;
  v_has_perfect boolean;
begin
  -- Serialise all calls for one set: a concurrent call waits here and then sees
  -- the first call's committed stars_credited, so a set can't be credited twice.
  perform 1 from task_sets where id = p_set_id for update;

  select * into v_result
  from results
  where task_set_id = p_set_id
  order by interrupted, submitted_at desc
  limit 1;

  if v_result.id is null then
    raise exception 'no results row found for set_id %', p_set_id;
  end if;

  select t.learner, t.scheduled_date into v_learner, v_set_date
  from task_sets t where t.id = v_result.task_set_id;

  -- Only a completed (non-interrupted) result can earn (decision #6). The pick
  -- above prefers non-interrupted rows, so an interrupted one here means the set
  -- has none: credit nothing, leave the row untouched, return current progress.
  if v_result.interrupted then
    select p.total_stars, p.streak, p.badges into total_stars, streak, badges
    from progress p where p.learner = v_learner;
    new_badges := '[]'::jsonb;
    set_stars := 0;
    chest_ready := false;
    doubled := false;
    replay := false;
    return next;
    return;
  end if;

  v_replay := exists (select 1 from results r
                      where r.task_set_id = v_result.task_set_id and r.id <> v_result.id
                        and r.stars_credited and not r.interrupted);

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
    set_stars := case when v_replay then 0 else v_computed_stars * v_result.stars_multiplier end;
    -- a chest that was rolled but not opened yet can still be resumed
    chest_ready := v_result.chest_reward is not null and not (v_result.chest_reward ? 'pick');
    doubled := v_result.stars_multiplier > 1 and not v_replay;
    replay := v_replay;
    return next;
    return;
  end if;

  -- "Dviguba diena" (§7.4): a chest on an earlier day flagged this set's date.
  if not v_replay
     and exists (select 1 from progress p where p.learner = v_learner and p.double_on = v_set_date) then
    v_mult := 2;
  end if;

  -- One chest per completed set: none for an interrupted flush, and none if
  -- another result for the same set already got one (a replayed set). The
  -- three rewards are rolled now, from the result id, and stored — so
  -- neither a refresh nor a different button can change what is inside.
  if not v_result.interrupted
     and not exists (select 1 from results r3
                     where r3.task_set_id = v_result.task_set_id and r3.chest_reward is not null) then
    v_chest := jsonb_build_object('rolls', jsonb_build_array(
      chest_roll(v_result.id, 1), chest_roll(v_result.id, 2), chest_roll(v_result.id, 3)));
  end if;

  update results
    set stars_credited = true, stars_multiplier = v_mult, chest_reward = v_chest
    where id = v_result.id;

  -- streak: walk this learner's scheduled days (that actually have a
  -- task_set) backward from today, counting while each day has at least one
  -- completed set; days with no task_set at all are simply absent from this
  -- list. Today counts only once done (an unfinished today is skipped).
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
    elsif v_day.scheduled_date = v_today then
      continue; -- today isn't done yet: it can't break the streak, count from yesterday
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
    set total_stars = progress.total_stars + case when v_replay then 0 else v_computed_stars * v_mult end,
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
  set_stars := case when v_replay then 0 else v_computed_stars * v_mult end;
  chest_ready := v_chest is not null;
  doubled := v_mult > 1;
  replay := v_replay;
  return next;
end;
$$;

grant execute on function record_progress(uuid) to anon;
revoke execute on function record_progress(uuid) from public, authenticated;

commit;
