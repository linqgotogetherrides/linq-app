/**
 * Worked example of the LinQ route matching algorithm.
 * Run: npx tsx scripts/route-match-example.ts
 */
import { DEFAULT_SCORE_WEIGHTS, scoreRideMatch } from '../frontend/src/lib/routing/routeScoring';

const userPickup = { latitude: 17.3850, longitude: 78.4867 };
const userDrop = { latitude: 17.4405, longitude: 78.4867 };

// A same-direction ride starting 0.9 km away and departing 10 minutes later.
const candidatePickup = { latitude: 17.3930, longitude: 78.4867 }; // ~0.9 km south
const candidateDrop = { latitude: 17.4485, longitude: 78.4867 };

// Straight-line approximations stand in for the OSRM road geometry.
const userRoute = {
  type: 'LineString' as const,
  coordinates: [
    [78.4867, 17.3850], [78.4870, 17.4000], [78.4867, 17.4200], [78.4867, 17.4405],
  ],
};
const candidateRoute = {
  type: 'LineString' as const,
  coordinates: [
    [78.4867, 17.3930], [78.4870, 17.4050], [78.4867, 17.4250], [78.4867, 17.4485],
  ],
};

const result = scoreRideMatch({
  userPickup, userDrop, userRoute, userTimeMinutes: 8 * 60 + 30, // 08:30
  candidatePickup, candidateDrop, candidateRoute, candidateTimeMinutes: 8 * 60 + 40, // 08:40
});

const w = DEFAULT_SCORE_WEIGHTS;
console.log('\nWEIGHTS');
console.log(`  route overlap      ${w.routeOverlap}`);
console.log(`  pickup proximity   ${w.pickupProximity}`);
console.log(`  drop proximity     ${w.dropProximity}`);
console.log(`  time compatibility ${w.timeCompatibility}`);
console.log(`  direction          ${w.direction}`);

console.log('\nCOMPONENT SCORES (each 0-100)');
console.log(`  route overlap        ${result.overlapPercentage}`);
console.log(`  pickup proximity     ${100 - Math.round(result.pickupDistanceKm * 10)}   (${result.pickupDistanceKm} km away)`);
console.log(`  drop proximity       ${100 - Math.round(result.dropDistanceKm * 10)}   (${result.dropDistanceKm} km away)`);
console.log(`  time compatibility   100   (10 min apart, <= 15 min)`);
console.log(`  direction            100   (same direction)`);

console.log('\nRESULT');
console.log(`  final score      ${result.finalScore} / 100`);
console.log(`  match type       ${result.matchType}`);
console.log(`  shared distance  ${result.sharedDistanceKm} km`);
console.log(`  explanation      "${result.matchExplanation}"`);

console.log('\nTHRESHOLDS');
console.log('  >= 75 or overlap >= 70  ->  exact');
console.log('  >= 40 or overlap >= 35  ->  nearby');
console.log('  otherwise               ->  other');

console.log('\nHOW A NEARBY STOP STILL PASSES');
const cross = scoreRideMatch({
  userPickup, userDrop, userRoute, userTimeMinutes: 510,
  candidatePickup: { latitude: 17.4110, longitude: 78.5200 },
  candidateDrop: { latitude: 17.4650, longitude: 78.5200 },
  candidateRoute: {
    type: 'LineString',
    coordinates: [[78.5200, 17.4110], [78.5200, 17.4400], [78.5200, 17.4650]],
  },
  candidateTimeMinutes: 660,
});
console.log(`  cross-city route scores ${cross.finalScore} (${cross.matchType})`);
console.log('  -> a long detour still ranks, but below an aligned route.');
