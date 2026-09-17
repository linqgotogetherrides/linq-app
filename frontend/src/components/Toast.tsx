import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { colors, font, spacing } from '@/src/theme/tokens';

export default function Toast() {
  const { toast } = useApp();
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (toast) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [toast, anim]);

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="none"
      testID="app-toast"
      style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
    >
      <Text style={styles.text}>{toast}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: colors.surfaceInverse, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: 999, maxWidth: '80%',
  },
  text: { color: colors.textInverse, fontSize: font.size.base, fontWeight: font.weight.medium },
});
