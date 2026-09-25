import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, font, shadow, spacing } from '@/src/theme/tokens';

const HOLD_DURATION_MS = 2000;

/**
 * Press-and-hold SOS trigger.
 *
 * A two second hold is required before `onComplete` fires, which is the
 * difference between a deliberate emergency and a pocket tap. Releasing early
 * resets the progress ring and nothing is dispatched.
 */
export default function SosButton({
  onComplete,
  disabled = false,
  label = 'SOS',
  sublabel = 'Hold 2s',
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
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);
  const dimension = size === 'large' ? 92 : 68;

  const reset = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(0);
    setHolding(false);
  }, [progress]);

  const start = useCallback(() => {
    if (disabled || completedRef.current) return;
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      completedRef.current = true;
      setHolding(false);
      onComplete();
      // Allow the button to be used again after the flow completes.
      setTimeout(() => {
        completedRef.current = false;
        progress.setValue(0);
      }, 1200);
    });
  }, [disabled, onComplete, progress]);

  // A component unmount mid-hold must not leave the animation running.
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
        onPressIn={start}
        onPressOut={reset}
        onTouchEnd={reset}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Hold for two seconds to activate the emergency alert.`}
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

      <Text style={[styles.hint, holding && styles.hintActive]}>
        {holding ? 'Keep holding…' : sublabel}
      </Text>
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
  hintActive: { color: colors.error, fontWeight: font.weight.medium },
});

export { HOLD_DURATION_MS };
