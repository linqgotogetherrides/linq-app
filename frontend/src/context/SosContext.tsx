import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useApp } from '@/src/context/AppContext';
import { getCurrentLocation } from '@/src/services/locationService';
import { sosApi, SosApiError } from '@/src/services/sos/sosApi';
import {
  clearSosSession,
  writeSosSession,
  type SosTrackingSession,
} from '@/src/services/sos/sosSession';
import {
  pushNow,
  startTracking,
  stopTracking,
  subscribeToTracking,
  type TrackingState,
} from '@/src/services/sos/sosTracker';
import {
  detectEvidenceCapabilities,
  runEvidenceCycle,
  type EvidenceCycleResult,
} from '@/src/services/sos/sosEvidence';
import { SOS_EVIDENCE_CYCLE_MS } from '@/src/services/sos/types';
import type {
  SosCoordinate,
  SosContactAlert,
  SosDispatchStatus,
  SosEmergencyContact,
  SosEvidenceCapabilities,
  SosIncident,
} from '@/src/services/sos/types';

// Registers the background location task at module scope, which Expo requires.
// On a real device build this is what keeps location flowing while the app is
// suspended. It is a no-op on web.
import '@/src/services/sos/backgroundLocationTask';

type SosContextValue = {
  incident: SosIncident | null;
  isActive: boolean;
  isBusy: boolean;
  error: string | null;
  contacts: SosEmergencyContact[];
  dispatchStatus: SosDispatchStatus | null;
  capabilities: SosEvidenceCapabilities | null;
  tracking: TrackingState;
  lastCycle: EvidenceCycleResult | null;
  nextCycleAt: string | null;
  currentRideId: string | null;
  setCurrentRideId: (rideId: string | null) => void;
  activate: (options?: { coordinate?: SosCoordinate | null }) => Promise<boolean>;
  end: (options: { status: 'RESOLVED' | 'CANCELLED'; reason?: string }) => Promise<boolean>;
  refresh: () => Promise<void>;
  runEvidenceCycleNow: () => Promise<EvidenceCycleResult | null>;
};

const SosContext = createContext<SosContextValue | null>(null);

