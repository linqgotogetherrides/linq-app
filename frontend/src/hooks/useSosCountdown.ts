import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

// The SOS starts automatically after this short, cancellable countdown.
// Ten seconds is long enough to undo an accidental tap and short enough that
// the emergency flow begins without the rider having to hold anything.
export const SOS_COUNTDOWN_MS = 10_000;

type UseSosCountdownOptions = {
  enabled: boolean;
  durationMs?: number;
  onComplete: () => void;
};

/**
 * Deadline-based SOS countdown.
 *
 * A plain decrementing counter drifts and, more importantly, freezes while the
 * app is backgrounded. Storing the absolute deadline means the correct state is
 * recoverable when the app comes back: if the deadline already passed, the SOS
 * starts immediately. The completion callback is guarded so it can only run
 * once, even if the interval and AppState listener race.
 *
 * The countdown starts on mount and fires the evidence/WhatsApp pipeline
 * automatically when it reaches zero. No press-and-hold is involved anywhere in
 * this path.
 */
export function useSosCountdown({
  enabled,
  durationMs = SOS_COUNTDOWN_MS,
  onComplete,
}: UseSosCountdownOptions) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [active, setActive] = useState(false);

  const deadlineRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const cancelledRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const complete = useCallback(() => {
    if (cancelledRef.current || completedRef.current) return;
    completedRef.current = true;
    deadlineRef.current = null;
    setRemainingMs(0);
    setActive(false);
    onCompleteRef.current();
  }, []);

  const tick = useCallback(() => {
    const deadline = deadlineRef.current;
    if (deadline == null) return;

    const remaining = Math.max(0, deadline - Date.now());
    setRemainingMs(remaining);
    // Do not open the camera / WhatsApp from the background. If the deadline
    // passes while backgrounded, the AppState listener calls tick() again on
    // resume and starts the flow then.
    if (remaining <= 0 && AppState.currentState === 'active') complete();
  }, [complete]);

  useEffect(() => {
    if (!enabled) return undefined;

    cancelledRef.current = false;
    completedRef.current = false;
    deadlineRef.current = Date.now() + durationMs;
    setRemainingMs(durationMs);
    setActive(true);

    const interval = setInterval(tick, 250);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [durationMs, enabled, tick]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    completedRef.current = true;
    deadlineRef.current = null;
    setActive(false);
  }, []);

  const startNow = useCallback(() => {
    if (cancelledRef.current || completedRef.current) return;
    complete();
  }, [complete]);

  return {
    active,
    remainingMs,
    seconds: Math.ceil(remainingMs / 1000),
    progress: durationMs > 0 ? remainingMs / durationMs : 0,
    cancel,
    startNow,
  };
}
