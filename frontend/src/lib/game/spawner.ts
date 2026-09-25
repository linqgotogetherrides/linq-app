// Fill the Ride — row spawner.
//
// The single most important rule in this file: a row must ALWAYS leave at least
// one lane the player can occupy. Difficulty is meant to come from tight timing
// and from having to commit to a lane early — never from an unwinnable wall.
//
// Guarantees enforced here:
//   1. At least one lane in every row is passable.
//   2. Passengers only ever spawn in a passable lane.
//   3. A passenger is never placed where a blocking obstacle sits.
//   4. Moving traffic drifts by a bounded amount, so it cannot slide into the
//      only open lane at the last moment.

import { GAME_CONFIG, difficultyFor } from './constants';
import type { EntityKind, Lane, RoadEntity } from './types';

const LANES: Lane[] = [0, 1, 2];

/** Kinds that physically occupy a lane and can be collided with. */
const BLOCKING: EntityKind[] = [
  'expensive_cab',
  'expensive_auto',
  'crowded_bus',
  'barricade',
  'traffic_car',
  'traffic_bike',
];

export const isBlocking = (kind: EntityKind) => BLOCKING.includes(kind);

/**
 * Deterministic PRNG (mulberry32) so a run can be replayed from a seed.
 * Keeps the game fair: the same seed always produces the same pattern.
 */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SpawnerState {
  random: () => number;
  nextId: number;
  /** Distance at which the next row will be placed. */
  nextRowZ: number;
  /** Passengers still to be spawned. */
  passengersLeft: number;
  /**
   * The lane the player is expected to be in. It STICKS for several rows and
   * only ever shifts by one lane, so the road is learnable rather than random.
   */
  openLane: Lane;
  rowsOnCurrentLane: number;
  /** How many rows to hold the current open lane for. */
  holdRows: number;
  lastPassengerZ: number;
}

export function createSpawner(seed: number, seatsRequired: number): SpawnerState {
  const random = makeRandom(seed);
  // The opening lane is randomised so that sitting still is never a strategy:
  // the player always has to read the road at least once.
  const startLane = (Math.floor(random() * 3) as Lane);
  return {
    random,
    nextId: 1,
    nextRowZ: 900,
    passengersLeft: seatsRequired,
    openLane: startLane,
    rowsOnCurrentLane: 0,
    holdRows: 2 + Math.floor(random() * 2),
    lastPassengerZ: 0,
  };
}


/**
 * Builds one row of entities.
 *
 * The open lane is decided by `advanceOpenLane` and is STICKY: it holds for
 * 2-4 rows, then shifts by exactly one lane. That is what makes the road
 * learnable — a player can read the pattern and pre-position — instead of
 * requiring a coin flip every 0.4 seconds.
 */
function buildRow(
  state: SpawnerState,
  z: number,
  progress: number,
): RoadEntity[] {
  const { random } = state;
  const tier = difficultyFor(progress);
  const entities: RoadEntity[] = [];

  // Late in the run a second lane opens up, making it more forgiving rather
  // than more random.
  const openCount: 1 | 2 = progress > 0.62 && state.rowsOnCurrentLane % 3 === 0 ? 2 : 1;
  const secondLane: Lane = state.openLane === 0 ? 1 : 0;

  const blockedLanes = LANES.filter(
    (lane) => lane !== state.openLane && !(openCount === 2 && lane === secondLane),
  );

  for (const lane of blockedLanes) {
    const roll = random();
    let kind: EntityKind;
    if (roll < 0.3) kind = 'expensive_cab';
    else if (roll < 0.5) kind = 'expensive_auto';
    else if (roll < 0.74) kind = 'crowded_bus';
    else if (roll < 0.74 + tier.trafficChance * 0.5) kind = 'traffic_car';
    else if (roll < 0.8 + tier.trafficChance * 0.5) kind = 'traffic_bike';
    else kind = 'barricade';

    entities.push({
      id: `e${state.nextId++}`,
      kind,
      lane,
      z,
      drift:
        kind === 'traffic_car' || kind === 'traffic_bike' ? (random() - 0.5) * 22 : 0,
    });
  }

  return entities;
}

/**
 * Decides whether to hold or shift the open lane.
 * Shifts are always +/- 1 so the player never has to cross two lanes at once.
 */
function advanceOpenLane(state: SpawnerState, progress: number): void {
  state.rowsOnCurrentLane += 1;
  if (state.rowsOnCurrentLane < state.holdRows) return;

  state.rowsOnCurrentLane = 0;
  // Hold long enough to read the road: roughly 2s of travel before a shift
  // early on, tightening as the run progresses. Shorter holds turned the game
  // into a lane change every 0.4s, which measured as 0% winnable.
  const holdBias = progress < 0.3 ? 2 : progress < 0.65 ? 1 : 0;
  state.holdRows = 4 + Math.floor(state.random() * 2) + holdBias;

  // Always shift when the hold expires. A purely random "stay or go" roll let a
  // lazy player park in one lane for an entire run, which made cruising viable.
  // Shifting every time keeps the pattern rhythmic and still readable.
  let dir: -1 | 1;
  if (state.openLane === 0) dir = 1;
  else if (state.openLane === 2) dir = -1;
  else dir = state.random() < 0.5 ? -1 : 1;

  state.openLane = (state.openLane + dir) as Lane;
}

/**
 * Advances the spawner, returning any new entities to add.
 * Called once per simulated frame with the current distance.
 */
export function spawnUntil(
  state: SpawnerState,
  distance: number,
  progress: number,
): RoadEntity[] {
  const produced: RoadEntity[] = [];
  const horizon = distance + 2600;

  while (state.nextRowZ <= horizon) {
    // The destination gate gets a clear run-up: no obstacles are placed in the
    // final stretch, so the finish can never read as a sealed row.
    if (state.nextRowZ >= GAME_CONFIG.finishDistance - GAME_CONFIG.spawnInterval * 2) {
      produced.push({
        id: `e${state.nextId++}`,
        kind: 'finish',
        lane: state.openLane,
        z: GAME_CONFIG.finishDistance,
      });
      state.nextRowZ = Number.POSITIVE_INFINITY;
      break;
    }

    advanceOpenLane(state, progress);
    const row = buildRow(state, state.nextRowZ, progress);
    produced.push(...row);

    // A passenger always lands in the lane the player is meant to be in, so
    // collecting one is a reward for reading the road rather than a lottery.
    const gapToPassenger = state.nextRowZ - state.lastPassengerZ;
    if (state.passengersLeft > 0 && gapToPassenger > 1400 && state.random() < 0.6) {
      produced.push({
        id: `e${state.nextId++}`,
        kind: 'passenger',
        lane: state.openLane,
        z: state.nextRowZ,
      });
      state.passengersLeft -= 1;
      state.lastPassengerZ = state.nextRowZ;
    }

    state.nextRowZ += GAME_CONFIG.spawnInterval;
  }

  return produced;
}
