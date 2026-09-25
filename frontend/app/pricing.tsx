import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import RazorpayCheckoutButton from '@/src/components/RazorpayCheckoutButton';
import { useApp } from '@/src/context/AppContext';
import { useWallet } from '@/src/context/WalletContext';
import GamePromoCard from '@/src/components/game/GamePromoCard';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

export default function Pricing() {
  const router = useRouter();
  const { access, upgradePlan, singleUnlock, showToast } = useApp();
  const { balance } = useWallet();

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="pricing-screen">
      <LinqHeader title="Pricing & Rewards" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <Pressable
          style={styles.walletBanner}
          onPress={() => router.push('/wallet')}
          testID="pricing-wallet-card"
        >
          <View style={styles.walletIcon}>
            <Ionicons name="wallet" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>Available wallet balance</Text>
            <Text style={styles.walletAmount} testID="pricing-wallet-balance">
              ₹{balance.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.walletCta}>Top up</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        <GamePromoCard />

        <Text style={styles.intro}>Unlock more requests, start more chats, and connect with more travelers.</Text>

        {/* Early Access */}
        <View style={styles.earlyCard}>
          <View style={styles.earlyHeader}>
            <View style={styles.earlyIcon}><Ionicons name="rocket" size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.earlyTitle}>Early Access – Free</Text>
              <Text style={styles.earlySub}>Enjoy 2 free requests and 2 free chats to get started with LinqRides.</Text>
            </View>
            <View style={styles.limitedBadge}><Text style={styles.limitedText}>Limited Time</Text></View>
          </View>
          <View style={styles.earlyDivider} />
          <View style={styles.earlyFooter}>
            <View style={styles.earlyStat}><Ionicons name="paper-plane-outline" size={16} color={colors.primary} /><Text style={styles.earlyStatText}>{access.freeRequestsRemaining} Requests</Text></View>
            <View style={styles.earlyStat}><Ionicons name="chatbubble-outline" size={16} color={colors.primary} /><Text style={styles.earlyStatText}>{access.freeChatsRemaining} Chats</Text></View>
            <View style={styles.freeBadge}><Text style={styles.freeText}>FREE</Text></View>
          </View>
        </View>

        <View style={styles.planHeader}>
          <Text style={styles.sectionTitle}>Choose a Plan</Text>
          <View style={styles.secureRow}><Ionicons name="lock-closed" size={12} color={colors.textSecondary} /><Text style={styles.secureText}>Secure payments</Text></View>
        </View>

        <View style={styles.plansRow}>
          {/* Yearly */}
          <View style={[styles.planCard, styles.planPopular]}>
            <View style={styles.popularBadge}><Text style={styles.popularText}>Most Popular</Text></View>
            <Text style={styles.planName}>Yearly Plan</Text>
            <Text style={styles.planPrice}>₹199/-</Text>
            <Text style={styles.planValidity}>Valid for 1 year</Text>
            <View style={styles.planDivider} />
            <PlanFeature text="5 Requests per day" />
            <PlanFeature text="5 Chats per day" />
            <PlanFeature text="Valid for 1 year" />
            <PlanFeature text="Cancel anytime" />
            <RazorpayCheckoutButton
              testID="get-yearly-plan"
              amountPaise={19900}
              receipt="yearly-plan"
              plan="yearly"
              title="Yearly Plan"
              description="LinQ Yearly Plan"
              onError={showToast}
              style={styles.planBtn}
              textStyle={styles.planBtnText}
              onSuccess={() => upgradePlan('yearly')}
            >
              <Text style={styles.planBtnText}>Get Yearly Plan</Text>
            </RazorpayCheckoutButton>
          </View>

          {/* 2 Year */}
          <View style={styles.planCard}>
            <Text style={styles.planName}>2 Year Plan</Text>
            <Text style={styles.planPrice}>₹249/-</Text>
            <Text style={styles.planValidity}>Valid for 2 years</Text>
            <View style={styles.planDivider} />
            <PlanFeature text="5 Requests per day" />
            <PlanFeature text="5 Chats per day" />
            <PlanFeature text="Valid for 2 years" />
            <PlanFeature text="Cancel anytime" />
            <RazorpayCheckoutButton
              testID="get-2year-plan"
              amountPaise={24900}
              receipt="two-year-plan"
              plan="two_year"
              title="2 Year Plan"
              description="LinQ 2 Year Plan"
              onError={showToast}
              style={[styles.planBtn, styles.planBtnOutline]}
              textStyle={[styles.planBtnText, { color: colors.primary }]}
              onSuccess={() => upgradePlan('twoYear')}
            >
              <Text style={[styles.planBtnText, { color: colors.primary }]}>Get 2 Year Plan</Text>
            </RazorpayCheckoutButton>
          </View>
        </View>

        {/* Single Unlock */}
        <RazorpayCheckoutButton
          style={styles.singleUnlock}
          testID="single-unlock"
          amountPaise={900}
          receipt="single-unlock"
          plan="single_unlock"
          title="Single Unlock"
          description="LinQ Single Unlock"
          onError={showToast}
          onSuccess={() => {
            singleUnlock();
            showToast('Single unlock purchased');
          }}
        >
          <View style={styles.unlockContent}>
            <View style={styles.unlockIcon}><Ionicons name="key" size={22} color={colors.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unlockTitle}>Single Unlock</Text>
              <Text style={styles.unlockSub}>Unlock a request or start a chat instantly. Valid for 1 request or 1 chat.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.unlockPrice}>₹9</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </View>
          </View>
        </RazorpayCheckoutButton>

        <Text style={styles.sectionTitle}>Earn Rewards</Text>
        <View style={styles.rewardCard}>
          <View style={styles.rewardRow}>
            <View style={[styles.rewardIcon, { backgroundColor: colors.successLight }]}><Ionicons name="share-social" size={20} color={colors.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>Refer a Friend</Text>
              <Text style={styles.rewardSub}>Invite friends and earn</Text>
              <Text style={styles.rewardMeta}>Per successful referral</Text>
            </View>
            <Text style={[styles.rewardAmount, { color: colors.success }]}>₹5</Text>
          </View>
          <View style={styles.rewardDivider} />
          <View style={styles.rewardRow}>
            <View style={[styles.rewardIcon, { backgroundColor: colors.warningLight }]}><Ionicons name="checkmark-done" size={20} color={colors.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>Ride Confirmed</Text>
              <Text style={styles.rewardSub}>Earn when a ride you share is successfully confirmed</Text>
            </View>
            <Text style={[styles.rewardAmount, { color: colors.warning }]}>₹7</Text>
          </View>
          <View style={styles.rewardDivider} />
          <Pressable style={styles.rewardRow} testID="rewards-your-way" onPress={() => router.push('/rewards')}>
            <View style={[styles.rewardIcon, { backgroundColor: colors.successLight }]}><Ionicons name="wallet" size={20} color={colors.success} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>Your Rewards, Your Way</Text>
              <Text style={styles.rewardSub}>Use your rewards balance anytime within the app.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={styles.footer}>Safe • Secure • Trusted</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  intro: { fontSize: font.size.base, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  walletBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  walletAmount: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  walletCta: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.medium },

  earlyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  earlyHeader: { flexDirection: 'row', gap: spacing.md },
  earlyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  earlyTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  earlySub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  limitedBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  limitedText: { fontSize: 9, color: colors.primary, fontWeight: font.weight.medium },
  earlyDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  earlyFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  earlyStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earlyStatText: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  freeBadge: { marginLeft: 'auto', backgroundColor: colors.successLight, paddingHorizontal: spacing.md, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  freeText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium, letterSpacing: 0.5 },

  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.xl, marginBottom: spacing.md },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  secureText: { fontSize: font.size.xs, color: colors.textSecondary },

  plansRow: { flexDirection: 'row', gap: spacing.md },
  planCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  planPopular: { borderColor: colors.primary, borderWidth: 1.5 },
  popularBadge: { position: 'absolute', top: -1, left: -1, backgroundColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderTopLeftRadius: radius.lg, borderBottomRightRadius: radius.md },
  popularText: { fontSize: 9, color: colors.textInverse, fontWeight: font.weight.medium },
  planName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.lg },
  planPrice: { fontSize: font.size['3xl'], color: colors.primary, fontWeight: font.weight.medium, marginTop: 4 },
  planValidity: { fontSize: font.size.xs, color: colors.textTertiary },
  planDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  featureText: { fontSize: font.size.xs, color: colors.textSecondary },
  planBtn: { backgroundColor: colors.primary, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  planBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  planBtnText: { fontSize: font.size.xs, color: colors.textInverse, fontWeight: font.weight.medium },

  singleUnlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg, ...shadow.sm },
  unlockContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  unlockIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.warningLight, alignItems: 'center', justifyContent: 'center' },
  unlockTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  unlockSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  unlockPrice: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },

  rewardCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rewardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  rewardSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  rewardMeta: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2 },
  rewardAmount: { fontSize: font.size.xl, fontWeight: font.weight.medium },
  rewardDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },

  footer: { textAlign: 'center', fontSize: font.size.sm, color: colors.textTertiary, marginTop: spacing['2xl'], letterSpacing: 0.5 },
});
