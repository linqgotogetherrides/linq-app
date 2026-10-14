import type { SavedLocation, SavedLocationType, SavedUserLocations } from '@/src/types';
import { isSameLocation, type SavedPlaceOption } from './duplicateGuard.ts';

/**
 * A saved place tagged for display. `custom` carries the rider's own name,
 * so the chip shows that name rather than a generic label.
 */
export type SavedPlaceKind = SavedLocationType | 'custom';

export interface ResolvedSavedPlace extends SavedPlaceOption {
  kind: SavedPlaceKind;
  displayLabel: string;
}

/**
 * Builds the quick-select list from genuinely saved places only.
 *
 * This is the guard against the "fake Home/Office" problem: a rider who has
 * saved nothing gets an empty array, never placeholder entries. Nothing is
 * invented here — every entry comes from a record the user actually saved.
 */
export function buildSavedPlaces(
  saved: SavedUserLocations | undefined
): ResolvedSavedPlace[] {
  if (!saved) return [];

  const typed: { kind: SavedPlaceKind; place?: SavedLocation }[] = [
    { kind: 'home', place: saved.home },
    { kind: 'office', place: saved.office },
    { kind: 'college', place: saved.college },
  ];

  const custom = Array.isArray(saved.custom)
    ? saved.custom.map((place) => ({ kind: 'custom' as const, place }))
    : [];

  return [...typed, ...custom]
    .filter((entry): entry is { kind: SavedPlaceKind; place: SavedLocation } =>
      Boolean(entry.place)
    )
    .map((entry) => ({
      type: entry.kind === 'custom' ? ('custom' as unknown as SavedLocationType) : entry.kind,
      place: entry.place,
      kind: entry.kind,
      // For custom places the rider's own name is the label.
      displayLabel: entry.place.label,
    }));
}

/** True when this exact place is already in the rider's saved list. */
export function isAlreadySavedPlace(
  location: SavedLocation,
  saved: ResolvedSavedPlace[]
): boolean {
  return saved.some(({ place }) => isSameLocation(place, location));
}

/**
 * Whether to offer the optional "save this place" prompt.
 *
 * Never offered for a place already saved, and never re-offered for a place
 * the rider dismissed earlier in this session, so booking is not interrupted
 * repeatedly.
 */
export function shouldOfferSavePrompt(
  location: SavedLocation,
  saved: ResolvedSavedPlace[],
  dismissedKeys: ReadonlySet<string>
): boolean {
  if (isAlreadySavedPlace(location, saved)) return false;
  return !dismissedKeys.has(savedPlaceKey(location));
}

/** Stable key for a place, used to remember dismissals. */
export function savedPlaceKey(location: SavedLocation): string {
  return `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}