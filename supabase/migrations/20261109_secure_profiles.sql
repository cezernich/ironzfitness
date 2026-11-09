-- 20261109_secure_profiles.sql
--
-- Closes three holes on public.profiles (see docs/CODE_REVIEW_2026-11-09.md, P0 #1 and #2):
--
--   1. Any signed-in user could UPDATE their own row's role, subscription_status,
--      is_coach, or email (the update policy is row-level only). That meant
--      self-promotion to admin from the browser console.
--   2. "Authenticated users can look up others by email" was USING (true): every
--      signed-in user could read every profile row, including birthday, weight,
--      gender, and body-comp goal.
--   3. "Anyone can read shared workout sender profiles" let anyone holding a live
--      share link (including anon) read the sender's full row.
--
-- After this migration:
--   * Privileged columns can only change via service_role (edge functions,
--     dashboard SQL) or an admin. The owner's emails still get admin
--     automatically, now enforced in the database instead of the client.
--   * Other users' profiles are reachable only through two SECURITY DEFINER
--     functions that return display fields, never body or health data:
--       lookup_user_by_email(email)   exact-match lookup for direct sharing
--       profile_cards(ids)            names (and email where already known)
--   * Kept as-is: own-row policies, admin policies, and coach <-> client policies
--     (coaching is paused; the client-reads-coach policy below is the minimum
--     to keep it working and should move to profile_cards later).
--
-- Safe to re-run.

BEGIN;

-- ── 1. Guard privileged columns ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER          -- current_user must be the real caller role
SET search_path = public
AS $$
DECLARE
  -- PostgREST runs end-user requests as 'authenticated' or 'anon'. Anything
  -- else (service_role from edge functions, postgres from the SQL editor or
  -- migrations) is trusted.
  v_trusted boolean := current_user NOT IN ('authenticated', 'anon');
  v_owner   boolean := lower(coalesce(auth.jwt() ->> 'email', '')) IN (
                         'chase.zernich@gmail.com',
                         'chase.zernich@kellogg.northwestern.edu')
                       AND auth.uid() = NEW.id;
BEGIN
  IF v_trusted OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role                := CASE WHEN v_owner THEN 'admin' ELSE 'user' END;
    NEW.subscription_status := 'free';
    NEW.is_coach            := false;
    NEW.email               := auth.jwt() ->> 'email';
    RETURN NEW;
  END IF;

  -- UPDATE by a regular user: silently keep the old values so harmless
  -- client upserts keep working, but nothing privileged can change.
  NEW.id                  := OLD.id;
  NEW.email               := OLD.email;
  NEW.subscription_status := OLD.subscription_status;
  NEW.is_coach            := OLD.is_coach;
  IF NOT (v_owner AND NEW.role = 'admin') THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged ON public.profiles;
CREATE TRIGGER profiles_guard_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();

-- ── 2. Remove over-broad read policies ──────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can look up others by email" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read shared workout sender profiles" ON public.profiles;

-- Clients still need their coach's name/email/bio while coaching code reads
-- profiles directly. Scoped to an active assignment only.
DROP POLICY IF EXISTS "Clients can view their coach's profile" ON public.profiles;
CREATE POLICY "Clients can view their coach's profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_coaching(id, auth.uid()));

-- ── 3. Narrow lookup functions ──────────────────────────────────────────────

-- Exact, case-insensitive email lookup for direct workout sharing. The caller
-- already knows the email, so returning it leaks nothing new.
CREATE OR REPLACE FUNCTION public.lookup_user_by_email(p_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.email IS NOT NULL
    AND lower(p.email) = lower(trim(p_email))
  LIMIT 1;
$$;

-- Display cards (name, avatar, coach bio) for a list of user ids. Returns a row only when the caller has
-- a reason to see that person; email only when the caller already knows it.
DROP FUNCTION IF EXISTS public.profile_cards(uuid[]);
CREATE FUNCTION public.profile_cards(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text, email text, coach_bio text, is_coach boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rel AS (
    SELECT
      p.*,
      (p.id = auth.uid()) AS is_self,
      (auth.uid() IS NOT NULL AND public.is_admin()) AS is_admin,
      (auth.uid() IS NOT NULL AND (public.is_coaching(auth.uid(), p.id)
                                   OR public.is_coaching(p.id, auth.uid()))) AS is_coach_pair,
      EXISTS (SELECT 1 FROM public.workout_inbox w
              WHERE w.sender_id = auth.uid() AND w.recipient_id = p.id) AS i_sent_to,
      EXISTS (SELECT 1 FROM public.workout_inbox w
              WHERE w.sender_id = p.id AND w.recipient_id = auth.uid()) AS sent_to_me,
      EXISTS (SELECT 1 FROM public.shared_workouts sw
              WHERE sw.sender_user_id = p.id
                AND sw.expires_at > now()
                AND sw.revoked_at IS NULL) AS has_live_share
    FROM public.profiles p
    WHERE p.id = ANY (p_ids)
  )
  SELECT
    r.id,
    r.full_name,
    r.avatar_url,
    CASE WHEN r.is_self OR r.is_admin OR r.is_coach_pair OR r.i_sent_to
         THEN r.email END,
    CASE WHEN r.is_coach THEN r.coach_bio END,
    r.is_coach
  FROM rel r
  WHERE r.is_self OR r.is_admin OR r.is_coach_pair
     OR r.i_sent_to OR r.sent_to_me OR r.has_live_share;
$$;

REVOKE ALL ON FUNCTION public.lookup_user_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_user_by_email(text) TO authenticated;

REVOKE ALL ON FUNCTION public.profile_cards(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_cards(uuid[]) TO anon, authenticated;

COMMIT;

-- ── Verify (run after applying, as the SQL editor user) ─────────────────────
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';
--   Expect: no policy with qual = 'true'; no "shared workout sender" policy.
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;
--   Expect: profiles_guard_privileged.
