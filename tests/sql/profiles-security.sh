#!/usr/bin/env bash
# Security regression test for public.profiles (migration 20261109_secure_profiles.sql).
#
# Builds a throwaway database from tests/sql/mock_supabase.sql, applies the
# migration twice (it must be re-runnable), then runs attacks and legitimate
# app paths as anon / authenticated / service_role users.
#
# Needs a Postgres superuser connection:
#   PGHOST/PGUSER/PGPASSWORD (CI) or a local `sudo -u postgres` setup.
# Usage: bash tests/sql/profiles-security.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

DB="ironz_sec_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q -t -A)

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null
trap '"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT

"${PSQL[@]}" -d "$DB" -f tests/sql/mock_supabase.sql >/dev/null
"${PSQL[@]}" -d "$DB" -c "INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000f')" >/dev/null
for _ in 1 2; do
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20261109_secure_profiles.sql >/dev/null 2>&1 \
    || { echo "FAIL: migration did not apply cleanly"; exit 1; }
done

for _ in 1 2; do
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20261109174117_restrict_coach_profile_reads.sql >/dev/null 2>&1 \
    || { echo "FAIL: coach privacy migration did not apply cleanly"; exit 1; }
done

uid() { echo "00000000-0000-0000-0000-00000000000$1"; }

# as <role> <uid-suffix|-> <email|-> <sql>
as() {
  local role=$1 u=$2 email=$3 sql=$4 claims
  if [ "$u" = "-" ]; then claims="{\"role\":\"$role\"}"
  else claims="{\"role\":\"$role\",\"sub\":\"$(uid "$u")\",\"email\":\"$email\"}"; fi
  "${PSQL[@]}" -d "$DB" -c "BEGIN; DO \$x\$ BEGIN PERFORM set_config('request.jwt.claims','$claims',true); END \$x\$; SET LOCAL ROLE $role; $sql; COMMIT;" 2>&1 || true
}
q() { "${PSQL[@]}" -d "$DB" -c "$1"; }

fails=0
check() { # check <name> <actual> <expected>
  if [ "$2" == "$3" ]; then echo "  PASS: $1"; else echo "  FAIL: $1 (expected [$3], got [$2])"; fails=$((fails+1)); fi
}

echo "Attacks"
check "user cannot read another user's profile row" \
  "$(as authenticated a a@x.com "SELECT birthday FROM profiles WHERE full_name='Victim'")" ""
check "anon cannot read a share sender's profile row" \
  "$(as anon - - "SELECT birthday FROM profiles WHERE full_name='Victim'")" ""
as authenticated a a@x.com "UPDATE profiles SET role='admin', subscription_status='premium', is_coach=true, email='b@x.com' WHERE id=auth.uid()" >/dev/null
check "user cannot self-promote (role/subscription/coach/email)" \
  "$(q "SELECT role||'/'||subscription_status||'/'||is_coach||'/'||email FROM profiles WHERE full_name='Attacker'")" "user/free/false/a@x.com"
as authenticated a a@x.com "UPDATE profiles SET full_name='Hacked' WHERE full_name='Victim'" >/dev/null
check "user cannot edit another user's row" \
  "$(q "SELECT full_name FROM profiles WHERE id='$(uid b)'")" "Victim"
as authenticated e e@x.com "INSERT INTO profiles(id,email,role,subscription_status,is_coach) VALUES (auth.uid(),'fake@x.com','admin','premium',true)" >/dev/null
check "new signup cannot insert itself as admin or spoof email" \
  "$(q "SELECT role||'/'||subscription_status||'/'||is_coach||'/'||email FROM profiles WHERE id='$(uid e)'")" "user/free/false/e@x.com"
check "anon cannot call lookup_user_by_email" \
  "$(as anon - - "SELECT count(*) FROM lookup_user_by_email('b@x.com')" | grep -c 'permission denied')" "1"
check "no profile card without a relationship or live share" \
  "$(as authenticated b b@x.com "SELECT count(*) FROM profile_cards(ARRAY['$(uid a)']::uuid[])")" "0"

echo "Legitimate paths"
as authenticated a a@x.com "UPDATE profiles SET weight_lbs=175, full_name='Attacker2' WHERE id=auth.uid()" >/dev/null
check "user edits own profile fields" "$(q "SELECT full_name||' '||weight_lbs FROM profiles WHERE id='$(uid a)'")" "Attacker2 175"
as authenticated a a@x.com "INSERT INTO profiles(id,weight_lbs) VALUES (auth.uid(),181) ON CONFLICT (id) DO UPDATE SET weight_lbs=EXCLUDED.weight_lbs" >/dev/null
check "own-profile upsert (db.js) works and keeps role" "$(q "SELECT weight_lbs||' '||role FROM profiles WHERE id='$(uid a)'")" "181 user"
as authenticated c chase.zernich@gmail.com "UPDATE profiles SET role='admin' WHERE id=auth.uid()" >/dev/null
check "owner email self-heals to admin" "$(q "SELECT role FROM profiles WHERE id='$(uid c)'")" "admin"
as authenticated f chase.zernich@kellogg.northwestern.edu "INSERT INTO profiles(id,email) VALUES (auth.uid(),'x')" >/dev/null
check "owner email gets admin on signup" "$(q "SELECT role FROM profiles WHERE id='$(uid f)'")" "admin"
as authenticated c chase.zernich@gmail.com "UPDATE profiles SET is_coach=true WHERE id='$(uid a)'" >/dev/null
check "admin can change another user's privileged fields" "$(q "SELECT is_coach FROM profiles WHERE id='$(uid a)'")" "t"
as service_role - - "UPDATE profiles SET subscription_status='premium' WHERE id='$(uid b)'" >/dev/null
check "service_role (edge functions) can set subscription" "$(q "SELECT subscription_status FROM profiles WHERE id='$(uid b)'")" "premium"
check "coach reads assigned client's row" "$(as authenticated d k@x.com "SELECT full_name FROM profiles WHERE id='$(uid b)'")" "Victim"
check "client cannot read their coach's private profile row" "$(as authenticated b b@x.com "SELECT birthday,weight_lbs FROM profiles WHERE id='$(uid d)'")" ""
check "client can read their coach's narrow display card" "$(as authenticated b b@x.com "SELECT full_name FROM profile_cards(ARRAY['$(uid d)']::uuid[])")" "Coach"
check "email lookup is exact and case-insensitive" "$(as authenticated a a@x.com "SELECT full_name FROM lookup_user_by_email('  B@X.com ')")" "Victim"
q "INSERT INTO workout_inbox(sender_id,recipient_id) VALUES ('$(uid a)','$(uid d)')" >/dev/null
check "sender sees recipient card with email" \
  "$(as authenticated a a@x.com "SELECT full_name||'|'||coalesce(email,'-') FROM profile_cards(ARRAY['$(uid d)']::uuid[])")" "Coach|k@x.com"
check "recipient sees sender name but not email" \
  "$(as authenticated d k@x.com "SELECT full_name||'|'||coalesce(email,'-') FROM profile_cards(ARRAY['$(uid a)']::uuid[])")" "Attacker2|-"
check "anon sees live-share sender name only" \
  "$(as anon - - "SELECT full_name||'|'||coalesce(email,'-') FROM profile_cards(ARRAY['$(uid b)']::uuid[])")" "Victim|-"

echo
if [ "$fails" -gt 0 ]; then echo "$fails profiles security check(s) failed."; exit 1; fi
echo "All profiles security checks pass."
