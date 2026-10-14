import { test } from 'node:test';
import assert from 'node:assert/strict';

import { excludeSameLocation, isSameLocation } from '../duplicateGuard.ts';
import { buildSavedPlaces } from '../savedPlaces.ts';
import type { SavedLocation } from '@/src/types';

const home: SavedLocation = {
  label: 'Home',
  address: '12 Banjara Hills, Hyderabad',
  latitude: 17.4126,
  longitude: 78.4487,
};

const office: SavedLocation = {
  label: 'Office',
  address: '5 Cyber Towers, Hyderabad',
  latitude: 17.4435,
  longitude: 78.3772,
};

const college: SavedLocation = {
  label: 'College',
  address: 'Osmania University, Hyderabad',
  latitude: 17.4292,
  longitude: 78.4689,
};

const saved = buildSavedPlaces({ home, office, college });

/**
 * The selector is opened for exactly one field and receives the opposite
 * field's location so it can hide it and reject duplicates.
 */
function quickSelectsFor(opponent: SavedLocation | null) {
  return excludeSameLocation(saved, opponent);
}

test('1. picking a drop hides the current pickup from drop quick selects', () => {
  const options = quickSelectsFor(home);
  assert.deepEqual(options.map((o) => o.kind), ['office', 'college']);
});

test('2. picking a pickup hides the current drop from pickup quick selects', () => {
  const options = quickSelectsFor(college);
  assert.deepEqual(options.map((o) => o.kind), ['home', 'office']);
});

test('3. no opposite location yet -> every saved place stays available', () => {
  const options = quickSelectsFor(null);
  assert.deepEqual(options.map((o) => o.kind), ['home', 'office', 'college']);
});

test('4. remaining options are preserved, not just the filtered one', () => {
  const options = quickSelectsFor(office);
  assert.equal(options.length, 2);
  assert.ok(options.some((o) => isSameLocation(o.place, home)));
  assert.ok(options.some((o) => isSameLocation(o.place, college)));
});

test('5. selecting the opposite location again is detected as a duplicate', () => {
  assert.equal(isSameLocation(home, home), true);
  assert.equal(isSameLocation(home, office), false);
});

test('6. filtering never mutates the saved data', () => {
  const before = saved.length;
  quickSelectsFor(home);
  assert.equal(saved.length, before);
  assert.ok(saved.some((o) => isSameLocation(o.place, home)), 'home is still saved');
});

test('7. selecting an unrelated saved place is allowed', () => {
  const candidate = college;
  assert.equal(isSameLocation(candidate, home), false);
  assert.ok(quickSelectsFor(home).some((o) => isSameLocation(o.place, candidate)));
});

test('8. a fresh rider sees no saved chips at all', () => {
  const freshSaved = buildSavedPlaces(undefined);
  assert.deepEqual(freshSaved, []);
  assert.deepEqual(excludeSameLocation(freshSaved, null), []);
});