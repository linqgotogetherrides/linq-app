# LINQ FUNCTIONAL AUDIT

Date: 2026-10-05
Repo: /Users/pandu/Desktop/app-Linq-main
Method: traced the actual implementation (screens → contexts → services → lib → SQL/migrations → Edge Functions → env). No source files were modified.

---

## 0. Global facts established from the code

- Frontend = Expo SDK 54, RN 0.81.5, React 19.1, expo-router 6 (`frontend/package.json`), web export via `expo export -p web` (`vercel.json`).
- Backend = Supabase (Postgres + Auth + storage + Edge Functions in `backend/supabase/`). The FastAPI app in `backend/server.py` is a vestigial Mongo stub (`MONGO_URL`, `DB_NAME`) that is NOT wired into the product.
- Client identity uses Firebase UIDs with the Supabase anon key, so `auth.uid()` is NULL server-side. All RPCs take explicit `p_user_id` args and enforce authorization by comparing against the caller-provided id (see `_shared/sos.ts`, `chatService.ts` comments, `backend_actor_guard` migration).
- Env variables actually referenced:
  - Client (inlined, EXPO_PUBLIC_*): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_RAZORPAY_KEY_ID`
  - Edge functions (server-only): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_CALLBACK_URL`, `SOS_ALERT_WEBHOOK_URL`, `SOS_ALERT_WEBHOOK_SECRET`, `SOS_TRACKING_SECRET`, `SOS_EVIDENCE_CYCLE_MS`, `SOS_EVIDENCE_PHOTOS_PER_CYCLE`, `SOS_EVIDENCE_AUDIO_MS`, `SOS_EVIDENCE_AUDIO_PER_CYCLE`, `SOS_LOCATION_TASK`, `SOS_EVIDENCE_NATIVE_MODULE`, `SOS_HOME_SCREEN_NATIVE`, `MAPBOX_SECRET_TOKEN`

---

## 1. App launch

**STATUS: WORKING (with caveats)**

- `frontend/app/_layout.tsx` — `RootLayout`: loads icon fonts via `useIconFonts`, hides the native splash (`expo-splash-screen`), captures `?ref=` via `captureReferralFromLink()`, registers `useSosDeepLink()`, wraps the tree in `GestureHandlerRootView` → `SafeAreaProvider` → `AppProvider` → `AuthGate` → `WalletProvider` → `GameProvider` → `SosProvider` → `SosAdminProvider`, renders `<Stack headerShown={false}>` and `<Toast/>`.
- `frontend/app/index.tsx` — Splash: waits 1.4s min + `booting`, then `router.replace(user ? destinationAfterAuth(next) : withNext('/onboarding', next))`.
- `AppContext.tsx` (`useApp`, `booting`, `readSession`/`saveSession` from `services/session.ts`): reads persisted `linq.session.uid` from AsyncStorage on cold start; if a uid exists it fetches the profile via Supabase (`user_profiles` table).
- DB: `public.user_profiles` (`supabase_schema.sql` lines 19–57); `ensureUserProfile` (`services/userProfile.ts`) self-heals a missing row.
- AuthGate (`components/AuthGate.tsx`): pathname-aware; public routes allowed (`/`, `/onboarding`, `/login`, `/otp`, `/account-creation`, `/language`, `/support`, `/safety`, `/sos/confirm`); others redirect to `/login?next=…`.
- Failure modes: missing `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` → `src/lib/supabase.ts` logs a loud error but still creates a client with empty strings → every request fails with an unhelpful network error; a corrupt AsyncStorage uid triggers a re-login; `LogBox.ignoreAllLogs(true)` hides all warnings.

## 2. Login / OTP

**STATUS: WORKING on native; MOCKED on web**

