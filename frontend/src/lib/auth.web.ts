export const signInWithPhoneNumber = async (phone: string) => {
  console.log(`[Web Mock] Sending OTP to ${phone}`);

  return {
    confirm: async (code: string) => {
      console.log(`[Web Mock] Verified code ${code}`);
      return { user: { uid: `web-uid-${phone}`, phoneNumber: phone } };
    },
  };
};

export const signOut = async () => {};

/**
 * Web has no Firebase session (auth.web.ts is a demo stub), so there is never a
 * Firebase ID token here. Returning null keeps the Supabase client on the anon
 * key for web, which is the existing behaviour, and â€” importantly â€” means the
 * web bundle never imports @react-native-firebase/auth.
 */
export const getIdToken = async (_forceRefresh = false): Promise<string | null> => null;

/**
 * False, deliberately and honestly.
 *
 * The stub above accepts any OTP without sending one and returns a synthetic
 * `web-uid-<phone>` that no server can verify. There is no Firebase web SDK in
 * this project's dependencies, so there is no real identity to present. Features
 * gated on a verified identity (Cashfree KYC) must refuse here rather than send
 * the anon key and look like they worked.
 */
export const supportsFirebaseIdentity = (): boolean => false;


/** Web demo auth has no persisted Firebase identity. */
export const getCurrentFirebaseUserId = async (): Promise<string | null> => null;
