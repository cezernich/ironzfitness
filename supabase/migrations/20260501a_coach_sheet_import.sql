-- 2026-05-01 — Coach sheet import (Phase A foundations)
--
-- Three artifacts ship together so Slice 1 of Phase A is end-to-end testable
-- against real Supabase infra:
--
--   1. coach_sheet_import_quotas — per-user-per-month upload counter.
--      Phase A enforces 5/month free-tier limit. Increments on successful
--      import; failed/cancelled attempts don't count.
--
--   2. coach_sheet_import_logs — append-only audit log per parse attempt
--      (success or failure). Phase B fills llm_tokens_used /
--      estimated_cost_usd; Phase A logs the file metadata + status so
--      support can debug "this import didn't work" tickets without the
--      file itself.
--
--   3. Storage bucket `coach-sheet-imports` — files land at
--      `{auth.uid()}/{import_id}/{filename}` so the RLS policy can scope
--      reads/writes/deletes to the owning user via the path's first
--      segment. Migrations are the source of truth for bucket existence
--      and policies; never trust dashboard state to be reproducible.
--
-- All three are idempotent (safe to re-run) — `if not exists` /
-- `on conflict do nothing` / `drop policy if exists` patterns.

-- ── 1. Quotas table ──────────────────────────────────────────────────────────

create table if not exists coach_sheet_import_quotas (
  user_id       uuid    not null references auth.users(id) on delete cascade,
  month_yyyymm  text    not null,
  import_count  int     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, month_yyyymm)
);

alter table coach_sheet_import_quotas enable row level security;

drop policy if exists "users read own quota" on coach_sheet_import_quotas;
create policy "users read own quota" on coach_sheet_import_quotas
  for select using (auth.uid() = user_id);

-- Writes go through the edge function (service-role) so client-side
-- RLS only needs read. We deliberately don't grant insert/update to
-- the user role — that would let a client zero out their own counter.

-- ── 2. Logs table ────────────────────────────────────────────────────────────

create table if not exists coach_sheet_import_logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  import_id            text not null,
  storage_path         text,
  filename             text,
  file_size_bytes      bigint,
  selected_sheets      text[],
  date_range_from      date,
  date_range_to        date,
  workouts_parsed      int,
  templates_parsed     int,
  llm_tokens_used      int,
  estimated_cost_usd   numeric(10, 4),
  status               text not null,            -- 'pending' | 'success' | 'failed' | 'cancelled'
  error_code           text,
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists coach_sheet_import_logs_user_idx
  on coach_sheet_import_logs (user_id, created_at desc);
create index if not exists coach_sheet_import_logs_import_id_idx
  on coach_sheet_import_logs (import_id);

alter table coach_sheet_import_logs enable row level security;

drop policy if exists "users read own logs" on coach_sheet_import_logs;
create policy "users read own logs" on coach_sheet_import_logs
  for select using (auth.uid() = user_id);

-- ── 3. Storage bucket + path-scoped RLS ──────────────────────────────────────
--
-- Files land at `{auth.uid()}/{import_id}/{filename}`. The first path
-- segment is the user id, so `(storage.foldername(name))[1]` extracts
-- it for the RLS check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-sheet-imports',
  'coach-sheet-imports',
  false,
  10485760,                                       -- 10 MB cap matches the client-side check
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
    'text/csv',
    'application/csv'
  ]
)
on conflict (id) do nothing;

drop policy if exists "users read own coach-sheet imports" on storage.objects;
create policy "users read own coach-sheet imports" on storage.objects
  for select using (
    bucket_id = 'coach-sheet-imports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users upload own coach-sheet imports" on storage.objects;
create policy "users upload own coach-sheet imports" on storage.objects
  for insert with check (
    bucket_id = 'coach-sheet-imports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users delete own coach-sheet imports" on storage.objects;
create policy "users delete own coach-sheet imports" on storage.objects
  for delete using (
    bucket_id = 'coach-sheet-imports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
