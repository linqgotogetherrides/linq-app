import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import EmptyState from '@/src/components/EmptyState';
import { useApp } from '@/src/context/AppContext';
import { useAdminAccess } from '@/src/context/SosAdminContext';
import { sosApi, SosApiError } from '@/src/services/sos/sosApi';
import type { SosAdminDetail, SosEvidence } from '@/src/services/sos/types';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type Tab = 'overview' | 'locations' | 'photos' | 'audio' | 'alerts';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'information-circle-outline' },
  { key: 'locations', label: 'Location', icon: 'navigate-outline' },
  { key: 'photos', label: 'Photos', icon: 'images-outline' },
  { key: 'audio', label: 'Audio', icon: 'mic-outline' },
  { key: 'alerts', label: 'Alerts', icon: 'paper-plane-outline' },
];

export default function SosAdminIncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, showToast } = useApp();
  const { isOperator, checking } = useAdminAccess();

  const [detail, setDetail] = useState<SosAdminDetail | null>(null);
  const [signedEvidence, setSignedEvidence] = useState<SosEvidence[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !isOperator || !id) return;
    try {
      setError(null);
      const result = await sosApi.adminIncidentDetail(user.id, id);
      setDetail(result);
    } catch (err) {
      setError(
        err instanceof SosApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load this incident.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, isOperator, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Signed download URLs are minted on demand and expire after 10 minutes.
  useEffect(() => {
    if (!user?.id || !isOperator || !id || (tab !== 'photos' && tab !== 'audio')) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await sosApi.signEvidenceDownloads(user.id, id);
        if (!cancelled) setSignedEvidence(result.evidence);
      } catch {
        if (!cancelled) setSignedEvidence([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isOperator, tab, user?.id]);

  const acknowledge = async () => {
    if (!user?.id || !id) return;
    try {
      await sosApi.adminAcknowledge(user.id, id);
      showToast('Incident acknowledged.');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not acknowledge.');
    }
  };

  if (checking || loading) {
    return (
      <SafeAreaView style={styles.container} testID="admin-sos-detail">
        <LinqHeader title="SOS Incident" />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isOperator) {
    return (
      <SafeAreaView style={styles.container} testID="admin-sos-detail">
        <LinqHeader title="SOS Incident" />
        <EmptyState
          icon="lock-closed-outline"
          title="Restricted area"
          subtitle="Only LinQ safety operators can view incident detail."
        />
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.container} testID="admin-sos-detail">
        <LinqHeader title="SOS Incident" />
        <EmptyState
          icon="alert-circle-outline"
          title="Unable to load"
          subtitle={error ?? 'This incident could not be loaded.'}
        />
      </SafeAreaView>
    );
  }

  const { incident } = detail;
  const isActive = incident.status === 'ACTIVE';
  const photos = signedEvidence.filter((item) => item.kind === 'photo');
  const audio = signedEvidence.filter((item) => item.kind === 'audio');
  const allPhotos = detail.evidence.filter((item) => item.kind === 'photo');
  const allAudio = detail.evidence.filter((item) => item.kind === 'audio');

  return (
    <SafeAreaView style={styles.container} testID="admin-sos-detail">
      <LinqHeader title={incident.reference_code} />

      <View style={[styles.statusBar, isActive ? styles.statusBarActive : styles.statusBarClosed]}>
        <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
          {incident.status}
        </Text>
        <Text style={styles.statusMeta}>
          {incident.user?.name} · {new Date(incident.activated_at).toLocaleString()}
        </Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.tab, active && styles.tabActive]}
              testID={`admin-detail-tab-${item.key}`}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={active ? colors.primary : colors.textTertiary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'overview' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rider</Text>
              <Field label="Name" value={incident.user?.name ?? '—'} />
              <Field label="Phone" value={incident.user?.phone_number ?? '—'} />
              <Field label="Email" value={incident.user?.email ?? '—'} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current ride</Text>
              {incident.ride ? (
                <>
                  <Field label="Pickup" value={incident.ride.pickup_address} />
                  <Field label="Drop" value={incident.ride.dropoff_address} />
                  <Field label="Departure" value={incident.ride.travel_time ?? '—'} />
                  <Field label="Ride status" value={incident.ride.status} />
                </>
              ) : (
                <Text style={styles.emptyText}>No current ride linked to this incident.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current location</Text>
              <Field
                label="Latitude"
                value={incident.last_latitude != null ? String(incident.last_latitude) : '—'}
              />
              <Field
                label="Longitude"
                value={incident.last_longitude != null ? String(incident.last_longitude) : '—'}
              />
              <Field
                label="Accuracy"
                value={incident.last_accuracy != null ? `${Math.round(incident.last_accuracy)} m` : '—'}
              />
              <Field label="Last update" value={formatDateTime(incident.last_location_at)} />
              <Field label="Fixes received" value={String(incident.location_ping_count)} />
              {incident.maps_url ? (
                <Pressable
                  style={styles.mapButton}
                  onPress={() => void Linking.openURL(incident.maps_url as string)}
                  testID="admin-open-maps"
                >
                  <Ionicons name="map" size={16} color={colors.textInverse} />
                  <Text style={styles.mapButtonText}>Open in Google Maps</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Emergency contacts ({detail.contacts.length})</Text>
              {detail.contacts.length === 0 ? (
                <Text style={styles.emptyText}>No emergency contacts on file.</Text>
              ) : (
                detail.contacts.map((contact) => (
                  <View key={contact.id} style={styles.contactRow}>
                    <Ionicons
                      name={contact.is_primary ? 'star' : 'person-outline'}
                      size={14}
                      color={contact.is_primary ? colors.primary : colors.textTertiary}
                    />
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactDetail}>
                      {contact.phone ?? contact.email ?? '—'}
                    </Text>
                    {contact.verified ? (
                      <View style={styles.verifiedPill}>
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Device evidence capabilities</Text>
              <Field
                label="Background location"
                value={String(incident.evidence_capabilities?.background_location ?? 'unknown')}
              />
              <Field
                label="Camera (app open)"
                value={String(incident.evidence_capabilities?.camera ?? 'unknown')}
              />
              <Field
                label="Background camera"
                value={String(incident.evidence_capabilities?.background_camera ?? false)}
              />
              <Field
                label="Background microphone"
                value={String(incident.evidence_capabilities?.background_microphone ?? false)}
              />
            </View>

            {isActive ? (
              <PrimaryButton
                title={incident.acknowledged_at ? 'Acknowledged' : 'Acknowledge incident'}
                icon="checkmark-done"
                onPress={() => void acknowledge()}
                disabled={Boolean(incident.acknowledged_at)}
                testID="admin-acknowledge"
              />
            ) : null}
          </>
        ) : null}

        {tab === 'locations' ? (
          <View style={styles.card} testID="admin-location-history">
            <Text style={styles.cardTitle}>Location history ({detail.locations.length})</Text>
            {detail.locations.length === 0 ? (
              <Text style={styles.emptyText}>No location fixes recorded.</Text>
            ) : (
              [...detail.locations].reverse().map((ping) => (
                <View key={ping.id} style={styles.pingRow}>
                  <View style={styles.pingIndex}>
                    <Text style={styles.pingIndexText}>{ping.sequence}</Text>
                  </View>
                  <View style={styles.pingCopy}>
                    <Text style={styles.pingCoords}>
                      {ping.latitude.toFixed(5)}, {ping.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.pingMeta}>
                      {formatDateTime(ping.recorded_at)} · {ping.source}
                      {ping.accuracy != null ? ` · ±${Math.round(ping.accuracy)}m` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${ping.latitude},${ping.longitude}`,
                      )
                    }
                  >
                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'photos' ? (
          <View testID="admin-photos">
            {allPhotos.length === 0 ? (
              <EmptyState
                icon="images-outline"
                title="No photos"
                subtitle="No photo evidence was captured for this incident."
              />
            ) : (
              <View style={styles.photoGrid}>
                {allPhotos.map((item) => {
                  const signed = photos.find((entry) => entry.id === item.id);
                  return (
                    <View key={item.id} style={styles.photoCell}>
                      {signed?.signed_url ? (
                        <Image
                          source={{ uri: signed.signed_url }}
                          style={styles.photo}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.photo, styles.photoPlaceholder]}>
                          <Ionicons name="image-outline" size={22} color={colors.textTertiary} />
                        </View>
                      )}
                      <Text style={styles.photoMeta}>
                        #{item.sequence} · {formatDateTime(item.captured_at)}
                      </Text>
                      <Text style={styles.photoStatus} testID={`admin-photo-status-${item.id}`}>
                        {item.status} · {item.capture_mode}
                      </Text>
                      {item.error ? (
                        <Text style={styles.photoError} numberOfLines={3}>
                          {item.error}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {tab === 'audio' ? (
          <View testID="admin-audio">
            {allAudio.length === 0 ? (
              <EmptyState
                icon="mic-outline"
                title="No audio"
                subtitle="No audio evidence was captured for this incident."
              />
            ) : (
              allAudio.map((item) => {
                const signed = audio.find((entry) => entry.id === item.id);
                const isPlaying = playing === item.id;
                return (
                  <View key={item.id} style={styles.audioRow}>
                    <View style={styles.audioIcon}>
                      <Ionicons
                        name={isPlaying ? 'stop-circle' : 'play-circle'}
                        size={26}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.audioCopy}>
                      <Text style={styles.audioTitle}>Clip #{item.sequence}</Text>
                      <Text style={styles.audioMeta}>
                        {formatDateTime(item.captured_at)} · {item.status} · {item.capture_mode}
                      </Text>
                      {item.error ? <Text style={styles.photoError}>{item.error}</Text> : null}
                    </View>
                    <Pressable
                      testID={`admin-audio-play-${item.id}`}
                      onPress={() => setPlaying(isPlaying ? null : item.id)}
                      disabled={!signed?.signed_url}
                    >
                      <Ionicons
                        name={isPlaying ? 'stop' : 'play'}
                        size={22}
                        color={signed?.signed_url ? colors.primary : colors.textTertiary}
                      />
                    </Pressable>
                  </View>
                );
              })
            )}
            {playing ? (
              <Text style={styles.audioHint}>
                Signed links expire after 10 minutes. Playback is handled by the device
                media player.
              </Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'alerts' ? (
          <View style={styles.card} testID="admin-alerts">
            <Text style={styles.cardTitle}>Contact alerts ({detail.alerts.length})</Text>
            {!detail.dispatch_status.configured ? (
              <View style={styles.warnBox}>
                <Ionicons name="warning" size={16} color={colors.warning} />
                <Text style={styles.warnText}>{detail.dispatch_status.reason}</Text>
              </View>
            ) : null}
            {detail.alerts.map((alert) => (
              <View key={alert.id} style={styles.alertRow}>
                <View style={styles.alertHeader}>
                  <Text style={styles.alertName}>{alert.contact_name}</Text>
                  <View
                    style={[
                      styles.alertStatus,
                      alert.status === 'SENT' ? styles.alertStatusOk : styles.alertStatusWarn,
                    ]}
                  >
                    <Text style={styles.alertStatusText}>{alert.status}</Text>
                  </View>
                </View>
                <Text style={styles.alertMeta}>
                  {alert.channel.toUpperCase()} · {formatDateTime(alert.attempted_at)}
                  {alert.sent_at ? ` · sent ${formatDateTime(alert.sent_at)}` : ''}
                </Text>
                {alert.contact_phone ? (
                  <Text style={styles.alertTarget}>{alert.contact_phone}</Text>
                ) : null}
                {alert.provider_error ? (
                  <Text style={styles.alertError}>{alert.provider_error}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  statusBar: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  statusBarActive: { backgroundColor: colors.errorLight },
  statusBarClosed: { backgroundColor: colors.surfaceSecondary },
  statusText: { fontSize: font.size.lg, color: colors.textSecondary, fontWeight: font.weight.medium },
  statusTextActive: { color: colors.error },
  statusMeta: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  tabActive: {},
  tabText: { fontSize: 9, color: colors.textTertiary },
  tabTextActive: { color: colors.primary, fontWeight: font.weight.medium },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.sm,
  },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  fieldLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  fieldValue: { flex: 1, textAlign: 'right', fontSize: font.size.xs, color: colors.textPrimary },
  emptyText: { fontSize: font.size.sm, color: colors.textSecondary },
  mapButton: {
    marginTop: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mapButtonText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  contactName: { fontSize: font.size.xs, color: colors.textPrimary, fontWeight: font.weight.medium },
  contactDetail: { flex: 1, textAlign: 'right', fontSize: font.size.xs, color: colors.textSecondary },
  verifiedPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 9, color: colors.success, fontWeight: font.weight.medium },
  pingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pingIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pingIndexText: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.medium },
  pingCopy: { flex: 1 },
  pingCoords: { fontSize: font.size.xs, color: colors.textPrimary },
  pingMeta: { fontSize: 9, color: colors.textSecondary, marginTop: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoCell: { width: '47%', gap: 2 },
  photo: { width: '100%', height: 150, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoMeta: { fontSize: 9, color: colors.textSecondary, marginTop: 2 },
  photoStatus: { fontSize: 9, color: colors.textTertiary },
  photoError: { fontSize: 9, color: colors.warning, lineHeight: 13 },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  audioIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioCopy: { flex: 1 },
  audioTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  audioMeta: { fontSize: 9, color: colors.textSecondary, marginTop: 1 },
  audioHint: { fontSize: font.size.xs, color: colors.textTertiary, lineHeight: 17 },
  warnBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  warnText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },
  alertRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  alertName: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  alertStatus: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  alertStatusOk: { backgroundColor: colors.successLight },
  alertStatusWarn: { backgroundColor: colors.warningLight },
  alertStatusText: { fontSize: 9, fontWeight: font.weight.medium },
  alertMeta: { fontSize: 9, color: colors.textSecondary, marginTop: 2 },
  alertTarget: { fontSize: 9, color: colors.textSecondary },
  alertError: { fontSize: 9, color: colors.warning, marginTop: 2, lineHeight: 13 },
});
