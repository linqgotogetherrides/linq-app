import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, spacing } from '@/src/theme/tokens';
import { GAME_CONFIG } from '@/src/lib/game/constants';

type Props = {
  lives: number;
  timeRemainingMs: number;
  seats: number;
  wins: number;
  targetWins: number;
  onPause: () => void;
};

/** Formats ms as MM:SS, the format the spec asks for. */
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GameHUD({
  lives,
  timeRemainingMs,
  seats,
  wins,
  targetWins,
  onPause,
}: Props) {
  const urgent = timeRemainingMs <= 5000;

  return (
    <View style={styles.wrap} testID="game-hud">
      <View style={styles.pill}>
        <Ionicons name="heart" size={15} color={colors.error} />
        <Text style={styles.pillText} testID="hud-lives">
          {lives}
        </Text>
      </View>

      <View style={[styles.clock, urgent && styles.clockUrgent]} testID="hud-clock">
        <Ionicons name="time" size={15} color={urgent ? colors.textInverse : colors.primary} />
        <Text style={[styles.clockText, urgent && styles.clockTextUrgent]}>
          {clock(timeRemainingMs)}
        </Text>
      </View>

      <View style={styles.pill}>
        <Ionicons name="trophy" size={15} color={colors.warning} />
        <Text style={styles.pillText} testID="hud-wins">
          {wins}/{targetWins}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={styles.seats} testID="hud-seats">
          {Array.from({ length: GAME_CONFIG.seatsRequired }).map((_, i) => (
            <View
              key={i}
              style={[styles.seat, i < seats ? styles.seatFilled : styles.seatEmpty]}
            />
          ))}
        </View>
        <Text style={styles.seatLabel}>
          {seats}/{GAME_CONFIG.seatsRequired}
        </Text>
      </View>

      <View style={styles.actions}>
        <Ionicons name="ellipse" size={13} color="rgba(255,255,255,0.45)" />
        <Text style={styles.hint}>swipe to change lane</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 34,
  },
  pillText: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 34,
  },
  clockUrgent: { backgroundColor: colors.error },
  clockText: {
    fontSize: font.size.base,
    color: colors.textInverse,
    fontWeight: font.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  clockTextUrgent: { color: colors.textInverse },
  right: { marginLeft: 'auto', alignItems: 'flex-end' },
  seats: { flexDirection: 'row', gap: 3 },
  seat: { width: 12, height: 8, borderRadius: 2 },
  seatFilled: { backgroundColor: colors.success },
  seatEmpty: { backgroundColor: 'rgba(255,255,255,0.28)' },
  seatLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  actions: {
    position: 'absolute',
    bottom: -2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hint: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },
});
