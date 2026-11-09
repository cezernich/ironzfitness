-- Final profile privacy postcondition. Earlier files are immutable history.
-- This version uses the next calendar prefix because the legacy 8-digit
-- 20261109_secure_profiles.sql sorts AFTER every 20261109HHMMSS_* file.
-- The version is an ordering key, not a future activation/release date.
BEGIN;
DROP POLICY IF EXISTS "Clients can view their coach's profile" ON public.profiles;
COMMIT;
