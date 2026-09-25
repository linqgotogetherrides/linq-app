// Fill the Ride — engine.
//
// A pure, fixed-step simulation. No React, no rendering, no network. The whole
// game is `tick(state, dtMs)` returning the next state plus a list of events
// that the presentation layer turns into sound, haptics and animation.
//
// Fixed timestep matters: it makes collisions deterministic, so the same seed
// and the same inputs always produce the same run, which is what makes the
// difficulty curve honest rather than random.

import {
  BLOCK_PENALTY_MS,
  DESPAWN_BEHIND,
  GAME_CONFIG,
  LANE_SWITCH_MS,
  OVERPRICED_PENALTY_MS,
  SLOWDOWN_FACTOR,
  SLOWDOWN_RECOVERY_MS,
  pollutionAt,
  speedFor,
} from './constants';
import { createSpawner, spawnUntil, type SpawnerState } from './spawner';
import type { GameEvent, GameState, Lane, RoadEntity } from './types';

const FIXED_STEP_MS = 1000 / 60;

export const INITIAL_STATE: GameState = {
  phase: 'idle',
  distance: 0,
  timeRemainingMs: GAME_CONFIG.durationMs,
  lanePosition: 1,
  committedLane: 1,
  seats: 0,
  score: 0,
  entities: [],
  nextId: 1,
  pollution: 0,
  reachedFinish: false,
  finishCleared: false,
  lossReason: null,
  hitFlashMs: 0,
  seatPulseMs: 0,
  collisions: 0,
};

export function createInitialState(seed: number, seatsRequired: number): {
  state: GameState;
  spawner: SpawnerState;
} {
  return {
    state: { ...INITIAL_STATE },
    spawner: createSpawner(seed, seatsRequired),
  };
}

const laneOf = (position: number): Lane =>
  Math.max(0, Math.min(2, Math.round(position))) as Lane;

export function moveLane(state: GameState, delta: -1 | 1): GameState {
  const target = Math.max(0, Math.min(GAME_CONFIG.lanes - 1, state.lanePosition + delta));
  if (target === state.lanePosition) return state;
  return { ...state, lanePosition: target };
}

function overlaps(a: RoadEntity, playerZ: number, playerLane: number): boolean {
  if (a.lane !== playerLane) return false;
  return Math.abs(a.z - playerZ) < 70;
}

function handleCollisions(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const playerLane = laneOf(state.lanePosition);
  const remaining: RoadEntity[] = [];
  let seats = state.seats;
  let score = state.score;
  let timeRemainingMs = state.timeRemainingMs;
  let hitFlashMs = state.hitFlashMs;
  let seatPulseMs = state.seatPulseMs;
  let collisions = state.collisions;
  let lostTime = false;

  for (const entity of state.entities) {
    if (entity.cleared) {
      remaining.push(entity);
      continue;
    }

    if (!overlaps(entity, state.distance, playerLane)) {
      remaining.push(entity);
      continue;
    }

    if (entity.kind === 'passenger') {
      seats += 1;
      score += 120;
      seatPulseMs = 420;
      entity.cleared = true;
      events.push({ type: 'pickup', seats });
      continue;
    }

    if (entity.kind === 'finish') {
      entity.cleared = true;
      continue;
    }

    // Any vehicle/structure hit costs time but never ends the run outright.
    entity.cleared = true;
    collisions += 1;
    hitFlashMs = 340;
    const penalty =
      entity.kind === 'expensive_cab' || entity.kind === 'expensive_auto'
        ? OVERPRICED_PENALTY_MS
        : BLOCK_PENALTY_MS;
    timeRemainingMs = Math.max(0, timeRemainingMs - penalty);
    lostTime = true;
    events.push({ type: 'hit', kind: entity.kind, penaltyMs: penalty });
    events.push({ type: 'slowdown' });
    remaining.push(entity);
  }

  if (!lostTime && seats === state.seats && hitFlashMs === state.hitFlashMs) {
    return { state, events: events.length ? events : [] };
  }

  return {
    state: {
      ...state,
      entities: remaining,
      seats,
      score,
      timeRemainingMs,
      hitFlashMs,
      seatPulseMs,
      collisions,
    },
    events,
  };
}

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export function tick(
  input: GameState,
  spawner: SpawnerState,
  dtMs: number,
): TickResult {
  if (input.phase !== 'running') return { state: input, events: [] };

  // Slowdown decays back to normal over time.
  const elapsed = Math.min(dtMs, 200);
  const decay =
    input.hitFlashMs > 0 ? (elapsed / SLOWDOWN_RECOVERY_MS) * (1 - SLOWDOWN_FACTOR) : 0;
  const progress = input.distance / GAME_CONFIG.finishDistance;
  const baseSpeed = speedFor(progress);
  const slowFactor = 1 - Math.min(0.45, decay);
  const speed = baseSpeed * slowFactor;
  const step = (speed * elapsed) / 1000;

  let timeRemainingMs = input.timeRemainingMs - elapsed;
  let hitFlashMs = Math.max(0, input.hitFlashMs - elapsed);
  let seatPulseMs = Math.max(0, input.seatPulseMs - elapsed);
  let seats = input.seats;
  let score = input.score;

  // Lane interpolation runs on its own clock so a lane switch always completes.
  const committedLane = laneOf(input.lanePosition);
  const laneDelta = committedLane - input.lanePosition;
  const laneProgress = Math.min(1, elapsed / LANE_SWITCH_MS);
  const lanePosition =
    Math.abs(laneDelta) < 0.01
      ? committedLane
      : input.lanePosition + laneDelta * laneProgress;

  let entities = input.entities;

  // Spawn ahead, then recycle anything well behind the player.
  const spawned = spawnUntil(spawner, input.distance + step, progress);
  if (spawned.length) entities = [...entities, ...spawned];
  entities = entities.filter((e) => e.z > input.distance - DESPAWN_BEHIND);

  const collided = handleCollisions({
    ...input,
    entities,
    distance: input.distance + step,
    lanePosition,
    committedLane,
    timeRemainingMs,
    hitFlashMs,
    seatPulseMs,
    seats,
    score,
  });

  let next: GameState = { ...collided.state, distance: input.distance + step };
  const events: GameEvent[] = [...collided.events];

  if (!next.reachedFinish) {
    const finish = next.entities.find((e) => e.kind === 'finish' && e.z <= next.distance + 70);
    if (finish) {
      next = { ...next, reachedFinish: true, finishCleared: true };
      events.push({ type: 'reached_finish' });
    }
  }

  if (next.reachedFinish && next.seats >= GAME_CONFIG.seatsRequired) {
    next = {
      ...next,
      phase: 'won',
      lossReason: null,
      score: next.score + 500 + Math.floor(next.timeRemainingMs / 100) * 10,
    };
    events.push({ type: 'win' });
    return { state: next, events };
  }

  if (timeRemainingMs <= 0) {
    next = {
      ...next,
      phase: 'lost',
      timeRemainingMs: 0,
      lossReason: 'timeout',
    };
    events.push({ type: 'lose', reason: 'timeout' });
    return { state: next, events };
  }

  // Reached the destination without a full car.
  if (next.reachedFinish && next.seats < GAME_CONFIG.seatsRequired) {
    next = { ...next, phase: 'lost', lossReason: 'timeout' };
    events.push({ type: 'lose', reason: 'timeout' });
    return { state: next, events };
  }

  next = { ...next, pollution: pollutionAt(next.distance / GAME_CONFIG.finishDistance) };
  return { state: next, events };
}

export { FIXED_STEP_MS };
