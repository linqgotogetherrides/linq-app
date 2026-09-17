import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, font, layout } from '@/src/theme/tokens';

interface Props {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  showBack?: boolean;
  transparent?: boolean;
}

export default function LinqHeader({ title, onBack, right, showBack = true, transparent }: Props) {
  const router = useRouter();
  return (
    <View style={[styles.row, transparent && { backgroundColor: 'transparent' }]}>
      {showBack ? (
        <Pressable
          testID="header-back-button"
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      ) : <View style={{ width: 24 }} />}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  back: { width: 40, alignItems: 'flex-start' },
  title: {
    flex: 1,
    fontSize: font.size.xl,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    textAlign: 'center',
  },
  right: { minWidth: 40, alignItems: 'flex-end' },
});
