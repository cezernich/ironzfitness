#!/usr/bin/env bash
# Real-role test of the deployed report contract, using only synthetic outcomes.
set -euo pipefail
cd "$(dirname "$0")/../.."
report_db="ironz_report_test_$$"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -t -A)
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $report_db"
trap '"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $report_db" >/dev/null' EXIT
q() { "${PSQL[@]}" -d "$report_db" -c "$1"; }
q "DO \$\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid \$\$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001','user'),('00000000-0000-0000-0000-000000000002','admin');
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS \$\$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') \$\$;
CREATE TABLE public.generated_plans(id uuid PRIMARY KEY,philosophy_module_ids text[]);
CREATE TABLE public.user_outcomes(plan_id uuid,difficulty_rating text,sessions_planned integer,sessions_completed integer,energy_level text);
INSERT INTO public.generated_plans VALUES ('00000000-0000-0000-0000-000000000011',ARRAY['synthetic-module']),('00000000-0000-0000-0000-000000000012',ARRAY['synthetic-module']);
INSERT INTO public.user_outcomes VALUES ('00000000-0000-0000-0000-000000000011','too_easy',2,1,'low'),('00000000-0000-0000-0000-000000000012','too_hard',1,1,'high');
ALTER TABLE public.generated_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_outcomes ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;"
for _ in 1 2; do "${PSQL[@]}" -d "$report_db" -f supabase/migrations/20261110214136_authorize_module_effectiveness_report.sql; done
if q 'SET ROLE anon; SELECT * FROM public.module_effectiveness_report();' >/dev/null 2>&1; then echo 'FAIL: anon read cross-user report';exit 1;fi
for claims in '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}' '{"sub":"00000000-0000-0000-0000-000000000001","role":"service_role","user_metadata":{"role":"admin"}}' '{}'; do
 if q "SET ROLE authenticated; SET request.jwt.claims='$claims'; SELECT * FROM public.module_effectiveness_report();" >/dev/null 2>&1;then echo 'FAIL: ordinary user/spoofed metadata read report';exit 1;fi
done
# A temporary table cannot impersonate the protected admin registry.
if q "SET ROLE authenticated; SET request.jwt.claims='{\"sub\":\"00000000-0000-0000-0000-000000000001\"}'; CREATE TEMP TABLE profiles(id uuid,role text); INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001','admin'); SELECT * FROM public.module_effectiveness_report();" >/dev/null 2>&1; then echo 'FAIL: temp profile spoof granted admin report';exit 1;fi
report_query="SELECT module_id||'|'||plan_count||'|'||round(avg_difficulty_score,2)||'|'||round(avg_completion_rate,2)||'|'||round(avg_energy,2) FROM public.module_effectiveness_report()"
[[ $(q "SET ROLE authenticated; SET request.jwt.claims='{\"sub\":\"00000000-0000-0000-0000-000000000002\",\"role\":\"authenticated\"}'; $report_query") == 'synthetic-module|2|0.50|0.75|0.50' ]]
[[ $(q "SET ROLE service_role; $report_query") == 'synthetic-module|2|0.50|0.75|0.50' ]]
[[ $(q "SELECT has_function_privilege('anon','public.module_effectiveness_report()','EXECUTE')") == f ]]
[[ $(q "SELECT proconfig::text FROM pg_proc WHERE oid='public.module_effectiveness_report()'::regprocedure") == '{"search_path=\"\""}' ]]
echo 'PASS: anonymous/ordinary/spoofed users denied; verified admin/backend retain identical report aggregates'
