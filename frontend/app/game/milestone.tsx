import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import RazorpayCheckoutButton from '@/src/components/RazorpayCheckoutButton';
import { useApp } from '@/src/context/AppContext';
import {
  MILESTONE_PLAN_RUPEES,
  MILESTONE_WINS,
  useGame,
} from '@/src/context/GameContext';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

const PLAN_Paise = MILESTONE_PLAN_RUPEES * 100;
const REGULAR_YEARLY_Paise = 19900;

/**
 * The 10-win milestone celebration and the only route to the Rs 59 plan.
 *
 * The purchase is deliberately explicit: nothing is auto-bought. Eligibility
 * is also re-checked server-side in create-razorpay-order, so editing local
 * state cannot get someone past 10 wins.
 */
export default function GameMilestone() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const { profile, wins, milestoneUnlocked, claimMilestone, refresh } = useGame();
  const [claiming, setClaiming] = useState(false);
  const [purchased, setPurchased] = useState(false);

  const alreadyClaimed = profile?.milestone_claimed ?? false;

  const handleClaim = async () => {
    setClaiming(true);
    const ok = await claimMilestone();
    setClaiming(false);
    await refresh();
    showToast(ok ? 'Milestone unlocked!' : 'Keep playing to unlock this.');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="game-milestone-screen">
      <LinqHeader title="Achievement" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#F59E0B', '#FACC15']} style={styles.trophyWrap}>
          <Ionicons name="trophy" size={72} color="#FFFFFF" />
          <Text style={styles.trophyTitle}>
            {milestoneUnlocked ? '10 RIDES FILLED!' : `${MILESTONE_WINS - wins} TO GO`}
          </Text>
          <Text style={styles.trophySub}>
            {milestoneUnlocked
              ? "You've mastered the challenge."
              : `Win ${MILESTONE_WINS - wins} more game${MILESTONE_WINS - wins === 1 ? '' : 's'} to unlock the annual plan.`}
          </Text>
        </LinearGradient>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Total wins</Text>
            <Text style={styles.progressValue}>
              {wins} / {MILESTONE_WINS}
            </Text>
          </View>
          <View style={styles.bars}>
            {Array.from({ length: MILESTONE_WINS }, (_, i) => (
              <View key={i} style={[styles.bar, i < wins && styles.barFilled]} />
            ))}
          </View>
        </View>

        {!milestoneUnlocked ? (
          <PrimaryButton
            title="KEEP PLAYING"
            icon="game-controller"
            onPress={() => router.push('/game/fill-the-ride')}
            testID="milestone-keep-playing"
          />
        ) : (
          <View style={styles.rewardCard} testID="milestone-reward-card">
            <Text style={styles.rewardKicker}>SPECIAL LINQ OFFER</Text>

            <View style={styles.priceRow}>
              <View>
                <Text style={styles.struck}>₹{REGULAR_YEARLY_Paise / 100}</Text>
                <Text style={styles.wasLabel}>regular annual plan</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textTertiary} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.price} testID="milestone-price">
                  ₹{MILESTONE_PLAN_RUPEES}
                </Text>
                <Text style={styles.perYear}>/ YEAR</Text>
              </View>
            </View>

            <Text style={styles.terms}>
              Unlocked by your {wins} verified wins. One plan per account. No automatic
              purchase — you choose whether to buy.
            </Text>

            {purchased || alreadyClaimed ? (
              <View style={styles.claimedBox} testID="milestone-claimed">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.claimedText}>
                  Annual plan unlocked. Enjoy your rides.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <RazorpayCheckoutButton
                  testID="milestone-buy-button"
                  amountPaise={PLAN_Paise}
                  receipt="game-annual-59"
                  plan="game_annual"
                  title={`GET ANNUAL PLAN FOR ₹${MILESTONE_PLAN_RUPEES}`}
                  description={`LinQ annual plan unlocked by ${MILESTONE_WINS} game wins`}
                  style={styles.buyBtn}
                  textStyle={styles.buyText}
                  onError={(message) => showToast(message)}
                  onSuccess={() => {
                    setPurchased(true);
                    void claimMilestone();
                    void refresh();
                    showToast('Annual plan unlocked. Welcome to LinQ Annual!');
                  }}
                >
                  <Ionicons name="flash" size={16} color={colors.textInverse} />
                  <Text style={styles.buyText}>
                    GET ANNUAL PLAN FOR ₹{MILESTONE_PLAN_RUPEES}
                  </Text>
                </RazorpayCheckoutButton>

                {claiming ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Pressable onPress={handleClaim} testID="milestone-claim-link">
                    <Text style={styles.claimLink}>
                      I already bought it elsewhere — mark as claimed
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {!user ? (
          <Text style={styles.footnote}>Sign in to unlock game rewards.</Text>
        ) : (
          <Text style={styles.footnote}>
            Wins are verified server-side. Editing the app cannot grant wins, lives or
            this offer.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 56, gap: spacing.lg },
  trophyWrap: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.md,
  },
  trophyTitle: {
    fontSize: font.size.display,
    color: '#FFFFFF',
    fontWeight: font.weight.bold,
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  trophySub: {
    fontSize: font.size.sm,
    color: 'rgba(255,255,255,0.95)',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  progressValue: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  bars: { flexDirection: 'row', gap: 4, marginTop: spacing.md },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.border },
  barFilled: { backgroundColor: colors.success },
  rewardCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.warning,
    padding: spacing.lg,
  },
  rewardKicker: {
    fontSize: font.size.xs,
    color: colors.warning,
    fontWeight: font.weight.bold,
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  struck: {
    fontSize: font.size.xl,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  wasLabel: { fontSize: font.size.xs, color: colors.textTertiary },
  price: { fontSize: font.size['3xl'], color: colors.primary, fontWeight: font.weight.bold },
  perYear: { fontSize: font.size.xs, color: colors.textSecondary },
  terms: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  buyBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buyText: {
    fontSize: font.size.sm,
    color: colors.textInverse,
    fontWeight: font.weight.bold,
    letterSpacing: 0.4,
  },
  claimLink: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  claimedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  claimedText: { fontSize: font.size.sm, color: colors.success, fontWeight: font.weight.medium },
  footnote: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
  },
});
