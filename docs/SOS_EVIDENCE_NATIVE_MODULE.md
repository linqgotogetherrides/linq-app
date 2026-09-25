# SOS Evidence — Required Native Module

## Why this document exists

The SOS specification asks LinQ to capture **3 photos and 1 audio clip every 10
minutes while an SOS is ACTIVE**, including while the app is in the background.

**This is not achievable with ordinary Expo / React Native.** This document
states exactly why, and specifies the native work required to close the gap. The
shipped app does **not** pretend to do this: when a background cycle runs it
writes `SKIPPED_UNAVAILABLE` rows into `sos_evidence` with the reason, and the
admin dashboard shows those rows as unavailable rather than hiding them.

## What already works for real

| Capability | Status | Mechanism |
|---|---|---|
| Live location while app is open | **Working** | `expo-location` foreground watch → `sos-location` Edge Function |
| Live location while app is closed | **Working** | `expo-location` background task + OS background location entitlement |
| Photo evidence while app is open | **Working** | `expo-camera` `CameraView` + signed upload |
| Audio evidence while app is open | **Working** | `expo-audio` `AudioRecorder` + signed upload |
| Private evidence storage | **Working** | private `sos-evidence` bucket, signed URLs only |
| Admin evidence viewer | **Working** | `/admin/sos/[id]` Photos / Audio / Location tabs |

## What cannot work without native code

### iOS

* **Camera while backgrounded — impossible.** iOS has no API for it. The only
  background camera access in the App Store is a narrow VoIP/CallKit extension,
  which a ride-sharing app cannot legitimately claim. Attempting it risks
  App Store rejection.
* **Microphone while backgrounded — not permitted for this app type.** Apps may
  record audio in the background only for genuine continuous-audio use cases
  (music, voice chat, transcription of live content). Enabling
  `UIBackgroundModes: audio` for a safety feature is a rejection risk, so
  `enableBackgroundRecording` is deliberately left `false` in `app.json`.

### Android

* **Camera while backgrounded — requires a foreground service with its own
  camera handling.** `expo-camera` has no background mode.
* **Microphone while backgrounded — requires `FOREGROUND_SERVICE_MICROPHONE`
  and a persistent notification.** `expo-audio` has no background mode.
* Google Play restricts both to apps whose *core* function requires them. A
  safety feature that must be justified in the Play Console declaration.

## Required native module: `linq-sos-evidence`

Implement as a local Expo Module (prebuild-compatible, so no bare workflow
needed) or as a bare native module.

### Public API

```ts
type SosEvidenceCapture = {
  sosId: string;
  trackingToken: string;
  intervalMs: number;          // 10 * 60 * 1000
  photosPerCycle: number;      // 3
  audioMs: number;             // 20_000
  // Credentials are NEVER passed in from JS.
  uploadEndpoint: string;      // https://<project>.functions/v1/sos-evidence
  apikeyHeader: string;        // public anon key
};

type SosEvidenceEvent = {
  sosId: string;
  kind: 'photo' | 'audio';
  localPath: string;
  contentType: string;
  capturedAt: string;          // ISO-8601
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  sequenceHint: number;        // server assigns the authoritative sequence
  outcome: 'captured' | 'unavailable';
  reason?: string;             // required when outcome === 'unavailable'
};

export function startBackgroundEvidence(config: SosEvidenceCapture): Promise<void>;
export function stopBackgroundEvidence(sosId: string): Promise<void>;
export function isBackgroundEvidenceRunning(): Promise<boolean>;
export function addListener(
  listener: (event: SosEvidenceEvent) => void,
): { remove(): void };
```

### Android implementation notes

1. Declare a `Service` with
   `android:foregroundServiceType="camera|microphone|location"`.
2. Start it from a `BroadcastReceiver` or `WorkManager` job scheduled with a
   10-minute periodic interval, guarded by
   `SharedPreferences` so a reboot re-arms it.
3. Use `Camera2` / `CameraX` with a `SurfaceTexture`; the app never shows a
   preview in background.
4. Use `AudioRecord` + `MediaRecorder` for the 20-second clip.
5. Show a mandatory, non-dismissable foreground notification:
   *"LinQ SOS is recording evidence."*
6. Respect `FOREGROUND_SERVICE_CAMERA` / `FOREGROUND_SERVICE_MICROPHONE`
   runtime permission gating on API 34+.
7. Upload on a `WorkManager` constrained job (`NetworkType.CONNECTED`); the
   `sos-evidence` Edge Function already mints single-file signed upload URLs, so
   the module needs no storage credentials.

### iOS implementation notes

1. **Camera: not possible.** Ship iOS with `captureMode: 'foreground'` for photos
   and `background_camera: false` in `evidence_capabilities`.
2. **Microphone: not permitted for this app category.** Ship iOS with
   `background_microphone: false`.
3. If the product later decides to attempt a CallKit/VoIP extension, that is a
   separate App Store justification and is out of scope here.

### Contract with the backend

The module must **not** talk to the database directly. It calls the existing
`sign_upload` → PUT → `record_result` flow on the `sos-evidence` Edge Function
using the HMAC tracking token, exactly like the JS path. This keeps:

* ownership + `ACTIVE`-status checks server-side,
* the private bucket private,
* the storage path convention `sos-evidence/{sos_id}/photos|audio/…`.

The module writes `capture_mode: 'background_native'`. The server accepts that
value but nothing else may write it, so `background_native` in the admin
dashboard is always a truthful signal.

## Testing this module

1. Activate an SOS, background the app, wait one cycle.
2. Assert the admin dashboard shows new rows with
   `capture_mode = background_native` and `status = UPLOADED`.
3. End the SOS and confirm the scheduled job is cancelled and the foreground
   notification is dismissed.
4. Revoke camera/mic permission in OS settings and confirm rows appear as
   `SKIPPED_UNAVAILABLE` with a reason — never as a silent success.

## What the app does today, in the meantime

`sosEvidence.ts` runs a 10-minute cycle while an incident is `ACTIVE`:

* foreground + camera mounted → real photo + audio upload;
* foreground, no camera mounted → `SKIPPED_UNAVAILABLE` with a clear reason;
* background → `SKIPPED_UNAVAILABLE` rows for all four items, with the reason
  text, and the reason is surfaced in the SOS status screen.

`app/sos/active` and `app/admin/sos/[id]` both display these rows with their
real status, so an operator can always tell what was and was not captured.
