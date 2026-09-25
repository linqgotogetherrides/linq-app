#!/usr/bin/env python3
"""End-to-end test for referrals, the persistent wallet, and draft rides.

Run from the repo root. Requires frontend/.env and a linked Supabase project.
"""
import os
import subprocess
import sys
import time
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
    # Without this, POST/PATCH return 201 with an empty body.
    "Prefer": "return=representation",
}

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not condition else ""))


def sql(statement):
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", statement],
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


def rpc(name, payload):
    return requests.post(f"{BASE}/rest/v1/rpc/{name}", headers=ANON, json=payload, timeout=40)


REFER = f"test-ref-{uuid.uuid4().hex[:8]}"
NEW = f"test-new-{uuid.uuid4().hex[:8]}"


def ride_payload(user, status, date):
    return {
        "user_id": user, "ride_type": "daily",
        "pickup_location": "POINT(78.4867 17.3850)", "dropoff_location": "POINT(78.4867 17.4405)",
        "pickup_address": "Hyderabad", "dropoff_address": "Gachibowli",
        "travel_time": "08:00:00", "return_time": None, "travel_date": date,
        "selected_days": [0, 1, 2, 3, 4, 5], "available_seats": 2, "occupied_seats": 1,
        "price_per_seat": 50, "women_only": False,
        "vehicle_kind": None, "vehicle_model": None, "vehicle_plate": None,
        "status": status, "co2_saved_kg": None,
    }


