-- This report aggregates cross-user outcomes: allow admin analytics and trusted backend only.
BEGIN;
-- This helper uses unqualified profiles in older installs. Pin its own path
-- so it remains correct when called from this report's empty search path.
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
CREATE OR REPLACE FUNCTION public.module_effectiveness_report()
RETURNS TABLE (
  module_id text,
  plan_count bigint,
  avg_difficulty_score numeric,
  avg_completion_rate numeric,
  avg_energy numeric
) AS $$
BEGIN
  -- SQL role cannot be forged through editable user metadata/JWT profile data.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    unnest(gp.philosophy_module_ids) AS module_id,
    COUNT(DISTINCT gp.id) AS plan_count,
    AVG(CASE uo.difficulty_rating
      WHEN 'too_easy' THEN 0.0
      WHEN 'just_right' THEN 0.5
      WHEN 'too_hard' THEN 1.0
    END) AS avg_difficulty_score,
    AVG(CASE WHEN uo.sessions_planned > 0
      THEN uo.sessions_completed::numeric / uo.sessions_planned
      ELSE NULL END) AS avg_completion_rate,
    AVG(CASE uo.energy_level
      WHEN 'low' THEN 0.0
      WHEN 'moderate' THEN 0.5
      WHEN 'high' THEN 1.0
    END) AS avg_energy
  FROM public.generated_plans gp
  JOIN public.user_outcomes uo ON uo.plan_id = gp.id
  GROUP BY unnest(gp.philosophy_module_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
REVOKE ALL ON FUNCTION public.module_effectiveness_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.module_effectiveness_report() TO authenticated, service_role;
COMMIT;
