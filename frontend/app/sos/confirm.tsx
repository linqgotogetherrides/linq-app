import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { useSos } from '@/src/context/SosContext';
import { colors, font, radius, spacing } from '@/src/theme/tokens';
import EmergencyContactManager from '@/src/components/sos/EmergencyContactManager';

export default function SosConfirm() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const { activate, isBusy, error, contacts, dispatchStatus } = useSos();
  const [showContacts, setShowContacts] = useState(false);

  const handleActivate = async () => {
    const ok = await activate();
    if (ok) {
      showToast('SOS activated. Sharing your live location.');
      router.replace('/sos/active');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="sos-confirm-screen">
      <LinqHeader title="Emergency SOS" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.alertBox}>
          <View style={styles.alertIcon}>
            <Ionicons name="warning" size={34} color={colors.error} />
          </View>
          <Text style={styles.alertTitle}>Are you in an emergency?</Text>
          <Text style={styles.alertBody}>
            Your live location will be shared with your emergency contacts and LINQ
            Safety Team.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>When you activate SOS, LinQ will</Text>
          <Bullet
            icon="navigate"
            text="Capture and continuously share your live location while SOS is active."
          />
          <Bullet
            icon="people"
            text={`Alert your emergency contacts${
              contacts.length ? ` (${contacts.length})` : ''
            }.`}
          />
          <Bullet
            icon="alert-circle"
            text="Create a critical alert in the LinQ Safety operations dashboard."
          />
          <Bullet
            icon="camera"
            text="Collect photos and a short audio clip as evidence, only while SOS is active."
          />
        </View>

        <Pressable
          style={styles.privacyRow}
          testID="sos-privacy-details"
          onPress={() => setShowContacts((value) => !value)}
        >
          <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
          <Text style={styles.privacyText}>
            What LinQ collects, and who can see it
          </Text>
          <Ionicons
            name={showContacts ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>

        {showContacts ? (
          <View style={styles.privacyCard} testID="sos-privacy-panel">
            <Text style={styles.privacyHeading}>Privacy notice</Text>
            <Text style={styles.privacyBody}>
              While SOS is active, LinQ records your location history, evidence photos,
              and a short audio segment. This data is shared with your emergency
              contacts and the LinQ Safety Team.
            </Text>
            <Text style={styles.privacyBody}>
              Collection stops the moment you end the SOS. Nothing is collected before
              you activate, and nothing is collected after you end it.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.privacyHeading}>Emergency contacts ({contacts.length})</Text>
            {contacts.length === 0 ? (
              <>
                <Text style={styles.privacyBody}>
                  You have no emergency contacts saved. LinQ will still raise the
                  dashboard alert, but nobody will be notified on your behalf.
                </Text>
                <EmergencyContactManager compact />
              </>
            ) : (
              <>
                {contacts.map((contact) => (
                  <View key={contact.id} style={styles.contactRow}>
                    <Ionicons
                      name={contact.is_primary ? 'star' : 'person-outline'}
                      size={16}
                      color={contact.is_primary ? colors.primary : colors.textTertiary}
                    />
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>
                      {contact.phone ?? contact.email ?? 'No contact detail'}
                    </Text>
                    {contact.verified ? (
                      <View style={styles.verifiedPill}>
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                <EmergencyContactManager compact />
              </>
            )}

            {dispatchStatus && !dispatchStatus.configured ? (
              <View style={styles.dispatchNote} testID="sos-dispatch-note">
                <Ionicons name="information-circle" size={16} color={colors.warning} />
                <Text style={styles.dispatchText}>
                  {dispatchStatus.reason ??
                    'No alert delivery provider is configured yet.'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox} testID="sos-confirm-error">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <PrimaryButton
          title={isBusy ? 'Activating…' : 'ACTIVATE SOS'}
          onPress={handleActivate}
          loading={isBusy}
          disabled={isBusy || !user}
          icon="warning"
          testID="sos-activate-button"
        />
        {!user ? (
          <Text style={styles.signInHint}>Sign in to activate SOS.</Text>
        ) : null}

        <Pressable
          style={styles.cancelButton}
          testID="sos-cancel-button"
          onPress={() => router.back()}
          disabled={isBusy}
        >
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>

        <Pressable
          style={styles.callRow}
          onPress={() => void Linking.openURL('tel:112')}
          testID="sos-call-112"
        >
          <Ionicons name="call" size={18} color={colors.error} />
          <Text style={styles.callText}>Call emergency services (112)</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.lg },
  alertBox: { alignItems: 'center', paddingVertical: spacing.lg },
  alertIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  alertTitle: {
    fontSize: font.size['2xl'],
    color: colors.textPrimary,
    fontWeight: font.weight.bold,
    textAlign: 'center',
  },
  alertBody: {
    marginTop: spacing.sm,
    fontSize: font.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: font.size.lg,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
  },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bulletIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  privacyText: { flex: 1, fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  privacyCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  privacyHeading: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginTop: spacing.xs,
  },
  privacyBody: { fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contactName: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  contactPhone: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  verifiedPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium },
  dispatchNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  dispatchText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: font.size.sm, color: colors.error },
  signInHint: {
    textAlign: 'center',
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  cancelButton: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
    letterSpacing: 0.6,
  },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  callText: { fontSize: font.size.sm, color: colors.error, fontWeight: font.weight.medium },
});