- `app/login.tsx`: phone input → `signInWithPhoneNumber` from `src/lib/auth` (platform shim) → on native `src/lib/auth.native.ts` uses `@react-native-firebase/auth` `signInWithPhoneNumber`; on web `auth.web.ts` returns a mock `{ confirm: async (code) => … web-uid-<phone> }`. OAuth buttons call `signInWithProvider` from `src/lib/oauth.ts` (Supabase `signInWithOAuth` + `expo-web-browser`, redirect `linq://auth/callback`, `setSession` from URL fragment).
- `app/otp.tsx`: `confirmResult.confirm(otp)` (Firebase) → `setOtpVerifiedUid(firebaseUser.uid)` → reads pending referral from AsyncStorage → `userProfileExists` check → existing rider: `saveSession` + `fetchUserProfile` → `destinationAfterAuth(next)`; new rider: `/account-creation`.
- `otpVerifiedUid` is intentionally NOT taken from URL params (tamper-proofing).
- DB: `user_profiles` (read/exists check), `referrals` claim later.
- External: Firebase phone auth (native only); web is a stub that accepts any 6-digit code.
- Failure modes: Firebase not configured on Android/iOS (`google-services.json`/`GoogleService-Info.plist`) → OTP never sends; web build always logs in as `web-uid-<phone>`; Firebase console must have the SHA/signing config or OTP throws `auth/invalid-app-credential`-style errors.

## 3. Account creation

**STATUS: WORKING**

- `app/account-creation.tsx` (1022 lines, 5-step wizard): name, age, gender, women-only toggle, photo (`expo-image-picker`), verification document choice (Aadhaar/PAN/DL), phone for OAuth signups. Uses `otpVerifiedUid` from context, ignores `?uid=` param.
- On submit: `saveProfile` (`services/userProfile.ts`) inserts/upserts `public.user_profiles`, `saveSession(uid)`, `fetchUserProfile`, referral claim (`claim_referral` RPC from WalletContext/`referralLink`), routes to `destinationAfterAuth(next)`.
- DB: `public.user_profiles`; trigger `assign_referral_code_on_signup` (`20260925210000`) mints a referral code.
- Missing/fail-prone: legacy `?uid=` links correctly ignored; duplicate phone numbers are not deduplicated against Firebase; no email verification step.

## 4. Profile

**STATUS: WORKING (read/write via Supabase)**

- `app/(tabs)/profile.tsx`: hero (name/avatar/phone/verification badge), stats, sections for Account/Payments/Rides/More. Edit flows in `app/personal-info.tsx` (name, saved locations etc.), `app/linked-accounts.tsx`, `app/notifications.tsx` settings page, `app/verification-profile.tsx`.
- DB: `user_profiles` (`name`, `avatar_url`, `phone`, `age`, `gender`, `women_only`, `verification_status`, `app_role`, `saved_locations` JSON — parsed by `normalizeSavedLocations` in AppContext).
- Access limits (`AccessState`) are local state in AppContext (`freeRequestsRemaining`, `freeChatsRemaining`, `plan`) — seeded at 2/2; NOT persisted server-side. `upgradePlan`/`singleUnlock` only flip local state. This is a PRODUCTION gap: plan is not stored on the user row.

## 5. Location permission & selection

**STATUS: WORKING (native + web graceful)**

- Permission flow: `src/hooks/useCurrentLocation.ts` → `services/locationService.ts` (`requestLocationPermission`, `getLocationPermission`, `getCurrentLocation`) using `expo-location`; Android/iOS permissions declared in `app.json`. Errors mapped via `getLocationErrorMessage`; `Alert` + `Linking` to settings when denied.
- Location quality scoring (`LocationFix`, `quality: excellent|acceptable|weak|poor|unknown`) used to decide whether to show a fix.
- Selection: `LocationPickerModal.tsx`, `LocationAutocomplete.tsx` (Mapbox geocoding via `MAPBOX_SECRET_TOKEN`? — client uses `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`), `LocationSelectionMap.tsx`, `InteractiveMap.native.tsx` (`react-native-maps` `UrlTile` tiles), `LeafletMap.tsx` (WebView Leaflet for web), `ride-location-flow.tsx` returns `LocationFlowResult` through AppContext (`locationFlowResult`, `clearLocationFlowResult`).
- Failure modes: denied permission → location services return `poor/unknown`; web build uses the web placeholder map (`InteractiveMap.web.tsx` renders a static view); Mapbox token missing → geocoding fails.

## 6. Create Ride

