import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sanitizeNext, destinationAfterAuth } from '@/src/lib/authNavigation';
import { useApp } from '@/src/context/AppContext';
import { signInWithPhoneNumber } from '../src/lib/auth';
import { signInWithProvider } from '../src/lib/oauth';
import { ensureUserProfile, saveProfile, userProfileExists } from '../src/services/userProfile';
import { saveSession } from '../src/services/session';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Login() {
  const router = useRouter();
  // The page the gate turned away from, carried through the whole flow.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const safeNext = sanitizeNext(next);
  const { setConfirmResult, showToast, fetchUserProfile, setOtpVerifiedUid, enterGuestMode } = useApp();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = phone.replace(/\D/g, '').length >= 10;
  // Phone OTP requires Firebase, which only ships in the native build. Web must
  // never fall back to an unverified stub (see src/lib/auth.web.ts).
  const isWeb = Platform.OS === 'web';

  const handleSkip = () => {
    enterGuestMode();
    router.replace('/(tabs)/home');
  };

  const handleWebTestLogin = async (overridePhone?: string, overrideName?: string) => {
    const rawDigits = (overridePhone || phone).replace(/\D/g, '');
    if (rawDigits.length < 10) {
      showToast('Enter a 10-digit mobile number to sign in');
      return;
    }
    setLoading(true);
    try {
      const cleanPhone = rawDigits.slice(-10);
      const testUid = `usr_${cleanPhone}`;
      const name =
        overrideName ||
        (overridePhone
          ? overridePhone === '9876543210'
            ? 'Arjun (Driver)'
            : 'Priya (Passenger)'
          : `User ${cleanPhone.slice(-4)}`);

      await ensureUserProfile({
        userId: testUid,
        name,
        phone: cleanPhone,
        avatarUrl:
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
      });

      await saveSession(testUid);
      await fetchUserProfile(testUid);
      showToast(`Welcome back, ${name}!`);
      router.replace(destinationAfterAuth(next));
    } catch (e: any) {
      showToast(e.message || 'Error signing in on web');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!valid) return;
    if (isWeb) {
      await handleWebTestLogin();
      return;
    }
    try {
      setLoading(true);
      const phoneStr = phone.replace(/\D/g, '');
      const fullPhone = `+91${phoneStr}`;
      // Call the platform-agnostic auth function
      const confirmation = await signInWithPhoneNumber(fullPhone);
      setConfirmResult(confirmation);
      router.push({ pathname: '/otp', params: { phone: fullPhone, ...(safeNext ? { next: safeNext } : {}) } });
    } catch (e: any) {
      showToast(e.message || 'Error sending OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    try {
      setLoading(true);
      const user = await signInWithProvider(provider);
      if (!user) return; // Rider cancelled the browser.
      // account-creation trusts this uid instead of a URL param.
      setOtpVerifiedUid(user.id);
      const isReturningRider = await userProfileExists(user.id);
      if (isReturningRider) {
        await saveSession(user.id);
        // Backfill the email for Google users whose profile predates email capture.
        if (user.email) {
          await saveProfile({ userId: user.id, fields: { email: user.email } });
        }
        await fetchUserProfile(user.id);
        showToast('Welcome back!');
        router.replace(destinationAfterAuth(next));
      } else {
        router.push({
          pathname: '/account-creation',
          params: {
            ...(safeNext ? { next: safeNext } : {}),
            ...(user.email ? { email: user.email } : {}),
            ...(user.user_metadata?.full_name || user.user_metadata?.name
              ? { name: user.user_metadata.full_name || user.user_metadata.name }
              : {}),
          },
        });
      }
    } catch (e: any) {
      showToast(e.message || `Could not sign in with ${provider === 'google' ? 'Google' : 'Apple'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <LinqLogo size={44} showText={false} />
            <Pressable
              testID="skip-login-button"
              onPress={handleSkip}
              hitSlop={12}
            >
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing['2xl'] }}>
            {isWeb ? (
              <View style={styles.card} testID="web-auth-login">
                <View style={styles.noticeHeader}>
                  <Ionicons name="laptop-outline" size={22} color={colors.primary} />
                  <Text style={styles.noticeTitle}>Local Web Testing Mode</Text>
                </View>
                <Text style={styles.noticeText}>
                  Testing on your laptop browser. Enter any 10-digit number or use the 1-click test profiles below to test the full ride lifecycle.
                </Text>

                <View style={[styles.inputRow, { marginTop: spacing.md }]}>
                  <View style={styles.cc}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.ccText}>+91</Text>
                  </View>
                  <TextInput
                    testID="phone-input"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter test mobile number"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="phone-pad"
                    style={styles.input}
                    maxLength={10}
                  />
                </View>

                <PrimaryButton
                  testID="web-login-continue"
                  title={loading ? 'Signing in…' : 'Continue to App'}
                  iconRight={loading ? undefined : 'arrow-forward'}
                  disabled={!valid || loading}
                  onPress={() => void handleWebTestLogin()}
                />

                <View style={styles.webQuickRow}>
                  <Pressable
                    style={styles.webQuickBtn}
                    disabled={loading}
                    onPress={() => void handleWebTestLogin('9876543210', 'Arjun (Driver)')}
                  >
                    <Ionicons name="car-outline" size={16} color={colors.primary} />
                    <Text style={styles.webQuickText}>Login as Driver</Text>
                  </Pressable>

                  <Pressable
                    style={styles.webQuickBtn}
                    disabled={loading}
                    onPress={() => void handleWebTestLogin('9123456780', 'Priya (Passenger)')}
                  >
                    <Ionicons name="person-outline" size={16} color={colors.primary} />
                    <Text style={styles.webQuickText}>Login as Passenger</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Image 
                  source={require('@/assets/images/enter phone no. screen.png')} 
                  style={{ width: '100%', height: 180, marginBottom: spacing.xl }} 
                  resizeMode="contain" 
                />
                <View style={styles.card}>
                  <Text style={styles.title}>Enter your phone number to get started</Text>
                  <View style={styles.inputRow}>
                    <View style={styles.cc}>
                      <Text style={styles.flag}>🇮🇳</Text>
                      <Text style={styles.ccText}>+91</Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                    </View>
                    <TextInput
                      testID="phone-input"
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Mobile number"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="phone-pad"
                      style={styles.input}
                      maxLength={10}
                    />
                  </View>
                  <PrimaryButton
                    testID="login-continue-button"
                    title={loading ? "Sending OTP..." : "Continue"}
                    iconRight={loading ? undefined : "arrow-forward"}
                    disabled={!valid || loading}
                    onPress={handleLogin}
                  />
                </View>
              </>
            )}

            <View style={{ height: spacing.lg }} />

            <Pressable style={styles.socialBtn} testID="continue-google" disabled={loading} onPress={() => handleOAuth('google')}>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </Pressable>
            {/* Continue with Apple is temporarily hidden until the Apple Developer
                Services ID / .p8 key is configured in Supabase. */}

            <Pressable onPress={handleSkip} testID="signin-later">
              <Text style={styles.link}>Skip • Sign in later</Text>
            </Pressable>
          </View>

          <Mission1000Banner />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  title: { fontSize: font.size.base, color: colors.textSecondary, marginBottom: spacing.md },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  noticeTitle: { flex: 1, fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  noticeText: { fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary },
  cc: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, height: 48, borderRightWidth: 1, borderRightColor: colors.border },
  flag: { fontSize: 16, marginRight: 4 },
  ccText: { fontSize: font.size.base, color: colors.textPrimary, marginRight: 4, fontWeight: font.weight.medium },
  input: { flex: 1, height: 48, paddingHorizontal: spacing.md, color: colors.textPrimary, fontSize: font.size.base },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  socialText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  link: { textAlign: 'center', color: colors.textSecondary, fontSize: font.size.base, marginTop: spacing.sm },
  webQuickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  webQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  webQuickText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
    color: colors.primary,
  },
});
