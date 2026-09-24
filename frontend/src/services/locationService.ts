import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type LocationQuality = 'excellent' | 'acceptable' | 'weak' | 'poor' | 'unknown';
export type LocationSource = 'gps' | 'network' | 'native';

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp?: number;
};

export type LocationFix = LocationCoordinates & {
  accuracy: number | null;
  timestamp: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  source: LocationSource;
  isApproximate: boolean;
  quality: LocationQuality;
};

export type CurrentLocation = LocationFix & {
  /** Human-readable address; coordinates remain the source of truth. */
  label: string;
  address: string;
};

export type LocationSuggestion = {
  id: string;
  name: string;
  detail: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  coordinates: LocationCoordinates;
};

export type LocationPermissionState = {
  granted: boolean;
  status: 'granted' | 'denied' | 'undetermined';
  approximate: boolean;
  canAskAgain: boolean;
};

export type LocationAcquisitionOptions = {
  timeoutMs?: number;
  minimumReadings?: number;
  minimumWaitMs?: number;
  singleReadingFallbackMs?: number;
  maxReadingAgeMs?: number;
  maxJumpMeters?: number;
  maxJumpWindowMs?: number;
  allowWeakAccuracy?: boolean;
};

export type CurrentLocationErrorCode =
  | 'services-disabled'
  | 'permission-denied'
  | 'approximate'
  | 'gps-unavailable'
  | 'low-accuracy'
  | 'unavailable'
  | 'timeout';

type NominatimPlace = {
  place_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
};

/** Accuracy bands can be tuned for a different pickup/matching policy. */
export const LOCATION_ACCURACY_THRESHOLDS = {
  excellentMeters: 20,
  acceptableMeters: 50,
  weakMeters: 100,
} as const;

export const LOCATION_ACQUISITION_DEFAULTS = {
  timeoutMs: 15_000,
  minimumReadings: 2,
  minimumWaitMs: 1_500,
  singleReadingFallbackMs: 5_000,
  maxReadingAgeMs: 30_000,
  maxJumpMeters: 500,
  maxJumpWindowMs: 5_000,
  allowWeakAccuracy: false,
} as const;

export class CurrentLocationError extends Error {
  constructor(
    public readonly code: CurrentLocationErrorCode,
    message: string,
    public readonly bestAccuracy?: number | null,
    public readonly bestLocation?: LocationCoordinates
  ) {
    super(message);
    this.name = 'CurrentLocationError';
  }
}

function devLog(message: string, details?: Record<string, unknown>) {
  if (__DEV__) {
    console.debug(`[location] ${message}`, details ?? '');
  }
}

function resolveOptions(options: LocationAcquisitionOptions = {}) {
  return {
    timeoutMs: options.timeoutMs ?? LOCATION_ACQUISITION_DEFAULTS.timeoutMs,
    minimumReadings: options.minimumReadings ?? LOCATION_ACQUISITION_DEFAULTS.minimumReadings,
    minimumWaitMs: options.minimumWaitMs ?? LOCATION_ACQUISITION_DEFAULTS.minimumWaitMs,
    singleReadingFallbackMs:
      options.singleReadingFallbackMs ?? LOCATION_ACQUISITION_DEFAULTS.singleReadingFallbackMs,
    maxReadingAgeMs:
      options.maxReadingAgeMs ?? LOCATION_ACQUISITION_DEFAULTS.maxReadingAgeMs,
    maxJumpMeters: options.maxJumpMeters ?? LOCATION_ACQUISITION_DEFAULTS.maxJumpMeters,
    maxJumpWindowMs:
      options.maxJumpWindowMs ?? LOCATION_ACQUISITION_DEFAULTS.maxJumpWindowMs,
    allowWeakAccuracy:
      options.allowWeakAccuracy ?? LOCATION_ACQUISITION_DEFAULTS.allowWeakAccuracy,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('LOCATION_REQUEST_TIMEOUT'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function uniqueParts(parts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();

  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatAddress(address: Location.LocationGeocodedAddress): string {
  const locality = uniqueParts([
    address.name,
    address.street,
    address.city,
    address.region,
    address.country,
  ]);

  return locality.slice(0, 3).join(', ');
}

async function getAddressLabel(latitude: number, longitude: number): Promise<string> {
  try {
    const [address] = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      5_000
    );
    if (!address) return '';
    return formatAddress(address);
  } catch {
    // Reverse geocoding is not available on every platform (notably web).
    return '';
  }
}

function toPermissionState(permission: Location.LocationPermissionResponse): LocationPermissionState {
  return {
    granted: permission.status === 'granted',
    status: permission.status as LocationPermissionState['status'],
    approximate: permission.android?.accuracy === 'coarse',
    canAskAgain: permission.canAskAgain !== false,
  };
}

export async function getLocationPermission(): Promise<LocationPermissionState> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    const state = toPermissionState(permission);
    devLog(`Location permission: ${state.status}`);
    return state;
  } catch (error) {
    if (Platform.OS === 'web') {
      // Some browsers do not implement the Permissions API. The browser
      // geolocation prompt will be handled by the position request itself.
      return { granted: false, status: 'undetermined', approximate: false, canAskAgain: true };
    }
    throw error;
  }
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const existing = await getLocationPermission();
  if (existing.granted) return existing;

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    const state = toPermissionState(permission);
    devLog(`Location permission after request: ${state.status}`);
    return state;
  } catch (error) {
    if (Platform.OS === 'web') {
      return { granted: true, status: 'granted', approximate: false, canAskAgain: true };
    }
    throw error;
  }
}

