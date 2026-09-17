import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing, font, shadow } from '@/src/theme/tokens';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  variant?: 'default' | 'muted' | 'brand';
}

export function Card({ children, style, padded = true, variant = 'default' }: Props) {
  const bg = variant === 'muted' ? colors.surfaceSecondary : variant === 'brand' ? colors.primaryLight : colors.surface;
  return (
    <View style={[
      styles.card,
      { backgroundColor: bg, padding: padded ? spacing.lg : 0 },
      variant === 'default' && shadow.sm,
      style,
    ]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
});