**STATUS: WORKING**

- `app/(tabs)/create.tsx` and `app/create-ride.tsx`: vehicle yes/no, transport mode (car/bike/auto/cab), seats stepper, price slider, passengers via `PassengerModal`, women-only switch, daily/planned via segmented control, draft persistence via `lib/rideDraft.ts` (fixes the travel-time reset bug), date handling via `lib/rideSchedule.ts` (ISO dates — fixes NULL-date bug).
- On publish: `rideService.createRide` (`src/services/rideService.ts`) inserts into `public.rides` (columns per `supabase_schema.sql`: user_id, type, vehicle, pickup/destination JSON, time, price, seats, women_only, status 'draft'|'active'…), can save as draft (`status: 'draft'`).
- DB: `public.rides`; RLS lockdown migration `20260926190000_lock_rides_writes.sql` revoked client UPDATE on `user_id`/`occupied_seats` (so seats/owner can only change via RPCs) — `scripts/rides_write_guard_test.py` verifies.
- `close_expired_rides` pg_cron migration `20260926150000/160000` auto-closes posts whose date+time passed.

## 7. OSRM route generation

**STATUS: WORKING (with documented fallback)**

- `src/lib/routing/osrm.ts`: `fetchOSRMRoute(pickup, drop)` calls the public OSRM demo server, caches in-memory, returns `{ distance, duration, geometry, source: 'road' | 'fallback' }`. Fallback path synthesizes a straight LineString and is flagged so UI does not draw it as a road.
- Used by `rideService` for each ride's geometry and by `RouteMatchPreview`/map screens.
- External: `https://router.project-osrm.org` (public, no key). Failure → `source: 'fallback'`; no rate-limit handling beyond in-memory cache.

## 8. Route matching

**STATUS: WORKING**

- `src/lib/routing/routeGeometry.ts` (haversine, point-to-segment, sampling, bearing), `routeMatcher.ts` (`corridorMatchResult` overlap ratios, shared distance, direction diff, opposite-direction flag), `routeScoring.ts` (`scoreRideMatch` weighted 0.50 overlap + 0.15 pickup + 0.15 drop + 0.10 time + 0.10 direction), `MATCH_TYPE exact >70 / nearby >30 / other`.
- Tested: `src/lib/routing/__tests__/routeMatcher.test.ts` + `scripts/route-match-example.ts`.
- `scripts/game-fairness.ts` is for the game, not routing.

## 9. Search Rides

**STATUS: WORKING**

- `app/(tabs)/home.tsx`: search card (route line, day picker, time selectors, women-only filter, usage banner) → `app/search-results.tsx` with filters; `app/(tabs)/rides.tsx` is the management hub (Ride Requests incoming/sent, Published/Drafts, Upcoming) with Daily/Planned filter.
- Data: `rideService.searchRides`/list via Supabase `rides` table + RPC `find_nearby_rides`/`find_candidate_rides` (`matching_migration.sql`, `20260925220000_draft_rides.sql`) + client-side `scoreRideMatch` ranking.
- Failure: RPC functions assume PostGIS-less haversine math; no pagination beyond 1000-row cap (`max_rows` in config.toml).

## 10. Ride Details

**STATUS: WORKING**

- `app/ride/[id].tsx`: profile card, route line, info grid, CO₂ estimate, vehicle, safety row, request/cancel + contact unlock CTA; uses `rideService.getRideById` → `mapRideRow`, status, request state from `rideRequestService`/`AppContext.rideRequests`.

## 11. Request Ride

**STATUS: WORKING**

- `app/ride/[id].tsx` request button → `request_ride` RPC (`20260925120000_ride_requests_notifications.sql` line 178): validates seats, decrements caller's free-request quota semantics are client-side only; inserts `ride_requests` row (pending), trigger `handle_ride_request_notification` inserts a `notifications` row (`ride_request`) for the owner.
- `services/rideRequestService.getIncomingRideRequests` lists pending/accepted for owner; `AppContext.refreshRideActivity` polls on AppState foreground.

## 12. Accept / Reject Ride

**STATUS: WORKING**

