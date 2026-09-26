import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { signInWithPhoneNumber } from '../src/lib/auth';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Login() {
  const router = useRouter();
  const { setConfirmResult, showToast } = useApp();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = phone.replace(/\D/g, '').length >= 10;

  const handleLogin = async () => {
    if (!valid) return;
    try {
      setLoading(true);
      const phoneStr = phone.replace(/\D/g, '');
      const fullPhone = `+91${phoneStr}`;
      // Call the platform-agnostic auth function
      const confirmation = await signInWithPhoneNumber(fullPhone);
      setConfirmResult(confirmation);
      router.push({ pathname: '/otp', params: { phone: fullPhone } });
    } catch (e: any) {
      showToast(e.message || 'Error sending OTP');
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
            <Text style={styles.skip} accessibilityRole="header">
              Step 1 of 2
            </Text>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing['2xl'] }}>
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

            <View style={{ height: spacing.lg }} />

            <Pressable style={styles.socialBtn} testID="continue-google" onPress={() => router.push('/account-creation')}>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </Pressable>
            <Pressable style={styles.socialBtn} testID="continue-apple" onPress={() => router.push('/account-creation')}>
              <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
              <Text style={styles.socialText}>Continue with Apple</Text>
            </Pressable>

            <Text style={styles.link} testID="signin-required-note">
              An account is required to post a ride, request a seat or chat.
            </Text>
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
});
