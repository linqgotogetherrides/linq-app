import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Share } from 'react-native';

import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import { clearPendingReferral, getPendingReferral } from '@/src/services/referralLink';

export type WalletTxn = {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  kind: WalletTxnKind;
  note: string | null;
  reference_id: string | null;
  created_at: string;
};

export type WalletTxnKind =
  | 'referral_reward'
  | 'topup'
  | 'ride_credit'
  | 'refund'
  | 'admin_adjustment'
  | 'spend';

export type ReferralRow = {
  id: string;
  referrer_id: string;
  referee_id: string;
  referral_code: string;
  status: 'PENDING' | 'JOINED' | 'COMPLETED' | 'REJECTED';
  reward_amount: number;
  reward_credited: boolean;
  credited_at: string | null;
  created_at: string;
};

export type ReferralStats = {
  code: string;
  totalInvited: number;
  joined: number;
  rewarded: number;
  earned: number;
};

type WalletContextValue = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  loading: boolean;
  error: string | null;
  referralCode: string | null;
  referredByCode: string | null;
  stats: ReferralStats;
  transactions: WalletTxn[];
  referrals: ReferralRow[];
  refresh: () => Promise<void>;
  applyReferralCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  shareInvite: (channel: 'whatsapp' | 'telegram' | 'sms' | 'native') => Promise<boolean>;
  inviteLink: string | null;
};

const REFERRAL_REWARD = 5;

const WalletContext = createContext<WalletContextValue | null>(null);

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const userId = user?.id ?? null;

  const [balance, setBalance] = useState(0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [lifetimeSpent, setLifetimeSpent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredByCode, setReferredByCode] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBalance(0);
      setLifetimeEarned(0);
      setLifetimeSpent(0);
      setTransactions([]);
      setReferrals([]);
      setReferralCode(null);
      setReferredByCode(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [walletRes, profileRes, txnRes, refRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('user_profiles')
          .select('referral_code, referred_by_code')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('wallet_txns')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('referrals')
          .select('*')
          .eq('referrer_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (walletRes.error) throw walletRes.error;

      setBalance(toNumber(walletRes.data?.balance));
      setLifetimeEarned(toNumber(walletRes.data?.lifetime_earned));
      setLifetimeSpent(toNumber(walletRes.data?.lifetime_spent));
      setReferralCode(profileRes.data?.referral_code ?? null);
      setReferredByCode(profileRes.data?.referred_by_code ?? null);
      setTransactions((txnRes.data ?? []) as WalletTxn[]);
      setReferrals((refRes.data ?? []) as ReferralRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your wallet.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Claim a captured invite code once the profile row exists, so the referrer
  // is credited exactly when the invitee actually joins.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const pending = await getPendingReferral();
      if (!pending || cancelled) return;
      const result = await applyReferralCode(pending);
      if (result.ok) {
        await clearPendingReferral();
        await refresh();
      } else if (result.message.toLowerCase().includes('already')) {
        await clearPendingReferral();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once per user, not on every applyReferralCode identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Credits the referrer ₹5, exactly once, server-side. */
  const applyReferralCode = useCallback(
    async (code: string) => {
      if (!userId) return { ok: false, message: 'Sign in to use a referral code.' };
      const clean = code.trim();
      if (!clean) return { ok: false, message: 'Enter a referral code.' };

      try {
        const { data, error } = await supabase.rpc('claim_referral', {
          p_code: clean,
          p_referee_id: userId,
        });
        if (error) throw error;

        const result = data as {
          ok: boolean;
          reason?: string;
          credited?: boolean;
          already_claimed?: boolean;
          referrer_id?: string;
          reward_amount?: number;
        };

        if (!result?.ok) {
          if (result?.reason === 'self_referral') {
            return { ok: false, message: 'You cannot use your own referral code.' };
          }
          return { ok: false, message: 'That referral code is not valid.' };
        }

        await refresh();
        if (result.already_claimed) {
          return { ok: true, message: 'You have already used a referral code.' };
        }
        return {
          ok: true,
          message: `Referral applied. ₹${result.reward_amount ?? REFERRAL_REWARD} was added to your friend's wallet.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not apply that code.',
        };
      }
    },
    [refresh, userId],
  );

  const inviteLink = useMemo(() => {
    if (!referralCode) return null;
    // Deep link that the sign-up flow can read the code from.
    return `https://linq.app/join?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  const shareInvite = useCallback(
    async (channel: 'whatsapp' | 'telegram' | 'sms' | 'native') => {
      if (!referralCode || !inviteLink) return false;
      const text = `Join me on LinQ and ride together. Use my code ${referralCode} when you sign up: ${inviteLink}`;

      const urls: Record<string, string> = {
        whatsapp: `whatsapp://send?text=${encodeURIComponent(text)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(
          `Join me on LinQ and ride together. Use my code ${referralCode}.`,
        )}`,
        sms: `sms:?&body=${encodeURIComponent(text)}`,
      };

      try {
        if (channel === 'native') {
          await Sharing_share(text);
          return true;
        }
        const canOpen = await Linking.canOpenURL(urls[channel]);
        if (!canOpen) {
          // Fall back to the OS share sheet rather than failing silently.
          await Sharing_share(text);
          return true;
        }
        await Linking.openURL(urls[channel]);
        return true;
      } catch {
        return false;
      }
    },
    [inviteLink, referralCode],
  );

  const stats = useMemo<ReferralStats>(
    () => ({
      code: referralCode ?? '',
      totalInvited: referrals.length,
      joined: referrals.filter((r) => r.status !== 'PENDING').length,
      rewarded: referrals.filter((r) => r.reward_credited).length,
      earned: referrals
        .filter((r) => r.reward_credited)
        .reduce((sum, r) => sum + toNumber(r.reward_amount), 0),
    }),
    [referralCode, referrals],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      balance,
      lifetimeEarned,
      lifetimeSpent,
      loading,
      error,
      referralCode,
      referredByCode,
      stats,
      transactions,
      referrals,
      refresh,
      applyReferralCode,
      shareInvite,
      inviteLink,
    }),
    [
      applyReferralCode,
      balance,
      error,
      inviteLink,
      lifetimeEarned,
      lifetimeSpent,
      loading,
      referralCode,
      referrals,
      referredByCode,
      refresh,
      shareInvite,
      stats,
      transactions,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside <WalletProvider>');
  return context;
}

/** Native share sheet, isolated so it can be stubbed in tests. */
async function Sharing_share(message: string): Promise<void> {
  await Share.share({ message });
}

export { REFERRAL_REWARD };
