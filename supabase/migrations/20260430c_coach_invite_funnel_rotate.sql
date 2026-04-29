-- 2026-04-30 (Phase C) — Funnel RPCs + rotate + click rate limiting
--
-- Spec: COACH_INVITE_LINK_SPEC_2026-04-29.md (Phase C).
--
-- Three additions on top of Phase A/B:
--   • get_invite_funnel()         — counts clicks/signups/accepted/active/dismissed
--                                    for the coach's active link.
--   • get_invite_recent_activity() — anonymized timeline rows for the panel.
--   • rotate_invite_link()        — coach-initiated rotate; deactivates old,
--                                    inserts new with a fresh code, atomically.
--   • record_invite_click()       — patched in place to add a 10/min/ip_hash
--                                    rate-limit branch. Spec lines 499 & 537.
--
-- Per pre-kickoff Q5: "active client count" is a CURRENT SNAPSHOT
-- (not 30-day windowed). Clicks / signups / accepted / dismissed are
-- 30-day windowed (default p_days = 30; caller can pass NULL for all-time).
--
-- Smoke gate at the bottom of this file. Run before wiring the panel UI.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. record_invite_click — add 10/min/ip_hash rate limit
-- ──────────────────────────────────────────────────────────────────────
-- Replaces Phase A's body. Same signature, same return shape (so the
-- edge function doesn't need a redeploy). Logic:
--
--   1) resolve link by code (unchanged)
--   2) NEW: if ≥10 inserts on this ip_hash within last 60s, return
--      was_dedup=TRUE without inserting. From the user's perspective
--      the landing page still renders normally — we just stop
--      counting their clicks. Quality of the funnel matters more than
--      perfect symmetry between "page renders" and "rows inserted".
--   3) 60s dedup per (link, ip_hash) (unchanged)
--   4) insert (unchanged)

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
  v_link_id    UUID;
  v_coach_id   UUID;
  v_existing   UUID;
  v_inserted   UUID;
  v_recent_cnt INT;
BEGIN
  -- IMPORTANT: every column reference is qualified through a table alias
  -- (`cil`, `cic`) because the RETURNS TABLE OUT params (`coach_id`,
  -- `invite_link_id`) shadow same-named columns. Same fix as Phase A;
  -- preserved here on the rewrite.

  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.code = upper(p_code) AND cil.active = TRUE
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- ── Phase C rate limit: 10 inserts per ip_hash per 60s, GLOBAL across
  -- all links. Stops a scraper crawling every code from inflating every
  -- coach's funnel; doesn't punish a real user who just hit one link.
  -- Skipped when ip_hash is NULL (e.g., synthetic test invocations).
  IF p_ip_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_cnt
      FROM public.coach_invite_clicks cic
     WHERE cic.ip_hash    = p_ip_hash
       AND cic.clicked_at > NOW() - INTERVAL '60 seconds';
    IF v_recent_cnt >= 10 THEN
      -- Treat as a no-op for the caller — same shape as the dedup
      -- branch so the edge function's 302 path doesn't need to know
      -- the difference. click_id is NULL because we deliberately
      -- didn't insert.
      RETURN QUERY SELECT NULL::UUID, v_link_id, v_coach_id, TRUE;
      RETURN;
    END IF;
  END IF;

  -- ── 60s dedup per (link, ip_hash) — unchanged from Phase A.
  IF p_ip_hash IS NOT NULL THEN
    SELECT cic.id INTO v_existing
      FROM public.coach_invite_clicks cic
     WHERE cic.invite_link_id = v_link_id
       AND cic.ip_hash        = p_ip_hash
       AND cic.clicked_at     > NOW() - INTERVAL '60 seconds'
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

-- ──────────────────────────────────────────────────────────────────────
-- 2. get_invite_funnel(p_link_id, p_days)
-- ──────────────────────────────────────────────────────────────────────
-- Caller must be the coach who owns the link OR an admin. Returns one
-- row with the five funnel counts the panel renders.
--
-- "active" is a CURRENT SNAPSHOT — count of coaching_assignments rows
-- where the user got there VIA this link AND the assignment is still
-- active. Different from clicks/signups/accepted/dismissed which are
-- 30-day windowed.
--
-- p_days = NULL → all-time window for the windowed counts. Default 30.
--
-- ROTATE-DURING-SIGNUP ATTRIBUTION (canonical behavior):
-- When a coach rotates their code mid-flow — user clicked the OLD link,
-- then signed in/up after rotation — the resulting pair is attributed
-- to the OLD link, NOT the new one. The click row's invite_link_id
-- references the old (now-inactive) row, and pair_with_coach stamps
-- THAT row with paired_assignment_id. Funnel results follow:
--
--   • OLD link funnel: clicks=1, signups=1, accepted=1, active=1.
--     (The link that drove the conversion gets the credit.)
--   • NEW link funnel: clicks=0, signups=0, accepted=0, active=0
--     (until that new link gets its own clicks).
--
-- Reassigning credit to the new link would misattribute — the old link
-- did the work; only the URL changed. The user clicked because of THIS
-- coach's link, not because of code-X-or-Y. Locked as canonical via
-- the spec parking-lot question resolution.

