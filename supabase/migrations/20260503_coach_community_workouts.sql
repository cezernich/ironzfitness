-- 2026-05-03 — Coaches can post community workouts
--
-- Extends the community_workouts write policy from admin-only to
-- (admin OR is_coach). Coaches were a fixture in the data model
-- (profiles.is_coach + coaching_assignments) but had no public
-- publishing surface — workouts they created went to coach_workout_
-- library or coach_assigned_workouts, neither of which surfaces in
-- the Community tab.
--
-- The community feed reads via community_workouts_select (open to
-- every authenticated user) — that policy is unchanged. The author
-- column already exists on the table so coach posts can be
-- attributed by name without a schema change. is_official stays
-- TRUE for coach posts so they show up in the feed alongside
-- IronZ Team posts; the front-end can read author to distinguish.
--
-- Anyone losing coach status (is_coach flipped to FALSE) loses
-- write access on the next policy check — existing rows they
-- authored stay in the feed since the policy only gates the write
-- not the row's persistence.

DROP POLICY IF EXISTS "community_workouts_admin_write" ON public.community_workouts;
DROP POLICY IF EXISTS "community_workouts_authored_write" ON public.community_workouts;

CREATE POLICY "community_workouts_authored_write"
  ON public.community_workouts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.is_coach = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.is_coach = TRUE)
    )
  );
