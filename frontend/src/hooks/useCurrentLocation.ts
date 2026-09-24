import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  CurrentLocation,
  CurrentLocationError,
  LocationAcquisitionOptions,
  LocationPermissionState,
  getCurrentLocation,
  getLocationErrorMessage,
  getLocationPermission,
  requestLocationPermission,
} from '@/src/services/locationService';

export type CurrentLocationStatus =
  | 'idle'
  | 'requesting_permission'
  | 'locating'
  | 'located'
  | 'low_accuracy'
  | 'permission_denied'
  | 'location_services_disabled'
  | 'error';

export type CurrentLocationRequestOptions = {
  showRationale?: boolean;
  acquisition?: LocationAcquisitionOptions;
};

type UseCurrentLocationOptions = CurrentLocationRequestOptions & {
  autoLoad?: boolean;
};

export type UseCurrentLocationResult = {
  location: CurrentLocation | null;
  status: CurrentLocationStatus;
  isLoading: boolean;
  error: string | null;
  permission: LocationPermissionState | null;
  requestLocation: (options?: CurrentLocationRequestOptions) => Promise<CurrentLocation | null>;
  openSettings: () => Promise<void>;
  reset: () => void;
};

type CurrentLocationState = {
  location: CurrentLocation | null;
  status: CurrentLocationStatus;
  error: string | null;
  permission: LocationPermissionState | null;
};

const INITIAL_STATE: CurrentLocationState = {
  location: null,
  status: 'idle',
  error: null,
  permission: null,
};

function statusForError(error: unknown): CurrentLocationStatus {
  if (error instanceof CurrentLocationError) {
    if (error.code === 'permission-denied' || error.code === 'approximate') {
      return 'permission_denied';
    }
    if (error.code === 'services-disabled') return 'location_services_disabled';
    if (error.code === 'low-accuracy') return 'low_accuracy';
  }
  return 'error';
}

function askPermissionRationale(): Promise<boolean> {
  const message =
    'Linq uses your precise location to set your pickup accurately and find rides along your route. Your location is used only for this feature and is not tracked in the background.';

  if (Platform.OS === 'web') {
    const browserConfirm = (globalThis as typeof globalThis & {
      confirm?: (text: string) => boolean;
    }).confirm;
    return Promise.resolve(browserConfirm ? browserConfirm(message) : false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      'Allow Linq to use your location?',
      message,
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
        { text: 'Allow', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) }
    );
  });
}

function showSettingsPrompt(kind: 'permission' | 'services' = 'permission') {
  const servicesDisabled = kind === 'services';
  Alert.alert(
    servicesDisabled ? 'Location services are off' : 'Precise location permission needed',
    servicesDisabled
      ? 'Turn on GPS/location services for Linq in your device Settings, then try again.'
      : 'Enable Precise Location for Linq in your device Settings, then try again.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
    ],
    { cancelable: true }
  );
}

/**
 * Centralized foreground-only current-location state.
 * Acquisition is intentionally one-shot: the native watch is stopped as soon
 * as a validated fix is selected, and no background location task is started.
 */
export function useCurrentLocation(options: UseCurrentLocationOptions = {}): UseCurrentLocationResult {
  const [state, setState] = useState(INITIAL_STATE);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const autoLoadStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateState = useCallback((next: Partial<CurrentLocationState>) => {
    if (mountedRef.current) setState((current) => ({ ...current, ...next }));
  }, []);

  const requestLocation = useCallback(
    async (requestOptions: CurrentLocationRequestOptions = {}) => {
      if (requestInFlightRef.current) return null;
      requestInFlightRef.current = true;

      updateState({
        location: null,
        status: 'requesting_permission',
        error: null,
      });

      try {
        let permission = await getLocationPermission();
        updateState({ permission });

        if (!permission.granted) {
          const shouldExplain = requestOptions.showRationale ?? options.showRationale ?? true;
          if (shouldExplain) {
            const shouldRequest = await askPermissionRationale();
            if (!shouldRequest) {
              showSettingsPrompt('permission');
              updateState({ status: 'permission_denied', error: 'Location permission was not granted.' });
              return null;
            }
          }

          permission = await requestLocationPermission();
          updateState({ permission });

          if (!permission.granted) {
            if (!permission.canAskAgain) showSettingsPrompt('permission');
            updateState({
              status: 'permission_denied',
              error: 'Location permission is required to use your current location.',
            });
            return null;
          }
        }

        updateState({ status: 'locating', error: null });
        const location = await getCurrentLocation(
          requestOptions.acquisition ?? options.acquisition ?? {}
        );

        if (!mountedRef.current) return null;
        updateState({
          location,
          permission,
          status: location.quality === 'excellent' || location.quality === 'acceptable' ? 'located' : 'low_accuracy',
          error: null,
        });
        return location;
      } catch (error) {
        if (!mountedRef.current) return null;
        const message = getLocationErrorMessage(error);
        if (error instanceof CurrentLocationError) {
          if (error.code === 'permission-denied' || error.code === 'approximate') {
            showSettingsPrompt('permission');
          } else if (error.code === 'services-disabled' || error.code === 'gps-unavailable') {
            showSettingsPrompt('services');
          }
        }
        updateState({
          status: statusForError(error),
          error: message,
        });
        return null;
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [options.acquisition, options.showRationale, updateState]
  );

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  const reset = useCallback(() => {
    updateState(INITIAL_STATE);
  }, [updateState]);

  useEffect(() => {
    if (!options.autoLoad || autoLoadStartedRef.current) return;
    autoLoadStartedRef.current = true;
    void requestLocation({ showRationale: options.showRationale ?? true });
  }, [options.autoLoad, options.showRationale, requestLocation]);

  return {
    ...state,
    isLoading: state.status === 'requesting_permission' || state.status === 'locating',
    requestLocation,
    openSettings,
    reset,
  };
}
