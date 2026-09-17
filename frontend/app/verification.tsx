import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import LinqLogo from '@/src/components/LinqLogo';
import PrimaryButton from '@/src/components/PrimaryButton';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const options: { key: string; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: 'aadhaar', label: 'Aadhaar Card', sub: 'Verify using your Aadhaar', icon: 'id-card', color: colors.primary, bg: colors.primaryLight },
  { key: 'pan', label: 'PAN Card', sub: 'Verify using your PAN card', icon: 'card', color: colors.warning, bg: colors.warningLight },
  { key: 'dl', label: 'Driving Licence', sub: 'Verify using your Driving Licence', icon: 'car-sport', color: colors.info, bg: colors.infoLight },
];

export default function Verification() {
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { fetchUserProfile, showToast } = useApp();
  const [selected, setSelected] = useState<string | null>('aadhaar');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!uid) {
      router.replace('/(tabs)');
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await supabase.from('user_profiles').update({
        verification_status: 'pending'
      }).eq('id', uid);
      
      if (error) throw error;
      
      await fetchUserProfile(uid);
      showToast('Welcome to LinQ!');
      router.replace('/(tabs)');
    } catch (e: any) {
      showToast(e.message || 'Error saving verification status');
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="verification-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <View style={styles.top}>
          <LinqLogo size={40} showText={false} />
          <Pressable onPress={() => router.replace('/(tabs)')} testID="skip-verify">
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
              onPress={() => setSelected(o.key)}
              style={[styles.option, selected === o.key && styles.optionActive]}
            >
              <View style={[styles.optionIcon, { backgroundColor: o.bg }]}>
                <Ionicons name={o.icon} size={20} color={o.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionSub}>{o.sub}</Text>
              </View>
              <View style={[styles.radio, selected === o.key && styles.radioActive]}>
                {selected === o.key && <View style={styles.radioInner} />}
              </View>
            </Pressable>
          ))}

          <View style={styles.safe}>
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.safeTitle}>Your data is safe with us</Text>
              <Text style={styles.safeSub}>We only use it to build a trusted community</Text>
            </View>
          </View>

          <Pressable onPress={() => router.replace('/(tabs)')} testID="skip-later">
            <Text style={styles.skipLater}>Skip for now</Text>
          </Pressable>

          <PrimaryButton testID="verify-continue" title={loading ? "Saving..." : "Continue"} iconRight={loading ? undefined : "arrow-forward"} onPress={handleContinue} disabled={loading} />
        </View>

        <Mission1000Banner />
      </ScrollView>
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
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  safe: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  safeTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  safeSub: { fontSize: font.size.xs, color: colors.textSecondary },
  skipLater: { textAlign: 'center', color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium, marginVertical: spacing.md },
});
