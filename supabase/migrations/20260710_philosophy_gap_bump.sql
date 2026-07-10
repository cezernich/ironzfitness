-- Atomic philosophy-gap counter bump.
--
-- Replaces the client-side SELECT-then-UPDATE/INSERT loop in
-- js/gap-tracker.js, which raced on `existing.user_count + 1` when two
-- users hit the same gap concurrently. A single UPSERT keyed on the
-- (dimension, value) unique index does the increment atomically inside
-- the DB, so concurrent bumps compose instead of clobbering.

create unique index if not exists philosophy_gaps_dim_val
  on public.philosophy_gaps(dimension, value);

create or replace function public.bump_philosophy_gap(p_dim text, p_val text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.philosophy_gaps(dimension, value, user_count, first_seen, last_seen)
  values (p_dim, p_val, 1, now(), now())
  on conflict (dimension, value) do update
    set user_count = philosophy_gaps.user_count + 1,
        last_seen  = now();
$$;

grant execute on function public.bump_philosophy_gap(text, text) to authenticated, anon;
