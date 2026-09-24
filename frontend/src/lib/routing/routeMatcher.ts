import { RouteGeometry } from './osrm';
import {
  calculateRouteBearing,
  calculateRouteLengthKm,
  distanceToRouteKm,
  sampleRoutePoints,
} from './routeGeometry';

export interface CorridorMatchResult {
  aToBOverlapRatio: number; // 0..1
  bToAOverlapRatio: number; // 0..1
  symmetricOverlap: number; // 0..100 (%)
  sharedDistanceKm: number;
  directionDiffDegrees: number;
  isOppositeDirection: boolean;
}

export interface RouteMatcherOptions {
  corridorThresholdKm?: number; // Distance threshold for corridor matching (default: 0.5 km = 500m)
  sampleIntervalKm?: number; // Spatial sampling step along route (default: 0.15 km = 150m)
  maxOppositeDirectionAngle?: number; // Angle threshold above which route is considered opposite direction (default: 120 deg)
}

const DEFAULT_OPTIONS: Required<RouteMatcherOptions> = {
  corridorThresholdKm: 0.5,
  sampleIntervalKm: 0.15,
  maxOppositeDirectionAngle: 120,
};

/**
 * Calculates one-directional corridor overlap ratio of Route A relative to Route B.
 * Returns fraction (0..1) of Route A length that travels within corridorThresholdKm of Route B.
 */
export function calculateOneWayCorridorOverlap(
  routeA: RouteGeometry,
  routeB: RouteGeometry,
  thresholdKm: number = 0.5,
  sampleIntervalKm: number = 0.15
): number {
  const samplesA = sampleRoutePoints(routeA, sampleIntervalKm);
  if (samplesA.length === 0) return 0;

  let overlappingPoints = 0;
  for (const sample of samplesA) {
    const distToB = distanceToRouteKm(sample, routeB);
    if (distToB <= thresholdKm) {
      overlappingPoints++;
    }
  }

  return overlappingPoints / samplesA.length;
}

/**
 * Calculates symmetric corridor overlap percentage between two road routes.
 * Properly handles different point densities, GPS noise, and sub-routes without returning 0%.
 */
export function matchRoutes(
  routeA: RouteGeometry,
  routeB: RouteGeometry,
  options: RouteMatcherOptions = {}
): CorridorMatchResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const bearingA = calculateRouteBearing(routeA);
  const bearingB = calculateRouteBearing(routeB);

  // Direction difference (0..180 deg)
  let directionDiff = Math.abs(bearingA - bearingB);
  if (directionDiff > 180) directionDiff = 360 - directionDiff;

  const isOppositeDirection = directionDiff > opts.maxOppositeDirectionAngle;

  const aToB = calculateOneWayCorridorOverlap(routeA, routeB, opts.corridorThresholdKm, opts.sampleIntervalKm);
  const bToA = calculateOneWayCorridorOverlap(routeB, routeA, opts.corridorThresholdKm, opts.sampleIntervalKm);

  // For sub-routes (e.g., Route A is contained within longer Route B),
  // symmetric overlap should reflect the shared coverage from the smaller route's perspective,
  // or a weighted balance so valid passenger pickups along a driver route score high.
  const maxOverlap = Math.max(aToB, bToA);
  const minOverlap = Math.min(aToB, bToA);

  // Weighted formulation: 60% higher overlap side + 40% lower overlap side
  let symmetricOverlapRatio = maxOverlap * 0.6 + minOverlap * 0.4;

  // Penalize opposite direction heavily
  if (isOppositeDirection) {
    symmetricOverlapRatio *= 0.1; // 90% penalty for opposite direction
  }

  const lengthA = calculateRouteLengthKm(routeA);
  const lengthB = calculateRouteLengthKm(routeB);
  const sharedDistanceKm = Math.round(Math.min(lengthA, lengthB) * maxOverlap * 10) / 10;

  const symmetricOverlapPercentage = Math.min(100, Math.round(symmetricOverlapRatio * 100));

  return {
    aToBOverlapRatio: aToB,
    bToAOverlapRatio: bToA,
    symmetricOverlap: symmetricOverlapPercentage,
    sharedDistanceKm,
    directionDiffDegrees: Math.round(directionDiff),
    isOppositeDirection,
  };
}
