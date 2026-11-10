import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const FAQS = [
  {
    q: 'How does route matching work?',
    a: 'LinQ matches you with ride co-travelers based on pickup proximity, drop proximity, and travel time to find the best commute partners on your route.',
  },
  {
    q: 'What is the ₹9 Connection Fee?',
    a: 'The ₹9 connection fee safely verifies co-travelers and unlocks direct phone calls and WhatsApp messaging. Active plan subscribers enjoy free unlimited connections.',
  },
  {
    q: 'How do unlocks work?',
    a: 'Free members get 2 requests and 2 chats to start, then 1 free request & chat per day. Upgrade to a plan or use wallet balance for more.',
  },
  {
    q: 'Is my data and travel safe?',
    a: 'Yes. We verify user identities, track trips in progress, support real-time SOS safety alerts with emergency contacts, and never share your phone number until you choose to connect.',
  },
];

export default function Support() {
  const { showToast } = useApp();
  const [open, setOpen] = useState<number | null>(0);

  const handleWhatsAppSupport = () => {
    const text = encodeURIComponent('Hello LinQ Support, I need help with my rides account.');
    Linking.openURL(`https://wa.me/919999999999?text=${text}`).catch(() => {
      showToast('Could not open WhatsApp. Please email support@linqrides.app');
    });
  };

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@linqrides.app?subject=LinQ%20Help%20Request').catch(() => {
      showToast('Contact us at support@linqrides.app');
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="support-screen">
      <LinqHeader title="Support & Help" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quickRow}>
          <QuickCard
            icon="logo-whatsapp"
            label="WhatsApp Help"
            color="#25D366"
            onPress={handleWhatsAppSupport}
          />
          <QuickCard
            icon="mail-outline"
            label="Email Support"
            color={colors.primary}
            onPress={handleEmailSupport}
          />
        </View>

        <Text style={styles.section}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQS.map((f, i) => (
            <Pressable
              key={i}
              testID={`faq-${i}`}
              style={[styles.faq, i < FAQS.length - 1 && styles.faqBorder]}
              onPress={() => setOpen(open === i ? null : i)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQ}>{f.q}</Text>
                <Ionicons
                  name={open === i ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              {open === i && <Text style={styles.faqA}>{f.a}</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Help & Policies</Text>
        <View style={styles.card}>
          <LinkRow
            icon="book-outline"
            label="Commuter Safety Guidelines"
            onPress={() => showToast('Always verify vehicle number before boarding.')}
          />
          <LinkRow
            icon="document-text-outline"
            label="Terms & Conditions"
            onPress={() =>
              Linking.openURL('https://linqrides.app/terms').catch(() =>
                showToast('Terms available at linqrides.app/terms'),
              )
            }
          />
          <LinkRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() =>
              Linking.openURL('https://linqrides.app/privacy').catch(() =>
                showToast('Privacy policy at linqrides.app/privacy'),
              )
            }
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickCard({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View
        style={[
          styles.quickIcon,
          color ? { backgroundColor: `${color}18` } : null,
        ]}
      >
        <Ionicons name={icon} size={24} color={color || colors.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    textAlign: 'center',
  },
  section: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    fontWeight: font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  faq: { padding: spacing.lg },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQ: {
    flex: 1,
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginRight: spacing.md,
  },
  faqA: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
});
