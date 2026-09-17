import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const REFERRAL_CODE = 'ANJANA250';

export default function Referral() {
  const { showToast } = useApp();

  const shareOptions: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
    { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
    { key: 'telegram', label: 'Telegram', icon: 'paper-plane', color: '#0088cc' },
    { key: 'more', label: 'More', icon: 'share-social', color: colors.primary },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="referral-screen">
      <LinqHeader title="Refer a Friend" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="gift" size={56} color={colors.primary} /></View>
          <Text style={styles.heroTitle}>Invite friends & earn ₹5</Text>
          <Text style={styles.heroSub}>Get ₹5 for every friend who joins LinQ with your code. They save on their first ride too!</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{REFERRAL_CODE}</Text>
            <Pressable style={styles.copyBtn} testID="copy-code" onPress={() => showToast('Code copied to clipboard')}>
              <Ionicons name="copy-outline" size={16} color={colors.primary} />
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.shareTitle}>Share via</Text>
        <View style={styles.shareRow}>
          {shareOptions.map((s) => (
            <Pressable key={s.key} style={styles.shareOption} testID={`share-${s.key}`} onPress={() => showToast(`Sharing via ${s.label}`)}>
              <View style={[styles.shareIcon, { backgroundColor: s.color + '15' }]}><Ionicons name={s.icon} size={24} color={s.color} /></View>
              <Text style={styles.shareLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How it works</Text>
          <Step num={1} text="Share your referral code with friends" />
          <Step num={2} text="They sign up and complete their first ride" />
          <Step num={3} text="You both earn rewards instantly" last />
        </View>

        <PrimaryButton title="Share invite link" icon="share-social" onPress={() => showToast('Invite link shared')} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ num, text, last }: { num: number; text: string; last?: boolean }) {
  return (
    <View style={[styles.step, !last && styles.stepBorder]}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{num}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  heroIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  heroTitle: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.medium },
  heroSub: { fontSize: font.size.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  codeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  codeLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  code: { fontSize: font.size['2xl'], color: colors.primary, fontWeight: font.weight.medium, letterSpacing: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill },
  copyText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  shareTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.xl, marginBottom: spacing.md },
  shareRow: { flexDirection: 'row', gap: spacing.md },
  shareOption: { flex: 1, alignItems: 'center', gap: 6 },
  shareIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  shareLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  stepsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xl },
  stepsTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginBottom: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  stepText: { flex: 1, fontSize: font.size.base, color: colors.textPrimary },
});
