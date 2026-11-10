#!/usr/bin/env bash
# Real-role isolation and concurrent reservations in a disposable database.
set -euo pipefail
cd "$(dirname "$0")/../.."
quota_db="ironz_quota_test_$$"
quota_results=$(mktemp -d)
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -t -A)
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $quota_db"
cleanup() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $quota_db" >/dev/null
  rm -rf "$quota_results"
}
trap cleanup EXIT
q() { "${PSQL[@]}" -d "$quota_db" -c "$1"; }
q "DO \$\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
CREATE TABLE public.ai_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),usage_date date NOT NULL DEFAULT CURRENT_DATE,request_count integer DEFAULT 0,created_at timestamptz DEFAULT now(),UNIQUE(user_id,usage_date));
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON public.ai_usage TO anon,authenticated,service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_usage ON public.ai_usage FOR SELECT TO authenticated USING (user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);"
for _ in 1 2; do
 "${PSQL[@]}" -d "$quota_db" -f supabase/migrations/20261110204431_atomic_ai_quota.sql
 done
for role in anon authenticated; do
 if q "SET ROLE $role; SELECT public.consume_ai_quota('00000000-0000-0000-0000-000000000001');" >"$quota_results/denied" 2>&1; then
  echo "FAIL: $role executed quota RPC"; exit 1
 fi
 if q "SET ROLE $role; INSERT INTO public.ai_usage(user_id,usage_date,request_count) VALUES ('00000000-0000-0000-0000-000000000001',CURRENT_DATE,0);" >"$quota_results/denied" 2>&1; then
  echo "FAIL: $role wrote quota counter"; exit 1
 fi
 [[ $(q "SELECT has_table_privilege('$role','public.ai_usage','UPDATE') OR has_table_privilege('$role','public.ai_usage','DELETE') OR has_table_privilege('$role','public.ai_usage','TRUNCATE')") == f ]]
done
# Fresh-row contention: only 30 reservations across 40 independent connections.
quota_pids=()
for i in $(seq 1 40); do
 q "SET ROLE service_role; SELECT public.consume_ai_quota('00000000-0000-0000-0000-000000000001');" >"$quota_results/$i" &
 quota_pids+=("$!")
done
for pid in "${quota_pids[@]}"; do wait "$pid"; done
[[ $(cat "$quota_results"/[0-9]* | sort -n | uniq | wc -l | tr -d ' ') == 31 ]]
[[ $(cat "$quota_results"/[0-9]* | grep -c '^-1$') == 10 ]]
[[ $(q "SELECT request_count FROM public.ai_usage WHERE user_id='00000000-0000-0000-0000-000000000001'") == 30 ]]
# Independent user/day buckets and UTC boundary under an extreme session zone.
[[ $(q "SET ROLE service_role; SET TIME ZONE 'Pacific/Kiritimati'; SELECT public.consume_ai_quota('00000000-0000-0000-0000-000000000002')") == 1 ]]
[[ $(q "SELECT count(*) FROM public.ai_usage WHERE usage_date=(statement_timestamp() AT TIME ZONE 'UTC')::date") == 2 ]]
[[ $(q "SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; SELECT count(*) FROM public.ai_usage") == 1 ]]
q "UPDATE public.ai_usage SET usage_date=usage_date-1 WHERE user_id='00000000-0000-0000-0000-000000000002'"
[[ $(q "SET ROLE service_role; SELECT public.consume_ai_quota('00000000-0000-0000-0000-000000000002')") == 1 ]]
[[ $(q "SELECT prosecdef FROM pg_proc WHERE oid='public.consume_ai_quota(uuid)'::regprocedure") == f ]]
echo 'PASS: backend-only atomic quota, 40 concurrent requests capped at 30, owner reads, UTC day and daily reset'
