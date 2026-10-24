import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  POLL_DEFAULTS,
  createPollState,
  isTerminal,
  markFiring,
  markSettled,
  resolveStopReason,
  shouldPoll,
  statusForDocument,
  stopPolling,
} from '../kycPolling.ts';

const CFG = POLL_DEFAULTS;
const T0 = 1_700_000_000_000;

/** Simulates the hook's loop for a sequence of ticks. */
function advance(state: ReturnType<typeof createPollState>, now: number) {
  const firing = markFiring(state, now);
  return { state: firing, settle: (result: Parameters<typeof markSettled>[2]) => markSettled(firing, now, result) };
}

describe('polling gates', () => {
  test('fires immediately on the first tick', () => {
    const s = createPollState();
    assert.equal(shouldPoll({ state: s, now: T0, lastFiredAt: null, config: CFG }), true);
  });

  test('does not fire again before the interval elapses', () => {
    const s = markSettled(markFiring(createPollState(), T0), T0, { status: 'pending' });
    assert.equal(shouldPoll({ state: s, now: T0 + 1000, lastFiredAt: T0, config: CFG }), false);
    assert.equal(shouldPoll({ state: s, now: T0 + 4000, lastFiredAt: T0, config: CFG }), true);
  });

  test('never overlaps an in-flight request', () => {
    const firing = markFiring(createPollState(), T0);
    assert.equal(firing.inFlightSince, T0);
    // Far past the interval, still must not fire.
    assert.equal(shouldPoll({ state: firing, now: T0 + 60_000, lastFiredAt: T0, config: CFG }), false);
  });

  test('firing again after a settle is allowed', () => {
    const settled = markSettled(markFiring(createPollState(), T0), T0, { status: 'pending' });
    assert.equal(settled.inFlightSince, null);
    assert.equal(shouldPoll({ state: settled, now: T0 + CFG.intervalMs, lastFiredAt: T0, config: CFG }), true);
  });
});

describe('stop conditions', () => {
  test('stops immediately on a terminal status', () => {
    const s = markSettled(markFiring(createPollState(), T0), T0, { status: 'verified' });
    assert.equal(s.stopReason, 'terminal');
    assert.equal(shouldPoll({ state: s, now: T0 + 10, lastFiredAt: null, config: CFG }), false);
  });

  test('stops on not_verified too, so an expired link does not spin', () => {
    const s = markSettled(markFiring(createPollState(), T0), T0, { status: 'not_verified' });
    assert.equal(s.stopReason, 'terminal');
  });

  test('keeps going while pending', () => {
    const s = markSettled(markFiring(createPollState(), T0), T0, { status: 'pending' });
    assert.equal(s.stopReason, null);
    assert.equal(shouldPoll({ state: s, now: T0 + CFG.intervalMs, lastFiredAt: T0, config: CFG }), true);
  });

  test('stops after the overall timeout', () => {
    let s = createPollState();
    s = markSettled(markFiring(s, T0), T0, { status: 'pending' });
    const late = T0 + CFG.timeoutMs + 1;
    assert.equal(shouldPoll({ state: s, now: late, lastFiredAt: T0, config: CFG }), false);
    assert.equal(resolveStopReason(s, late, CFG), 'timeout');
  });

  test('stops after max attempts even when the clock is generous', () => {
    const cfg = { ...CFG, timeoutMs: 10 ** 12 };
    let s = createPollState();
    for (let i = 0; i < cfg.maxAttempts; i += 1) {
      s = markSettled(markFiring(s, T0 + i * 10), T0 + i * 10, { status: 'pending' });
    }
    assert.equal(resolveStopReason(s, T0, cfg), 'max_attempts');
    assert.equal(shouldPoll({ state: s, now: T0, lastFiredAt: null, config: cfg }), false);
  });

  test('stops after repeated errors', () => {
    let s = createPollState();
    for (let i = 0; i < CFG.maxConsecutiveErrors; i += 1) {
      s = markSettled(markFiring(s, T0 + i * 10), T0 + i * 10, { error: true });
    }
    assert.equal(s.consecutiveErrors, CFG.maxConsecutiveErrors);
    assert.equal(resolveStopReason(s, T0, CFG), 'repeated_errors');
    assert.equal(shouldPoll({ state: s, now: T0, lastFiredAt: null, config: CFG }), false);
  });

  test('a success clears the error streak', () => {
    let s = createPollState();
    s = markSettled(markFiring(s, T0), T0, { error: true });
    s = markSettled(markFiring(s, T0 + 10), T0 + 10, { error: true });
    assert.equal(s.consecutiveErrors, 2);
    s = markSettled(markFiring(s, T0 + 20), T0 + 20, { status: 'pending' });
    assert.equal(s.consecutiveErrors, 0);
  });

  test('cancelling stops everything', () => {
    const s = stopPolling(createPollState(), 'cancelled');
    assert.equal(s.stopReason, 'cancelled');
    assert.equal(shouldPoll({ state: s, now: T0, lastFiredAt: null, config: CFG }), false);
  });

  test('a fresh start resets the timeout budget', () => {
    const exhausted = createPollState();
    const stale = markSettled(
      markFiring({ ...exhausted, startedAt: T0 - CFG.timeoutMs - 1 }, T0),
      T0,
      { status: 'pending' },
    );
    assert.equal(resolveStopReason(stale, T0, CFG), 'timeout');
    const fresh = createPollState();
    assert.equal(resolveStopReason(fresh, T0, CFG), null);
  });
});