- `app/(tabs)/rides.tsx` incoming list → accept sheet with seats stepper + live fare → `respond_to_ride_request` RPC (`20260926140000_multi_seat_acceptance.sql`): sets status accepted/declined, increments `occupied_seats` by N, opens conversation via `open_conversation_on_accept` trigger (`20260926170000_chat.sql` + `20260926180000_fix_chat_trigger.sql`), inserts notification (`request_accepted`/`declined`).
- DB objects: `ride_requests`, `notifications`, `conversations`, `messages`, `rides`.

## 13. Confirmed Ride

**STATUS: WORKING**

- Confirmed request shows "Message traveller" → `chat/[id]`; Upcoming cards show chat button; `find_user_current_ride` RPC (`sos_safety.sql`) resolves the active pairing for SOS.
- `20260926150000_close_expired_rides.sql` closes scheduled rides once datetime passes; owner notified with `ride_closed`.

## 14. Chat

**STATUS: WORKING**

- `app/chat/[id].tsx`: thread view, bubbles, confirm-ride CTA, locked-chat upgrade prompt.
- `services/chatService.ts`: `list_conversations`, `list_messages`, `send_message` RPCs; conversations auto-created by DB trigger on acceptance; membership enforced by RPC (`20260926170000_chat.sql`, trigger fix `20260926180000`).
- Failure: no realtime subscription — messages appear on re-fetch/interval; no push notifications for new messages.

## 15. Ride completion

**STATUS: PARTIAL**

- `rides` rows transition `active/confirmed → completed/cancelled` via owner close or cron expiry; there is no explicit "mark completed" user action wired in the screens audited. `ride-history.tsx` reads past rides. CO₂/reward crediting on completion is not client-wired.

## 16. Wallet

**STATUS: WORKING**

- `app/wallet.tsx`, `app/transactions.tsx`, `app/rewards.tsx`: balance, lifetime earned/spent, filtered txn list, top-up entry via `RazorpayCheckoutButton` (wallet_topup plan), referral rewards history.
- DB: `wallets`, `wallet_txns` (`20260925200000_referrals_wallet.sql`); RPCs `ensure_wallet_exists`, `add_wallet_credit` (line 176), `credit_wallet_once` (`20260925230000`); `WalletContext.tsx` reads them live; `kind` values mirrored in `WalletTxnKind`.
- Reward crediting: `claim_referral` credits both sides once; game milestone flows through `GameContext.claimMilestone` → `claim_game_milestone` RPC.

## 17. Rewards

**STATUS: WORKING (consults wallet, not separate balance)**

- `app/rewards.tsx` shows reward txns from `wallet_txns` (`referral_reward`, `ride_credit`); PRD's "separate reward balance" was collapsed into the wallet in the implementation (`WalletContext` exposes `rewardBalance` derived locally — treated as wallet-derived).

## 18. Referral

**STATUS: WORKING**

- `app/referral.tsx`: user's code (auto-assigned on signup via trigger), share link `https://linq.app/join?ref=CODE` via `Share` API; `services/referralLink.ts` captures `?ref=` at launch; `otp.tsx` persists it through signup; `WalletContext` exposes referral stats (`totalInvited/joined/rewarded/earned`) from `referrals` table.
- DB: `referrals` (`PENDING/JOINED/COMPLETED/REJECTED`, `reward_credited`), `create_referral_code`, `find_referrer_by_code`, `claim_referral` RPCs.

## 19. Razorpay payment

**STATUS: WORKING (server-verified)**

- `components/RazorpayCheckoutButton.tsx`: opens Razorpay checkout (via WebView/web) with `EXPO_PUBLIC_RAZORPAY_KEY_ID`; on success → `verify-razorpay-payment` Edge Function validates HMAC signature, updates `payments` row, credits wallet/upgrades plan via `wallet-credit`/email webhook.
- Edge functions: `create-razorpay-order` (creates order with plan amount from `_shared/razorpay.ts` `PLAN_AMOUNTS`), `verify-razorpay-payment`, `razorpay-callback`, `razorpay-webhook` (`x-razorpay-signature` check against `RAZORPAY_WEBHOOK_SECRET`).
- DB: `public.payments` (`supabase_schema.sql` lines 105–127).
- Env required: client `EXPO_PUBLIC_RAZORPAY_KEY_ID`; server `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET/CALLBACK_URL`.
- Failure: webhook URL must be publicly reachable in prod; test keys vs live keys; `game_annual` plan is gated server-side by `get_game_profile.total_wins >= 10`.

