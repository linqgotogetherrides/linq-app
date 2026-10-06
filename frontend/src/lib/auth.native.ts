import {
  getAuth,
  signInWithPhoneNumber as firebaseSignInWithPhoneNumber,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';

export const signInWithPhoneNumber = (phone: string) =>
  firebaseSignInWithPhoneNumber(getAuth(), phone);

export const signOut = () => firebaseSignOut(getAuth());

/**
 * Returns the current Firebase ID token, or null when nobody is signed in.
 *
 * This is the token Supabase verifies to identify the caller. It is a short-lived
 * credential (about an hour) and is deliberately NEVER written to AsyncStorage:
 * Firebase already caches and refreshes it, and persisting it would widen the
 * window in which a stolen copy is useful. `forceRefresh` defaults to false, so
 * `getIdToken()` reuses the cached token and only spends a network round-trip
 * when it has actually expired.
 *
 * Pass `getIdToken(true)` ONCE right after a new user is created (or after their
 * custom claims change) to fetch a fresh token that includes the
 * `role: "authenticated"` claim. Do NOT force-refresh on every API call: the
 * ordinary accessToken path must stay cached.
 *
 * This file is the native build; on web, auth.web.ts provides a matching (null)
 * implementation so no Firebase module is pulled into the web bundle.
 */
export const getIdToken = async (forceRefresh = false): Promise<string | null> => {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken(forceRefresh);
  } catch {
    // A failed refresh must not crash a request; the caller falls back to the
    // anon key, which is exactly today's behaviour.
    return null;
  }
};
