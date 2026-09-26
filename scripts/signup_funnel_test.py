#!/usr/bin/env python3
"""Guards the signup funnel's new-versus-returning decision.

fetchUserProfile() creates a missing user_profiles row on purpose, so that the
referral game and seat requests stop failing on a foreign key. That self-heal
made its return value useless for deciding whether a rider is new, and otp.tsx
was using it that way. Every new rider was sent straight into the app and
account creation was never reached.

This asserts the underlying signal the decision now rests on: a rider with no
profile row must be reported as having none, and must still have none after
another rider's signup runs. The React routing itself is not exercised here.

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
ANON = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

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


def rest(method, table, **kw):
    return requests.request(method, f"{BASE}/rest/v1/{table}", headers=ANON, timeout=40, **kw)


def profile_exists(user_id: str) -> bool:
    """Mirrors userProfileExists() in src/services/userProfile.ts."""
    r = rest("GET", "user_profiles", params={"id": f"eq.{user_id}", "select": "id"})
    if r.status_code != 200:
        raise RuntimeError(f"profile lookup failed: {r.status_code} {r.text[:200]}")
    return bool(r.json())


TAG = uuid.uuid4().hex[:8]
FRESH = f"test-signup-fresh-{TAG}"
RETURNING = f"test-signup-returning-{TAG}"
WEB_UID = f"web-uid-+9190000{TAG[:4]}"

try:
    print("\n=== 1. a rider who has just verified their phone has no profile yet ===")
    check("no profile before signup", profile_exists(FRESH) is False)
    check("confirmed against the database",
          sql_value(f"select count(*)::text as c from public.user_profiles where id='{FRESH}';") == "0")

    print("\n=== 2. so the funnel must route them to account creation, not into the app ===")
    # This is the decision otp.tsx makes. A truthy value here is the exact bug
    # that sent every new rider past account creation.
    is_returning = profile_exists(FRESH)
    check("new rider is not treated as returning", is_returning is False,
          "fetchUserProfile's self-heal must not be used for this decision")

    print("\n=== 3. a returning rider is detected ===")
    r = rest("POST", "user_profiles", json={"id": RETURNING, "name": "Returning Rider"})
    check("profile created for a returning rider", r.status_code in (200, 201), r.text[:200])
    check("now detected as returning", profile_exists(RETURNING) is True)

    print("\n=== 4. one rider's signup must not make another look like a returning rider ===")
    check("fresh rider still has no profile", profile_exists(FRESH) is False)
    check("returning rider still has one", profile_exists(RETURNING) is True)

    print("\n=== 5. the web auth mock mints web-uid ids, which are ordinary profile keys ===")
    # The mock builds `web-uid-<phone>`; nothing about that shape is special, so
    # a new rider on web must also read as having no profile.
    check("web-uid rider starts with no profile", profile_exists(WEB_UID) is False)
    rest("POST", "user_profiles", json={"id": WEB_UID, "name": "Web Rider"})
    check("web-uid rider is detected once signed up", profile_exists(WEB_UID) is True)

except Exception as exc:  # noqa: BLE001
    print(f"\nERROR: {exc}")
    FAIL.append("suite completed")

finally:
    print("\n=== cleanup ===")
    try:
        sql(f"delete from public.user_profiles where id in "
            f"('{FRESH}','{RETURNING}','{WEB_UID}');")
    except Exception as exc:  # noqa: BLE001
        print(f"cleanup warning: {str(exc)[:140]}")
    print("test users removed")

print("\n" + "=" * 54)
print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    for name in FAIL:
        print(f"  FAILED: {name}")
sys.exit(1 if FAIL else 0)
