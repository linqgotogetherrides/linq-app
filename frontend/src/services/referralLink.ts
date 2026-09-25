import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Referral code captured from an invite link.
 *
 * The invite link is `https://linq.app/join?ref=CODE`. The code is read as
 * early as possible (app start / onboarding) and stored, because the OTP and
 * account-creation screens are reached through a navigation stack that would
 * otherwise drop the query parameter.
 */
export const PENDING_REFERRAL_KEY = '@linq/pending_referral';

export async function captureReferralFromLink(): Promise<string | null> {
  try {
    const search = globalThis.location?.search ?? '';
    if (!search) return null;
    const code = new URLSearchParams(search).get('ref');
    if (!code) return null;
    const clean = code.trim();
    if (!clean) return null;
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, clean);
    return clean;
  } catch {
    return null;
  }
}

export async function getPendingReferral(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // non-fatal
  }
}

/** Stores a code the user typed manually on the Refer a Friend screen. */
export async function setPendingReferral(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, code.trim());
  } catch {
    // non-fatal
  }
}