describe('unmount safety', () => {
  test('a late response after stop cannot resurrect the poller', () => {
    // The hook drops responses once unmounted; this asserts the state machine
    // will not itself re-arm a cancelled poller if one is applied late.
    let s = createPollState();
    s = markFiring(s, T0);
    s = stopPolling(s, 'cancelled');
    s = markSettled(s, T0 + 10, { status: 'verified' });
    assert.equal(s.stopReason, 'cancelled', 'the stop reason must survive a late settle');
    assert.equal(shouldPoll({ state: s, now: T0 + 10, lastFiredAt: null, config: CFG }), false);
  });

  test('stopping clears any in-flight marker', () => {
    const s = stopPolling(markFiring(createPollState(), T0), 'cancelled');
    assert.equal(s.inFlightSince, null);
  });
});

describe('terminal helper', () => {
  test('pending is the only unresolved state', () => {
    assert.equal(isTerminal('pending'), false);
    assert.equal(isTerminal('verified'), true);
    assert.equal(isTerminal('not_verified'), true);
    assert.equal(isTerminal(null), false);
  });
});

describe('per-document status mapping', () => {
  const docs = [
    { type: 'aadhaar', status: 'verified' },
    { type: 'pan', status: 'pending' },
  ];

  test('reads the server value for that document', () => {
    assert.equal(statusForDocument(docs, 'aadhaar', 'not_verified'), 'verified');
    assert.equal(statusForDocument(docs, 'pan', 'not_verified'), 'pending');
  });

  test('falls back when the document has no session', () => {
    assert.equal(statusForDocument(docs, 'dl', 'pending'), 'pending');
    assert.equal(statusForDocument([], 'pan', 'not_verified'), 'not_verified');
  });

  test('maps expired and failed to not_verified for display', () => {
    assert.equal(statusForDocument([{ type: 'dl', status: 'expired' }], 'dl', 'pending'), 'not_verified');
    assert.equal(statusForDocument([{ type: 'dl', status: 'failed' }], 'dl', 'pending'), 'not_verified');
  });
});

describe('advance helper sanity', () => {
  test('firing increments the attempt counter exactly once per request', () => {
    const a = advance(createPollState(), T0);
    assert.equal(a.state.attempts, 1);
    const b = a.settle({ status: 'pending' });
    assert.equal(b.attempts, 1);
    assert.equal(b.inFlightSince, null);
  });
});