CREATE OR REPLACE FUNCTION public.get_invite_funnel(
  p_link_id UUID,
  p_days    INT DEFAULT 30
)
RETURNS TABLE (
  clicks       INT,
  signups      INT,
  accepted     INT,
  dismissed    INT,
  active_clients INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_owner    UUID;
  v_is_admin BOOLEAN;
  v_since    TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.coach_id INTO v_owner
    FROM public.coach_invite_links cil
   WHERE cil.id = p_link_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller AND p.role = 'admin'
  ) INTO v_is_admin;

  IF v_owner <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Window — NULL means all-time.
  v_since := CASE
    WHEN p_days IS NULL THEN '1970-01-01'::TIMESTAMPTZ
    ELSE NOW() - (p_days || ' days')::INTERVAL
  END;

  RETURN QUERY
  SELECT
    -- Clicks: every row in the click table within the window.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.clicked_at >= v_since),
    -- Signups: clicks where the user signed up (signed_up_user_id stamped).
    -- "Signed up" includes both new-account creations AND existing users
    -- who first authenticated via this link — the spec's funnel labels
    -- collapse the two intentionally.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.signed_up_user_id IS NOT NULL
         AND cic.clicked_at >= v_since),
    -- Accepted: user tapped Accept on the modal. Phase B funnel step.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.accepted_at IS NOT NULL
         AND cic.clicked_at >= v_since),
    -- Dismissed: user tapped Not now. We show the count for the 7-day
    -- cooldown window specifically, NOT p_days, so the panel's
    -- "in cooldown" subtitle is meaningful.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.dismissed_at IS NOT NULL
         AND cic.dismissed_at > NOW() - INTERVAL '7 days'),
    -- Active clients: current snapshot, all-time (not windowed). Joined
    -- via the click row's paired_assignment_id so we count exactly the
    -- pairings that came through THIS link.
    (SELECT COUNT(*)::INT
       FROM public.coach_invite_clicks cic
       JOIN public.coaching_assignments ca ON ca.id = cic.paired_assignment_id
      WHERE cic.invite_link_id = p_link_id
        AND ca.active = TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_funnel(UUID, INT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. get_invite_recent_activity(p_link_id, p_limit)
-- ──────────────────────────────────────────────────────────────────────
-- Anonymous activity feed for the panel. Returns the most recent N
-- click rows (default 10) with timestamps but NO user identity — the
-- spec requires this stays anonymized for client privacy.
--
-- The "kind" column is derived: prefer the most-evolved state on the
-- row so a single click that became an active pairing reads as
-- "paired" rather than just "clicked".

CREATE OR REPLACE FUNCTION public.get_invite_recent_activity(
  p_link_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  occurred_at TIMESTAMPTZ,
  kind        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_owner    UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.coach_id INTO v_owner
    FROM public.coach_invite_links cil
   WHERE cil.id = p_link_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller AND p.role = 'admin'
  ) INTO v_is_admin;

  IF v_owner <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- For each click, emit ONE row representing the most-evolved state.
  -- "paired" (active pairing) > "accepted" > "signed up" > "dismissed"
  -- > "clicked". Older / less-meaningful states are subsumed.
  RETURN QUERY
  SELECT
    COALESCE(cic.paired_at, cic.accepted_at, cic.dismissed_at,
             cic.signed_up_at, cic.clicked_at) AS occurred_at,
    CASE
      WHEN cic.paired_assignment_id IS NOT NULL THEN 'paired'
      WHEN cic.accepted_at IS NOT NULL          THEN 'accepted'
      WHEN cic.dismissed_at IS NOT NULL         THEN 'dismissed'
      WHEN cic.signed_up_user_id IS NOT NULL    THEN 'signed_up'
      ELSE 'clicked'
    END AS kind
  FROM public.coach_invite_clicks cic
  WHERE cic.invite_link_id = p_link_id
  ORDER BY occurred_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_recent_activity(UUID, INT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 4. rotate_invite_link()
-- ──────────────────────────────────────────────────────────────────────
-- Coach-initiated rotate. Deactivates the current active link and
-- inserts a new one with a fresh code in a single transaction. Returns
-- the new row so the panel can update without re-fetching.
--
-- Already-paired clients keep their pairing — the click rows reference
-- the OLD link's UUID, which stays valid (just inactive). New visitors
-- to the old code get the "no longer active" page.
--
-- Caller must be is_coach = TRUE. Admin override can be added in v2 if
-- support needs to forcibly rotate a misused link.

CREATE OR REPLACE FUNCTION public.rotate_invite_link()
RETURNS TABLE (
  new_link_id UUID,
  new_code    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_is_coach BOOLEAN;
  v_inserted UUID;
  v_code     TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT (p.is_coach = TRUE) INTO v_is_coach
    FROM public.profiles p
   WHERE p.id = v_caller;

  IF NOT COALESCE(v_is_coach, FALSE) THEN
    RAISE EXCEPTION 'caller is not a coach' USING ERRCODE = '42501';
  END IF;

  -- Deactivate the current active link (if any). The partial unique
  -- index `coach_invite_one_active` requires zero or one active row
  -- per coach, so we MUST flip the old row off before inserting the
  -- new one.
  UPDATE public.coach_invite_links cil
     SET active         = FALSE,
         deactivated_at = NOW()
   WHERE cil.coach_id = v_caller
     AND cil.active   = TRUE;

  v_code := public._gen_invite_code();

  INSERT INTO public.coach_invite_links (coach_id, code)
  VALUES (v_caller, v_code)
  RETURNING id INTO v_inserted;

  RETURN QUERY SELECT v_inserted, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rotate_invite_link() TO authenticated;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Phase C smoke test gate — run BEFORE wiring the panel UI
-- ══════════════════════════════════════════════════════════════════════
--
-- Setup: pick the existing test data — chase's active link UUID
-- ("CHASE_LINK") and a non-coach user UUID ("CLIENT_UUID") for the
-- forbidden-call test.
--
-- 1) Funnel against existing test data. Sign in as chase and call:
--
--      SELECT * FROM public.get_invite_funnel('<CHASE_LINK>'::uuid, 30);
--
--    Expected against the post-Phase-B test state:
--      clicks ≥ 1 (Test 6 dismissal click)
--      signups ≥ 1 (ironzsupport stamped during Test 3 dismiss path,
--                   plus chase's own click now stamped)
--      accepted ≥ 1 (ironzsupport's pair_with_coach in Test 2)
--      dismissed ≥ 1 (Mila + chase's own dismiss rows from Test 6/8)
--      active_clients ≥ 1 (ironzsupport ⇄ Nick — but Nick != chase, so
--                          for chase's link this should reflect chase's
--                          paired clients only).
--
--    Note: active_clients counts pairings that came through THIS link.
--    Mismatch with the "ironzsupport ⇄ Nick Conway" pair is fine — that
--    pair came through Nick's link, not chase's.
--
-- 2) Forbidden call. Sign in as a non-owner user and call:
--
--      SELECT * FROM public.get_invite_funnel('<CHASE_LINK>'::uuid, 30);
--      -- expect: ERROR with errcode '42501'
--
-- 3) All-time funnel. Pass NULL for the window:
--
--      SELECT * FROM public.get_invite_funnel('<CHASE_LINK>'::uuid, NULL);
--      -- expect: same or higher counts than the 30-day window
--
-- 4) Recent activity returns rows in DESC order with kind populated:
--
--      SELECT * FROM public.get_invite_recent_activity('<CHASE_LINK>'::uuid, 5);
--      -- expect: up to 5 rows; kind ∈ {paired, accepted, dismissed,
--      --         signed_up, clicked}; occurred_at strictly DESC.
--
-- 5) Rotate. Sign in as chase, note current code, then:
--
--      SELECT * FROM public.rotate_invite_link();
--      -- expect: new_link_id (different uuid), new_code (different code).
--
--    Confirm the old code is now inactive and a new active row exists:
--
--      SELECT id, code, active FROM public.coach_invite_links
--       WHERE coach_id = '<CHASE_UUID>'
--       ORDER BY created_at DESC LIMIT 5;
--      -- expect: most-recent row active=TRUE; older row(s) active=FALSE.
--
--    Critically: previously-paired clients still resolve. The click row
--    for the original Test-2 pair still references the OLD link UUID;
--    coaching_assignments is unaffected by rotation.
--
--    HEADS-UP for downstream tests: `<CHASE_LINK>` now points at the
--    deactivated row. Use the new link UUID for any subsequent calls.
--
-- 6) Non-coach caller is forbidden. Sign in as CLIENT_UUID and call:
--
--      SELECT * FROM public.rotate_invite_link();
--      -- expect: ERROR with errcode '42501'
--
-- 7) Rate limit. From a single ip_hash, fire record_invite_click 12
--    times rapid-fire and confirm only the first 10 inserts:
--
--      DO $$
--      DECLARE i INT; rec RECORD;
--      BEGIN
--        FOR i IN 1..12 LOOP
--          SELECT * INTO rec FROM public.record_invite_click(
--            '<NEW_CHASE_CODE>', 'rate-test-ip', 'rate-test-ua'
--          );
--          RAISE NOTICE 'attempt % click_id=% was_dedup=%', i, rec.click_id, rec.was_dedup;
--        END LOOP;
--      END $$;
--
--      SELECT count(*) FROM public.coach_invite_clicks
--       WHERE ip_hash = 'rate-test-ip'
--         AND clicked_at > NOW() - INTERVAL '2 minutes';
--      -- expect: ≤ 1 (the 60s per-(link, ip) dedup catches attempts 2-10
--      -- BEFORE the rate-limit branch even sees them; the rate-limit
--      -- branch then silently drops attempts 11-12 too).
--
--    To exercise the rate limit specifically, use 12 DIFFERENT codes
--    from 12 different active links (crawler scenario):
--      -- expect: 10 inserts, attempts 11-12 short-circuit was_dedup=TRUE
--      -- with click_id = NULL.
--
-- All seven pass → Phase C server-side is good. Wire the panel.
