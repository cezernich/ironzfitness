-- 2026-04-29 (Phase 5A) — let clients clear their own plan freeze
--
-- Phase 1 migration only granted coaches FOR ALL on client_plan_freeze
-- (via is_coaching) and clients SELECT-only. Phase 5A adds a client-
-- facing "Take back plan control" button on Profile, which needs to
-- mark the freeze cleared.
--
-- Approach: clients can UPDATE their own row to set unfrozen_at. Keeps
-- the historical record (the frozen_at + frozen_by columns are still
-- there for audit). The fetch path treats any row with unfrozen_at as
-- "not frozen" so the helper logic doesn't change.
--
-- DELETE is intentionally not granted — keeps the audit trail intact
-- if a coach asks "did you ever pause this?" later.

BEGIN;

DROP POLICY IF EXISTS "Clients can update their own plan freeze" ON public.client_plan_freeze;

CREATE POLICY "Clients can update their own plan freeze"
  ON public.client_plan_freeze
  FOR UPDATE
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

COMMIT;
