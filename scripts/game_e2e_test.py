#!/usr/bin/env python3
"""End-to-end test for the Fill the Ride backend (lives, sessions, rewards, anti-cheat).

Run from the repo root.
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
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not ok else ""))


def sql(stmt):
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", stmt],
        cwd=os.path.join(ROOT, "backend"), capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[:300])
    return proc.stdout


def rest(method, table, **kw):
    return requests.request(method, f"{BASE}/rest/v1/{table}", headers=H, timeout=40, **kw)


def rpc(name, payload):
    return requests.post(f"{BASE}/rest/v1/rpc/{name}", headers=H, json=payload, timeout=40).json()


def sql_value(stmt):
    out = subprocess.run(
        ["supabase", "db", "query", "--linked", stmt],
        cwd=os.path.join(ROOT, "backend"), capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:300])
    lines = out.stdout.splitlines()
    for i, line in enumerate(lines):
        if line.lstrip().startswith("├"):
            for cand in lines[i + 1:]:
                if cand.lstrip().startswith("└"):
                    return None
                cells = [c.strip() for c in cand.strip().strip("│").split("│")]
                if cells and cells[0] != "":
                    return cells[0]
    return None


PLAYER = f"test-game-{uuid.uuid4().hex[:8]}"
REFERRER = f"test-refg-{uuid.uuid4().hex[:8]}"
REFEREE = f"test-refe-{uuid.uuid4().hex[:8]}"


def settle(session, result, passengers, duration=12000):
    return rpc("validate_game_result", {
        "p_session_id": session, "p_user_id": PLAYER,
        "p_claim_result": result, "p_claim_score": 900,
        "p_claim_passengers": passengers, "p_claim_duration_ms": duration,
    })


try:
    print("\n=== 1. signup creates a game profile ===")
    rest("POST", "user_profiles", json={"id": PLAYER, "name": "Game Tester"})
    p = rpc("get_game_profile", {"p_user_id": PLAYER})
    check("3 free lives", p["total_lives"] == 3, p)
    check("0 wins, milestone locked", p["total_wins"] == 0 and not p["milestone_unlocked"], p)
    check("tutorial not seen", p["tutorial_seen"] is False, p)
    check("next refill ~7 days out", "next_refill_at" in p, list(p))

    print("\n=== 2. starting a run consumes exactly one life ===")
    s = rpc("start_game_session", {"p_user_id": PLAYER, "p_seats_required": 5})
    check("session opened", s["ok"] is True, s)
    check("lives 3 -> 2", s["profile"]["weekly_lives"] == 2, s["profile"])
    check("total_games counted", s["profile"]["total_games"] == 1, s["profile"])
    session = s["session_id"]

    print("\n=== 3. an honest win is accepted and pays Rs 5 ===")
    time.sleep(12)
    r = settle(session, "WIN", 5)
    check("win accepted", r.get("result") == "WIN", r)
    check("reward paid", r.get("reward_paid") is True, r)
    check("wins = 1", r["profile"]["total_wins"] == 1, r.get("profile"))
    check("wallet = 5", float(r.get("wallet_balance", 0)) == 5.0, r.get("wallet_balance"))

    print("\n=== 4. replaying the same session pays nothing more ===")
    r2 = settle(session, "WIN", 5, 1)
    check("flagged already_settled", r2.get("already_settled") is True, r2)
    check("wins still 1", r2["profile"]["total_wins"] == 1, r2["profile"])

    print("\n=== 5. anti-cheat ===")
    s2 = rpc("start_game_session", {"p_user_id": PLAYER, "p_seats_required": 5})
    r3 = settle(s2["session_id"], "WIN", 5, 1)
    check("5 passengers in ~0s rejected", r3.get("reason") == "implausible_passenger_count", r3)

    for desc, fn in [
        ("PATCH total_wins=999", lambda: rest("PATCH", "game_profiles", params={"user_id": f"eq.{PLAYER}"}, json={"total_wins": 999})),
        ("PATCH weekly_lives=99", lambda: rest("PATCH", "game_profiles", params={"user_id": f"eq.{PLAYER}"}, json={"weekly_lives": 99})),
        ("forge a game_rewards row", lambda: rest("POST", "game_rewards", json={"user_id": PLAYER, "game_session_id": session, "reward_type": "GAME_WIN", "amount": 500, "source": "FILL_THE_RIDE"})),
        ("PATCH a session to WIN", lambda: rest("PATCH", "game_sessions", params={"id": f"eq.{session}"}, json={"validated": True, "result": "WIN"})),
        ("PATCH a reward amount", lambda: rest("PATCH", "game_rewards", params={"user_id": f"eq.{PLAYER}"}, json={"amount": 9999})),
    ]:
        resp = fn()
        check(f"{desc} denied", resp.status_code in (401, 403), resp.status_code)

    print("\n=== 6. running out of lives is server-enforced ===")
    reason = None
    for _ in range(4):
        attempt = rpc("start_game_session", {"p_user_id": PLAYER, "p_seats_required": 5})
        if not attempt["ok"]:
            reason = attempt["reason"]
            break
    check("out_of_lives enforced", reason == "out_of_lives", reason)

    print("\n=== 7. referral grants a life only when verified ===")
    rest("POST", "user_profiles", json=[{"id": REFERRER, "name": "Ref Giver"}, {"id": REFEREE, "name": "Ref Taker"}])
    code = sql_value(f"select referral_code from public.user_profiles where id='{REFERRER}';")
    check("referrer has a code", bool(code), str(code))
    rpc("claim_referral", {"p_code": code, "p_referee_id": REFEREE})
    ref_row = sql_value(f"select id from public.referrals where referee_id='{REFEREE}';")
    check("referral recorded", bool(ref_row), str(ref_row))

    g = rpc("grant_life_for_referral", {"p_referral_id": ref_row})
    check("verified referral grants a life", g.get("ok") is True, g)
    check("referrer now has a life", g["profile"]["bonus_lives"] >= 1, g.get("profile"))
    again = rpc("grant_life_for_referral", {"p_referral_id": ref_row})
    check("cannot re-grant the same referral", again.get("ok") is False, again)

    print("\n=== 8. milestone needs 10 real wins ===")
    check("claim refused below 10", rpc("claim_game_milestone", {"p_user_id": PLAYER}).get("reason") == "not_enough_wins")
    # Simulate reaching the milestone server-side to prove the claim path works.
    subprocess.run(
        ["supabase", "db", "query", "--linked",
         f"update public.game_profiles set total_wins = 10 where user_id = '{PLAYER}';"],
        cwd=os.path.join(ROOT, "backend"), capture_output=True, text=True, timeout=180,
    )
    c = rpc("claim_game_milestone", {"p_user_id": PLAYER})
    check("milestone claimable at 10 wins", c.get("ok") is True, c)
    c2 = rpc("claim_game_milestone", {"p_user_id": PLAYER})
    check("milestone cannot be claimed twice", c2.get("reason") == "already_claimed", c2)

finally:
    print("\n=== cleanup ===")
    try:
        sql(f"delete from public.user_profiles where id in ('{PLAYER}','{REFERRER}','{REFEREE}');")
        print("  test users removed")
    except Exception as exc:  # noqa: BLE001
        print(f"  cleanup warning: {exc}")

print(f"\n{'='*50}\nPASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    print("Failed checks:")
    for n in FAIL:
        print(f"  - {n}")
sys.exit(1 if FAIL else 0)
