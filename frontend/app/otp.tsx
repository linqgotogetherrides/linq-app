import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_REFERRAL_KEY } from '@/src/services/referralLink';
import { saveSession } from '@/src/services/session';
import { userProfileExists } from '@/src/services/userProfile';
import { signInWithPhoneNumber } from '@/src/lib/auth';
import { destinationAfterAuth, sanitizeNext } from '@/src/lib/authNavigation';
import { useApp } from '@/src/context/AppContext';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Otp() {
  const router = useRouter();
  const { phone, next } = useLocalSearchParams<{ phone: string; next?: string }>();
  const { confirmResult, setConfirmResult, setOtpVerifiedUid, showToast, fetchUserProfile } = useApp();
  const [otp, setOtp] = useState('');
  const [remaining, setRemaining] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (remaining > 0) {
      const t = setTimeout(() => setRemaining(remaining - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [remaining]);

  // Phone OTP exists only in the native build. A direct /otp visit on web must
  // never render a pretend verification screen.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    showToast('Phone sign-in is not available on the web. Use Google or the mobile app.');
    router.replace('/login');
  }, [router, showToast]);

  const canContinue = otp.length === 6;

  /**
   * The countdown only controls how often a code can be requested. Once it
   * reaches zero the label becomes a real button: a new confirmation replaces
   * the expired one, otherwise Continue would keep checking the old session.
   */
  const handleResend = async () => {
    if (remaining > 0 || resending) return;
    if (Platform.OS === 'web') {
      showToast('Phone sign-in is not available on the web.');
      router.replace('/login');
      return;
    }
    if (!phone) {
      showToast('Phone number missing. Please go back and try again.');
      return;
    }
    try {
      setResending(true);
      const confirmation = await signInWithPhoneNumber(phone);
      setConfirmResult(confirmation);
      setOtp('');
      setRemaining(60);
      showToast('A new OTP has been sent.');
    } catch (e: any) {
      showToast(e?.message || 'Could not resend the OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    if (Platform.OS === 'web') {
      showToast('Phone sign-in is not available on the web.');
      router.replace('/login');
      return;
    }
    if (!confirmResult) {
      showToast('Session expired. Please request a new OTP.');
      router.replace('/login');
      return;
    }
    try {
      setLoading(true);
      const safeNext = sanitizeNext(next);
      const userCredential = await confirmResult.confirm(otp);
      const firebaseUser = userCredential.user;
      // The phone is now proven. Account creation trusts this, not a URL param.
      setOtpVerifiedUid(firebaseUser.uid);

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

      // Whether this rider already has a profile has to be asked *before* any
      // self-healing fetch. fetchUserProfile() creates a missing row so the
      // referral game and seat requests stop failing on a foreign key, which
      // means its return value can no longer distinguish a new rider from a
      // returning one. Relying on it sent every new rider straight into the app
      // and account creation was never reached.
      const isReturningRider = await userProfileExists(firebaseUser.uid);

      if (isReturningRider) {
        // Remember the uid so the gate lets this rider back in next launch
        // instead of bouncing them through signup every time.
        await saveSession(firebaseUser.uid);
        await fetchUserProfile(firebaseUser.uid);
        showToast('Welcome back!');
        router.replace(destinationAfterAuth(next));
      } else {
        // No session is saved yet. account-creation writes it once the profile
        // exists, otherwise a cold start would self-heal an empty profile and
        // let the rider in without ever completing signup.
        showToast('Phone verified successfully!');
        router.replace({
          pathname: '/account-creation',
          params: {
            uid: firebaseUser.uid,
            phone: firebaseUser.phoneNumber || '',
            ...(safeNext ? { next: safeNext } : {}),
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

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl }}>
          <Text style={styles.sub}>
            Phone sign-in is not available on the web. Redirecting to sign in…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
            {remaining > 0 ? (
              <Text style={styles.resend}>
                Resend OTP in <Text style={{ color: colors.error }}>{remaining} sec</Text>
              </Text>
            ) : (
              <Pressable
                testID="resend-otp-button"
                onPress={handleResend}
                disabled={resending}
                hitSlop={10}
                style={styles.resendActionWrap}
              >
                <Text style={[styles.resendAction, resending && { opacity: 0.6 }]}>
                  {resending ? 'Sending OTP...' : 'Resend OTP'}
                </Text>
              </Pressable>
            )}
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
  resendActionWrap: { alignItems: 'center', marginBottom: spacing.md },
  resendAction: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium, textDecorationLine: 'underline' },
  link: { textAlign: 'center', color: colors.textSecondary, fontSize: font.size.base },
});
