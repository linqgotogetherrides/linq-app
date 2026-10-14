import type { SavedLocation, SavedLocationType } from '@/src/types';

/** ~11 metres. Matches the tolerance used by the location flow. */
export const COORDINATE_EPSILON = 0.0001;

export const DUPLICATE_LOCATION_MESSAGE =
  'Pickup and drop locations must be different.';

export interface SavedPlaceOption {
  type: SavedLocationType;
  place: SavedLocation;
}

function normalizeAddress(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Compares two locations by normalized coordinates first, then by normalized
 * address. Never relies on display labels alone, so a saved "Home" and a search
 * result for the same street are recognised as the same place.
 */
export function isSameLocation(
  a: SavedLocation | null,
  b: SavedLocation | null
): boolean {
  if (!a || !b) return false;

  if (
    Math.abs(a.latitude - b.latitude) < COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) < COORDINATE_EPSILON
  ) {
    return true;
  }

  const addressA = normalizeAddress(a.address || a.label);
  const addressB = normalizeAddress(b.address || b.label);
  return addressA.length > 0 && addressA === addressB;
}

/** Drop quick selects must not offer the location already used as pickup. */
export function excludeSameLocation<T extends SavedPlaceOption>(
  options: T[],
  location: SavedLocation | null
): T[] {
  return options.filter(({ place }) => !isSameLocation(place, location));
}