import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import PrimaryButton from './PrimaryButton';
import { colors, spacing, font } from '@/src/theme/tokens';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

export default function GuestPrompt({ icon, title, subtitle }: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.buttonContainer}>
        <PrimaryButton title="Log In or Sign Up" onPress={() => router.push('/onboarding')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: font.size.xl,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  }
});
