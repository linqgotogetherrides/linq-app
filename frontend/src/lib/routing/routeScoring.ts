import { Coordinates, RouteGeometry } from './osrm';
import { haversineDistanceKm } from './routeGeometry';
import { matchRoutes } from './routeMatcher';

export interface RouteScoreWeights {
  routeOverlap: number; // default: 0.50
  pickupProximity: number; // default: 0.15
  dropProximity: number; // default: 0.15
  timeCompatibility: number; // default: 0.10
  direction: number; // default: 0.10
}

export const DEFAULT_SCORE_WEIGHTS: RouteScoreWeights = {
  routeOverlap: 0.50,
  pickupProximity: 0.15,
  dropProximity: 0.15,
  timeCompatibility: 0.10,
  direction: 0.10,
};

export interface ScoreRideInput {
  userPickup: Coordinates;
  userDrop: Coordinates;
  userRoute: RouteGeometry;
  userTimeMinutes?: number; // Minutes from midnight (e.g. 8:30 AM = 510)

  candidatePickup: Coordinates;
  candidateDrop: Coordinates;
  candidateRoute: RouteGeometry;
  candidateTimeMinutes?: number;
}

export interface ScoreResult {
  finalScore: number; // 0..100
  overlapPercentage: number;
  sharedDistanceKm: number;
  pickupDistanceKm: number;
  dropDistanceKm: number;
  matchType: 'exact' | 'nearby' | 'other';
  matchExplanation: string;
}

/**
 * Converts a time string like "08:30 AM" or "17:45" to minutes from midnight.
 *
 * Returns undefined when no usable time was given. It used to substitute 8:00 AM,
 * which quietly invented a departure time for anyone who had not set one and
 * could make two riders with no times look like a perfect match.
 */
export function parseTimeToMinutes(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes('PM');
  const isAM = cleaned.includes('AM');
  const numbers = cleaned.replace(/[^0-9:]/g, '').split(':');
  if (numbers.length === 0 || !numbers[0]) return undefined;

  const parsedHours = parseInt(numbers[0], 10);
  if (!Number.isFinite(parsedHours)) return undefined;
  let hours = parsedHours;
  const minutes = parseInt(numbers[1] ?? '0', 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function scoreRideMatch(
  input: ScoreRideInput,
  weights: RouteScoreWeights = DEFAULT_SCORE_WEIGHTS
): ScoreResult {
  // 1. Corridor Overlap
  const corridorResult = matchRoutes(input.userRoute, input.candidateRoute);
  const overlapScore = corridorResult.symmetricOverlap; // 0..100

  // 2. Pickup Proximity (0..100)
  const pickupDistKm = haversineDistanceKm(input.userPickup, input.candidatePickup);
  // Max pickup score within 2km, dropping linearly to 0 at 10km
  const pickupScore = Math.max(0, 100 - (pickupDistKm / 10) * 100);

  // 3. Drop Proximity (0..100)
  const dropDistKm = haversineDistanceKm(input.userDrop, input.candidateDrop);
  const dropScore = Math.max(0, 100 - (dropDistKm / 10) * 100);

  // 4. Direction Score (0..100)
  const directionScore = corridorResult.isOppositeDirection
    ? 0
    : Math.max(0, 100 - (corridorResult.directionDiffDegrees / 90) * 100);

  // 5. Time Compatibility (0..100)
  // Only computed when both sides actually stated a time. If either is unknown
  // the term is dropped and the remaining weights are renormalised, so missing
  // data neither rewards nor penalises a ride.
  const bothTimesKnown =
    input.userTimeMinutes !== undefined && input.candidateTimeMinutes !== undefined;
  let timeScore: number | undefined;
  if (bothTimesKnown) {
    const diffMin = Math.abs(input.userTimeMinutes! - input.candidateTimeMinutes!);
    if (diffMin <= 15) timeScore = 100;
    else if (diffMin <= 30) timeScore = 80;
    else if (diffMin <= 60) timeScore = 50;
    else timeScore = 20;
  }

  // Weighted score calculation, renormalised over the terms actually used.
  const terms: { score: number; weight: number }[] = [
    { score: overlapScore, weight: weights.routeOverlap },
    { score: pickupScore, weight: weights.pickupProximity },
    { score: dropScore, weight: weights.dropProximity },
    { score: directionScore, weight: weights.direction },
  ];
  if (timeScore !== undefined) {
    terms.push({ score: timeScore, weight: weights.timeCompatibility });
  }

  const totalWeight = terms.reduce((sum, term) => sum + term.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? terms.reduce((sum, term) => sum + term.score * term.weight, 0) / totalWeight
      : 0;

  const finalScore = Math.min(100, Math.max(0, Math.round(weightedScore)));

  let matchType: 'exact' | 'nearby' | 'other' = 'other';
  if (finalScore >= 75 || overlapScore >= 70) {
    matchType = 'exact';
  } else if (finalScore >= 40 || overlapScore >= 35) {
    matchType = 'nearby';
  }

  let matchExplanation = 'Other route nearby.';
  if (overlapScore >= 80) {
    matchExplanation = 'Most of your journey is along the same route.';
  } else if (overlapScore >= 45) {
    matchExplanation = 'Your routes share part of the journey.';
  } else if (pickupDistKm <= 2.0 && dropDistKm <= 2.0) {
    matchExplanation = 'Pickup and drop are close to your route.';
  }

  return {
    finalScore,
    overlapPercentage: overlapScore,
    sharedDistanceKm: corridorResult.sharedDistanceKm,
    pickupDistanceKm: Math.round(pickupDistKm * 10) / 10,
    dropDistanceKm: Math.round(dropDistKm * 10) / 10,
    matchType,
    matchExplanation,
  };
}
