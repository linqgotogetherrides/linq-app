import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import LinqLogo from '@/src/components/LinqLogo';
import { colors, font, spacing } from '@/src/theme/tokens';

export default function Splash() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace('/onboarding'), 1400);
    return () => clearTimeout(t);
  }, [router]);

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
