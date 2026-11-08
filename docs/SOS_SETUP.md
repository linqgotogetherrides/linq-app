# LinQ SOS — Setup & Operations

Complete deployment, security and operations guide for the SOS safety system.

---

## 1. What is deployed

| Layer | Component | Status |
|---|---|---|
| Database | 5 incident tables + `sos_events`, 3 trigger guards, RLS, private storage bucket | migrations `20260925140000` … `20260925180000`, `20261104120000` |
| Edge Functions | `sos-activate`, `sos-location`, `sos-end`, `sos-evidence`, `sos-admin`, `sos-upload` | deployed, JWT verification disabled |
| Mobile | tap SOS → 10 s countdown → evidence → WhatsApp | this app |
| Admin | `/admin/sos` dashboard + incident detail | role-gated |

The reference flow (`sos-upload` + `sos_events`) is separate from the older
incident/live-tracking system. It is the path the Home/Safety SOS control uses:
a 10 second cancellable countdown, four photos, a five second video, a five
second audio clip, `location.json`, a private Storage upload, then WhatsApp.

### Deploying the reference flow

```bash
cd backend
supabase db push
supabase functions deploy sos-upload --no-verify-jwt
```

`verify_jwt` must stay off for `sos-upload` because phone users authenticate
with Firebase tokens, not Supabase-issued JWTs. The function verifies the bearer
token itself (Supabase `getUser`, then Firebase JWKS) and derives `user_id` from
it. It never trusts a user id in the request body.

The bucket stays private and service-role only; the function performs every
Storage read/write. `sos_events` has RLS, but the client only reads it through
normal Supabase session policies.

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

# Optional for sos-upload. Defaults to linq-7d413 (google-services.json). Set it
# if the Firebase project is changed.
supabase secrets set FIREBASE_PROJECT_ID="linq-7d413"
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

In the reference countdown flow, location permission is requested in parallel
with the camera. Denying the camera still continues with audio, location,
upload and WhatsApp; denying the microphone still continues with photos,
location, upload and WhatsApp. On web, only the photos, location, upload and
WhatsApp steps run.

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
| Reference upload identity | `sos-upload` derives `user_id` from a verified Supabase/Firebase token; body ids are ignored |

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

`sos-upload` already does this correctly: it verifies the bearer token against
Supabase Auth or Google's Firebase JWKS and inserts only that derived uid. The
older functions still take `user_id` in the body.

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

## 8. Manual smoke test (reference countdown flow)

1. Sign in, open **Safety & Privacy**, and save an emergency contact with a
   valid WhatsApp phone number.
2. Home → tap **SOS** once. The 10 second countdown opens.
3. Tap **CANCEL SOS** once: no evidence is captured. Tap SOS again.
4. Let the countdown finish (or tap **Start now**). Grant location, camera and
   microphone when prompted.
5. Watch the native capture screen: back photos, front photos, five second
   video, five second audio. On web, only the photos run.
6. WhatsApp opens with the alert pre-filled for the saved contact. Press Send.
7. Return to LinQ. The status screen lists each step as success/failure and has
   a **Done** button.
8. Confirm the private Storage folder
   `sos-evidence/{user_id}/{sos_id}/` and the matching `sos_events` row.
9. Deny the camera and repeat: photos/video are skipped, but audio, location,
   server backup and WhatsApp still run.
10. Open an old `/sos/confirm` deep link: it redirects to the countdown.

---

## 9. Rollback

```bash
cd backend
supabase functions delete sos-activate sos-location sos-end sos-evidence sos-admin sos-upload
```

The tables are independent of the rest of the app; dropping them is optional
and irreversible for collected evidence, so archive before dropping:

```sql
-- export first
supabase db dump --linked --data-only --schema public > sos-archive.sql
```
