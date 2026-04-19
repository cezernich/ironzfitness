-- Replaces the JWT-based admin policy on ask_ironz_logs with the profiles-
-- based pattern the rest of the app uses. The original policy:
--
--   USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
--
-- never matches because Supabase JWTs carry role='authenticated' (not
-- 'admin') and app_metadata.role is never populated by the app's auth
-- flow. Admin-ness is determined by public.profiles.role — same as the
-- workout_library table.

drop policy if exists "Admin full access" on public.ask_ironz_logs;

create policy "Admin reads all questions"
  on public.ask_ironz_logs for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin updates any question"
  on public.ask_ironz_logs for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin deletes any question"
  on public.ask_ironz_logs for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
