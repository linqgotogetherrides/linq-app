import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font } from '@/src/theme/tokens';

export default function EmptyState({
  title = 'Nothing here yet',
  subtitle,
  icon = 'search-outline',
}: {
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.container} testID="empty-state">
      <View style={styles.circle}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  circle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginBottom: 6 },
  subtitle: { fontSize: font.size.base, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 },
});
