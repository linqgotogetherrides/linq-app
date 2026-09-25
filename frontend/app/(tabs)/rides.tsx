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
import NotificationButton from '@/src/components/NotificationButton';
import { useApp } from '@/src/context/AppContext';
import { rideService } from '@/src/services/rideService';
import { Ride, RideRequest } from '@/src/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

type RidesTab = 'posted' | 'accepted';

export default function Rides() {
  const router = useRouter();
  const { user, rideRequests, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<RidesTab>('posted');
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyRideId, setBusyRideId] = useState<string | null>(null);

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

  const handlePublishDraft = async (ride: Ride) => {
    if (!user?.id) return;
    setBusyRideId(ride.id);
    const result = await rideService.publishDraft(ride.id, user.id);
    setBusyRideId(null);
    if (result.ok) {
      showToast('Ride published. It is now visible to riders on your route.');
      await loadRides();
    } else {
      showToast('Could not publish this draft.');
    }
  };

  const handleDeleteDraft = async (ride: Ride) => {
    if (!user?.id) return;
    setBusyRideId(ride.id);
    const result = await rideService.deleteRide(ride.id, user.id);
    setBusyRideId(null);
    if (result.ok) {
      showToast('Draft deleted.');
      await loadRides();
    } else {
      showToast('Could not delete this draft.');
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="rides-screen">
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenTitle}>Rides</Text>
          <NotificationButton testID="rides-notifications-button" />
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
        <NotificationButton testID="rides-notifications-button" />
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
              busy={busyRideId === ride.id}
              onPress={() => {
                // Drafts are not live, so tapping one opens the editor instead.
                if (ride.status === 'draft') router.push('/create-ride');
                else router.push(`/ride/${ride.id}`);
              }}
              onPublish={ride.status === 'draft' ? () => void handlePublishDraft(ride) : undefined}
              onDelete={ride.status === 'draft' ? () => void handleDeleteDraft(ride) : undefined}
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
  busy,
  onPress,
  onPublish,
  onDelete,
}: {
  ride: Ride;
  acceptedRequest?: RideRequest;
  busy?: boolean;
  onPress: () => void;
  onPublish?: () => void;
  onDelete?: () => void;
}) {
  const isDraft = ride.status === 'draft';
  const confirmed = ride.status === 'confirmed' || Boolean(acceptedRequest);
  const schedule = [ride.time, ride.date].filter(Boolean).join(' • ');

  return (
    <Pressable
      testID={`my-ride-card-${ride.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDraft && styles.cardDraft,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.statusBadge,
            isDraft
              ? styles.statusBadgeDraft
              : confirmed
                ? styles.statusBadgeConfirmed
                : styles.statusBadgeActive,
          ]}
        >
          <Ionicons
            name={
              isDraft
                ? 'document-text-outline'
                : confirmed
                  ? 'checkmark-circle'
                  : 'radio-button-on'
            }
            size={13}
            color={isDraft ? colors.textSecondary : confirmed ? colors.success : colors.primary}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: isDraft
                  ? colors.textSecondary
                  : confirmed
                    ? colors.success
                    : colors.primary,
              },
            ]}
          >
            {isDraft ? 'Draft' : confirmed ? 'Confirmed' : 'Posted'}
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

      {isDraft ? (
        <>
          <View style={styles.draftNote} testID={`draft-note-${ride.id}`}>
            <Ionicons name="information-circle" size={14} color={colors.textSecondary} />
            <Text style={styles.draftNoteText}>
              This ride is saved as a draft. It is not visible to other riders until you
              publish it.
            </Text>
          </View>
          <View style={styles.draftActions}>
            <Pressable
              style={[styles.draftAction, styles.draftActionGhost]}
              onPress={onDelete}
              disabled={busy}
              testID={`delete-draft-${ride.id}`}
            >
              <Ionicons name="trash-outline" size={15} color={colors.error} />
              <Text style={[styles.draftActionText, { color: colors.error }]}>Delete</Text>
            </Pressable>
            <Pressable
              style={[styles.draftAction, styles.draftActionPrimary]}
              onPress={onPublish}
              disabled={busy}
              testID={`publish-draft-${ride.id}`}
            >
              <Ionicons name="paper-plane" size={15} color={colors.textInverse} />
              <Text style={[styles.draftActionText, { color: colors.textInverse }]}>
                {busy ? 'Publishing…' : 'Publish'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
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
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  cardDraft: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  statusBadgeDraft: { backgroundColor: colors.surfaceTertiary },
  draftNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  draftNoteText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 16 },
  draftActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  draftAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  draftActionPrimary: { backgroundColor: colors.primary },
  draftActionGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  draftActionText: { fontSize: font.size.sm, fontWeight: font.weight.medium },
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
