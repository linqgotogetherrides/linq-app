import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const FAQS = [
  { q: 'How does route matching work?', a: 'LinQ matches you with ride twins based on pickup proximity, drop proximity, and travel time to find the best commute partners on your route.' },
  { q: 'What is a Ride Twin?', a: 'A Ride Twin is someone travelling the same route as you at a similar time — the perfect person to pool with and split costs.' },
  { q: 'How do unlocks work?', a: 'Free members get 2 requests and 2 chats to start, then 1 free request & chat per day. Upgrade or use single unlocks for more.' },
  { q: 'Is my data safe?', a: 'Yes. We only use your verification data to build a trusted community and never share your contact until you unlock a connection.' },
];

export default function Support() {
  const { showToast } = useApp();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="support-screen">
      <LinqHeader title="Support & Help" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.quickRow}>
          <QuickCard icon="chatbubbles-outline" label="Contact Support" onPress={() => showToast('Opening support chat…')} />
          <QuickCard icon="flag-outline" label="Report a Problem" onPress={() => showToast('Report submitted')} />
        </View>

        <Text style={styles.section}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQS.map((f, i) => (
            <Pressable key={i} testID={`faq-${i}`} style={[styles.faq, i < FAQS.length - 1 && styles.faqBorder]} onPress={() => setOpen(open === i ? null : i)}>
              <View style={styles.faqHeader}>
                <Text style={styles.faqQ}>{f.q}</Text>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </View>
              {open === i && <Text style={styles.faqA}>{f.a}</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Help Center</Text>
        <View style={styles.card}>
          <LinkRow icon="book-outline" label="User Guide" onPress={() => showToast('Opening user guide')} />
          <LinkRow icon="document-text-outline" label="Terms & Conditions" onPress={() => showToast('Opening terms')} />
          <LinkRow icon="shield-outline" label="Privacy Policy" onPress={() => showToast('Opening privacy policy')} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickCard({ icon, label, onPress }: any) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={styles.quickIcon}><Ionicons name={icon} size={24} color={colors.primary} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function LinkRow({ icon, label, onPress, last }: any) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <View style={styles.iconBox}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  quickCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium, textAlign: 'center' },
  section: { fontSize: font.size.sm, color: colors.textTertiary, fontWeight: font.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  faq: { padding: spacing.lg },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQ: { flex: 1, fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginRight: spacing.md },
  faqA: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
});
