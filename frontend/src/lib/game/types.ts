// Fill the Ride — domain types.
// Pure game types only. No React, no navigation, no network.

export type Lane = 0 | 1 | 2;

export type EntityKind =
  | 'passenger'
  | 'expensive_cab'
  | 'expensive_auto'
  | 'crowded_bus'
  | 'traffic_car'
  | 'traffic_bike'
  | 'barricade'
  | 'finish';

export interface RoadEntity {
  id: string;
  kind: EntityKind;
  lane: Lane;
  /** Distance along the road, in world units. Grows toward the finish. */
  z: number;
  /** Only used by moving traffic. */
  drift?: number;
  /** Rendered above the player when the finish line passes under them. */
  cleared?: boolean;
}

export type GamePhase =
  | 'idle'
  | 'running'
  | 'won'
  | 'lost'
  | 'paused';

export type LossReason = 'timeout' | 'abandoned' | null;

export interface GameConfig {
  lanes: number;
  /** Total road length in world units. Reaching it is "arriving". */
  finishDistance: number;
  /** Seconds on the clock. */
  durationMs: number;
  /** Seats that must be filled to win. */
  seatsRequired: number;
  /** Starting world-units-per-second. */
  baseSpeed: number;
  /** Top speed reached at the end of the level. */
  maxSpeed: number;
  /** Vertical distance between entity rows, in world units. */
  rowSpacing: number;
  /** How often a new row is attempted, in world units travelled. */
  spawnInterval: number;
}

export interface GameState {
  phase: GamePhase;
  /** Distance travelled along the road. */
  distance: number;
  /** Seconds remaining. */
  timeRemainingMs: number;
  /** Continuous lane position so switching animates smoothly. 0..lanes-1. */
  lanePosition: number;
  /** The lane the player is logically in once the switch completes. */
  committedLane: Lane;
  seats: number;
  score: number;
  entities: RoadEntity[];
  /** Next entity id, monotonic. */
  nextId: number;
  /** Air-pollution haze intensity, 0..1. */
  pollution: number;
  /** Set when the finish line has been crossed. */
  reachedFinish: boolean;
  /** Set once the finish entity itself has been passed. */
  finishCleared: boolean;
  lossReason: LossReason;
  /** Visual feedback timers, in ms remaining. */
  hitFlashMs: number;
  seatPulseMs: number;
  /** Count of obstacles the player has struck this run. */
  collisions: number;
}

export type GameEvent =
  | { type: 'pickup'; seats: number }
  | { type: 'hit'; kind: EntityKind; penaltyMs: number }
  | { type: 'slowdown' }
  | { type: 'reached_finish' }
  | { type: 'win' }
  | { type: 'lose'; reason: 'timeout' }
  | { type: 'lane_changed'; lane: Lane }
  | { type: 'tick' };

export const LANE_CENTER = (lane: number, lanes: number, width: number): number =>
  (width / lanes) * (lane + 0.5);
