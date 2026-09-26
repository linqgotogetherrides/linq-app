#!/usr/bin/env python3
"""Verifies the client cannot rewrite ride ownership or seat counts.

20260926190000 removed UPDATE on user_id and occupied_seats from the anon role.
This asserts the blocks actually hold against a real REST call, and that the
legitimate writes the app does make still work.

Run from the repo root. Requires frontend/.env and a linked Supabase project.
"""
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone

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
        raise RuntimeError(f"SQL failed: {proc.stderr[:500]}")
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


def rpc(name, payload):
    return requests.post(f"{BASE}/rest/v1/rpc/{name}", headers=ANON, json=payload, timeout=40)


TAG = uuid.uuid4().hex[:8]
VICTIM = f"test-rls-victim-{TAG}"
ATTACKER = f"test-rls-attacker-{TAG}"
future = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
ride_id = None

try:
    print("\n=== 1. setup: a victim with a posted ride ===")
    r = rest("POST", "user_profiles", json=[
        {"id": VICTIM, "name": "Rls Victim"},
        {"id": ATTACKER, "name": "Rls Attacker"},
    ])
    check("profiles created", r.status_code in (200, 201), r.text[:200])

    r = rest("POST", "rides", json={
        "user_id": VICTIM, "ride_type": "planned",
        "pickup_location": "POINT(78.4867 17.3850)", "dropoff_location": "POINT(78.4867 17.4405)",
        "pickup_address": "Rls Pickup", "dropoff_address": "Rls Drop",
        "travel_time": "09:00:00", "return_time": None, "travel_date": future,
        "selected_days": None, "available_seats": 3, "occupied_seats": 1,
        "price_per_seat": 70, "women_only": False,
        "vehicle_kind": "car", "vehicle_model": None, "vehicle_plate": None,
        "status": "active", "co2_saved_kg": None,
    })
    ride_id = r.json()[0]["id"]
    check("victim posted a ride", bool(ride_id), r.text[:200])
    check("it starts with 3 free seats and 1 occupied",
          sql_value(f"select available_seats::text || '|' || occupied_seats::text as s "
                    f"from public.rides where id='{ride_id}';") == "3|1")

    print("\n=== 2. legitimate writes the app does make still work ===")
    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"price_per_seat": 90})
    check("price can be updated", r.status_code in (200, 204), f"{r.status_code} {r.text[:160]}")
    new_price = sql_value(f"select price_per_seat::text as p from public.rides where id='{ride_id}';")
    # numeric renders as "90.00", so compare numerically rather than by string.
    check("price actually changed", float(new_price) == 90.0, str(new_price))

    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"status": "cancelled"})
    check("the owner can close their own post", r.status_code in (200, 204), f"{r.status_code} {r.text[:160]}")
    check("status changed",
          sql_value(f"select status as s from public.rides where id='{ride_id}';") == "cancelled")
    rest("PATCH", f"rides?id=eq.{ride_id}", json={"status": "active"})

    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"available_seats": 5})
    check("available_seats can be updated", r.status_code in (200, 204), f"{r.status_code} {r.text[:160]}")

    print("\n=== 3. user_id is not client-writable ===")
    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"user_id": ATTACKER})
    check("reassigning ownership is refused", r.status_code >= 400, f"status={r.status_code}")
    check("ownership did not move",
          sql_value(f"select user_id as u from public.rides where id='{ride_id}';") == VICTIM)

    print("\n=== 4. occupied_seats is not client-writable ===")
    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"occupied_seats": 99})
    check("inflating occupied_seats is refused", r.status_code >= 400, f"status={r.status_code}")
    check("occupied_seats is untouched",
          sql_value(f"select occupied_seats::text as o from public.rides where id='{ride_id}';") == "1")

    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"occupied_seats": 0})
    check("zeroing occupied_seats is refused", r.status_code >= 400, f"status={r.status_code}")

    print("\n=== 5. identity and server fields are not client-writable ===")
    for column, value in (("id", str(uuid.uuid4())), ("created_at", "2020-01-01T00:00:00Z")):
        r = rest("PATCH", f"rides?id=eq.{ride_id}", json={column: value})
        check(f"{column} is not writable", r.status_code >= 400, f"status={r.status_code}")

    print("\n=== 6. the accept flow still drives seat counts server-side ===")
    r = rest("POST", "rides", json={
        "user_id": VICTIM, "ride_type": "planned",
        "pickup_location": "POINT(78.5000 17.3800)", "dropoff_location": "POINT(78.5050 17.4300)",
        "pickup_address": "Seat Pickup", "dropoff_address": "Seat Drop",
        "travel_time": "11:00:00", "return_time": None, "travel_date": future,
        "selected_days": None, "available_seats": 2, "occupied_seats": 1,
        "price_per_seat": 50, "women_only": False,
        "vehicle_kind": "car", "vehicle_model": None, "vehicle_plate": None,
        "status": "active", "co2_saved_kg": None,
    })
    ride2 = r.json()[0]["id"]
    rpc("request_ride", {"p_ride_id": ride2, "p_requester_id": ATTACKER})
    req = sql_value(f"select id from public.ride_requests where ride_id='{ride2}' and requester_id='{ATTACKER}';")
    rpc("respond_to_ride_request", {"p_request_id": req, "p_owner_id": VICTIM, "p_decision": "accepted"})
    check("the SECURITY DEFINER function can still move seats",
          sql_value(f"select available_seats::text || '|' || occupied_seats::text as s "
                    f"from public.rides where id='{ride2}';") == "1|2",
          sql_value(f"select available_seats::text || '|' || occupied_seats::text as s "
                    f"from public.rides where id='{ride2}';"))

    print("\n=== 7. seat totals cannot go negative ===")
    r = rest("PATCH", f"rides?id=eq.{ride2}", json={"available_seats": -5})
    check("a negative seat count is rejected by the CHECK", r.status_code >= 400, f"status={r.status_code}")

except Exception as exc:  # noqa: BLE001
    print(f"\nERROR: {exc}")
    FAIL.append("suite completed")

finally:
    print("\n=== cleanup ===")
    for stmt in (
        f"delete from public.rides where user_id like 'test-rls-%-{TAG}';",
        f"delete from public.user_profiles where id like 'test-rls-%-{TAG}';",
    ):
        try:
            sql(stmt)
        except Exception as exc:  # noqa: BLE001
            print(f"cleanup warning: {str(exc)[:140]}")
    print("test rides and users removed")

print("\n" + "=" * 54)
print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    for name in FAIL:
        print(f"  FAILED: {name}")
sys.exit(1 if FAIL else 0)
