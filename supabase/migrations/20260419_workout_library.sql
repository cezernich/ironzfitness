-- Workout Library — admin-curated workout pool that the plan generator
-- queries (§9 of PLAN_GENERATOR_MASTER_SPEC.md).
--
-- Every user can READ published workouts. Only admins can INSERT / UPDATE /
-- DELETE. User training data never writes back into this table — it's a
-- curated product, not a wiki.

create table if not exists public.workout_library (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  name text not null,
  description text,

  -- Classification (used for querying)
  sport text not null check (sport in ('swim','bike','run','strength','brick','cross_train')),
  session_type text not null,
  energy_system text not null check (energy_system in ('aerobic','lactate_threshold','vo2max','neuromuscular','mixed','strength')),

  -- Eligibility filters
  phases text[] not null,                -- ['base','build','peak','taper','race_week']
  levels text[] not null,                -- ['beginner','intermediate','advanced']
  race_distances text[],                 -- null = all distances
  race_goals text[],                     -- null = all goals

  -- Workout content
  warmup jsonb not null,
  main_set jsonb not null,
  cooldown jsonb not null,

  -- Volume scaling
  volume_range jsonb not null,
  total_duration_range int[] not null,   -- [min_min, max_min]

  -- Admin management
  status text not null default 'draft' check (status in ('draft','published')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Fast generator queries: sport + session_type + published is the hot path.
create index if not exists idx_workout_library_query
  on public.workout_library (sport, session_type, status)
  where status = 'published';

-- Secondary index for coverage-dashboard lookups in the admin UI.
create index if not exists idx_workout_library_admin_coverage
  on public.workout_library (sport, session_type, status);

-- Keep updated_at current on every edit.
create or replace function public.set_workout_library_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workout_library_updated_at on public.workout_library;
create trigger trg_workout_library_updated_at
  before update on public.workout_library
  for each row execute function public.set_workout_library_updated_at();

-- RLS
alter table public.workout_library enable row level security;

-- Everyone authenticated can READ published workouts.
drop policy if exists "Anyone can read published workouts" on public.workout_library;
create policy "Anyone can read published workouts"
  on public.workout_library for select
  using (status = 'published');

-- Admins can read everything (including drafts) — checked via profiles.role.
drop policy if exists "Admins read all workouts" on public.workout_library;
create policy "Admins read all workouts"
  on public.workout_library for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Only admins write.
drop policy if exists "Admins insert workouts" on public.workout_library;
create policy "Admins insert workouts"
  on public.workout_library for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins update workouts" on public.workout_library;
create policy "Admins update workouts"
  on public.workout_library for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins delete workouts" on public.workout_library;
create policy "Admins delete workouts"
  on public.workout_library for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Unique constraint on (name, sport) prevents accidental duplicate seeds.
-- Admins can still create variants by giving them distinct names.
create unique index if not exists idx_workout_library_unique_name_sport
  on public.workout_library (name, sport);
