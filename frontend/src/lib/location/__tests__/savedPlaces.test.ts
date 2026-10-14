import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSavedPlaces,
  isAlreadySavedPlace,
  savedPlaceKey,
  shouldOfferSavePrompt,
} from '../savedPlaces.ts';
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

const gym: SavedLocation = {
  label: 'Gym',
  address: '3 Gachibowli Road, Hyderabad',
  latitude: 17.44,
  longitude: 78.35,
};

// A brand new rider: the column defaults to '{}', so nothing is saved.
test('new user with no saved places gets an empty list (no fake Home/Office)', () => {
  assert.deepEqual(buildSavedPlaces(undefined), []);
  assert.deepEqual(buildSavedPlaces({}), []);
});

test('empty objects for each type produce no entries', () => {
  const built = buildSavedPlaces({
    home: undefined,
    office: undefined,
    college: undefined,
    custom: [],
  });
  assert.deepEqual(built, []);
});

test('only genuinely saved records become chips', () => {
  const built = buildSavedPlaces({ home, office });
  assert.equal(built.length, 2);
  assert.equal(built[0].kind, 'home');
  assert.equal(built[1].kind, 'office');
  assert.equal(built[0].displayLabel, 'Home');
});

test('partially saved user does not get invented missing entries', () => {
  const built = buildSavedPlaces({ office });
  assert.equal(built.length, 1);
  assert.equal(built[0].kind, 'office');
});

test('custom saved places keep the rider-supplied name as the label', () => {
  const built = buildSavedPlaces({ custom: [gym] });
  assert.equal(built.length, 1);
  assert.equal(built[0].kind, 'custom');
  assert.equal(built[0].displayLabel, 'Gym');
});

test('custom places are listed alongside typed ones', () => {
  const built = buildSavedPlaces({ home, custom: [gym] });
  assert.deepEqual(built.map((p) => p.kind), ['home', 'custom']);
});

test('malformed custom arrays are ignored rather than crashing', () => {
  const built = buildSavedPlaces({
    custom: undefined,
  } as never);
  assert.deepEqual(built, []);
  const nulls = buildSavedPlaces({ custom: [null, undefined] } as never);
  assert.deepEqual(nulls, []);
});

test('a selected location is not automatically saved', () => {
  const before = buildSavedPlaces({ home });
  // Picking an arbitrary address must not mutate the saved set.
  assert.equal(before.length, 1);
  assert.equal(isAlreadySavedPlace(office, before), false);
});

test('isAlreadySavedPlace matches by coordinates, not label', () => {
  const built = buildSavedPlaces({ home });
  const renamed = { ...home, label: 'My place' };
  assert.equal(isAlreadySavedPlace(renamed, built), true);
  assert.equal(isAlreadySavedPlace(office, built), false);
});

test('save prompt is offered for a new, unsaved place', () => {
  assert.equal(shouldOfferSavePrompt(office, buildSavedPlaces({ home }), new Set()), true);
});

test('save prompt is NOT offered for an already saved place', () => {
  assert.equal(shouldOfferSavePrompt(home, buildSavedPlaces({ home }), new Set()), false);
});

test('save prompt is not repeated after the rider dismisses it', () => {
  const key = savedPlaceKey(office);
  assert.equal(shouldOfferSavePrompt(office, buildSavedPlaces({ home }), new Set([key])), false);
});

test('dismissing one place does not suppress the prompt for another', () => {
  const dismissed = new Set([savedPlaceKey(office)]);
  assert.equal(shouldOfferSavePrompt(gym, buildSavedPlaces({ home }), dismissed), true);
});

test('savePlaceKey is stable and distinguishes nearby places', () => {
  assert.equal(savedPlaceKey(office), savedPlaceKey({ ...office }));
  assert.notEqual(savedPlaceKey(office), savedPlaceKey(gym));
});

test('rider with no saved places is never prompted to re-save a saved place', () => {
  // Nothing saved yet, so everything is new and savable.
  assert.equal(shouldOfferSavePrompt(home, [], new Set()), true);
});