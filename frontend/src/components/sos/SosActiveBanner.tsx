import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useSos } from '@/src/context/SosContext';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

function relativeUpdate(value?: string | null): string {
  if (!value) return 'waiting for first fix';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return 'updated just now';
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `updated ${minutes}m ago`;
}

/**
 * Persistent SOS state shown on Home whenever an incident is ACTIVE.
 * Tapping it opens the full SOS status screen.
 */
export default function SosActiveBanner() {
  const router = useRouter();
  const { incident, isActive, tracking } = useSos();

  if (!isActive || !incident) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => router.push('/sos/active')}
      testID="sos-active-banner"
      accessibilityRole="button"
      accessibilityLabel="SOS is active. Open SOS status."
    >
      <View style={styles.iconWrap}>
        <Ionicons name="warning" size={20} color={colors.textInverse} />
      </View>

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>SOS ACTIVE</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          Your location is being shared with your emergency contacts and LINQ Safety
          Team.
        </Text>
        <Text style={styles.meta} testID="sos-banner-meta">
          {incident.reference_code} ·{' '}
          {relativeUpdate(tracking.lastPushAt ?? incident.last_location_at)}
          {tracking.backgroundActive ? ' · background on' : ' · app open only'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.error,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    fontSize: font.size.base,
    color: colors.textInverse,
    fontWeight: font.weight.bold,
    letterSpacing: 0.8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textInverse },
  liveText: {
    fontSize: 8,
    color: colors.textInverse,
    fontWeight: font.weight.bold,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: font.size.xs,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 16,
    marginTop: 3,
  },
  meta: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 3,
  },
});