async function getProviderStatus(): Promise<Location.LocationProviderStatus | null> {
  try {
    return await Location.getProviderStatusAsync();
  } catch (error) {
    devLog('Provider status unavailable', { error: String(error) });
    return null;
  }
}

function toLocationFix(
  position: Location.LocationObject,
  permission: LocationPermissionState,
  providerStatus: Location.LocationProviderStatus | null
): LocationFix {
  const { coords, timestamp } = position;
  const quality = getLocationQuality(coords.accuracy);
  const source: LocationSource =
    providerStatus?.gpsAvailable === true
      ? 'gps'
      : providerStatus?.networkAvailable === true
        ? 'network'
        : 'native';

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    timestamp,
    altitude: coords.altitude,
    speed: coords.speed,
    heading: coords.heading,
    source,
    isApproximate: permission.approximate,
    quality,
  };
}

export function getLocationQuality(accuracy: number | null | undefined): LocationQuality {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0) return 'unknown';
  if (accuracy <= LOCATION_ACCURACY_THRESHOLDS.excellentMeters) return 'excellent';
  if (accuracy <= LOCATION_ACCURACY_THRESHOLDS.acceptableMeters) return 'acceptable';
  if (accuracy <= LOCATION_ACCURACY_THRESHOLDS.weakMeters) return 'weak';
  return 'poor';
}

function getReadingRejectionReason(
  fix: LocationFix,
  maxReadingAgeMs: number,
  now = Date.now()
): string | null {
  if (!Number.isFinite(fix.latitude) || fix.latitude < -90 || fix.latitude > 90) {
    return 'invalid_latitude';
  }
  if (!Number.isFinite(fix.longitude) || fix.longitude < -180 || fix.longitude > 180) {
    return 'invalid_longitude';
  }
  if (fix.accuracy != null && (!Number.isFinite(fix.accuracy) || fix.accuracy <= 0)) {
    return 'invalid_accuracy';
  }
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return 'invalid_timestamp';

  const age = now - fix.timestamp;
  if (age < -10_000) return 'future_timestamp';
  if (age > maxReadingAgeMs) return 'stale_timestamp';
  return null;
}

function distanceInMeters(a: LocationCoordinates, b: LocationCoordinates): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180;
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180;
  const latitude1 = (a.latitude * Math.PI) / 180;
  const latitude2 = (b.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitude1) * Math.cos(latitude2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isImplausibleJump(
  previous: LocationFix,
  current: LocationFix,
  maxJumpMeters: number,
  maxJumpWindowMs: number
): boolean {
  const elapsed = Math.abs(current.timestamp - previous.timestamp);
  if (elapsed > maxJumpWindowMs) return false;
  return distanceInMeters(previous, current) > maxJumpMeters;
}

const qualityRank: Record<LocationQuality, number> = {
  excellent: 4,
  acceptable: 3,
  weak: 2,
  poor: 1,
  unknown: 0,
};

function isBetterFix(candidate: LocationFix, currentBest: LocationFix | null): boolean {
  if (!currentBest) return true;
  if (qualityRank[candidate.quality] !== qualityRank[currentBest.quality]) {
    return qualityRank[candidate.quality] > qualityRank[currentBest.quality];
  }
  return candidate.timestamp > currentBest.timestamp;
}

function isReliable(fix: LocationFix): boolean {
  return fix.quality === 'excellent' || fix.quality === 'acceptable';
}

function toLocationCoordinates(fix: LocationFix): LocationCoordinates {
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    timestamp: fix.timestamp,
  };
}

