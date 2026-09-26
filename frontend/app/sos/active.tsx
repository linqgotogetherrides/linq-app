import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import EmptyState from '@/src/components/EmptyState';
import { useApp } from '@/src/context/AppContext';
import { useSos } from '@/src/context/SosContext';
import { sosApi } from '@/src/services/sos/sosApi';
import type { SosEvidence } from '@/src/services/sos/types';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type EndChoice = 'RESOLVED' | 'CANCELLED';

function formatTime(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(from?: string | null, to?: string | null): string {
  if (!from) return '—';
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (Number.isNaN(start)) return '—';
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

export default function SosActive() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const {
    incident,
    isActive,
    isBusy,
    error,
    contacts,
    dispatchStatus,
    capabilities,
    tracking,
    lastCycle,
    end,
    refresh,
  } = useSos();

  const [confirmEnd, setConfirmEnd] = useState<EndChoice | null>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<SosEvidence[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const loadEvidence = React.useCallback(async () => {
    if (!user?.id || !incident) return;
    setLoadingEvidence(true);
    try {
      const result = await sosApi.listEvidence(user.id, incident.id);
      setEvidence(result.evidence);
    } catch {
      setEvidence([]);
    } finally {
      setLoadingEvidence(false);
    }
  }, [incident, user?.id]);

  useEffect(() => {
    if (incident?.status === 'ACTIVE') void loadEvidence();
  }, [incident?.id, incident?.status, loadEvidence]);

  const photos = useMemo(
    () => evidence.filter((item) => item.kind === 'photo'),
    [evidence],
  );
  const audio = useMemo(
    () => evidence.filter((item) => item.kind === 'audio'),
    [evidence],
  );
  const uploaded = useMemo(
    () => evidence.filter((item) => item.status === 'UPLOADED'),
    [evidence],
  );

  const mapsUrl = useMemo(() => {
    if (!incident?.last_latitude || !incident.last_longitude) return null;
    return `https://www.google.com/maps/search/?api=1&query=${incident.last_latitude},${incident.last_longitude}`;
  }, [incident?.last_latitude, incident?.last_longitude]);

  if (!incident) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="sos-active-screen">
        <LinqHeader title="SOS" />
        <EmptyState
          icon="shield-checkmark-outline"
          title="No active SOS"
          subtitle="Your SOS incident has ended. Hold the SOS button if you need help."
        />
      </SafeAreaView>
    );
  }

  const handleEnd = async () => {
    if (!confirmEnd) return;
    const ok = await end({ status: confirmEnd, reason: reason.trim() || undefined });
    if (ok) {
      setConfirmEnd(null);
      setReason('');
      showToast(
        confirmEnd === 'RESOLVED'
          ? 'SOS ended. Location sharing has stopped.'
          : 'SOS cancelled. Location sharing has stopped.',
      );
      router.replace('/(tabs)/home');
    }
  };

  const statusLabel =
    incident.status === 'ACTIVE'
      ? 'SOS ACTIVE'
      : incident.status === 'RESOLVED'
        ? 'SOS RESOLVED'
        : 'SOS CANCELLED';

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="sos-active-screen">
      <LinqHeader title="SOS" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.statusHero,
            incident.status !== 'ACTIVE' && styles.statusHeroEnded,
          ]}
          testID="sos-status-hero"
        >
          <View style={styles.statusHeroIcon}>
            <Ionicons
              name={incident.status === 'ACTIVE' ? 'warning' : 'checkmark-circle'}
              size={26}
              color={colors.textInverse}
            />
          </View>
          <Text style={styles.statusHeroLabel}>{statusLabel}</Text>
          {incident.status === 'ACTIVE' ? (
            <Text style={styles.statusHeroBody}>
              Your location is being shared with your emergency contacts and LINQ Safety
              Team.
            </Text>
          ) : (
            <Text style={styles.statusHeroBody}>
              Location sharing and evidence collection have stopped.
            </Text>
          )}
          <Text style={styles.reference} testID="sos-reference-code">
            Incident {incident.reference_code}
          </Text>
        </View>

        {isActive ? (
          <View style={styles.pulseRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.pulseText}>
              Live · last update {formatTime(tracking.lastPushAt ?? incident.last_location_at)}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Row
            icon="time-outline"
            label="Activated"
            value={`${formatTime(incident.activated_at)} · ${formatElapsed(incident.activated_at, incident.ended_at)}`}
            testID="sos-activated-row"
          />
          <Row
            icon="navigate-outline"
            label="Last location update"
            value={formatTime(tracking.lastPushAt ?? incident.last_location_at)}
            testID="sos-last-location-row"
          />
          <Row
            icon="people-outline"
            label="Emergency contacts notified"
            value={`${incident.contacts_notified} of ${incident.contacts_total} alerted`}
            testID="sos-contacts-row"
            last={!incident.current_ride_id}
          />
          {incident.current_ride_id ? (
            <Row
              icon="car-outline"
              label="Current ride"
              value="Linked to this incident"
              testID="sos-ride-row"
              last
            />
          ) : null}
        </View>

        {mapsUrl ? (
          <Pressable
            style={styles.mapRow}
            onPress={() => void Linking.openURL(mapsUrl)}
            testID="sos-open-maps"
          >
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <Text style={styles.mapText}>Open live location in Google Maps</Text>
            <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <View style={styles.mapRow}>
            <Ionicons name="map-outline" size={18} color={colors.textTertiary} />
            <Text style={styles.mapTextMuted}>Waiting for a location fix…</Text>
          </View>
        )}

        {/* ---- Tracking truth ------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Location sharing</Text>
          <StatusLine
            ok={tracking.backgroundActive}
            testID="sos-background-location"
            label="Background tracking"
            okText="Running while the app is closed"
            badText="Unavailable — updates only while LinQ is open"
          />
          <StatusLine
            ok={Boolean(tracking.isTracking)}
            testID="sos-foreground-location"
            label="In-app tracking"
            okText={`Active · ${incident.location_ping_count} fixes sent`}
            badText="Not running"
            last
          />
          {tracking.lastError ? (
            <Text style={styles.warningNote} testID="sos-tracking-error">
              {tracking.lastError}
            </Text>
          ) : null}
        </View>

        {/* ---- Evidence -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Evidence</Text>

          {capabilities ? (
            <View style={styles.capabilityBox} testID="sos-capabilities">
              <CapabilityRow
                label="Photos (app open)"
                ok={capabilities.camera}
                note={capabilities.camera ? 'Available' : 'Permission not granted'}
              />
              <CapabilityRow
                label="Audio (app open)"
                ok={capabilities.microphone}
                note={capabilities.microphone ? 'Available' : 'Permission not granted'}
              />
              <CapabilityRow
                label="Photos in background"
                ok={capabilities.background_camera}
                note="Not possible on this OS"
              />
              <CapabilityRow
                label="Audio in background"
                ok={capabilities.background_microphone}
                note="Not possible on this OS"
                last
              />
            </View>
          ) : null}

          {loadingEvidence ? (
            <View style={styles.evidenceLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.evidenceCounts} testID="sos-evidence-counts">
              <CountBox label="Photos" value={photos.length} />
              <CountBox label="Audio" value={audio.length} />
              <CountBox label="Uploaded" value={uploaded.length} />
            </View>
          )}

          {lastCycle ? (
            <View style={styles.cycleNote} testID="sos-last-cycle">
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.cycleText}>
                Last cycle: {lastCycle.photosUploaded} photo(s), {lastCycle.audioUploaded}{' '}
                audio clip(s)
                {lastCycle.photosSkipped || lastCycle.audioSkipped
                  ? ` · ${lastCycle.photosSkipped + lastCycle.audioSkipped} unavailable`
                  : ''}
              </Text>
            </View>
          ) : null}

          {evidence.some((item) => item.status === 'SKIPPED_UNAVAILABLE') ? (
            <View style={styles.skipNotice} testID="sos-evidence-skipped-notice">
              <Ionicons name="information-circle" size={16} color={colors.warning} />
              <Text style={styles.skipText}>
                Some evidence could not be captured because the app was in the background.
                iOS and Android do not allow camera or microphone access while an app is
                backgrounded. Open LinQ to capture evidence now.
              </Text>
            </View>
          ) : null}

          {isActive ? (
            <PrimaryButton
              title="Capture evidence now"
              icon="camera"
              variant="secondary"
              onPress={() => router.push('/sos/evidence')}
              testID="sos-open-evidence"
            />
          ) : null}
        </View>

        {/* ---- Contacts -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Emergency contacts</Text>
          {contacts.length === 0 ? (
            <Text style={styles.emptyNote}>
              No emergency contacts saved. Add one so someone is alerted next time.
            </Text>
          ) : (
            contacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <Ionicons
                  name={contact.is_primary ? 'star' : 'person-outline'}
                  size={15}
                  color={contact.is_primary ? colors.primary : colors.textTertiary}
                />
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactDetail}>
                  {contact.phone ?? contact.email ?? '—'}
                </Text>
              </View>
            ))
          )}
          {dispatchStatus && !dispatchStatus.configured ? (
            <View style={styles.skipNotice} testID="sos-active-dispatch-note">
              <Ionicons name="warning" size={16} color={colors.warning} />
              <Text style={styles.skipText}>
                No alert delivery provider is configured, so contact alerts are recorded
                for the LinQ Safety Team rather than sent by SMS or email.
              </Text>
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isActive ? (
          <PrimaryButton
            title={isBusy ? 'Ending SOS…' : 'END SOS'}
            icon="stop-circle"
            variant="danger"
            onPress={() => setConfirmEnd('RESOLVED')}
            loading={isBusy}
            testID="sos-end-button"
          />
        ) : null}
      </ScrollView>

      {/* ---- End confirmation ------------------------------------------- */}
      <Modal
        visible={confirmEnd !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmEnd(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="sos-end-modal">
            <Text style={styles.modalTitle}>
              {confirmEnd === 'CANCELLED' ? 'Cancel this SOS?' : 'End this SOS?'}
            </Text>
            <Text style={styles.modalBody}>
              Ending SOS stops location sharing and stops all evidence collection. Your
              emergency contacts will be told the emergency is over.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.textTertiary}
              value={reason}
              onChangeText={setReason}
              testID="sos-end-reason-input"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondary}
                onPress={() => setConfirmEnd(null)}
                testID="sos-end-keep"
              >
                <Text style={styles.modalSecondaryText}>Keep SOS active</Text>
              </Pressable>
              <Pressable
                style={styles.modalDanger}
                onPress={() => void handleEnd()}
                disabled={isBusy}
                testID="sos-end-confirm"
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.modalDangerText}>
                    {confirmEnd === 'CANCELLED' ? 'Cancel SOS' : 'End SOS'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  last,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatusLine({
  ok,
  label,
  okText,
  badText,
  last,
  testID,
}: {
  ok: boolean;
  label: string;
  okText: string;
  badText: string;
  last?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.statusLine, !last && styles.rowBorder]} testID={testID}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={ok ? colors.success : colors.warning}
      />
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, !ok && styles.rowValueWarn]}>{ok ? okText : badText}</Text>
      </View>
    </View>
  );
}