try:
    print("\n=== 1. signup creates a wallet and a referral code ===")
    rest("POST", "user_profiles", json=[{"id": REFER, "name": "Referrer One"}, {"id": NEW, "name": "Newbie Two"}])
    code = sql_value(f"select referral_code from public.user_profiles where id='{REFER}';")
    check("referral code auto-assigned", bool(code) and code.startswith("LINQ-"), str(code))
    check("code is unique per user",
          sql_value(f"select count(*)::int as c from public.user_profiles where referral_code='{code}';") == "1")
    bal = sql_value(f"select balance::text as balance from public.wallets where user_id='{REFER}';")
    check("wallet auto-created with 0 balance", bal in ("0.00", "0"), str(bal))

    print("\n=== 2. referral credits the referrer Rs 5 ===")
    before = float(sql_value(f"select balance::text as b from public.wallets where user_id='{REFER}';"))
    r = rpc("claim_referral", {"p_code": code, "p_referee_id": NEW})
    body = r.json()
    check("claim returns 200", r.status_code == 200, r.text[:200])
    check("claim credited", body.get("credited") is True, str(body)[:160])
    check("reward is Rs 5", float(body.get("reward_amount", 0)) == 5.0, str(body.get("reward_amount")))
    after = float(sql_value(f"select balance::text as b from public.wallets where user_id='{REFER}';"))
    check("referrer wallet increased by exactly 5", after - before == 5.0, f"{before} -> {after}")

    print("\n=== 3. idempotency: a referee can only ever credit once ===")
    THIRD = f"test-third-{uuid.uuid4().hex[:8]}"
    rest("POST", "user_profiles", json={"id": THIRD, "name": "Third User"})
    rpc("claim_referral", {"p_code": code, "p_referee_id": NEW})
    final = float(sql_value(f"select balance::text as b from public.wallets where user_id='{REFER}';"))
    check("replay does not double-credit", final == after, f"{after} -> {final}")
    r = rpc("claim_referral", {"p_code": code, "p_referee_id": NEW})
    check("replay flagged already_claimed", r.json().get("already_claimed") is True, r.text[:160])
    txns = sql_value(f"select count(*)::int as c from public.wallet_txns where user_id='{REFER}';")
    check("exactly one ledger row", txns == "1", f"rows={txns}")
    rest("DELETE", "user_profiles", params={"id": f"eq.{THIRD}"})

    print("\n=== 4. anti-abuse ===")
    r = rpc("claim_referral", {"p_code": code, "p_referee_id": REFER})
    check("self-referral blocked", r.json().get("reason") == "self_referral", r.text[:160])
    FRESH = f"test-fresh-{uuid.uuid4().hex[:8]}"
    rest("POST", "user_profiles", json={"id": FRESH, "name": "Fresh User"})
    r = rpc("claim_referral", {"p_code": "LINQ-NOPE-XXXX", "p_referee_id": FRESH})
    check("bogus code rejected", r.json().get("ok") is False, r.text[:160])
    rest("DELETE", "user_profiles", params={"id": f"eq.{FRESH}"})

    print("\n=== 5. clients cannot forge money ===")
    r = rest("POST", "wallets", json={"user_id": REFER, "balance": 99999})
    check("INSERT wallet blocked", r.status_code in (401, 403), str(r.status_code))
    r = rest("PATCH", "wallets", params={"user_id": f"eq.{REFER}"}, json={"balance": 99999})
    check("PATCH wallet blocked", r.status_code in (401, 403), str(r.status_code))
    r = rest("POST", "wallet_txns", json={"user_id": REFER, "amount": 500, "balance_after": 500, "kind": "topup"})
    check("INSERT wallet_txns blocked", r.status_code in (401, 403), str(r.status_code))
    r = rest("PATCH", "user_profiles", params={"id": f"eq.{REFER}"}, json={"referral_code": "HACKED"})
    check("PATCH referral_code blocked", r.status_code in (401, 403), str(r.status_code))
    r = rest("GET", "wallets", params={"user_id": f"eq.{REFER}", "select": "balance"})
    check("wallet still readable", r.status_code == 200, str(r.status_code))

    print("\n=== 6. wallet-credit rejects unverified payments ===")
    r = requests.post(f"{BASE}/functions/v1/wallet-credit", headers=ANON,
                      json={"user_id": REFER, "razorpay_payment_id": "pay_fake_does_not_exist"}, timeout=40)
    check("fake payment rejected", r.status_code == 404, f"{r.status_code} {r.text[:120]}")
    r = requests.post(f"{BASE}/functions/v1/wallet-credit", headers=ANON,
                      json={"user_id": REFER}, timeout=40)
    check("missing payment id rejected", r.status_code == 400, f"{r.status_code} {r.text[:120]}")

    print("\n=== 7. ride publish bug (empty travel_date) ===")
    r = rest("POST", "rides", json=ride_payload(REFER, "active", ""))
    check("empty-string date still 400s (the reported bug)", r.status_code == 400, str(r.status_code))
    r = rest("POST", "rides", json=ride_payload(REFER, "active", None))
    check("null date publishes (the fix)", r.status_code == 201, f"{r.status_code} {r.text[:140]}")

    print("\n=== 8. draft rides ===")
    r = rest("POST", "rides", json=ride_payload(REFER, "draft", None))
    check("draft created", r.status_code == 201, f"{r.status_code} {r.text[:140]}")
    draft_id = r.json()[0]["id"] if r.status_code == 201 else None
    rows = rest("GET", "rides", params={"user_id": f"eq.{REFER}", "select": "id,status"}).json()
    check("draft appears in my rides", "draft" in [x["status"] for x in rows], str([x["status"] for x in rows]))
    near = rpc("find_nearby_rides", {"user_lon": 78.4867, "user_lat": 17.385, "radius_meters": 50000})
    statuses = [x["status"] for x in near.json()] if near.status_code == 200 else []
    check("drafts excluded from discovery", "draft" not in statuses, str(statuses))
    r = rest("PATCH", "rides", params={"id": f"eq.{draft_id}", "and": f"(user_id.eq.{REFER})"}, json={"status": "active"})
    check("draft publishes to active", r.status_code == 200 and r.json()[0]["status"] == "active", r.text[:140])

finally:
    print("\n=== cleanup ===")
    try:
        sql(f"delete from public.user_profiles where id in ('{REFER}','{NEW}');")
        print("  test users removed")
    except Exception as exc:  # noqa: BLE001
        print(f"  cleanup warning: {exc}")

print(f"\n{'='*54}\nPASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    print("Failed checks:")
    for n in FAIL:
        print(f"  - {n}")
sys.exit(1 if FAIL else 0)
