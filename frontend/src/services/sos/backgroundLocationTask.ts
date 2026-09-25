// Background location task for an ACTIVE LinQ SOS incident.
//
// THIS IS REAL BACKGROUND WORK, NOT A PLACEHOLDER.
//   * iOS:    expo-location's background task runs while the app is suspended
//             because app.json enables isIosBackgroundLocationEnabled and the
//             UIBackgroundModes=[location] entitlement.
//   * Android: the same task is backed by a foreground service
//             (isAndroidForegroundLocationEnabled) with a persistent
//             notification, which is what the platform requires.
//
// WHAT THIS TASK DELIBERATELY DOES NOT DO
//   It does not touch the camera or the microphone. iOS forbids camera access
//   while backgrounded and Android requires a custom foreground service for
//   either. Capturing evidence in the background needs the native module
//   described in docs/SOS_EVIDENCE_NATIVE_MODULE.md. This task only reports
//   location, which the OS genuinely allows.

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { readSosSession, resolveAnonKey } from './sosSession';

export const SOS_LOCATION_TASK = 'linq-sos-background-location';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

type PushResult = {
  ok?: boolean;
  error?: string;
  code?: string;
};

/**
 * Sends one background location fix to the sos-location Edge Function.
 *
 * The HMAC tracking token is the authorisation. It is minted by the server at
 * activation time, bound to this incident and this user, and expires, so a
 * stolen anon key alone cannot inject a fake emergency trail.
 */
async function pushBackgroundFix(
  session: Awaited<ReturnType<typeof readSosSession>>,
  location: Location.LocationObject,
): Promise<PushResult | null> {
  if (!session) return null;
  if (session.status !== 'ACTIVE') return null;

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = await resolveAnonKey();
  if (!baseUrl || !anonKey) return null;

  try {
    const response = await fetch(`${baseUrl}/functions/v1/sos-location`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: session.userId,
        sos_id: session.sosId,
        tracking_token: session.trackingToken,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        altitude: location.coords.altitude ?? null,
        speed: location.coords.speed ?? null,
        heading: location.coords.heading ?? null,
        source: 'background',
        recorded_at: new Date(location.timestamp).toISOString(),
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      // 409 means the incident ended. Stop trying; the session is stale.
      if (response.status === 409) {
        await readSosSession().then((current) => {
          if (current?.sosId === session.sosId) {
            void Location.stopLocationUpdatesAsync(SOS_LOCATION_TASK);
          }
        });
      }
      return { ok: false, error: text.slice(0, 200), code: String(response.status) };
    }
    return text ? (JSON.parse(text) as PushResult) : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

TaskManager.defineTask<LocationTaskData>(SOS_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = data?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return;

  const session = await readSosSession();
  if (!session || session.status !== 'ACTIVE') {
    // Nothing to track. Tear the native task down so the OS stops waking us.
    try {
      await Location.stopLocationUpdatesAsync(SOS_LOCATION_TASK);
    } catch {
      // already stopped
    }
    return;
  }

  for (const location of locations) {
    const result = await pushBackgroundFix(session, location);
    if (result && result.ok === false && result.code === '401') {
      // Tracking token rejected (expired or revoked): stop, do not hammer.
      try {
        await Location.stopLocationUpdatesAsync(SOS_LOCATION_TASK);
      } catch {
        // already stopped
      }
      break;
    }
  }
});

/** Registers the native background task. Safe to call repeatedly. */
export async function isBackgroundLocationRegistered(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function registerBackgroundLocation(): Promise<boolean> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(SOS_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 15_000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'LinQ SOS is active',
        notificationBody: 'Sharing your live location with your emergency contacts.',
        notificationColor: '#EF4444',
      },
    });
    return true;
  } catch (error) {
    console.warn('[sos] background location registration failed:', error);
    return false;
  }
}

export async function unregisterBackgroundLocation(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(SOS_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[sos] failed to stop background location:', error);
  }
}
