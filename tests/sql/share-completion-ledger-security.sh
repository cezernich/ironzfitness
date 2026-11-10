#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
ledger_db="ironz_ledger_test_$$"
ledger_results=$(mktemp -d)
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -t -A)
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $ledger_db"
cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $ledger_db" >/dev/null; rm -rf "$ledger_results"; }
trap cleanup EXIT
q() { "${PSQL[@]}" -d "$ledger_db" -c "$1"; }
q "DO \$\$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
CREATE TABLE public.shared_workouts(share_token text PRIMARY KEY,revoked_at timestamptz,expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days');
CREATE TABLE public.workout_share_imports(share_token text REFERENCES public.shared_workouts(share_token),receiver_user_id uuid REFERENCES auth.users(id),action text,completed_at timestamptz);
INSERT INTO public.shared_workouts(share_token) VALUES ('active'),('revoked'),('expired'),('dismissed'),('no-import'),('legacy'),('future-legacy');
UPDATE public.shared_workouts SET revoked_at=now() WHERE share_token='revoked';
UPDATE public.shared_workouts SET expires_at=now()-interval '1 hour' WHERE share_token='expired';
INSERT INTO public.workout_share_imports(share_token,receiver_user_id,action) SELECT share_token,'00000000-0000-0000-0000-000000000001','scheduled' FROM public.shared_workouts WHERE share_token<>'no-import';
UPDATE public.workout_share_imports SET action='dismissed' WHERE share_token='dismissed';
UPDATE public.workout_share_imports SET completed_at=now()-interval '2 hours' WHERE share_token='legacy';
UPDATE public.workout_share_imports SET completed_at=now()+interval '1 year' WHERE share_token='future-legacy';
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON public.shared_workouts,public.workout_share_imports TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workout_share_imports TO authenticated;"
for _ in 1 2; do "${PSQL[@]}" -d "$ledger_db" -f supabase/migrations/20261110213614_share_completion_notification_ledger.sql; done
for role in anon authenticated; do
 if q "SET ROLE $role; SELECT public.claim_share_completion_notification('active','00000000-0000-0000-0000-000000000001');" >"$ledger_results/denied" 2>&1; then echo 'FAIL: client executed claim RPC';exit 1;fi
 for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
  [[ $(q "SELECT has_table_privilege('$role','public.share_completion_notification_claims','$privilege')") == f ]]
 done
done
for token in revoked expired dismissed no-import legacy future-legacy; do
 [[ $(q "SET ROLE service_role; SELECT public.claim_share_completion_notification('$token','00000000-0000-0000-0000-000000000001')") == f ]]
done
[[ $(q "SELECT count(*) FROM public.share_completion_notification_claims WHERE claimed_at>statement_timestamp()") == 0 ]]
[[ $(q "SET ROLE service_role; SELECT public.claim_share_completion_notification('active','00000000-0000-0000-0000-000000000002')") == f ]]
ledger_pids=()
for i in $(seq 1 40); do
 q "SET ROLE service_role; SELECT public.claim_share_completion_notification('active','00000000-0000-0000-0000-000000000001');" >"$ledger_results/$i" & ledger_pids+=("$!")
done
for pid in "${ledger_pids[@]}"; do wait "$pid"; done
[[ $(cat "$ledger_results"/[0-9]* | grep -c '^t$') == 1 ]]
[[ $(cat "$ledger_results"/[0-9]* | grep -c '^f$') == 39 ]]
# Resetting/deleting/reimporting editable training records cannot clear a claim.
q "SET ROLE authenticated; UPDATE public.workout_share_imports SET completed_at=null WHERE share_token='active'; DELETE FROM public.workout_share_imports WHERE share_token='active'; INSERT INTO public.workout_share_imports VALUES ('active','00000000-0000-0000-0000-000000000001','scheduled',null);"
[[ $(q "SET ROLE service_role; SELECT public.claim_share_completion_notification('active','00000000-0000-0000-0000-000000000001')") == f ]]
q "UPDATE public.share_completion_notification_claims SET claimed_at=now()-interval '25 hours' WHERE share_token='active'"
[[ $(q "SET ROLE service_role; SELECT public.claim_share_completion_notification('active','00000000-0000-0000-0000-000000000001')") == t ]]
[[ $(q "SELECT relrowsecurity FROM pg_class WHERE oid='public.share_completion_notification_claims'::regclass") == t ]]
[[ $(q "SELECT prosecdef FROM pg_proc WHERE oid='public.claim_share_completion_notification(text,uuid)'::regprocedure") == f ]]
echo 'PASS: 40 concurrent claims yield 1 winner; client resets cannot bypass; backend-only RLS/grants, active import, legacy cooldown and 24h renewal verified'
