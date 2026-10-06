import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/theme/tokens';
import type { WalletTxn, WalletTxnKind } from '@/src/context/WalletContext';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type TxnPresentation = {
  /** Reward money is money earned, not money paid in. */
  kind: WalletTxnKind;
  title: string;
  icon: IoniconName;
  /** Foreground colour for the round icon. */
  tint: string;
  /** Background colour for the round icon. */
  background: string;
  /** `reward` is a credit that came from the rewards programme. */
  category: 'credit' | 'debit' | 'reward';
  /** True when the amount adds to the reward balance. */
  isReward: boolean;
};

const PRESENTATION: Record<WalletTxnKind, Omit<TxnPresentation, 'category'>> = {
  referral_reward: {
    kind: 'referral_reward',
    title: 'Referral reward',
    icon: 'share-social',
    tint: colors.success,
    background: colors.successLight,
    isReward: true,
  },
  ride_credit: {
    kind: 'ride_credit',
    title: 'Ride credit',
    icon: 'car',
    tint: colors.warning,
    background: colors.warningLight,
    isReward: true,
  },
  topup: {
    kind: 'topup',
    title: 'Wallet top-up',
    icon: 'add-circle',
    tint: colors.primary,
    background: colors.primaryLight,
    isReward: false,
  },
  refund: {
    kind: 'refund',
    title: 'Refund',
    icon: 'refresh',
    tint: colors.primary,
    background: colors.primaryLight,
    isReward: false,
  },
  spend: {
    kind: 'spend',
    title: 'Payment',
    icon: 'arrow-up',
    tint: colors.error,
    background: colors.errorLight,
    isReward: false,
  },
  admin_adjustment: {
    kind: 'admin_adjustment',
    title: 'Adjustment',
    icon: 'options',
    tint: colors.textSecondary,
    background: colors.surfaceTertiary,
    isReward: false,
  },
};

/**
 * Turns a raw wallet transaction into everything the UI needs to render it,
 * so the wallet, the history list, and the rewards screen never disagree about
 * how a transaction should look. `amount` follows the wallet convention: a
 * positive value is money in, a negative value is money out.
 */
export function describeWalletTxn(txn: Pick<WalletTxn, 'kind' | 'amount'>): TxnPresentation {
  const base = PRESENTATION[txn.kind] ?? PRESENTATION.admin_adjustment;
  const category: TxnPresentation['category'] =
    base.isReward ? 'reward' : txn.amount < 0 ? 'debit' : 'credit';
  return { ...base, category };
}

/** `2026-10-06T12:30:00Z` → `6 Oct 2026, 6:00 PM`, without pulling in a date lib. */
export function formatTxnDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
