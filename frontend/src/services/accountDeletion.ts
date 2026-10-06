import { supabase } from '@/src/lib/supabase';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Permanently deletes the signed-in rider's account and data.
 *
 * The database work runs server-side in the `account-deletion` Edge Function,
 * which the client can only reach with its user id (the same id it already
 * sends for every privileged action). Once the server confirms, the local
 * session is removed so the app returns to a clean signed-out state.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  if (!userId) return { ok: false, message: 'You are not signed in.' };

  try {
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const { data, error } = await supabase.functions.invoke('account-deletion', {
      body: { user_id: userId },
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (error) throw error;

    const payload = data as { ok?: boolean; error?: string } | null;
    if (!payload?.ok) {
      return { ok: false, message: payload?.error || 'The account could not be deleted.' };
    }

    const { clearSession } = await import('@/src/services/session');
    await clearSession();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'The account could not be deleted. Please try again.',
    };
  }
}
