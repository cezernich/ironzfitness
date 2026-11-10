-- One-off backfills must not be exposed as anonymous/authenticated RPCs.
-- Preserve trusted maintenance execution; no backfill is run by this migration.
BEGIN;
REVOKE ALL ON FUNCTION public.backfill_coach_assignment_notes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_profile_full_name_from_auth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_coach_assignment_notes() TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_profile_full_name_from_auth() TO service_role;
COMMIT;
