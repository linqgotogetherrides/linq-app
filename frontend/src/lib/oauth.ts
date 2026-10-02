import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

// Required so the auth session promise resolves on iOS when the app returns
// from the system browser.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Supabase redirects after Google/Apple sign-in. `linq` comes from the
 * scheme in app.json, so the OS hands this URL back to the app.
 */
export const OAUTH_REDIRECT_TO = Linking.createURL('auth/callback');

type OAuthProvider = 'google' | 'apple';

/** Extracts the session tokens Supabase puts in the redirect URL fragment. */
function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const params = new URLSearchParams(fragment || query);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Runs the Supabase OAuth flow for Google or Apple.
 *
 * Returns the Supabase user on success, or `null` when the rider cancelled the
 * browser. Throws on a real failure so the caller can surface a toast.
 */
export async function signInWithProvider(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: OAUTH_REDIRECT_TO,
      skipBrowserRedirect: true,
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in. Please try again.');

  console.log('[OAuth] redirectTo =', OAUTH_REDIRECT_TO);
  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_TO);
  console.log('[OAuth] browser result:', result.type, result.type === 'success' ? result.url?.slice(0, 120) : '');
  if (result.type !== 'success' || !result.url) return null;

  const tokens = parseTokensFromUrl(result.url);
  console.log('[OAuth] tokens parsed:', Boolean(tokens));
  if (!tokens) throw new Error('Sign-in could not be completed. Please try again.');

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession(tokens);
  if (sessionError) throw sessionError;
  return sessionData.session?.user ?? null;
}

/** Signs out of Supabase (Google/Apple sessions) as well as Firebase. */
export async function signOutOAuth(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.log('Supabase signout error:', e);
  }
}
