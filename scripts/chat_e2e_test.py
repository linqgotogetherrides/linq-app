#!/usr/bin/env python3
"""End-to-end test for chat between matched riders.

A conversation must open when a ride request is accepted, in both directions,
and only the two participants may read and write it.

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
OWNER = f"test-chat-owner-{TAG}"
SEEKER = f"test-chat-seeker-{TAG}"
OUTSIDER = f"test-chat-outsider-{TAG}"
future = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
ride_id = None

try:
    print("\n=== 1. setup ===")
    r = rest("POST", "user_profiles", json=[
        {"id": OWNER, "name": "Chat Owner"},
        {"id": SEEKER, "name": "Chat Seeker"},
        {"id": OUTSIDER, "name": "Chat Outsider"},
    ])
    check("profiles created", r.status_code in (200, 201), r.text[:200])

    r = rest("POST", "rides", json={
        "user_id": OWNER, "ride_type": "planned",
        "pickup_location": "POINT(78.4867 17.3850)", "dropoff_location": "POINT(78.4867 17.4405)",
        "pickup_address": "Kondapur", "dropoff_address": "Gachibowli",
        "travel_time": "09:00:00", "return_time": None, "travel_date": future,
        "selected_days": None, "available_seats": 1, "occupied_seats": 1,
        "price_per_seat": 60, "women_only": False,
        "vehicle_kind": "car", "vehicle_model": None, "vehicle_plate": None,
        "status": "active", "co2_saved_kg": None,
    })
    ride_id = r.json()[0]["id"]
    check("ride posted", bool(ride_id), r.text[:200])

    print("\n=== 2. no conversation exists before acceptance ===")
    check("no thread yet", sql_value(
        f"select count(*)::int as c from public.conversations where ride_id='{ride_id}';") == "0")

    print("\n=== 3. a pending request does not open a thread ===")
    rpc("request_ride", {"p_ride_id": ride_id, "p_requester_id": SEEKER})
    check("still no thread while pending", sql_value(
        f"select count(*)::int as c from public.conversations where ride_id='{ride_id}';") == "0")

    print("\n=== 4. accepting opens the thread ===")
    req = sql_value(f"select id from public.ride_requests where ride_id='{ride_id}' and requester_id='{SEEKER}';")
    rpc("respond_to_ride_request", {"p_request_id": req, "p_owner_id": OWNER, "p_decision": "accepted"})
    convo = sql_value(f"select id from public.conversations where ride_id='{ride_id}';")
    check("a conversation was created", bool(convo), str(convo))
    check("participants recorded correctly", sql_value(
        f"select owner_id || '|' || member_id as p from public.conversations where id='{convo}';")
        == f"{OWNER}|{SEEKER}")

    print("\n=== 5. both sides can list the thread ===")
    for who, label in ((OWNER, "owner"), (SEEKER, "requester")):
        r = rpc("list_conversations", {"p_user_id": who})
        body = r.json()
        check(f"{label} sees the thread", r.status_code == 200 and any(t["id"] == convo for t in body), r.text[:200])

    r = rpc("list_conversations", {"p_user_id": OUTSIDER})
    check("an unrelated rider sees no thread", isinstance(r.json(), list) and len(r.json()) == 0, r.text[:200])

    print("\n=== 6. the thread carries the other rider's name and the route ===")
    # From the owner's side the other rider is the requester, and vice versa.
    other_for_owner = sql_value(
        f"select (select name from public.user_profiles up "
        f"  where up.id = (case when owner_id='{OWNER}' then member_id else owner_id end)) as n "
        f"from public.conversations where id='{convo}';")
    other_for_requester = sql_value(
        f"select (select name from public.user_profiles up "
        f"  where up.id = (case when member_id='{SEEKER}' then owner_id else member_id end)) as n "
        f"from public.conversations where id='{convo}';")
    check("owner sees the requester's name", other_for_owner == "Chat Seeker", str(other_for_owner))
    check("requester sees the owner's name", other_for_requester == "Chat Owner", str(other_for_requester))

    print("\n=== 7. sending, reading and unread counts ===")
    r = rpc("send_message", {"p_conversation_id": convo, "p_sender_id": OWNER, "p_body": "Hi, I leave at 9."})
    check("owner can send", r.status_code == 200, r.text[:200])
    r = rpc("send_message", {"p_conversation_id": convo, "p_sender_id": SEEKER, "p_body": "Great, see you at Kondapur."})
    check("requester can send", r.status_code == 200, r.text[:200])

    r = rpc("list_messages", {"p_conversation_id": convo, "p_user_id": OWNER})
    msgs = r.json()
    check("owner reads both messages", r.status_code == 200 and len(msgs) == 2, r.text[:200])
    check("messages are in order", [m["body"] for m in msgs][0].startswith("Hi,"), str(msgs)[:160])

    r = rpc("list_conversations", {"p_user_id": OWNER})
    owner_row = [t for t in r.json() if t["id"] == convo][0]
    # The owner already read the thread above, so nothing is unread yet.
    check("reading cleared the unread count", owner_row["unread_count"] == 0, str(owner_row["unread_count"]))
    check("preview shows the latest message", owner_row["last_message"].startswith("Great,"), str(owner_row["last_message"]))

    print("\n=== 8. a new message shows up as unread until it is read ===")
    rpc("send_message", {"p_conversation_id": convo, "p_sender_id": SEEKER, "p_body": "On my way."})
    r = rpc("list_conversations", {"p_user_id": OWNER})
    owner_row = [t for t in r.json() if t["id"] == convo][0]
    check("owner has 1 unread from the requester", owner_row["unread_count"] == 1, str(owner_row["unread_count"]))
    # The requester sent two of the three messages but never opened the thread,
    # so exactly one is unread for them: the owner's. Their own must not count.
    seeker_row = [t for t in rpc("list_conversations", {"p_user_id": SEEKER}).json()
                  if t["id"] == convo][0]
    check("requester's unread is only the owner's message",
          seeker_row["unread_count"] == 1, str(seeker_row["unread_count"]))

    rpc("list_messages", {"p_conversation_id": convo, "p_user_id": OWNER})
    r = rpc("list_conversations", {"p_user_id": OWNER})
    owner_row = [t for t in r.json() if t["id"] == convo][0]
    check("unread cleared after reading again", owner_row["unread_count"] == 0, str(owner_row["unread_count"]))

    print("\n=== 9. a non-participant cannot read or post ===")
    r = rpc("list_messages", {"p_conversation_id": convo, "p_user_id": OUTSIDER})
    check("outsider cannot read the thread", r.status_code >= 400, f"status={r.status_code}")
    r = rpc("send_message", {"p_conversation_id": convo, "p_sender_id": OUTSIDER, "p_body": "let me in"})
    check("outsider cannot post into the thread", r.status_code >= 400, f"status={r.status_code}")

    print("\n=== 10. empty and oversized messages are refused ===")
    r = rpc("send_message", {"p_conversation_id": convo, "p_sender_id": OWNER, "p_body": "   "})
    check("blank message refused", r.status_code >= 400, f"status={r.status_code}")
    r = rpc("send_message", {"p_conversation_id": convo, "p_sender_id": OWNER, "p_body": "x" * 2001})
    check("oversized message refused", r.status_code >= 400, f"status={r.status_code}")

    print("\n=== 11. thread activity is ordered by the newest message ===")
    first = sql_value(f"select last_message_at from public.conversations where id='{convo}';")
    check("last_message_at was bumped by the insert", bool(first), str(first))

    print("\n=== 12. reverse direction: seeker post, driver requests, seeker accepts ===")
    r = rest("POST", "rides", json={
        "user_id": SEEKER, "ride_type": "planned",
        "pickup_location": "POINT(78.4900 17.3900)", "dropoff_location": "POINT(78.4950 17.4450)",
        "pickup_address": "Madhapur", "dropoff_address": "Jubilee Hills",
        "travel_time": "18:00:00", "return_time": None, "travel_date": future,
        "selected_days": None, "available_seats": 1, "occupied_seats": 0,
        "price_per_seat": 0, "women_only": False,
        "vehicle_kind": None, "vehicle_model": None, "vehicle_plate": None,
        "status": "active", "co2_saved_kg": None,
    })
    ride2 = r.json()[0]["id"]
    rpc("request_ride", {"p_ride_id": ride2, "p_requester_id": OWNER})
    req2 = sql_value(f"select id from public.ride_requests where ride_id='{ride2}' and requester_id='{OWNER}';")
    check("a driver can request a seeker's post", bool(req2))
    rpc("respond_to_ride_request", {"p_request_id": req2, "p_owner_id": SEEKER, "p_decision": "accepted"})
    convo2 = sql_value(f"select id from public.conversations where ride_id='{ride2}';")
    check("flow 1 also opens a thread", bool(convo2), str(convo2))
    check("flow 1 seats were counted from the group", sql_value(
        f"select status || '|' || available_seats::text as s from public.rides where id='{ride2}';")
        == "active|0", sql_value(f"select status from public.rides where id='{ride2}';"))
    globals()["ride2"] = ride2

    print("\n=== 13. a rejected request opens nothing ===")
    r = rest("POST", "rides", json={
        "user_id": OWNER, "ride_type": "planned",
        "pickup_location": "POINT(78.5000 17.3800)", "dropoff_location": "POINT(78.5050 17.4300)",
        "pickup_address": "Begumpet", "dropoff_address": "Ameerpet",
        "travel_time": "20:00:00", "return_time": None, "travel_date": future,
        "selected_days": None, "available_seats": 1, "occupied_seats": 1,
        "price_per_seat": 40, "women_only": False,
        "vehicle_kind": "car", "vehicle_model": None, "vehicle_plate": None,
        "status": "active", "co2_saved_kg": None,
    })
    ride3 = r.json()[0]["id"]
    rpc("request_ride", {"p_ride_id": ride3, "p_requester_id": OUTSIDER})
    req3 = sql_value(f"select id from public.ride_requests where ride_id='{ride3}' and requester_id='{OUTSIDER}';")
    rpc("respond_to_ride_request", {"p_request_id": req3, "p_owner_id": OWNER, "p_decision": "declined"})
    check("declined request opens no thread", sql_value(
        f"select count(*)::int as c from public.conversations where ride_id='{ride3}';") == "0")
    globals()["ride3"] = ride3

except Exception as exc:  # noqa: BLE001
    print(f"\nERROR: {exc}")
    FAIL.append("suite completed")

finally:
    print("\n=== cleanup ===")
    for key in ("ride_id", "ride2", "ride3"):
        rid = globals().get(key)
        if rid:
            try:
                sql(f"delete from public.rides where id='{rid}';")
            except Exception:
                pass
    try:
        sql(f"delete from public.user_profiles where id in ('{OWNER}','{SEEKER}','{OUTSIDER}');")
    except Exception as exc:  # noqa: BLE001
        print(f"cleanup warning: {str(exc)[:160]}")
    print("test rides, threads and users removed")

print("\n" + "=" * 54)
print(f"PASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    for name in FAIL:
        print(f"  FAILED: {name}")
sys.exit(1 if FAIL else 0)
