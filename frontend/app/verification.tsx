import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import LinqLogo from '@/src/components/LinqLogo';
import PrimaryButton from '@/src/components/PrimaryButton';
import VerificationUnavailableModal from '@/src/components/VerificationUnavailableModal';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import {
  PAN_PAGE_ROUTE,
  actionForDocument,
  type UnavailableDocType,
} from '@/src/lib/verificationOptions';
import { colors, spacing, font, radius } from '@/src/theme/tokens';
import type { VerificationDocument } from '@/src/types';

const options: { key: VerificationDocument; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: 'aadhaar', label: 'Aadhaar Card', sub: 'Verify using your Aadhaar', icon: 'id-card', color: colors.primary, bg: colors.primaryLight },
  { key: 'pan', label: 'PAN Card', sub: 'Verify using your PAN card', icon: 'card', color: colors.warning, bg: colors.warningLight },
  { key: 'dl', label: 'Driving Licence', sub: 'Verify using your Driving Licence', icon: 'car-sport', color: colors.info, bg: colors.infoLight },
];

export default function Verification() {
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user, fetchUserProfile, showToast } = useApp();
  const [selected, setSelected] = useState<VerificationDocument>(user?.verificationDocument || 'aadhaar');
  const [unavailableDoc, setUnavailableDoc] = useState<UnavailableDocType | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Tapping an option shows what it does.
   *
   * Aadhaar and driving licence are not offered right now, so their tap opens
   * the truthful "currently unavailable" sheet instead of being selectable as
   * if verification could follow. PAN records the choice and moves on to its
   * dedicated details page.
   */
  const handleOptionPress = (key: VerificationDocument) => {
    const action = actionForDocument(key);
    if (!action) return;
    if (action.type === 'show_unavailable') {
      setUnavailableDoc(action.docType);
      return;
    }
    // PAN is the only method with a real flow, so choosing it moves straight
    // to the page where the rider enters their PAN details and verifies.
    void continueWithDocument(key);
  };

  /**
   * Records the rider's choice, then routes to the method's next step. PAN
   * opens its dedicated verification page; the gated documents never reach
   * here because they only open the "currently unavailable" sheet.
   */
  const continueWithDocument = async (docType: VerificationDocument) => {
    if (loading) return;

    if (docType !== 'pan') {
      setUnavailableDoc(docType);
      return;
    }

    setSelected(docType);

    if (!uid) {
      // The PAN page resolves the rider from the session, so it can still run
      // when this screen was opened without a uid parameter.
      router.push(PAN_PAGE_ROUTE as Href);
      return;
    }

    try {
      setLoading(true);
      // Never overwrite a verification the backend has already confirmed. The
      // client-side write below may only move an unverified account to
      // 'pending'; the reverse -- pressing Continue after the hosted PAN flow
      // was completed during signup -- would let this screen mark a rider
      // unverified that Cashfree's webhook marked verified.
      const { data: current, error: readError } = await supabase
        .from('user_profiles')
        .select('verification_status')
        .eq('id', uid)
        .maybeSingle();
      if (!readError && current?.verification_status === 'verified') {
        await fetchUserProfile(uid);
        showToast('Your account is already verified!');
        router.replace('/(tabs)/home');
        return;
      }

      const { error } = await supabase.from('user_profiles').update({
        verification_status: 'pending',
        verification_document: docType,
      }).eq('id', uid);
      
      if (error) throw error;
      
      await fetchUserProfile(uid);
      router.push(PAN_PAGE_ROUTE as Href);
    } catch (e: any) {
      showToast(e.message || 'Error saving verification status');
      router.replace('/(tabs)/home');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    void continueWithDocument(selected);
  };

  return (
    <SafeAreaView style={styles.container} testID="verification-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <View style={styles.top}>
          <LinqLogo size={40} showText={false} />
          <Pressable onPress={() => router.replace('/(tabs)/home')} testID="skip-verify">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <View style={styles.hero}>
              <Ionicons name="shield-checkmark" size={64} color={colors.primary} />
            </View>
            <Text style={styles.title}>Verify your identity</Text>
            <Text style={styles.sub}>Choose any one option to verify yourself</Text>
          </View>

          {options.map((o) => (
            <Pressable
              key={o.key}
              testID={`verify-option-${o.key}`}
              onPress={() => handleOptionPress(o.key)}
              style={[styles.option, selected === o.key && styles.optionActive]}
            >
              <View style={[styles.optionIcon, { backgroundColor: o.bg }]}>
                <Ionicons name={o.icon} size={20} color={o.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionSub}>{o.sub}</Text>
              </View>
              {o.key === 'pan' ? (
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              ) : (
                <View style={styles.unavailableTag}>
                  <Text style={styles.unavailableTagText}>Unavailable</Text>
                </View>
              )}
            </Pressable>
          ))}

          <View style={styles.safe}>
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.safeTitle}>Your data is safe with us</Text>
              <Text style={styles.safeSub}>We only use it to build a trusted community</Text>
            </View>
          </View>

          <Pressable onPress={() => router.replace('/(tabs)/home')} testID="skip-later">
            <Text style={styles.skipLater}>Skip for now</Text>
          </Pressable>

          <PrimaryButton testID="verify-continue" title={loading ? "Saving..." : "Continue"} iconRight={loading ? undefined : "arrow-forward"} onPress={handleContinue} disabled={loading} />
        </View>

        <Mission1000Banner />
      </ScrollView>

      <VerificationUnavailableModal
        visible={unavailableDoc !== null}
        docType={unavailableDoc}
        onVerifyWithPan={() => {
          setUnavailableDoc(null);
          void continueWithDocument('pan');
        }}
        onSkip={() => setUnavailableDoc(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  skip: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface, marginBottom: spacing.lg },
  hero: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.base, color: colors.textSecondary, marginTop: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight + '80' },
  optionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  optionSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  unavailableTag: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  unavailableTagText: { fontSize: font.size.xs, color: colors.warning, fontWeight: font.weight.medium },
  safe: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  safeTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  safeSub: { fontSize: font.size.xs, color: colors.textSecondary },
  skipLater: { textAlign: 'center', color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium, marginVertical: spacing.md },
});
