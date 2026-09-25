#!/usr/bin/env python3
"""End-to-end test of the LinQ SOS backend (Edge Functions + Postgres + Storage).

Run from the repo root. Requires the frontend/.env anon key and a linked
Supabase project for fixture setup/cleanup.
"""
import io
import os
import subprocess
import sys
import time
import uuid

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, "frontend", ".env"))
load_dotenv(os.path.join(ROOT, "backend", ".env"))

BASE = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["EXPO_PUBLIC_SUPABASE_ANON_KEY"]
FNS = f"{BASE}/functions/v1"
ANON = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {name}" + (f"  -> {detail}" if detail and not condition else ""))


def sql(statement):
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", statement],
        cwd=os.path.join(ROOT, "backend"),
        capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"SQL failed: {proc.stderr[:400]}")
    return proc.stdout


def sql_value(statement):
    """Extract the first data-row value from supabase db query's ASCII table.

    Layout is:
        ┌──────────┐
        │  header  │
        ├──────────┤   <- separator; the data row follows
        │  value   │
        └──────────┘
    """
    lines = sql(statement).splitlines()
    for index, line in enumerate(lines):
        if line.lstrip().startswith("├"):
            for candidate in lines[index + 1:]:
                if candidate.lstrip().startswith("└"):
                    return None
                # Drop the outer box borders, then split on the inner column rule.
                inner = candidate.strip().strip("│")
                cells = [c.strip() for c in inner.split("│")]
                if cells and cells[0] != "":
                    return cells[0]
            return None
    return None


def call(fn, payload, headers=None):
    return requests.post(f"{FNS}/{fn}", json=payload, headers=headers or ANON, timeout=60)


RIDER = f"test-rider-{uuid.uuid4().hex[:10]}"
ADMIN = f"test-admin-{uuid.uuid4().hex[:10]}"
STRANGER = f"test-stranger-{uuid.uuid4().hex[:10]}"
created_evidence = []

