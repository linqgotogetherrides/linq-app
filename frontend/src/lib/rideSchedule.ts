import { format, isValid, parse } from 'date-fns';

/**
 * Ride schedule helpers.
 *
 * The date picker used to hand back a display label like "Sat, 24 Aug" while
 * the database write only accepted ISO, so toNullableDate() silently stored NULL
 * for every ride. There was therefore no date to compare against, which is what
 * makes "cannot pick a past date" and "close the post when the date passes"
 * impossible to implement. Dates are ISO internally and formatted for display.
 */

const ISO = 'yyyy-MM-dd';

/** "2026-09-28" -> "Sat, 28 Sep". Returns undefined for anything unusable. */
export function formatTravelDate(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const parsed = parse(iso, ISO, new Date());
  if (!isValid(parsed)) return undefined;
  return format(parsed, 'EEE, d MMM');
}

/**
 * Accepts ISO and the older display labels so rows written before this change,
 * and any params still carrying a label, keep working.
 * Returns ISO or undefined.
 */
export function toIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  // "Today, 28 Sep" / "Sat, 28 Sep" / "28 Sep"
  const cleaned = trimmed.replace(/^today,?\s*/i, '');
  const candidates = ['d MMM yyyy', 'EEE, d MMM yyyy', 'd MMM'];
  for (const pattern of candidates) {
    const parsed = parse(cleaned, pattern, new Date());
    if (isValid(parsed)) return format(parsed, ISO);
  }
  return undefined;
}

/** "8:30 PM" / "08:30" -> minutes from midnight, or undefined. */
export function parseTimeToMinutes(value?: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  const suffix = match[3]?.toUpperCase();
  if (suffix === 'PM' && hours < 12) hours += 12;
  if (suffix === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/** The moment a scheduled ride leaves. undefined when it is not fully specified. */
export function scheduleDateTime(
  dateIso?: string | null,
  time?: string | null,
): Date | undefined {
  const iso = toIsoDate(dateIso);
  if (!iso) return undefined;
  const minutes = parseTimeToMinutes(time);
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return undefined;
  // A ride with no time set is open-ended, so it has no expiry.
  if (minutes === undefined) return undefined;
  base.setMinutes(minutes);
  return base;
}

/** True when the chosen date is before today. */
export function isDateBeforeToday(dateIso?: string | null, now = new Date()): boolean {
  const iso = toIsoDate(dateIso);
  if (!iso) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(`${iso}T00:00:00`) < today;
}

/** True when two dates fall on the same calendar day. */
export function isSameCalendarDay(dateIso: string | null | undefined, other: Date): boolean {
  const iso = toIsoDate(dateIso);
  if (!iso) return false;
  const parsed = new Date(`${iso}T00:00:00`);
  return (
    parsed.getFullYear() === other.getFullYear() &&
    parsed.getMonth() === other.getMonth() &&
    parsed.getDate() === other.getDate()
  );
}

/** True when a bare time has already passed today. */
export function isTimeBeforeNow(time?: string | null, now = new Date()): boolean {
  const minutes = parseTimeToMinutes(time);
  if (minutes === undefined) return false;
  return minutes <= now.getHours() * 60 + now.getMinutes();
}

/** True when date+time together are already behind us. */
export function isScheduleInPast(
  dateIso?: string | null,
  time?: string | null,
  now = new Date(),
): boolean {
  const when = scheduleDateTime(dateIso, time);
  if (!when) return false;
  return when.getTime() <= now.getTime();
}

/**
 * Why a post can no longer take requests, or null when it is still live.
 * A post with no date or no time is open-ended and never expires.
 */
export function expiryReason(
  ride: { dateISO?: string | null; time?: string | null },
  now = new Date(),
): 'date_passed' | null {
  return isScheduleInPast(ride.dateISO, ride.time, now) ? 'date_passed' : null;
}
