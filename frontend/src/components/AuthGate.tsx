import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useApp } from '@/src/context/AppContext';
import { colors } from '@/src/theme/tokens';

/**
 * Global sign-in gate.
 *
 * Previously only 10 of roughly 40 screens checked for a user, and the login
 * screen itself had a "skip login" and a "sign in later" button that both went
 * straight to the tabs. Anything not on the short list below was reachable
 * signed out.
 *
 * The gate waits for `booting` before deciding, so a rider with a saved session
 * is not flashed the login screen while the profile is still loading.
 */

/**
 * Reachable without an account. Everything else requires one.
 * `/otp` and `/account-creation` are steps of the signup flow and are reachable
 * only from `/login`, but are listed so a cold deep link cannot bounce forever.
 */
const PUBLIC_ROUTES = new Set([
  '/',
  '/index',
  '/onboarding',
  '/login',
  '/otp',
  '/account-creation',
  '/language',
  '/support',
  '/safety',
  // The SOS confirmation screen is reachable signed out on purpose. It is the
  // target of the lock-screen / home-screen tile, and it already handles a
  // visitor with no account: activation is disabled, it says an account is
  // needed, and it offers a one-tap 112 call. Gating it would drop someone
  // mid-emergency into a signup carousel and remove that call option.
  // /sos/active and /sos/evidence stay gated, since an incident only exists
  // once it has been activated by a signed-in rider.
  '/sos/confirm',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  // Anything nested under a public route is public too, e.g. /support/faq.
  return [...PUBLIC_ROUTES].some(
    (route) => route !== '/' && pathname.startsWith(`${route}/`),
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, booting } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (booting) return;
    const current = pathname ?? '/';
    if (isPublic(current)) return;
    if (!user) {
      // `replace` so the blocked screen does not sit in the history waiting
      // behind the login screen.
      router.replace('/onboarding');
    }
  }, [booting, user, pathname, router]);

  // Hold the screen until the session question is answered, otherwise a
  // protected screen would flash its contents for a frame first.
  if (booting) {
    return (
      <View
        testID="auth-gate-loading"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user && !isPublic(pathname ?? '/')) {
    // Render nothing while the redirect lands, so nothing protected is visible.
    return <View testID="auth-gate-redirecting" style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return <>{children}</>;
}
