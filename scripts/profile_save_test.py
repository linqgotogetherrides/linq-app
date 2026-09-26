#!/usr/bin/env python3
"""Verifies saving a rider profile succeeds on both the first and second save.

The signup form could not save. PostgREST turns upsert() into
`INSERT ... ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, ...`, and `id` is
not in the column-level UPDATE grant applied by 20260925150000, so the entire
statement was rejected with a table-level 42501 the moment the row already
existed. A brand new rider passed, and anyone saving twice failed, which is why
the error looked random.

This asserts the shape the app now uses: insert when absent, patch when present,
neither of which writes `id` on update.

Run from the repo root. Requires frontend/.env and a linked Supabase project.
"""
import os
import subprocess
import sys
import uuid

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, "frontend", ".env"))

BASE = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["EXPO_PUBLIC_SUPABASE_ANON_KEY"]

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not condition else ""))


def sql(statement):
    proc = subprocess.run(
        ["npx", "supabase", "db", "query", "--linked", statement],
        cwd=os.path.join(ROOT, "backend"), capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"SQL failed: {proc.stderr[:400]}")
    return proc.stdout


def sql_value(statement):
    lines = sql(statement).splitlines()
    for i, line in enumerate(lines):
        if line.lstrip().startswith("├"):
            for cand in lines[i + 1:]:
                if cand.lstrip().startswith("└"):
                    return None
                cells = [c.strip() for c in cand.strip().strip("│").split("│")]
                if cells and cells[0] != "":
                    return cells[0]
    return None


def headers(prefer="return=representation"):
    return {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def table(name="user_profiles"):
    return f"{BASE}/rest/v1/{name}"


TAG = uuid.uuid4().hex[:8]
UID = f"test-save-{TAG}"

# The exact field set account-creation writes.
FIELDS = {
    "phone_number": "+919000000000",
    "name": "Save Test",
    "age": 24,
    "gender": "female",
    "women_only_mode": False,
    "bio": "",
    "emergency_contact": "9876543210",
    "verification_status": "pending",
    "verification_document": "aadhaar",
    "avatar_url": None,
}


def save_profile(user_id, fields):
    """Mirrors saveProfile() in src/services/userProfile.ts."""
    exists = requests.get(
        table(), headers=headers(), params={"id": f"eq.{user_id}", "select": "id"}, timeout=40
    ).json()
    if not exists:
        r = requests.post(
            table(), headers=headers(), json={"id": user_id, **fields}, timeout=40
        )
    else:
        r = requests.patch(
            table(), headers=headers(), json=fields, params={"id": f"eq.{user_id}"}, timeout=40
        )
    return r


try:
    print("\n=== 1. the bug: upsert is rejected outright, fresh row or not ===")
    # Postgres checks column UPDATE privileges when it plans the statement, and
    # PostgREST always puts the conflict key in the SET clause. So this fails
    # even when there is no conflict at all, which is why every new rider hit it.
    r = requests.post(
        table(),
        headers=headers("return=representation,resolution=merge-duplicates"),
        json={"id": UID, **FIELDS},
        timeout=40,
    )
    check("upsert into a fresh id is rejected too",
          r.status_code == 401 and "permission denied" in r.text.lower(),
          f"{r.status_code} {r.text[:160]}")
    r2 = requests.post(
        table(),
        headers=headers("return=representation,resolution=merge-duplicates"),
        json={"id": UID, **FIELDS},
        timeout=40,
    )
    check("and again for an existing id", r2.status_code == 401, f"status={r2.status_code}")

    print("\n=== 2. the replacement: insert when absent ===")
    r = save_profile(UID, FIELDS)
    check("insert path succeeds", r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}")
    check("the row landed",
          sql_value(f"select name as n from public.user_profiles where id='{UID}';") == "Save Test")

    print("\n=== 3. the replacement: patch when present ===")
    updated = {**FIELDS, "name": "Save Test Edited", "bio": "Updated bio"}
    r = save_profile(UID, updated)
    check("update path succeeds", r.status_code in (200, 204), f"{r.status_code} {r.text[:200]}")
    check("the change was written",
          sql_value(f"select name as n from public.user_profiles where id='{UID}';") == "Save Test Edited")
    check("every writable field was written",
          sql_value(f"select coalesce(bio,'') as b from public.user_profiles where id='{UID}';") == "Updated bio")

    print("\n=== 4. repeated saves keep working ===")
    for attempt in range(3):
        r = save_profile(UID, {**FIELDS, "name": f"Save {attempt}"})
        check(f"save #{attempt + 1} succeeds", r.status_code in (200, 204), f"{r.status_code} {r.text[:160]}")
    check("only one row was ever created",
          sql_value(f"select count(*)::text as c from public.user_profiles where id='{UID}';") == "1")

    print("\n=== 5. the id is still not client-writable ===")
    r = requests.patch(
        table(), headers=headers(), json={"id": "someone-else"}, params={"id": f"eq.{UID}"}, timeout=40
    )
    check("patching id is still refused", r.status_code >= 400, f"status={r.status_code}")
    check("the row kept its id",
          sql_value(f"select id as i from public.user_profiles where id='{UID}';") == UID)

except Exception as exc:  # noqa: BLE001
    print(f"\nERROR: {exc}")
    FAIL.append("suite completed")

finally:
    print("\n=== cleanup ===")
    try:
        sql(f"delete from public.user_profiles where id='{UID}';")
    except Exception as exc:  # noqa: BLE001
        print(f"cleanup warning: {str(exc)[:140]}")
    print("test user removed")

print("\n" + "=" * 54)
print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    for name in FAIL:
        print(f"  FAILED: {name}")
sys.exit(1 if FAIL else 0)
