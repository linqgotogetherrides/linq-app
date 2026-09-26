import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { useApp } from '@/src/context/AppContext';
import { isPublicRoute, withNext } from '@/src/lib/authNavigation';
import { colors } from '@/src/theme/tokens';

/**
 * Global sign-in gate.
 *
 * Previously only 10 of roughly 40 screens checked for a user, and the login
 * screen had a "skip" and a "sign in later" button that both went straight to
 * the tabs, so the app was browsable without an account.
 *
 * The splash is app/index.tsx and owns "/". The tabs home was moved to
 * "/(tabs)/home" so the two no longer collide, which is what previously made the
 * app open on Home with no sign-up prompt. This component covers the boot period,
 * redirects a signed-out rider to onboarding, and otherwise lets the navigator
 * render.
 *
 * `booting` is waited on so a rider with a saved session is not flashed the
 * login screen while their profile loads.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, booting } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (booting) return;
    const current = pathname ?? '/';
    if (isPublicRoute(current)) return;
    if (!user) {
      // `replace` so the blocked screen does not sit in history behind login.
      // The destination is carried so the rider returns to it after signing in.
      router.replace(withNext('/onboarding', current));
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

  if (!user && !isPublicRoute(pathname ?? '/')) {
    // Render nothing while the redirect lands, so nothing protected is visible.
    return (
      <View
        testID="auth-gate-redirecting"
        style={{ flex: 1, backgroundColor: colors.background }}
      />
    );
  }

  return <>{children}</>;
}


