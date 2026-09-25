import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { REFERRAL_REWARD, useWallet } from '@/src/context/WalletContext';
import GameCard from '@/src/components/game/GameCard';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

type ShareKey = 'whatsapp' | 'telegram' | 'sms' | 'native';

export default function Referral() {
  const { user, showToast } = useApp();
  const {
    balance,
    referralCode,
    stats,
    referrals,
    transactions,
    loading,
    shareInvite,
    applyReferralCode,
    refresh,
  } = useWallet();

  const [codeInput, setCodeInput] = useState('');
  const [applying, setApplying] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handleShare = async (channel: ShareKey) => {
    const ok = await shareInvite(channel);
    if (!ok) showToast('Could not open the share sheet.');
  };

  const handleApply = async () => {
    setApplying(true);
    const result = await applyReferralCode(codeInput);
    setApplying(false);
    showToast(result.message);
    if (result.ok) setCodeInput('');
  };

  const referralTxns = transactions.filter((t) => t.kind === 'referral_reward');

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="referral-screen">
      <LinqHeader title="Refer a Friend" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}
      >
        <GameCard />

        <View style={styles.walletCard} testID="referral-wallet-card">
          <Text style={styles.walletLabel}>Your wallet balance</Text>
          <Text style={styles.walletAmount} testID="referral-wallet-balance">
            {loading ? '—' : `₹${balance.toFixed(2)}`}
          </Text>
          <Text style={styles.walletSub}>
            Earn ₹{REFERRAL_REWARD} every time a friend joins with your code
          </Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="gift" size={48} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Invite friends & earn ₹{REFERRAL_REWARD}</Text>
          <Text style={styles.heroSub}>
            They sign up with your code and ₹{REFERRAL_REWARD} is added to your wallet
            straight away.
          </Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          {referralCode ? (
            <View style={styles.codeRow}>
              <Text style={styles.code} testID="referral-code">
                {referralCode}
              </Text>
              <Pressable
                style={styles.copyBtn}
                testID="copy-code"
                onPress={async () => {
                  try {
                    await RNShare.share({ message: referralCode });
                    showToast('Code copied — share it with a friend.');
                  } catch {
                    showToast(`Your code is ${referralCode}`);
                  }
                }}
              >
                <Ionicons name="copy-outline" size={16} color={colors.primary} />
                <Text style={styles.copyText}>Copy</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.codePending}>Generating your code…</Text>
          )}
        </View>

        <Text style={styles.shareTitle}>Share via</Text>
        <View style={styles.shareRow}>
          {(
            [
              { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
              { key: 'telegram', label: 'Telegram', icon: 'paper-plane', color: '#0088cc' },
              { key: 'sms', label: 'SMS', icon: 'chatbubble-outline', color: colors.primary },
              { key: 'native', label: 'More', icon: 'share-social', color: colors.textSecondary },
            ] as const
          ).map((s) => (
            <Pressable
              key={s.key}
              style={styles.shareOption}
              testID={`share-${s.key}`}
              disabled={!referralCode}
              onPress={() => void handleShare(s.key)}
            >
              <View style={[styles.shareIcon, { backgroundColor: s.color + '15' }]}>
                <Ionicons name={s.icon} size={24} color={s.color} />
              </View>
              <Text style={styles.shareLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <PrimaryButton
          title="Share invite link"
          icon="share-social"
          style={{ marginTop: spacing.lg }}
          disabled={!referralCode}
          onPress={() => void handleShare('native')}
          testID="share-invite-link"
        />

        <View style={styles.statsRow}>
          <StatTile label="Invited" value={stats.totalInvited} />
          <StatTile label="Joined" value={stats.joined} />
          <StatTile label="Earned" value={`₹${stats.earned}`} />
        </View>

        {referralTxns.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Referral earnings</Text>
            {referralTxns.map((txn) => (
              <View key={txn.id} style={styles.txnRow} testID={`referral-txn-${txn.id}`}>
                <Ionicons name="arrow-down-circle" size={18} color={colors.success} />
                <Text style={styles.txnNote}>
                  {txn.note ?? 'Referral reward'}
                </Text>
                <Text style={styles.txnAmount}>+₹{Number(txn.amount).toFixed(0)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {referrals.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>People you invited</Text>
            {referrals.map((row) => (
              <View key={row.id} style={styles.txnRow}>
                <Ionicons
                  name={row.reward_credited ? 'checkmark-circle' : 'time-outline'}
                  size={18}
                  color={row.reward_credited ? colors.success : colors.textTertiary}
                />
                <Text style={styles.txnNote} numberOfLines={1}>
                  {row.referee_id.slice(0, 14)}…
                </Text>
                <Text style={styles.txnStatus}>{row.reward_credited ? 'Credited' : row.status}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Have a friend&apos;s code?</Text>
            <Text style={styles.cardSub}>
              Enter their code and you both benefit. One code per account.
            </Text>
            <View style={styles.applyRow}>
              <TextInput
                style={styles.input}
                placeholder="e.g. LINQ-RAJU-1A2B3C"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                value={codeInput}
                onChangeText={setCodeInput}
                testID="referral-code-input"
              />
              <Pressable
                style={styles.applyBtn}
                onPress={() => void handleApply()}
                disabled={applying || !codeInput.trim()}
                testID="referral-apply"
              >
                {applying ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.applyText}>Apply</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How it works</Text>
          <Step num={1} text="Share your referral code with a friend" />
          <Step num={2} text="They sign up and enter your code" />
          <Step num={3} text={`₹${REFERRAL_REWARD} lands in your wallet instantly`} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Step({ num, text, last }: { num: number; text: string; last?: boolean }) {
  return (
    <View style={[styles.step, !last && styles.stepBorder]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{num}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  walletCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  walletLabel: { fontSize: font.size.xs, color: 'rgba(255,255,255,0.85)' },
  walletAmount: {
    fontSize: font.size.display,
    color: colors.textInverse,
    fontWeight: font.weight.medium,
    marginTop: 2,
  },
  walletSub: { fontSize: font.size.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  heroSub: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  codeLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  codePending: { fontSize: font.size.base, color: colors.textTertiary, marginTop: spacing.sm },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  code: {
    fontSize: font.size['2xl'],
    color: colors.primary,
    fontWeight: font.weight.medium,
    letterSpacing: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
  },
  copyText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  shareTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  shareRow: { flexDirection: 'row', gap: spacing.md },
  shareOption: { flex: 1, alignItems: 'center', gap: 6 },
  shareIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  shareLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  statLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  cardTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.sm,
  },
  cardSub: { fontSize: font.size.xs, color: colors.textSecondary, marginBottom: spacing.md },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  txnNote: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  txnAmount: { fontSize: font.size.sm, color: colors.success, fontWeight: font.weight.medium },
  txnStatus: { fontSize: font.size.xs, color: colors.textTertiary },
  applyRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: font.size.sm,
    color: colors.textPrimary,
  },
  applyBtn: {
    width: 88,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { color: colors.textInverse, fontWeight: font.weight.medium },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xl,
  },
  stepsTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.md,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  stepText: { flex: 1, fontSize: font.size.base, color: colors.textPrimary },
});
