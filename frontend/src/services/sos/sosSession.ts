// Local SOS state for the app and for the headless background location task.
//
// The background task runs outside the React tree, so it cannot read context.
// It reads everything it needs from AsyncStorage via this module, which is the
// single source of truth for "which incident am I currently tracking".
//
// SECURITY: the tracking token is written here. It is an HMAC scoped to one
// incident and expires, so a device backup leak cannot be replayed forever, and
// it cannot be used against a different incident or user.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  session: '@linq/sos/session',
  anonKey: '@linq/sos/anon_key',
} as const;

export type SosTrackingSession = {
  sosId: string;
  referenceCode: string;
  userId: string;
  trackingToken: string;
  activatedAt: string;
  status: 'ACTIVE' | 'RESOLVED' | 'CANCELLED';
  contactsNotified: number;
  contactsTotal: number;
  backgroundLocationActive: boolean;
  currentRideId: string | null;
};

export async function readSosSession(): Promise<SosTrackingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.session);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SosTrackingSession;
    if (!parsed?.sosId || !parsed?.trackingToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSosSession(session: SosTrackingSession): Promise<void> {
  await AsyncStorage.setItem(KEYS.session, JSON.stringify(session));
}

export async function clearSosSession(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.session);
}

/**
 * The background task resolves the anon key from AsyncStorage first and only
 * falls back to the build-time env. This keeps the headless context working
 * even if the bundler did not inline the public variable into the task bundle.
 */
export async function resolveAnonKey(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(KEYS.anonKey);
    if (stored) return stored;
  } catch {
    // fall through
  }
  const fromEnv = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (fromEnv) {
    try {
      await AsyncStorage.setItem(KEYS.anonKey, fromEnv);
    } catch {
      // non-fatal
    }
  }
  return fromEnv;
}
