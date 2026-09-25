# LinQ SOS — Setup & Operations

Complete deployment, security and operations guide for the SOS safety system.

---

## 1. What is deployed

| Layer | Component | Status |
|---|---|---|
| Database | 5 tables, 3 trigger guards, RLS, private storage bucket | migration `20260925140000` … `20260925180000` |
| Edge Functions | `sos-activate`, `sos-location`, `sos-end`, `sos-evidence`, `sos-admin` | deployed, JWT verification disabled |
| Mobile | press-and-hold SOS, confirmation, live status, evidence capture | this app |
| Admin | `/admin/sos` dashboard + incident detail | role-gated |

---

## 2. Secrets

```bash
cd backend

# Required. Used to HMAC-sign background location tokens.
supabase secrets set SOS_TRACKING_SECRET="$(openssl rand -hex 32)"

# Optional. Until set, contact alerts are RECORDED, not delivered.
# When set, alerts are POSTed here and the dashboard shows SENT/FAILED.
supabase secrets set SOS_ALERT_WEBHOOK_URL="https://your-relay.example.com/linq-sos"
supabase secrets set SOS_ALERT_WEBHOOK_SECRET="shared-secret"
```

> **Never** put `SUPABASE_SERVICE_ROLE_KEY`, `SOS_TRACKING_SECRET`,
> `RAZORPAY_KEY_SECRET` or the alert webhook secret in the app, in EAS public
> env vars, or in Vercel. The app only ever holds `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
> which is public by design.

### The alert relay contract

`POST $SOS_ALERT_WEBHOOK_URL` with `Content-Type: application/json` and, if
configured, `x-linq-sos-secret`. Payload:

```json
{
  "sos_id": "uuid",
  "reference_code": "SOS-20260925-A1B2",
  "user_id": "firebase-uid",
  "user_name": "Rahul",
  "user_phone": "9000000001",
  "contact_name": "Spouse",
  "contact_phone": " "9000000011",
  "contact_email": null,
  "channel": "sms",
  "message": "full text body with Google Maps link",
  "maps_url": "https://www.google.com/maps/search/?api=1&query=17.38,78.48",
  "latitude": 17.385,
  "longitude": 78.4867,
  "accuracy": 12,
  "activated_at": "2026-09-25T17:00:00.000Z",
  "current_ride_id": "uuid-or-null",
  "ride_pickup": "…",
  "ride_dropoff": "…"
}
```

Return `2xx` to mark the alert `SENT` (optionally `{"message_id":"…"}`).
Anything else is recorded as `FAILED` with the response body. This is how you
plug in Twilio / Interakt / MSG91 / SES without touching app code.

---

## 3. Provisioning a safety operator

The admin dashboard requires `app_role IN ('admin','safety_team')`.

```bash
cd backend
supabase db query --linked \
  "update public.user_profiles set app_role='admin'
   where id = '<FIREBASE_UID>';"
```

A client **cannot** do this itself: `app_role` is excluded from the client
column grants and a trigger rejects any non-service-role write.

---

## 4. Native build requirement

Background location, the camera and the microphone are native capabilities, so
SOS needs a **development build or EAS build**. Expo Go will not work.

```bash
cd frontend
npx expo prebuild --clean      # regenerates ios/ and android/ with the permissions
npx expo run:ios
npx expo run:android
```

`app.json` already declares:

* `expo-location` with `isIosBackgroundLocationEnabled: true`,
  `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: true`
* iOS `UIBackgroundModes: ["location"]`
* `expo-camera` with the SOS usage string
* `expo-audio` with the SOS usage string (`enableBackgroundRecording: false`)
* Android `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`, `CAMERA`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`

Store review notes should state that location is used **only** while an SOS is
active, and that the Camera/Microphone strings explain the SOS evidence purpose.

### Runtime permission ladder

1. Foreground location — requested on activation.
2. Background location — requested immediately after. If declined, tracking
   continues **only while the app is open** and the UI says so on
   `/sos/active` and in the admin dashboard.
