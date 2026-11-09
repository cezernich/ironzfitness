-- Follow-up to 20261109_secure_profiles.sql: athletes need a coach display
-- card, not access to their coach's birthday, weight, and other health fields.
-- profile_cards already returns the allowlisted coach display fields.
BEGIN;
DROP POLICY IF EXISTS "Clients can view their coach's profile" ON public.profiles;
COMMIT;
