import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import EmptyState from '@/src/components/EmptyState';
import { useApp } from '@/src/context/AppContext';
import { useAdminAccess } from '@/src/context/SosAdminContext';
import { sosApi, SosApiError } from '@/src/services/sos/sosApi';
import type { SosAdminIncidentRow, SosStatus } from '@/src/services/sos/types';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type Filter = SosStatus | 'ALL';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'ALL', label: 'All' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function SosAdminDashboard() {
  const router = useRouter();
  const { user } = useApp();
  const { isOperator, checking } = useAdminAccess();

  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [rows, setRows] = useState<SosAdminIncidentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchConfigured, setDispatchConfigured] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !isOperator) return;
    try {
      setError(null);
      const [list, stats] = await Promise.all([
        sosApi.adminIncidents({ actorId: user.id, status: filter, limit: 100 }),
        sosApi.adminStats(user.id),
      ]);
      setRows(list.incidents);
      setTotal(list.total ?? list.incidents.length);
      setDispatchConfigured(stats.dispatch_status.configured);
    } catch (err) {
      setError(
        err instanceof SosApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load SOS incidents.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, isOperator, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (checking) {
    return (
      <SafeAreaView style={styles.container} testID="admin-sos-screen">
        <LinqHeader title="LinQ Safety" showBack={false} />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isOperator) {
    return (
      <SafeAreaView style={styles.container} testID="admin-sos-screen">
        <LinqHeader title="LinQ Safety" />
        <EmptyState
          icon="lock-closed-outline"
          title="Restricted area"
          subtitle="This dashboard is only available to LinQ safety operators. Your account does not have the required role."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="admin-sos-screen">
      <LinqHeader title="LinQ Safety" showBack={false} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.summaryRow}>
          <SummaryTile label="Total" value={total} tone="neutral" />
          <SummaryTile
            label="Active"
            value={rows.filter((row) => row.status === 'ACTIVE').length}
            tone="danger"
          />
          <SummaryTile
            label="Unacked"
            value={rows.filter((row) => row.status === 'ACTIVE' && !row.acknowledged_at).length}
            tone="warning"
          />
        </View>

        {dispatchConfigured === false ? (
          <View style={styles.dispatchBanner} testID="admin-dispatch-banner">
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text style={styles.dispatchText}>
              No emergency alert provider is configured. Contact alerts are being
              recorded but not delivered by SMS or email.
            </Text>
          </View>
        ) : null}

        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setLoading(true);
                  setFilter(item.key);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`admin-filter-${item.key.toLowerCase()}`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.errorBox} testID="admin-error">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="No incidents"
            subtitle="No SOS incidents match this filter."
          />
        ) : (
          rows.map((row) => <IncidentCard key={row.id} row={row} onPress={() => router.push(`/admin/sos/${row.id}`)} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IncidentCard({ row, onPress }: { row: SosAdminIncidentRow; onPress: () => void }) {
  const isActive = row.status === 'ACTIVE';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, isActive && styles.cardActive]}
      testID={`admin-incident-${row.id}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, isActive ? styles.statusActive : styles.statusClosed]}>
          <View style={[styles.statusDot, { backgroundColor: isActive ? colors.error : colors.textTertiary }]} />
          <Text style={[styles.statusPillText, { color: isActive ? colors.error : colors.textSecondary }]}>
            {row.status}
          </Text>
        </View>
        <Text style={styles.reference}>{row.reference_code}</Text>
        {isActive && !row.acknowledged_at ? (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>NEW</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.name}>{row.user_name}</Text>
      <Text style={styles.phone}>{row.user_phone ?? 'No phone on file'}</Text>

      {row.ride_pickup && row.ride_dropoff ? (
        <View style={styles.routeRow}>
          <Ionicons name="navigate" size={13} color={colors.textSecondary} />
          <Text style={styles.routeText} numberOfLines={1}>
            {row.ride_pickup} → {row.ride_dropoff}
          </Text>
        </View>
      ) : (
        <View style={styles.routeRow}>
          <Ionicons name="car-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.routeTextMuted}>No current ride</Text>
        </View>
      )}

      <View style={styles.cardStats}>
        <Stat icon="time-outline" label="Activated" value={formatTime(row.activated_at)} />
        <Stat
          icon="navigate-outline"
          label="Last fix"
          value={formatTime(row.last_location_at)}
        />
        <Stat icon="people-outline" label="Contacts" value={`${row.contacts_notified}/${row.contacts_total}`} />
        <Stat
          icon="camera-outline"
          label="Evidence"
          value={`${row.evidence_photo_count}P ${row.evidence_audio_count}A`}
        />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.pingCount}>{row.location_ping_count} location fixes</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'danger' | 'warning';
}) {
  return (
    <View
      style={[
        styles.summaryTile,
        tone === 'danger' && { backgroundColor: colors.errorLight },
        tone === 'warning' && { backgroundColor: colors.warningLight },
      ]}
    >
      <Text
        style={[
          styles.summaryValue,
          tone === 'danger' && { color: colors.error },
          tone === 'warning' && { color: colors.warning },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  center: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  summaryValue: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  summaryLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  dispatchBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dispatchText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },
  filters: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing.lg,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  filterText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  filterTextActive: { color: colors.textInverse },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: font.size.sm, color: colors.error },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardActive: { borderColor: colors.error, borderWidth: 1.5 },
  cardPressed: { opacity: 0.9 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    height: 24,
    borderRadius: radius.pill,
  },
  statusActive: { backgroundColor: colors.errorLight },
  statusClosed: { backgroundColor: colors.surfaceSecondary },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  reference: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, letterSpacing: 0.3 },
  newPill: {
    backgroundColor: colors.error,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  newPillText: { fontSize: 9, color: colors.textInverse, fontWeight: font.weight.bold },
  name: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.xs },
  phone: { fontSize: font.size.xs, color: colors.textSecondary },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xs },
  routeText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  routeTextMuted: { flex: 1, fontSize: font.size.xs, color: colors.textTertiary },
  cardStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  stat: { minWidth: 70 },
  statLabel: { fontSize: 9, color: colors.textTertiary, marginTop: 2 },
  statValue: { fontSize: font.size.xs, color: colors.textPrimary, fontWeight: font.weight.medium },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  pingCount: { fontSize: font.size.xs, color: colors.textTertiary },
});
