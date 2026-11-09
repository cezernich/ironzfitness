"""Create synthetic users in the single allowlisted staging project only.

Administrative credentials remain in memory. Test passwords go to an owner-only
local file outside the repository. No real emails or production users are used.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.request
import urllib.error

REF = "yhchfxjzxhinreklnxbi"
URL = f"https://{REF}.supabase.co"
CREDENTIALS = Path(os.environ.get("IRONZ_STAGING_CREDENTIALS", Path.home() / "Documents/ChatGPT/ironz-staging-credentials.json"))


def api(path, method="GET", data=None, token=None, key=None, prefer=None):
    headers = {"apikey": key or SERVICE_KEY, "Authorization": "Bearer " + (token or SERVICE_KEY), "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(URL + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode()
            return response.status, json.loads(text) if text else None
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        return error.code, json.loads(text) if text else None


def load_keys():
    result = subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "--output", "json"], capture_output=True, text=True, check=True)
    keys = json.loads(result.stdout)
    return next(item["api_key"] for item in keys if item.get("name") == "service_role"), next(item["api_key"] for item in keys if item.get("name") == "anon")


SERVICE_KEY, ANON_KEY = load_keys()


def seed():
    CREDENTIALS.parent.mkdir(parents=True, exist_ok=True)
    credentials = json.loads(CREDENTIALS.read_text()) if CREDENTIALS.exists() else {"projectRef": REF, "accounts": []}
    if credentials["projectRef"] != REF:
        raise RuntimeError("Credentials file does not belong to staging")
    status, listing = api("/auth/v1/admin/users?page=1&per_page=100")
    if status != 200:
        raise RuntimeError(f"Cannot list staging test users: HTTP {status}")
    existing = {user["email"]: user for user in listing["users"]}
    for label in ("athlete-a", "athlete-b", "coach", "admin"):
        email = f"{label}@ironz-staging.example"
        saved = next((a for a in credentials["accounts"] if a["email"] == email), None)
        if email in existing:
            if not saved:
                raise RuntimeError("Existing test account lacks local credentials; do not reset it silently")
            continue
        password = secrets.token_urlsafe(24)
        status, user = api("/auth/v1/admin/users", "POST", {"email": email, "password": password, "email_confirm": True, "user_metadata": {"full_name": "Synthetic " + label.title()}})
        if status not in (200, 201):
            raise RuntimeError(f"Cannot create synthetic account {label}: HTTP {status}")
        account = {"label": label, "email": email, "password": password, "id": user["id"]}
        credentials["accounts"].append(account)
        # Persist immediately so a partial run never loses a generated password.
        descriptor = os.open(CREDENTIALS, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as file:
            json.dump(credentials, file, indent=2)
        os.chmod(CREDENTIALS, 0o600)
        status, _ = api("/rest/v1/profiles?on_conflict=id", "POST", {"id": user["id"], "email": email, "full_name": "Synthetic " + label.title(), "role": "admin" if label == "admin" else "user", "is_coach": label == "coach", "age": 30, "weight_lbs": 165, "height_inches": 70, "gender": "male", "primary_goal": "general_fitness"}, prefer="resolution=merge-duplicates,return=minimal")
        if status not in (200, 201, 204):
            raise RuntimeError(f"Cannot seed synthetic profile {label}: HTTP {status}")
        print(f"Ready: {label}")
    print(f"Staging accounts ready; credentials saved owner-only to {CREDENTIALS}")


if __name__ == "__main__":
    seed()
