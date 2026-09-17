import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, font, spacing } from '@/src/theme/tokens';

const LOGO = require('../../assets/images/linq-logo.png');

export default function LinqLogo({ size = 64, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" />
      {showText && <Text style={styles.tag}>Rides</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  tag: { marginTop: spacing.xs, color: colors.textSecondary, fontSize: font.size.sm, letterSpacing: 2 },
});
