import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

// Mission1000 banner styled illustration (approximation, no external asset needed)
export default function Mission1000Banner({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.banner, compact && { padding: spacing.md }]} testID="mission1000-banner">
      <View style={styles.decor} />
      <View style={styles.decor2} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.flag}>
          <Text style={styles.flagText}>MISSION</Text>
          <Text style={styles.flag1000}>1000</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Let&apos;s clear</Text>
          <Text style={styles.subtitle}>Hyderabad&apos;s traffic</Text>
          <Text style={styles.days}>in next <Text style={{ color: colors.primary }}>1000 days</Text>.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  decor: {
    position: 'absolute', top: -20, right: -20, width: 80, height: 80,
    borderRadius: 40, backgroundColor: colors.primaryMuted, opacity: 0.5,
  },
  decor2: {
    position: 'absolute', bottom: -30, left: -10, width: 60, height: 60,
    borderRadius: 30, backgroundColor: colors.primaryMuted, opacity: 0.4,
  },
  flag: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  flagText: { color: colors.textInverse, fontSize: 9, letterSpacing: 1, fontWeight: font.weight.medium },
  flag1000: { color: colors.yellow, fontSize: 18, letterSpacing: 1, fontWeight: font.weight.medium },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  subtitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  days: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
