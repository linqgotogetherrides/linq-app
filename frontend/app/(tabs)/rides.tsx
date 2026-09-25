import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import EmptyState from '@/src/components/EmptyState';
import GuestPrompt from '@/src/components/GuestPrompt';
import { useApp } from '@/src/context/AppContext';
import { rideService } from '@/src/services/rideService';
import { Ride, RideRequest } from '@/src/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

type RidesTab = 'posted' | 'accepted';

export default function Rides() {
  const router = useRouter();
  const { user, rideRequests } = useApp();
  const [activeTab, setActiveTab] = useState<RidesTab>('posted');
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRides = useCallback(async () => {
    if (!user?.id) {
      setRides([]);
      setLoading(false);
      return;
    }
    try {
      const data = await rideService.getMyRides(user.id);
      setRides(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadRides();
    }, [loadRides])
  );

  const acceptedByRide = useMemo(() => {
    const accepted = new Map<string, RideRequest>();
    rideRequests
      .filter((request) => request.status === 'accepted' && request.ride)
      .forEach((request) => accepted.set(request.ride.id, request));
    return accepted;
  }, [rideRequests]);

  const acceptedRides = useMemo(
    () => rides.filter((ride) => acceptedByRide.has(ride.id)),
    [acceptedByRide, rides]
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="rides-screen">
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenTitle}>Rides</Text>
        </View>
        <GuestPrompt
          icon="car-outline"
          title="Login to View Rides"
          subtitle="Manage the rides you post and accept from your notifications."
        />
      </SafeAreaView>
    );
  }

  const visibleRides = activeTab === 'posted' ? rides : acceptedRides;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="rides-screen">
      <View style={styles.headerTitleRow}>
        <Text style={styles.screenTitle}>Rides</Text>
      </View>

      <View style={styles.tabs}>
        {(['posted', 'accepted'] as const).map((tab) => {
          const active = activeTab === tab;
          const label = tab === 'posted' ? 'Posted' : 'Accepted';
          return (
            <Pressable
              key={tab}
              testID={`rides-tab-${tab}`}
              onPress={() => setActiveTab(tab)}
              style={styles.tab}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadRides();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingWrap} testID="rides-loading">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading your rides…</Text>
          </View>
        ) : visibleRides.length === 0 ? (
          activeTab === 'posted' ? (
            <EmptyState
              icon="car-outline"
              title="No rides posted yet"
              subtitle="Your posted rides will appear here."
            />
          ) : (
            <EmptyState
              icon="checkmark-circle-outline"
              title="No accepted rides yet"
              subtitle="Accepted rides will appear here."
            />
          )
        ) : (
          visibleRides.map((ride) => (
            <RideManagementCard
              key={ride.id}
              ride={ride}
              acceptedRequest={activeTab === 'accepted' ? acceptedByRide.get(ride.id) : undefined}
              onPress={() => router.push(`/ride/${ride.id}`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RideManagementCard({
  ride,
  acceptedRequest,
  onPress,
}: {
  ride: Ride;
  acceptedRequest?: RideRequest;
  onPress: () => void;
}) {
  const confirmed = ride.status === 'confirmed' || Boolean(acceptedRequest);
  const schedule = [ride.time, ride.date].filter(Boolean).join(' • ');

  return (
    <Pressable
      testID={`my-ride-card-${ride.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, confirmed ? styles.statusBadgeConfirmed : styles.statusBadgeActive]}>
          <Ionicons
            name={confirmed ? 'checkmark-circle' : 'radio-button-on'}
            size={13}
            color={confirmed ? colors.success : colors.primary}
          />
          <Text style={[styles.statusText, { color: confirmed ? colors.success : colors.primary }]}>
            {confirmed ? 'Confirmed' : 'Posted'}
          </Text>
        </View>
        <Text style={styles.typeText}>{ride.type.toUpperCase()}</Text>
      </View>

      <View style={styles.routeBox}>
        <View style={styles.routeRail}>
          <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, { backgroundColor: colors.error, borderRadius: 2 }]} />
        </View>
        <View style={styles.routeDetails}>
          <View style={styles.routeRow}>
            <Text style={styles.routeText} numberOfLines={1}>{ride.pickup.label}</Text>
            <Text style={styles.routeMeta}>{ride.time ?? 'Time flexible'}</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeText} numberOfLines={1}>{ride.destination.label}</Text>
            <Text style={styles.routeMeta}>{schedule || 'Scheduled'}</Text>
          </View>
        </View>
      </View>

      {acceptedRequest ? (
        <View style={styles.acceptedPassenger}>
          {acceptedRequest.requester.avatarUrl ? (
            <Image
              source={{ uri: acceptedRequest.requester.avatarUrl }}
              style={styles.passengerAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.passengerAvatarFallback}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
          )}
          <View style={styles.passengerCopy}>
            <Text style={styles.passengerLabel}>Accepted passenger</Text>
            <Text style={styles.passengerName} numberOfLines={1}>
              {acceptedRequest.requester.name}
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.footerMetric}>
          <Ionicons name="people-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.footerText}>
            {ride.seatsAvailable} {ride.seatsAvailable === 1 ? 'seat' : 'seats'} available
          </Text>
        </View>
        {ride.pricePerSeat > 0 ? (
          <Text style={styles.price}>₹{ride.pricePerSeat.toFixed(0)}/seat</Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitleRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    fontSize: font.size['2xl'],
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: spacing.md },
  tabText: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  tabTextActive: { color: colors.primary },
  tabUnderline: {
    width: '54%',
    height: 2,
    marginTop: spacing.sm,
    marginBottom: -1,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: { backgroundColor: colors.primary },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.md,
  },
  loadingText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardPressed: { opacity: 0.88 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    height: 28,
    borderRadius: radius.pill,
  },
  statusBadgeActive: { backgroundColor: colors.primaryLight },
  statusBadgeConfirmed: { backgroundColor: colors.successLight },
  statusText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  typeText: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  routeBox: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  routeRail: {
    alignItems: 'center',
    marginRight: spacing.md,
    paddingVertical: 5,
  },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  routeDetails: { flex: 1, gap: spacing.md },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  routeText: {
    flex: 1,
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  routeMeta: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
  },
  acceptedPassenger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  passengerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  passengerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerCopy: { flex: 1, marginLeft: spacing.md },
  passengerLabel: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
  },
  passengerName: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  footerMetric: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  price: {
    fontSize: font.size.sm,
    color: colors.primary,
    fontWeight: font.weight.medium,
  },
});
