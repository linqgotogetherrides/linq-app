import { RouteGeometry } from '../osrm';
import { matchRoutes } from '../routeMatcher';

// Sample coordinates (Hyderabad area routes)
// Route 1: Madhapur to Wipro Circle, Hitech City
const routeMadhapurToWipro: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.381, 17.447],
    [78.378, 17.445],
    [78.374, 17.443],
    [78.370, 17.441],
    [78.366, 17.439],
    [78.362, 17.437],
    [78.358, 17.435],
  ],
};

// Route 2: Same route with higher coordinate density (interpolated points)
const routeMadhapurToWiproDense: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.381, 17.447],
    [78.3795, 17.446],
    [78.378, 17.445],
    [78.376, 17.444],
    [78.374, 17.443],
    [78.372, 17.442],
    [78.370, 17.441],
    [78.368, 17.440],
    [78.366, 17.439],
    [78.364, 17.438],
    [78.362, 17.437],
    [78.360, 17.436],
    [78.358, 17.435],
  ],
};

// Route 3: Parallel road ~200 meters away
const routeParallel: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.381, 17.449], // slightly north
    [78.378, 17.447],
    [78.374, 17.445],
    [78.370, 17.443],
    [78.366, 17.441],
    [78.362, 17.439],
    [78.358, 17.437],
  ],
};

// Route 4: Opposite direction (Wipro Circle to Madhapur)
const routeOpposite: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.358, 17.435],
    [78.362, 17.437],
    [78.366, 17.439],
    [78.370, 17.441],
    [78.374, 17.443],
    [78.378, 17.445],
    [78.381, 17.447],
  ],
};

// Route 5: Completely different route (Secunderabad to Charminar)
const routeUnrelated: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.498, 17.439],
    [78.495, 17.410],
    [78.480, 17.385],
    [78.474, 17.361],
  ],
};

// Route 6: Sub-route (Inorbit Mall to Cyber Towers - middle portion of Route 1)
const routePartialSub: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.378, 17.445],
    [78.374, 17.443],
    [78.370, 17.441],
  ],
};

// Route 7: Slight GPS noisy version of Route 1
const routeGpsNoise: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [78.3811, 17.4471],
    [78.3779, 17.4451],
    [78.3742, 17.4429],
    [78.3698, 17.4412],
    [78.3661, 17.4389],
    [78.3622, 17.4371],
    [78.3581, 17.4351],
  ],
};

export function runRouteMatcherTests(): boolean {
  console.log('--- Running Route Matcher Automated Unit Tests ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${testName}: ${detail}`);
    } else {
      console.error(`❌ [FAIL] ${testName}: ${detail}`);
    }
  }

  // Test 1: Same route -> ~100% overlap
  const res1 = matchRoutes(routeMadhapurToWipro, routeMadhapurToWipro);
  assert(res1.symmetricOverlap >= 95, 'Test 1: Same Route', `Overlap: ${res1.symmetricOverlap}% (expected >= 95%)`);

  // Test 2: Same route with different coordinate density -> high overlap
  const res2 = matchRoutes(routeMadhapurToWipro, routeMadhapurToWiproDense);
  assert(res2.symmetricOverlap >= 85, 'Test 2: Different Density', `Overlap: ${res2.symmetricOverlap}% (expected >= 85%)`);

  // Test 3: Parallel road within threshold -> meaningful overlap
  const res3 = matchRoutes(routeMadhapurToWipro, routeParallel);
  assert(res3.symmetricOverlap >= 50, 'Test 3: Parallel Road', `Overlap: ${res3.symmetricOverlap}% (expected >= 50%)`);

  // Test 4: Completely different routes -> near 0%
  const res4 = matchRoutes(routeMadhapurToWipro, routeUnrelated);
  assert(res4.symmetricOverlap <= 10, 'Test 4: Unrelated Routes', `Overlap: ${res4.symmetricOverlap}% (expected <= 10%)`);

  // Test 5: Opposite direction -> heavily penalized / rejected
  const res5 = matchRoutes(routeMadhapurToWipro, routeOpposite);
  assert(res5.isOppositeDirection && res5.symmetricOverlap <= 15, 'Test 5: Opposite Direction', `IsOpposite: ${res5.isOppositeDirection}, Overlap: ${res5.symmetricOverlap}%`);

  // Test 6: Partial shared route -> intermediate overlap
  const res6 = matchRoutes(routeMadhapurToWipro, routePartialSub);
  assert(res6.symmetricOverlap >= 30 && res6.symmetricOverlap < 95, 'Test 6: Partial Shared Route', `Overlap: ${res6.symmetricOverlap}%`);

  // Test 7: One route contained inside another -> high overlap in proper direction
  const res7 = matchRoutes(routePartialSub, routeMadhapurToWipro);
  assert(res7.aToBOverlapRatio >= 0.8, 'Test 7: Sub-route Containment', `aToB Ratio: ${res7.aToBOverlapRatio}`);

  // Test 8: Small GPS geometry noise -> does not produce 0%
  const res8 = matchRoutes(routeMadhapurToWipro, routeGpsNoise);
  assert(res8.symmetricOverlap >= 85, 'Test 8: GPS Noise Handling', `Overlap: ${res8.symmetricOverlap}% (expected >= 85%)`);

  console.log(`\nTest Summary: ${passed}/${total} tests passed.`);
  return passed === total;
}

// Execute if run directly via node
if (typeof require !== 'undefined' && require.main === module) {
  const success = runRouteMatcherTests();
  process.exit(success ? 0 : 1);
}
