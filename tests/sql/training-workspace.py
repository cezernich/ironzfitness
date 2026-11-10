#!/usr/bin/env python3
"""Exercise actual Postgres roles, CAS, retries, concurrency and rollback."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DATABASE = f"ironz_workspace_test_{os.getpid()}"
UID_A = "00000000-0000-0000-0000-000000000001"
UID_B = "00000000-0000-0000-0000-000000000002"
BASE = ["psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"]
passed = 0


def query(sql, user=None, role=None, fail=None):
    if role:
        claims = json.dumps({"sub": user, "role": role})
        sql = f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claims = '{claims}'; {sql}; COMMIT;"
    result = subprocess.run(BASE + ["-d", DATABASE], input=sql, text=True, capture_output=True)
    if fail:
        assert result.returncode != 0 and fail in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def check(name, condition):
    global passed
    assert condition, name
    passed += 1
    print("PASS:", name)


def command(revision, request, body, user=UID_A, fail=None):
    payload = json.dumps(body).replace("'", "''")
    sql = f"select public.apply_training_workspace_command('{user}',{revision}, '{request}', '{payload}'::jsonb)"
    raw = query(sql, user, "authenticated", fail)
    return json.loads(raw) if raw else None


def request(number):
    return f"10000000-0000-0000-0000-{number:012d}"


subprocess.run(BASE + ["-d", "postgres", "-c", f"CREATE DATABASE {DATABASE}"], check=True)
try:
    query("""
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    """)
    query(f"grant usage on schema auth to anon, authenticated; insert into auth.users values ('{UID_A}'),('{UID_B}');")
    migration = ROOT / "supabase/migrations/20261110040029_versioned_training_workspace.sql"
    query(migration.read_text())
    query((ROOT / "supabase/migrations/20261110041921_fix_workspace_conflict_status.sql").read_text())
    check("new tables have RLS", query("select count(*) from pg_class where relname in ('training_workspaces','training_workspace_events') and relrowsecurity") == "2")
    query("select * from public.training_workspaces", role="anon", fail="permission denied")
    check("anonymous reads denied", True)
    query("select public.apply_training_workspace_command('00000000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{}')", role="anon", fail="permission denied")
    check("anonymous RPC denied", True)
    query("select public.apply_training_workspace_command('00000000-0000-0000-0000-000000000001',0,gen_random_uuid(),'{}')", role="authenticated", fail="Sign in")
    check("missing identity denied", True)
    query(f"insert into public.training_workspaces(user_id) values ('{UID_A}')", UID_A, "authenticated", fail="permission denied")
    check("direct state insert denied", True)

    inputs = {"kind": "replace_inputs", "payload": {"input": {
        "version": "athlete-input-v1", "profile": {"selectedSports": ["bike"]},
        "asOf": "2030-01-01T12:00:00.000Z"}}}
    query(f"select public.apply_training_workspace_command('{UID_A}',0,gen_random_uuid(),'{{}}')", UID_B, "authenticated", fail="account changed")
    check("captured actor cannot be redirected by a new auth token", query("select count(*) from public.training_workspaces") == "0")
    incomplete = {"kind": "replace_inputs", "payload": {"input": {"version": "athlete-input-v1", "profile": {}}}}
    command(0, request(98), incomplete, fail="normalized athlete input")
    check("missing input observation time rejected", True)
    first = command(0, request(1), inputs)
    check("first input command commits revision one", first["revision"] == 1 and not first["replayed"])
    replay = command(0, request(1), inputs)
    check("retry is idempotent", replay["revision"] == 1 and replay["replayed"])
    command(0, request(2), inputs, fail="Training state changed")
    check("stale device cannot overwrite current input", query("select revision from public.training_workspaces") == "1")
    command(1, request(1), inputs, fail="already used")
    check("request reuse with altered expected revision rejected", True)
    query("update public.training_workspaces set revision=100", UID_A, "authenticated", fail="permission denied")
    query("delete from public.training_workspace_events", UID_A, "authenticated", fail="permission denied")
    check("direct edits and history deletion denied", True)
    check("another athlete cannot read state or events", query("select (select count(*) from public.training_workspaces)+(select count(*) from public.training_workspace_events)", UID_B, "authenticated") == "0")

    candidate = {"kind": "record_shadow_candidate", "payload": {"inputRevision": 1, "candidate": {
        "planMetadata": {"inputVersion": "athlete-input-v1", "generatedAt": "2030-01-01T12:00:00.000Z", "readiness": "shadow_only"},
        "weeklyPlan": [{"weekNumber": 1, "sessions": [{"type": "bike"}]}]}}}
    check("shadow candidate records against current input", command(1, request(3), candidate)["revision"] == 2)
    malformed = json.loads(json.dumps(candidate))
    malformed["payload"]["candidate"]["weeklyPlan"] = [None]
    command(2, request(97), malformed, fail="structured session arrays")
    check("malformed candidate week rejected", True)
    check("stored candidate explicitly unvalidated", query("select candidate_status from public.training_workspaces") == "unvalidated_shadow")
    bad = json.loads(json.dumps(candidate))
    bad["payload"]["candidate"]["weeklyPlan"] = []
    command(2, request(4), bad, fail="empty candidate")
    check("failed candidate preserves current candidate/revision", query("select revision=2 and shadow_candidate is not null from public.training_workspaces") == "t")
    bad = json.loads(json.dumps(candidate))
    bad["payload"]["candidate"]["planMetadata"]["readiness"] = "approved"
    command(2, request(5), bad, fail="shadow-only")
    command(2, request(6), {"kind": "adopt_plan", "payload": {}}, fail="Unsupported")
    check("workspace cannot approve or adopt a plan", True)
    command(2, request(7), inputs)
    check("changed inputs retire current candidate but retain history", query("select revision=3 and input_revision=3 and shadow_candidate is null from public.training_workspaces") == "t" and query("select count(*) from public.training_workspace_events where command->>'kind'='record_shadow_candidate'") == "1")
    command(3, request(8), candidate, fail="current input")
    check("late generation on old input rejected", True)
    replay = command(0, request(1), inputs)
    check("old acknowledgement reports newer current revision", replay["revision"] == 1 and replay["currentRevision"] == 3)

    decision = {"kind": "record_decision", "payload": {"decision": {"kind": "preference", "text": "Prefer recovery"}}}
    processes = []
    for number in [9, 10]:
        claims = json.dumps({"sub": UID_A, "role": "authenticated"})
        sql = f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{claims}'; select public.apply_training_workspace_command('{UID_A}',3,'{request(number)}','{json.dumps(decision)}'::jsonb); COMMIT;"
        process = subprocess.Popen(BASE + ["-d", DATABASE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        process.stdin.write(sql)
        process.stdin.close()
        processes.append(process)
    for process in processes:
        process.wait()
    check("concurrent same-revision commands have exactly one winner", sorted(p.returncode for p in processes) == [0, 3] and query("select revision from public.training_workspaces") == "4")

    query("create function public.test_fail_event() returns trigger language plpgsql as $$ begin raise exception 'synthetic event failure'; end $$; create trigger test_fail_event before insert on public.training_workspace_events for each row execute function public.test_fail_event();")
    command(4, request(11), inputs, fail="synthetic event failure")
    check("audit failure rolls back state atomically", query("select revision=4 and latest_decision is not null from public.training_workspaces") == "t")
    query("drop trigger test_fail_event on public.training_workspace_events")
    command(0, request(12), inputs, UID_B)
    check("second athlete gets a separate revision stream", query("select revision from public.training_workspaces", UID_B, "authenticated") == "1")
    query(f"delete from auth.users where id='{UID_A}'")
    check("account deletion cascades state and history", query(f"select (select count(*) from public.training_workspaces where user_id='{UID_A}')+(select count(*) from public.training_workspace_events where user_id='{UID_A}')") == "0")
    print(f"{passed} checks passed")
finally:
    subprocess.run(BASE + ["-d", "postgres", "-c", f"DROP DATABASE IF EXISTS {DATABASE}"], check=True)
