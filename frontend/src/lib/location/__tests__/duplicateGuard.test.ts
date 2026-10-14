import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DUPLICATE_LOCATION_MESSAGE,
  excludeSameLocation,
  isSameLocation,
} from '../duplicateGuard.ts';

const home = {
  label: 'Home',
  address: '12 Banjara Hills, Hyderabad',
  latitude: 17.4126,
  longitude: 78.4487,
};

const office = {
  label: 'Office',
  address: '5 Cyber Towers, Hyderabad',
  latitude: 17.4435,
  longitude: 78.3772,
};

const college = {
  label: 'College',
  address: 'Osmania University, Hyderabad',
  latitude: 17.4292,
  longitude: 78.4689,
};

const savedPlaces = [
  { type: 'home' as const, place: home },
  { type: 'office' as const, place: office },
  { type: 'college' as const, place: college },
];

const keys = (opts: { type: string }[]) => opts.map((o) => o.type);

test('1. Home pickup -> Home absent from drop quick selects', () => {
  const drop = excludeSameLocation(savedPlaces, home);
  assert.deepEqual(keys(drop), ['office', 'college']);
});

test('2. Office pickup -> Office absent from drop quick selects', () => {
  const drop = excludeSameLocation(savedPlaces, office);
  assert.deepEqual(keys(drop), ['home', 'college']);
});

test('3. Home pickup -> other valid quick selects remain available', () => {
  const drop = excludeSameLocation(savedPlaces, home);
  assert.equal(drop.length, 2);
  assert.ok(drop.some((o) => o.type === 'office'));
  assert.ok(drop.some((o) => o.type === 'college'));
});

test('4. Drop selected -> that location absent from pickup quick selects', () => {
  const pickup = excludeSameLocation(savedPlaces, college);
  assert.deepEqual(keys(pickup), ['home', 'office']);
});

test('5. Same location for both is detected as a duplicate', () => {
  assert.equal(isSameLocation(home, home), true);
  assert.equal(isSameLocation(home, office), false);
  assert.equal(isSameLocation(office, home), false);
});

test('6. Options update dynamically when the opposite field changes', () => {
  let pickup = null;
  let previous = keys(excludeSameLocation(savedPlaces, pickup));
  assert.deepEqual(previous, ['home', 'office', 'college']);

  pickup = home;
  const next = keys(excludeSameLocation(savedPlaces, pickup));
  assert.deepEqual(next, ['office', 'college']);
  assert.notDeepEqual(next, previous);
});

test('7. Map/search duplicates match on coordinates, not display names', () => {
  const fromSearch = {
    label: 'Banjara Hills Rd No 12',
    address: '12  Banjara   Hills, Hyderabad', // spacing/case differ
    latitude: 17.4126 + 0.00002, // ~2m away
    longitude: 78.4487 - 0.00002,
  };
  assert.equal(isSameLocation(home, fromSearch), true);
});

test('8. Address fallback matches when coordinates are unavailable', () => {
  const elsewhere = {
    label: 'Somewhere else',
    address: '12 banjara hills, hyderabad',
    latitude: 10.0,
    longitude: 10.0,
  };
  assert.equal(isSameLocation(home, elsewhere), true);
});

test('9. Distinct locations are never treated as duplicates', () => {
  assert.equal(isSameLocation(home, office), false);
  assert.equal(isSameLocation(office, college), false);
  assert.equal(isSameLocation(null, home), false);
  assert.equal(isSameLocation(home, null), false);
  assert.equal(isSameLocation(null, null), false);
});

test('10. Excluding a location not in the list is a no-op', () => {
  const unknown = {
    label: 'Cafe',
    address: '1 Banjara Hills Road No 1',
    latitude: 17.4130,
    longitude: 78.4490,
  };
  assert.deepEqual(keys(excludeSameLocation(savedPlaces, unknown)), [
    'home',
    'office',
    'college',
  ]);
});

test('11. Empty quick-select list stays empty (no crash)', () => {
  assert.deepEqual(excludeSameLocation([], home), []);
});

test('12. Validation message matches the required copy', () => {
  assert.equal(
    DUPLICATE_LOCATION_MESSAGE,
    'Pickup and drop locations must be different.'
  );
});