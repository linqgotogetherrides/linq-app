import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useApp } from '@/src/context/AppContext';
import { useWallet } from '@/src/context/WalletContext';
import { gameApi, type GameProfile } from '@/src/lib/game/rewards';
import { GAME_CONFIG } from '@/src/lib/game/constants';

export const MILESTONE_WINS = 10;
export const MILESTONE_PLAN_RUPEES = 59;

type GameContextValue = {
  profile: GameProfile | null;
  loading: boolean;
  error: string | null;
  /**
   * Lives available to spend right now, or null when we do not know yet.
   * null is deliberately distinct from 0: telling a player they have no lives
   * when the figure simply failed to load is a fabricated answer, and it also
   * locked them out of the game with no way to tell what went wrong.
   */
  lives: number | null;
  wins: number;
  winsToMilestone: number;
  milestoneUnlocked: boolean;
  showTutorial: boolean;
  startRun: () => Promise<{ ok: boolean; sessionId?: string; reason?: string }>;
  settleRun: (input: {
    sessionId: string;
    result: 'WIN' | 'LOSS';
    score: number;
    passengers: number;
    durationMs: number;
  }) => Promise<{ rewarded: boolean; milestoneReached: boolean }>;
  claimMilestone: () => Promise<boolean>;
  markTutorialSeen: () => Promise<void>;
  refresh: () => Promise<void>;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const { refresh: refreshWallet } = useWallet();
  const userId = user?.id ?? null;

  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const next = await gameApi.getProfile(userId);
      setProfile(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your game profile.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Opens a run. The server consumes exactly one life, so this cannot be
   * spammed to farm lives, and a win cannot be claimed without a real session.
   */
  const startRun = useCallback(async () => {
    if (!userId) return { ok: false, reason: 'not_signed_in' };
    try {
      const result = await gameApi.startSession(userId);
      if (!result.ok) {
        setProfile(result.profile);
        return { ok: false, reason: 'out_of_lives' };
      }
      setProfile(result.profile);
      return { ok: true, sessionId: result.session_id };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game.');
      return { ok: false, reason: 'error' };
    }
  }, [userId]);

  const settleRun = useCallback(
    async (input: {
      sessionId: string;
      result: 'WIN' | 'LOSS';
      score: number;
      passengers: number;
      durationMs: number;
    }) => {
      if (!userId) return { rewarded: false, milestoneReached: false };
      try {
        const settled = await gameApi.settle({ userId, ...input });
        if (settled.profile) setProfile(settled.profile);
        if (settled.reward_paid) await refreshWallet();
        return {
          rewarded: Boolean(settled.reward_paid),
          milestoneReached: Boolean(settled.milestone_reached),
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your result.');
        return { rewarded: false, milestoneReached: false };
      }
    },
    [refreshWallet, userId],
  );

  const claimMilestone = useCallback(async () => {
    if (!userId) return false;
    const result = await gameApi.claimMilestone(userId);
    if (result.ok) {
      await refresh();
      return true;
    }
    setError(result.reason ?? 'Milestone could not be claimed.');
    return false;
  }, [refresh, userId]);

  const markTutorialSeen = useCallback(async () => {
    if (!userId) return;
    setProfile((current) => (current ? { ...current, tutorial_seen: true } : current));
    await gameApi.markTutorialSeen(userId);
  }, [userId]);

  const value = useMemo<GameContextValue>(
    () => ({
      profile,
      loading,
      error,
      lives: profile ? profile.total_lives : null,
      wins: profile?.total_wins ?? 0,
      winsToMilestone: Math.max(0, MILESTONE_WINS - (profile?.total_wins ?? 0)),
      milestoneUnlocked: (profile?.total_wins ?? 0) >= MILESTONE_WINS,
      showTutorial: profile ? !profile.tutorial_seen : false,
      startRun,
      settleRun,
      claimMilestone,
      markTutorialSeen,
      refresh,
    }),
    [claimMilestone, error, loading, markTutorialSeen, profile, refresh, settleRun, startRun],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside <GameProvider>');
  return context;
}

export { GAME_CONFIG };
