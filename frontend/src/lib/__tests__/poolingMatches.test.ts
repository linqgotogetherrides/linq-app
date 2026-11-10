import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeToMinutes, scoreRideMatch } from '../routing/routeScoring.ts';
import { matchRoutes } from '../routing/routeMatcher.ts';
import type { Coordinates, RouteGeometry } from '../routing/osrm.ts';

// Sample Driver corridor: Koramangala -> Indiranagar -> Marathahalli -> Whitefield
const driverRoute: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [77.6245, 12.9352], // Koramangala (Start)
    [77.6387, 12.9719], // Indiranagar
    [77.6974, 12.9591], // Marathahalli
    [77.7499, 12.9698], // Whitefield (End)
  ],
};

// En-route passenger going same direction: Indiranagar -> Marathahalli
const enRoutePassengerRoute: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [77.6387, 12.9719], // Indiranagar
    [77.6680, 12.9655], // HAL en route
    [77.6974, 12.9591], // Marathahalli
  ],
};

// Reverse direction passenger: Marathahalli -> Indiranagar
const reversePassengerRoute: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [77.6974, 12.9591], // Marathahalli
    [77.6680, 12.9655], // HAL
    [77.6387, 12.9719], // Indiranagar
  ],
};

// Unrelated passenger in North Bangalore: Hebbal -> Yelahanka
const unrelatedRoute: RouteGeometry = {
  type: 'LineString',
  coordinates: [
    [77.5970, 13.0358], // Hebbal
    [77.5963, 13.1007], // Yelahanka
  ],
};

describe('Intelligent Pooling Matches', () => {
  it('identifies en-route passenger corridor with high overlap', () => {
    const match = matchRoutes(enRoutePassengerRoute, driverRoute);
    assert.ok(
      match.aToBOverlapRatio >= 0.7,
      `Expected passenger route to be covered by driver corridor (got ${match.aToBOverlapRatio})`
    );
    assert.equal(match.isOppositeDirection, false);
  });

  it('detects and penalizes reverse direction passengers along the same road', () => {
    const match = matchRoutes(reversePassengerRoute, driverRoute);
    assert.equal(match.isOppositeDirection, true);
    assert.ok(
      match.symmetricOverlap <= 25,
      `Expected reverse direction overlap to be penalized below 25% (got ${match.symmetricOverlap})`
    );
  });

  it('rejects unrelated cross-town routes', () => {
    const match = matchRoutes(unrelatedRoute, driverRoute);
    assert.ok(
      match.symmetricOverlap <= 10,
      `Expected unrelated route overlap to be <= 10% (got ${match.symmetricOverlap})`
    );
  });

  it('scores en-route commuter match with high rating and close departure', () => {
    const userPickup: Coordinates = { latitude: 12.9719, longitude: 77.6387 }; // Indiranagar
    const userDrop: Coordinates = { latitude: 12.9591, longitude: 77.6974 }; // Marathahalli
    const candidatePickup: Coordinates = { latitude: 12.9352, longitude: 77.6245 }; // Koramangala
    const candidateDrop: Coordinates = { latitude: 12.9698, longitude: 77.7499 }; // Whitefield

    const result = scoreRideMatch({
      userPickup,
      userDrop,
      userRoute: enRoutePassengerRoute,
      userTimeMinutes: parseTimeToMinutes('09:00 AM'),
      candidatePickup,
      candidateDrop,
      candidateRoute: driverRoute,
      candidateTimeMinutes: parseTimeToMinutes('08:50 AM'), // 10 min diff
    });

    assert.ok(result.finalScore >= 60, `Expected score >= 60, got ${result.finalScore}`);
    assert.ok(
      result.matchType === 'exact' || result.matchType === 'nearby',
      `Expected exact or nearby match, got ${result.matchType}`
    );
  });

  it('properly penalizes departure times that are hours apart', () => {
    const userPickup: Coordinates = { latitude: 12.9719, longitude: 77.6387 };
    const userDrop: Coordinates = { latitude: 12.9591, longitude: 77.6974 };
    const candidatePickup: Coordinates = { latitude: 12.9352, longitude: 77.6245 };
    const candidateDrop: Coordinates = { latitude: 12.9698, longitude: 77.7499 };

    const closeTimeResult = scoreRideMatch({
      userPickup,
      userDrop,
      userRoute: enRoutePassengerRoute,
      userTimeMinutes: parseTimeToMinutes('09:00 AM'),
      candidatePickup,
      candidateDrop,
      candidateRoute: driverRoute,
      candidateTimeMinutes: parseTimeToMinutes('09:05 AM'),
    });

    const farTimeResult = scoreRideMatch({
      userPickup,
      userDrop,
      userRoute: enRoutePassengerRoute,
      userTimeMinutes: parseTimeToMinutes('09:00 AM'),
      candidatePickup,
      candidateDrop,
      candidateRoute: driverRoute,
      candidateTimeMinutes: parseTimeToMinutes('04:00 PM'), // 7 hours diff
    });

    assert.ok(
      closeTimeResult.finalScore > farTimeResult.finalScore,
      `Close time (${closeTimeResult.finalScore}) should score higher than far time (${farTimeResult.finalScore})`
    );
  });
});
