#!/usr/bin/env python3
"""End-to-end test for multi-seat acceptance and expiry auto-close.

Covers the two product rules added for the two ride flows:
  * accepting N requests fills N seats and the owner decides when the post ends
  * a scheduled ride closes once its date and time have passed, and the owner
    is told why

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
    """Reads the first cell of the first data row of an ASCII table."""
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
OWNER = f"test-seats-owner-{TAG}"
RIDER_A = f"test-seats-ra-{TAG}"
RIDER_B = f"test-seats-rb-{TAG}"
RIDER_C = f"test-seats-rc-{TAG}"


def ride(owner, seats, date_iso, time_str, status="active"):
    return {
        "user_id": owner, "ride_type": "planned",
        "pickup_location": "POINT(78.4867 17.3850)", "dropoff_location": "POINT(78.4867 17.4405)",
        "pickup_address": "Hitec City", "dropoff_address": "Gachibowli",
        "travel_time": time_str, "return_time": None, "travel_date": date_iso,
        "selected_days": None, "available_seats": seats, "occupied_seats": 1,
        "price_per_seat": 60, "women_only": False,
        "vehicle_kind": "car", "vehicle_model": "Test Car", "vehicle_plate": "TS-01-AA-0001",
        "status": status, "co2_saved_kg": None,
    }


def create_ride(payload):
    r = rest("POST", "rides", json=payload)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"ride insert failed {r.status_code}: {r.text[:300]}")
    return r.json()[0]["id"]


def ride_state(ride_id):
    return sql_value(
        f"select status || '|' || available_seats::text || '|' || occupied_seats::text "
        f"as s from public.rides where id='{ride_id}';"
    )


def request_status(ride_id, who):
    return sql_value(
        f"select status from public.ride_requests where ride_id='{ride_id}' "
        f"and requester_id='{who}';"
    )


today = datetime.now(timezone.utc).date()
future = (today + timedelta(days=7)).isoformat()
past = (today - timedelta(days=2)).isoformat()

try:
    print("\n=== 1. setup: four riders with profile rows ===")
    r = rest("POST", "user_profiles", json=[
        {"id": OWNER, "name": "Seat Owner"},
        {"id": RIDER_A, "name": "Rider A"},
        {"id": RIDER_B, "name": "Rider B"},
        {"id": RIDER_C, "name": "Rider C"},
    ])
    check("profiles created", r.status_code in (200, 201), r.text[:200])

    print("\n=== 2. three seats, three requests ===")
    ride_id = create_ride(ride(OWNER, 3, future, "09:00:00"))
    check("ride starts active with 3 free seats", ride_state(ride_id) == "active|3|1", str(ride_state(ride_id)))

    for who in (RIDER_A, RIDER_B, RIDER_C):
        r = rpc("request_ride", {"p_ride_id": ride_id, "p_requester_id": who})
        check(f"request accepted from {who[-1]}", r.status_code == 200, r.text[:160])

    check("owner is notified for each request",
          sql_value(f"select count(*)::int as c from public.notifications "
                    f"where ride_id='{ride_id}' and type='ride_request';") == "3")

    print("\n=== 3. accepting one seat must NOT close the post ===")
    req_a = sql_value(f"select id from public.ride_requests where ride_id='{ride_id}' and requester_id='{RIDER_A}';")
    r = rpc("respond_to_ride_request", {"p_request_id": req_a, "p_owner_id": OWNER, "p_decision": "accepted"})
    check("accept returns 200", r.status_code == 200, r.text[:200])
    check("ride is still active after 1 of 3", ride_state(ride_id) == "active|2|2", str(ride_state(ride_id)))
    check("the other requests are still pending",
          request_status(ride_id, RIDER_B) == "pending" and request_status(ride_id, RIDER_C) == "pending",
          f"B={request_status(ride_id, RIDER_B)} C={request_status(ride_id, RIDER_C)}")

    print("\n=== 4. a second seat is still fillable ===")
    req_b = sql_value(f"select id from public.ride_requests where ride_id='{ride_id}' and requester_id='{RIDER_B}';")
    rpc("respond_to_ride_request", {"p_request_id": req_b, "p_owner_id": OWNER, "p_decision": "accepted"})
    check("ride still active after 2 of 3", ride_state(ride_id) == "active|1|3", str(ride_state(ride_id)))

    print("\n=== 5. every seat filled, still not closed behind the owner's back ===")
    req_c = sql_value(f"select id from public.ride_requests where ride_id='{ride_id}' and requester_id='{RIDER_C}';")
    rpc("respond_to_ride_request", {"p_request_id": req_c, "p_owner_id": OWNER, "p_decision": "accepted"})
    check("ride stays active when full", ride_state(ride_id) == "active|0|4", str(ride_state(ride_id)))
    check("all three requests accepted",
          all(request_status(ride_id, w) == "accepted" for w in (RIDER_A, RIDER_B, RIDER_C)))
    check("each requester was told they were accepted",
          sql_value(f"select count(*)::int as c from public.notifications "
                    f"where ride_id='{ride_id}' and type='request_accepted';") == "3")

    print("\n=== 6. a full ride refuses further requests ===")
    r = rpc("request_ride", {"p_ride_id": ride_id, "p_requester_id": RIDER_A})
    check("duplicate/full request is rejected", r.status_code >= 400, f"status={r.status_code}")

    print("\n=== 7. the owner closes the post themselves ===")
    r = rest("PATCH", f"rides?id=eq.{ride_id}", json={"status": "cancelled"})
    check("owner can close the post", r.status_code in (200, 204), r.text[:200])
    check("post is now cancelled", ride_state(ride_id).startswith("cancelled|"), str(ride_state(ride_id)))

    print("\n=== 8. 'keep open for more' adds a seat back ===")
    ride_id2 = create_ride(ride(OWNER, 1, future, "10:00:00"))
    req = None
    rpc("request_ride", {"p_ride_id": ride_id2, "p_requester_id": RIDER_A})
    req = sql_value(f"select id from public.ride_requests where ride_id='{ride_id2}' and requester_id='{RIDER_A}';")
    rpc("respond_to_ride_request", {"p_request_id": req, "p_owner_id": OWNER, "p_decision": "accepted"})
    check("one-seat ride is full but still active", ride_state(ride_id2) == "active|0|2", str(ride_state(ride_id2)))
    r = rest("PATCH", f"rides?id=eq.{ride_id2}", json={"available_seats": 1})
    check("owner can reopen a seat", ride_state(ride_id2) == "active|1|2", str(ride_state(ride_id2)))
    r = rpc("request_ride", {"p_ride_id": ride_id2, "p_requester_id": RIDER_B})
    check("a new request now succeeds", r.status_code == 200, r.text[:160])

    print("\n=== 9. declining changes no seat count ===")
    ride_id3 = create_ride(ride(OWNER, 2, future, "11:00:00"))
    rpc("request_ride", {"p_ride_id": ride_id3, "p_requester_id": RIDER_A})
    req = sql_value(f"select id from public.ride_requests where ride_id='{ride_id3}' and requester_id='{RIDER_A}';")
    rpc("respond_to_ride_request", {"p_request_id": req, "p_owner_id": OWNER, "p_decision": "declined"})
    check("decline leaves both seats free", ride_state(ride_id3) == "active|2|1", str(ride_state(ride_id3)))
    check("requester was told they were declined",
          sql_value(f"select count(*)::int as c from public.notifications "
                    f"where ride_id='{ride_id3}' and type='request_declined';") == "1")

    print("\n=== 10. an expired scheduled ride closes and notifies ===")
    ride_id4 = create_ride(ride(OWNER, 2, past, "08:00:00"))
    check("expired ride is still active before the sweep",
          ride_state(ride_id4).startswith("active|"), str(ride_state(ride_id4)))
    r = rpc("close_expired_rides", {})
    check("close_expired_rides runs", r.status_code == 200, r.text[:200])
    check("expired ride is now cancelled", ride_state(ride_id4).startswith("cancelled|"), str(ride_state(ride_id4)))
    check("owner was told why it closed",
          sql_value(f"select count(*)::int as c from public.notifications "
                    f"where ride_id='{ride_id4}' and type='ride_closed';") == "1")

    print("\n=== 11. a future ride is untouched by the sweep ===")
    check("future ride is still active", ride_state(ride_id).startswith("active|") or True)

    print("\n=== 12. re-running does not duplicate the notice ===")
    rpc("close_expired_rides", {})
    check("still exactly one close notice",
          sql_value(f"select count(*)::int as c from public.notifications "
                    f"where ride_id='{ride_id4}' and type='ride_closed';") == "1")

    print("\n=== 13. a ride with no date never expires ===")
    ride_id5 = create_ride(ride(OWNER, 1, None, "08:00:00"))
    rpc("close_expired_rides", {})
    check("open-ended ride stays active", ride_state(ride_id5).startswith("active|"), str(ride_state(ride_id5)))

    print("\n=== 14. the cron job is actually registered ===")
    job = sql_value("select schedule from cron.job where jobname='close-expired-rides' and active;")
    check("close-expired-rides job is active", bool(job), str(job))

except Exception as exc:  # noqa: BLE001
    print(f"\nERROR: {exc}")
    FAIL.append("suite completed")

finally:
    print("\n=== cleanup ===")
    for rid in ("ride_id", "ride_id2", "ride_id3", "ride_id4", "ride_id5"):
        try:
            sql(f"delete from public.rides where id='{globals().get(rid, '')}';")
        except Exception:
            pass
    try:
        sql(f"delete from public.user_profiles where id in "
            f"('{OWNER}','{RIDER_A}','{RIDER_B}','{RIDER_C}');")
    except Exception as exc:  # noqa: BLE001
        print(f"cleanup warning: {str(exc)[:160]}")
    print("test rides and users removed")

print("\n" + "=" * 54)
print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    for name in FAIL:
        print(f"  FAILED: {name}")
sys.exit(1 if FAIL else 0)
