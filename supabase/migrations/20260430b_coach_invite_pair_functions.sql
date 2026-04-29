-- 2026-04-30 (Phase B) — pair_with_coach + switch_coach + cooldown helper
--
-- Spec: COACH_INVITE_LINK_SPEC_2026-04-29.md (Phase B).
--
-- All three Phase B writes (coaching_assignments, coach_invite_clicks,
-- coaching_assignment_history) happen inside a single SECURITY DEFINER
-- function so atomicity is enforced server-side. The pre-kickoff fix
-- explicitly called out client-side BEGIN/COMMIT as the weaker option;
-- this migration takes the stronger one.
--
-- Error contract — both pair_with_coach and switch_coach RAISE
-- EXCEPTION on the failure paths, with these `errcode` values the
-- client uses to render specific toasts:
--
--   IRO01 — INVITE_LINK_INACTIVE (coach rotated, or link was never valid)
--   IRO02 — COACH_INACTIVE       (coach was deactivated since link issued)
--   IRO03 — SAME_COACH           (already paired with this coach;
--                                 client should redirect home with toast)
--   IRO04 — NO_EXISTING_COACH    (switch_coach called without an active
--                                 primary; client should call pair_with_coach)
--
-- All four are recoverable user-facing states; the client maps each
-- to a specific toast message. Anything else is an unexpected error and
-- the catch-all toast applies.
--
-- Smoke test gate at the bottom — run before wiring the JS handler.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. _is_active_coach(coach_uid) — internal guard
-- ──────────────────────────────────────────────────────────────────────
-- Used by both pair functions to refuse pairing against a deactivated
-- coach (pre-kickoff P1 fix). Marked STABLE + SECURITY DEFINER so
-- callers don't need direct SELECT on profiles.

CREATE OR REPLACE FUNCTION public._is_active_coach(p_coach_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_coach_uid AND is_coach = TRUE
  );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. pair_with_coach(invite_link_id) — first-time pairing
-- ──────────────────────────────────────────────────────────────────────
-- Caller is the AUTHENTICATED user (auth.uid()). The function:
--   1. Validates the link still exists (active or inactive — coach
--      may have rotated mid-flow per the edge-case spec; we honor the
--      original click attribution by accepting inactive links too,
--      provided the coach themselves is still active).
--   2. Validates the target coach is still is_coach = TRUE.
--   3. Refuses if user is ALREADY actively paired with this coach
--      (same-coach dedup; the client should redirect home with a toast).
--   4. Inserts coaching_assignments row (role=primary, source=invite_link).
--   5. Stamps coach_invite_clicks with accepted_at + paired_at + paired_assignment_id.
--   6. Inserts coaching_assignment_history (change_type=created).
--   7. Clears profiles.pending_invite_link_id.
--
-- All five writes happen in one transaction (the function body). If any
-- statement fails, the entire pairing rolls back.