function collectBestFix(
  permission: LocationPermissionState,
  providerStatus: Location.LocationProviderStatus | null,
  options: LocationAcquisitionOptions
): Promise<LocationFix> {
  const config = resolveOptions(options);
  const startedAt = Date.now();
  const locationOptions: Location.LocationOptions = {
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
    timeInterval: 750,
    distanceInterval: 0,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let watchReady = false;
    let subscription: Location.LocationSubscription | null = null;
    let best: LocationFix | null = null;
    let previous: LocationFix | null = null;
    let sampleCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          devLog('Error removing subscription', { error: String(e) });
        }
      }
    };

    const finish = (fix: LocationFix) => {
      if (settled) return;
      settled = true;
      cleanup();
      devLog('Accepted GPS reading', {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        timestamp: fix.timestamp,
        source: fix.source,
        quality: fix.quality,
        samples: sampleCount,
      });
      resolve(fix);
    };

    const fail = (error: CurrentLocationError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const addReading = (position: Location.LocationObject) => {
      if (settled) return;
      const fix = toLocationFix(position, permission, providerStatus);
      const rejectionReason = getReadingRejectionReason(fix, config.maxReadingAgeMs);

      if (rejectionReason) {
        devLog('Rejected location reading', {
          accuracy: fix.accuracy,
          timestamp: fix.timestamp,
          reason: rejectionReason,
        });
        return;
      }

      if (position.mocked === true) {
        devLog('Rejected location reading', { reason: 'mocked_location' });
        return;
      }

      if (previous && isImplausibleJump(previous, fix, config.maxJumpMeters, config.maxJumpWindowMs)) {
        devLog('Rejected location reading', {
          accuracy: fix.accuracy,
          reason: 'implausible_jump',
          jumpMeters: distanceInMeters(previous, fix),
        });
        return;
      }

      previous = fix;
      sampleCount += 1;
      if (isBetterFix(fix, best)) best = fix;

      const elapsed = Date.now() - startedAt;
      const enoughSamples = sampleCount >= config.minimumReadings;
      const oneGoodReadingAfterWait =
        sampleCount >= 1 && elapsed >= config.singleReadingFallbackMs && isReliable(fix);
      const usableWeakReading =
        config.allowWeakAccuracy && enoughSamples && fix.quality === 'weak';

      if (best && isReliable(best) && ((enoughSamples && elapsed >= config.minimumWaitMs) || oneGoodReadingAfterWait)) {
        finish(best);
      } else if (best && usableWeakReading) {
        finish(best);
      }
    };

    const onLocationError = (error: unknown) => {
      devLog('Location provider error', { error: String(error) });
    };

    // Start a one-shot high-accuracy request and a short foreground watch. The
    // watch is always removed before this promise settles.
    withTimeout(Location.getCurrentPositionAsync(locationOptions), config.timeoutMs)
      .then(addReading)
      .catch(onLocationError);

    Location.watchPositionAsync(locationOptions, addReading, onLocationError)
      .then((nextSubscription) => {
        if (settled) {
          try {
            nextSubscription.remove();
          } catch (e) {
            devLog('Error removing subscription', { error: String(e) });
          }
        } else {
          subscription = nextSubscription;
          watchReady = true;
        }
      })
      .catch(onLocationError);

    poll = setInterval(() => {
      if (settled || !best) return;
      const elapsed = Date.now() - startedAt;
      const enoughSamples = sampleCount >= config.minimumReadings;
      const oneGoodReadingAfterWait =
        sampleCount >= 1 && elapsed >= config.singleReadingFallbackMs && !watchReady && isReliable(best);

      if (isReliable(best) && ((enoughSamples && elapsed >= config.minimumWaitMs) || oneGoodReadingAfterWait)) {
        finish(best);
      }
    }, 250);

    timer = setTimeout(() => {
      if (best && config.allowWeakAccuracy && best.quality === 'weak') {
        finish(best);
        return;
      }

      if (best) {
        const bestAccuracy = best.accuracy;
        const accuracyText =
          bestAccuracy == null
            ? 'currently unavailable'
            : `currently about ${Math.round(bestAccuracy)}m`;
        devLog('Rejected location: insufficient_accuracy', {
          accuracy: bestAccuracy,
          reason: 'insufficient_accuracy',
        });
        fail(
          new CurrentLocationError(
            'low-accuracy',
            `Your location accuracy is ${accuracyText}. Move outdoors or enable Precise Location in Settings.`,
            bestAccuracy,
            toLocationCoordinates(best)
          )
        );
      } else {
        devLog('Rejected location: no_fresh_reading', {
          reason: 'no_fresh_reading',
          watchReady,
        });
        fail(
          new CurrentLocationError(
            'timeout',
            'Getting a precise location took too long. Move outdoors and try again.'
          )
        );
      }
    }, config.timeoutMs);
  });
}

