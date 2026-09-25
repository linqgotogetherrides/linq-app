import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { MILESTONE_PLAN_RUPEES, MILESTONE_WINS, useGame } from '@/src/context/GameContext';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

/**
 * Compact promotional card for the Pricing page.
 *
 * Deliberately small: the pricing page still sells the normal plans. The game
 * is only a second route to the annual plan, for players who have earned it.
 */
export default function GamePromoCard() {
  const router = useRouter();
  const { wins, winsToMilestone, milestoneUnlocked } = useGame();

  return (
    <View style={styles.card} testID="game-promo-card">
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="game-controller" size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>PLAY &amp; UNLOCK</Text>
          <Text style={styles.sub}>Think you can fill the ride?</Text>
        </View>
      </View>

      <Text style={styles.body}>
        Play the LinQ challenge and work your way toward
      </Text>
      <Text style={styles.price} testID="game-promo-price">
        ₹{MILESTONE_PLAN_RUPEES} / YEAR
      </Text>
      <Pressable
        style={styles.requirementRow}
        onPress={() => router.push('/game/milestone')}
        testID="game-promo-milestone"
      >
        <Text style={styles.requirement}>
          {milestoneUnlocked
            ? `Unlocked — you have ${wins} wins`
            : `${MILESTONE_WINS} wins required · ${winsToMilestone} to go`}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </Pressable>

      <View style={styles.bars}>
        {Array.from({ length: MILESTONE_WINS }, (_, i) => (
          <View key={i} style={[styles.bar, i < wins && styles.barFilled]} />
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
        onPress={() => router.push('/game/fill-the-ride')}
        testID="game-promo-play"
      >
        <Text style={styles.ctaText}>PLAY NOW</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.bold, letterSpacing: 0.6 },
  sub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 1 },
  body: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.md },
  price: { fontSize: font.size.xl, color: colors.primary, fontWeight: font.weight.medium, marginTop: 2 },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  requirement: { flex: 1, fontSize: font.size.xs, color: colors.textTertiary },
  bars: { flexDirection: 'row', gap: 3, marginTop: spacing.md },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  barFilled: { backgroundColor: colors.success },
  cta: {
    marginTop: spacing.lg,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ctaText: { fontSize: font.size.base, color: colors.textInverse, fontWeight: font.weight.bold, letterSpacing: 0.5 },
});
