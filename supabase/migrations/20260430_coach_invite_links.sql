-- 2026-04-30 (Phase A) — Coach invite links
--
-- Spec: COACH_INVITE_LINK_SPEC_2026-04-29.md
--
-- Adds a coach-shareable short URL (ironz.app/c/<6-char-code>) plus the
-- click-funnel and assignment-history tables that power Phase B (auto-pair)
-- and Phase C (funnel UI). Pairing logic itself ships in Phase B; this
-- migration only ships the schema, helpers, RLS, and the click-recording
-- function the edge function calls in Phase A.
--
-- Pre-kickoff fixes that landed in this migration:
--   • P0: 60-second click dedup window (record_invite_click() function).
--   • P0: profiles.pending_invite_link_id + pending_invite_set_at columns
--         so post-auth the pending invite is moved off-device into a
--         per-user row (prevents shared-device leaks).
--   • P0: pair / switch atomicity primitives — the new tables and history
--         row are designed to be touched inside one Postgres function in
--         Phase B (see comment block on coaching_assignment_history).
--
-- Smoke test gate at the bottom of this file. Run before Phase B starts.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. profiles patches — coach bio + avatar + per-user pending invite
-- ──────────────────────────────────────────────────────────────────────
-- avatar_url is generic (eventually useful for every user). coach_bio is
-- coach-specific, capped at 500 chars (one-paragraph blurb). The two
-- pending_* columns are the per-user mirror of the localStorage
-- pending_invite_link_id — once authed, the client copies the value from
-- localStorage into the profile row and clears localStorage. That ties
-- the pending invite to the user, not the device.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url             TEXT,
  ADD COLUMN IF NOT EXISTS coach_bio              TEXT
    CHECK (coach_bio IS NULL OR char_length(coach_bio) <= 500),
  ADD COLUMN IF NOT EXISTS pending_invite_link_id UUID,
  ADD COLUMN IF NOT EXISTS pending_invite_set_at  TIMESTAMPTZ;

-- Note: we add the FK to coach_invite_links AFTER that table is created
-- below (forward reference would break the migration on a clean DB).

-- ──────────────────────────────────────────────────────────────────────
-- 2. coach_invite_links — one active link per coach
-- ──────────────────────────────────────────────────────────────────────
-- Inactive rows preserved for analytics + so a user mid-signup with a
-- stored link_id pointing at a now-rotated code still resolves to a real
-- coach (see "edge cases / coach rotates code while user is mid-signup"
-- in the spec).

CREATE TABLE IF NOT EXISTS public.coach_invite_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE CHECK (char_length(code) = 6),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ,

  -- URL-safe alphabet, no ambiguous chars (no 0/O/1/I/L). Codes are
  -- always uppercase; the client / edge function uppercases the URL
  -- segment before lookup so users typing in lowercase still resolve.
  CONSTRAINT code_charset CHECK (code ~ '^[2-9A-HJ-NP-Z]{6}$')
);

-- Exactly one ACTIVE link per coach. Inactive rows are unconstrained so
-- a coach can rotate freely.
CREATE UNIQUE INDEX IF NOT EXISTS coach_invite_one_active
  ON public.coach_invite_links (coach_id) WHERE active = TRUE;

-- Fast active-only lookup by code (the edge function path).
CREATE INDEX IF NOT EXISTS coach_invite_code_active_idx
  ON public.coach_invite_links (code) WHERE active = TRUE;

ALTER TABLE public.coach_invite_links ENABLE ROW LEVEL SECURITY;

