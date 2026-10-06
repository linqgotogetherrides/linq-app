import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { getIdToken } from '@/src/lib/auth';

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

/**
 * The main client. Unchanged: it keeps the anon/publishable key as `apikey` and
 * is used for REST/realtime and, critically, for Google/Apple sign-in via
 * `supabase.auth`. LinQ does NOT migrate Firebase users to Supabase Auth, so this
 * client must keep its auth surface intact — that is why it does NOT take the
 * custom `accessToken` option (setting it replaces `supabase.auth` with a Proxy
 * that throws, which would break OAuth sign-in).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * A dedicated client for Edge Function calls.
 *
 * LinQ authenticates with Firebase Phone OTP, so there is normally no Supabase
 * session. The `accessToken` callback makes every `functions.invoke()` send a
 * verifiable identity as the Authorization bearer:
 *
 *   1. the current Firebase ID token (phone users), or
 *   2. the Supabase access token, when one exists (Google/Apple OAuth users).
 *
 * When neither exists (signed out / web demo), the callback returns null and
 * @supabase/supabase-js falls back to the anon key — exactly today's behaviour,
 * so no existing call breaks.
 *
 * The Firebase ID token is read live from getAuth().currentUser and is never
 * persisted to AsyncStorage. For Supabase to accept it, the HOSTED project must
 * have Firebase Third-Party Auth enabled in the dashboard; see
 * backend/supabase/config.toml for the local equivalent.
 *
 * Keeping this separate from `supabase` means REST/realtime and OAuth sign-in
 * are completely unaffected by the token callback.
 */
export const supabaseFunctions = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => {
    const firebaseToken = await getIdToken();
    if (firebaseToken) return firebaseToken;
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  },
});
