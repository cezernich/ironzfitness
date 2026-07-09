-- 2026-07-09 — RLS Remediation Playbook (consolidated)
-- ============================================================================
-- This migration consolidates the Row-Level-Security fixes from the
-- remediation playbook. It is ADDITIVE and idempotent: every policy is
-- dropped with DROP POLICY IF EXISTS before being re-created, and every
-- function uses CREATE OR REPLACE. It edits NO historical migration files.
--
-- Ordering requirement: this migration MUST run AFTER
-- 20260428_coaching_schema.sql, which adds profiles.is_coach and defines
-- public.is_coaching(coach_uid, client_uid). Because it is dated later, the
-- normal migration ordering satisfies this. The is_coach reference in
-- finding 1.1 assumes that column already exists.
--
-- Findings addressed: 1.1, 1.4, 1.6, 2.14, 2.15, 2.16.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 1.1 — profiles UPDATE lets any user self-promote (no WITH CHECK)
-- ────────────────────────────────────────────────────────────────────────
-- Two permissive UPDATE policies exist on profiles ("Users can update own
-- profile" and "Admins can update all profiles"); Postgres ORs permissive
-- policies, and BOTH lack a WITH CHECK, so tightening only one is not
-- sufficient. The column-level REVOKE below is the load-bearing fix — it
-- closes the escalation path regardless of which policy authorizes the row.
-- The WITH CHECK on the own-profile policy is defense-in-depth.
--
-- Requires profiles.is_coach (added in 20260428_coaching_schema.sql).

-- 1.1 prevent privilege/subscription self-escalation
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND COALESCE(is_coach, false) = COALESCE((SELECT p.is_coach FROM profiles p WHERE p.id = auth.uid()), false)
    AND subscription_status = (SELECT p.subscription_status FROM profiles p WHERE p.id = auth.uid())
  );
-- Belt-and-suspenders: revoke column-level UPDATE on sensitive columns from anon/authenticated.
REVOKE UPDATE (role, is_coach, subscription_status) ON profiles FROM authenticated;
REVOKE UPDATE (role, is_coach, subscription_status) ON profiles FROM anon;

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 1.4 — coach_assigned_workouts "Coaches manage their own
-- assignments" only checks coach_id, not an actual coaching relationship.
-- ────────────────────────────────────────────────────────────────────────
-- is_coaching signature confirmed as public.is_coaching(coach_uid, client_uid)
-- (20260428_coaching_schema.sql:94). Table column confirmed as client_id.

DROP POLICY IF EXISTS "Coaches manage their own assignments" ON public.coach_assigned_workouts;
CREATE POLICY "Coaches manage their own assignments" ON public.coach_assigned_workouts
  FOR ALL
  USING (coach_id = auth.uid() AND public.is_coaching(auth.uid(), client_id))
  WITH CHECK (coach_id = auth.uid() AND public.is_coaching(auth.uid(), client_id));

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 1.6 — "Anyone can read shared workout sender profiles" exposes
-- ALL profile columns to anon.
-- ────────────────────────────────────────────────────────────────────────
-- Replace the row-level policy with a name-only SECURITY DEFINER RPC.
-- shared_workouts columns confirmed: share_token, sender_user_id,
-- expires_at, revoked_at (20260410_workout_sharing.sql). profiles.full_name
-- confirmed (supabase-schema.sql).
--
-- CLIENT REPOINT REQUIRED: share.html / share-preview must call
--   supabase.rpc('share_sender_name', { p_token: <token> })
-- instead of reading the profiles row directly.

DROP POLICY IF EXISTS "Anyone can read shared workout sender profiles" ON profiles;
CREATE OR REPLACE FUNCTION public.share_sender_name(p_token text)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.full_name FROM shared_workouts sw JOIN profiles p ON p.id = sw.sender_user_id
  WHERE sw.share_token = p_token AND sw.expires_at > now() AND sw.revoked_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.share_sender_name(text) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 2.14 — "Authenticated users can look up others by email"
-- USING(true) exposes all profile rows to any authenticated user.
-- ────────────────────────────────────────────────────────────────────────
-- Replace with a narrow lookup RPC. profiles.email confirmed
-- (supabase-schema.sql:21).
--
-- CLIENT REPOINT REQUIRED: js/workout-inbox-direct.js must call
--   supabase.rpc('lookup_user_by_email', { p_email: <email> })
-- instead of reading the profiles table directly.

DROP POLICY IF EXISTS "Authenticated users can look up others by email" ON profiles;
CREATE OR REPLACE FUNCTION public.lookup_user_by_email(p_email text)
RETURNS TABLE (id uuid, full_name text) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.id, p.full_name FROM profiles p WHERE lower(p.email) = lower(p_email) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_user_by_email(text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 2.15 — pending_shares readable/claimable by ANY authenticated
-- user (USING(auth.uid() IS NOT NULL)).
-- ────────────────────────────────────────────────────────────────────────
-- Tighten the SELECT and UPDATE policies. Column names confirmed:
-- claimed_by_user_id, claimed_at (20260410_workout_sharing.sql:153-154).
-- Existing policy names matched verbatim so the DROPs land.
--
-- NOTE: the full fix is a fingerprint-keyed RPC so that unclaimed rows are
-- readable only to the device that stashed them. Until then, this still
-- leaves genuinely-unclaimed rows (claimed_by_user_id IS NULL) readable by
-- any authenticated user, which is required for the current client-side
-- fingerprint-match flow.

DROP POLICY IF EXISTS "Authenticated users read pending shares" ON pending_shares;
CREATE POLICY "Authenticated users read pending shares" ON pending_shares FOR SELECT
  USING (claimed_by_user_id IS NULL OR claimed_by_user_id = auth.uid());

-- The historical UPDATE policy is named "Authenticated users claim pending
-- shares" (NO "can") in 20260410_workout_sharing.sql:174. We drop BOTH that
-- verbatim name AND the "can" variant so the permissive old policy cannot
-- survive and OR its USING(auth.uid() IS NOT NULL) back in.
DROP POLICY IF EXISTS "Authenticated users claim pending shares" ON pending_shares;
DROP POLICY IF EXISTS "Authenticated users can claim pending shares" ON pending_shares;
CREATE POLICY "Authenticated users can claim pending shares" ON pending_shares FOR UPDATE
  USING (claimed_at IS NULL) WITH CHECK (claimed_by_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────
-- FINDING 2.16 — "Anyone can read shared training sessions" matches a
-- library slug (shared_workouts.variant_id) against a UUID
-- (training_sessions.id). Near-useless and a potential anon leak.
-- ────────────────────────────────────────────────────────────────────────
-- The policy is defined in BOTH 20260410_fix_training_sessions_rls.sql:36
-- and 20260410_share_rls_fix.sql:10 under the same name, so a single DROP
-- IF EXISTS removes whichever is live.
--
-- NOTE: share previews should resolve variant metadata against the public
-- workout library, not against per-user training_sessions rows.

DROP POLICY IF EXISTS "Anyone can read shared training sessions" ON training_sessions;
