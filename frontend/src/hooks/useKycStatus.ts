import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabaseFunctions } from '@/src/lib/supabase';
import {
  POLL_DEFAULTS,
  createPollState,
  markFiring,
  markSettled,
  resolveStopReason,
  shouldPoll,
  stopPolling,
  type KycDisplayStatus,
  type PollConfig,
} from '@/src/lib/kycPolling';

/**
 * Polls the server for authoritative verification status.
 *
 * Everything about when to stop lives in `kycPolling`, which is unit tested. This
 * hook only supplies a clock, performs the request, and guarantees cleanup:
 *
 *   * no two requests overlap (guarded by inFlightSince)
 *   * the interval timer is always cleared on unmount
 *   * polling pauses when the app backgrounds, so a rider who switches apps is
 *     not burning requests from a suspended JS runtime
 *   * an in-flight response after unmount is discarded rather than setState'd
 */

export interface KycStatusSnapshot {
  status: KycDisplayStatus;
  documents: readonly { type: string; status: string }[];
}

export interface UseKycStatus {
  status: KycDisplayStatus | null;
  documents: readonly { type: string; status: string }[];
  polling: boolean;
  error: boolean;
  /** True once polling gave up, so the screen can offer an explicit retry. */
  exhausted: boolean;
  /** Fetches once, immediately, without starting the poll loop. */
  refresh: () => Promise<void>;
  /** Runs the bounded loop until a terminal status, a timeout, or repeated errors. */
  start: () => void;
  stop: () => void;
}

const TERMINAL: KycDisplayStatus[] = ['verified', 'not_verified'];

function isTerminalStatus(value: KycDisplayStatus | null): boolean {
  return value !== null && TERMINAL.includes(value);
}

export function useKycStatus(config: PollConfig = POLL_DEFAULTS): UseKycStatus {
  const [state, setState] = useState(() => createPollState());
  const [error, setError] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const lastFiredAtRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async (): Promise<KycDisplayStatus | null> => {
    setError(false);
    try {
      const { data, error: fnError } = await supabaseFunctions.functions.invoke('kyc-status', {
        body: {},
      });
      if (!mountedRef.current) return null;
      if (fnError || !data?.status) {
        setState((s) => markSettled(s, Date.now(), { error: true }));
        return null;
      }
      const status = data.status as KycDisplayStatus;
      setState((s) => markSettled(s, Date.now(), { status, documents: data.documents ?? [] }));
      return status;
    } catch {
      if (mountedRef.current) {
        setState((s) => markSettled(s, Date.now(), { error: true }));
      }
      return null;
    }
  }, []);

  const tick = useCallback(() => {
    const now = Date.now();
    const current = stateRef.current;

    if (
      !shouldPoll({ state: current, now, lastFiredAt: lastFiredAtRef.current, config })
    ) {
      const reason = resolveStopReason(current, now, config);
      if (reason) {
        setExhausted(true);
        runningRef.current = false;
      }
      return;
    }

    lastFiredAtRef.current = now;
    setState((s) => markFiring(s, now));
    void fetchStatus();
  }, [config, fetchStatus]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setExhausted(false);
    setState(createPollState());
    lastFiredAtRef.current = null;
    tick();
  }, [tick]);

  const stop = useCallback(() => {
    runningRef.current = false;
    clearTimer();
    setState((s) => stopPolling(s, 'cancelled'));
  }, [clearTimer]);

  const refresh = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  // Drive the interval while running.
  useEffect(() => {
    if (!runningRef.current) return;
    timerRef.current = setTimeout(tick, config.intervalMs);
    return clearTimer;
  }, [tick, state.attempts, config.intervalMs, clearTimer]);

  // Pause on background, resume in the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (runningRef.current && !isTerminalStatus(stateRef.current.status)) {
          lastFiredAtRef.current = null; // ask straight away on return
          tick();
        }
      } else {
        clearTimer();
      }
    });
    return () => sub.remove();
  }, [tick, clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runningRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    status: state.status,
    documents: state.documents,
    polling: runningRef.current && !isTerminalStatus(state.status) && !state.stopReason,
    error,
    exhausted,
    refresh,
    start,
    stop,
  };
}