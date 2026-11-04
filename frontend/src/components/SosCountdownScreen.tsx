import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

const RING_SIZE = 220;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type Props = {
  seconds: number;
  progress: number;
  contactName: string;
  onCancel: () => void;
  onStartNow: () => void;
};

export default function SosCountdownScreen({
  seconds,
  progress,
  contactName,
  onCancel,
  onStartNow,
}: Props) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']} testID="sos-countdown-screen">
      <View style={styles.content}>
        <View style={styles.alertBadge}>
          <Ionicons name="warning" size={16} color={colors.error} />
          <Text style={styles.alertBadgeText}>EMERGENCY SOS</Text>
        </View>

        <Text style={styles.title}>
          SOS will start in {seconds > 0 ? `${seconds} second${seconds === 1 ? '' : 's'}` : 'a moment'}
        </Text>
        <Text style={styles.subtitle}>
          LinQ will collect evidence and open WhatsApp with a message for{' '}
          {contactName}.
        </Text>

        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.errorLight}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.error}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringLabel} pointerEvents="none">
            <Text style={styles.seconds} testID="sos-countdown-seconds">
              {Math.max(0, seconds)}
            </Text>
            <Text style={styles.secondsUnit}>seconds</Text>
          </View>
        </View>

        <View style={styles.explanation}>
          <Bullet icon="camera-outline" text="Captures 2 back and 2 front photos." />
          <Bullet icon="videocam-outline" text="Records a 5 second video and audio clip." />
          <Bullet icon="location-outline" text="Saves your location and backs up the evidence." />
          <Bullet icon="logo-whatsapp" text="Opens WhatsApp so you can send the alert." />
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            title="CANCEL SOS"
            variant="danger"
            size="lg"
            icon="close-circle-outline"
            onPress={onCancel}
            testID="sos-cancel-button"
          />
          <Pressable
            onPress={onStartNow}
            style={styles.startNow}
            accessibilityRole="button"
            accessibilityLabel="Start SOS now"
            testID="sos-start-now-button"
          >
            <Text style={styles.startNowText}>Start now</Text>
          </Pressable>
          <Text style={styles.cancelHint}>
            Cancel now if you are safe. No evidence is captured after cancelling.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Bullet({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={18} color={colors.error} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F9',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.lg,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  alertBadgeText: {
    color: colors.error,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    letterSpacing: 0.8,
  },
  title: {
    marginTop: spacing.xl,
    color: colors.textPrimary,
    fontSize: font.size['3xl'],
    fontWeight: font.weight.bold,
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: font.size.base,
    textAlign: 'center',
    lineHeight: 20,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seconds: {
    color: colors.error,
    fontSize: 68,
    lineHeight: 74,
    fontWeight: font.weight.bold,
  },
  secondsUnit: {
    color: colors.textSecondary,
    fontSize: font.size.sm,
    marginTop: -spacing.xs,
  },
  explanation: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bulletText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: font.size.base,
    lineHeight: 19,
  },
  actions: {
    width: '100%',
    marginTop: 'auto',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  startNow: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  startNowText: {
    color: colors.primary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
  },
  cancelHint: {
    color: colors.textTertiary,
    fontSize: font.size.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
});