export function SosProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const userId = user?.id ?? null;

  const [incident, setIncident] = useState<SosIncident | null>(null);
  const [contacts, setContacts] = useState<SosEmergencyContact[]>([]);
  const [dispatchStatus, setDispatchStatus] = useState<SosDispatchStatus | null>(null);
  const [capabilities, setCapabilities] = useState<SosEvidenceCapabilities | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingState>({
    isTracking: false,
    backgroundActive: false,
    appIsForeground: true,
    lastPushAt: null,
    lastError: null,
  });
  const [lastCycle, setLastCycle] = useState<EvidenceCycleResult | null>(null);
  const [nextCycleAt, setNextCycleAt] = useState<string | null>(null);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);

  const cycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appIsForeground = useRef(AppState.currentState === 'active');

  useEffect(() => subscribeToTracking(setTracking), []);

  // ---------------------------------------------------------------------
  // Cold start / foreground resume.
  // `sosApi.status` only READS. It never opens a new incident, so calling it
  // on every resume can never accidentally raise a false emergency.
  // ---------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!userId) {
      setIncident(null);
      setContacts([]);
      await clearSosSession();
      return;
    }

    try {
      const payload = await sosApi.status(userId);

      setContacts(payload.contacts ?? []);
      setDispatchStatus(payload.dispatch_status ?? null);

      if (!payload.incident) {
        setIncident(null);
        await clearSosSession();
        await stopTracking();
        return;
      }

      setIncident(payload.incident);

      if (payload.incident.status === 'ACTIVE' && payload.tracking_token) {
        const detected = await detectEvidenceCapabilities();
        setCapabilities(detected);

        const started = await startTracking(
          { userId, sosId: payload.incident.id, trackingToken: payload.tracking_token },
          detected,
        );
        setCapabilities({ ...detected, background_location: started.background });

        await writeSosSession({
          sosId: payload.incident.id,
          referenceCode: payload.incident.reference_code,
          userId,
          trackingToken: payload.tracking_token,
          activatedAt: payload.incident.activated_at,
          status: 'ACTIVE',
          contactsNotified: payload.incident.contacts_notified,
          contactsTotal: payload.incident.contacts_total,
          backgroundLocationActive: started.background,
          currentRideId: payload.incident.current_ride_id,
        } satisfies SosTrackingSession);
      } else {
        // The incident ended on another device or while the app was closed.
        await clearSosSession();
        await stopTracking();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check SOS status');
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      appIsForeground.current = state === 'active';
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // ---------------------------------------------------------------------
  // Evidence cycle scheduler.
  // The timer only runs while an incident is ACTIVE. When the app is
  // backgrounded the cycle still fires, but records SKIPPED_UNAVAILABLE rows
  // rather than pretending a capture happened (see sosEvidence.ts).
  // ---------------------------------------------------------------------
  const isActive = incident?.status === 'ACTIVE';

  useEffect(() => {
    if (!isActive || !userId || !incident) {
      if (cycleTimer.current) {
        clearTimeout(cycleTimer.current);
        cycleTimer.current = null;
      }
      setNextCycleAt(null);
      return;
    }

    const sosId = incident.id;

    const schedule = () => {
      if (cycleTimer.current) clearTimeout(cycleTimer.current);
      setNextCycleAt(new Date(Date.now() + SOS_EVIDENCE_CYCLE_MS).toISOString());
      cycleTimer.current = setTimeout(async () => {
        const result = await runEvidenceCycle({
          userId,
          sosId,
          appIsForeground: appIsForeground.current,
        });
        setLastCycle(result);
        schedule();
      }, SOS_EVIDENCE_CYCLE_MS);
    };

    schedule();

    return () => {
      if (cycleTimer.current) clearTimeout(cycleTimer.current);
      cycleTimer.current = null;
    };
  }, [incident, isActive, userId]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  const activate = useCallback(
    async (options: { coordinate?: SosCoordinate | null } = {}) => {
      if (!userId) {
        setError('Sign in before activating SOS.');
        return false;
      }

      setIsBusy(true);
      setError(null);

      try {
        const coordinate =
          options.coordinate ?? (await getCurrentLocation({ allowWeakAccuracy: true }));

        const detected = await detectEvidenceCapabilities();
        setCapabilities(detected);

        const result = await sosApi.activate({
          userId,
          coordinate: {
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            accuracy: coordinate.accuracy ?? null,
            altitude: coordinate.altitude ?? null,
            speed: coordinate.speed ?? null,
            heading: coordinate.heading ?? null,
          },
          currentRideId,
          capabilities: detected,
        });

        setIncident(result.incident);
        setContacts(result.contacts);
        setDispatchStatus(result.dispatch_status);

        const started = await startTracking(
          { userId, sosId: result.incident.id, trackingToken: result.tracking_token },
          detected,
        );
        setCapabilities({ ...detected, background_location: started.background });

        // Seed the trail immediately rather than waiting for the first watch tick.
        await pushNow({
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          accuracy: coordinate.accuracy ?? null,
        });

        await writeSosSession({
          sosId: result.incident.id,
          referenceCode: result.incident.reference_code,
          userId,
          trackingToken: result.tracking_token,
          activatedAt: result.incident.activated_at,
          status: 'ACTIVE',
          contactsNotified: result.incident.contacts_notified,
          contactsTotal: result.incident.contacts_total,
          backgroundLocationActive: started.background,
          currentRideId: result.incident.current_ride_id,
        } satisfies SosTrackingSession);

        return true;
      } catch (err) {
        setError(
          err instanceof SosApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'SOS could not be activated.',
        );
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [currentRideId, userId],
  );

  const end = useCallback(
    async (options: { status: 'RESOLVED' | 'CANCELLED'; reason?: string }) => {
      if (!userId || !incident) {
        setError('There is no active SOS incident to end.');
        return false;
      }

      setIsBusy(true);
      setError(null);

      try {
        const result = await sosApi.end({
          actorId: userId,
          sosId: incident.id,
          status: options.status,
          endReason: options.reason ?? null,
        });

        setIncident(result.incident);

        // Stop every tracking channel and destroy the token immediately.
        await stopTracking();
        await clearSosSession();

        if (cycleTimer.current) {
          clearTimeout(cycleTimer.current);
          cycleTimer.current = null;
        }
        setNextCycleAt(null);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'SOS could not be ended.');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [incident, userId],
  );

  const runEvidenceCycleNow = useCallback(async () => {
    if (!userId || !isActive || !incident) return null;
    const result = await runEvidenceCycle({
      userId,
      sosId: incident.id,
      appIsForeground: true,
    });
    setLastCycle(result);
    return result;
  }, [incident, isActive, userId]);

  const value = useMemo<SosContextValue>(
    () => ({
      incident,
      isActive,
      isBusy,
      error,
      contacts,
      dispatchStatus,
      capabilities,
      tracking,
      lastCycle,
      nextCycleAt,
      currentRideId,
      setCurrentRideId,
      activate,
      end,
      refresh,
      runEvidenceCycleNow,
    }),
    [
      activate,
      capabilities,
      contacts,
      currentRideId,
      dispatchStatus,
      end,
      error,
      incident,
      isActive,
      isBusy,
      lastCycle,
      nextCycleAt,
      refresh,
      runEvidenceCycleNow,
      tracking,
    ],
  );

  return <SosContext.Provider value={value}>{children}</SosContext.Provider>;
}

export function useSos(): SosContextValue {
  const context = useContext(SosContext);
  if (!context) throw new Error('useSos must be used inside <SosProvider>');
  return context;
}

export type { SosContactAlert };
