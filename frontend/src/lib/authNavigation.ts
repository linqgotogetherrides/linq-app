/**
 * Where a rider is allowed to be, and where they land once signed in.
 *
 * Shared by the auth gate and every step of the signup flow so the public-route
 * list and the "where next" rule cannot drift apart between files.
 */
import type { Href } from 'expo-router';

/**
 * Reachable without an account.
 *
 * '/' is the splash, which is public. The tabs home lives at '/(tabs)/home' so
 * it does not collide with the splash at '/', and it is gated like any other
 * screen.
 *
 * `/sos/confirm` is here on purpose: it is the target of the lock-screen and
 * home-screen SOS tile, and it already handles a visitor with no account by
 * disabling activation, saying an account is needed, and offering a one-tap 112
 * call. Gating it would drop someone mid-emergency into a signup carousel.
 * `/sos/active` and `/sos/evidence` stay gated, since an incident only exists
 * once a signed-in rider has activated one.
 */
export const PUBLIC_ROUTES = new Set([
  '/',
  '/index',
  '/onboarding',
  '/login',
  '/otp',
  '/account-creation',
  '/language',
  '/support',
  '/safety',
  '/sos/confirm',
]);

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return [...PUBLIC_ROUTES].some(
    (route) => route !== '/' && pathname.startsWith(`${route}/`),
  );
}

/**
 * Validates a `next` destination.
 *
 * Only same-app absolute paths are accepted. Anything else is discarded so a
 * crafted link cannot bounce a rider off to another origin after signup, and so
 * pointing `next` back at the auth flow cannot loop.
 */
export function sanitizeNext(next: unknown): string | undefined {
  if (typeof next !== 'string') return undefined;
  const value = next.trim();
  if (!value.startsWith('/')) return undefined;
  // `//evil.com` and `/\evil.com` are treated as absolute by some resolvers.
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (isPublicRoute(value.split('?')[0])) return undefined;
  return value;
}

/** Default landing spot once an account exists. */
export const DEFAULT_HOME = '/(tabs)/home' as const;

/**
 * Where to send a rider after the flow finishes: the page they originally
 * asked for, or Home.
 */
export function destinationAfterAuth(next: unknown): Href {
  // Safe to assert: sanitizeNext only ever returns a same-app absolute path,
  // and Href is the union of exactly those routes plus external URLs.
  return (sanitizeNext(next) ?? DEFAULT_HOME) as Href;
}

/**
 * Carries `next` across a navigation, omitting it when there is nothing to keep.
 * Generic so the literal route type survives, which expo-router's typed routes
 * require; widening it to `string` would not typecheck at the call site.
 */
export function withNext<T extends string>(
  pathname: T,
  next: unknown,
): { pathname: T; params?: { next: string } } {
  const clean = sanitizeNext(next);
  return clean ? { pathname, params: { next: clean } } : { pathname };
}
