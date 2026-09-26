import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers who is signed in.
 *
 * Without this the app has no session at all: `user` starts null on every cold
 * launch, so a returning rider is bounced through the whole signup flow again.
 * The web auth in src/lib/auth.web.ts is a mock that mints `web-uid-<phone>` and
 * keeps nothing, so the uid has to be persisted here. Native Firebase does
 * persist its own session, but nothing in the app ever read `currentUser` back,
 * so the same uid is stored there too and both platforms behave the same way.
 *
 * This is a convenience cache, not a credential. Everything that matters is
 * authorised server-side against the id the caller proves it controls, so
 * clearing this only means signing in again.
 */

const SESSION_KEY = 'linq.session.uid';

export async function saveSession(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, userId);
  } catch {
    // A failed write only costs the rider a re-login next launch.
  }
}

export async function readSession(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(SESSION_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do; the next successful sign-in overwrites it.
  }
}
