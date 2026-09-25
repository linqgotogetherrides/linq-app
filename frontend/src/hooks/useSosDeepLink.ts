import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

/**
 * Deep-link entry point for SOS.
 *
 * This is the contract that the native home-screen / lock-screen controls call:
 *
 *   linq://sos          -> SOS confirmation screen
 *   linq://sos/activate -> confirmation screen (deliberately NOT auto-activate)
 *
 * A widget or quick-settings tile opens this URL, which brings the app to the
 * confirmation step. It deliberately does not skip confirmation: a widget tap
 * is easy to trigger accidentally (pocket, mis-swipe, accidental lock-screen
 * press) and silently raising an emergency that alerts real people is worse
 * than one extra tap.
 *
 * See docs/SOS_HOME_SCREEN_NATIVE.md for the Android App Widget / Quick
 * Settings Tile and the iOS App Intent / Widget that call this URL.
 */
export function useSosDeepLink(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const route = (url: string | null) => {
      if (cancelled || !url) return;
      try {
        // Handles both "linq://sos" and the exp:// form Expo produces.
        const path = Linking.parse(url).path?.replace(/^\/+/, '') ?? '';
        if (path === 'sos' || path.startsWith('sos/')) {
          router.push('/sos/confirm');
        }
      } catch {
        // A malformed link should never crash the app.
      }
    };

    // Cold start
    Linking.getInitialURL().then(route).catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => route(url));

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);
}
