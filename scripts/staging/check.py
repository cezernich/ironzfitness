"""Exercise the real staging Auth/Data API with synthetic role-separated users."""
import importlib.util
import json
import os
import secrets
from pathlib import Path
import sys
import uuid

spec = importlib.util.spec_from_file_location("seed", Path(__file__).with_name("seed-users.py"))
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)
credentials = json.loads(seed.CREDENTIALS.read_text())
assert credentials["projectRef"] == seed.REF
accounts = {account["label"]: account for account in credentials["accounts"]}
results = []


def check(name, passed, detail=""):
    results.append({"name": name, "passed": bool(passed), "detail": detail})
    print(("PASS " if passed else "FAIL ") + name)


def request(label, path, method="GET", data=None, prefer=None):
    return seed.api(path, method, data, token=accounts[label]["token"] if label else seed.ANON_KEY, key=seed.ANON_KEY, prefer=prefer)


for label, account in accounts.items():
    status, login = seed.api("/auth/v1/token?grant_type=password", "POST", {"email": account["email"], "password": account["password"]}, token=seed.ANON_KEY, key=seed.ANON_KEY)
    check("password sign-in: " + label, status == 200)
    if status != 200:
        raise RuntimeError("Staging sign-in failed; response withheld")
    account["token"] = login["access_token"]

status, _ = seed.api("/auth/v1/signup", "POST", {"email": "unprovisioned-" + uuid.uuid4().hex + "@ironz-staging.example", "password": secrets.token_urlsafe(24)}, token=seed.ANON_KEY, key=seed.ANON_KEY)
check("public self-service signup is disabled", status in (400, 403, 422))

a, b, coach, admin = [accounts[label]["id"] for label in ("athlete-a", "athlete-b", "coach", "admin")]

reference = json.loads((Path(__file__).resolve().parents[2] / "sources-of-truth/philosophy/modules_static.json").read_text())
# PostgREST bulk inserts require identical object keys. Optional static-module
# fields vary; normalize them to the actual table contract before seeding.
defaults = {"id": None, "category": None, "title": None, "version": "1.0", "applies_when": {}, "principles": [], "plan_rules": [], "hard_constraints": [], "nutrition_rules": [], "training_adjustments": [], "coaching_tone": None, "evidence_sources": [], "rationale": None, "priority": "medium", "is_active": True}
reference = [{key: module.get(key, default) for key, default in defaults.items()} for module in reference]
status, modules = seed.api("/rest/v1/philosophy_modules?on_conflict=id", "POST", reference, prefer="resolution=merge-duplicates,return=minimal")
check("reference philosophy modules seeded", status in (200, 201, 204))

for label, account in accounts.items():
    profile = {"name": "Synthetic " + label.title(), "age": "30", "weight": "165", "height": "70", "gender": "male", "goal": "general_fitness"}
    rows = [{"user_id": account["id"], "data_key": key, "data_value": value} for key, value in {"hasOnboarded": "1", "surveyComplete": "1", "profile": profile}.items()]
    status, _ = seed.api("/rest/v1/user_data?on_conflict=user_id,data_key", "POST", rows, prefer="resolution=merge-duplicates,return=minimal")
    check("synthetic browser state: " + label, status in (200, 201, 204))

status, _ = request("athlete-a", f"/rest/v1/profiles?id=eq.{a}", "PATCH", {"role": "admin", "subscription_status": "premium", "is_coach": True})
_, actual = seed.api(f"/rest/v1/profiles?id=eq.{a}&select=role,subscription_status,is_coach")
check("athlete cannot promote self", actual == [{"role": "user", "subscription_status": "free", "is_coach": False}])
if actual != [{"role": "user", "subscription_status": "free", "is_coach": False}]:
    seed.api(f"/rest/v1/profiles?id=eq.{a}", "PATCH", {"role": "user", "subscription_status": "free", "is_coach": False})

status, rows = request("athlete-a", f"/rest/v1/profiles?id=eq.{b}&select=id,weight_lbs,birthday")
check("athlete cannot read another athlete profile", status in (401, 403) or rows == [])
status, _ = request("athlete-a", f"/rest/v1/profiles?id=eq.{a}", "PATCH", {"weight_lbs": 166})
_, rows = request("athlete-a", f"/rest/v1/profiles?id=eq.{a}&select=weight_lbs")
check("own profile edit persists", status in (200, 204) and rows == [{"weight_lbs": 166}])

workout_id = str(uuid.uuid5(uuid.NAMESPACE_URL, seed.URL + "/synthetic-workout-b"))
status, _ = seed.api("/rest/v1/workouts?on_conflict=id", "POST", {"id": workout_id, "user_id": b, "date": "2026-11-09", "name": "Synthetic Workout B", "type": "running", "duration_minutes": 30}, prefer="resolution=merge-duplicates,return=minimal")
check("synthetic workout fixture created", status in (200, 201, 204))
status, rows = request("athlete-a", f"/rest/v1/workouts?id=eq.{workout_id}&select=id")
check("athlete cannot read another athlete workout", status in (401, 403) or rows == [])
request("athlete-a", f"/rest/v1/workouts?id=eq.{workout_id}", "PATCH", {"name": "Unauthorized edit"})
_, rows = seed.api(f"/rest/v1/workouts?id=eq.{workout_id}&select=name")
check("athlete cannot edit another athlete workout", rows == [{"name": "Synthetic Workout B"}])

