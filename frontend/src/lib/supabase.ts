import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * EXPO_PUBLIC_* values are inlined at build time, so a build made without them
 * produces a bundle that cannot reach the database. That surfaced as an
 * unhelpful "failed to fetch" rather than anything pointing at the cause, which
 * is an expensive way to learn that a CI or Vercel project is missing its
 * environment. See .env.example for the full list.
 */
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean);
  console.error(
    `[Supabase] Missing ${missing.join(' and ')}. The app cannot reach the database. ` +
      'Set these in the environment that built this bundle; see frontend/.env.example.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
