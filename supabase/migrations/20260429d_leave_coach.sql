-- 2026-04-29 — client-initiated leave_coach()
--
-- Clients had no way to end their own coaching relationship — the only
-- write policy on coaching_assignments was admin-only. This RPC lets a
-- client soft-deactivate every active row where they're the client.
-- SECURITY DEFINER so it bypasses the admin-only RLS, but the WHERE
-- clause is locked to auth.uid() so a client can only ever leave their
-- own coach.
--
-- Idempotent: calling on a client with no active assignments is a no-op.

BEGIN;

CREATE OR REPLACE FUNCTION public.leave_coach()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.coaching_assignments
     SET active = FALSE,
         deactivated_at = NOW()
   WHERE client_id = uid
     AND active = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_coach() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_coach() TO authenticated;

COMMIT;
