import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useApp } from '@/src/context/AppContext';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

/**
 * Shared "sign in to get started" sheet for guest browsing.
 *
 * Guests can look at Home, but anything they tap there opens this prompt. A
 * plain RN `Alert` would not work on web (react-native-web's Alert is a no-op),
 * so the prompt is a Modal instead.
 */
export default function GuestLoginPrompt() {
  const router = useRouter();
  const { loginPromptVisible, dismissLoginPrompt } = useApp();

  const handleSignIn = () => {
    dismissLoginPrompt();
    router.push('/login');
  };

  return (
    <Modal
      visible={loginPromptVisible}
      transparent
      animationType="fade"
      onRequestClose={dismissLoginPrompt}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissLoginPrompt}
          accessibilityLabel="Close sign in prompt"
        />
        <View style={styles.card} testID="guest-login-prompt">
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed-outline" size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Sign in to get started</Text>
          <Text style={styles.subtitle}>
            Create a free account or log in to book rides, chat with ride twins and
            keep your trips safe.
          </Text>
          <PrimaryButton
            testID="guest-login-button"
            title="Log In or Sign Up"
            iconRight="arrow-forward"
            onPress={handleSignIn}
          />
          <Pressable
            testID="guest-dismiss-button"
            onPress={dismissLoginPrompt}
            hitSlop={10}
            style={styles.notNow}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  notNow: {
    marginTop: spacing.md,
    padding: spacing.xs,
  },
  notNowText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
});
