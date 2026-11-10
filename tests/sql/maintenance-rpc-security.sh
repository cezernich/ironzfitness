#!/usr/bin/env bash
# Applies the real ACL migration over deliberately publicly executable fixtures.
set -euo pipefail
cd "$(dirname "$0")/../.."
maintenance_db="ironz_maintenance_test_$$"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -t -A)
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $maintenance_db"
trap '"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $maintenance_db" >/dev/null' EXIT
q() { "${PSQL[@]}" -d "$maintenance_db" -c "$1"; }
q "DO \$\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
CREATE TABLE public.maintenance_test_effects(value integer NOT NULL);
INSERT INTO public.maintenance_test_effects VALUES (0);
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE FUNCTION public.backfill_coach_assignment_notes() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'UPDATE public.maintenance_test_effects SET value=value+1';
CREATE FUNCTION public.backfill_profile_full_name_from_auth() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'UPDATE public.maintenance_test_effects SET value=value+1';
GRANT EXECUTE ON FUNCTION public.backfill_coach_assignment_notes() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_profile_full_name_from_auth() TO PUBLIC,anon,authenticated;"
for _ in 1 2; do
 "${PSQL[@]}" -d "$maintenance_db" -f supabase/migrations/20261110212852_restrict_maintenance_rpcs.sql
 done
for rpc in backfill_coach_assignment_notes backfill_profile_full_name_from_auth; do
 for role in anon authenticated; do
  if q "SET ROLE $role; SELECT public.$rpc();" >/dev/null 2>&1; then
   echo "FAIL: $role could run $rpc";exit 1
  fi
  [[ $(q "SELECT has_function_privilege('$role','public.$rpc()','EXECUTE')") == f ]]
 done
 # Check PUBLIC itself so revoking explicit app-role grants cannot hide inheritance.
 [[ $(q "SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.$rpc()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'") == 0 ]]
done
[[ $(q 'SELECT value FROM public.maintenance_test_effects') == 0 ]]
q 'SET ROLE service_role; SELECT public.backfill_coach_assignment_notes(); SELECT public.backfill_profile_full_name_from_auth();' >/dev/null
[[ $(q 'SELECT value FROM public.maintenance_test_effects') == 2 ]]
echo 'PASS: anonymous/app roles cannot invoke either backfill; trusted maintenance still works; migration runs no backfill'
