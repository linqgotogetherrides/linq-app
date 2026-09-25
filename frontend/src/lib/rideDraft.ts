/**
 * Create-ride draft store.
 *
 * Picking pickup/destination pushes a location flow and comes back. If the
 * Create screen ever remounts, plain useState initialisers re-run and silently
 * reset everything the rider had already entered (most visibly the travel time,
 * which jumped back to the 08:00 AM default and then got published).
 *
 * Keeping the draft at module scope means it survives a remount for the life of
 * the app session, and is cleared explicitly once the ride is saved.
 */

export type RideDraft = {
  travelTime: string;
  returnTime: string;
  travelDate: string;
  price: number;
};

let draft: RideDraft | null = null;

export function getRideDraft(): RideDraft | null {
  return draft;
}

export function updateRideDraft(patch: Partial<RideDraft>): RideDraft {
  draft = { ...(draft ?? DEFAULT_DRAFT), ...patch };
  return draft;
}

export function clearRideDraft(): void {
  draft = null;
}

const DEFAULT_DRAFT: RideDraft = {
  travelTime: '08:00 AM',
  returnTime: '06:00 PM',
  travelDate: '',
  price: 0,
};

/** ₹2 per km, matching the hint shown on the price slider. */
export function suggestPricePerSeat(distanceMeters?: number | null): number {
  if (!distanceMeters || distanceMeters <= 0) return 0;
  const raw = (distanceMeters / 1000) * 2;
  // Nearest ₹10, clamped to the slider range.
  const rounded = Math.round(raw / 10) * 10;
  return Math.min(300, Math.max(50, rounded));
}