-- Now safe to add the deferred FK on profiles.pending_invite_link_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_pending_invite_link_id_fkey'
      AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pending_invite_link_id_fkey
        FOREIGN KEY (pending_invite_link_id)
        REFERENCES public.coach_invite_links(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. coach_invite_clicks — anonymous click + funnel tracking
-- ──────────────────────────────────────────────────────────────────────
-- ip_hash and user_agent_hash are sha256 of (ip + daily_salt) computed
-- on the edge function side. We store them only for dedup (record-click
-- 60s window) and rate-limiting; nothing here is reversible to a real IP
-- or device fingerprint.
--
-- The four lifecycle timestamps + foreign keys mirror the funnel:
--   clicked_at  → click recorded
--   signed_up_* → click resulted in a new signup (Phase B fills these)
--   accepted_at → user tapped Accept on the modal (Phase B fills, also
--                 the v2 "user agreed to be charged" event)
--   dismissed_at→ user tapped Not now
--   paired_*    → coaching_assignments row created

CREATE TABLE IF NOT EXISTS public.coach_invite_clicks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id       UUID NOT NULL REFERENCES public.coach_invite_links(id) ON DELETE CASCADE,
  clicked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash              TEXT,
  user_agent_hash      TEXT,
  signed_up_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_up_at         TIMESTAMPTZ,
  accepted_at          TIMESTAMPTZ,
  dismissed_at         TIMESTAMPTZ,
  paired_assignment_id UUID REFERENCES public.coaching_assignments(id) ON DELETE SET NULL,
  paired_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coach_invite_clicks_link_idx
  ON public.coach_invite_clicks (invite_link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS coach_invite_clicks_signup_idx
  ON public.coach_invite_clicks (signed_up_user_id)
  WHERE signed_up_user_id IS NOT NULL;
-- The dedup query in record_invite_click() filters on
-- (invite_link_id, ip_hash, clicked_at > now() - 60s). The link+timestamp
-- index above already covers the (invite_link_id, clicked_at) hot path;
-- ip_hash gets evaluated as a residual filter, which is fine at this scale.

ALTER TABLE public.coach_invite_clicks ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 4. coaching_assignment_history — audit log of coach<->client transitions
-- ──────────────────────────────────────────────────────────────────────
-- Used by Phase B's pair / switch flows to record every coaching change.
-- Sourced for analytics ("how many users switched coaches via invite
-- links?") and for client-facing "Coaching history" UI later.
--
-- Shipping this table in Phase A so Phase B's pair_with_coach() and
-- switch_coach() Postgres functions can wrap their three writes
-- (assignments, clicks, history) inside a single SECURITY DEFINER
-- function — no half-paired state ever lands.

CREATE TABLE IF NOT EXISTS public.coaching_assignment_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_coach_id   UUID REFERENCES auth.users(id),
  new_coach_id        UUID REFERENCES auth.users(id),
  change_type         TEXT NOT NULL
    CHECK (change_type IN ('created', 'switched', 'deactivated', 'reactivated')),
  source              TEXT
    CHECK (source IN ('admin', 'invite_link', 'request_match', 'self_unfreeze')),
  invite_link_id      UUID REFERENCES public.coach_invite_links(id) ON DELETE SET NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by          UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS coaching_assignment_history_client_idx
  ON public.coaching_assignment_history (client_id, changed_at DESC);

ALTER TABLE public.coaching_assignment_history ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 5. _gen_invite_code() — pick a unique 6-char code
-- ──────────────────────────────────────────────────────────────────────
-- 32-char alphabet × 6 = ~1 billion codes. With ~32k coaches the
-- birthday-paradox collision rate is still <0.001 per insert; the
-- 10-attempt loop covers anything weirder.

CREATE OR REPLACE FUNCTION public._gen_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result   TEXT := '';
  i        INT;
  attempt  INT := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(alphabet, floor(random() * 32)::INT + 1, 1);
    END LOOP;
    PERFORM 1 FROM public.coach_invite_links WHERE code = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    IF attempt > 10 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
    END IF;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. _auto_create_invite_link() — trigger on profiles.is_coach
-- ──────────────────────────────────────────────────────────────────────
-- Whenever profiles.is_coach flips false → true, auto-generate a link.
-- ON CONFLICT DO NOTHING handles the (very rare) race where another
-- session creates the row first.

CREATE OR REPLACE FUNCTION public._auto_create_invite_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_coach = TRUE
     AND (OLD.is_coach IS NULL OR OLD.is_coach = FALSE) THEN
    INSERT INTO public.coach_invite_links (coach_id, code)
    VALUES (NEW.id, public._gen_invite_code())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_auto_invite_link ON public.profiles;
CREATE TRIGGER profiles_auto_invite_link
  AFTER UPDATE OF is_coach ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._auto_create_invite_link();

-- Backfill: any user that's already a coach at migration time gets a
-- link, since the trigger only fires on UPDATE.
INSERT INTO public.coach_invite_links (coach_id, code)
SELECT p.id, public._gen_invite_code()
  FROM public.profiles p
  LEFT JOIN public.coach_invite_links cil
    ON cil.coach_id = p.id AND cil.active = TRUE
 WHERE p.is_coach = TRUE
   AND cil.id IS NULL
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- 7. record_invite_click(link_code, ip_hash, ua_hash) — public RPC
-- ──────────────────────────────────────────────────────────────────────
-- Called by the edge function to record a click. Resolves the active
-- link by code, applies the 60-second dedup window, and returns the row
-- id (or NULL if dedup'd).
--
-- SECURITY DEFINER so the RLS insert policy doesn't have to allow
-- arbitrary inserts. Marked PARALLEL UNSAFE since it writes; STABLE on
-- the read-only fast path doesn't apply.

CREATE OR REPLACE FUNCTION public.record_invite_click(
  p_code     TEXT,
  p_ip_hash  TEXT,
  p_ua_hash  TEXT
)
RETURNS TABLE (
  click_id        UUID,
  invite_link_id  UUID,
  coach_id        UUID,
  was_dedup       BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_id   UUID;
  v_coach_id  UUID;
  v_existing  UUID;
  v_inserted  UUID;
BEGIN
  -- IMPORTANT: the RETURNS TABLE OUT parameters (`coach_id`,
  -- `invite_link_id`) share names with columns on the tables we touch.
  -- Without aliases, Postgres raises "column reference is ambiguous"
  -- (42702) at execution time — this can't be caught by static review,
  -- only by actually running the function. Every column reference in
  -- this body MUST be qualified through a table alias (`cil`, `cic`).

  -- Resolve the active link by code (case-insensitive — uppercase
  -- before lookup so URLs typed in lowercase still resolve).
  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.code = upper(p_code) AND cil.active = TRUE
   LIMIT 1;

  IF v_link_id IS NULL THEN
    -- Code is unknown / inactive. Return NULLs; the edge function
    -- renders the "no longer active" page.
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Soft dedup: if we already have a click on this link from this
  -- ip_hash within the last 60 seconds, skip the insert. Returns the
  -- existing row id with was_dedup = TRUE so the edge function can
  -- still render the landing page (the click count just doesn't
  -- double-increment).
  IF p_ip_hash IS NOT NULL THEN
    SELECT cic.id INTO v_existing
      FROM public.coach_invite_clicks cic
     WHERE cic.invite_link_id = v_link_id
       AND cic.ip_hash = p_ip_hash
       AND cic.clicked_at > NOW() - INTERVAL '60 seconds'
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, v_link_id, v_coach_id, TRUE;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.coach_invite_clicks (invite_link_id, ip_hash, user_agent_hash)
  VALUES (v_link_id, p_ip_hash, p_ua_hash)
  RETURNING id INTO v_inserted;

  RETURN QUERY SELECT v_inserted, v_link_id, v_coach_id, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_invite_click(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 8. RLS policies
-- ──────────────────────────────────────────────────────────────────────

-- coach_invite_links ----------------------------------------------------

-- Public can read ACTIVE rows by code (powers the landing page lookup).
-- Returns coach_id + code + active + created_at; no internal fields hide
-- behind extra columns yet so the policy is straightforward.
DROP POLICY IF EXISTS "Public can look up active invite links" ON public.coach_invite_links;
CREATE POLICY "Public can look up active invite links"
  ON public.coach_invite_links
  FOR SELECT
  USING (active = TRUE);

-- Coaches manage their own links (read inactive history, rotate, etc.)
DROP POLICY IF EXISTS "Coaches manage their own invite links" ON public.coach_invite_links;
CREATE POLICY "Coaches manage their own invite links"
  ON public.coach_invite_links
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Admins see everything.
DROP POLICY IF EXISTS "Admins view all invite link data" ON public.coach_invite_links;
CREATE POLICY "Admins view all invite link data"
  ON public.coach_invite_links
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- coach_invite_clicks ---------------------------------------------------

-- NB: anon click insertion is brokered by record_invite_click() (SECURITY
-- DEFINER), NOT by a permissive RLS insert policy. Keeping the table's
-- INSERT path locked down means raw client-side INSERTs into this table
-- aren't possible — bots can't fake clicks via direct REST calls.
-- (We DROP an older "anyone insert" draft policy if it exists, just in
-- case an earlier dev preview applied it.)
DROP POLICY IF EXISTS "Anyone can record an invite click" ON public.coach_invite_clicks;

-- Coaches read clicks for their own links.
DROP POLICY IF EXISTS "Coaches view their own click data" ON public.coach_invite_clicks;
CREATE POLICY "Coaches view their own click data"
  ON public.coach_invite_clicks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_invite_links
       WHERE id = invite_link_id AND coach_id = auth.uid()
    )
  );

-- Admins see everything.
DROP POLICY IF EXISTS "Admins view all click data" ON public.coach_invite_clicks;
CREATE POLICY "Admins view all click data"
  ON public.coach_invite_clicks
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- coaching_assignment_history ------------------------------------------

DROP POLICY IF EXISTS "Users see their own assignment history" ON public.coaching_assignment_history;
CREATE POLICY "Users see their own assignment history"
  ON public.coaching_assignment_history
  FOR SELECT
  USING (
    client_id = auth.uid()
    OR new_coach_id = auth.uid()
    OR previous_coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins see all assignment history" ON public.coaching_assignment_history;
CREATE POLICY "Admins see all assignment history"
  ON public.coaching_assignment_history
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- History inserts happen via Phase B's pair_with_coach() / switch_coach()
-- SECURITY DEFINER functions — no client INSERT policy here.

-- ──────────────────────────────────────────────────────────────────────
-- 9. Drop coaching_unique_active_pair (over-restrictive)
-- ──────────────────────────────────────────────────────────────────────
-- The original coaching schema (20260428_coaching_schema.sql) defined a
-- partial unique index on (client_id, coach_id) WHERE active = TRUE
-- with the intent of preventing a duplicate active pair. In practice
-- it blocks the legitimate switch-back-to-previous-coach flow that the
-- invite-link Accept modal exposes (Coach A → Coach B → Coach A again):
-- the second pair-with-A insert collides with the original (A, FALSE)
-- row in a way the partial index ends up rejecting.
--
-- The real "one active primary per client" guarantee is enforced by the
-- separate `coaching_one_primary_per_client` partial unique index
-- (still in place) — that one keys on client_id alone with WHERE
-- role='primary' AND active=TRUE. Sub-coaches are unconstrained-pair
-- by design (a client can have multiple sub-coaches at once).
--
-- Caught during Phase B smoke test #3 (switch_coach happy path) by
-- Chase. Index already dropped on the deployed DB; this DROP is here so
-- fresh deploys (which run 20260428 → 20260430 in order) end up with
-- the same final state instead of inheriting the bug.

DROP INDEX IF EXISTS public.coaching_unique_active_pair;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Phase A smoke test gate — run BEFORE building Phase B's auth flow
-- ══════════════════════════════════════════════════════════════════════
--
-- 1) Verify auto-create + backfill worked. Pick any user that's already
--    a coach (or promote one), and confirm there's exactly one active
--    link:
--
--    SELECT cil.id, cil.code, cil.active, p.full_name
--      FROM public.coach_invite_links cil
--      JOIN public.profiles p ON p.id = cil.coach_id
--     WHERE cil.active = TRUE
--     ORDER BY cil.created_at DESC LIMIT 5;
--
--    Promote a fresh test user to coach and re-run; new row should
--    appear.
--
--      UPDATE public.profiles SET is_coach = TRUE WHERE id = '<test-user-uuid>';
--
-- 2) Public lookup by code (run as anon — i.e., from the SQL editor in
--    "anon" role, or via curl with the anon key):
--
--    SELECT id, coach_id, code FROM public.coach_invite_links
--     WHERE code = '<your-test-code>' AND active = TRUE;
--
--    Expect one row. Then flip the row to inactive and re-run; expect
--    zero rows (RLS hides inactive from anon).
--
--      UPDATE public.coach_invite_links SET active = FALSE WHERE code = '<test>';
--      -- expect 0 rows from the SELECT above
--      UPDATE public.coach_invite_links SET active = TRUE WHERE code = '<test>';
--
-- 3) Click recording — call the RPC twice in a 60-second window from
--    the same ip_hash and confirm the second call returns was_dedup=TRUE
--    and the click row count stays at 1:
--
--    SELECT * FROM public.record_invite_click('<test-code>', 'ip-hash-A', 'ua-hash-A');
--    SELECT * FROM public.record_invite_click('<test-code>', 'ip-hash-A', 'ua-hash-A');
--    -- second call: was_dedup = TRUE, click_id = same as first
--
--    SELECT count(*) FROM public.coach_invite_clicks
--     WHERE ip_hash = 'ip-hash-A';
--    -- expect 1
--
--    Then call with a DIFFERENT ip_hash; expect a new row.
--
--      SELECT * FROM public.record_invite_click('<test-code>', 'ip-hash-B', 'ua-hash-B');
--      SELECT count(*) FROM public.coach_invite_clicks WHERE invite_link_id = (SELECT id FROM public.coach_invite_links WHERE code = '<test-code>');
--      -- expect 2
--
-- 4) RLS sanity — confirm anon CANNOT INSERT directly into clicks
--    (record_invite_click is the only path):
--
--      -- as anon
--      INSERT INTO public.coach_invite_clicks (invite_link_id) VALUES ('<some-uuid>');
--      -- expect: new row violates row-level security policy
--
-- 5) Inactive-code lookup returns NULLs from the RPC:
--
--      UPDATE public.coach_invite_links SET active = FALSE WHERE code = '<test>';
--      SELECT * FROM public.record_invite_click('<test>', 'ip-X', 'ua-X');
--      -- expect: click_id NULL, invite_link_id NULL, coach_id NULL, was_dedup FALSE
--      UPDATE public.coach_invite_links SET active = TRUE WHERE code = '<test>';
--
-- All five pass → Phase A migration is good. Build the edge function
-- against this RPC contract.