try:
    print("\n=== fixtures ===")
    sql(
        f"""insert into public.user_profiles (id, name, phone_number, app_role)
            values ('{RIDER}', 'Test Rider', '9000000001', 'user'),
                   ('{ADMIN}', 'Test Operator', '9000000002', 'admin'),
                   ('{STRANGER}', 'Test Stranger', '9000000003', 'user');
            insert into public.emergency_contacts (user_id, name, phone, email, is_primary, verified, verified_at)
            values ('{RIDER}', 'Spouse', '9000000011', 'spouse@example.com', true, true, now()),
                   ('{RIDER}', 'Parent', '9000000012', null, false, false, null);"""
    )
    print(f"  rider={RIDER} admin={ADMIN} stranger={STRANGER}")

    print("\n=== 1. activation ===")
    r = call("sos-activate", {
        "user_id": RIDER,
        "latitude": 17.3850, "longitude": 78.4867, "accuracy": 12,
        "evidence_capabilities": {
            "background_location": True, "camera": True, "microphone": True,
            "background_camera": False, "background_microphone": False,
        },
    })
    check("activate returns 200", r.status_code == 200, r.text[:300])
    body = r.json()
    inc = body["incident"]
    token = body["tracking_token"]
    check("incident status ACTIVE", inc["status"] == "ACTIVE")
    check("reference_code generated", inc["reference_code"].startswith("SOS-"), inc["reference_code"])
    check("activation coords stored", inc["latitude"] == 17.3850 and inc["longitude"] == 78.4867)
    check("accuracy stored", inc["accuracy"] == 12)
    check("tracking token issued", bool(token))
    check("maps url built", (body.get("maps_url") or "").startswith("https://www.google.com/maps/search/?api=1&query=17.385,78.4867"))
    check("2 contacts notified count", len(body["contacts"]) == 2, str(len(body["contacts"])))
    check("honest: background_camera reported false", inc["evidence_capabilities"].get("background_camera") is False)
    check("dispatcher reports unconfigured", body["dispatch_status"]["configured"] is False)
    sos_id = inc["id"]
    print(f"  sos_id={sos_id} ref={inc['reference_code']}")

    print("\n=== 2. idempotency ===")
    r2 = call("sos-activate", {"user_id": RIDER, "latitude": 17.39, "longitude": 78.49})
    b2 = r2.json()
    check("re-activate returns same incident", b2["incident"]["id"] == sos_id)
    check("already_active flag set", b2.get("already_active") is True)
    count = sql_value(f"select count(*)::int as c from public.sos_incidents where user_id='{RIDER}' and status='ACTIVE';")
    check("exactly one ACTIVE incident", count == "1", f"count={count}")

    print("\n=== 3. contact alerts ===")
    out = sql(f"select channel, status, contact_name from public.sos_contact_alerts where sos_id='{sos_id}' order by contact_name;")
    check("2 alert rows recorded", out.count("SKIPPED_NO_PROVIDER") >= 2, out)
    check("spouse sms channel", "sms" in out)
    check("no fake SENT status", "SENT" not in out, out)

    print("\n=== 4. location tracking ===")
    r = call("sos-location", {"user_id": RIDER, "sos_id": sos_id, "tracking_token": token,
                              "latitude": 17.3860, "longitude": 78.4870, "accuracy": 9,
                              "source": "background"})
    check("valid token accepted", r.status_code == 200, r.text[:200])
    r = call("sos-location", {"user_id": RIDER, "sos_id": sos_id, "tracking_token": "forged.token",
                              "latitude": 1, "longitude": 1})
    check("forged token rejected 401", r.status_code == 401, r.text[:200])
    r = call("sos-location", {"user_id": ADMIN, "sos_id": sos_id, "tracking_token": token,
                              "latitude": 1, "longitude": 1})
    check("cross-user token rejected 401", r.status_code == 401, r.text[:200])
    r = call("sos-location", {"user_id": RIDER, "sos_id": str(uuid.uuid4()), "tracking_token": token,
                              "latitude": 1, "longitude": 1})
    check("wrong sos_id rejected 401", r.status_code == 401, r.text[:200])
    out = sql(f"select count(*)::int as c, max(sequence) as m from public.sos_locations where sos_id='{sos_id}';")
    check("initial + 1 ping stored", "2" in out, out)
    check("background source recorded", "background" in sql(f"select source from public.sos_locations where sos_id='{sos_id}' and source='background';"))

    print("\n=== 5. evidence (private storage) ===")
    r = call("sos-evidence", {"action": "sign_upload", "user_id": RIDER, "sos_id": sos_id,
                              "kind": "photo", "content_type": "image/jpeg",
                              "capture_mode": "foreground_interactive",
                              "latitude": 17.3860, "longitude": 78.4870, "accuracy": 9})
    check("sign_upload 200", r.status_code == 200, r.text[:300])
    ev = r.json()
    path = ev["storage_path"]
    check("path follows sos_id/photos/", path.startswith(f"{sos_id}/photos/"), path)
    check("no public url in response", "public" not in r.text.lower())

    fake_jpeg = b"\xff\xd8\xff\xe0" + b"linq-test-image" * 8
    up = requests.put(ev["signed_upload_url"], data=fake_jpeg,
                      headers={"Content-Type": "image/jpeg"}, timeout=60)
    check("signed upload PUT accepted", up.status_code in (200, 201), f"{up.status_code} {up.text[:150]}")

    r = call("sos-evidence", {"action": "record_result", "user_id": RIDER, "sos_id": sos_id,
                              "evidence_id": ev["evidence"]["id"], "outcome": "UPLOADED",
                              "byte_size": len(fake_jpeg)})
    check("record_result UPLOADED", r.status_code == 200 and r.json()["evidence"]["status"] == "UPLOADED", r.text[:200])

    r = call("sos-evidence", {"action": "sign_download", "user_id": RIDER, "sos_id": sos_id})
    items = r.json()["evidence"]
    check("evidence listed for download", len(items) == 1, str(len(items)))
    check("signed download url issued", bool(items[0].get("signed_url")))
    dl = requests.get(items[0]["signed_url"], timeout=60)
    check("signed download returns bytes", dl.status_code == 200 and dl.content == fake_jpeg,
          f"{dl.status_code} {len(dl.content)}")
    created_evidence.append((sos_id, path))

    pub = requests.get(f"{BASE}/storage/v1/object/public/sos-evidence/{path}", timeout=30)
    check("public storage URL refused", pub.status_code in (400, 404), str(pub.status_code))

    r = call("sos-evidence", {"action": "sign_upload", "user_id": RIDER, "sos_id": sos_id,
                              "kind": "photo", "content_type": "image/jpeg",
                              "capture_mode": "background_native"})
    check("background_native accepted (native module path)", r.status_code == 200, r.text[:200])

    r = call("sos-evidence", {"action": "sign_upload", "user_id": STRANGER, "sos_id": sos_id,
                              "kind": "photo", "content_type": "image/jpeg"})
    check("unrelated non-admin user blocked", r.status_code == 403, r.text[:200])

    r = call("sos-evidence", {"action": "sign_download", "user_id": STRANGER, "sos_id": sos_id})
    check("unrelated user cannot read evidence", r.status_code == 403, r.text[:200])

    r = call("sos-evidence", {"action": "sign_download", "user_id": ADMIN, "sos_id": sos_id})
    check("operator CAN read evidence", r.status_code == 200, r.text[:200])

    r = call("sos-evidence", {"action": "sign_upload", "user_id": RIDER, "sos_id": sos_id,
                              "kind": "photo", "content_type": "application/zip"})
    check("disallowed mime rejected", r.status_code == 400, r.text[:200])

    print("\n=== 6. admin dashboard API ===")
    r = call("sos-admin", {"actor_id": RIDER, "action": "incidents"})
    check("non-admin blocked 403", r.status_code == 403, r.text[:200])
    r = call("sos-admin", {"actor_id": ADMIN, "action": "incidents"})
    check("admin list 200", r.status_code == 200, r.text[:200])
    rows = r.json()["incidents"]
    check("incident present for admin", any(x["id"] == sos_id for x in rows))
    row = next(x for x in rows if x["id"] == sos_id)
    for field in ("user_name", "user_phone", "latitude", "longitude", "maps_url",
                  "activated_at", "last_location_at", "contacts_total", "status"):
        check(f"admin row has {field}", field in row and row[field] is not None, str(row.get(field)))
    check("admin sees contact counts", row["contacts_total"] == 2)

    r = call("sos-admin", {"actor_id": ADMIN, "action": "detail", "sos_id": sos_id})
    d = r.json()
    check("admin detail 200", r.status_code == 200)
    check("detail has location history", len(d["locations"]) >= 2, str(len(d["locations"])))
    check("detail has evidence", len(d["evidence"]) >= 1)
    check("detail has alerts", len(d["alerts"]) >= 2)
    check("detail has contacts", len(d["contacts"]) == 2)
    check("detail includes user profile", (d["incident"].get("user") or {}).get("name") == "Test Rider")

    r = call("sos-admin", {"actor_id": ADMIN, "action": "acknowledge", "sos_id": sos_id})
    check("admin acknowledge 200", r.status_code == 200 and r.json()["incident"]["acknowledged_at"], r.text[:200])

    print("\n=== 7. termination ===")
    r = call("sos-end", {"actor_id": RIDER, "sos_id": sos_id, "status": "RESOLVED",
                         "end_reason": "Test complete"})
    check("end 200", r.status_code == 200, r.text[:200])
    check("status RESOLVED", r.json()["incident"]["status"] == "RESOLVED")
    check("ended_at recorded", bool(r.json()["incident"]["ended_at"]))

    r = call("sos-location", {"user_id": RIDER, "sos_id": sos_id, "tracking_token": token,
                              "latitude": 17.4, "longitude": 78.5})
    check("tracking stops after end (409)", r.status_code == 409, r.text[:200])

    r = call("sos-evidence", {"action": "sign_upload", "user_id": RIDER, "sos_id": sos_id,
                              "kind": "photo", "content_type": "image/jpeg"})
    check("evidence stops after end (409)", r.status_code == 409, r.text[:200])

    r = call("sos-end", {"actor_id": RIDER, "sos_id": sos_id, "status": "CANCELLED"})
    check("double-end idempotent", r.status_code == 200 and r.json().get("already_ended") is True, r.text[:200])

    r = call("sos-end", {"actor_id": RIDER, "sos_id": str(uuid.uuid4()), "status": "CANCELLED"})
    check("end unknown incident 404", r.status_code == 404, r.text[:200])

    print("\n=== 8. self-verification guard ===")
    cid = sql_value(f"select id from public.emergency_contacts where user_id='{RIDER}' and name='Parent';")
    resp = requests.patch(f"{BASE}/rest/v1/emergency_contacts", headers=ANON,
                          params={"id": f"eq.{cid}"}, json={"verified": True}, timeout=30)
    check("client cannot self-verify contact", resp.status_code >= 400, f"{resp.status_code} {resp.text[:120]}")
    resp = requests.post(f"{BASE}/rest/v1/emergency_contacts", headers=ANON,
                         json={"user_id": RIDER, "name": "Self", "phone": "9000000099", "verified": True}, timeout=30)
    check("client insert verified ignored or blocked", resp.status_code >= 400, f"{resp.status_code} {resp.text[:120]}")

