import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { MILESTONE_PLAN_RUPEES, MILESTONE_WINS, useGame } from '@/src/context/GameContext';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

/**
 * The Fill the Ride section for the Referral page.
 *
 * Per the product rules this is an optional engagement feature: it lives on the
 * rewards page, never on Home, and never blocks the core ride flow.
 */
export default function GameCard() {
  const router = useRouter();
  const { lives, wins, winsToMilestone, milestoneUnlocked, loading } = useGame();

  const bars = Array.from({ length: 10 }, (_, i) => i < wins);

  return (
    <View style={styles.wrap} testID="game-card">
      <LinearGradient colors={['#0F3D2E', '#10B981']} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.kicker}>REFER &amp; PLAY</Text>
            <Text style={styles.title}>Play. Refer. Win.</Text>
          </View>
          <View style={styles.livesPill} testID="game-card-lives">
            <Ionicons name="heart" size={14} color={colors.error} />
            <Text style={styles.livesText}>{loading ? '—' : lives} Lives</Text>
          </View>
        </View>

        <Text style={styles.heroSub}>
          Fill every seat before the clock runs out. Every win earns ₹5.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
          onPress={() => router.push('/game/fill-the-ride')}
          testID="game-card-play"
        >
          <Ionicons name="play" size={16} color={colors.primary} />
          <Text style={styles.playText}>PLAY NOW</Text>
        </Pressable>
      </LinearGradient>

      {/* Progress */}
      <View style={styles.section} testID="game-card-progress">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
          <Text style={styles.sectionMeta}>
            <Ionicons name="trophy" size={12} color={colors.warning} /> {wins} / {MILESTONE_WINS} Wins
          </Text>
        </View>

        <View style={styles.bars}>
          {bars.map((filled, i) => (
            <View key={i} style={[styles.bar, filled && styles.barFilled]} />
          ))}
        </View>

        <Text style={styles.progressHint}>
          {milestoneUnlocked
            ? `Annual plan unlocked at ₹${MILESTONE_PLAN_RUPEES}/year`
            : `${winsToMilestone} more win${winsToMilestone === 1 ? '' : 's'} to unlock the ₹${MILESTONE_PLAN_RUPEES} annual plan`}
        </Text>
      </View>

      {/* Need lives? */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Need More Lives?</Text>
        </View>
        <Pressable
          style={styles.referRow}
          onPress={() => router.push('/referral')}
          testID="game-card-refer"
        >
          <View style={styles.referIcon}>
            <Ionicons name="gift" size={18} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.referTitle}>Refer a friend</Text>
            <Text style={styles.referSub}>Verified referral earns +1 life</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  hero: { borderRadius: radius.lg, padding: spacing.lg, ...shadow.md },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  kicker: {
    fontSize: font.size.xs,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.2,
    fontWeight: font.weight.medium,
  },
  title: {
    fontSize: font.size['2xl'],
    color: colors.textInverse,
    fontWeight: font.weight.bold,
    marginTop: 2,
  },
  livesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
  },
  livesText: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  heroSub: {
    fontSize: font.size.sm,
    color: 'rgba(255,255,255,0.9)',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    height: 48,
    borderRadius: radius.pill,
  },
  playText: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.bold, letterSpacing: 0.6 },
  pressed: { opacity: 0.88 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  sectionMeta: { fontSize: font.size.xs, color: colors.textSecondary },
  bars: { flexDirection: 'row', gap: 4, marginTop: spacing.md },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border },
  barFilled: { backgroundColor: colors.success },
  progressHint: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: spacing.sm },
  referRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  referIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  referSub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 1 },
});