3. Camera / microphone — requested when the evidence screen opens.

---

## 5. Security model

| Control | Implementation |
|---|---|
| No service-role key in the app | All privileged work is in Edge Functions |
| No direct SOS table access | `REVOKE ALL … FROM anon, authenticated` — verified returning `401` |
| No public evidence URLs | bucket `public = false`; signed URLs only, 10-minute TTL |
| Forged location pings | HMAC tracking token bound to `sos_id` + `user_id` + expiry |
| Privilege escalation | `app_role` excluded from client grants **and** trigger-guarded |
| Self-verifying contacts | `verified` / `verified_at` are service-role only |
| Evidence type spoofing | `capture_mode` allow-listed server-side |
| Upload path traversal | path is server-generated from `sos_id` + validated MIME + allow-listed extensions |
| Tracking after SOS ends | `sos-location` returns `409` once status ≠ `ACTIVE` |
| Evidence after SOS ends | `sos-evidence sign_upload` returns `409` once status ≠ `ACTIVE` |
| One incident per user | partial unique index on `(user_id) WHERE status='ACTIVE'` |

### Known limitation (pre-existing, not introduced here)

The app authenticates with **Firebase** but talks to Supabase with the **anon**
key, so there is no `auth.uid()` on the server. Every Edge Function therefore
takes `user_id` as an explicit argument. This is the same posture the existing
`user_profiles` / `rides` tables already had, and it is why:

* the tracking token exists (it closes the location-tampering hole), and
* client-side `app_role` checks are UX only — the server re-checks every time.

**Before production**, either verify the Firebase ID token in an Edge Function
(firebase-admin) and derive `user_id` from it, or migrate auth to Supabase Auth.
The single place to change is the `requireUserId` helper in
`backend/supabase/functions/_shared/sos.ts`.

---

## 6. Honest capability reporting

`evidence_capabilities` is written on the incident at activation and surfaced
in the admin dashboard:

```json
{
  "camera": true,
  "microphone": true,
  "background_location": true,
  "background_camera": false,
  "background_microphone": false,
  "notes": ["Always-on location permission was declined…"]
}
```

`background_camera` / `background_microphone` are hard-coded `false` in the
shipped app. They can only become `true` when a real native module reports a
capture — see `docs/SOS_EVIDENCE_NATIVE_MODULE.md`.

---

## 7. Verification

```bash
# 65 backend assertions across every function, including negative security cases
python3 scripts/sos_e2e_test.py
```

Covers: activation, idempotency, alert recording, location ingest, forged-token
rejection, cross-user rejection, evidence sign/upload/download, public-URL
refusal, admin gating, operator detail, termination, post-termination
lockout, and self-verification guards. Test rows are removed at the end.

---

## 8. Manual smoke test

1. Sign in, open **Safety & Privacy**, add two emergency contacts.
2. Home → hold **SOS** for 2 seconds → confirmation screen.
3. Tap **ACTIVATE SOS**.
4. Home now shows a red **SOS ACTIVE** banner with a live reference code.
5. `/sos/active` shows activation time, last update, contact count, and whether
   background tracking is actually running.
6. Background the app for ~60 s, return: the last-update time should have moved
   and the counter should have increased.
7. Tap **Capture evidence now** → take a photo → it uploads and appears in the
   admin dashboard Photos tab.
8. Promote the account to `admin`, open `/admin/sos`, open the incident, and
   check Location / Photos / Audio / Alerts tabs.
9. **END SOS** → confirm → banner disappears, tracking stops, and further
   location/evidence calls are refused with `409`.

---

## 9. Rollback

```bash
cd backend
supabase functions delete sos-activate sos-location sos-end sos-evidence sos-admin
```

The tables are independent of the rest of the app; dropping them is optional
and irreversible for collected evidence, so archive before dropping:

```sql
-- export first
supabase db dump --linked --data-only --schema public > sos-archive.sql
```
