-- Assigned coaches receive allowlisted profile cards, not full health rows.
-- Keep owner/admin policies and existing relationship-scoped card RPC intact.
BEGIN;
DROP POLICY IF EXISTS "Coaches can view assigned clients' profiles" ON public.profiles;
COMMIT;