CREATE OR REPLACE FUNCTION public.pair_with_coach(p_invite_link_id UUID)
RETURNS TABLE (
  assignment_id   UUID,
  coach_id        UUID,
  history_id      UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_link_id        UUID;
  v_coach_id       UUID;
  v_existing_pair  UUID;
  v_assignment_id  UUID;
  v_history_id     UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  -- Resolve the link. Aliased to satisfy the same RETURNS TABLE OUT
  -- shadow rule we hit in record_invite_click.
  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.id = p_invite_link_id
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  IF NOT public._is_active_coach(v_coach_id) THEN
    RAISE EXCEPTION 'coach is no longer accepting clients' USING ERRCODE = 'IRO02';
  END IF;

  -- Same-coach dedup: idempotent — if the user already has an active
  -- primary assignment with this coach, just return it. The client
  -- handles IRO03 by clearing the pending invite and showing a toast.
  SELECT ca.id INTO v_existing_pair
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.coach_id  = v_coach_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_existing_pair IS NOT NULL THEN
    RAISE EXCEPTION 'already paired with this coach' USING ERRCODE = 'IRO03';
  END IF;

  -- Block if user has ANY active primary coach (different from this one) —
  -- caller should switch_coach() instead. Keeps pair_with_coach a
  -- pure first-time path and prevents accidental orphaning.
  PERFORM 1
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'user already has a primary coach — call switch_coach' USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. Insert assignment ────────────────────────────────────────────
  INSERT INTO public.coaching_assignments (
    client_id, coach_id, role, assigned_by, active
  ) VALUES (
    v_user_id, v_coach_id, 'primary', v_user_id, TRUE
  )
  RETURNING id INTO v_assignment_id;

  -- ── 5. Stamp the most recent click row for THIS user + THIS link ───
  -- The edge function records anonymous clicks; we attach the user's
  -- identity now. Pick the most recent click on this link that doesn't
  -- already have a paired_assignment_id (so re-pairing after a previous
  -- switch / dismiss attaches to the right click row).
  UPDATE public.coach_invite_clicks cic
     SET signed_up_user_id    = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at         = COALESCE(cic.signed_up_at, NOW()),
         accepted_at          = NOW(),
         paired_assignment_id = v_assignment_id,
         paired_at            = NOW()
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = v_link_id
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   );

  -- ── 6. History row ──────────────────────────────────────────────────
  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, NULL, v_coach_id,
    'created', 'invite_link', v_link_id, v_user_id
  )
  RETURNING id INTO v_history_id;

  -- ── 7. Clear pending invite on profile ──────────────────────────────
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;

  RETURN QUERY SELECT v_assignment_id, v_coach_id, v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pair_with_coach(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. switch_coach(invite_link_id) — replace primary coach
-- ──────────────────────────────────────────────────────────────────────
-- Same shape as pair_with_coach, but deactivates the user's existing
-- primary first. Atomic — no half-paired state.

CREATE OR REPLACE FUNCTION public.switch_coach(p_invite_link_id UUID)
RETURNS TABLE (
  assignment_id     UUID,
  coach_id          UUID,
  previous_coach_id UUID,
  history_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_link_id           UUID;
  v_coach_id          UUID;
  v_prev_coach_id     UUID;
  v_prev_assignment   UUID;
  v_assignment_id     UUID;
  v_history_id        UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.id = p_invite_link_id
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  IF NOT public._is_active_coach(v_coach_id) THEN
    RAISE EXCEPTION 'coach is no longer accepting clients' USING ERRCODE = 'IRO02';
  END IF;

  -- Same-coach dedup: refuse switching to the coach you already have.
  SELECT ca.id INTO v_prev_assignment
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.coach_id  = v_coach_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_prev_assignment IS NOT NULL THEN
    RAISE EXCEPTION 'already paired with this coach' USING ERRCODE = 'IRO03';
  END IF;

  -- Find current primary (the one being switched out).
  SELECT ca.id, ca.coach_id INTO v_prev_assignment, v_prev_coach_id
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_prev_assignment IS NULL THEN
    -- Nothing to switch from — caller should have used pair_with_coach.
    RAISE EXCEPTION 'no existing primary coach to switch from' USING ERRCODE = 'IRO04';
  END IF;

  -- ── Deactivate previous primary ────────────────────────────────────
  UPDATE public.coaching_assignments ca
     SET active = FALSE,
         deactivated_at = NOW()
   WHERE ca.id = v_prev_assignment;

  -- ── Insert new primary ─────────────────────────────────────────────
  INSERT INTO public.coaching_assignments (
    client_id, coach_id, role, assigned_by, active
  ) VALUES (
    v_user_id, v_coach_id, 'primary', v_user_id, TRUE
  )
  RETURNING id INTO v_assignment_id;

  -- ── Stamp the click ────────────────────────────────────────────────
  UPDATE public.coach_invite_clicks cic
     SET signed_up_user_id    = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at         = COALESCE(cic.signed_up_at, NOW()),
         accepted_at          = NOW(),
         paired_assignment_id = v_assignment_id,
         paired_at            = NOW()
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = v_link_id
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   );

  -- ── History rows: deactivated + switched ───────────────────────────
  -- Two rows so audit queries can distinguish "old coach lost client"
  -- from "new coach gained client" by change_type.
  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, v_prev_coach_id, NULL,
    'deactivated', 'invite_link', v_link_id, v_user_id
  );

  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, v_prev_coach_id, v_coach_id,
    'switched', 'invite_link', v_link_id, v_user_id
  )
  RETURNING id INTO v_history_id;

  -- ── Clear pending invite on profile ────────────────────────────────
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;

  RETURN QUERY SELECT v_assignment_id, v_coach_id, v_prev_coach_id, v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_coach(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 4. dismiss_invite(invite_link_id) — record "Not now"
-- ──────────────────────────────────────────────────────────────────────
-- Sets dismissed_at on the most recent click for this user + link, and
-- clears the pending invite on the user's profile. The 7-day cooldown
-- is enforced client-side via this dismissed_at + a localStorage cache;
-- the server-side dismissed_at is the durable source of truth.

CREATE OR REPLACE FUNCTION public.dismiss_invite(p_invite_link_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_target_id  UUID;
  v_link_valid BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  -- Don't let callers pollute the table with synthetic rows for invite
  -- link UUIDs that don't exist (typo, garbage, malicious). The link
  -- doesn't have to be active — a coach may have rotated mid-flow and
  -- the user is dismissing the old link they originally clicked.
  SELECT EXISTS (
    SELECT 1 FROM public.coach_invite_links cil WHERE cil.id = p_invite_link_id
  ) INTO v_link_valid;
  IF NOT v_link_valid THEN
    RETURN;
  END IF;

  -- Stamp the most recent click row for this link with dismissed_at +
  -- the user id. If there's no matching click (the user pasted the URL
  -- straight into the SPA, an ad-blocker stripped the edge fetch, or
  -- the deep link bypassed c/index.html), we INSERT a synthetic dismiss
  -- row so the cross-device cooldown helper has a row to read.
  -- Without this fallback, invite_dismissed_recently returns FALSE
  -- for users whose dismiss happened on a clean device — cooldown
  -- would survive only as long as that device's localStorage cache.
  UPDATE public.coach_invite_clicks cic
     SET dismissed_at      = NOW(),
         signed_up_user_id = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at      = COALESCE(cic.signed_up_at, NOW())
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = p_invite_link_id
        AND cic2.dismissed_at IS NULL
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   )
  RETURNING cic.id INTO v_target_id;

  -- No click row matched — insert a synthetic one stamped to this user.
  -- ip_hash + user_agent_hash stay NULL because we have no IP context
  -- here (this is a server-side authenticated call, not the edge
  -- function's anonymous click path).
  IF v_target_id IS NULL THEN
    INSERT INTO public.coach_invite_clicks (
      invite_link_id, ip_hash, user_agent_hash,
      signed_up_user_id, signed_up_at, dismissed_at
    ) VALUES (
      p_invite_link_id, NULL, NULL,
      v_user_id, NOW(), NOW()
    );
  END IF;

  -- Clear the pending invite — user explicitly said no for now.
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_invite(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 5. invite_dismissed_recently(invite_link_id) — cooldown check
-- ──────────────────────────────────────────────────────────────────────
-- Returns TRUE if the caller dismissed this link within the last
-- 7 days. The client also caches dismissals in localStorage for the
-- fast path; this function is the authoritative cross-device check.

CREATE OR REPLACE FUNCTION public.invite_dismissed_recently(p_invite_link_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_invite_clicks cic
     WHERE cic.invite_link_id  = p_invite_link_id
       AND cic.signed_up_user_id = auth.uid()
       AND cic.dismissed_at IS NOT NULL
       AND cic.dismissed_at > NOW() - INTERVAL '7 days'
  );
$$;

GRANT EXECUTE ON FUNCTION public.invite_dismissed_recently(UUID) TO authenticated;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Phase B smoke test gate — run BEFORE wiring the JS handler
-- ══════════════════════════════════════════════════════════════════════
--
-- Setup: pick or create three test users.
--   • COACH_A_UUID  — promoted (is_coach = TRUE), has an active link.
--   • COACH_B_UUID  — promoted, has an active link.
--   • CLIENT_UUID   — not a coach.
--
-- And note the link UUIDs:
--   SELECT id, code FROM public.coach_invite_links WHERE active = TRUE;
--
-- 1) pair_with_coach happy path. Sign in as CLIENT_UUID and call:
--
--    SELECT * FROM public.pair_with_coach('<COACH_A_LINK_UUID>');
--    -- expect: assignment_id, coach_id, history_id all populated
--
--    Confirm the assignment exists:
--      SELECT id, coach_id, role, active FROM public.coaching_assignments
--       WHERE client_id = '<CLIENT_UUID>' AND active = TRUE;
--      -- expect 1 row
--
--    Confirm the click row got stamped:
--      SELECT signed_up_user_id, accepted_at, paired_at, paired_assignment_id
--        FROM public.coach_invite_clicks
--       WHERE invite_link_id = '<COACH_A_LINK_UUID>'
--       ORDER BY clicked_at DESC LIMIT 1;
--      -- expect: signed_up_user_id = CLIENT_UUID, all four timestamps non-null
--
--    Confirm history:
--      SELECT change_type, source FROM public.coaching_assignment_history
--       WHERE client_id = '<CLIENT_UUID>'
--       ORDER BY changed_at DESC LIMIT 1;
--      -- expect: 'created' / 'invite_link'
--
-- 2) Same-coach dedup. Re-call pair_with_coach for the same link:
--
--    SELECT * FROM public.pair_with_coach('<COACH_A_LINK_UUID>');
--    -- expect: ERROR with ERRCODE 'IRO03'
--
-- 3) Switch flow. Still as CLIENT_UUID, now switch to COACH_B:
--
--    SELECT * FROM public.switch_coach('<COACH_B_LINK_UUID>');
--    -- expect: new assignment_id, coach_id = COACH_B, previous_coach_id = COACH_A
--
--    Confirm exactly one active primary now points at COACH_B:
--      SELECT coach_id FROM public.coaching_assignments
--       WHERE client_id = '<CLIENT_UUID>' AND role = 'primary' AND active = TRUE;
--      -- expect 1 row, coach_id = COACH_B
--
--    Confirm two history rows landed (deactivated + switched):
--      SELECT change_type FROM public.coaching_assignment_history
--       WHERE client_id = '<CLIENT_UUID>'
--       ORDER BY changed_at DESC LIMIT 2;
--      -- expect: 'switched' then 'deactivated'
--
-- 4) switch_coach with no current primary returns IRO04. Sign in as a
--    user with no coaching_assignments rows:
--
--    SELECT * FROM public.switch_coach('<COACH_A_LINK_UUID>');
--    -- expect: ERROR with ERRCODE 'IRO04'
--
-- 5) Inactive coach. Flip COACH_A to is_coach = FALSE then try to pair:
--
--      UPDATE public.profiles SET is_coach = FALSE WHERE id = '<COACH_A_UUID>';
--      SELECT * FROM public.pair_with_coach('<COACH_A_LINK_UUID>');
--      -- expect: ERROR with ERRCODE 'IRO02'
--      UPDATE public.profiles SET is_coach = TRUE WHERE id = '<COACH_A_UUID>';
--
-- 6) Cooldown helper. Call dismiss_invite then verify
--    invite_dismissed_recently returns TRUE for that link, FALSE for
--    others:
--
--    SELECT public.dismiss_invite('<COACH_A_LINK_UUID>');
--    SELECT public.invite_dismissed_recently('<COACH_A_LINK_UUID>');
--    -- expect: TRUE
--    SELECT public.invite_dismissed_recently('<COACH_B_LINK_UUID>');
--    -- expect: FALSE
--
-- 7) Atomicity sanity. Run pair_with_coach against a malformed UUID;
--    confirm no rows leaked into any table:
--
--    SELECT * FROM public.pair_with_coach('00000000-0000-0000-0000-000000000000');
--    -- expect: ERROR with ERRCODE 'IRO01'
--    -- then verify coaching_assignments / coach_invite_clicks /
--    -- coaching_assignment_history have no rows referencing that link.
--
-- 8) Cooldown without a prior click row. Pick a user that has never
--    had a click recorded for COACH_A_LINK (a fresh test account works,
--    or DELETE the user's matching click row first). Then dismiss and
--    confirm the cooldown helper still returns TRUE — i.e., the synthetic
--    row insertion path fires:
--
--    DELETE FROM public.coach_invite_clicks
--     WHERE invite_link_id = '<COACH_A_LINK>' AND signed_up_user_id = '<CLIENT_UUID>';
--    SELECT public.dismiss_invite('<COACH_A_LINK>');
--    SELECT public.invite_dismissed_recently('<COACH_A_LINK>');
--    -- expect: TRUE
--
--    SELECT count(*) FROM public.coach_invite_clicks
--     WHERE invite_link_id = '<COACH_A_LINK>'
--       AND signed_up_user_id = '<CLIENT_UUID>'
--       AND dismissed_at IS NOT NULL;
--    -- expect: ≥ 1 (the synthetic row was inserted)
--
-- 9) Garbage UUID dismiss is a no-op. Confirm random UUIDs don't
--    pollute the table:
--
--    SELECT public.dismiss_invite('11111111-1111-1111-1111-111111111111');
--    SELECT count(*) FROM public.coach_invite_clicks
--     WHERE invite_link_id = '11111111-1111-1111-1111-111111111111';
--    -- expect: 0
--
-- All nine pass → Phase B server-side is good. Wire the JS handler.
