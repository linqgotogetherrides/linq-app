// Fill the Ride — tuning constants and difficulty curve.
//
// All distances are in abstract "world units". The road is ROAD_WIDTH units
// wide, and the camera maps world Z to screen Y via a single scale factor, so
// gameplay tuning is independent of device screen size.

import type { GameConfig } from './types';

export const ROAD_WIDTH = 3; // lanes

export const GAME_CONFIG: GameConfig = {
  lanes: 3,
  // Tuned so a CLEAN run reaches the finish in ~18s, leaving ~12s of margin
  // inside the 30s clock for the 2-3 collisions a normal run incurs. An
  // earlier value of 16000 needed ~27s clean, which made the level
  // mathematically unwinnable the moment a player clipped a cab.
  finishDistance: 11000,
  durationMs: 30_000,
  seatsRequired: 5,
  baseSpeed: 380,
  maxSpeed: 820,
  rowSpacing: 250,
  // ~0.55s between rows at cruising speed: long enough to read and react,
  // short enough to feel like traffic.
  spawnInterval: 320,
};

/** How far up the screen an entity spawns, in world units ahead of the player. */
export const SPAWN_AHEAD = 2600;
/** Entities behind this are recycled. */
export const DESPAWN_BEHIND = 400;

/** Speed multiplier after a collision, recovering over time. */
export const SLOWDOWN_FACTOR = 0.55;
export const SLOWDOWN_RECOVERY_MS = 1400;
/** Time penalty for hitting an overpriced cab/auto. */
export const OVERPRICED_PENALTY_MS = 1700;
/** Time penalty for hitting a bus / barricade / traffic. */
export const BLOCK_PENALTY_MS = 900;

export const COLLISION_RADIUS = 62;
export const PICKUP_RADIUS = 70;

/** Lane-switch duration, ms. Fast enough to feel instant, slow enough to read. */
export const LANE_SWITCH_MS = 130;

/** Hold duration for the SOS-style press targets is unrelated; game uses tap/swipe. */
export type DifficultyTier = {
  readonly at: number;
  readonly obstacleChance: number;
  readonly trafficChance: number;
  readonly speedScale: number;
};

export const DIFFICULTY_TIERS: readonly DifficultyTier[] = [
  { at: 0.0, obstacleChance: 0.34, trafficChance: 0.1, speedScale: 1.0 },
  { at: 0.25, obstacleChance: 0.46, trafficChance: 0.2, speedScale: 1.12 },
  { at: 0.5, obstacleChance: 0.58, trafficChance: 0.32, speedScale: 1.28 },
  { at: 0.75, obstacleChance: 0.68, trafficChance: 0.44, speedScale: 1.45 },
  { at: 0.92, obstacleChance: 0.74, trafficChance: 0.52, speedScale: 1.58 },
] as const;

/** Smoothly interpolated difficulty for a 0..1 progress value. */
export function difficultyFor(progress: number): DifficultyTier {
  const clamped = Math.max(0, Math.min(1, progress));
  let tier = DIFFICULTY_TIERS[0];
  for (const candidate of DIFFICULTY_TIERS) {
    if (clamped >= candidate.at) tier = candidate;
  }
  return tier;
}

/** World units per second at a given progress point. */
export function speedFor(progress: number): number {
  const { baseSpeed, maxSpeed } = GAME_CONFIG;
  const eased = progress * progress * 0.6 + progress * 0.4; // ramps gently then sharply
  return baseSpeed + (maxSpeed - baseSpeed) * eased;
}

/** Air-pollution haze windows, as progress ranges. Slightly reduced visibility. */
export const POLLUTION_ZONES: { from: number; to: number; peak: number }[] = [
  { from: 0.3, to: 0.42, peak: 0.45 },
  { from: 0.66, to: 0.78, peak: 0.7 },
];

export function pollutionAt(progress: number): number {
  for (const zone of POLLUTION_ZONES) {
    if (progress >= zone.from && progress <= zone.to) {
      const mid = (zone.from + zone.to) / 2;
      const spread = (zone.to - zone.from) / 2;
      const t = 1 - Math.abs(progress - mid) / spread;
      return Math.max(0, Math.min(1, t)) * zone.peak;
    }
  }
  return 0;
}

export const OBSTACLE_LABELS: Record<string, string> = {
  expensive_cab: '₹450',
  expensive_auto: '₹350',
  crowded_bus: 'FULL',
  traffic_car: '',
  traffic_bike: '',
  barricade: '',
  passenger: '',
  finish: 'DESTINATION',
};
