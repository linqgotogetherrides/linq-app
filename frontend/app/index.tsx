import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import LinqLogo from '@/src/components/LinqLogo';
import { useApp } from '@/src/context/AppContext';
import { colors, font, spacing } from '@/src/theme/tokens';

export default function Splash() {
  const router = useRouter();
  const { user, booting } = useApp();
  // Hold the logo briefly so this does not flash, then route on what we know.
  const [minElapsed, setMinElapsed] = useState(false);
  const routed = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Wait for the session answer, otherwise a returning rider would be sent
    // through onboarding and asked to sign in again on every launch.
    if (!minElapsed || booting || routed.current) return;
    routed.current = true;
    router.replace(user ? '/(tabs)' : '/onboarding');
  }, [minElapsed, booting, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <LinqLogo size={120} />
      <Text style={styles.tag}>Find your Ride Twin.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  tag: { marginTop: spacing.xl, color: colors.textSecondary, fontSize: font.size.lg },
});