## 20. KYC

**STATUS: PARTIAL**

- `components/VerificationWebView.tsx` renders the KYC provider URL in a WebView modal; `app/verification.tsx`/`verification-profile.tsx` collect document choice. `create-kyc-session` Edge Function starts a session; `kyc-webhook` receives the provider callback and flips `verification_status` on `user_profiles`.
- What is missing: no provider credentials documented in `.env.example`; the webhook handler trusts provider payload without a visible signature check in the shared helper; UI has no retry/status polling beyond profile refetch.

## 21. SOS activation

**STATUS: WORKING**

- `app/sos/confirm.tsx` (public route, safe fallback with 112 dial), `SosHoldButton`/`SosButton` (hold-to-activate), `app/sos/active.tsx` shows live state.
- Client: `SosContext` → `sosApi.activate` → Edge Function `sos-activate` (service-role, bearer==apikey check, explicit user_id, inserts `sos_incidents` row, mints HMAC tracking token, dispatches contact alerts via `_shared/dispatch.ts` webhook, status recorded honestly when no SMS provider configured).
- DB: `sos_incidents`, `emergency_contacts`, `sos_contact_alerts` (`20260925140000_sos_safety.sql`); `guard_sos_incident_transition` enforces valid status transitions.

## 22. SOS location tracking

**STATUS: WORKING (native background via expo-task-manager)**

- `services/sos/sosTracker.ts` (`startTracking`, `pushNow`, dedup), `backgroundLocationTask.ts` (`expo-task-manager` task registered at module scope; no-op on web), `SosContext` starts tracking on activation, stops on end/admin ack.
- Edge Function `sos-location` validates HMAC tracking token (`SOS_TRACKING_SECRET`, 12h TTL in `_shared/sos.ts`) and inserts into `sos_locations`.
- `app.json` declares background location + foreground service permissions; `docs/SOS_SETUP.md` covers deployment.
- Failure: web build cannot background-track; battery optimization on Android can kill the task; token expiry needs re-activation.

## 23. SOS evidence upload

**STATUS: WORKING (requires native module; web degraded)**

- `services/sos/sosEvidence.ts`: capability detection (`expo-camera`, `expo-audio`), evidence cycle runs every `SOS_EVIDENCE_CYCLE_MS` capturing `SOS_EVIDENCE_PHOTOS_PER_CYCLE` photos + `SOS_EVIDENCE_AUDIO_MS` audio clip; uploads via `sosApi` → `sos-evidence` Edge Function → Supabase Storage bucket `sos-evidence` (`EVIDENCE_BUCKET`); rows in `sos_evidence`; admin can list/sign download URLs.
- Native module guide: `docs/SOS_EVIDENCE_NATIVE_MODULE.md` (uses a custom native module when `SOS_EVIDENCE_NATIVE_MODULE` is set; otherwise Expo APIs).
- Failure: web build — no camera/mic evidence (degraded flag); storage bucket missing → upload 403; evidence rows reference a signed URL minted per-admin.

## 24. SOS admin

**STATUS: WORKING**

- `app/admin/sos/index.tsx` (list/stats), `app/admin/sos/[id].tsx` (detail, acknowledge via `sosApi` → `sos-admin` Edge Function with `actor_id` + `action` dispatch: `list|detail|acknowledge|stats`). `SosAdminContext` gates UI client-side on `user_profiles.app_role`; server re-verifies via `is_sos_operator` RPC and the `guard_user_profile_app_role` trigger blocks clients from self-promoting.
- DB: `app_role` column + `sos_incidents` + `sos_locations` + `sos_evidence`.

## 25. Notifications

**STATUS: PARTIAL**

