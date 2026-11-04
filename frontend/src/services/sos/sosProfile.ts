import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/lib/supabase';
import type { User } from '@/src/types';
import { normalizeSosPhone } from './sosMessage';

export type SosProfile = {
  userName: string;
  contactName: string;
  contactPhone: string;
};

const FALLBACK_PROFILE_KEY = 'gotogether_sos_profile';

type StoredProfile = {
  userName?: string;
  contactName?: string;
  contactPhone?: string;
};

async function readStoredProfile(): Promise<StoredProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(FALLBACK_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProfile;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the two people involved in the WhatsApp alert:
 *   * the LinQ user whose name appears in the message, and
 *   * the emergency contact who receives it.
 *
 * `emergency_contacts` is the source of truth. The legacy profile fields and
 * the reference app's AsyncStorage key are fallback only, so existing users do
 * not lose the contact they already saved.
 */
export async function resolveSosProfile(user: User | null): Promise<SosProfile | null> {
  if (!user) return null;

  let contactName = '';
  let contactPhone = user.emergencyContact ?? '';

  try {
    const { data } = await supabase
      .from('emergency_contacts')
      .select('name, phone, is_primary, created_at')
      .eq('user_id', user.id)
      .not('phone', 'is', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5);

    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const phone = typeof row.phone === 'string' ? row.phone : '';
      if (!normalizeSosPhone(phone)) continue;
      contactPhone = phone;
      contactName = typeof row.name === 'string' ? row.name.trim() : '';
      break;
    }
  } catch {
    // Offline is not a reason to block SOS; fall through to local data.
  }

  const stored = await readStoredProfile();
  const userName =
    user.name?.trim() ||
    stored?.userName?.trim() ||
    'A LinQ user';
  const resolvedContactName =
    contactName ||
    stored?.contactName?.trim() ||
    'your emergency contact';

  // Pick the first candidate that is actually usable. A malformed legacy field
  // must not hide a valid contact saved by the reference app.
  const phoneCandidates = [
    contactPhone,
    stored?.contactPhone,
    user.emergencyContact,
  ];
  let resolvedContactPhone: string | null = null;
  for (const candidate of phoneCandidates) {
    if (!candidate) continue;
    const normalized = normalizeSosPhone(candidate);
    if (normalized) {
      resolvedContactPhone = normalized;
      break;
    }
  }

  if (!resolvedContactPhone) return null;

  const profile: SosProfile = {
    userName,
    contactName: resolvedContactName,
    contactPhone: resolvedContactPhone,
  };

  // Keep the last known-good pair so a later offline SOS can still open
  // WhatsApp even if both the profile row and the contacts table are
  // unreachable.
  try {
    await AsyncStorage.setItem(FALLBACK_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A failed cache write must never block SOS.
  }

  return profile;
}
