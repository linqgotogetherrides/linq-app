/**
 * Identity rules shared by the session cache and the auth gate.
 *
 * The retired web phone stub minted ids shaped `web-uid-<phone>` from whatever
 * number a visitor typed. No server ever verified them, so they are never a
 * valid signed-in identity — not on restore, and not when writing a session.
 */

export const LEGACY_WEB_UID_PREFIX = 'web-uid-';

export function isLegacyWebSession(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith(LEGACY_WEB_UID_PREFIX);
}
