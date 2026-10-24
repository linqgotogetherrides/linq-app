/**
 * Bounded polling rules for the verification screen.
 *
 * This is deliberately a plain state machine with no React and no timers, so the
 * behaviour that matters -- no overlapping requests, a hard timeout, stopping on
 * a terminal status, stopping on repeated errors -- is unit tested rather than
 * asserted by hand. `useKycStatus` is a thin wrapper that supplies a clock.
 */

export type KycDisplayStatus = 'not_verified' | 'pending' | 'verified';

export const POLL_DEFAULTS = {
  /** How often to ask the server while a session is unresolved. */
  intervalMs: 4000,
  /** Give up after this long. The rider is told to retry rather than left spinning. */
  timeoutMs: 120000,
  /** Backstop independent of the clock, so a stalled network cannot spin forever. */
  maxAttempts: 30,
  /** Consecutive failures tolerated before giving up. */
  maxConsecutiveErrors: 3,
} as const;

export type StopReason = 'terminal' | 'timeout' | 'max_attempts' | 'repeated_errors' | 'cancelled';

export interface PollState {
  /** Epoch ms the poll started, or null when idle. */
  startedAt: number | null;
  /** Epoch ms of the in-flight request. Guards against overlap. */
  inFlightSince: number | null;
  attempts: number;
  consecutiveErrors: number;
  status: KycDisplayStatus | null;
  documents: readonly { type: string; status: string }[];
  stopReason: StopReason | null;
}

export interface PollConfig {
  intervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
  maxConsecutiveErrors: number;
}

export function createPollState(): PollState {
  return {
    startedAt: null,
    inFlightSince: null,
    attempts: 0,
    consecutiveErrors: 0,
    status: null,
    documents: [],
    stopReason: null,
  };
}

/** A status a trusted server-side outcome has already settled. */
export function isTerminal(status: KycDisplayStatus | null): boolean {
  // 'pending' is the only unresolved state. Anything else is settled: verified,
  // or not_verified after an expired/failed session.
  return status === 'verified' || status === 'not_verified';
}

/**
 * Whether a request should be issued right now.
 *
 * `lastFiredAt` is the previous attempt; the first attempt fires immediately so
 * the rider sees fresh status without waiting out an interval.
 */
export function shouldPoll(args: {
  state: PollState;
  now: number;
  lastFiredAt: number | null;
  config: PollConfig;
}): boolean {
  const { state, now, lastFiredAt, config } = args;

  if (state.stopReason) return false;

  // Overlap guard: never have two requests outstanding.
  if (state.inFlightSince !== null) return false;

  // Nothing to wait for while a session is still unresolved.
  if (state.status !== null && isTerminal(state.status)) return false;

  if (state.startedAt !== null && now - state.startedAt > config.timeoutMs) return false;
  if (state.attempts >= config.maxAttempts) return false;
  if (state.consecutiveErrors >= config.maxConsecutiveErrors) return false;

  if (lastFiredAt === null) return true;
  return now - lastFiredAt >= config.intervalMs;
}

/** Why polling has ended, if it has. */
export function resolveStopReason(state: PollState, now: number, config: PollConfig): StopReason | null {
  if (state.stopReason) return state.stopReason;
  if (state.startedAt === null) return null;
  if (state.status !== null && isTerminal(state.status)) return 'terminal';
  if (now - state.startedAt > config.timeoutMs) return 'timeout';
  if (state.attempts >= config.maxAttempts) return 'max_attempts';
  if (state.consecutiveErrors >= config.maxConsecutiveErrors) return 'repeated_errors';
  return null;
}

/** A request has gone out. */
export function markFiring(state: PollState, now: number): PollState {
  return {
    ...state,
    startedAt: state.startedAt ?? now,
    inFlightSince: now,
    attempts: state.attempts + 1,
  };
}

/**
 * A response has arrived.
 *
 * `status` is whatever the server said. It is never derived here from anything
 * the client observed, because the client observes nothing trustworthy.
 */
export function markSettled(
  state: PollState,
  now: number,
  result: { status: KycDisplayStatus; documents?: readonly { type: string; status: string }[] } | { error: true },
): PollState {
  const base: PollState = { ...state, inFlightSince: null };

  if ('error' in result) {
    return { ...base, consecutiveErrors: state.consecutiveErrors + 1 };
  }

  return {
    ...base,
    consecutiveErrors: 0,
    status: result.status,
    documents: result.documents ?? [],
    // Settle immediately when the server has given a terminal answer, so the UI
    // does not have to wait for the next tick to notice.
    stopReason: resolveStopReason({ ...base, status: result.status }, now, POLL_DEFAULTS),
  };
}

export function stopPolling(state: PollState, reason: StopReason): PollState {
  return { ...state, stopReason: reason, inFlightSince: null };
}

/** Copy a server status onto a document the screen is rendering. */
export function statusForDocument(
  documents: readonly { type: string; status: string }[],
  docType: string,
  fallback: KycDisplayStatus,
): KycDisplayStatus {
  const match = documents.find((d) => d.type === docType);
  if (!match) return fallback;
  if (match.status === 'verified') return 'verified';
  if (match.status === 'pending') return 'pending';
  return 'not_verified';
}