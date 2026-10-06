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
 * key for web, which is the existing behaviour, and — importantly — means the
 * web bundle never imports @react-native-firebase/auth.
 */
export const getIdToken = async (_forceRefresh = false): Promise<string | null> => null;
