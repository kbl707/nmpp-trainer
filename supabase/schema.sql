-- NMPP Daily Trainer — schema + RLS (see SPEC.md §4 and §6)

create extension if not exists pgcrypto;

create table if not exists task_sets (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  subject text not null check (subject in ('matematika','lietuviu')),
  title text not null,
  items jsonb not null,          -- array of task items, see SPEC.md §5
  phase int not null default 1,  -- 1..3 (prep phases)
  created_at timestamptz default now(),
  unique (scheduled_date, subject)
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  task_set_id uuid references task_sets(id) not null,
  answers jsonb not null,        -- [{item_id, answer, correct|null, seconds}]
  correct_count int not null,
  total_autochecked int not null,
  duration_seconds int not null, -- whole session
  interrupted boolean default false, -- child abandoned mid-way
  submitted_at timestamptz default now()
);

alter table task_sets enable row level security;
alter table results enable row level security;

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
