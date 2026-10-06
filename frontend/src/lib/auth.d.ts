import type { ConfirmationResult } from '@react-native-firebase/auth';

export declare function signInWithPhoneNumber(phone: string): Promise<ConfirmationResult>;
export declare function signOut(): Promise<void>;

/**
 * The current Firebase ID token, or null when signed out / unavailable.
 * Used by the Supabase client so Edge Functions receive a verifiable identity.
 *
 * @param forceRefresh Pass true ONCE after signup / a claim change to fetch a
 *   fresh token that carries the `role: "authenticated"` claim. Defaults to
 *   false so the normal path uses Firebase's cached token.
 */
export declare function getIdToken(forceRefresh?: boolean): Promise<string | null>;
