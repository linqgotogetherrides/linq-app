/**
 * Pure PAN entry form logic for the dedicated PAN verification page.
 *
 * Field set, limits and behaviour mirror the reference prototype
 * (`exp/gotogether-verification-main`), which posts a full name and a PAN
 * number and requires an explicit consent before anything is sent:
 *
 *   * name — required, at most 100 characters
 *   * PAN  — required, exactly  /^[A-Z]{5}[0-9]{4}[A-Z]$/, uppercased,
 *            whitespace stripped, at most 10 characters
 *   * consent — required; nothing is submitted without it
 *
 * WHAT THESE VALIDATIONS AUTHORISE
 *   Nothing. The prototype's straight-through API is NOT used for marking a
 *   rider verified, and a PAN that merely matches the documented pattern is
 *   not evidence anyone is verified. Pattern checks here are pre-flight
 *   input hygiene only; verification happens through Cashfree's hosted
 *   Secure ID flow and is written exclusively by the backend webhook.
 */

/** Documented PAN shape: 5 letters, 4 digits, then 1 letter. */
export const PAN_FORMAT_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** The prototype caps the PAN input at 10 characters. */
export const PAN_MAX_LENGTH = 10;

/** The prototype caps the full-name input at 100 characters. */
export const NAME_MAX_LENGTH = 100;

/** Helper line shown under the PAN input, as in the prototype. */
export const PAN_FORMAT_HINT = 'Format: 5 letters, 4 numbers, then 1 letter.';

/** Placeholder PAN shown in the field and quoted in its error message. */
export const PAN_EXAMPLE = 'ABCDE1234F';

/**
 * Mirror the prototype's onChange behaviour: force uppercase, strip all
 * whitespace, and hard-cap the length so the character counter and the
 * pattern cannot disagree.
 */
export function normalizePanInput(raw: string): string {
  return raw.toUpperCase().replace(/\s/g, '').slice(0, PAN_MAX_LENGTH);
}

/** True only when the PAN matches the documented shape exactly. */
export function isValidPanFormat(pan: string): boolean {
  return PAN_FORMAT_PATTERN.test(pan);
}

/** Which field a validation failure belongs to, for inline error placement. */
export type PanEntryField = 'name' | 'pan' | 'consent';

export interface PanEntry {
  name?: string;
  pan?: string;
  consent?: boolean;
}

export interface PanEntryOutcome {
  ok: boolean;
  field: PanEntryField | null;
  error: string | null;
}

function invalid(field: PanEntryField, error: string): PanEntryOutcome {
  return { ok: false, field, error };
}

const ACCEPTED: PanEntryOutcome = { ok: true, field: null, error: null };

/**
 * Validate one submission attempt.
 *
 * The missing-check order mirrors the reference prototype: consent is the
 * gate it names first, then the PAN shape, then the name — the one field the
 * prototype marks `required` though its own submit checks skip it.
 */
export function validatePanEntry(entry: PanEntry): PanEntryOutcome {
  if (!entry.consent) {
    return invalid('consent', 'Please confirm that you consent to PAN verification.');
  }

  const pan = normalizePanInput(entry.pan ?? '');
  if (pan.length !== PAN_MAX_LENGTH || !isValidPanFormat(pan)) {
    return invalid('pan', `Enter a PAN in the format ${PAN_EXAMPLE}.`);
  }

  const name = (entry.name ?? '').trim();
  if (!name) {
    return invalid('name', 'Enter your full name as it appears on your PAN.');
  }
  if (name.length > NAME_MAX_LENGTH) {
    return invalid('name', 'Your full name is too long.');
  }

  return ACCEPTED;
}

/**
 * Whether the verification check's name actually reaches the provider.
 *
 * The hosted KYC session is requested with the name stored on the rider's
 * LinQ profile (`create-kyc-session` reads it from `user_profiles` itself),
 * so a rider who typed a different alias gets an honest heads-up instead of a
 * silent provider-side mismatch. Empty on either side is deliberately not a
 * mismatch.
 */
export function nameMatchesProfileNote(name: string, profileName: string | null | undefined): string | null {
  const entered = (name ?? '').trim().replace(/\s+/g, ' ');
  const profile = (profileName ?? '').trim().replace(/\s+/g, ' ');
  if (!entered || !profile) return null;
  if (entered.toLowerCase() === profile.toLowerCase()) return null;
  return 'Verification is requested with the name on your LinQ profile. If it does not match your PAN exactly, edit your profile name before continuing.';
}

/**
 * Duplicate-submission guard.
 *
 * True only when a submission can actually go out. `busy` is set before the
 * request is fired and cleared in a finally block, so a double tap — even on
 * a slow connection — cannot mint two sessions.
 */
export function canBeginVerification(args: { busy: boolean }): boolean {
  return !args.busy;
}
