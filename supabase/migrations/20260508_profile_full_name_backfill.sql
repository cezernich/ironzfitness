-- 2026-05-08 — Backfill profiles.full_name from auth.users metadata.
--
-- ensureProfile (auth.js) only writes profiles on first login,
-- copying full_name from user.user_metadata at that moment. If the
-- name landed in auth.users.raw_user_meta_data later (admin edited
-- it, user updated their auth profile via supabase-js, etc.), the
-- profiles row stayed with the empty string it was inserted with.
-- Admin Panel reads profiles.full_name and rendered "—" for those
-- users even though the data was sitting one table over.
--
-- Backfill: for every profile with an empty / null full_name where
-- auth.users.raw_user_meta_data has a non-empty `full_name`, copy
-- the value across. Idempotent — re-running only touches rows that
-- still have the gap.

BEGIN;

CREATE OR REPLACE FUNCTION public.backfill_profile_full_name_from_auth()
RETURNS TABLE(updated INTEGER, scanned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INTEGER := 0;
  total INTEGER := 0;
BEGIN
  -- Count candidates first so we can return both numbers in one go.
  SELECT count(*) INTO total
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(p.full_name, '') = ''
      AND COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), '') <> '';

  UPDATE public.profiles p
    SET full_name = u.raw_user_meta_data ->> 'full_name'
    FROM auth.users u
    WHERE u.id = p.id
      AND COALESCE(p.full_name, '') = ''
      AND COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), '') <> '';

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt, total;
END;
$$;

SELECT * FROM public.backfill_profile_full_name_from_auth();

COMMIT;
