import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { colors, spacing, font, layout } from '@/src/theme/tokens';

interface Props {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  showBack?: boolean;
  transparent?: boolean;
  /**
   * Where to go when there is nothing to pop.
   *
   * Screens are sometimes reached with router.replace() (for example leaving
   * the game for the referral page so Back does not bounce the player straight
   * back into the game). In that case router.back() has no history to consume
   * and silently does nothing, which looks like a missing back button.
   */
  fallbackHref?: Href;
}

export default function LinqHeader({
  title,
  onBack,
  right,
  showBack = true,
  transparent,
  fallbackHref = '/(tabs)' as Href,
}: Props) {
  const router = useRouter();

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <View style={[styles.row, transparent && { backgroundColor: 'transparent' }]}>
      {showBack ? (
        <Pressable
          testID="header-back-button"
          onPress={goBack}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
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
