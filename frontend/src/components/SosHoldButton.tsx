import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, spacing } from '@/src/theme/tokens';

const HOLD_DURATION_MS = 2000;

/**
 * The Home screen SOS control.
 *
 * Visually this is the original LinQ SOS pill: soft red tint, thin red border,
 * shield icon, "SOS" label. The only thing that changed is the behaviour — it
 * now requires a two second press-and-hold instead of opening a menu, which is
 * what stops a pocket tap from raising a false emergency.
 *
 * The hold is communicated in three non-intrusive ways so the original
 * silhouette is preserved:
 *   1. the pill background fills with red as the hold progresses
 *   2. a thin progress bar grows along the bottom edge
 *   3. the label changes from "SOS" to "Keep holding"
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
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const armedRef = useRef(false);

  const reset = useCallback(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    setHolding(false);
  }, [progress]);

  const start = useCallback(() => {
    if (disabled || armedRef.current) return;
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      armedRef.current = true;
      setHolding(false);
      onComplete();
      setTimeout(() => {
        armedRef.current = false;
        progress.setValue(0);
      }, 1000);
    });
  }, [disabled, onComplete, progress]);

  // Never leave the animation running if the screen unmounts mid-hold.
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFF5F5', '#EF4444'],
    extrapolate: 'clamp',
  });

  const labelColor = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: ['#E53E3E', '#E53E3E', '#FFFFFF'],
    extrapolate: 'clamp',
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1.05],
    extrapolate: 'clamp',
  });

  return (
    <Pressable
      testID={testID}
      onPressIn={start}
      onPressOut={reset}
      onTouchEnd={reset}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="SOS. Press and hold for two seconds to activate the emergency alert."
      style={[styles.pressable, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.pill, { backgroundColor }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons
            name="shield-checkmark"
            size={18}
            color={holding ? colors.textInverse : '#E53E3E'}
          />
        </Animated.View>
        <Animated.Text style={[styles.text, { color: labelColor }]}>
          {holding ? 'Keep holding' : 'SOS'}
        </Animated.Text>

        {/* Progress bar along the bottom edge. */}
        <View style={styles.track} pointerEvents="none">
          <Animated.View style={[styles.fill, { width: fillWidth }]} />
        </View>
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
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  fill: {
    height: '100%',
    backgroundColor: '#C81E1E',
  },
});

export { HOLD_DURATION_MS };
