import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_REFERRAL_KEY } from '@/src/services/referralLink';
import { useApp } from '@/src/context/AppContext';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Otp() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { confirmResult, showToast, fetchUserProfile } = useApp();
  const [otp, setOtp] = useState('');
  const [remaining, setRemaining] = useState(60);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (remaining > 0) {
      const t = setTimeout(() => setRemaining(remaining - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [remaining]);

  const canContinue = otp.length === 6;

  const handleVerify = async () => {
    if (!confirmResult) {
      showToast('Session expired. Please request a new OTP.');
      router.replace('/login');
      return;
    }
    try {
      setLoading(true);
      const userCredential = await confirmResult.confirm(otp);
      const firebaseUser = userCredential.user;

      // A referral code from the invite link (?ref=…) is carried through signup
      // and claimed after the profile row exists.
      let refCode: string | null = null;
      try {
        const stored = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
        if (stored) refCode = stored;
      } catch {
        refCode = null;
      }
      if (!refCode && typeof globalThis.location?.search === 'string') {
        refCode = new URLSearchParams(globalThis.location.search).get('ref');
      }

      // Check if user exists in Supabase
      const existingProfile = await fetchUserProfile(firebaseUser.uid);

      if (existingProfile) {
        showToast('Welcome back!');
        router.replace('/(tabs)');
      } else {
        showToast('Phone verified successfully!');
        router.replace({
          pathname: '/account-creation',
          params: {
            uid: firebaseUser.uid,
            phone: firebaseUser.phoneNumber || '',
            ...(refCode ? { ref: refCode } : {}),
          },
        });
      }
    } catch (e: any) {
      showToast(e.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="otp-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, padding: spacing.xl }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={styles.card}>
            <Text style={styles.title}>Enter the OTP</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.lg }}>
              <Text style={styles.sub}>We&apos;ve sent a 6 digit code to {phone || '9****1232'}</Text>
              <Link href="/login" asChild>
                <Pressable style={{ marginLeft: 8 }} hitSlop={10}>
                  <Text style={{ color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium }}>Edit</Text>
                </Pressable>
              </Link>
            </View>
            <View style={styles.otpRow}>
              <TextInput
                testID="otp-input"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.singleOtpInput}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <Text style={styles.resend}>
              Resend OTP in <Text style={{ color: colors.error }}>{remaining} sec</Text>
            </Text>
            <PrimaryButton
              testID="otp-continue-button"
              title={loading ? "Verifying..." : "Continue"}
              iconRight={loading ? undefined : "arrow-forward"}
              disabled={!canContinue || loading}
              onPress={handleVerify}
            />
          </View>
        </View>
        <Mission1000Banner />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  title: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  singleOtpInput: {
    flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, textAlign: 'center', fontSize: font.size['2xl'], color: colors.textPrimary,
    letterSpacing: 12,
  },
  resend: { textAlign: 'center', color: colors.textSecondary, fontSize: font.size.sm, marginBottom: spacing.md },
  link: { textAlign: 'center', color: colors.textSecondary, fontSize: font.size.base },
});