finally:
    print("\n=== 9. cold-start status (must never create an incident) ===")
    r = call("sos-activate", {"user_id": RIDER, "action": "status"})
    check("status returns 200", r.status_code == 200, r.text[:200])
    st = r.json()
    check(
        "status reports resolved incident",
        st["incident"] is not None and st["incident"]["status"] == "RESOLVED",
        str((st["incident"] or {}).get("status")),
    )
    check("no tracking token once ended", st["tracking_token"] is None, str(st["tracking_token"])[:40])
    check("status returns contacts", len(st.get("contacts") or []) == 2, str(len(st.get("contacts") or [])))
    after = sql_value(f"select count(*)::int as c from public.sos_incidents where user_id='{RIDER}';")
    check("status created no new incident", after == "1", f"incidents={after}")

    r = call("sos-activate", {"user_id": f"nobody-{uuid.uuid4().hex[:8]}", "action": "status"})
    check(
        "status for user with no SOS is null",
        r.status_code == 200 and r.json()["incident"] is None,
        r.text[:150],
    )

    print("\n=== cleanup ===")
    for sid, p in created_evidence:
        pass
    try:
        sql(f"delete from public.user_profiles where id in ('{RIDER}','{ADMIN}','{STRANGER}');")
        print("  test users + cascaded SOS data removed")
    except Exception as exc:  # noqa: BLE001
        print(f"  cleanup warning: {exc}")

print(f"\n{'='*54}\nPASSED {len(PASS)}   FAILED {len(FAIL)}")
if FAIL:
    print("Failed checks:")
    for name in FAIL:
        print(f"  - {name}")
sys.exit(1 if FAIL else 0)
