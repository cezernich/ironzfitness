#!/usr/bin/env python3
"""Real staging Auth/Data API checks. Synthetic accounts; no service key writes."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import uuid

REF = "yhchfxjzxhinreklnxbi"
URL = f"https://{REF}.supabase.co"
credentials = json.loads(Path(os.environ["IRONZ_STAGING_CREDENTIALS"]).read_text())
assert credentials["projectRef"] == REF
accounts = {a["label"]: dict(a) for a in credentials["accounts"]}
assert all(a["email"].endswith("@ironz-staging.example") for a in accounts.values())
keys = json.loads(subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "--output", "json"], capture_output=True, text=True, check=True).stdout)
ANON = next(item["api_key"] for item in keys if item.get("name") == "anon")
del keys
checks = 0


def api(label, path, method="GET", body=None):
    token = accounts[label]["token"] if label else ANON
    request = urllib.request.Request(URL + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": ANON, "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        return error.code, json.loads(raw) if raw else None


def check(name, condition):
    global checks
    if not condition:
        raise RuntimeError("FAIL: " + name + " (response and credentials withheld)")
    checks += 1
    print("PASS:", name)


for label, account in accounts.items():
    status, result = api(None, "/auth/v1/token?grant_type=password", "POST", {"email": account["email"], "password": account["password"]})
    check("synthetic sign-in " + label, status == 200)
    account["token"] = result["access_token"]


def state(label):
    status, rows = api(label, "/rest/v1/training_workspaces?select=*")
    check("owner workspace read " + label, status == 200 and len(rows) <= 1)
    return rows[0] if rows else {"revision": 0}


def submit(label, revision, command, request_id=None, actor=None):
    envelope = {"p_expected_user_id": actor or accounts[label]["id"], "p_expected_revision": revision,
        "p_request_id": request_id or str(uuid.uuid4()), "p_command": command}
    return api(label, "/rest/v1/rpc/apply_training_workspace_command", "POST", envelope)


def legacy_fingerprint():
    result = []
    for label in ["athlete-a", "athlete-b"]:
        status, rows = api(label, "/rest/v1/user_data?select=data_key,data_value,updated_at&data_key=in.(trainingPlan,workoutSchedule,events)&order=data_key")
        check("legacy plan fingerprint read " + label, status == 200)
        result.append(rows)
    return hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()


before = legacy_fingerprint()
fixture = json.loads(Path(os.environ["IRONZ_SHADOW_FIXTURE"]).read_text())
inputs = {"kind": "replace_inputs", "payload": {"input": fixture["input"]}}
current = state("athlete-a")["revision"]
request_id = str(uuid.uuid4())
status, first = submit("athlete-a", current, inputs, request_id)
check("input command commits", status == 200 and first["revision"] == current + 1)
status, replay = submit("athlete-a", current, inputs, request_id)
check("same request is idempotent", status == 200 and replay["replayed"] and replay["revision"] == first["revision"])
status, error = submit("athlete-a", current, inputs)
check("stale revision rejected", status == 409 and error.get("code") == "PT409")
status, error = submit("athlete-b", current, inputs, actor=accounts["athlete-a"]["id"])
check("token switch cannot redirect captured athlete", status >= 400 and error.get("code") == "42501")
candidate = {"kind": "record_shadow_candidate", "payload": {"inputRevision": first["revision"], "candidate": fixture["candidate"]}}
status, saved = submit("athlete-a", first["revision"], candidate)
check("actual engine candidate stores as shadow", status == 200 and saved["revision"] == first["revision"] + 1)
persisted = state("athlete-a")
check("candidate survives server reload", persisted["shadow_candidate"] == fixture["candidate"] and persisted["candidate_status"] == "unvalidated_shadow")
empty = json.loads(json.dumps(candidate))
empty["payload"]["candidate"]["weeklyPlan"] = []
status, error = submit("athlete-a", saved["revision"], empty)
check("empty replacement rejected", status >= 400 and error.get("code") == "22023")
check("failed replacement preserves candidate", state("athlete-a")["shadow_candidate"] == fixture["candidate"])
status, _ = api("athlete-a", "/rest/v1/training_workspaces?user_id=eq." + accounts["athlete-a"]["id"], "PATCH", {"revision": 999})
check("direct table edits denied", status in (401, 403))
for label in ["athlete-b", "coach", "admin"]:
    status, rows = api(label, "/rest/v1/training_workspaces?user_id=eq." + accounts["athlete-a"]["id"])
    check("workspace privacy from " + label, status == 200 and rows == [])
    status, rows = api(label, "/rest/v1/training_workspace_events?user_id=eq." + accounts["athlete-a"]["id"])
    check("history privacy from " + label, status == 200 and rows == [])
status, _ = api(None, "/rest/v1/training_workspaces")
check("anonymous workspace denied", status in (401, 403))
status, _ = api("athlete-a", "/rest/v1/rpc/apply_workspace_command", "POST", {})
check("private helper is not exposed", status == 404)
decision = {"kind": "record_decision", "payload": {"decision": {"kind": "preference", "text": "Synthetic recovery preference"}}}
with ThreadPoolExecutor(max_workers=2) as pool:
    outcomes = list(pool.map(lambda _: submit("athlete-a", saved["revision"], decision), range(2)))
check("concurrent commands have one winner", sum(status == 200 for status, _ in outcomes) == 1 and sum(body.get("code") == "PT409" for _, body in outcomes) == 1)
after_revision = state("athlete-a")["revision"]
status, old = submit("athlete-a", current, inputs, request_id)
check("old retry reports newer current revision", status == 200 and old["currentRevision"] == after_revision and old["revision"] < after_revision)
check("legacy plans untouched", before == legacy_fingerprint())
print(f"{checks} staging checks passed; synthetic workspace history retained, approved plans unchanged")
