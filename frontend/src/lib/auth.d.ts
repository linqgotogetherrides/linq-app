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

/**
 * Whether this build can produce a real, server-verifiable identity token.
 *
 * True only on native, where `@react-native-firebase/auth` is wired up. The web
 * build's `auth.web.ts` is a demo stub whose OTP is never actually sent and
 * which issues no token, so `getIdToken()` there always returns null and any
 * credential-gated feature would be running on the public anon key.
 *
 * Features that need the server to trust the caller's identity must check this
 * and refuse with an explanation rather than proceed unauthenticated.
 */
export declare function supportsFirebaseIdentity(): boolean;


/** Returns the currently persisted Firebase UID, or null when unavailable. */
export declare function getCurrentFirebaseUserId(): Promise<string | null>;