/** Searches OpenStreetMap/Nominatim for places matching a typed query. */
const locationSearchCache = new Map<string, LocationSuggestion[]>();

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  const cacheKey = normalizedQuery.toLowerCase();
  const cached = locationSearchCache.get(cacheKey);
  if (cached) return cached;

  const params = [
    'format=jsonv2',
    'addressdetails=1',
    'namedetails=1',
    'accept-language=en',
    'limit=6',
    `q=${encodeURIComponent(normalizedQuery)}`,
  ].join('&');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let places: NominatimPlace[];
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error(`Location search failed with status ${response.status}`);
    }

    places = (await response.json()) as NominatimPlace[];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  const results = places.flatMap((place, index) => {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    const fullAddress = place.display_name?.trim();

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !fullAddress) {
      return [];
    }

    const parts = fullAddress.split(',').map((part) => part.trim());
    const name =
      place.name?.trim() ||
      place.address?.neighbourhood?.trim() ||
      place.address?.suburb?.trim() ||
      place.address?.city?.trim() ||
      place.address?.town?.trim() ||
      place.address?.village?.trim() ||
      parts[0] ||
      'Selected location';
    const addressDetails = uniqueParts([
      place.address?.road,
      place.address?.city || place.address?.town || place.address?.village,
      place.address?.state,
    ]);
    const detail =
      addressDetails.slice(0, 2).join(', ') ||
      parts.filter((part) => part !== name).slice(0, 2).join(', ');

    return [{
      id: String(place.place_id ?? `${latitude}-${longitude}-${index}`),
      name,
      detail,
      fullAddress,
      latitude,
      longitude,
      coordinates: { latitude, longitude },
    }];
  });
  locationSearchCache.set(cacheKey, results);
  return results;
}

const reverseGeocodeCache = new Map<string, LocationSuggestion>();

/** Resolves map coordinates to a real OpenStreetMap/Nominatim address. */
export async function reverseGeocodeLocation(
  coordinates: LocationCoordinates,
  signal?: AbortSignal
): Promise<LocationSuggestion> {
  if (
    !Number.isFinite(coordinates.latitude) ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new Error('Invalid map coordinates');
  }

  const cacheKey = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const params = [
    'format=jsonv2',
    'addressdetails=1',
    'namedetails=1',
    'accept-language=en',
    `lat=${coordinates.latitude}`,
    `lon=${coordinates.longitude}`,
    'zoom=18',
  ].join('&');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    });
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed with status ${response.status}`);
    }

    const place = (await response.json()) as NominatimPlace;
    const fullAddress = place.display_name?.trim();
    if (!fullAddress) throw new Error('No address found for these coordinates');

    const parts = fullAddress.split(',').map((part) => part.trim());
    const name =
      place.name?.trim() ||
      place.address?.neighbourhood?.trim() ||
      place.address?.suburb?.trim() ||
      place.address?.city?.trim() ||
      place.address?.town?.trim() ||
      place.address?.village?.trim() ||
      parts[0] ||
      'Selected location';
    const detail = uniqueParts([
      place.address?.road,
      place.address?.city || place.address?.town || place.address?.village,
      place.address?.state,
    ]).slice(0, 2).join(', ');

    const result: LocationSuggestion = {
      id: String(place.place_id ?? `reverse-${cacheKey}`),
      name,
      detail,
      fullAddress,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      coordinates: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    };
    reverseGeocodeCache.set(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Gets a validated, fresh, high-accuracy fix and reverse-geocodes it.
 * The returned coordinates are the source of truth; the address is only text.
 */
export async function getCurrentLocation(
  options: LocationAcquisitionOptions = {}
): Promise<CurrentLocation> {
  const permission = await requestLocationPermission();
  if (!permission.granted) {
    throw new CurrentLocationError(
      'permission-denied',
      'Location permission is required to use your current location.'
    );
  }
  if (permission.approximate) {
    throw new CurrentLocationError(
      'approximate',
      'Precise Location is off. Enable Precise Location in Settings for accurate pickup matching.'
    );
  }

  const providerStatus = await getProviderStatus();
  if (providerStatus) {
    devLog('GPS enabled', {
      locationServicesEnabled: providerStatus.locationServicesEnabled,
      gpsAvailable: providerStatus.gpsAvailable,
      networkAvailable: providerStatus.networkAvailable,
    });
  }
  if (providerStatus && !providerStatus.locationServicesEnabled) {
    throw new CurrentLocationError(
      'services-disabled',
      'Turn on device location services to use your current location.'
    );
  }
  if (Platform.OS === 'android' && providerStatus?.gpsAvailable === false) {
    throw new CurrentLocationError(
      'gps-unavailable',
      'GPS is unavailable on this device. Enable GPS and try again.'
    );
  }

  const fix = await collectBestFix(permission, providerStatus, options);
  const address = await getAddressLabel(fix.latitude, fix.longitude);
  const label = address || `Current location (${fix.latitude.toFixed(4)}, ${fix.longitude.toFixed(4)})`;

  return {
    ...fix,
    label,
    address,
  };
}

export function getLocationErrorMessage(error: unknown): string {
  if (error instanceof CurrentLocationError) return error.message;
  return 'Could not fetch your current location. Please try again.';
}
