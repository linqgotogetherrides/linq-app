import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export const OAUTH_REDIRECT_TO = Linking.createURL('auth/callback');

type OAuthProvider = 'google' | 'apple';

function getCallbackParams(url: string): URLSearchParams {
  const query = url.includes('?')
    ? url.slice(url.indexOf('?') + 1).split('#')[0]
    : '';
  const fragment = url.includes('#')
    ? url.slice(url.indexOf('#') + 1)
    : '';

  const params = new URLSearchParams(query);
  new URLSearchParams(fragment).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

export async function completeOAuthCallback(url: string) {
  const params = getCallbackParams(url);
  const errorDescription = params.get('error_description') || params.get('error');

  if (errorDescription) {
    throw new Error(errorDescription);
  }

  const code = params.get('code');

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session?.user) throw new Error('Google sign-in did not return a valid session.');
    return data.session.user;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    if (!data.session?.user) throw new Error('Could not establish the sign-in session.');
    return data.session.user;
  }

  throw new Error('Authentication callback did not contain a valid code or session.');
}

export async function signInWithProvider(provider: OAuthProvider) {
  const redirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : OAUTH_REDIRECT_TO;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in. Please try again.');

  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return null;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_TO);
  if (result.type !== 'success' || !result.url) return null;

  return completeOAuthCallback(result.url);
}

export async function signOutOAuth(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
