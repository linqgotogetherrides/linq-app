import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import EmptyState from '@/src/components/EmptyState';
import { useApp } from '@/src/context/AppContext';
import { rideService } from '@/src/services/rideService';
import { RideHistoryEntry, RideHistoryOutcome } from '@/src/types';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const OUTCOMES: Record<RideHistoryOutcome, { label: string; color: string; background: string }> = {
  completed: { label: 'Completed', color: colors.success, background: colors.successLight },
  cancelled: { label: 'Cancelled', color: colors.error, background: colors.errorLight },
  declined: { label: 'Request declined', color: colors.textSecondary, background: colors.surfaceSecondary },
};

export default function RideHistory() {
  const router = useRouter();
  const { user } = useApp();
  const [entries, setEntries] = useState<RideHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setEntries(await rideService.getRideHistory(user.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="ride-history-screen">
      <LinqHeader title="Ride History" />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No past rides"
          subtitle="Rides you post or join will appear here once they finish."
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {entries.map((entry) => {
            const outcome = OUTCOMES[entry.outcome];
            return (
              <Pressable
                key={entry.id}
                style={styles.card}
                onPress={() => router.push(`/ride/${entry.ride.id}`)}
                testID={`history-${entry.id}`}
              >
                <View style={styles.top}>
                  <Text style={styles.date}>{entry.ride.date ?? 'Date not set'}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: outcome.background }]}>
                    <Text style={[styles.statusText, { color: outcome.color }]}>{outcome.label}</Text>
                  </View>
                </View>
                <Text style={styles.route} numberOfLines={2}>
                  {entry.ride.pickup.label} → {entry.ride.destination.label}
                </Text>
                <View style={styles.bottom}>
                  <Text style={styles.role}>
                    {entry.role === 'driver' ? 'You drove' : `With ${entry.ride.creator.name}`}
                    {entry.ride.vehicle?.kind ? ` • ${entry.ride.vehicle.kind}` : ''}
                  </Text>
                  {entry.ride.pricePerSeat > 0 ? (
                    <Text style={styles.price}>₹{entry.ride.pricePerSeat.toFixed(0)}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: font.size.sm, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: spacing.md, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  route: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  role: { fontSize: font.size.sm, color: colors.textSecondary, textTransform: 'capitalize' },
  price: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
});
