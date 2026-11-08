import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, font, shadow, spacing } from '@/src/theme/tokens';

const TAP_FEEDBACK_MS = 160;

/**
 * Tap-to-start SOS trigger.
 *
 * One tap opens the automatic SOS countdown. The countdown is the confirmation
 * step, so this button does not require a press-and-hold.
 */
export default function SosButton({
  onComplete,
  disabled = false,
  label = 'SOS',
  sublabel = 'Tap to start',
  size = 'default',
  testID = 'sos-button',
}: {
  onComplete: () => void;
  disabled?: boolean;
  label?: string;
  sublabel?: string;
  size?: 'default' | 'large';
  testID?: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);
  const dimension = size === 'large' ? 92 : 68;

  const start = useCallback(() => {
    if (disabled || completedRef.current) return;
    completedRef.current = true;

    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 1,
      duration: TAP_FEEDBACK_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    onComplete();

    // Allow the button to be used again after the flow completes.
    setTimeout(() => {
      completedRef.current = false;
      progress.setValue(0);
    }, 1200);
  }, [disabled, onComplete, progress]);

  // A component unmount mid-tap must not leave the animation running.
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const ringScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.05, 1],
    outputRange: [0, 0.9, 0.35],
  });

  return (
    <View style={styles.wrapper} testID={`${testID}-wrapper`}>
      <Pressable
        testID={testID}
        onPress={start}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to start the emergency countdown.`}
        style={[
          styles.button,
          { width: dimension, height: dimension, borderRadius: dimension / 2 },
          disabled && styles.buttonDisabled,
        ]}
      >
        <LinearGradient
          colors={
            disabled
              ? [colors.textTertiary, colors.textTertiary]
              : ['#FF6B6B', colors.error, '#C81E1E']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { borderRadius: dimension / 2 }]}
        >
          {/* Progress ring fills as the hold completes. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.progressRing,
              {
                width: dimension,
                height: dimension,
                borderRadius: dimension / 2,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
                borderColor: colors.textInverse,
              },
            ]}
          />
          <Ionicons name="warning" size={size === 'large' ? 30 : 22} color={colors.textInverse} />
          <Text style={[styles.label, size === 'large' && styles.labelLarge]}>{label}</Text>
        </LinearGradient>
      </Pressable>

      <Text style={styles.hint}>{sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  button: {
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: colors.error, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
      default: {},
    }),
  },
  buttonDisabled: { opacity: 0.6 },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  progressRing: {
    position: 'absolute',
    borderWidth: 3,
  },
  label: {
    color: colors.textInverse,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    letterSpacing: 0.8,
    marginTop: 1,
  },
  labelLarge: { fontSize: font.size.base, marginTop: 2 },
  hint: {
    marginTop: spacing.sm,
    fontSize: font.size.xs,
    color: colors.textTertiary,
  },
});

export { TAP_FEEDBACK_MS };
