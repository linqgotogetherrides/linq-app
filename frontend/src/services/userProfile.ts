import { supabase } from '@/src/lib/supabase';

/**
 * Guarantees the signed-in rider has a public.user_profiles row.
 *
 * Why this exists
 * ---------------
 * `public.game_profiles.user_id` and `public.ride_requests.requester_id` are both
 * foreign keys onto `public.user_profiles(id)`. A rider without a profile row
 * therefore cannot open the referral game or send a seat request, and both fail
 * with a bare HTTP 409 from PostgREST with no useful message on screen.
 *
 * Historically the row was only ever written by the account-creation screen, and
 * that screen swallowed a failed write and still reported success. Any rider
 * whose write failed was left permanently broken with no way to recover.
 *
 * This creates the row on demand so those features self-heal on next sign-in.
 *
 * Only the columns the anon key is granted are written. `app_role`,
 * `verification_status` aggregates and the rest are deliberately omitted: the
 * `guard_user_profile_app_role` trigger rejects any client that tries to set
 * them, and leaving them out keeps the insert to the default values.
 *
 * `ignoreDuplicates` makes this insert-only. It must never overwrite a profile
 * that already exists.
 */
function phoneFromUserId(userId: string): string | undefined {
  const match = /web-uid-\+?([0-9]{10,15})$/.exec(userId);
  return match ? `+${match[1]}` : undefined;
}

export async function ensureUserProfile(params: {
  userId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = { id: params.userId };
  if (params.name) row.name = params.name;
  if (params.email) row.email = params.email;
  if (params.avatarUrl) row.avatar_url = params.avatarUrl;

  // The web sign-in mock builds ids as `web-uid-+<number>`. Recovering the number
  // is not a guess: it is the phone the rider actually entered at sign-in.
  const phone = params.phone ?? phoneFromUserId(params.userId);
  if (phone) row.phone_number = phone;

  const { error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Creates or updates a rider's profile.
 *
 * Deliberately not `upsert()`. PostgREST turns an upsert into
 * `INSERT ... ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, ...`, and `id`
 * is not in the column-level UPDATE grant that 20260925150000 applied, so the
 * whole statement is rejected with a table-level "permission denied" the moment
 * the row already exists. Verified against the live database: upserting a fresh
 * id returned 201 and upserting the same id again returned 401, while a PATCH of
 * a granted column returned 200. Insert-when-absent and update-when-present only
 * ever touches granted columns.
 */
export async function saveProfile(params: {
  userId: string;
  fields: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const exists = await userProfileExists(params.userId);

  if (!exists) {
    const { error } = await supabase
      .from('user_profiles')
      .insert({ id: params.userId, ...params.fields });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  // `id` is the conflict key and is never in the SET list here.
  const { error } = await supabase
    .from('user_profiles')
    .update(params.fields)
    .eq('id', params.userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** True when a row already exists for this rider. */
export async function userProfileExists(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}
