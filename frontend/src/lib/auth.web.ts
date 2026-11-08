/**
 * Web authentication is deliberately locked down.
 *
 * There is no Firebase web SDK in this build. The previous implementation was a
 * demo stub that "sent" no OTP and accepted any six-digit code, then minted a
 * synthetic `web-uid-<phone>` identity. That let anyone sign in as an arbitrary
 * phone number, and no server could verify the resulting id.
 *
 * Phone sign-in now fails closed on web. Web riders must use Google (verified by
 * Supabase Auth) or continue in the Linq mobile app, where Firebase issues a
 * real phone credential.
 */
export const signInWithPhoneNumber = async (_phone: string): Promise<never> => {
  throw new Error(
    'Phone sign-in is not available on the web. Use Google or continue in the Linq mobile app.',
  );
};

export const signOut = async () => {};

/**
 * Web has no Firebase session, so there is never a Firebase ID token here.
 * Returning null keeps the Supabase client on the anon key for web, which is the
 * existing behaviour, and — importantly — means the web bundle never imports
 * @react-native-firebase/auth.
 */
export const getIdToken = async (_forceRefresh = false): Promise<string | null> => null;

/**
 * False, deliberately and honestly.
 *
 * The web build cannot produce a server-verifiable Firebase identity. Features
 * gated on one (Cashfree KYC) must refuse here rather than send the anon key and
 * look like they worked.
 */
export const supportsFirebaseIdentity = (): boolean => false;
