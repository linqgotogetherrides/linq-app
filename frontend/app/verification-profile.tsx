import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import VerificationUnavailableModal from '@/src/components/VerificationUnavailableModal';
import {
  PAN_PAGE_ROUTE,
  actionForDocument,
  type UnavailableDocType,
} from '@/src/lib/verificationOptions';
import { supportsFirebaseIdentity } from '@/src/lib/auth';
import { useKycStatus } from '@/src/hooks/useKycStatus';
import { statusForDocument } from '@/src/lib/kycPolling';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

type Status = 'verified' | 'pending' | 'not_verified';

/**
 * Surfaces the server's own message when it sent one (see the shared helper:
 * `src/lib/apiError.ts`). Sessions themselves are never started here.
 */

export default function VerificationProfile() {
  const router = useRouter();
  const { user } = useApp();
  const [unavailableDoc, setUnavailableDoc] = useState<UnavailableDocType | null>(null);
  const [items, setItems] = useState<{ key: string; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; status: Status }[]>([
    { key: 'aadhaar', label: 'Aadhaar Card', sub: 'Government ID verification', icon: 'id-card', status: 'not_verified' },
    { key: 'pan', label: 'PAN Card', sub: 'Tax identity verification', icon: 'card', status: 'not_verified' },
    { key: 'dl', label: 'Driving Licence', sub: 'Required to offer rides', icon: 'car-sport', status: 'not_verified' },
  ]);

  /**
   * Authoritative status. The screen renders whatever the server says and has
   * no way to conclude anything on its own -- no URL match, no button press, no
   * WebView event.
   */
  // The web build has no real identity to present (see auth.web.ts), so the
  // server could not tell who is asking. Say so instead of appearing to work.
  const canVerify = supportsFirebaseIdentity();

  const kyc = useKycStatus();
  /** Stable across renders, so the mount effect can list it as a dependency. */
  const refreshKyc = kyc.refresh;

  // Learn the rider's current status when the page opens, so badges reflect
  // what the server holds rather than the last snapshot AppContext fetched.
  React.useEffect(() => {
    if (canVerify) {
      void refreshKyc();
    }
  }, [canVerify, refreshKyc]);

  // Reflect the rider's real saved state instead of hardcoded statuses.
  // kyc.status wins once the server has reported; the profile is only the
  // fallback for the moment before the first response arrives.
  React.useEffect(() => {
    setItems((prev) =>
      prev.map((i) => {
        if (kyc.status) {
          return { ...i, status: statusForDocument(kyc.documents, i.key, kyc.status) };
        }
        if (!user) return i;
        return i.key === user.verificationDocument && user.verification
          ? { ...i, status: user.verification as Status }
          : i;
      }),
    );
  }, [user, kyc.status, kyc.documents]);

  /**
   * Where each document option goes when tapped.
   *
   * PAN is the only document with a real flow: its tap opens the dedicated
   * page that runs the hosted Cashfree verification. Aadhaar and driving
   * licence open the truthful "currently unavailable" sheet -- they must
   * never start a KYC session of their own, because only allowed methods
   * should even imply that verification is possible.
   */
  const handleDocumentPress = (key: string) => {
    const action = actionForDocument(key);
    if (!action) return;
    if (action.type === 'open_pan_page') {
      router.push(PAN_PAGE_ROUTE as Href);
      return;
    }
    setUnavailableDoc(action.docType);
  };

  const statusMeta = (s: Status) =>
    s === 'verified' ? { label: 'Verified', color: colors.success, bg: colors.successLight }
      : s === 'pending' ? { label: 'Pending', color: colors.warning, bg: colors.warningLight }
        : { label: 'Not Verified', color: colors.textSecondary, bg: colors.surfaceSecondary };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="verification-profile-screen">
      <LinqHeader title="Verification" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
          <Text style={styles.bannerText}>Verified members get more requests and build community trust.</Text>
        </View>

        {!canVerify && (
          <View style={styles.notice} testID="verification-unavailable-notice">
            <Ionicons name="phone-portrait-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              ID verification needs the LinQ mobile app. This browser preview cannot send a
              verifiable identity, so verification is unavailable here.
            </Text>
          </View>
        )}

        {kyc.status === 'pending' && !kyc.exhausted && (
          <View style={styles.pendingRow} testID="kyc-pending-banner">
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={styles.pendingText}>
              Waiting for confirmation from Cashfree. This page updates on its own.
            </Text>
          </View>
        )}

        {kyc.exhausted && kyc.status !== 'verified' && (
          <View style={styles.notice} testID="kyc-retry-banner">
            <Ionicons name="refresh-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              We could not confirm your status just now. Nothing has changed.
            </Text>
            <Pressable
              onPress={() => kyc.start()}
              style={styles.retryBtn}
              testID="kyc-retry-status"
            >
              <Text style={styles.retryText}>Check again</Text>
            </Pressable>
          </View>
        )}

        {items.map((item) => {
          const meta = statusMeta(item.status);
          return (
            <View key={item.key} style={styles.card}>
              <View style={styles.iconBox}><Ionicons name={item.icon} size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.sub}>{item.sub}</Text>
              </View>
              {item.status === 'not_verified' ? (
                <Pressable
                  testID={`verify-${item.key}`}
                  style={styles.verifyBtn}
                  onPress={() => handleDocumentPress(item.key)}
                >
                  <Text style={styles.verifyText}>{canVerify ? 'Verify' : 'Unavailable'}</Text>
                </Pressable>
              ) : (
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  {item.status === 'verified' && <Ionicons name="checkmark-circle" size={12} color={meta.color} />}
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <VerificationUnavailableModal
        visible={unavailableDoc !== null}
        docType={unavailableDoc}
        onVerifyWithPan={() => {
          setUnavailableDoc(null);
          router.push(PAN_PAGE_ROUTE as Href);
        }}
        onSkip={() => setUnavailableDoc(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  bannerText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  verifyBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, alignItems: 'center', flexWrap: 'wrap' },
  noticeText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  pendingRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.lg },
  pendingText: { flex: 1, fontSize: font.size.sm, color: colors.textSecondary },
  retryBtn: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 6 },
  retryText: { color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.medium },
  verifyText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, height: 28, borderRadius: radius.pill },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.size.base, fontWeight: font.weight.medium, color: colors.textPrimary },
});
