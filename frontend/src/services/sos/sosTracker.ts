// Foreground + background location tracking for an ACTIVE SOS incident.
//
// Two independent channels, because they fail independently:
//   1. Background: expo-location's background task, which keeps running when the
//      app is suspended (iOS) or in the background (Android foreground service).
//   2. Foreground: a watch held here, which gives a tighter cadence while the
//      user is looking at the app and keeps working even if the OS declines
//      background permission.
//
// If background registration fails, tracking still runs in the foreground and
// the capability report records the limitation instead of hiding it.

import * as Location from 'expo-location';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { sosApi } from './sosApi';
import {
  registerBackgroundLocation,
  unregisterBackgroundLocation,
  isBackgroundLocationRegistered,
} from './backgroundLocationTask';
import type { SosCoordinate, SosEvidenceCapabilities } from './types';

type TrackingContext = {
  userId: string;
  sosId: string;
  trackingToken: string;
};

let activeContext: TrackingContext | null = null;
let foregroundSubscription: Location.LocationSubscription | null = null;
let lastPushError: string | null = null;
let lastPushAt: string | null = null;

const listeners = new Set<(state: TrackingState) => void>();

export type TrackingState = {
  isTracking: boolean;
  backgroundActive: boolean;
  appIsForeground: boolean;
  lastPushAt: string | null;
  lastError: string | null;
};

function emit(): void {
  const state = getState();
  listeners.forEach((listener) => listener(state));
}

export function getState(): TrackingState {
  return {
    isTracking: activeContext !== null,
    backgroundActive,
    appIsForeground: AppState.currentState === 'active',
    lastPushAt,
    lastError: lastPushError,
  };
}

let backgroundActive = false;
let appStateSubscription: { remove: () => void } | null = null;

export function subscribeToTracking(listener: (state: TrackingState) => void): () => void {
  listeners.add(listener);
  listener(getState());
  return () => {
    listeners.delete(listener);
  };
}

function toCoordinate(location: Location.LocationObject): SosCoordinate {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null,
    altitude: location.coords.altitude ?? null,
    speed: location.coords.speed ?? null,
    heading: location.coords.heading ?? null,
  };
}

async function push(
  coordinate: SosCoordinate,
  source: 'foreground' | 'background',
): Promise<void> {
  if (!activeContext) return;
  try {
    await sosApi.pushLocation({
      userId: activeContext.userId,
      sosId: activeContext.sosId,
      trackingToken: activeContext.trackingToken,
      coordinate,
      source,
    });
    lastPushError = null;
    lastPushAt = new Date().toISOString();
  } catch (error) {
    lastPushError = error instanceof Error ? error.message : String(error);
  }
  emit();
}

function attachAppStateListener(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    emit();
    // Re-register the native task when returning to the foreground: Android can
    // drop a foreground service after the OS reclaims memory.
    if (state === 'active' && activeContext) {
      void registerBackgroundLocation().then((ok) => {
        backgroundActive = ok;
        emit();
      });
    }
  });
}

export type StartTrackingResult = {
  foreground: boolean;
  background: boolean;
  backgroundPermissionGranted: boolean;
  notes: string[];
};

/**
 * Requests background location permission, registers the native background
 * task, and starts the foreground watch.
 */
export async function startTracking(
  context: TrackingContext,
  capabilities?: SosEvidenceCapabilities,
): Promise<StartTrackingResult> {
  const notes: string[] = [];
  activeContext = context;
  lastPushError = null;

  // --- background permission ---------------------------------------------
  let backgroundPermissionGranted = false;
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.granted) {
      const background = await Location.requestBackgroundPermissionsAsync();
      backgroundPermissionGranted = background.granted;
      if (!background.granted) {
        notes.push(
          Platform.OS === 'ios'
            ? 'Always-on location was declined. Live location will keep updating only while LinQ is open.'
            : 'Background location was declined. Live location will keep updating only while LinQ is open.',
        );
      }
    } else {
      notes.push('Location permission was declined, so live location sharing is unavailable.');
    }
  } catch (error) {
    notes.push(
      `Background location permission could not be requested: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // --- native background task -------------------------------------------
  let background = false;
  if (backgroundPermissionGranted) {
    background = await registerBackgroundLocation();
    if (!background) {
      notes.push('The OS refused to start background location updates on this device.');
    }
  }
  backgroundActive = background;

  // --- foreground watch --------------------------------------------------
  let foreground = false;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) {
      foregroundSubscription?.remove();
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 10_000,
          distanceInterval: 10,
        },
        (location) => {
          void push(toCoordinate(location), 'foreground');
        },
        (error) => {
          lastPushError = `Location watch error: ${String(error)}`;
          emit();
        },
      );
      foreground = true;
    }
  } catch (error) {
    notes.push(
      `Foreground location tracking failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (capabilities) {
    capabilities.background_location = background;
  }

  attachAppStateListener();
  emit();

  return { foreground, background, backgroundPermissionGranted, notes };
}

/** Stops every tracking channel. Called when the incident ends. */
export async function stopTracking(): Promise<void> {
  try {
    foregroundSubscription?.remove();
  } catch {
    // already removed
  }
  foregroundSubscription = null;

  await unregisterBackgroundLocation();
  backgroundActive = false;
  activeContext = null;
  lastPushError = null;

  emit();
}

/** One-off push used right after activation so the trail starts immediately. */
export async function pushNow(coordinate: SosCoordinate): Promise<void> {
  await push(coordinate, 'foreground');
}

export { isBackgroundLocationRegistered };
