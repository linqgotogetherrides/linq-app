import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { colors, font, radius } from '@/src/theme/tokens';

export default function NotificationButton({
  testID = 'notifications-button',
  onDark = false,
}: {
  testID?: string;
  onDark?: boolean;
}) {
  const router = useRouter();
  const { pendingRideRequestCount } = useApp();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Open notifications"
      hitSlop={6}
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [
        styles.button,
        onDark ? styles.buttonOnDark : styles.buttonOnLight,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="notifications-outline"
        size={22}
        color={onDark ? colors.primary : colors.textPrimary}
      />
      {pendingRideRequestCount > 0 ? (
        <View style={styles.badge} testID={`${testID}-badge`}>
          <Text style={styles.badgeText}>
            {pendingRideRequestCount > 9 ? '9+' : pendingRideRequestCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonOnLight: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  buttonOnDark: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  pressed: { opacity: 0.82 },
  badge: {
    position: 'absolute',
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: font.weight.medium,
  },
});
