// Fill the Ride — server client.
//
// Every call here is a thin wrapper over a SECURITY DEFINER database function.
// The client never computes lives, wins, or money: it reports what happened and
// the server decides what that is worth.

import { supabase } from '@/src/lib/supabase';
import { GAME_CONFIG } from './constants';

export type GameProfile = {
  user_id: string;
  weekly_lives: number;
  bonus_lives: number;
  total_lives: number;
  total_games: number;
  total_wins: number;
  referral_lives_earned: number;
  tutorial_seen: boolean;
  best_score: number;
  milestone_unlocked: boolean;
  milestone_claimed: boolean;
  next_refill_at: string;
};

export type StartResult =
  | { ok: true; session_id: string; started_at: string; profile: GameProfile }
  | { ok: false; reason: 'out_of_lives'; profile: GameProfile };

export type SettleResult = {
  ok: boolean;
  already_settled?: boolean;
  reason?: string;
  result?: 'WIN' | 'LOSS';
  score?: number;
  passengers?: number;
  duration_ms?: number;
  reward_paid?: boolean;
  milestone_reached?: boolean;
  profile?: GameProfile;
  wallet_balance?: number;
  note?: string;
};

function toProfile(row: Record<string, unknown>): GameProfile {
  return {
    user_id: String(row.user_id),
    weekly_lives: Number(row.weekly_lives ?? 0),
    bonus_lives: Number(row.bonus_lives ?? 0),
    total_lives: Number(row.total_lives ?? 0),
    total_games: Number(row.total_games ?? 0),
    total_wins: Number(row.total_wins ?? 0),
    referral_lives_earned: Number(row.referral_lives_earned ?? 0),
    tutorial_seen: Boolean(row.tutorial_seen),
    best_score: Number(row.best_score ?? 0),
    milestone_unlocked: Boolean(row.milestone_unlocked),
    milestone_claimed: Boolean(row.milestone_claimed),
    next_refill_at: String(row.next_refill_at ?? ''),
  };
}

export const gameApi = {
  async getProfile(userId: string): Promise<GameProfile | null> {
    const { data, error } = await supabase.rpc('get_game_profile', { p_user_id: userId });
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toProfile(data as Record<string, unknown>);
  },

  async startSession(userId: string): Promise<StartResult> {
    const { data, error } = await supabase.rpc('start_game_session', {
      p_user_id: userId,
      p_seats_required: GAME_CONFIG.seatsRequired,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    if (row.ok) {
      return {
        ok: true,
        session_id: String(row.session_id),
        started_at: String(row.started_at),
        profile: toProfile(row.profile as Record<string, unknown>),
      };
    }
    return {
      ok: false,
      reason: 'out_of_lives',
      profile: toProfile(row.profile as Record<string, unknown>),
    };
  },

  async settle(input: {
    sessionId: string;
    userId: string;
    result: 'WIN' | 'LOSS';
    score: number;
    passengers: number;
    durationMs: number;
  }): Promise<SettleResult> {
    const { data, error } = await supabase.rpc('validate_game_result', {
      p_session_id: input.sessionId,
      p_user_id: input.userId,
      p_claim_result: input.result,
      p_claim_score: Math.round(input.score),
      p_claim_passengers: input.passengers,
      p_claim_duration_ms: input.durationMs,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    return {
      ok: Boolean(row.ok),
      already_settled: Boolean(row.already_settled),
      reason: row.reason as string | undefined,
      result: row.result as 'WIN' | 'LOSS' | undefined,
      score: row.score as number | undefined,
      passengers: row.passengers as number | undefined,
      duration_ms: row.duration_ms as number | undefined,
      reward_paid: Boolean(row.reward_paid),
      milestone_reached: Boolean(row.milestone_reached),
      profile: row.profile
        ? toProfile(row.profile as Record<string, unknown>)
        : undefined,
      wallet_balance:
        row.wallet_balance != null ? Number(row.wallet_balance) : undefined,
      note: row.note as string | undefined,
    };
  },

  async markTutorialSeen(userId: string): Promise<void> {
    await supabase.rpc('mark_game_tutorial_seen', { p_user_id: userId });
  },

  async claimMilestone(userId: string): Promise<{ ok: boolean; reason?: string; profile?: GameProfile }> {
    const { data, error } = await supabase.rpc('claim_game_milestone', { p_user_id: userId });
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    return {
      ok: Boolean(row.ok),
      reason: row.reason as string | undefined,
      profile: row.profile
        ? toProfile(row.profile as Record<string, unknown>)
        : undefined,
    };
  },

  /** Redeem a verified referral for one extra life. */
  async claimReferralLife(referralId: string): Promise<{ ok: boolean; reason?: string }> {
    const { data, error } = await supabase.rpc('grant_life_for_referral', {
      p_referral_id: referralId,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, unknown>;
    return { ok: Boolean(row.ok), reason: row.reason as string | undefined };
  },
};