function CapabilityRow({
  label,
  ok,
  note,
  last,
}: {
  label: string;
  ok: boolean;
  note: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.capabilityRow, !last && styles.rowBorder]}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={ok ? colors.success : colors.textTertiary}
      />
      <Text style={styles.capabilityLabel}>{label}</Text>
      <Text style={styles.capabilityNote}>{note}</Text>
    </View>
  );
}

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.countBox}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  statusHero: {
    backgroundColor: colors.error,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  statusHeroEnded: { backgroundColor: colors.textSecondary },
  statusHeroIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  statusHeroLabel: {
    fontSize: font.size['2xl'],
    color: colors.textInverse,
    fontWeight: font.weight.bold,
    letterSpacing: 0.8,
  },
  statusHeroBody: {
    marginTop: spacing.sm,
    fontSize: font.size.sm,
    color: colors.textInverse,
    textAlign: 'center',
    lineHeight: 20,
  },
  reference: {
    marginTop: spacing.md,
    fontSize: font.size.xs,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pulseText: { fontSize: font.size.xs, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: font.size.lg,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1 },
  rowLabel: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  rowValue: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  rowValueWarn: { color: colors.warning },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  mapText: { flex: 1, fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  mapTextMuted: { flex: 1, fontSize: font.size.sm, color: colors.textTertiary },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  warningNote: {
    marginTop: spacing.sm,
    fontSize: font.size.xs,
    color: colors.warning,
    lineHeight: 17,
  },
  capabilityBox: { marginBottom: spacing.md },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  capabilityLabel: { flex: 1, fontSize: font.size.xs, color: colors.textPrimary },
  capabilityNote: { fontSize: font.size.xs, color: colors.textTertiary },
  evidenceCounts: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  countBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  countValue: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  countLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  evidenceLoader: { paddingVertical: spacing.lg, alignItems: 'center', marginBottom: spacing.md },
  cycleNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cycleText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  skipNotice: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  skipText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contactName: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  contactDetail: { flex: 1, textAlign: 'right', fontSize: font.size.xs, color: colors.textSecondary },
  emptyNote: { fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 20 },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: font.size.sm, color: colors.error },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: font.size.xl,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.sm,
  },
  modalBody: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  modalInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: font.size.sm,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  modalDanger: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerText: { fontSize: font.size.sm, color: colors.textInverse, fontWeight: font.weight.medium },
});
