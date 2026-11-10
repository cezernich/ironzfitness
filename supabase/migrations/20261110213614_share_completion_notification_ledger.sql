-- Backend-owned rolling 24h notification reservations, independent of editable imports.
BEGIN;
CREATE TABLE IF NOT EXISTS public.share_completion_notification_claims (
  share_token text NOT NULL REFERENCES public.shared_workouts(share_token) ON DELETE CASCADE,
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL,
  PRIMARY KEY (share_token, receiver_user_id)
);
ALTER TABLE public.share_completion_notification_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.share_completion_notification_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.share_completion_notification_claims TO service_role;

-- Preserve the current cooldown during rollout. Legacy timestamps are
-- receiver-editable: use them conservatively once, clamp future values to now,
-- and never overwrite a server-owned claim when this migration is replayed.
INSERT INTO public.share_completion_notification_claims (share_token, receiver_user_id, claimed_at)
SELECT i.share_token, i.receiver_user_id, least(max(i.completed_at), statement_timestamp())
FROM public.workout_share_imports i
WHERE i.completed_at > statement_timestamp() - interval '24 hours'
GROUP BY i.share_token, i.receiver_user_id
ON CONFLICT (share_token, receiver_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_share_completion_notification(p_share_token text, p_receiver_user_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE STRICT SECURITY INVOKER
SET search_path = ''
AS $$
  WITH claimed AS (
    INSERT INTO public.share_completion_notification_claims AS claims
      (share_token, receiver_user_id, claimed_at)
    SELECT s.share_token, p_receiver_user_id, statement_timestamp()
    FROM public.shared_workouts s
    WHERE s.share_token = p_share_token AND s.revoked_at IS NULL
      AND s.expires_at > statement_timestamp()
      AND EXISTS (
        SELECT 1 FROM public.workout_share_imports i
        WHERE i.share_token = s.share_token AND i.receiver_user_id = p_receiver_user_id
          AND i.action <> 'dismissed'
      )
    ON CONFLICT (share_token, receiver_user_id) DO UPDATE
      SET claimed_at = excluded.claimed_at
      WHERE claims.claimed_at <= statement_timestamp() - interval '24 hours'
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_share_completion_notification(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_share_completion_notification(text, uuid) TO service_role;
COMMIT;