status, _ = request("athlete-a", "/rest/v1/user_data?on_conflict=user_id,data_key", "POST", {"user_id": a, "data_key": "stagingPersistenceProbe", "data_value": {"synthetic": True}}, prefer="resolution=merge-duplicates,return=minimal")
_, rows = request("athlete-a", f"/rest/v1/user_data?user_id=eq.{a}&data_key=eq.stagingPersistenceProbe&select=data_value")
check("own persisted state can be read back", status in (200, 201, 204) and rows == [{"data_value": {"synthetic": True}}])
_, rows = request("athlete-b", f"/rest/v1/user_data?user_id=eq.{a}&data_key=eq.stagingPersistenceProbe&select=data_value")
check("persisted state isolated between athletes", rows == [])

assignment_id = str(uuid.uuid5(uuid.NAMESPACE_URL, seed.URL + "/synthetic-assignment"))
status, _ = seed.api("/rest/v1/coaching_assignments?on_conflict=id", "POST", {"id": assignment_id, "client_id": a, "coach_id": coach, "role": "primary", "active": True}, prefer="resolution=merge-duplicates,return=minimal")
check("synthetic coach assignment created", status in (200, 201, 204))
status, rows = request("athlete-a", f"/rest/v1/profiles?id=eq.{coach}&select=id,weight_lbs,birthday")
check("assigned athlete cannot read coach health fields", status in (401, 403) or rows == [], "A narrow display card must not grant the entire profile row")
status, rows = request("athlete-a", "/rest/v1/rpc/profile_cards", "POST", {"p_ids": [coach]})
check("assigned athlete can read narrow coach card", status == 200 and len(rows) == 1 and "weight_lbs" not in rows[0] and "birthday" not in rows[0])
status, rows = request("athlete-a", "/rest/v1/rpc/lookup_user_by_email", "POST", {"p_email": accounts["athlete-b"]["email"].upper()})
check("exact email lookup preserves sharing", status == 200 and len(rows) == 1 and rows[0]["id"] == b)
status, _ = request(None, "/rest/v1/rpc/lookup_user_by_email", "POST", {"p_email": accounts["athlete-b"]["email"]})
check("anonymous email lookup rejected", status in (401, 403))

share_id = str(uuid.uuid5(uuid.NAMESPACE_URL, seed.URL + "/synthetic-share"))
status, _ = seed.api("/rest/v1/shared_workouts?on_conflict=id", "POST", {"id": share_id, "share_token": "STAGINGqa001", "sender_user_id": b, "variant_id": "synthetic-variant", "sport_id": "run", "session_type_id": "easy"}, prefer="resolution=merge-duplicates,return=minimal")
check("synthetic share fixture created", status in (200, 201, 204))
status, rows = request(None, f"/rest/v1/profiles?id=eq.{b}&select=id,weight_lbs,birthday")
check("anonymous share visitor cannot read sender health fields", status in (401, 403) or rows == [])
status, rows = request("admin", "/rest/v1/profiles?select=id")
check("administrator retains authorized profile access", status == 200 and len(rows) == len(accounts))

for name in ("ask-ironz", "strava-auth", "send-push"):
    status, body = request("athlete-a", "/functions/v1/" + name, "POST", {})
    check("external integration explicitly disabled: " + name, status == 503 and body.get("error") == "STAGING_INTEGRATION_DISABLED")

status, _ = request(None, "/functions/v1/delete-account", "POST", {})
check("account deletion rejects unauthenticated caller", status in (401, 403))

password = secrets.token_urlsafe(24)
email = "disposable-" + uuid.uuid4().hex + "@ironz-staging.example"
status, disposable = seed.api("/auth/v1/admin/users", "POST", {"email": email, "password": password, "email_confirm": True})
if status not in (200, 201):
    raise RuntimeError("Cannot prepare disposable account-deletion test")
try:
    status, login = seed.api("/auth/v1/token?grant_type=password", "POST", {"email": email, "password": password}, token=seed.ANON_KEY, key=seed.ANON_KEY)
    if status != 200:
        raise RuntimeError("Disposable account sign-in failed")
    status, _ = seed.api("/functions/v1/delete-account", "POST", {}, token=login["access_token"], key=seed.ANON_KEY)
    check("disposable user can delete own account", status == 200)
    status, _ = seed.api("/auth/v1/admin/users/" + disposable["id"])
    check("deleted disposable account no longer exists", status == 404)
finally:
    # Only this run's designated disposable staging user may be cleaned up.
    seed.api("/auth/v1/admin/users/" + disposable["id"], "DELETE")

report = {"environment": "staging", "projectRef": seed.REF, "productionChanged": False, "passed": sum(r["passed"] for r in results), "failed": sum(not r["passed"] for r in results), "checks": results}
target = Path(os.environ.get("IRONZ_STAGING_REPORT", "/tmp/ironz-staging-api-results.json"))
target.write_text(json.dumps(report, indent=2))
print(f"Results: {report['passed']} passed, {report['failed']} failed. {target}")
sys.exit(1 if report["failed"] else 0)