- In-app notifications table `notifications` (`ride_request`, `request_accepted`, `request_declined`, `ride_closed`, `system`) — written by DB triggers, shown in `app/notifications.tsx` and reflected via `AppContext.rideNotifications`/`pendingRideRequestCount`.
- Missing: no FCM/APNs push wiring in the audited code (Firebase packages are for Auth/Analytics/Crashlytics only); no realtime socket subscription — notifications are refreshed on foreground.

---

# Environment variable checklist

| Variable | Where used | Required for |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts` | ALL data features |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | location autocomplete/geocoding | location search, maps |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | `RazorpayCheckoutButton` | payments |
| `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_CALLBACK_URL` | Edge Functions | payments |
| `SOS_ALERT_WEBHOOK_URL/SECRET` | `_shared/dispatch.ts` | SOS SMS/email alerts (optional, honest no-op otherwise) |
| `SOS_TRACKING_SECRET` | `_shared/sos.ts` | SOS location ingest |
| `SOS_EVIDENCE_*` | `sosEvidence.ts`, edge fn | SOS capture cadence/modules |
| `MAPBOX_SECRET_TOKEN` | server-side only | geocoding proxy if used |
| `MONGO_URL`, `DB_NAME` | `backend/server.py` | legacy FastAPI only |

---

# PRIORITY LIST

## CRITICAL — blocks the app
1. `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` missing or wrong → the entire app cannot reach the DB (launch, login profile fetch, all features). `src/lib/supabase.ts` only `console.error`s; builds with empty strings fail opaquely.
2. Firebase/Google services files or SHA fingerprints misconfigured → OTP login throws on device; users cannot sign in at all.
3. `SOS_TRACKING_SECRET` missing in production → SOS location tracking is rejected server-side (`sos-location` fails).
4. Razorpay secrets missing on Edge Functions → payments/wallet top-up/referral crediting never verifies.

## HIGH — core feature broken
5. Vestibule `backend/server.py` + `MONGO_URL/DB_NAME` suggests a FastAPI/Mongo API that does not exist; any new code importing from it would silently diverge from the Supabase backend.
6. Plan/access limits (`AccessState`, `upgradePlan`, `singleUnlock`) are client-only state — not persisted; a restart resets the rider's plan, and the server does not enforce request/chat quotas.
7. No push notifications (FCM/APNs not wired) and no realtime subscriptions → ride requests/chats/notifications only refresh on app foreground.
8. Web build auth is a mock (`auth.web.ts` accepts any code) — acceptable for demo, dangerous if shipped.
9. KYC: no provider credentials/signature docs, no retry UX; `verification_status` rarely flips in practice without manual webhook.

## MEDIUM — feature incomplete
10. Ride completion has no explicit user action; completion/CO₂/reward accrual not wired client-side.
11. Route matching/“exact twin” relies on a public OSRM demo server with only an in-memory cache — no SLA, rate limits, or persistent cache.
12. SOS background location on Android can be killed by battery savers; no watchdog.
13. No tests run in CI for the app (pytest.ini targets scripts that hit a live Supabase project; no Jest/E2E runner wired in package.json scripts).
14. `LogBox.ignoreAllLogs(true)` masks real warnings; `.env` committed presence suggests secret hygiene needs a check.

## LOW — polish/non-critical
15. `openapi.json` is an empty leftover; `backend/server.py` should be removed or clearly marked deprecated.
16. Mock layer (`src/mock/data.ts`) is emptied but still imported by `rideService` — dead code to prune.
17. `InteractiveMap.web.tsx` is a placeholder view; web map UX is limited.
18. PRD backlog items (skeleton loaders, reanimated transitions, share-sheet deep links) still pending.

---

# Bottom line
- The product path (Expo client → Supabase Postgres/RPC → Edge Functions → Razorpay/Firebase/Mapbox/OSRM) is implemented end-to-end and mostly real — the PRD's mock-only phase has been replaced by live services.
- The most fragile points are environment/config (Supabase keys, Firebase config, Razorpay/SOS secrets), the client-only plan/access state, and the lack of push/realtime.
- `backend/server.py`/Mongo is a dead scaffold: do not build on it.
