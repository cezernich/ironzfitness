-- Reserve one of 30 daily Ask IronZ requests in a single row-locked upsert.
-- Backend only: the Edge Function verifies the user's token before passing ID.
BEGIN;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_user_id uuid)
RETURNS integer
LANGUAGE sql VOLATILE STRICT SECURITY INVOKER
SET search_path = ''
AS $$
  WITH reserved AS (
    INSERT INTO public.ai_usage AS usage (user_id, usage_date, request_count)
    VALUES (p_user_id, (statement_timestamp() AT TIME ZONE 'UTC')::date, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET request_count = greatest(coalesce(usage.request_count, 0), 0) + 1
      WHERE coalesce(usage.request_count, 0) < 30
    RETURNING request_count
  )
  SELECT coalesce((SELECT request_count FROM reserved), -1);
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid) TO service_role;
COMMENT ON FUNCTION public.consume_ai_quota(uuid) IS
  'Backend-only atomic reservation: 1..30 accepted, -1 exhausted; UTC day from database clock.';
COMMIT;
