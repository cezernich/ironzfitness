// supabase-init.js — Supabase client initialization
// ─────────────────────────────────────────────────────────────────────────────
// Replace the two placeholder values below with your project credentials.
// Find them at: https://supabase.com/dashboard → your project → Settings → API
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://dagdpdcwqdlibxbitdgr.supabase.co';  // e.g. https://xyzabc.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZ2RwZGN3cWRsaWJ4Yml0ZGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mjk4NjQsImV4cCI6MjA5MTEwNTg2NH0.vc-fvFgZNEvusGgc3yhCzMRmuKrXUHW5uxHHMx1JV44';     // starts with eyJ...

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Expose the URL so edge-function callers (e.g. coach-request-flow.js) can
// build the function endpoint without poking at private client internals.
window.SUPABASE_URL = SUPABASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// SQL to run once in the Supabase dashboard → SQL Editor:
// ─────────────────────────────────────────────────────────────────────────────
//
//  create table public.profiles (
//    id                  uuid references auth.users(id) on delete cascade primary key,
//    email               text,
//    full_name           text,
//    created_at          timestamptz default now(),
//    subscription_status text default 'free',
//    role                text default 'user' check (role in ('user', 'admin'))
//  );
//
//  alter table public.profiles enable row level security;
//
//  create policy "Users can view own profile" on public.profiles
//    for select using (auth.uid() = id);
//
//  create policy "Users can insert own profile" on public.profiles
//    for insert with check (auth.uid() = id);
//
//  create policy "Users can update own profile" on public.profiles
//    for update using (auth.uid() = id);
//
// ─────────────────────────────────────────────────────────────────────────────
//
// Community workouts table (run once):
//
//  create table public.community_workouts (
//    id          text primary key,
//    category    text not null,
//    name        text not null,
//    author      text not null default 'IronZ Team',
//    difficulty  text not null default 'Intermediate' check (difficulty in ('Beginner','Intermediate','Advanced')),
//    type        text not null,
//    exercises   jsonb,
//    segments    jsonb,
//    created_at  timestamptz default now()
//  );
//
//  alter table public.community_workouts enable row level security;
//
//  -- Everyone can read community workouts
//  create policy "Anyone can view community workouts" on public.community_workouts
//    for select using (true);
//
//  -- Only admins can insert/update/delete
//  create policy "Admins can insert community workouts" on public.community_workouts
//    for insert with check (
//      exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
//    );
//
//  create policy "Admins can update community workouts" on public.community_workouts
//    for update using (
//      exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
//    );
//
//  create policy "Admins can delete community workouts" on public.community_workouts
//    for delete using (
//      exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
//    );
//
// ─────────────────────────────────────────────────────────────────────────────
