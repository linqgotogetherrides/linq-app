import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { font, radius, spacing } from '@/src/theme/tokens';

/**
 * The Home screen SOS control.
 *
 * A single tap opens the SOS countdown. The countdown — not a press-and-hold
 * gesture — is the accidental-trigger guard: it gives the rider ten seconds to
 * cancel before any evidence is captured or WhatsApp is opened.
 *
 * The pill keeps the original LinQ styling, with a brief fill/scale animation
 * as tap feedback so the control still feels deliberate.
 */
export default function SosHoldButton({
  onComplete,
  disabled = false,
  testID = 'sos-button',
}: {
  onComplete: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const press = useRef(new Animated.Value(0)).current;

  const start = useCallback(() => {
    if (disabled) return;

    press.stopAnimation();
    Animated.sequence([
      Animated.timing(press, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(press, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();

    onComplete();
  }, [disabled, onComplete, press]);

  // Never leave the animation running if the screen unmounts mid-tap.
  useEffect(() => () => press.stopAnimation(), [press]);

  const backgroundColor = press.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFF5F5', '#FECACA'],
    extrapolate: 'clamp',
  });

  const scale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
    extrapolate: 'clamp',
  });

  return (
    <Pressable
      testID={testID}
      onPress={start}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="SOS. Tap to start the emergency countdown."
      style={[styles.pressable, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.pill, { backgroundColor, transform: [{ scale }] }]}>
        <Ionicons name="shield-checkmark" size={18} color="#E53E3E" />
        <Animated.Text style={styles.text}>SOS</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#FEB2B2',
    paddingHorizontal: spacing.sm,
    height: 34,
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  text: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: '#E53E3E',
  },
});
